/**
 * Turns a reply that is still streaming in into pieces that can be spoken right away, so the friend starts
 * talking after the first sentence instead of after the whole answer.
 */

const ABBREVIATIONS = /\b(?:e\.g|i\.e|vs|etc|mr|mrs|ms|dr|st|approx|jr|sr)\.$/i;

/** Make text sound right when read aloud: no markdown, links, URLs or emoji. */
export function forSpeech(text: string): string {
  return text
    .replace(/\[(?:f|w)-[\w-]*\]?/g, "") // fact ids, even half-streamed ones
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // [label](url) -> label
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[*_`#>]+/g, "")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/\p{Extended_Pictographic}️?/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Index just after the first sentence end in `text` (".", "!", "?", or a line break), or -1. */
function sentenceEnd(text: string, from = 0): number {
  const re = /([.!?…]+["')\]]*)(\s+|$)|\n+/g;
  re.lastIndex = from;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const end = m.index + m[0].length;
    if (m[0].startsWith("\n")) return end;
    const before = text.slice(0, m.index + m[1].length);
    if (ABBREVIATIONS.test(before)) continue; // "e.g." is not the end of a sentence
    if (m[2] === "") return -1; // punctuation at the very end: more text may still be coming
    return end;
  }
  return -1;
}

/**
 * Take the next speakable piece from `buffer`.
 * - first: the first piece may break early at a comma or dash once it is long enough, to start talking sooner.
 * - final: the reply has finished streaming, so whatever is left can be spoken.
 * Later pieces gather whole sentences up to ~220 characters, which sounds more natural and costs fewer calls.
 */
export function takeSpeakable(buffer: string, opts: { first: boolean; final: boolean }): { piece: string | null; rest: string } {
  let end = sentenceEnd(buffer);
  // The first piece decides how soon the friend starts talking: if the first sentence is long (or not finished
  // yet), break at a comma or dash so speech can start sooner.
  if (opts.first && (end < 0 ? buffer.length > 70 : end > 110)) {
    const soft = buffer.slice(30, end < 0 ? undefined : end).search(/[,;:–—]\s/);
    if (soft >= 0) end = 30 + soft + 2;
  }
  if (end < 0) {
    if (opts.final && buffer.trim()) return { piece: forSpeech(buffer) || null, rest: "" };
    return { piece: null, rest: buffer };
  }
  if (!opts.first) {
    // Gather more whole sentences while the piece stays short.
    for (let next = sentenceEnd(buffer, end); next > 0 && next <= 220; next = sentenceEnd(buffer, end)) end = next;
  }
  const piece = forSpeech(buffer.slice(0, end));
  const rest = buffer.slice(end);
  if (!piece) return takeSpeakable(rest, opts);
  return { piece, rest };
}

/** Whisper sometimes "hears" these in silence or noise. Never send them as something the fan said. */
const PHANTOMS = /^(?:thank you\.?|thanks\.?|thanks for watching\.?|thank you for watching\.?|you\.?|bye\.?|\.+|okay\.?|\[.*\]|\(.*\))$/i;

export function isPhantom(text: string): boolean {
  const t = text.trim();
  return !t || PHANTOMS.test(t);
}
