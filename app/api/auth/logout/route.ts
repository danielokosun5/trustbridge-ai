import { NextResponse } from "next/server";
import { OWNER_SESSION_COOKIE, getCookieValue, revokeOwnerSession } from "@/lib/auth/owner-session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return new Response("Invalid request origin.", { status: 403 });
  try { await revokeOwnerSession(getCookieValue(request.headers.get("cookie"), OWNER_SESSION_COOKIE)); }
  catch { return new Response("Sign-out could not be confirmed. Try again when the workspace database is available.", { status: 503 }); }
  const response = NextResponse.redirect(new URL("/login", request.url), 303);
  response.cookies.set(OWNER_SESSION_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 0 });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
