import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { SavedAgreement } from "@/lib/agreements/schema";
import { AgreementIdSchema } from "./validation";
import { PAYPAL_CURRENCIES, type PayPalClient, type PayPalCurrency, type PayPalOrder } from "./types";

const OrderIdSchema = z.string().regex(/^[A-Z0-9]{10,64}$/, "Invalid PayPal order ID.");
const AmountSchema = z.string().regex(/^\d{1,9}(?:\.\d{1,2})?$/).refine((value) => Number(value) > 0);

export type PaymentRepository = {
  getById(id: string): Promise<SavedAgreement | null>;
  beginOrderCreation(id: string, requestId: string): Promise<SavedAgreement | null>;
  failOrderCreation(id: string, requestId: string): Promise<SavedAgreement | null>;
  savePayPalOrder(id: string, requestId: string, orderId: string): Promise<SavedAgreement | null>;
  getCreateRequestId(id: string): Promise<string | null>;
  claimCapture(id: string, orderId: string, requestId: string): Promise<SavedAgreement | null>;
  getCaptureRequestId(id: string, orderId: string): Promise<string | null>;
  markPaid(id: string, orderId: string, captureId: string, amount: string, currency: string): Promise<SavedAgreement | null>;
  markPaymentFailed(id: string, orderId: string): Promise<SavedAgreement | null>;
  releaseCapture(id: string, orderId: string): Promise<SavedAgreement | null>;
  cancelOrder(id: string, orderId: string): Promise<SavedAgreement | null>;
};

export class PaymentServiceError extends Error {
  constructor(readonly status: number, message: string, readonly code: string) {
    super(message);
    this.name = "PaymentServiceError";
  }
}

function assertConfigured(isConfigured: () => boolean) {
  if (!isConfigured()) throw new PaymentServiceError(503, "PayPal sandbox is not configured. Set PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, and PAYPAL_ENV=sandbox on the server.", "PAYPAL_NOT_CONFIGURED");
}

function validateAgreement(agreement: SavedAgreement) {
  const amount = AmountSchema.safeParse(agreement.totalAmount);
  if (!amount.success) throw new PaymentServiceError(400, "The saved agreement amount is invalid.", "INVALID_AGREEMENT_AMOUNT");
  if (!(PAYPAL_CURRENCIES as readonly string[]).includes(agreement.currency)) {
    throw new PaymentServiceError(400, "PayPal sandbox checkout does not support this agreement currency.", "UNSUPPORTED_CURRENCY");
  }
  const [whole, fraction = ""] = amount.data.split(".");
  return { value: `${whole}.${fraction.padEnd(2, "0")}`, currency: agreement.currency as PayPalCurrency };
}

function amountInMinorUnits(value: unknown) {
  if (typeof value !== "string" || !/^\d{1,9}(?:\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

function currencyCode(value: unknown) {
  return typeof value === "string" ? value.trim().toUpperCase() : null;
}

function unitMatches(order: PayPalOrder, agreement: SavedAgreement, amount: string, currency: string) {
  const unit = order.purchase_units?.[0];
  const agreementIds = [unit?.reference_id, unit?.custom_id].filter((id): id is string => typeof id === "string");
  const metadataMatches = agreementIds.length > 0 && agreementIds.every((id) => id === agreement.id);
  const expectedAmount = amountInMinorUnits(amount);
  const receivedAmount = amountInMinorUnits(unit?.amount?.value);
  return Boolean(order.id)
    && order.purchase_units?.length === 1
    && metadataMatches
    && expectedAmount !== null
    && receivedAmount === expectedAmount
    && currencyCode(unit?.amount?.currency_code) === currencyCode(currency);
}

function orderVerificationChecks(order: PayPalOrder | undefined, createdOrderId: string | undefined, createdStatus: string, agreement: SavedAgreement, amount: string, currency: string) {
  const units = order?.purchase_units ?? [];
  const unit = units[0];
  const agreementIds = [unit?.reference_id, unit?.custom_id].filter((id): id is string => typeof id === "string");
  const expectedAmount = amountInMinorUnits(amount);
  const receivedAmount = amountInMinorUnits(unit?.amount?.value);
  return [
    { field: "created_order_id", expected: "valid PayPal order ID", received: createdOrderId ?? null, matched: Boolean(createdOrderId) },
    { field: "created_order_status", expected: "CREATED", received: createdStatus, matched: createdStatus === "CREATED" },
    { field: "retrieved_order_id", expected: createdOrderId ?? null, received: order?.id ?? null, matched: Boolean(order && createdOrderId && order.id === createdOrderId) },
    { field: "retrieved_order_status", expected: "CREATED", received: order?.status ?? null, matched: order?.status === "CREATED" },
    { field: "purchase_unit_count", expected: 1, received: units.length, matched: units.length === 1 },
    { field: "purchase_unit_agreement_metadata", expected: agreement.id, received: { reference_id: unit?.reference_id ?? null, custom_id: unit?.custom_id ?? null }, matched: agreementIds.length > 0 && agreementIds.every((id) => id === agreement.id) },
    { field: "purchase_unit_amount", expected: amount, received: unit?.amount?.value ?? null, matched: expectedAmount !== null && receivedAmount === expectedAmount },
    { field: "purchase_unit_currency", expected: currency, received: unit?.amount?.currency_code ?? null, matched: currencyCode(unit?.amount?.currency_code) === currencyCode(currency) },
  ].filter((check) => !check.matched);
}

function confirmedCapture(order: PayPalOrder, agreement: SavedAgreement, amount: string, currency: string) {
  if (order.id !== agreement.paypalOrderId || order.status !== "COMPLETED" || !unitMatches(order, agreement, amount, currency)) return null;
  const captures = order.purchase_units?.[0]?.payments?.captures ?? [];
  if (captures.length !== 1) return null;
  const capture = captures[0];
  if (!capture?.id || capture.status !== "COMPLETED" || amountInMinorUnits(capture.amount.value) !== amountInMinorUnits(amount) || currencyCode(capture.amount.currency_code) !== currencyCode(currency)) return null;
  return capture;
}

export function createPaymentService({
  repository,
  paypal,
  isConfigured = () => process.env.PAYPAL_ENV === "sandbox" && Boolean(process.env.PAYPAL_CLIENT_ID?.trim() && process.env.PAYPAL_CLIENT_SECRET?.trim()),
}: { repository: PaymentRepository; paypal: PayPalClient; isConfigured?: () => boolean }) {
  return {
    async createOrder(input: unknown) {
      assertConfigured(isConfigured);
      const parsed = z.object({ agreementId: AgreementIdSchema }).strict().safeParse(input);
      if (!parsed.success) throw new PaymentServiceError(400, "A valid agreement ID is required.", "INVALID_AGREEMENT_ID");
      const agreement = await repository.getById(parsed.data.agreementId);
      if (!agreement) throw new PaymentServiceError(404, "Agreement not found.", "AGREEMENT_NOT_FOUND");
      const { value, currency } = validateAgreement(agreement);
      if (agreement.paymentStatus === "paid") throw new PaymentServiceError(409, "This agreement has already been paid.", "ALREADY_PAID");
      if (agreement.paymentStatus === "capturing") throw new PaymentServiceError(409, "A payment capture is already being verified.", "CAPTURE_IN_PROGRESS");

      if (agreement.paymentStatus === "pending" && agreement.paypalOrderId) {
        return { orderId: agreement.paypalOrderId, status: "pending" as const };
      }

      const reserved = await repository.beginOrderCreation(agreement.id, randomUUID());
      if (!reserved) throw new PaymentServiceError(404, "Agreement not found.", "AGREEMENT_NOT_FOUND");
      if (reserved.paymentStatus === "paid") throw new PaymentServiceError(409, "This agreement has already been paid.", "ALREADY_PAID");
      if (reserved.paymentStatus === "pending" && reserved.paypalOrderId) return { orderId: reserved.paypalOrderId, status: "pending" as const };
      if (reserved.paymentStatus !== "creating") throw new PaymentServiceError(409, "This agreement cannot start a checkout in its current payment state.", "INVALID_PAYMENT_STATE");
      const requestId = await repository.getCreateRequestId(agreement.id);
      if (!requestId) throw new PaymentServiceError(503, "The checkout could not be prepared. Please retry.", "ORDER_RESERVATION_FAILED");

      const created = await paypal.createOrder({ agreementId: agreement.id, title: agreement.title, amount: value, currency, requestId });
      const orderId = OrderIdSchema.safeParse(created.id);
      let verifiedOrder: PayPalOrder | undefined;
      if (orderId.success && created.status === "CREATED") verifiedOrder = await paypal.getOrder(orderId.data);
      const failedChecks = orderVerificationChecks(verifiedOrder, orderId.success ? orderId.data : undefined, created.status, agreement, value, currency);
      if (!orderId.success || created.status !== "CREATED" || !verifiedOrder || verifiedOrder.id !== orderId.data || verifiedOrder.status !== "CREATED" || !unitMatches(verifiedOrder, agreement, value, currency)) {
        console.warn("[TrustBridge PayPal] Created order did not match its saved agreement", JSON.stringify({
          checks: failedChecks,
          createdOrderStatus: created.status,
        }));
        await repository.failOrderCreation(agreement.id, requestId);
        throw new PaymentServiceError(502, "PayPal returned an order that did not match the saved agreement.", "ORDER_VERIFICATION_FAILED");
      }
      const saved = await repository.savePayPalOrder(agreement.id, requestId, orderId.data);
      if (!saved || saved.paymentStatus !== "pending" || saved.paypalOrderId !== orderId.data) {
        throw new PaymentServiceError(409, "The PayPal order could not be linked to this agreement.", "ORDER_STATE_CONFLICT");
      }
      return { orderId: orderId.data, status: "pending" as const };
    },

    async captureOrder(input: unknown) {
      assertConfigured(isConfigured);
      const parsed = z.object({ agreementId: AgreementIdSchema, orderId: OrderIdSchema }).strict().safeParse(input);
      if (!parsed.success) throw new PaymentServiceError(400, "A valid agreement ID and PayPal order ID are required.", "INVALID_CAPTURE_REQUEST");
      const agreement = await repository.getById(parsed.data.agreementId);
      if (!agreement) throw new PaymentServiceError(404, "Agreement not found.", "AGREEMENT_NOT_FOUND");
      const { value, currency } = validateAgreement(agreement);
      if (agreement.paymentStatus === "paid") {
        if (agreement.paypalOrderId !== parsed.data.orderId) throw new PaymentServiceError(409, "This agreement is already paid with a different order.", "ALREADY_PAID");
        return { status: "paid" as const, captureId: agreement.paypalCaptureId, amount: agreement.paymentAmount, currency: agreement.paymentCurrency };
      }
      if (agreement.paypalOrderId !== parsed.data.orderId || !["pending", "capturing"].includes(agreement.paymentStatus)) {
        throw new PaymentServiceError(409, "This PayPal order is not the active order for this agreement.", "ORDER_STATE_CONFLICT");
      }

      const claimed = await repository.claimCapture(agreement.id, parsed.data.orderId, randomUUID());
      if (!claimed || claimed.paymentStatus !== "capturing") throw new PaymentServiceError(409, "This agreement cannot be captured in its current payment state.", "INVALID_PAYMENT_STATE");
      const captureRequestId = await repository.getCaptureRequestId(agreement.id, parsed.data.orderId);
      if (!captureRequestId) throw new PaymentServiceError(503, "The capture could not be prepared. Please retry.", "CAPTURE_RESERVATION_FAILED");

      const approvedOrder = await paypal.getOrder(parsed.data.orderId);
      if (approvedOrder.id !== parsed.data.orderId || !unitMatches(approvedOrder, agreement, value, currency)) {
        await repository.markPaymentFailed(agreement.id, parsed.data.orderId);
        throw new PaymentServiceError(409, "The PayPal order details did not match this agreement.", "ORDER_VERIFICATION_FAILED");
      }

      let captureOrder: PayPalOrder;
      if (approvedOrder.status === "COMPLETED" && approvedOrder.intent === "CAPTURE") captureOrder = approvedOrder;
      else if (approvedOrder.status === "APPROVED" && approvedOrder.intent === "CAPTURE") {
        try {
          captureOrder = await paypal.captureOrder(parsed.data.orderId, captureRequestId);
        } catch (error) {
          const status = (error as { httpStatus?: unknown })?.httpStatus;
          if (typeof status === "number" && status >= 400 && status < 500 && status !== 401 && status !== 403 && status !== 429) {
            await repository.markPaymentFailed(agreement.id, parsed.data.orderId);
            throw new PaymentServiceError(402, "PayPal could not complete the capture. The agreement remains unpaid; you can retry checkout.", "CAPTURE_FAILED");
          }
          throw error;
        }
      } else {
        await repository.releaseCapture(agreement.id, parsed.data.orderId);
        throw new PaymentServiceError(409, "PayPal has not approved this order. Complete buyer approval before capture.", "PAYER_APPROVAL_REQUIRED");
      }

      const capture = confirmedCapture(captureOrder, agreement, value, currency);
      if (!capture) {
        await repository.markPaymentFailed(agreement.id, parsed.data.orderId);
        throw new PaymentServiceError(402, "PayPal did not confirm a completed capture for the saved agreement amount.", "CAPTURE_NOT_CONFIRMED");
      }
      const paid = await repository.markPaid(agreement.id, parsed.data.orderId, capture.id, capture.amount.value, capture.amount.currency_code);
      if (!paid || paid.paymentStatus !== "paid") throw new PaymentServiceError(503, "PayPal confirmed the payment, but the local record could not be updated. Retry capture to reconcile it.", "PAYMENT_RECORD_PENDING");
      return { status: "paid" as const, captureId: capture.id, amount: capture.amount.value, currency: capture.amount.currency_code };
    },

    async cancelOrder(input: unknown) {
      const parsed = z.object({ agreementId: AgreementIdSchema, orderId: OrderIdSchema }).strict().safeParse(input);
      if (!parsed.success) throw new PaymentServiceError(400, "A valid agreement ID and PayPal order ID are required.", "INVALID_CANCEL_REQUEST");
      const agreement = await repository.cancelOrder(parsed.data.agreementId, parsed.data.orderId);
      if (!agreement) throw new PaymentServiceError(404, "Agreement not found.", "AGREEMENT_NOT_FOUND");
      if (agreement.paypalOrderId !== parsed.data.orderId) throw new PaymentServiceError(409, "This is not the active PayPal order for this agreement.", "ORDER_STATE_CONFLICT");
      return { status: agreement.paymentStatus };
    },
  };
}
