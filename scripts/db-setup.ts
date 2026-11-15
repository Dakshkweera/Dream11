/** Applies db/schema.sql to DATABASE_URL.  Run: npm run db:setup */
import { loadEnvConfig } from "@next/env";
import { readFileSync } from "node:fs";
import { join } from "node:path";

loadEnvConfig(process.cwd());

async function main() {
  const { runRaw } = await import("../src/lib/db");
  const schema = readFileSync(join(process.cwd(), "db", "schema.sql"), "utf8");
  await runRaw(schema);
  console.log("✓ schema applied");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
