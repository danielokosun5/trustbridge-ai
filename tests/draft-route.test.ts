import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { NextRequest } from "next/server";
import { createClient, type Client } from "@libsql/client";
import { POST } from "@/app/api/agreements/draft/route";
import { createOwnerSession, OWNER_SESSION_COOKIE } from "@/lib/auth/owner-session";

test("AI draft endpoint explains when the server API key is not configured", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousUsername = process.env.TRUSTBRIDGE_OWNER_USERNAME;
  const previousPassword = process.env.TRUSTBRIDGE_OWNER_PASSWORD;
  const previousSecret = process.env.TRUSTBRIDGE_SESSION_SECRET;
  process.env.OPENAI_API_KEY = "";
  process.env.TRUSTBRIDGE_OWNER_USERNAME = "test-owner";
  process.env.TRUSTBRIDGE_OWNER_PASSWORD = "test-password-123";
  process.env.TRUSTBRIDGE_SESSION_SECRET = "test-session-secret-that-is-at-least-32-bytes";
  const dataDirectory = join(process.cwd(), "data");
  mkdirSync(dataDirectory, { recursive: true });
  const directory = mkdtempSync(join(dataDirectory, ".draft-route-test-"));
  const client = createClient({ url: pathToFileURL(join(directory, "sessions.db")).href });
  const databaseState = globalThis as typeof globalThis & { __trustBridgeDb?: Client };
  const previousClient = databaseState.__trustBridgeDb;
  databaseState.__trustBridgeDb = client;
  const body = {
    title: "Brand identity refresh",
    serviceDescription: "Create a refreshed identity system for a new studio.",
    buyerName: "Jordan Lee",
    sellerName: "Maya Chen",
    totalAmount: "1250.00",
    currency: "USD",
    deadline: new Date().toISOString().slice(0, 10),
    deliverables: ["Primary logo in SVG and PNG formats"],
    acceptanceCriteria: ["Files open and render at the requested sizes"],
    includedRevisions: 2,
    additionalTerms: "",
    clarificationAnswers: [],
  };

  try {
    const session = await createOwnerSession();
    assert.ok(session);
    const request = new NextRequest("http://localhost/api/agreements/draft", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "test-ai-not-configured", cookie: `${OWNER_SESSION_COOKIE}=${session}` },
      body: JSON.stringify(body),
    });
    const response = await POST(request);
    const result = await response.json() as { code?: string; error?: string };

    assert.equal(response.status, 503);
    assert.equal(result.code, "AI_NOT_CONFIGURED");
    assert.match(result.error ?? "", /OPENAI_API_KEY/);
  } finally {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
    if (previousUsername === undefined) delete process.env.TRUSTBRIDGE_OWNER_USERNAME;
    else process.env.TRUSTBRIDGE_OWNER_USERNAME = previousUsername;
    if (previousPassword === undefined) delete process.env.TRUSTBRIDGE_OWNER_PASSWORD;
    else process.env.TRUSTBRIDGE_OWNER_PASSWORD = previousPassword;
    if (previousSecret === undefined) delete process.env.TRUSTBRIDGE_SESSION_SECRET;
    else process.env.TRUSTBRIDGE_SESSION_SECRET = previousSecret;
    await client.close();
    if (previousClient) databaseState.__trustBridgeDb = previousClient;
    else delete databaseState.__trustBridgeDb;
    try { rmSync(directory, { recursive: true, force: true }); } catch { /* Windows may retain a SQLite handle briefly. */ }
  }
});
