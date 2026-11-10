import { createHash, randomBytes } from "node:crypto";
import type { AgreementContent, SavedAgreement } from "./schema";

export type ShareResponse = "accepted" | "rejected";
export type PublicAgreement = Pick<AgreementContent,
  "title" | "serviceDescription" | "summary" | "buyerName" | "sellerName" | "totalAmount" | "currency" |
  "deadline" | "deliverables" | "acceptanceCriteria" | "includedRevisions" | "additionalTerms">;

export function createShareToken() {
  return randomBytes(32).toString("base64url");
}

export function isShareToken(token: string) {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

export function hashShareToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function agreementTermsHash(agreement: AgreementContent) {
  const canonical = JSON.stringify({
    title: agreement.title,
    serviceDescription: agreement.serviceDescription,
    summary: agreement.summary,
    buyerName: agreement.buyerName,
    sellerName: agreement.sellerName,
    totalAmount: agreement.totalAmount,
    currency: agreement.currency,
    deadline: agreement.deadline,
    deliverables: agreement.deliverables,
    acceptanceCriteria: agreement.acceptanceCriteria,
    includedRevisions: agreement.includedRevisions,
    additionalTerms: agreement.additionalTerms,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

export function toPublicAgreement(agreement: SavedAgreement): PublicAgreement {
  return {
    title: agreement.title,
    serviceDescription: agreement.serviceDescription,
    summary: agreement.summary,
    buyerName: agreement.buyerName,
    sellerName: agreement.sellerName,
    totalAmount: agreement.totalAmount,
    currency: agreement.currency,
    deadline: agreement.deadline,
    deliverables: agreement.deliverables,
    acceptanceCriteria: agreement.acceptanceCriteria,
    includedRevisions: agreement.includedRevisions,
    additionalTerms: agreement.additionalTerms,
  };
}
