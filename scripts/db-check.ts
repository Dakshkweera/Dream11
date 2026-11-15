/**
 * Runs the store contract against the REAL Postgres (Neon) database in DATABASE_URL.
 * Uses throwaway users and cleans up after itself.   npm run db:check
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const { runContract } = await import("../src/lib/store/contract");
  const { pgStore } = await import("../src/lib/store/pg-store");
  const t0 = Date.now();
  const results = await runContract(pgStore, "dbcheck");
  for (const r of results) console.log(`${r.error ? "✗" : "✓"} ${r.name}${r.error ? `\n    ${r.error}` : ""}`);
  const failed = results.filter((r) => r.error).length;
  console.log(`\n${results.length - failed}/${results.length} passed on Postgres (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
