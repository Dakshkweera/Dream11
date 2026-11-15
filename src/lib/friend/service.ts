/**
 * The friend's orchestration: chat, nudges, live match comments and
 * "why did this happen?" — each combines memory + facts + page context.
 */
import { z } from "zod";
import { chatStream, json, vision, type ChatMessage } from "../ai/openrouter";
import { MODELS } from "../ai/models";
import { angleFor, selectDiscovery } from "../discovery/select";
import { sportOfEntities, sportOfEntity } from "../facts/concepts";
import { bundleToPrompt, entitiesMentioned, getEntity, neighbours, retrieveBundle, type FactBundle } from "../facts/retrieve";
import { getMatch } from "../match/data";
import { levelFor, loadProfile, profileToPrompt, type Profile } from "../memory/service";
import { getStore, type StoredMessage, type Surface, type User } from "../store";
import { checkGrounding } from "../story/grounding";
import { contextToPrompt, type PageContext } from "./context";
import { shouldComment } from "./live-gate";
import { stripFactIds } from "./sanitize";
import { CHAT_PERSONA, FRIEND_NAME, NO_WEB_NOTE, PERSONA, WEB_ADDENDUM, levelGuide } from "./persona";
import { shouldSearchWeb } from "./routing";

const name = (id: string) => getEntity(id)?.name ?? id;

/** The sport a conversation or screen is about: the match being watched, else the entities involved, else cricket. */
function sportOf(ctx: PageContext | undefined, entityIds: string[]): string {
  const match = ctx?.match ? getMatch(ctx.match.id) : undefined;
  return match?.sport ?? sportOfEntities([...entityIds, ...(ctx?.entityIds ?? [])]);
}

/** Merge fact bundles for several focus entities (deduplicated, capped). */
function gatherFacts(focusIds: string[], limit = 28): { prompt: string; bundles: FactBundle[] } {
  // The first topic (what the fan just asked about) gets the most facts; the rest get a few each,
  // so prompts stay small — long prompts make the model slower to start answering.
  const bundles = [...new Set(focusIds)]
    .slice(0, 4)
    .map((id, i) => retrieveBundle(id, { limit: i === 0 ? 14 : 6 }))
    .filter((b): b is FactBundle => !!b);
  const seen = new Set<string>();
  for (const b of bundles) {
    b.facts = b.facts.filter((f) => (seen.has(f.id) || seen.size >= limit ? false : (seen.add(f.id), true)));
  }
  return { prompt: bundles.map(bundleToPrompt).join("\n\n") || "FACTS: none available for this topic.", bundles };
}

function historyToMessages(history: StoredMessage[]): ChatMessage[] {
  return history.slice(-10).map((m) => {
    const story = m.story as { title?: string; body?: string } | null;
    const content = story?.body ? `[Story: ${story.title}] ${story.body}` : m.content;
    return { role: m.role, content };
  });
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

export async function prepareChat(user: User, message: string, ctx: PageContext | undefined, now: Date) {
  const store = getStore();
  const [profile, history] = await Promise.all([loadProfile(user, now), store.recentMessages(user.id, 12)]);

  const mentioned = entitiesMentioned(message).map((e) => e.id);
  // Facts the friend used in its last couple of replies must stay available, or it will doubt its own
  // earlier (correct) statements when the topic moves on.
  const earlier = history
    .filter((m) => m.role === "assistant")
    .slice(-2)
    .flatMap((m) => entitiesMentioned((m.story as { body?: string } | null)?.body ?? m.content).map((e) => e.id));
  const lastStory = [...history].reverse().find((m) => m.story)?.story as { entityId?: string } | undefined;
  const focus = [
    ...mentioned,
    ...earlier,
    ...(ctx?.match?.transcript ? entitiesMentioned(ctx.match.transcript).map((e) => e.id) : []),
    ...(ctx?.entityIds ?? []).slice(0, 2),
    ...(lastStory?.entityId ? [lastStory.entityId] : []),
    ...profile.interests.slice(0, 1).map((i) => i.entityId),
  ];
  const facts = gatherFacts(focus);
  const sport = sportOf(ctx, [...mentioned, ...earlier]);

  const system = [
    CHAT_PERSONA,
    `EXPLAIN AT THIS LEVEL (${sport}): ${levelGuide(levelFor(profile, sport), sport)}`,
    `WHAT YOU KNOW ABOUT THIS FAN:\n${profileToPrompt(profile, now)}`,
    contextToPrompt(ctx),
    facts.prompt,
  ]
    .filter(Boolean)
    .join("\n\n");

  const messages: ChatMessage[] = [{ role: "system", content: system }, ...historyToMessages(history), { role: "user", content: message }];
  // A real question the IPL fact sheet can't cover (another sport, another match, latest news) needs a lookup.
  const outside = shouldSearchWeb({ message, knownEntityMentioned: mentioned.length > 0, onMatchPage: ctx?.surface === "match" });
  return { messages, mentioned, profile, outside };
}

export function streamReply(messages: ChatMessage[]) {
  return chatStream(messages, { model: MODELS.chat, maxTokens: 1500 });
}

// ---------------------------------------------------------------------------
// Proactive nudges
// ---------------------------------------------------------------------------

export type Nudge = { entityId: string; entityName: string; hook: string; angle: string };

const Hook = z.object({
  hook: z.string().describe("One curiosity-sparking line, max 22 words, addressed to the fan"),
  cited_fact_ids: z.array(z.string()),
});

const nudgeCache = new Map<string, { at: number; value: Promise<Nudge | null> }>();

/**
 * One unsolicited nudge per surface per session; never repeats; respects rejections.
 * Repeat/concurrent calls within a session return the same nudge, so a card doesn't
 * vanish or flip when the page re-renders. Dismissing or opening it ends it (see events/story routes).
 */
export function proposeNudge(
  user: User,
  surface: Surface,
  ctx: PageContext | undefined,
  sessionId: string,
  now: Date,
  opts: { focusEntity?: string } = {},
): Promise<Nudge | null> {
  const key = `${user.id}|${sessionId}|${surface}|${opts.focusEntity ?? ""}`;
  const hit = nudgeCache.get(key);
  if (hit && Date.now() - hit.at < 30 * 60_000) return hit.value;
  const value = computeNudge(user, surface, ctx, sessionId, now, opts);
  nudgeCache.set(key, { at: Date.now(), value });
  value.catch(() => nudgeCache.delete(key));
  if (nudgeCache.size > 500) nudgeCache.delete(nudgeCache.keys().next().value!);
  return value;
}

async function computeNudge(
  user: User,
  surface: Surface,
  ctx: PageContext | undefined,
  sessionId: string,
  now: Date,
  opts: { focusEntity?: string },
): Promise<Nudge | null> {
  const store = getStore();
  const [profile, recent] = await Promise.all([loadProfile(user, now), store.listDiscoveries(user.id, 40)]);

  if (!opts.focusEntity && recent.some((d) => d.session_id === sessionId && d.surface === surface)) return null;

  let entityId: string;
  let angle: string;
  if (opts.focusEntity) {
    // Player sheet: the subject is fixed; the angle is personalised.
    entityId = opts.focusEntity;
    const link = neighbours(entityId).find((n) => profile.interests.some((i) => i.entityId === n.entity.id));
    angle = link
      ? `Connect ${name(entityId)} to ${link.entity.name}, whom the fan already cares about (${link.relation.type}).`
      : `Why ${name(entityId)} is worth caring about, for someone at the fan's level`;
  } else {
    const RECENT_MS = 3 * 86_400_000;
    const isRecent = (d: { created_at: string }) => now.getTime() - new Date(d.created_at).getTime() < RECENT_MS;
    // On a basketball screen, don't pitch a cricket story (and vice versa); on Home, anything goes.
    const screenIds = ctx?.entityIds ?? [];
    const screenSport = screenIds.length ? sportOfEntities(screenIds) : null;
    const pick = selectDiscovery({
      allow: screenSport ? (id) => sportOfEntity(id) === screenSport : undefined,
      interests: profile.interests,
      negatives: profile.negatives,
      onScreen: ctx?.entityIds ?? [],
      recentlyDiscussed: recent.filter(isRecent).map((d) => d.entity_id),
      olderDiscussed: recent.filter((d) => !isRecent(d)).map((d) => d.entity_id),
      neighbours: (id) => neighbours(id).map((n) => ({ entityId: n.entity.id, relation: n.relation.type, type: n.entity.type })),
    });
    if (!pick) return null;
    entityId = pick.entityId;
    angle = angleFor(pick, name);
  }

  const hook = await writeHook(profile, entityId, angle, ctx, now);
  await store.addDiscovery({
    user_id: user.id,
    entity_id: entityId,
    angle,
    surface,
    session_id: sessionId,
    outcome: "shown",
    created_at: now.toISOString(),
  });
  return { entityId, entityName: name(entityId), hook, angle };
}

async function writeHook(profile: Profile, entityId: string, angle: string, ctx: PageContext | undefined, now: Date) {
  const bundle = retrieveBundle(entityId, { limit: 12 });
  const fallback = `Want to hear something about ${name(entityId)} I think you'd like?`;
  if (!bundle) return fallback;
  try {
    const out = await json(
      [
        {
          role: "system",
          content: `${PERSONA}\n\nWrite ONE irresistible teaser line (max 22 words), the way a friend leans in and says "you won't believe what happened…". Tease, never spoil the ending. Do not start with "Did you know". Use only the FACTS; cite any you rely on. No numbers unless they are in a cited fact.`,
        },
        {
          role: "user",
          content: `FAN:\n${profileToPrompt(profile, now, sportOfEntity(entityId))}\n\n${contextToPrompt(ctx)}\n\nANGLE: ${angle}\n\n${bundleToPrompt(bundle)}`,
        },
      ],
      Hook,
      { model: MODELS.extract, schemaName: "hook", maxTokens: 800, temperature: 0.9 },
    );
    const ok = out.cited_fact_ids.length === 0 ? !/\d/.test(out.hook) : checkGrounding(out.hook, out.cited_fact_ids, bundle.facts).ok;
    return ok ? stripFactIds(out.hook) : fallback;
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Live match: proactive comment from the commentary
// ---------------------------------------------------------------------------

const LiveOut = z.object({
  speak: z.boolean().describe("true only if there is something genuinely worth interrupting the match for"),
  comment: z.string().describe("1–2 sentences. Empty if speak is false."),
  cited_fact_ids: z.array(z.string()),
});

/** Last commentary seen per user+session, so an unchanged transcript never triggers another AI call. */
const lastSeen = new Map<string, string>();

export async function liveComment(user: User, ctx: PageContext, sessionId: string, now: Date) {
  const transcript = ctx.match?.transcript ?? "";
  const mentioned = entitiesMentioned(transcript).map((e) => e.id);
  if (!mentioned.length && !transcript.trim()) return null;

  const store = getStore();
  const [profile, recent] = await Promise.all([loadProfile(user, now), store.listDiscoveries(user.id, 10)]);
  // Rate limit: at most one live interjection per 45 seconds.
  const lastLive = recent.find((d) => d.surface === "live");
  if (lastLive && now.getTime() - new Date(lastLive.created_at).getTime() < 45_000) return null;

  const interestIds = new Set(profile.interests.map((i) => i.entityId));

  // Cheap code check first: only ask the AI when the commentary could matter to this fan.
  const sport = sportOf(ctx, mentioned);
  const gate = shouldComment({ transcript, interests: interestIds, learned: profile.learnedEntities, mentioned, sport });
  if (!gate.speak) return null;
  const seenKey = `${user.id}|${sessionId}`;
  const tail = transcript.slice(-200);
  if (lastSeen.get(seenKey) === tail) return null;
  lastSeen.set(seenKey, tail);
  if (lastSeen.size > 500) lastSeen.delete(lastSeen.keys().next().value!);

  const relevant = mentioned.sort((a, b) => Number(interestIds.has(b)) - Number(interestIds.has(a)));
  const facts = gatherFacts(relevant.length ? relevant : (ctx.entityIds ?? []).slice(0, 2), 18);

  const out = await json(
    [
      {
        role: "system",
        content: `${PERSONA}

You are watching the match WITH the fan. You just heard the commentary below. Decide whether to say something.
Speak only if: (a) a player/rivalry the fan cares about is involved, (b) the commentators used a term this fan probably doesn't know (explain it in plain words), or (c) the moment has history in the FACTS that makes it more exciting.
Otherwise speak=false. Max 2 sentences. Facts only from FACTS (cite them). ${levelGuide(levelFor(profile, sport), sport)}`,
      },
      {
        role: "user",
        content: `FAN:\n${profileToPrompt(profile, now, sport)}\n\nWHY THIS CHUNK PASSED A QUICK FILTER: ${gate.reason}\n\n${contextToPrompt(ctx)}\n\n${facts.prompt}`,
      },
    ],
    LiveOut,
    { model: MODELS.chat, schemaName: "live_comment", maxTokens: 1000 },
  );
  if (!out.speak || !out.comment.trim()) return null;
  const allFacts = facts.bundles.flatMap((b) => b.facts);
  if (/\d/.test(out.comment) && !checkGrounding(out.comment, out.cited_fact_ids, allFacts).ok) return null;

  const entityId = relevant[0] ?? ctx.entityIds?.[0] ?? "comp:ipl";
  await store.addDiscovery({
    user_id: user.id,
    entity_id: entityId,
    angle: "live",
    surface: "live",
    session_id: sessionId,
    outcome: "shown",
    created_at: now.toISOString(),
  });
  await store.addMessage({ user_id: user.id, role: "assistant", content: out.comment, story: null, context: { live: true } });
  return { comment: stripFactIds(out.comment), entityId };
}

// ---------------------------------------------------------------------------
// "Why did this happen?" — frames + commentary + match state
// ---------------------------------------------------------------------------

export async function explainMoment(user: User, question: string, frames: string[], ctx: PageContext, now: Date) {
  const profile = await loadProfile(user, now);
  const mentioned = entitiesMentioned(`${ctx.match?.transcript ?? ""} ${ctx.match?.ball ?? ""} ${question}`).map((e) => e.id);
  const facts = gatherFacts(mentioned.length ? mentioned : (ctx.entityIds ?? []).slice(0, 2), 18);
  const sport = sportOf(ctx, mentioned);

  const system = `${PERSONA}

The fan paused the match and asked about the moment they just watched. You are given ${frames.length} frames from the last few seconds (oldest first), the commentary from that window, and the match state if there is any (a ball-by-ball line for cricket; for other sports rely on the on-screen scoreboard).
1. Work out what happened from the frames + commentary (the on-screen scoreboard graphic helps). If unclear, say what you can see and what you're unsure about.
2. Explain WHY it happened / why it matters, at the fan's level.
3. If it connects to something the fan cares about or to history in the FACTS, add that in one sentence.
Max 5 sentences. Facts beyond what's visible or said must come from FACTS. ${levelGuide(levelFor(profile, sport), sport)}`;

  const prompt = `FAN ASKED: "${question}"\n\nFAN:\n${profileToPrompt(profile, now, sport)}\n\n${contextToPrompt(ctx)}\n\n${facts.prompt}`;
  const answer = await vision(system, prompt, frames, { maxTokens: 2000 });
  return { answer: stripFactIds(answer).trim(), entities: mentioned };
}

export const GREETING = (level: string) =>
  `Nice to meet you! I'm ${FRIEND_NAME} — think of me as your sports friend. I'll keep it ${level === "expert" ? "nerdy" : "simple"} and bring you the stories worth knowing.`;

/** Append a note to the chat's system prompt (used for web mode and for "could not look it up"). */
export function withSystemNote(messages: ChatMessage[], note: "web" | "no-web"): ChatMessage[] {
  const [first, ...rest] = messages;
  return [{ ...first, content: `${first.content}

${note === "web" ? WEB_ADDENDUM : NO_WEB_NOTE}` }, ...rest];
}
