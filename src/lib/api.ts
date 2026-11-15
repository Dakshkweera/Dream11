import "server-only";
import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import { z } from "zod";
import { rateLimit } from "./rate-limit";
import { currentUser, userNow } from "./user";
import type { User } from "./store";

type Handler<T> = (args: { user: User; now: Date; body: T; req: Request }) => Promise<Response | unknown>;

type Options = { /** requests per window per user (default 120 per 5 minutes) */ max?: number; windowMs?: number };

/** Wraps a route handler: resolves the user, rate-limits, validates JSON with zod, converts errors to JSON. */
export function route<T extends z.ZodType>(schema: T | null, handler: Handler<z.infer<T>>, opts: Options = {}) {
  return async (req: Request): Promise<Response> => {
    try {
      await connection(); // per-user data: never prerender
      const user = await currentUser();
      const now = userNow(user);
      const limit = rateLimit(`${user.id}:${new URL(req.url).pathname}`, opts.max ?? 120, opts.windowMs ?? 300_000);
      if (!limit.ok) {
        return Response.json(
          { error: `You're going a bit fast — try again in ${limit.retryAfterSec}s.` },
          { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } },
        );
      }
      let body: z.infer<T> = undefined as z.infer<T>;
      if (schema) {
        const parsed = schema.safeParse(await req.json().catch(() => null));
        if (!parsed.success) return Response.json({ error: "Invalid request", detail: parsed.error.message }, { status: 400 });
        body = parsed.data;
      }
      const out = await handler({ user, now, body, req });
      return out instanceof Response ? out : Response.json(out ?? { ok: true });
    } catch (e) {
      unstable_rethrow(e); // let Next.js's own control-flow errors (e.g. prerender aborts) pass through
      const err = e as Error & { status?: number; body?: string };
      console.error("[api]", err.message, err.body ?? "");
      const status = err.status === 402 || err.status === 429 ? 503 : 500;
      return Response.json(
        { error: status === 503 ? "The AI is busy or out of credit. Try again shortly." : "Something went wrong." },
        { status },
      );
    }
  };
}
