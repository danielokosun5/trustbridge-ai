import { createHash } from "node:crypto";
import { createHmac } from "node:crypto";
import type { Client } from "@libsql/client";
import { createDatabaseClient } from "@/lib/agreements/database";

const initialization = new WeakMap<Client, Promise<void>>();

function getClient() {
  return createDatabaseClient();
}

async function ensure(client: Client) {
  let ready = initialization.get(client);
  if (!ready) {
    ready = (async () => {
      await client.execute(`CREATE TABLE IF NOT EXISTS owner_sessions (
        session_hash TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        revoked_at TEXT
      )`);
      await client.execute("CREATE INDEX IF NOT EXISTS owner_sessions_expiry_idx ON owner_sessions(expires_at)");
      await client.execute(`CREATE TABLE IF NOT EXISTS request_rate_limits (
        client_hash TEXT PRIMARY KEY,
        window_started_at TEXT NOT NULL,
        attempts INTEGER NOT NULL,
        updated_at TEXT NOT NULL
      )`);
      await client.execute("CREATE INDEX IF NOT EXISTS request_rate_limits_updated_idx ON request_rate_limits(updated_at)");
    })().catch((error: unknown) => {
      initialization.delete(client);
      throw error;
    });
    initialization.set(client, ready);
  }
  await ready;
}

function hashSessionId(sessionId: string) {
  return createHash("sha256").update(sessionId).digest("hex");
}

export async function registerOwnerSession(sessionId: string, expiresAt: string, createdAt = new Date().toISOString()) {
  const client = getClient();
  await ensure(client);
  await client.execute({
    sql: "INSERT INTO owner_sessions (session_hash, created_at, expires_at) VALUES (?, ?, ?)",
    args: [hashSessionId(sessionId), createdAt, expiresAt],
  });
  await client.execute({
    sql: "DELETE FROM owner_sessions WHERE expires_at <= ? OR revoked_at < ?",
    args: [createdAt, new Date(Date.parse(createdAt) - 30 * 24 * 60 * 60 * 1000).toISOString()],
  });
}

export async function isOwnerSessionActive(sessionId: string, now = new Date().toISOString()) {
  const client = getClient();
  await ensure(client);
  const result = await client.execute({
    sql: "SELECT expires_at, revoked_at FROM owner_sessions WHERE session_hash = ? LIMIT 1",
    args: [hashSessionId(sessionId)],
  });
  const row = result.rows[0];
  return Boolean(row && row.revoked_at == null && String(row.expires_at) > now);
}

export async function revokeOwnerSessionId(sessionId: string, now = new Date().toISOString()) {
  const client = getClient();
  await ensure(client);
  await client.execute({
    sql: "UPDATE owner_sessions SET revoked_at = ? WHERE session_hash = ? AND revoked_at IS NULL",
    args: [now, hashSessionId(sessionId)],
  });
}

function hashClientAddress(scope: string, address: string, secret: string) {
  return createHmac("sha256", secret).update(`${scope}\0${address}`).digest("hex");
}

export async function consumeScopedRateLimit(scope: string, address: string, secret: string, now = new Date(), maxAttempts = 5, windowMs = 15 * 60_000) {
  const client = getClient();
  await ensure(client);
  const timestamp = now.toISOString();
  const cutoff = new Date(now.getTime() - windowMs).toISOString();
  const key = hashClientAddress(scope, address, secret);
  await client.execute({ sql: "DELETE FROM request_rate_limits WHERE updated_at < ?", args: [new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()] });
  await client.execute({
    sql: `INSERT INTO request_rate_limits (client_hash, window_started_at, attempts, updated_at) VALUES (?, ?, 1, ?)
      ON CONFLICT(client_hash) DO UPDATE SET
        attempts = CASE WHEN request_rate_limits.window_started_at <= ? THEN 1 ELSE request_rate_limits.attempts + 1 END,
        window_started_at = CASE WHEN request_rate_limits.window_started_at <= ? THEN ? ELSE request_rate_limits.window_started_at END,
        updated_at = ?`,
    args: [key, timestamp, timestamp, cutoff, cutoff, timestamp, timestamp],
  });
  const result = await client.execute({ sql: "SELECT attempts FROM request_rate_limits WHERE client_hash = ? LIMIT 1", args: [key] });
  return Number(result.rows[0]?.attempts ?? maxAttempts + 1) <= maxAttempts;
}

export async function clearScopedRateLimit(scope: string, address: string, secret: string) {
  const client = getClient();
  await ensure(client);
  await client.execute({ sql: "DELETE FROM request_rate_limits WHERE client_hash = ?", args: [hashClientAddress(scope, address, secret)] });
}
