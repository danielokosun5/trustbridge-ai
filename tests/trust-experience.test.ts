import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createClient } from "@libsql/client";
import { NextRequest } from "next/server";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { GET as listAgreements, POST as createAgreement } from "@/app/api/agreements/route";
import { GET as privateAgreement } from "@/app/api/agreements/[id]/route";
import { GET as privateActivity } from "@/app/api/agreements/[id]/activity/route";
import { POST as createShare, DELETE as revokeShare } from "@/app/api/agreements/[id]/share/route";
import { POST as draftAgreement } from "@/app/api/agreements/draft/route";
import { GET as publicReview, POST as publicRespond } from "@/app/api/public-agreements/[token]/route";
import { POST as paypalCreate } from "@/app/api/payments/create-order/route";
import { POST as paypalCapture } from "@/app/api/payments/capture-order/route";
import { POST as paypalCancel } from "@/app/api/payments/cancel-order/route";
import { OWNER_SESSION_COOKIE, createOwnerSession, ownerAuthConfigured, validateOwnerCredentials, verifyOwnerSession } from "@/lib/auth/owner-session";
import { ownerApiError } from "@/lib/auth/owner-authorization";
import { createAgreementRepository } from "@/lib/agreements/repository";
import { createShareToken, hashShareToken, isShareToken } from "@/lib/agreements/sharing";
import { consumeScopedRateLimit } from "@/lib/auth/owner-session-store";

const agreement = {
  title: "Website copy refresh",
  serviceDescription: "Rewrite the home page and three product descriptions for a small shop.",
  summary: "A web copy update covering the home page and three product descriptions.",
  buyerName: "Buyer Example",
  sellerName: "Seller Example",
  totalAmount: "850.00",
  currency: "USD" as const,
  deadline: new Date().toISOString().slice(0, 10),
  deliverables: ["Home page copy", "Three product descriptions"],
  acceptanceCriteria: ["Copy follows the provided tone guide"],
  includedRevisions: 1,
  additionalTerms: "One revision round is included.",
};

function setOwnerEnv() {
  process.env.TRUSTBRIDGE_OWNER_USERNAME = "owner-test";
  process.env.TRUSTBRIDGE_OWNER_PASSWORD = "test-password-123";
  process.env.TRUSTBRIDGE_SESSION_SECRET = "test-session-secret-long-enough-for-HMAC";
}

async function withRepository<T>(run: (repository: ReturnType<typeof createAgreementRepository>, client: ReturnType<typeof createClient>) => Promise<T>) {
  const root = join(process.cwd(), "data");
  mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, ".trust-experience-test-"));
  const client = createClient({ url: pathToFileURL(join(directory, "test.db")).href });
  const databaseState = globalThis as typeof globalThis & { __trustBridgeDb?: ReturnType<typeof createClient> };
  const previousClient = databaseState.__trustBridgeDb;
  databaseState.__trustBridgeDb = client;
  try { return await run(createAgreementRepository(client), client); }
  finally {
    await client.close();
    if (previousClient) databaseState.__trustBridgeDb = previousClient;
    else delete databaseState.__trustBridgeDb;
    try { rmSync(directory, { recursive: true, force: true }); } catch { /* SQLite can briefly retain a native handle on Windows. */ }
  }
}

test("owner authentication signs expiring sessions and fails closed without configuration", async () => {
  const previous = [process.env.TRUSTBRIDGE_OWNER_USERNAME, process.env.TRUSTBRIDGE_OWNER_PASSWORD, process.env.TRUSTBRIDGE_SESSION_SECRET];
  await withRepository(async () => { try {
    setOwnerEnv();
    const now = Date.now();
    const session = await createOwnerSession(now);
    assert.ok(session);
    assert.equal(await verifyOwnerSession(session, now), true);
    assert.equal(await verifyOwnerSession(`${session}x`, now), false);
    assert.equal(await verifyOwnerSession(session, now + 9 * 60 * 60 * 1000), false);
    assert.equal(validateOwnerCredentials("owner-test", "test-password-123"), true);
    assert.equal(validateOwnerCredentials("owner-test", "wrong-password"), false);
    process.env.TRUSTBRIDGE_OWNER_PASSWORD = "changed-owner-password";
    assert.equal(await verifyOwnerSession(session, now), false);
    process.env.TRUSTBRIDGE_OWNER_PASSWORD = "test-password-123";
    delete process.env.TRUSTBRIDGE_SESSION_SECRET;
    assert.equal(ownerAuthConfigured(), false);
    assert.equal(await createOwnerSession(), null);
    assert.equal((await ownerApiError(new Request("https://trustbridge.test/api/private")))?.status, 503);
  } finally {
    ["TRUSTBRIDGE_OWNER_USERNAME", "TRUSTBRIDGE_OWNER_PASSWORD", "TRUSTBRIDGE_SESSION_SECRET"].forEach((key, index) => {
      if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index];
    });
  } });
});

test("login accepts environment credentials and issues a secure HttpOnly SameSite session", async () => {
  const previous = [process.env.TRUSTBRIDGE_OWNER_USERNAME, process.env.TRUSTBRIDGE_OWNER_PASSWORD, process.env.TRUSTBRIDGE_SESSION_SECRET, process.env.NODE_ENV];
  await withRepository(async () => { try {
    setOwnerEnv(); (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    const request = new NextRequest("https://trustbridge.test/api/auth/login", {
      method: "POST",
      headers: { origin: "https://trustbridge.test", "x-forwarded-for": `login-test-${randomUUID()}`, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ username: "owner-test", password: "test-password-123" }),
    });
    const response = await login(request);
    assert.equal(response.status, 303);
    const cookie = response.headers.get("set-cookie") ?? "";
    assert.match(cookie, new RegExp(`${OWNER_SESSION_COOKIE}=`));
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Strict/i);
    assert.match(cookie, /Secure/i);
    const session = cookie.match(new RegExp(`${OWNER_SESSION_COOKIE}=([^;]+)`))?.[1];
    assert.equal(await verifyOwnerSession(session), true);
    assert.equal(await ownerApiError(new Request("https://trustbridge.test/api/private", { headers: { cookie: `${OWNER_SESSION_COOKIE}=${session}` } })), null);
    const signout = await logout(new Request("https://trustbridge.test/api/auth/logout", { method: "POST", headers: { origin: "https://trustbridge.test", cookie: `${OWNER_SESSION_COOKIE}=${session}` } }));
    assert.equal(signout.status, 303);
    assert.equal(await verifyOwnerSession(session), false, "a copied session must stop working after server-side logout");
    assert.equal((await ownerApiError(new Request("https://trustbridge.test/api/private", { headers: { cookie: `${OWNER_SESSION_COOKIE}=${session}` } })))?.status, 401);
    const expired = await createOwnerSession(Date.now() - 9 * 60 * 60 * 1000);
    assert.equal((await ownerApiError(new Request("https://trustbridge.test/api/private", { headers: { cookie: `${OWNER_SESSION_COOKIE}=${expired}` } })))?.status, 401);
  } finally {
    ["TRUSTBRIDGE_OWNER_USERNAME", "TRUSTBRIDGE_OWNER_PASSWORD", "TRUSTBRIDGE_SESSION_SECRET", "NODE_ENV"].forEach((key, index) => {
      if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index];
    });
  } });
});

test("all private agreement and payment APIs reject unauthenticated requests", async () => {
  const previous = [process.env.TRUSTBRIDGE_OWNER_USERNAME, process.env.TRUSTBRIDGE_OWNER_PASSWORD, process.env.TRUSTBRIDGE_SESSION_SECRET];
  try {
    setOwnerEnv();
    const id = randomUUID();
    const cases = [
      listAgreements(new Request("http://localhost/api/agreements")),
      createAgreement(new Request("http://localhost/api/agreements", { method: "POST", headers: { origin: "http://localhost" } })),
      privateAgreement(new Request(`http://localhost/api/agreements/${id}`), { params: Promise.resolve({ id }) }),
      draftAgreement(new Request("http://localhost/api/agreements/draft", { method: "POST", headers: { origin: "http://localhost" } })),
      privateActivity(new Request(`http://localhost/api/agreements/${id}/activity`), { params: Promise.resolve({ id }) }),
      createShare(new Request(`http://localhost/api/agreements/${id}/share`, { method: "POST", headers: { origin: "http://localhost" } }), { params: Promise.resolve({ id }) }),
      revokeShare(new Request(`http://localhost/api/agreements/${id}/share`, { method: "DELETE", headers: { origin: "http://localhost" } }), { params: Promise.resolve({ id }) }),
      paypalCreate(new Request("http://localhost/api/payments/create-order", { method: "POST", headers: { origin: "http://localhost" } })),
      paypalCapture(new Request("http://localhost/api/payments/capture-order", { method: "POST", headers: { origin: "http://localhost" } })),
      paypalCancel(new Request("http://localhost/api/payments/cancel-order", { method: "POST", headers: { origin: "http://localhost" } })),
    ];
    const responses = await Promise.all(cases);
    assert.deepEqual(responses.map((response) => response.status), Array(cases.length).fill(401));
    const body = await responses[0]!.json() as { error: string };
    assert.equal(body.error, "Owner authentication is required.");
  } finally {
    ["TRUSTBRIDGE_OWNER_USERNAME", "TRUSTBRIDGE_OWNER_PASSWORD", "TRUSTBRIDGE_SESSION_SECRET"].forEach((key, index) => {
      if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index];
    });
  }
});

test("login rate limiting redirects with a clear temporary lockout after five attempts", async () => {
  const previous = [process.env.TRUSTBRIDGE_OWNER_USERNAME, process.env.TRUSTBRIDGE_OWNER_PASSWORD, process.env.TRUSTBRIDGE_SESSION_SECRET];
  await withRepository(async () => { try {
    setOwnerEnv();
    const address = `login-limit-${randomUUID()}`;
    let response: Response | undefined;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      response = await login(new NextRequest("http://localhost/api/auth/login", {
        method: "POST",
        headers: { origin: "http://localhost", "x-forwarded-for": address, "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ username: "owner-test", password: "wrong-password" }),
      }));
    }
    assert.equal(response?.status, 303);
    assert.match(response?.headers.get("location") ?? "", /error=limited/);
  } finally {
    ["TRUSTBRIDGE_OWNER_USERNAME", "TRUSTBRIDGE_OWNER_PASSWORD", "TRUSTBRIDGE_SESSION_SECRET"].forEach((key, index) => {
      if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index];
    });
  }
  });
});

test("shared-database rate limits cover public responses and store only keyed address hashes", async () => {
  await withRepository(async (_repository, client) => {
    const address = `public-rate-${randomUUID()}`;
    const secret = "test-session-secret-long-enough-for-HMAC";
    const now = new Date();
    for (let attempt = 0; attempt < 20; attempt += 1) assert.equal(await consumeScopedRateLimit("public-response", address, secret, now, 20, 60_000), true);
    assert.equal(await consumeScopedRateLimit("public-response", address, secret, now, 20, 60_000), false);
    assert.equal(await consumeScopedRateLimit("public-response", address, secret, new Date(now.getTime() + 60_001), 20, 60_000), true);
    const stored = await client.execute("SELECT client_hash FROM request_rate_limits");
    assert.ok(stored.rows.length > 0);
    assert.equal(stored.rows.some((row) => String(row.client_hash).includes(address)), false);
  });
});

test("share links are random, hashed, expire, revoke, and return only public agreement fields", async () => {
  const previousSecret = process.env.TRUSTBRIDGE_SESSION_SECRET;
  process.env.TRUSTBRIDGE_SESSION_SECRET = "test-session-secret-long-enough-for-HMAC";
  assert.equal(isShareToken(createShareToken()), true);
  assert.equal(isShareToken("predictable-id"), false);
  try { await withRepository(async (repository, client) => {
    const saved = await repository.create(agreement);
    const token = createShareToken();
    const hash = hashShareToken(token);
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    await repository.createShare(saved.id, hash, expiresAt);
    const storedHash = await client.execute({ sql: "SELECT token_hash FROM agreement_shares LIMIT 1" });
    assert.equal(storedHash.rows[0]?.token_hash, hash);
    assert.notEqual(storedHash.rows[0]?.token_hash, token);
    const publicResponse = await publicReview(new Request(`http://localhost/api/public-agreements/${token}`), { params: Promise.resolve({ token }) });
    const publicJson = await publicResponse.json() as { agreement: Record<string, unknown>; [key: string]: unknown };
    assert.equal(publicResponse.status, 200);
    assert.equal("id" in publicJson, false);
    assert.equal("paymentStatus" in publicJson, false);
    assert.deepEqual(Object.keys(publicJson.agreement).sort(), ["acceptanceCriteria", "additionalTerms", "buyerName", "currency", "deadline", "deliverables", "includedRevisions", "sellerName", "serviceDescription", "summary", "title", "totalAmount"].sort());
    const resolved = await repository.resolvePublicShare(hash);
    assert.ok(resolved && "data" in resolved);
    if (!resolved || "error" in resolved) return;
    assert.deepEqual(Object.keys(resolved.data.agreement).sort(), ["acceptanceCriteria", "additionalTerms", "buyerName", "currency", "deadline", "deliverables", "includedRevisions", "sellerName", "serviceDescription", "summary", "title", "totalAmount"].sort());
    const json = JSON.stringify(resolved.data);
    assert.equal(json.includes(saved.id), false);
    assert.equal(json.includes("paypalOrderId"), false);
    const activity = await repository.listActivity(saved.id);
    assert.deepEqual(activity.map((event) => event.eventType), ["share_viewed", "share_created"]);
    const crossOrigin = await publicRespond(new Request(`http://localhost/api/public-agreements/${token}`, {
      method: "POST",
      headers: { origin: "https://attacker.example", "content-type": "application/json", "x-forwarded-for": `share-response-${randomUUID()}` },
      body: JSON.stringify({ response: "accepted" }),
    }), { params: Promise.resolve({ token }) });
    assert.equal(crossOrigin.status, 403);
    const response = await publicRespond(new Request(`http://localhost/api/public-agreements/${token}`, {
      method: "POST",
      headers: { origin: "http://localhost", "content-type": "application/json", "x-forwarded-for": `share-response-${randomUUID()}` },
      body: JSON.stringify({ response: "accepted" }),
    }), { params: Promise.resolve({ token }) });
    assert.equal(response.status, 200);
    const responseBody = await response.json() as Record<string, unknown>;
    assert.equal(responseBody.response, "accepted");
    assert.equal("agreementId" in responseBody, false);
    assert.equal("paymentStatus" in responseBody, false);
    assert.deepEqual((await repository.listActivity(saved.id)).map((event) => event.eventType), ["response_recorded", "share_viewed", "share_created"]);
  });
  } finally {
    if (previousSecret === undefined) delete process.env.TRUSTBRIDGE_SESSION_SECRET;
    else process.env.TRUSTBRIDGE_SESSION_SECRET = previousSecret;
  }
});

test("malformed public link tokens return not found without looking up agreement records", async () => {
  const token = "predictable-id";
  const response = await publicReview(new Request(`http://localhost/api/public-agreements/${token}`), { params: Promise.resolve({ token }) });
  assert.equal(response.status, 404);
  const body = await response.json() as { error: string };
  assert.match(body.error, /invalid, expired, or no longer available/);
});

test("expired and revoked links cannot resolve or record responses", async () => {
  await withRepository(async (repository) => {
    const saved = await repository.create(agreement);
    const expiredToken = createShareToken();
    await repository.createShare(saved.id, hashShareToken(expiredToken), new Date(Date.now() - 1000).toISOString());
    assert.deepEqual(await repository.resolvePublicShare(hashShareToken(expiredToken)), { error: "unavailable" });
    assert.deepEqual(await repository.respondToShare(hashShareToken(expiredToken), "accepted"), { error: "unavailable" });

    const revokedToken = createShareToken();
    await repository.createShare(saved.id, hashShareToken(revokedToken), new Date(Date.now() + 60_000).toISOString());
    assert.equal(await repository.revokeShares(saved.id), 1);
    assert.deepEqual(await repository.resolvePublicShare(hashShareToken(revokedToken)), { error: "unavailable" });
    assert.deepEqual(await repository.respondToShare(hashShareToken(revokedToken), "rejected"), { error: "unavailable" });
    assert.deepEqual(await repository.resolvePublicShare(hashShareToken(createShareToken())), { error: "not_found" });
  });
});

test("concurrent accept and reject attempts produce one immutable response", async () => {
  await withRepository(async (repository) => {
    const saved = await repository.create(agreement);
    const token = createShareToken();
    const hash = hashShareToken(token);
    await repository.createShare(saved.id, hash, new Date(Date.now() + 60_000).toISOString());
    const attempts = await Promise.all([
      repository.respondToShare(hash, "accepted"),
      repository.respondToShare(hash, "rejected"),
    ]);
    const responses = attempts.filter((attempt) => "response" in attempt).map((attempt) => attempt.response);
    const conflicts = attempts.filter((attempt) => "error" in attempt && attempt.error === "conflict");
    assert.equal(responses.length, 1);
    assert.equal(conflicts.length, 1);
    const current = await repository.resolvePublicShare(hash);
    assert.ok(current && "data" in current && current.data);
    if (current && "data" in current && current.data) assert.ok(["accepted", "rejected"].includes(current.data.response ?? ""));
    assert.equal((await repository.listActivity(saved.id)).filter((event) => event.eventType === "response_recorded").length, 1);
  });
});

test("terms integrity and one-response rule prevent changed terms and conflicting responses", async () => {
  await withRepository(async (repository, client) => {
    const saved = await repository.create(agreement);
    const token = createShareToken();
    const hash = hashShareToken(token);
    await repository.createShare(saved.id, hash, new Date(Date.now() + 60_000).toISOString());
    const accepted = await repository.respondToShare(hash, "accepted");
    assert.ok("response" in accepted);
    assert.equal((await repository.respondToShare(hash, "accepted")).duplicate, true);
    assert.deepEqual(await repository.respondToShare(hash, "rejected"), { error: "conflict" });
    const rotatedToken = createShareToken();
    const rotatedHash = hashShareToken(rotatedToken);
    await repository.createShare(saved.id, rotatedHash, new Date(Date.now() + 60_000).toISOString());
    const rotatedView = await repository.resolvePublicShare(rotatedHash);
    assert.ok(rotatedView && "data" in rotatedView);
    if (rotatedView && "data" in rotatedView && rotatedView.data) assert.equal(rotatedView.data.response, "accepted");
    assert.equal((await repository.respondToShare(rotatedHash, "accepted")).duplicate, true);
    assert.deepEqual(await repository.respondToShare(rotatedHash, "rejected"), { error: "conflict" });
    assert.equal((await repository.listActivity(saved.id)).filter((event) => event.eventType === "response_recorded").length, 1);

    // Direct SQL simulates a future authorized edit; the current repository has no term-edit operation.
    await client.execute({ sql: "UPDATE agreements SET title = ? WHERE id = ?", args: ["Changed terms", saved.id] });
    const result = await repository.resolvePublicShare(rotatedHash);
    assert.deepEqual(result, { error: "terms_changed" });
    assert.deepEqual(await repository.respondToShare(rotatedHash, "accepted"), { error: "terms_changed" });
    assert.deepEqual(await repository.resolvePublicShare(rotatedHash), { error: "terms_changed" }, "an earlier response must not be presented against modified terms");
    const changedToken = createShareToken();
    const changedHash = hashShareToken(changedToken);
    await repository.createShare(saved.id, changedHash, new Date(Date.now() + 60_000).toISOString());
    const newTerms = await repository.resolvePublicShare(changedHash);
    assert.ok(newTerms && "data" in newTerms && newTerms.data);
    if (newTerms && "data" in newTerms && newTerms.data) assert.equal(newTerms.data.response, null);
  });
});
