import { z } from "zod";

export const AgreementIdSchema = z.string().uuid();
export const PaymentOrderInputSchema = z.object({ agreementId: AgreementIdSchema }).strict();
export const PaymentCaptureInputSchema = z.object({
  agreementId: AgreementIdSchema,
  orderId: z.string().regex(/^[A-Z0-9]{10,64}$/),
}).strict();
