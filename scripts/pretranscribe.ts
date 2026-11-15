/**
 * Transcribes the match commentary ONCE and saves it as public/match/transcript.json.
 * The watch-along falls back to this file if live transcription fails during a demo.
 *
 *   npm run pretranscribe -- path/to/commentary.mp3
 *
 * Use an audio file (mp3/wav/m4a/ogg/webm/flac), ideally < 25 MB and a few minutes long.
 * Timestamps in the output match the video's timeline, so the audio must start where the video starts.
 */
import { loadEnvConfig } from "@next/env";
import { readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";

loadEnvConfig(process.cwd());

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: npm run pretranscribe -- <audio-file>");
    process.exit(1);
  }
  const format = extname(file).slice(1).toLowerCase();
  if (!["mp3", "wav", "m4a", "ogg", "webm", "flac", "aac"].includes(format)) {
    console.error(`Unsupported format ".${format}". Extract the audio first, e.g. yt-dlp -x --audio-format mp3 <url>`);
    process.exit(1);
  }
  const mb = statSync(file).size / 1e6;
  console.log(`Transcribing ${file} (${mb.toFixed(1)} MB)…`);

  const { transcribe } = await import("../src/lib/ai/openrouter");
  const { allMatches, squadNames } = await import("../src/lib/match/data");
  const match = allMatches().find((m) => m.video);
  const prompt = match ? `Cricket commentary. Players: ${squadNames(match).join(", ")}.` : undefined;

  const result = await transcribe(readFileSync(file), format, { timestamps: true, prompt });
  const segments = result.segments.length ? result.segments : [{ start: 0, end: 3600, text: result.text }];

  const out = join(process.cwd(), "public", "match");
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "transcript.json"), JSON.stringify(segments, null, 1));
  console.log(`✓ ${segments.length} segments saved to public/match/transcript.json`);
  console.log(`  First line: "${segments[0].text.slice(0, 100)}"`);
}

main().catch((e: Error & { body?: string }) => {
  console.error("✗", e.message, e.body ?? "");
  process.exit(1);
});
