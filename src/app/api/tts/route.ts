import { z } from "zod";
import { route } from "@/lib/api";
import { pcmOnly, voiceFor } from "@/lib/ai/models";
import { hedge, speakAudio } from "@/lib/ai/openrouter";

export const maxDuration = 45;

const Body = z.object({ text: z.string().min(1).max(1200) });

/**
 * Speech for a piece of a reply. MP3 voices are passed through as they arrive; PCM-only voices (Gemini) come
 * back whole as WAV. For MP3 voices, if the voice is slower than usual, a second request races the first.
 */
export const POST = route(
  Body,
  async ({ body }) => {
    const text = body.text.replace(/s+/g, " ");
    const voice = voiceFor(text); // Hindi script needs a Hindi voice (for the voices that can't read it)
    const audio = pcmOnly()
      ? await speakAudio(text, { voice }) // slow by nature: a backup race would only double the in-flight requests
      : await hedge((signal) => speakAudio(text, { signal, voice }), 1200);
    return new Response(audio.body, { headers: { "Content-Type": audio.type, "Cache-Control": "private, max-age=3600" } });
  },
  { max: 150 }, // a spoken conversation reads each reply in a few pieces
);
