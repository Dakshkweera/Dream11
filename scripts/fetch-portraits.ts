/**
 * Finds a reusable photo for each player from Wikimedia Commons and writes data/portraits.json.
 *
 *   npm run fetch-portraits
 *
 * For each player: the lead image of their English Wikipedia article (free-licence images only), checked to be
 * about the right person (the article's description must mention their sport), then the file's licence, author
 * and credit read from Wikimedia Commons. Only files hosted on Commons under CC BY, CC BY-SA, CC0, public domain
 * or GODL-India (India's government open licence: reuse allowed with attribution) are kept. Lookups are batched
 * (one Wikipedia call and one Commons call per 50 players) and retried politely if Wikimedia rate-limits.
 * Players without a suitable photo keep their initials in the app.
 */
import { loadEnvConfig } from "@next/env";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

loadEnvConfig(process.cwd());

// Wikimedia asks clients to identify themselves; no personal details.
const UA = "BuzzerSportsPrototype/0.1 (portrait lookup for a non-commercial demo)";
const ALLOWED = [/^CC BY(-SA)?( \d(\.\d)?)?$/i, /^CC0( 1\.0)?$/i, /^Public domain$/i, /^PD/i, /^GODL-India$/i];
const allowed = (license: string) => ALLOWED.some((re) => re.test(license));

/** Article titles where the player's name alone is ambiguous on English Wikipedia. */
const TITLE_OVERRIDES: Record<string, string> = {
  "Anthony Edwards": "Anthony Edwards (basketball)",
  "Derrick White": "Derrick White (basketball)",
  "Shashank Singh": "Shashank Singh (cricketer)",
  "Rasikh Salam": "Rasikh Salam Dar",
};

type Target = { playerId: string; name: string; sport: string };
type WikiPage = { missing?: string; pageimage?: string; description?: string; title: string };
type CommonsPage = {
  title: string;
  missing?: string;
  imageinfo?: { url: string; thumburl?: string; descriptionurl: string; extmetadata?: Record<string, { value: string }> }[];
};

async function getJson(url: string): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(url, { headers: { "User-Agent": UA } });
    if (r.status === 429 && attempt < 5) {
      const wait = (Number(r.headers.get("retry-after")) || 5 * 2 ** attempt) * 1000;
      console.log(`  (rate-limited by Wikimedia, waiting ${Math.round(wait / 1000)} s)`);
      await new Promise((ok) => setTimeout(ok, wait));
      continue;
    }
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    return r.json();
  }
}
const stripHtml = (s: string) => s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
const titleOf = (t: Target) => TITLE_OVERRIDES[t.name] ?? t.name;

/** Look up many players at once: their Wikipedia lead image + description, then each file's Commons licence. */
async function portraitsFor(targets: Target[]) {
  const pages = new Map<string, WikiPage>();
  for (let i = 0; i < targets.length; i += 50) {
    const batch = targets.slice(i, i + 50);
    const wp = (await getJson(
      `https://en.wikipedia.org/w/api.php?action=query&format=json&redirects=1&prop=pageimages|description&piprop=name&pilicense=free&titles=${encodeURIComponent(batch.map(titleOf).join("|"))}`,
    )) as { query?: { pages?: Record<string, WikiPage>; redirects?: { from: string; to: string }[]; normalized?: { from: string; to: string }[] } };
    const byTitle = new Map(Object.values(wp.query?.pages ?? {}).map((p) => [p.title, p]));
    const follow = new Map<string, string>();
    for (const n of wp.query?.normalized ?? []) follow.set(n.from, n.to);
    for (const r of wp.query?.redirects ?? []) follow.set(r.from, r.to);
    for (const t of batch) {
      let title = titleOf(t);
      for (let hops = 0; follow.has(title) && hops < 3; hops++) title = follow.get(title)!;
      const p = byTitle.get(title);
      if (p) pages.set(t.playerId, p);
    }
  }

  const files = [...new Set([...pages.values()].map((p) => p.pageimage).filter((x): x is string => !!x))].map((f) => `File:${f}`);
  const commons = new Map<string, CommonsPage>();
  for (let i = 0; i < files.length; i += 50) {
    const batch = files.slice(i, i + 50);
    const cm = (await getJson(
      `https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=320&titles=${encodeURIComponent(batch.join("|"))}`,
    )) as { query?: { pages?: Record<string, CommonsPage>; normalized?: { from: string; to: string }[] } };
    const original = new Map((cm.query?.normalized ?? []).map((n) => [n.to, n.from]));
    for (const p of Object.values(cm.query?.pages ?? {})) {
      commons.set(p.title, p);
      const from = original.get(p.title);
      if (from) commons.set(from, p);
    }
  }

  return targets.map((t) => {
    const page = pages.get(t.playerId);
    if (!page || page.missing !== undefined) return { t, skip: `no Wikipedia article "${titleOf(t)}"` };
    const sportWord = t.sport === "cricket" ? "cricket" : "basketball";
    if (!(page.description ?? "").toLowerCase().includes(sportWord))
      return { t, skip: `article "${page.title}" is "${page.description ?? "?"}", not clearly the ${t.sport} player` };
    if (!page.pageimage) return { t, skip: `no free lead image on "${page.title}"` };
    const file = `File:${page.pageimage}`;
    const cp = commons.get(file) ?? commons.get(file.replace(/_/g, " "));
    const info = cp?.imageinfo?.[0];
    if (!info || cp?.missing !== undefined) return { t, skip: `${file} is not on Wikimedia Commons` };
    const meta = info.extmetadata ?? {};
    const license = stripHtml(meta.LicenseShortName?.value ?? "");
    if (!allowed(license)) return { t, skip: `${file} licence "${license}" is not on the allowed list` };
    if (meta.NonFree?.value === "true") return { t, skip: `${file} is marked non-free` };
    const author = stripHtml(meta.Artist?.value ?? "") || "Unknown author";
    return {
      t,
      portrait: {
        playerId: t.playerId,
        imageUrl: info.url,
        thumbUrl: info.thumburl ?? info.url,
        author,
        license,
        licenseUrl: meta.LicenseUrl?.value ?? null,
        sourcePage: info.descriptionurl,
        attribution: `Photo: ${author}, ${license}, via Wikimedia Commons`,
        checkedAt: new Date().toISOString().slice(0, 10),
      },
    };
  });
}

async function main() {
  const { Portrait } = await import("../src/lib/stats/schema");
  const { allEntities } = await import("../src/lib/facts/retrieve");

  // Everyone in Buzzer's dataset, plus everyone in a box score or scorecard with a real full name.
  const targets = new Map<string, Target>();
  for (const e of allEntities()) if (e.type === "player") targets.set(e.id, { playerId: e.id, name: e.name, sport: e.sport });
  const statsDir = join(process.cwd(), "data", "stats");
  for (const f of readdirSync(statsDir).filter((x) => x.endsWith(".json"))) {
    const ms = JSON.parse(readFileSync(join(statsDir, f), "utf8")) as { sport: string; players: { playerId: string; name: string }[] };
    for (const p of ms.players) {
      // Cricsheet-only names are initials ("PD Salt"), too ambiguous to look up safely.
      if (p.playerId.startsWith("cricsheet:")) continue;
      if (!targets.has(p.playerId)) targets.set(p.playerId, { playerId: p.playerId, name: p.name, sport: ms.sport });
    }
  }

  const out: unknown[] = [];
  const skipped: string[] = [];
  for (const r of await portraitsFor([...targets.values()])) {
    if ("portrait" in r && r.portrait) {
      out.push(Portrait.parse(r.portrait));
      console.log(`✓ ${r.t.name.padEnd(22)} ${r.portrait.license.padEnd(14)} ${r.portrait.author.slice(0, 40)}`);
    } else {
      skipped.push(`${r.t.name}: ${r.skip}`);
    }
  }
  writeFileSync(join(process.cwd(), "data", "portraits.json"), JSON.stringify(out, null, 2) + "\n");
  console.log(`\n${out.length} portraits written to data/portraits.json; ${skipped.length} players keep initials:`);
  for (const s of skipped) console.log(`  - ${s}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
