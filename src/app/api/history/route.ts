import { route } from "@/lib/api";
import { getStore } from "@/lib/store";

export const GET = route(null, async ({ user }) => {
  const messages = await getStore().recentMessages(user.id, 30);
  return {
    messages: messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      story: m.story,
      sources: (m.context as { web?: { title: string; url: string }[] } | null)?.web ?? [],
    })),
  };
});
