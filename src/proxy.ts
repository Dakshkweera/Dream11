import { NextResponse, type NextRequest } from "next/server";

export const USER_COOKIE = "sf_uid";

/** Gives every visitor an anonymous id cookie — no login in the prototype. */
export function proxy(request: NextRequest) {
  if (request.cookies.get(USER_COOKIE)) return NextResponse.next();

  const id = `u_${crypto.randomUUID()}`;
  // Make the id visible to this same request's handlers.
  request.cookies.set(USER_COOKIE, id);
  const res = NextResponse.next({ request });
  res.cookies.set(USER_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|mp4|webm|mp3)$).*)"],
};
