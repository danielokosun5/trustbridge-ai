import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { isOwnerSessionActive, registerOwnerSession, revokeOwnerSessionId } from "./owner-session-store";

export const OWNER_SESSION_COOKIE = "trustbridge_owner_session";
const SESSION_LIFETIME_SECONDS = 60 * 60 * 8;

type SessionPayload = { auth: string; exp: number; sid: string; v: 1 };

function credentials() {
  const username = process.env.TRUSTBRIDGE_OWNER_USERNAME?.trim();
  const password = process.env.TRUSTBRIDGE_OWNER_PASSWORD;
  const secret = process.env.TRUSTBRIDGE_SESSION_SECRET;
  if (!username || username.length > 120 || !password || password.length < 12 || password.length > 256 || !secret || Buffer.byteLength(secret) < 32) return null;
  return { username, password, secret };
}

export function ownerAuthConfigured() {
  return credentials() !== null;
}

function safeEqual(left: string, right: string) {
  const a = createHmac("sha256", "trustbridge-compare").update(left).digest();
  const b = createHmac("sha256", "trustbridge-compare").update(right).digest();
  return timingSafeEqual(a, b);
}

export function validateOwnerCredentials(username: string, password: string) {
  const configured = credentials();
  if (!configured) return false;
  const usernameMatches = safeEqual(username.trim(), configured.username);
  const passwordMatches = safeEqual(password, configured.password);
  return usernameMatches && passwordMatches;
}

function sign(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function credentialBinding(username: string, password: string, secret: string) {
  return createHmac("sha256", secret).update(`${username}\0${password}`).digest("base64url");
}

export async function createOwnerSession(now = Date.now()) {
  const configured = credentials();
  if (!configured) return null;
  const expiresAtSeconds = Math.floor(now / 1000) + SESSION_LIFETIME_SECONDS;
  const sessionId = randomBytes(32).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ auth: credentialBinding(configured.username, configured.password, configured.secret), exp: expiresAtSeconds, sid: sessionId, v: 1 } satisfies SessionPayload)).toString("base64url");
  await registerOwnerSession(sessionId, new Date(expiresAtSeconds * 1000).toISOString(), new Date(now).toISOString());
  return `${payload}.${sign(payload, configured.secret)}`;
}

function decodeOwnerSession(token: string | null | undefined, now: number) {
  const configured = credentials();
  if (!configured || !token || token.length > 1024) return false;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return false;
  if (!safeEqual(signature, sign(payload, configured.secret))) return false;
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<SessionPayload>;
    if (decoded.v !== 1 || typeof decoded.sid !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(decoded.sid) || typeof decoded.auth !== "string") return false;
    if (!safeEqual(decoded.auth, credentialBinding(configured.username, configured.password, configured.secret))) return false;
    if (!Number.isInteger(decoded.exp) || Number(decoded.exp) <= Math.floor(now / 1000)) return false;
    return decoded as SessionPayload;
  } catch {
    return false;
  }
}

export async function verifyOwnerSession(token: string | null | undefined, now = Date.now()) {
  const decoded = decodeOwnerSession(token, now);
  if (!decoded) return false;
  try {
    return await isOwnerSessionActive(decoded.sid, new Date(now).toISOString());
  } catch {
    return false;
  }
}

export async function revokeOwnerSession(token: string | null | undefined) {
  const decoded = decodeOwnerSession(token, Date.now());
  if (!decoded) return;
  await revokeOwnerSessionId(decoded.sid);
}

export function getCookieValue(cookieHeader: string | null, name: string) {
  const prefix = `${name}=`;
  const item = cookieHeader?.split(";").map((value) => value.trim()).find((value) => value.startsWith(prefix));
  return item?.slice(prefix.length) ?? null;
}
