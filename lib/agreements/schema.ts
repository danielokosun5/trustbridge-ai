import { z } from "zod";

const today = () => new Date().toISOString().slice(0, 10);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date.").refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}, "Enter a real calendar date.").refine((value) => value >= today(), "The deadline must be today or later.");

const amount = z.string().trim().regex(/^\d{1,9}(?:\.\d{1,2})?$/, "Enter an amount with up to two decimal places.").refine((value) => Number(value) > 0, "The amount must be greater than zero.");
const listItem = z.string().trim().min(2, "Add a little more detail.").max(500, "Keep each item under 500 characters.");

export const AgreementFieldsSchema = z.object({
  title: z.string().trim().min(3, "Use at least 3 characters.").max(120, "Keep the title under 120 characters."),
  serviceDescription: z.string().trim().min(10, "Describe the service in at least 10 characters.").max(3000, "Keep the description under 3,000 characters."),
  buyerName: z.string().trim().min(2, "Enter the buyer’s display name.").max(80),
  sellerName: z.string().trim().min(2, "Enter the seller’s display name.").max(80),
  totalAmount: amount,
  currency: z.enum(["USD", "EUR", "GBP", "NGN", "CAD", "AUD"]),
  deadline: isoDate,
  deliverables: z.array(listItem).min(1, "List at least one deliverable.").max(15, "Use no more than 15 deliverables."),
  acceptanceCriteria: z.array(listItem).max(15, "Use no more than 15 acceptance criteria."),
  includedRevisions: z.number().int("Use a whole number of revisions.").min(0).max(20),
  additionalTerms: z.string().trim().max(1500, "Keep additional terms under 1,500 characters."),
}).strict();

export const DraftRequestSchema = AgreementFieldsSchema.extend({
  clarificationAnswers: z.array(z.object({
    question: z.string().trim().min(1).max(400),
    answer: z.string().trim().min(1, "Answer each clarification before continuing.").max(1000),
  }).strict()).max(8).default([]),
}).strict();

export const AgreementContentSchema = AgreementFieldsSchema.extend({
  summary: z.string().trim().min(10).max(1200),
}).strict();

export const AIEnrichmentSchema = z.object({
  title: AgreementFieldsSchema.shape.title,
  serviceDescription: AgreementFieldsSchema.shape.serviceDescription,
  summary: AgreementContentSchema.shape.summary,
  deliverables: AgreementFieldsSchema.shape.deliverables,
  acceptanceCriteria: AgreementFieldsSchema.shape.acceptanceCriteria,
  additionalTerms: AgreementFieldsSchema.shape.additionalTerms,
  clarificationQuestions: z.array(z.string().trim().min(5).max(400)).max(8),
}).strict();

export type AgreementFields = z.infer<typeof AgreementFieldsSchema>;
export type DraftRequest = z.infer<typeof DraftRequestSchema>;
export type AgreementContent = z.infer<typeof AgreementContentSchema>;
export type AIEnrichment = z.infer<typeof AIEnrichmentSchema>;

export type SavedAgreement = AgreementContent & {
  id: string;
  status: "saved";
  createdAt: string;
};
