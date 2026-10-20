import { randomUUID } from "node:crypto";
import type { Client, Row } from "@libsql/client";
import type { AgreementContent, SavedAgreement } from "./schema";

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS agreements (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    service_description TEXT NOT NULL,
    summary TEXT NOT NULL,
    buyer_name TEXT NOT NULL,
    seller_name TEXT NOT NULL,
    total_amount TEXT NOT NULL,
    currency TEXT NOT NULL,
    deadline TEXT NOT NULL,
    deliverables_json TEXT NOT NULL,
    acceptance_criteria_json TEXT NOT NULL,
    included_revisions INTEGER NOT NULL,
    additional_terms TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status = 'saved'),
    created_at TEXT NOT NULL
  )`,
  "CREATE INDEX IF NOT EXISTS agreements_created_at_idx ON agreements(created_at DESC)",
];

const getText = (row: Row, key: string) => String(row[key]);
const getNumber = (row: Row, key: string) => Number(row[key]);

function mapAgreement(row: Row): SavedAgreement {
  return {
    id: getText(row, "id"),
    title: getText(row, "title"),
    serviceDescription: getText(row, "service_description"),
    summary: getText(row, "summary"),
    buyerName: getText(row, "buyer_name"),
    sellerName: getText(row, "seller_name"),
    totalAmount: getText(row, "total_amount"),
    currency: getText(row, "currency") as AgreementContent["currency"],
    deadline: getText(row, "deadline"),
    deliverables: JSON.parse(getText(row, "deliverables_json")) as string[],
    acceptanceCriteria: JSON.parse(getText(row, "acceptance_criteria_json")) as string[],
    includedRevisions: getNumber(row, "included_revisions"),
    additionalTerms: getText(row, "additional_terms"),
    status: "saved",
    createdAt: getText(row, "created_at"),
  };
}

export function createAgreementRepository(client: Client) {
  let ready: Promise<void> | undefined;
  const initialize = () => {
    ready ??= client.batch(schemaStatements, "write").then(() => undefined).catch((error: unknown) => {
      ready = undefined;
      throw error;
    });
    return ready;
  };

  return {
    initialize,
    async create(agreement: AgreementContent): Promise<SavedAgreement> {
      await initialize();
      const saved: SavedAgreement = { ...agreement, id: randomUUID(), status: "saved", createdAt: new Date().toISOString() };
      await client.execute({
        sql: `INSERT INTO agreements (
          id, title, service_description, summary, buyer_name, seller_name, total_amount, currency,
          deadline, deliverables_json, acceptance_criteria_json, included_revisions, additional_terms, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          saved.id, saved.title, saved.serviceDescription, saved.summary, saved.buyerName, saved.sellerName,
          saved.totalAmount, saved.currency, saved.deadline, JSON.stringify(saved.deliverables),
          JSON.stringify(saved.acceptanceCriteria), saved.includedRevisions, saved.additionalTerms, saved.status, saved.createdAt,
        ],
      });
      return saved;
    },
    async getById(id: string): Promise<SavedAgreement | null> {
      await initialize();
      const result = await client.execute({ sql: "SELECT * FROM agreements WHERE id = ? LIMIT 1", args: [id] });
      return result.rows[0] ? mapAgreement(result.rows[0]) : null;
    },
    async list(): Promise<SavedAgreement[]> {
      await initialize();
      const result = await client.execute("SELECT * FROM agreements ORDER BY created_at DESC, id DESC");
      return result.rows.map(mapAgreement);
    },
  };
}

let defaultRepository: ReturnType<typeof createAgreementRepository> | undefined;

export async function getAgreementRepository() {
  if (!defaultRepository) {
    const { createDatabaseClient } = await import("./database");
    defaultRepository = createAgreementRepository(createDatabaseClient());
  }
  return defaultRepository;
}
