import { NextResponse } from "next/server";
import { createOwnerSession, OWNER_SESSION_COOKIE, ownerAuthConfigured, validateOwnerCredentials } from "@/lib/auth/owner-session";
import { clearScopedRateLimit, consumeScopedRateLimit } from "@/lib/auth/owner-session-store";
import { requestAddress } from "@/lib/http/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return new Response("Invalid request origin.", { status: 403 });
  if (!ownerAuthConfigured()) return new Response("Owner authentication is not configured.", { status: 503 });
  const address = requestAddress(request);
  try {
    if (!await consumeScopedRateLimit("owner-login", address, process.env.TRUSTBRIDGE_SESSION_SECRET!)) {
      return NextResponse.redirect(new URL("/login?error=limited", request.url), 303);
    }
  } catch {
    return new Response("Owner sign-in is temporarily unavailable.", { status: 503 });
  }

  let rawBody: string;
  try { rawBody = await request.text(); } catch { return new Response("Invalid sign-in request.", { status: 400 }); }
  if (Buffer.byteLength(rawBody) > 1024) return new Response("Sign-in request is too large.", { status: 413 });
  const form = new URLSearchParams(rawBody);
  const username = form.get("username") ?? "";
  const password = form.get("password") ?? "";
  if (username.length > 120 || password.length > 256 || !validateOwnerCredentials(username, password)) {
    return NextResponse.redirect(new URL("/login?error=invalid", request.url), 303);
  }
  try { await clearScopedRateLimit("owner-login", address, process.env.TRUSTBRIDGE_SESSION_SECRET!); }
  catch { return new Response("Owner sign-in is temporarily unavailable.", { status: 503 }); }

  let session: string | null;
  try { session = await createOwnerSession(); }
  catch { return new Response("Owner sign-in is temporarily unavailable.", { status: 503 }); }
  if (!session) return new Response("Owner authentication is not configured.", { status: 503 });
  const response = NextResponse.redirect(new URL("/dashboard", request.url), 303);
  response.cookies.set(OWNER_SESSION_COOKIE, session, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 8 * 60 * 60,
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
