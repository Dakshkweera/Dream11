import { z } from "zod";

/** What the user is looking at — sent by every client request to the friend. */
export const PageContext = z.object({
  surface: z.enum(["home", "match", "player", "memory", "chat"]),
  label: z.string().max(200).optional(), // e.g. "RCB vs CSK match page"
  entityIds: z.array(z.string()).max(40).default([]),
  match: z
    .object({
      id: z.string(),
      videoTime: z.number().optional(),
      ball: z.string().max(300).optional(), // "18.3 · RCB 164/5 · Kohli vs Jadeja · FOUR"
      transcript: z.string().max(4000).optional(), // rolling commentary window
    })
    .optional(),
});
export type PageContext = z.infer<typeof PageContext>;

export function contextToPrompt(c: PageContext | undefined): string {
  if (!c) return "";
  const parts = [`Fan is on: ${c.label ?? c.surface}`];
  if (c.match?.ball) parts.push(`Match state: ${c.match.ball}`);
  if (c.match?.transcript) parts.push(`Recent commentary (transcribed, may contain errors):\n"${c.match.transcript}"`);
  return parts.join("\n");
}
