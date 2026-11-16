/** Speaks one line with the app's configured voice and saves it to voice-samples/check.mp3. npx tsx scripts/tts-check.ts */
import { loadEnvConfig } from "@next/env";
import fs from "node:fs";

loadEnvConfig(process.cwd());

async function main() {
  const { speakStream } = await import("../src/lib/ai/openrouter");
  const { MODELS, TTS_VOICE } = await import("../src/lib/ai/models");
  const t = Date.now();
  const stream = await speakStream("Arre yaar, Dhoni in a tight chase? You already know how that ends!");
  const bytes = Buffer.from(await new Response(stream).arrayBuffer());
  fs.mkdirSync("voice-samples", { recursive: true });
  fs.writeFileSync("voice-samples/check.mp3", bytes);
  console.log(`${MODELS.tts} · ${TTS_VOICE} · ${bytes.length} bytes in ${Date.now() - t}ms -> voice-samples/check.mp3`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
