import { AgreementContentSchema, AgreementFieldsSchema } from "@/lib/agreements/schema";

export const MANUAL_DRAFT_SUMMARY =
  "Manual draft — not AI-generated. Review the structured agreement details in this workspace.";

export function isManualAgreementDraft(summary: string) {
  return summary.startsWith("Manual draft — not AI-generated.");
}

export function agreementDraftLabel(summary: string) {
  return isManualAgreementDraft(summary) ? "Manual draft · not AI-generated" : "AI-assisted draft";
}

/** Validates user-entered fields and adds only an explicit manual-draft label. */
export function createManualAgreementDraft(input: unknown) {
  const fields = AgreementFieldsSchema.safeParse(input);
  if (!fields.success) return fields;

  return AgreementContentSchema.safeParse({
    ...fields.data,
    summary: MANUAL_DRAFT_SUMMARY,
  });
}
