import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { createClient, type Client } from "@libsql/client";
import { AgreementContentSchema } from "@/lib/agreements/schema";
import { createAgreementRepository } from "@/lib/agreements/repository";

const validAgreement = {
  title: "Brand identity refresh",
  serviceDescription: "Create a refreshed identity system for the buyer's new studio.",
  summary: "A clear and concise identity refresh for the studio launch.",
  buyerName: "Jordan Lee",
  sellerName: "Maya Chen",
  totalAmount: "1250.00",
  currency: "USD" as const,
  deadline: new Date().toISOString().slice(0, 10),
  deliverables: ["Primary logo in SVG and PNG formats"],
  acceptanceCriteria: ["Files open and render at the requested sizes"],
  includedRevisions: 2,
  additionalTerms: "Source files are included.",
};

test("agreement validation accepts complete values and rejects invalid amounts and revisions", () => {
  assert.equal(AgreementContentSchema.safeParse(validAgreement).success, true);
  assert.equal(AgreementContentSchema.safeParse({ ...validAgreement, totalAmount: "-10" }).success, false);
  assert.equal(AgreementContentSchema.safeParse({ ...validAgreement, includedRevisions: 1.5 }).success, false);
  assert.equal(AgreementContentSchema.safeParse({ ...validAgreement, deadline: "2026-02-31" }).success, false);
});

test("saved agreements and timestamps survive closing and reopening the local database", async () => {
  const dataDirectory = join(process.cwd(), "data");
  mkdirSync(dataDirectory, { recursive: true });
  const directory = mkdtempSync(join(dataDirectory, ".agreement-test-"));
  const databaseUrl = pathToFileURL(join(directory, "agreements.db")).href;
  let client: Client | undefined;

  try {
    client = createClient({ url: databaseUrl });
    const firstRepository = createAgreementRepository(client);
    const saved = await firstRepository.create(validAgreement);
    assert.equal(saved.status, "saved");
    assert.ok(Number.isFinite(Date.parse(saved.createdAt)));

    await client.close();
    client = createClient({ url: databaseUrl });
    const reopenedRepository = createAgreementRepository(client);
    const found = await reopenedRepository.getById(saved.id);
    const list = await reopenedRepository.list();

    assert.deepEqual(found, saved);
    assert.equal(list.length, 1);
    assert.equal(list[0]?.id, saved.id);
  } finally {
    if (client) await client.close();
    try {
      rmSync(directory, { recursive: true, force: true });
    } catch {
      // Windows may retain a native SQLite handle briefly; data/ is gitignored.
    }
  }
});
