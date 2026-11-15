import { z } from "zod";
import { route } from "@/lib/api";
import { speak } from "@/lib/ai/openrouter";

export const maxDuration = 45;

const Body = z.object({ text: z.string().min(1).max(1200) });

export const POST = route(Body, async ({ body }) => {
  const audio = await speak(body.text.replace(/\s+/g, " "));
  return new Response(audio, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=3600" } });
}, { max: 25 });
