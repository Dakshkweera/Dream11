import { z } from "zod";
import { route } from "@/lib/api";
import { PageContext } from "@/lib/friend/context";
import { explainMoment } from "@/lib/friend/service";
import { recordSignal } from "@/lib/memory/service";
import { getStore } from "@/lib/store";

export const maxDuration = 60;

const Body = z.object({
  question: z.string().min(1).max(500),
  frames: z.array(z.string().startsWith("data:image/jpeg;base64,").max(400_000)).min(1).max(4),
  context: PageContext,
});

export const POST = route(Body, async ({ user, now, body }) => {
  const { answer, entities } = await explainMoment(user, body.question, body.frames, body.context, now);
  const store = getStore();
  await store.addMessage({ user_id: user.id, role: "user", content: body.question, story: null, context: { moment: true } });
  await store.addMessage({ user_id: user.id, role: "assistant", content: answer, story: null, context: { moment: true } });
  const changes = [];
  for (const id of entities.slice(0, 2)) changes.push(...(await recordSignal(user, "asked_moment", id, now)));
  return { answer, memory: changes.map((c) => ({ type: c.type, content: c.memory.content, source: c.memory.source, kind: c.memory.kind })) };
}, { max: 12 });
