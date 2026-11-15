/** Counts the words of EXPLANATION.md the way a reader would (ignores the draft comment and **bold** marks). */
import { readFileSync } from "node:fs";

const raw = readFileSync("EXPLANATION.md", "utf8").replace(/<!--[\s\S]*?-->/g, "").replace(/\*\*/g, "");
const words = raw.trim().split(/\s+/).filter(Boolean).length;
const placeholder = raw.includes("[FINDING]");
console.log(`${words} words${placeholder ? " (+ your [FINDING], about 25)" : ""} — limit 200`);
process.exit(words + (placeholder ? 25 : 0) <= 200 ? 0 : 1);
