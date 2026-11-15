/**
 * Day-1 smoke test: exercises every OpenRouter capability the app relies on.
 *   chat · structured JSON · vision · text-to-speech · transcription (round-trip of the TTS audio)
 * Run: npm run smoke
 */
import { loadEnvConfig } from "@next/env";
import { deflateSync } from "node:zlib";
import { z } from "zod";

loadEnvConfig(process.cwd());

/** Build a small solid-colour PNG in memory (no files, no external images). */
function solidPng(w: number, h: number, [r, g, b]: [number, number, number]): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3).map((_, i) => [r, g, b][i % 3])]);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

async function step(name: string, fn: () => Promise<string>) {
  const t = Date.now();
  try {
    const detail = await fn();
    console.log(`✓ ${name} (${Date.now() - t} ms) — ${detail}`);
    return true;
  } catch (e) {
    const err = e as Error & { body?: string };
    console.log(`✗ ${name} (${Date.now() - t} ms) — ${err.message}${err.body ? `\n    ${err.body.slice(0, 400)}` : ""}`);
    return false;
  }
}

async function main() {
  const ai = await import("../src/lib/ai/openrouter");
  const { MODELS } = await import("../src/lib/ai/models");
  console.log("Models:", MODELS, "\n");

  let mp3: ArrayBuffer | null = null;
  const results = [
    await step(`chat [${MODELS.chat}]`, async () =>
      (await ai.chat([{ role: "user", content: "In one short sentence, who is MS Dhoni?" }], { maxTokens: 80, fallback: false })).slice(0, 120),
    ),
    await step(`json [${MODELS.extract}]`, async () => {
      const out = await ai.json(
        [{ role: "user", content: 'User said: "I mostly follow Virat Kohli, I only watch casually." Extract their interests.' }],
        z.object({ players: z.array(z.string()), knowledge_level: z.enum(["new", "casual", "regular", "expert"]) }),
        { model: MODELS.extract, schemaName: "interests", fallback: false },
      );
      return JSON.stringify(out);
    }),
    await step(`vision [${MODELS.vision}]`, async () => {
      const png = solidPng(64, 64, [200, 20, 30]);
      const url = `data:image/png;base64,${png.toString("base64")}`;
      return (await ai.vision("Answer in one word.", "What colour is this image?", [url], { maxTokens: 400, fallback: false })).trim();
    }),
    await step(`tts [${MODELS.tts}]`, async () => {
      mp3 = await ai.speak("Dhoni walks out to bat with twelve needed off the final over.");
      return `${mp3.byteLength} bytes of mp3`;
    }),
    await step(`stt [${MODELS.stt}]`, async () => {
      if (!mp3) throw new Error("skipped — TTS failed, no audio to transcribe");
      const t = await ai.transcribe(mp3, "mp3", { timestamps: true });
      return `"${t.text}" (${t.segments.length} segments)`;
    }),
  ];

  const passed = results.filter(Boolean).length;
  console.log(`\n${passed}/${results.length} capabilities working`);
  process.exit(passed === results.length ? 0 : 1);
}

main();
