import { randomUUID } from "node:crypto";
import type { Client, Row } from "@libsql/client";
import type { AgreementContent, SavedAgreement } from "./schema";
import { agreementTermsHash, toPublicAgreement, type PublicAgreement, type ShareResponse } from "./sharing";

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
    created_at TEXT NOT NULL,
    payment_status TEXT NOT NULL DEFAULT 'unpaid',
    paypal_order_id TEXT,
    paypal_capture_id TEXT,
    paypal_create_request_id TEXT,
    paypal_capture_request_id TEXT,
    payment_amount TEXT,
    payment_currency TEXT
  )`,
  "CREATE INDEX IF NOT EXISTS agreements_created_at_idx ON agreements(created_at DESC)",
  `CREATE TABLE IF NOT EXISTS agreement_shares (
    id TEXT PRIMARY KEY,
    agreement_id TEXT NOT NULL REFERENCES agreements(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    terms_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    revoked_at TEXT,
    first_viewed_at TEXT,
    response TEXT CHECK (response IN ('accepted', 'rejected')),
    responded_at TEXT
  )`,
  "CREATE INDEX IF NOT EXISTS agreement_shares_agreement_idx ON agreement_shares(agreement_id, created_at DESC)",
  `CREATE TABLE IF NOT EXISTS agreement_activity (
    id TEXT PRIMARY KEY,
    agreement_id TEXT NOT NULL REFERENCES agreements(id) ON DELETE CASCADE,
    share_id TEXT REFERENCES agreement_shares(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL CHECK (event_type IN ('share_created', 'share_viewed', 'response_recorded')),
    response TEXT CHECK (response IN ('accepted', 'rejected')),
    created_at TEXT NOT NULL
  )`,
  "CREATE INDEX IF NOT EXISTS agreement_activity_agreement_idx ON agreement_activity(agreement_id, created_at DESC)",
];

export type PublicShareRecord = {
  agreement: PublicAgreement;
  expiresAt: string;
  response: ShareResponse | null;
  respondedAt: string | null;
};

export type AgreementActivity = {
  eventType: "share_created" | "share_viewed" | "response_recorded";
  response: ShareResponse | null;
  createdAt: string;
};

const getText = (row: Row, key: string) => String(row[key]);
const getNumber = (row: Row, key: string) => Number(row[key]);
const getNullableText = (row: Row, key: string) => row[key] == null ? null : String(row[key]);

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
    paymentStatus: (getNullableText(row, "payment_status") ?? "unpaid") as SavedAgreement["paymentStatus"],
    paypalOrderId: getNullableText(row, "paypal_order_id"),
    paypalCaptureId: getNullableText(row, "paypal_capture_id"),
    paymentAmount: getNullableText(row, "payment_amount"),
    paymentCurrency: getNullableText(row, "payment_currency"),
  };
}

function isDatabaseBusy(error: unknown) {
  return error instanceof Error && /SQLITE_BUSY|database is locked/i.test(error.message);
}

const retryDelay = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export function createAgreementRepository(client: Client) {
  let ready: Promise<void> | undefined;
  const initialize = () => {
    ready ??= client.batch(schemaStatements, "write").then(async () => {
      const result = await client.execute("PRAGMA table_info(agreements)");
      const columns = new Set(result.rows.map((row) => String(row.name)));
      const migrations: Array<[string, string]> = [
        ["payment_status", "TEXT NOT NULL DEFAULT 'unpaid'"],
        ["paypal_order_id", "TEXT"],
        ["paypal_capture_id", "TEXT"],
        ["paypal_create_request_id", "TEXT"],
        ["paypal_capture_request_id", "TEXT"],
        ["payment_amount", "TEXT"],
        ["payment_currency", "TEXT"],
      ];
      for (const [name, definition] of migrations) {
        if (!columns.has(name)) await client.execute(`ALTER TABLE agreements ADD COLUMN ${name} ${definition}`);
      }
    }).catch((error: unknown) => {
      ready = undefined;
      throw error;
    });
    return ready;
  };

  return {
    initialize,
    async create(agreement: AgreementContent): Promise<SavedAgreement> {
      await initialize();
      const saved: SavedAgreement = { ...agreement, id: randomUUID(), status: "saved", createdAt: new Date().toISOString(), paymentStatus: "unpaid", paypalOrderId: null, paypalCaptureId: null, paymentAmount: null, paymentCurrency: null };
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
    async createShare(id: string, tokenHash: string, expiresAt: string) {
      await initialize();
      const agreement = await this.getById(id);
      if (!agreement) return null;
      const now = new Date().toISOString();
      const shareId = randomUUID();
      const tx = await client.transaction("write");
      try {
        await tx.execute({ sql: "UPDATE agreement_shares SET revoked_at = ? WHERE agreement_id = ? AND revoked_at IS NULL", args: [now, id] });
        await tx.execute({
          sql: "INSERT INTO agreement_shares (id, agreement_id, token_hash, terms_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)",
          args: [shareId, id, tokenHash, agreementTermsHash(agreement), now, expiresAt],
        });
        await tx.execute({
          sql: "INSERT INTO agreement_activity (id, agreement_id, share_id, event_type, created_at) VALUES (?, ?, ?, 'share_created', ?)",
          args: [randomUUID(), id, shareId, now],
        });
        await tx.commit();
      } catch (error) {
        await tx.rollback();
        throw error;
      }
      return { id: shareId, expiresAt, createdAt: now };
    },
    async revokeShares(id: string) {
      await initialize();
      const now = new Date().toISOString();
      const result = await client.execute({
        sql: "UPDATE agreement_shares SET revoked_at = ? WHERE agreement_id = ? AND revoked_at IS NULL AND expires_at > ?",
        args: [now, id, now],
      });
      return Number(result.rowsAffected);
    },
    async resolvePublicShare(tokenHash: string, now = new Date().toISOString()) {
      await initialize();
      const result = await client.execute({
        sql: `SELECT s.id, s.agreement_id, s.terms_hash, s.expires_at, s.revoked_at, s.first_viewed_at,
          (SELECT prior.response FROM agreement_shares prior WHERE prior.agreement_id = s.agreement_id AND prior.terms_hash = s.terms_hash AND prior.response IS NOT NULL ORDER BY prior.responded_at ASC LIMIT 1) AS response,
          (SELECT prior.responded_at FROM agreement_shares prior WHERE prior.agreement_id = s.agreement_id AND prior.terms_hash = s.terms_hash AND prior.response IS NOT NULL ORDER BY prior.responded_at ASC LIMIT 1) AS responded_at
          FROM agreement_shares s WHERE s.token_hash = ? LIMIT 1`,
        args: [tokenHash],
      });
      const row = result.rows[0];
      if (!row) return { error: "not_found" as const };
      const shareId = getText(row, "id");
      const agreementId = getText(row, "agreement_id");
      if (getNullableText(row, "revoked_at")) return { error: "unavailable" as const };
      const expiresAt = getText(row, "expires_at");
      if (expiresAt <= now) return { error: "unavailable" as const };
      const agreement = await this.getById(agreementId);
      if (!agreement || agreementTermsHash(agreement) !== getText(row, "terms_hash")) return { error: "terms_changed" as const };
      if (!getNullableText(row, "first_viewed_at")) {
        const tx = await client.transaction("write");
        try {
          const updated = await tx.execute({ sql: "UPDATE agreement_shares SET first_viewed_at = ? WHERE id = ? AND first_viewed_at IS NULL AND revoked_at IS NULL AND expires_at > ?", args: [now, shareId, now] });
          if (Number(updated.rowsAffected) > 0) {
            await tx.execute({ sql: "INSERT INTO agreement_activity (id, agreement_id, share_id, event_type, created_at) VALUES (?, ?, ?, 'share_viewed', ?)", args: [randomUUID(), agreementId, shareId, now] });
          }
          await tx.commit();
        } catch (error) {
          await tx.rollback();
          throw error;
        }
      }
      return {
        data: {
          agreement: toPublicAgreement(agreement),
          expiresAt,
          response: getNullableText(row, "response") as ShareResponse | null,
          respondedAt: getNullableText(row, "responded_at"),
        } satisfies PublicShareRecord,
      };
    },
    async respondToShare(tokenHash: string, response: ShareResponse, now = new Date().toISOString()) {
      await initialize();
      for (let attempt = 0; attempt < 4; attempt += 1) {
        let tx: Awaited<ReturnType<Client["transaction"]>> | undefined;
        try {
        tx = await client.transaction("write");
        const lookup = await tx.execute({ sql: "SELECT id, agreement_id, terms_hash, expires_at, revoked_at, response, responded_at FROM agreement_shares WHERE token_hash = ? LIMIT 1", args: [tokenHash] });
        const row = lookup.rows[0];
        if (!row || getNullableText(row, "revoked_at") || getText(row, "expires_at") <= now) {
          await tx.rollback();
          return { error: "unavailable" as const };
        }
        const agreementId = getText(row, "agreement_id");
        const agreementResult = await tx.execute({ sql: "SELECT * FROM agreements WHERE id = ? LIMIT 1", args: [agreementId] });
        const agreement = agreementResult.rows[0] ? mapAgreement(agreementResult.rows[0]) : null;
        if (!agreement || agreementTermsHash(agreement) !== getText(row, "terms_hash")) {
          await tx.rollback();
          return { error: "terms_changed" as const };
        }
        const agreementResponse = await tx.execute({
          sql: "SELECT response, responded_at FROM agreement_shares WHERE agreement_id = ? AND terms_hash = ? AND response IS NOT NULL ORDER BY responded_at ASC LIMIT 1",
          args: [agreementId, getText(row, "terms_hash")],
        });
        const existing = agreementResponse.rows[0] ? getNullableText(agreementResponse.rows[0], "response") as ShareResponse | null : null;
        if (existing) {
          const respondedAt = getNullableText(agreementResponse.rows[0]!, "responded_at") ?? now;
          await tx.rollback();
          return existing === response ? { response: existing, respondedAt, duplicate: true as const } : { error: "conflict" as const };
        }

        const shareId = getText(row, "id");
        const updated = await tx.execute({
          sql: "UPDATE agreement_shares SET response = ?, responded_at = ? WHERE id = ? AND response IS NULL AND revoked_at IS NULL AND expires_at > ? AND terms_hash = ?",
          args: [response, now, shareId, now, agreementTermsHash(agreement)],
        });
        if (Number(updated.rowsAffected) === 0) {
          await tx.rollback();
          const current = await client.execute({ sql: "SELECT response, responded_at FROM agreement_shares WHERE id = ? LIMIT 1", args: [shareId] });
          const currentResponse = current.rows[0] ? getNullableText(current.rows[0], "response") as ShareResponse | null : null;
          if (currentResponse === response) return { response, respondedAt: getNullableText(current.rows[0]!, "responded_at") ?? now, duplicate: true as const };
          return { error: currentResponse ? "conflict" as const : "unavailable" as const };
        }
        await tx.execute({
          sql: "INSERT INTO agreement_activity (id, agreement_id, share_id, event_type, response, created_at) VALUES (?, ?, ?, 'response_recorded', ?, ?)",
          args: [randomUUID(), agreementId, shareId, response, now],
        });
        await tx.commit();
        return { response, respondedAt: now, duplicate: false as const };
      } catch (error) {
        if (tx) {
          try { await tx.rollback(); } catch { /* The transaction may already have rolled back. */ }
        }
        if (!isDatabaseBusy(error) || attempt === 3) throw error;
        await retryDelay(20 * (attempt + 1));
        }
      }
      return { error: "unavailable" as const };
    },
    async listActivity(id: string): Promise<AgreementActivity[]> {
      await initialize();
      const result = await client.execute({
        sql: "SELECT event_type, response, created_at FROM agreement_activity WHERE agreement_id = ? ORDER BY created_at DESC, id DESC LIMIT 100",
        args: [id],
      });
      return result.rows.map((row) => ({
        eventType: getText(row, "event_type") as AgreementActivity["eventType"],
        response: getNullableText(row, "response") as ShareResponse | null,
        createdAt: getText(row, "created_at"),
      }));
    },
    async beginOrderCreation(id: string, requestId: string) {
      await initialize();
      await client.execute({
        sql: `UPDATE agreements SET payment_status = 'creating', paypal_create_request_id = ?, paypal_order_id = NULL,
          paypal_capture_id = NULL, paypal_capture_request_id = NULL, payment_amount = NULL, payment_currency = NULL
          WHERE id = ? AND payment_status IN ('unpaid', 'cancelled', 'failed')`,
        args: [requestId, id],
      });
      return this.getById(id);
    },
    async failOrderCreation(id: string, requestId: string) {
      await initialize();
      await client.execute({
        sql: "UPDATE agreements SET payment_status = 'failed' WHERE id = ? AND payment_status = 'creating' AND paypal_create_request_id = ?",
        args: [id, requestId],
      });
      return this.getById(id);
    },
    async savePayPalOrder(id: string, requestId: string, orderId: string) {
      await initialize();
      await client.execute({
        sql: "UPDATE agreements SET payment_status = 'pending', paypal_order_id = ? WHERE id = ? AND payment_status = 'creating' AND paypal_create_request_id = ?",
        args: [orderId, id, requestId],
      });
      return this.getById(id);
    },
    async claimCapture(id: string, orderId: string, requestId: string) {
      await initialize();
      const agreement = await this.getById(id);
      if (!agreement) return null;
      if (agreement.paymentStatus === "paid") return agreement;
      if (agreement.paymentStatus === "pending" && agreement.paypalOrderId === orderId) {
        await client.execute({
          sql: "UPDATE agreements SET payment_status = 'capturing', paypal_capture_request_id = ? WHERE id = ? AND payment_status = 'pending' AND paypal_order_id = ?",
          args: [requestId, id, orderId],
        });
      }
      return this.getById(id);
    },
    async markPaid(id: string, orderId: string, captureId: string, amount: string, currency: string) {
      await initialize();
      const result = await client.execute({
        sql: `UPDATE agreements SET payment_status = 'paid', paypal_capture_id = ?, payment_amount = ?, payment_currency = ?
          WHERE id = ? AND paypal_order_id = ? AND payment_status = 'capturing'`,
        args: [captureId, amount, currency, id, orderId],
      });
      if (Number(result.rowsAffected) > 0) return this.getById(id);
      const agreement = await this.getById(id);
      return agreement?.paymentStatus === "paid" && agreement.paypalCaptureId === captureId ? agreement : null;
    },
    async markPaymentFailed(id: string, orderId: string) {
      await initialize();
      await client.execute({
        sql: "UPDATE agreements SET payment_status = 'failed' WHERE id = ? AND paypal_order_id = ? AND payment_status = 'capturing'",
        args: [id, orderId],
      });
      return this.getById(id);
    },
    async releaseCapture(id: string, orderId: string) {
      await initialize();
      await client.execute({
        sql: "UPDATE agreements SET payment_status = 'pending', paypal_capture_request_id = NULL WHERE id = ? AND paypal_order_id = ? AND payment_status = 'capturing'",
        args: [id, orderId],
      });
      return this.getById(id);
    },
    async cancelOrder(id: string, orderId: string) {
      await initialize();
      await client.execute({
        sql: "UPDATE agreements SET payment_status = 'cancelled' WHERE id = ? AND paypal_order_id = ? AND payment_status = 'pending'",
        args: [id, orderId],
      });
      return this.getById(id);
    },
    async getCreateRequestId(id: string) {
      await initialize();
      const agreement = await this.getById(id);
      return agreement?.paymentStatus === "creating" ? getRequestId(client, id) : null;
    },
    async getCaptureRequestId(id: string, orderId: string) {
      await initialize();
      const result = await client.execute({
        sql: "SELECT paypal_capture_request_id FROM agreements WHERE id = ? AND paypal_order_id = ? AND payment_status = 'capturing' LIMIT 1",
        args: [id, orderId],
      });
      return result.rows[0] ? getNullableText(result.rows[0], "paypal_capture_request_id") : null;
    },
  };
}

async function getRequestId(client: Client, id: string) {
  const result = await client.execute({ sql: "SELECT paypal_create_request_id FROM agreements WHERE id = ? AND payment_status = 'creating' LIMIT 1", args: [id] });
  return result.rows[0] ? getNullableText(result.rows[0], "paypal_create_request_id") : null;
}

let defaultRepository: ReturnType<typeof createAgreementRepository> | undefined;

export async function getAgreementRepository() {
  if (!defaultRepository) {
    const { createDatabaseClient } = await import("./database");
    defaultRepository = createAgreementRepository(createDatabaseClient());
  }
  return defaultRepository;
}
