/**
 * Speech-to-text often mangles player names ("Jadeya", "Hazelwood"). Before the friend uses the
 * transcript, snap near-miss capitalised words to the squad's real names.
 * Conservative on purpose: only capitalised words, same first letter, a small edit distance, and
 * never a word that is already a real name or a plain cricket word.
 */

function distance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
}

/** Capitalised words that are plain commentary, so we never "correct" them into a name. */
const COMMON = new Set(
  ("good length full short wide over overs ball balls runs four sixes six single double bowled caught stumped " +
    "wicket wickets cover point square slip gully mid fine third long short leg side off stump stumps pitch " +
    "great nice well what that this they there here with from have going back then when just only really " +
    "india indian chennai mumbai kolkata bengaluru bangalore super kings royal challengers knight riders indians " +
    "target needs required chase innings batter batsman bowler captain umpire review replay boundary dropped " +
    "catch yorker finisher powerplay crowd stadium match game final cricket today tonight after before again " +
    "basketball dunk three foul rebound assist steal block court quarter timeout basket shot score points team free throw paris olympic olympics gold silver bronze medal arena").split(" "),
);

export function correctNames(text: string, squad: string[]): string {
  const known = [...new Set(squad.flatMap((n) => n.split(/\s+/)).filter((t) => t.length >= 4))];
  const knownLower = new Set(known.map((k) => k.toLowerCase()));
  if (!known.length) return text;

  return text.replace(/\b[A-Z][a-z]{3,}\b/g, (word) => {
    const w = word.toLowerCase();
    if (knownLower.has(w) || COMMON.has(w)) return word;
    const allowed = w.length >= 7 ? 2 : 1;
    let best: { name: string; d: number } | null = null;
    for (const k of known) {
      const kl = k.toLowerCase();
      if (kl[0] !== w[0] || Math.abs(kl.length - w.length) > allowed) continue;
      const d = distance(w, kl);
      if (d <= allowed && (!best || d < best.d)) best = { name: k, d };
    }
    return best ? best.name : word;
  });
}
