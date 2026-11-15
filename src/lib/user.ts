import "server-only";
import { cookies } from "next/headers";
import { getStore, type User } from "./store";

const USER_COOKIE = "sf_uid";

/** Current anonymous user (cookie set by src/proxy.ts); creates the row on first use. */
export async function currentUser(): Promise<User> {
  const jar = await cookies();
  const id = jar.get(USER_COOKIE)?.value;
  if (!id) throw new Error("Missing user cookie — is src/proxy.ts running?");
  return getStore().ensureUser(id);
}

/** The user's "now", shifted by the demo "come back later" control. */
export function userNow(user: User): Date {
  return new Date(Date.now() + user.clock_offset_days * 86_400_000);
}
