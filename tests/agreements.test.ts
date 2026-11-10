import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { createClient, type Client } from "@libsql/client";
import { AgreementContentSchema } from "@/lib/agreements/schema";
import { agreementDraftLabel, createManualAgreementDraft, isManualAgreementDraft } from "@/lib/agreements/manual-draft";
import { createAgreementRepository } from "@/lib/agreements/repository";
import { filterAgreementsByQuery } from "@/lib/agreements/search";

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

test("manual draft validates entered details and saves them without AI-generated content", async () => {
  const { summary, ...manualFields } = validAgreement;
  assert.ok(summary);
  const draft = createManualAgreementDraft(manualFields);
  assert.equal(draft.success, true);
  if (!draft.success) return;
  assert.match(draft.data.summary, /^Manual draft — not AI-generated/);
  assert.equal(isManualAgreementDraft(draft.data.summary), true);
  assert.equal(agreementDraftLabel(draft.data.summary), "Manual draft · not AI-generated");
  assert.equal(isManualAgreementDraft(validAgreement.summary), false);
  assert.equal(isManualAgreementDraft("Manual draft — not AI-generated. Review the structured agreement details below before sharing."), true);
  assert.equal(agreementDraftLabel(validAgreement.summary), "AI-assisted draft");
  assert.equal(draft.data.serviceDescription, validAgreement.serviceDescription);
  assert.deepEqual(draft.data.deliverables, validAgreement.deliverables);

  const invalid = createManualAgreementDraft({ ...manualFields, totalAmount: "0" });
  assert.equal(invalid.success, false);

  const dataDirectory = join(process.cwd(), "data");
  mkdirSync(dataDirectory, { recursive: true });
  const directory = mkdtempSync(join(dataDirectory, ".manual-agreement-test-"));
  const client = createClient({ url: pathToFileURL(join(directory, "agreements.db")).href });
  try {
    const saved = await createAgreementRepository(client).create(draft.data);
    const reopened = await createAgreementRepository(client).getById(saved.id);
    assert.equal(reopened?.summary, draft.data.summary);
    assert.equal(reopened?.paymentStatus, "unpaid");
  } finally {
    await client.close();
    try { rmSync(directory, { recursive: true, force: true }); } catch { /* SQLite may retain a native handle briefly on Windows. */ }
  }
});

test("agreement search filters saved content case-insensitively and keeps all records for blank queries", () => {
  const secondAgreement = {
    ...validAgreement,
    title: "Invoice cleanup",
    buyerName: "Priya Shah",
    serviceDescription: "Organize monthly invoices and reconcile expense descriptions.",
    deliverables: ["A categorized invoice register"],
    acceptanceCriteria: ["All totals match the source invoices"],
  };
  const agreements = [validAgreement, secondAgreement];

  assert.deepEqual(filterAgreementsByQuery(agreements, "  BRAND IDENTITY  "), [validAgreement]);
  assert.deepEqual(filterAgreementsByQuery(agreements, "priya"), [secondAgreement]);
  assert.deepEqual(filterAgreementsByQuery(agreements, "source invoices"), [secondAgreement]);
  assert.deepEqual(filterAgreementsByQuery(agreements, "   "), agreements);
  assert.deepEqual(filterAgreementsByQuery(agreements, "no match"), []);
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

test("legacy agreement databases migrate payment fields with an unpaid default", async () => {
  const dataDirectory = join(process.cwd(), "data");
  mkdirSync(dataDirectory, { recursive: true });
  const directory = mkdtempSync(join(dataDirectory, ".agreement-migration-"));
  const databaseUrl = pathToFileURL(join(directory, "legacy.db")).href;
  const client = createClient({ url: databaseUrl });
  const id = "01234567-89ab-cdef-0123-456789abcdef";
  try {
    await client.execute(`CREATE TABLE agreements (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, service_description TEXT NOT NULL, summary TEXT NOT NULL,
      buyer_name TEXT NOT NULL, seller_name TEXT NOT NULL, total_amount TEXT NOT NULL, currency TEXT NOT NULL,
      deadline TEXT NOT NULL, deliverables_json TEXT NOT NULL, acceptance_criteria_json TEXT NOT NULL,
      included_revisions INTEGER NOT NULL, additional_terms TEXT NOT NULL, status TEXT NOT NULL CHECK (status = 'saved'),
      created_at TEXT NOT NULL
    )`);
    await client.execute({
      sql: "INSERT INTO agreements VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      args: [id, validAgreement.title, validAgreement.serviceDescription, validAgreement.summary, validAgreement.buyerName,
        validAgreement.sellerName, validAgreement.totalAmount, validAgreement.currency, validAgreement.deadline,
        JSON.stringify(validAgreement.deliverables), JSON.stringify(validAgreement.acceptanceCriteria),
        validAgreement.includedRevisions, validAgreement.additionalTerms, "saved", new Date().toISOString()],
    });
    const migrated = await createAgreementRepository(client).getById(id);
    assert.equal(migrated?.paymentStatus, "unpaid");
    assert.equal(migrated?.paypalOrderId, null);
  } finally {
    await client.close();
    try { rmSync(directory, { recursive: true, force: true }); } catch { /* SQLite may retain a native handle briefly on Windows. */ }
  }
});
