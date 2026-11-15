import { route } from "@/lib/api";
import { transcribe } from "@/lib/ai/openrouter";
import { getMatch, squadNames } from "@/lib/match/data";
import { correctNames } from "@/lib/match/names";

export const maxDuration = 60;

/** Receives ~10s audio chunks (multipart: audio, matchId) and returns commentary text. */
export const POST = route(null, async ({ req }) => {
  const form = await req.formData();
  const audio = form.get("audio");
  const matchId = String(form.get("matchId") ?? "");
  if (!(audio instanceof Blob) || audio.size === 0) return Response.json({ error: "No audio" }, { status: 400 });
  if (audio.size > 3_500_000) return Response.json({ error: "Chunk too large" }, { status: 413 });

  const match = getMatch(matchId);
  // Biasing the model with the squad list improves player-name spelling.
  const prompt = match ? `${match.sport} commentary. Players: ${squadNames(match).join(", ")}.` : undefined;
  const t = await transcribe(await audio.arrayBuffer(), "webm", { prompt });
  return { text: match ? correctNames(t.text, squadNames(match)) : t.text };
}, { max: 60 });
