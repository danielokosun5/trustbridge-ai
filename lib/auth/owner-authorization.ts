import { NextResponse } from "next/server";
import { OWNER_SESSION_COOKIE, getCookieValue, ownerAuthConfigured, verifyOwnerSession } from "./owner-session";

export async function isOwnerRequest(request: Request) {
  return verifyOwnerSession(getCookieValue(request.headers.get("cookie"), OWNER_SESSION_COOKIE));
}

export async function ownerApiError(request: Request) {
  if (!ownerAuthConfigured()) {
    return NextResponse.json({ error: "Owner access is not configured on this server." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  if (!await isOwnerRequest(request)) {
    return NextResponse.json({ error: "Owner authentication is required." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  return null;
}

export function sameOriginMutation(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}
