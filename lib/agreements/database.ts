import { createClient, type Client } from "@libsql/client";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

type DatabaseState = typeof globalThis & {
  __trustBridgeDb?: Client;
};

export function createDatabaseClient(): Client {
  const state = globalThis as DatabaseState;
  if (state.__trustBridgeDb) return state.__trustBridgeDb;

  const remoteUrl = process.env.TURSO_DATABASE_URL?.trim();
  if (remoteUrl && !remoteUrl.startsWith("file:") && !process.env.TURSO_AUTH_TOKEN?.trim()) {
    throw new Error("TURSO_AUTH_TOKEN is required when TURSO_DATABASE_URL points to a remote database.");
  }

  if (remoteUrl && !remoteUrl.startsWith("file:")) {
    state.__trustBridgeDb = createClient({ url: remoteUrl, authToken: process.env.TURSO_AUTH_TOKEN });
    return state.__trustBridgeDb;
  }

  const dataDirectory = resolve(process.cwd(), "data");
  mkdirSync(dataDirectory, { recursive: true });
  const databaseUrl = pathToFileURL(resolve(dataDirectory, "trustbridge.db")).href;
  state.__trustBridgeDb = createClient({ url: databaseUrl });
  return state.__trustBridgeDb;
}
