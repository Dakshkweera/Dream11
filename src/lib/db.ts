/**
 * Neon Postgres access over HTTP (works in Vercel functions and local dev).
 * Usage:  const rows = await sql`SELECT * FROM users WHERE id = ${id}`;
 *
 * Local-dev escape hatch: if your network's DNS refuses to resolve Neon (it blocks some hosts),
 * set DNS_SERVERS=8.8.8.8 in .env.local and the app resolves Neon's host through that server instead.
 * Not used on Vercel.
 */
import { neon, neonConfig, type NeonQueryFunction } from "@neondatabase/serverless";

let ready: Promise<NeonQueryFunction<false, false>> | null = null;

async function useCustomDns(servers: string[]) {
  const { Resolver } = await import("node:dns/promises");
  const { Agent, fetch: undiciFetch } = await import("undici");
  const resolver = new Resolver();
  resolver.setServers(servers);

  type Cb = (err: Error | null, address: string | { address: string; family: number }[], family?: number) => void;
  const agent = new Agent({
    connect: {
      lookup: (hostname: string, opts: { all?: boolean }, cb: Cb) => {
        resolver
          .resolve4(hostname)
          .then((addrs) => (opts?.all ? cb(null, addrs.map((address) => ({ address, family: 4 }))) : cb(null, addrs[0], 4)))
          .catch((e: Error) => cb(e, ""));
      },
    },
  });
  neonConfig.fetchFunction = ((input: unknown, init?: Record<string, unknown>) =>
    undiciFetch(input as string, { ...init, dispatcher: agent } as never)) as unknown as typeof fetch;
}

function getClient(): Promise<NeonQueryFunction<false, false>> {
  ready ??= (async () => {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set — create a Neon database and add it to .env.local");
    const dns = process.env.DNS_SERVERS?.split(",").map((s) => s.trim()).filter(Boolean);
    if (dns?.length) await useCustomDns(dns);
    return neon(url);
  })();
  ready.catch(() => (ready = null)); // allow a retry after a failed start
  return ready;
}

export async function sql(strings: TemplateStringsArray, ...values: unknown[]) {
  const db = await getClient();
  return (await db(strings, ...values)) as Record<string, unknown>[];
}

/** Run a raw multi-statement SQL string (used only by the setup script). */
export async function runRaw(statements: string): Promise<void> {
  const db = await getClient();
  for (const stmt of statements.split(/;\s*$/m).map((s) => s.trim()).filter(Boolean)) {
    await db.query(stmt);
  }
}
