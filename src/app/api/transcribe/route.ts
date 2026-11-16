import { route } from "@/lib/api";
import { MODELS } from "@/lib/ai/models";
import { hedge, transcribe } from "@/lib/ai/openrouter";
import { allEntities } from "@/lib/facts/retrieve";
import { getMatch, squadNames } from "@/lib/match/data";
import { correctNames } from "@/lib/match/names";

export const maxDuration = 60;

let names: string | null = null;
/**
 * Players and teams the friend knows, as a spelling hint. Without it, "MS Dhoni" came back as "Ms. Downey"
 * and the friend went off to search the web for an actress.
 */
function knownNames(): string {
  // Players first (their names are the ones misheard most), then teams.
  const known = allEntities().filter((e) => !e.concept);
  names ??= [...known.filter((e) => e.type === "player"), ...known.filter((e) => e.type === "team")].map((e) => e.name).join(", ");
  return names;
}

/**
 * Receives short audio (multipart: audio, optional matchId, optional purpose) and returns text.
 * purpose=conversation is the fan talking to the friend: a faster model, and a hint with the friend's name.
 * Otherwise it is a chunk of match commentary, biased towards the squad's names.
 */
export const POST = route(
  null,
  async ({ req }) => {
    const form = await req.formData();
    const audio = form.get("audio");
    const matchId = String(form.get("matchId") ?? "");
    const conversation = form.get("purpose") === "conversation";
    if (!(audio instanceof Blob) || audio.size === 0) return Response.json({ error: "No audio" }, { status: 400 });
    if (audio.size > 3_500_000) return Response.json({ error: "Chunk too large" }, { status: 413 });

    const match = conversation ? undefined : getMatch(matchId);
    const prompt = conversation
      ? `A sports fan talking to Buzzer, their AI sports friend. Names they may say: ${knownNames()}.`
      : match
        ? `${match.sport} commentary. Players: ${squadNames(match).join(", ")}.`
        : undefined;
    // Conversation sends WAV; Chrome's recorder sends webm, Safari's mp4.
    const format = /wav/.test(audio.type) ? "wav" : /mp4|aac/.test(audio.type) ? "mp4" : /ogg/.test(audio.type) ? "ogg" : "webm";
    const bytes = await audio.arrayBuffer();
    // In conversation the fan is waiting: if the first model hasn't answered in 0.6 s, race Whisper against it.
    const started = Date.now();
    const t = conversation
      ? await hedge(async (signal, attempt) => {
          const model = attempt === 0 ? MODELS.sttConversation : MODELS.stt;
          const out = await transcribe(bytes, format, { prompt, model, signal });
          console.log(`[transcribe] conversation · ${model} won · ${Date.now() - started}ms · "${out.text.slice(0, 80)}"`);
          return out;
        }, 600)
      : await transcribe(bytes, format, { prompt });
    return { text: match ? correctNames(t.text, squadNames(match)) : t.text };
  },
  { max: 120 }, // shared by the watch-along and spoken conversation
);
