import { z } from "zod";
import { route } from "@/lib/api";
import { chatWithWeb, type WebSource } from "@/lib/ai/openrouter";
import { PageContext } from "@/lib/friend/context";
import { stripFactIds } from "@/lib/friend/sanitize";
import { prepareChat, streamReply, withSystemNote } from "@/lib/friend/service";
import { collapseChanges } from "@/lib/memory/rules";
import { extractFromExchange, recordSignal, updateLevel } from "@/lib/memory/service";
import { rateLimit } from "@/lib/rate-limit";
import { getStore } from "@/lib/store";

export const maxDuration = 60;

const Body = z.object({ message: z.string().min(1).max(1500), context: PageContext.optional() });

/** Web lookups cost about a cent each: at most 10 per user per 10 minutes, and WEB_SEARCH=0 turns them off. */
const WEB_PER_WINDOW = 10;
const WEB_WINDOW_MS = 600_000;

/**
 * Streams the reply as plain text. A leading \u0001 means "looking that up" (a web lookup is running).
 * After the reply, memory extraction runs and its result follows a NUL byte as JSON:
 * "<reply>\0{"memory":[...],"sources":[...]}".
 */
export const POST = route(
  Body,
  async ({ user, now, body }) => {
    const t0 = Date.now();
    const store = getStore();
    const { messages, mentioned, outside } = await prepareChat(user, body.message, body.context, now);
    const prepMs = Date.now() - t0;
    const userSaved = store.addMessage({ user_id: user.id, role: "user", content: body.message, story: null, context: body.context ?? null });

    // Outside the IPL fact sheet: look it up (if allowed), otherwise say honestly that we couldn't.
    const lookupAllowed = outside && process.env.WEB_SEARCH !== "0" && rateLimit(`${user.id}:web`, WEB_PER_WINDOW, WEB_WINDOW_MS).ok;

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let reply = "";
        let firstMs = 0;
        let sources: WebSource[] = [];
        try {
          let answered = false;
          if (lookupAllowed) {
            controller.enqueue(encoder.encode("\u0001"));
            try {
              // A lookup that comes back with no sources didn't really search: try once more, and if it still
              // has none, fall back to saying so honestly rather than presenting a guess as a lookup.
              let web = await chatWithWeb(withSystemNote(messages, "web"));
              if (!web.sources.length) web = await chatWithWeb(withSystemNote(messages, "web"));
              if (web.sources.length) {
                reply = web.text;
                sources = web.sources;
                firstMs = Date.now() - t0;
                controller.enqueue(encoder.encode(stripFactIds(reply)));
                answered = true;
              } else {
                console.warn("[chat] web lookup returned no sources twice");
              }
            } catch (e) {
              console.warn("[chat] web lookup failed:", (e as Error).message);
            }
          }
          if (!answered) {
            const prompt = outside ? withSystemNote(messages, "no-web") : messages;
            for await (const delta of streamReply(prompt)) {
              firstMs ||= Date.now() - t0;
              reply += delta;
              controller.enqueue(encoder.encode(delta));
            }
          }

          await userSaved; // keep the conversation order
          const replySaved = store.addMessage({
            user_id: user.id,
            role: "assistant",
            content: reply,
            story: null,
            context: { ...(body.context ?? {}), web: sources },
          });
          // Behaviour signals first (cheap, no LLM), then LLM extraction.
          const changes = [];
          for (const id of mentioned.slice(0, 2)) changes.push(...(await recordSignal(user, "follow_up", id, now)));
          changes.push(...(await extractFromExchange(user, body.message, reply, now)));
          changes.push(...(await updateLevel(user, now)));
          await replySaved;
          const memory = collapseChanges(changes).map((c) => ({ type: c.type, content: c.memory.content, source: c.memory.source, kind: c.memory.kind }));
          controller.enqueue(encoder.encode(`\u0000${JSON.stringify({ memory, sources })}`));
          const chars = messages.reduce((n, m) => n + String(m.content).length, 0);
          console.log(`[chat] ${answered ? "web" : "facts"} · prepare ${prepMs}ms · first word ${firstMs}ms · finished ${Date.now() - t0}ms · prompt ${chars} chars`);
        } catch (e) {
          console.error("[chat]", (e as Error).message);
          controller.enqueue(encoder.encode(reply ? "" : "Sorry — I lost my train of thought. Try again?"));
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  },
  { max: 30 },
);
