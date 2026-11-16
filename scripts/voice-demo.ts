/**
 * Records what a spoken conversation with Buzzer sounds like, using the app's own pieces: a real voice-mode reply
 * from the chat model, the quick reaction that plays first, and the configured voice. One WAV per question.
 *   npx tsx scripts/voice-demo.ts
 * (Needs a PCM voice such as the default Gemini Puck, so the clips can be joined into one file.)
 */
import { loadEnvConfig } from "@next/env";
import fs from "node:fs";

loadEnvConfig(process.cwd());

const QUESTIONS = [
  { file: "final-1-dhoni", reaction: "Ooh, good one!", q: "Why does everyone love Dhoni so much?" },
  { file: "final-2-rcb-hinglish", reaction: "Arre haan!", q: "Yaar, 2025 final mein kya hua tha? RCB jeeti thi na?" },
  { file: "final-3-olympics", reaction: "Hmm, achha…", q: "What happened in the Paris Olympic basketball final?" },
];

const SILENCE = new Uint8Array(24_000 * 2 * 0.35); // 0.35 s at 24 kHz, 16-bit

async function main() {
  const { MODELS, TTS_VOICE, pcmOnly } = await import("../src/lib/ai/models");
  if (!pcmOnly()) throw new Error(`This script joins PCM clips; set MODEL_TTS to a PCM voice (now ${MODELS.tts}).`);
  const { speakAudio, pcmToWav } = await import("../src/lib/ai/openrouter");
  const { getStore } = await import("../src/lib/store");
  const { prepareChat, streamReply, withSystemNote } = await import("../src/lib/friend/service");
  const { forSpeech } = await import("../src/lib/voice/speakable");

  const pcm = async (text: string) => {
    const { body } = await speakAudio(forSpeech(text));
    return (body as Uint8Array).slice(44); // drop the WAV header, keep the samples
  };

  const store = getStore();
  const user = await store.ensureUser(`demo_${Math.random().toString(36).slice(2, 8)}`);
  fs.mkdirSync("voice-samples", { recursive: true });

  for (const { file, reaction, q } of QUESTIONS) {
    const { messages } = await prepareChat(user, q, undefined, new Date());
    let reply = "";
    for await (const d of streamReply(withSystemNote(messages, "voice"), { voice: true })) reply += d;
    const parts = [await pcm(reaction), SILENCE, await pcm(reply)];
    const joined = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0));
    let o = 0;
    for (const p of parts) {
      joined.set(p, o);
      o += p.byteLength;
    }
    fs.writeFileSync(`voice-samples/${file}.wav`, pcmToWav(joined));
    console.log(`${file}.wav (${TTS_VOICE})\n  Fan: ${q}\n  Buzzer: ${reaction} … ${reply}\n`);
  }
  await store.resetUser(user.id);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
