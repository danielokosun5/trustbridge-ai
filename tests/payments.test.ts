import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { createClient, type Client } from "@libsql/client";
import { createAgreementRepository } from "@/lib/agreements/repository";
import { createPaymentService, PaymentServiceError } from "@/lib/payments/service";
import { createPayPalClient, safePayPalErrorDetails } from "@/lib/payments/paypal-client";
import type { PayPalClient, PayPalCurrency, PayPalOrder } from "@/lib/payments/types";

const validAgreement = {
  title: "Brand identity refresh",
  serviceDescription: "Create a refreshed identity system for the buyer's new studio.",
  summary: "A clear identity refresh for the studio launch.",
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

test("PayPal order creation requests a full representation from the sandbox API", async () => {
  const previous = {
    clientId: process.env.PAYPAL_CLIENT_ID,
    clientSecret: process.env.PAYPAL_CLIENT_SECRET,
    environment: process.env.PAYPAL_ENV,
  };
  process.env.PAYPAL_CLIENT_ID = "test-client-id";
  process.env.PAYPAL_CLIENT_SECRET = "test-client-secret";
  process.env.PAYPAL_ENV = "sandbox";
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.endsWith("/v1/oauth2/token")) {
      return new Response(JSON.stringify({ access_token: "test-access-token", expires_in: 300 }), { status: 200 });
    }
    return new Response(JSON.stringify({
      id: "PAYPALORDER123", status: "CREATED", purchase_units: [{
        reference_id: "01234567-89ab-cdef-0123-456789abcdef",
        custom_id: "01234567-89ab-cdef-0123-456789abcdef",
        amount: { value: "10.00", currency_code: "USD" },
        payee: { merchant_id: "SANDBOXMERCHANT123", email_address: "seller@example.test" },
      }],
    }), { status: 201 });
  };
  const originalInfo = console.info;
  const diagnostics: string[] = [];
  console.info = (...args: unknown[]) => diagnostics.push(args.map(String).join(" "));

  try {
    const order = await createPayPalClient(fetcher).createOrder({
      agreementId: "01234567-89ab-cdef-0123-456789abcdef",
      title: "Manual test agreement",
      amount: "10.00",
      currency: "USD",
      requestId: "test-request-id",
    });
    const createCall = calls.find((call) => call.url.endsWith("/v2/checkout/orders"));
    assert.ok(calls[0]?.url.endsWith("/v1/oauth2/token"));
    assert.ok(createCall?.url.startsWith("https://api-m.sandbox.paypal.com/"));
    assert.equal(new Headers(createCall?.init?.headers).get("Prefer"), "return=representation");
    const requestBody = JSON.parse(String(createCall?.init?.body)) as {
      application_context?: unknown;
      purchase_units?: Array<{ reference_id?: string; custom_id?: string; amount?: { value?: string; currency_code?: string } }>;
      payment_source?: unknown;
    };
    assert.deepEqual(requestBody.purchase_units?.[0], {
      reference_id: "01234567-89ab-cdef-0123-456789abcdef",
      custom_id: "01234567-89ab-cdef-0123-456789abcdef",
      description: "Manual test agreement",
      amount: { currency_code: "USD", value: "10.00" },
    });
    assert.equal(requestBody.application_context, undefined);
    assert.equal(requestBody.payment_source, undefined);
    assert.deepEqual(order.purchase_units?.[0]?.amount, { value: "10.00", currency_code: "USD" });
    assert.ok(diagnostics.some((entry) => entry.includes('"payeeMerchantId":"SANDBOXMERCHANT123"')));
    assert.equal(diagnostics.join(" ").includes("seller@example.test"), false);
  } finally {
    console.info = originalInfo;
    if (previous.clientId === undefined) delete process.env.PAYPAL_CLIENT_ID;
    else process.env.PAYPAL_CLIENT_ID = previous.clientId;
    if (previous.clientSecret === undefined) delete process.env.PAYPAL_CLIENT_SECRET;
    else process.env.PAYPAL_CLIENT_SECRET = previous.clientSecret;
    if (previous.environment === undefined) delete process.env.PAYPAL_ENV;
    else process.env.PAYPAL_ENV = previous.environment;
  }
});

test("PayPal API failures retain only safe diagnostic metadata", async () => {
  const previous = {
    clientId: process.env.PAYPAL_CLIENT_ID,
    clientSecret: process.env.PAYPAL_CLIENT_SECRET,
    environment: process.env.PAYPAL_ENV,
  };
  process.env.PAYPAL_CLIENT_ID = "test-client-id";
  process.env.PAYPAL_CLIENT_SECRET = "test-client-secret";
  process.env.PAYPAL_ENV = "sandbox";
  const fetcher: typeof fetch = async (input) => {
    if (String(input).endsWith("/v1/oauth2/token")) {
      return new Response(JSON.stringify({ access_token: "test-access-token", expires_in: 300 }), { status: 200 });
    }
    return new Response(JSON.stringify({
      name: "UNPROCESSABLE_ENTITY",
      message: "The request failed for buyer buyer@example.test; client_secret=must-not-log",
      debug_id: "SAFEDEBUG123",
      details: [{ issue: "INSTRUMENT_DECLINED", description: "sensitive detail intentionally omitted" }],
      access_token: "must-not-appear",
    }), { status: 422 });
  };

  try {
    await assert.rejects(
      createPayPalClient(fetcher).createOrder({
        agreementId: "01234567-89ab-cdef-0123-456789abcdef",
        title: "Manual test agreement",
        amount: "10.00",
        currency: "USD",
        requestId: "test-request-id",
      }),
      (error: unknown) => {
        assert.deepEqual(safePayPalErrorDetails(error), {
          type: "PayPalApiError",
          httpStatus: 422,
          providerName: "UNPROCESSABLE_ENTITY",
          message: "The request failed for buyer [redacted-email]; client_secret=[redacted]",
          debugId: "SAFEDEBUG123",
          issueCodes: ["INSTRUMENT_DECLINED"],
        });
        assert.equal(JSON.stringify(safePayPalErrorDetails(error)).includes("must-not-log"), false);
        return true;
      },
    );
  } finally {
    if (previous.clientId === undefined) delete process.env.PAYPAL_CLIENT_ID;
    else process.env.PAYPAL_CLIENT_ID = previous.clientId;
    if (previous.clientSecret === undefined) delete process.env.PAYPAL_CLIENT_SECRET;
    else process.env.PAYPAL_CLIENT_SECRET = previous.clientSecret;
    if (previous.environment === undefined) delete process.env.PAYPAL_ENV;
    else process.env.PAYPAL_ENV = previous.environment;
  }
});

async function fixture(overrides: { captureAmount?: string; approved?: boolean; createdStatus?: string; createMismatch?: "agreement" | "amount" | "currency" | "custom-missing" | "metadata-conflict" | "amount-format" | "currency-case"; approvalOrderIdMismatch?: boolean } = {}) {
  const dataDirectory = join(process.cwd(), "data");
  mkdirSync(dataDirectory, { recursive: true });
  const directory = mkdtempSync(join(dataDirectory, ".paypal-test-"));
  const client: Client = createClient({ url: pathToFileURL(join(directory, "payments.db")).href });
  const repository = createAgreementRepository(client);
  const saved = await repository.create(validAgreement);
  let approved = overrides.approved ?? true;
  let captureCalls = 0;
  let orderLookups = 0;
  let createStatus = overrides.createdStatus ?? "CREATED";
  const createInputs: Array<{ agreementId: string; title: string; amount: string; currency: PayPalCurrency; requestId: string }> = [];
  const order = (status: string, captureAmount = "1250.00"): PayPalOrder => ({
    id: "PAYPALORDER123",
    status,
    intent: "CAPTURE",
    purchase_units: [{
      reference_id: overrides.createMismatch === "agreement" && status === "CREATED" ? "different-agreement" : saved.id,
      ...(overrides.createMismatch === "custom-missing" && status === "CREATED" ? {} : {
        custom_id: overrides.createMismatch === "metadata-conflict" && status === "CREATED" ? "different-agreement" : saved.id,
      }),
      amount: {
        value: overrides.createMismatch === "amount" && status === "CREATED" ? "10.00" : overrides.createMismatch === "amount-format" && status === "CREATED" ? "1250" : "1250.00",
        currency_code: overrides.createMismatch === "currency" && status === "CREATED" ? "EUR" : overrides.createMismatch === "currency-case" && status === "CREATED" ? "usd" : "USD",
      },
      ...(status === "COMPLETED" ? { payments: { captures: [{ id: "CAPTURE123", status: "COMPLETED", amount: { value: captureAmount, currency_code: "USD" } }] } } : {}),
    }],
  });
  const paypal: PayPalClient = {
    async createOrder(input) { createInputs.push(input); return { id: "PAYPALORDER123", status: createStatus }; },
    async getOrder() {
      orderLookups += 1;
      if (orderLookups === 1) return order("CREATED");
      const found = order(approved ? "APPROVED" : "CREATED");
      if (overrides.approvalOrderIdMismatch) found.id = "OTHERORDER123";
      return found;
    },
    async captureOrder() { captureCalls += 1; return order("COMPLETED", overrides.captureAmount); },
  };
  const service = createPaymentService({ repository, paypal, isConfigured: () => true });
  return {
    saved,
    service,
    repository,
    get captureCalls() { return captureCalls; },
    get orderLookups() { return orderLookups; },
    getCreateInput() { return createInputs[0]; },
    setCreatedStatus(value: string) { createStatus = value; },
    setApproved(value: boolean) { approved = value; },
    async close() {
      await client.close();
      try { rmSync(directory, { recursive: true, force: true }); } catch { /* SQLite may retain a native handle briefly on Windows. */ }
    },
  };
}

test("create order rejects browser-supplied amounts and uses the saved agreement amount", async () => {
  const f = await fixture();
  try {
    await assert.rejects(
      f.service.createOrder({ agreementId: f.saved.id, amount: "0.01" }),
      (error: unknown) => error instanceof PaymentServiceError && error.code === "INVALID_AGREEMENT_ID",
    );
    assert.equal(f.getCreateInput(), undefined);
    const result = await f.service.createOrder({ agreementId: f.saved.id });
    assert.equal(result.orderId, "PAYPALORDER123");
    assert.equal(f.getCreateInput()?.amount, "1250.00");
    assert.equal(f.getCreateInput()?.currency, "USD");
    const stored = await f.service.createOrder({ agreementId: f.saved.id });
    assert.equal(stored.orderId, result.orderId);
  } finally { await f.close(); }
});

test("create order rejects a PayPal response whose agreement, amount, or currency does not match", async () => {
  for (const mismatch of ["agreement", "amount", "currency"] as const) {
    const f = await fixture({ createMismatch: mismatch });
    try {
      await assert.rejects(
        f.service.createOrder({ agreementId: f.saved.id }),
        (error: unknown) => error instanceof PaymentServiceError && error.code === "ORDER_VERIFICATION_FAILED",
      );
      assert.equal(f.getCreateInput()?.amount, "1250.00");
      assert.equal(f.getCreateInput()?.currency, "USD");
      const after = await f.repository.getById(f.saved.id);
      assert.equal(after?.paymentStatus, "failed");
    } finally { await f.close(); }
  }
});

test("PAYER_ACTION_REQUIRED is rejected and does not trigger a GET order lookup", async () => {
  const f = await fixture({ createdStatus: "PAYER_ACTION_REQUIRED" });
  try {
    await assert.rejects(
      f.service.createOrder({ agreementId: f.saved.id }),
      (error: unknown) => error instanceof PaymentServiceError && error.code === "ORDER_VERIFICATION_FAILED",
    );
    assert.equal(f.orderLookups, 0);
    assert.equal((await f.repository.getById(f.saved.id))?.paymentStatus, "failed");
  } finally { await f.close(); }
});

test("create order accepts equivalent amount formatting and a single matching agreement identifier", async () => {
  for (const variation of ["custom-missing", "amount-format", "currency-case"] as const) {
    const f = await fixture({ createMismatch: variation });
    try {
      const result = await f.service.createOrder({ agreementId: f.saved.id });
      assert.equal(result.orderId, "PAYPALORDER123");
      assert.equal((await f.repository.getById(f.saved.id))?.paymentStatus, "pending");
    } finally { await f.close(); }
  }
});

test("create order rejects conflicting agreement identifiers even when one matches", async () => {
  const f = await fixture({ createMismatch: "metadata-conflict" });
  try {
    await assert.rejects(
      f.service.createOrder({ agreementId: f.saved.id }),
      (error: unknown) => error instanceof PaymentServiceError && error.code === "ORDER_VERIFICATION_FAILED",
    );
    assert.equal((await f.repository.getById(f.saved.id))?.paymentStatus, "failed");
  } finally { await f.close(); }
});

test("capture rejects provider order details for a different PayPal order ID", async () => {
  const f = await fixture({ approvalOrderIdMismatch: true });
  try {
    await f.service.createOrder({ agreementId: f.saved.id });
    await assert.rejects(
      f.service.captureOrder({ agreementId: f.saved.id, orderId: "PAYPALORDER123" }),
      (error: unknown) => error instanceof PaymentServiceError && error.code === "ORDER_VERIFICATION_FAILED",
    );
    assert.equal(f.captureCalls, 0);
    assert.notEqual((await f.repository.getById(f.saved.id))?.paymentStatus, "paid");
  } finally { await f.close(); }
});

test("capture requires PayPal approval and persists paid only after a verified capture", async () => {
  const f = await fixture({ approved: false });
  try {
    await f.service.createOrder({ agreementId: f.saved.id });
    await assert.rejects(
      f.service.captureOrder({ agreementId: f.saved.id, orderId: "PAYPALORDER123" }),
      (error: unknown) => error instanceof PaymentServiceError && error.code === "PAYER_APPROVAL_REQUIRED",
    );
    assert.equal(f.captureCalls, 0);
    assert.equal((await f.service.createOrder({ agreementId: f.saved.id })).status, "pending");

    f.setApproved(true);
    const captured = await f.service.captureOrder({ agreementId: f.saved.id, orderId: "PAYPALORDER123" });
    assert.equal(captured.status, "paid");
    assert.equal(captured.captureId, "CAPTURE123");
    assert.equal(f.captureCalls, 1);
    const duplicate = await f.service.captureOrder({ agreementId: f.saved.id, orderId: "PAYPALORDER123" });
    assert.equal(duplicate.status, "paid");
    assert.equal(f.captureCalls, 1);
    const savedPayment = await f.repository.getById(f.saved.id);
    assert.equal(savedPayment?.paymentStatus, "paid");
    assert.equal(savedPayment?.paypalOrderId, "PAYPALORDER123");
    assert.equal(savedPayment?.paypalCaptureId, "CAPTURE123");
    assert.equal(savedPayment?.paymentAmount, "1250.00");
    assert.equal(savedPayment?.paymentCurrency, "USD");
  } finally { await f.close(); }
});

test("a capture amount mismatch never marks the agreement paid", async () => {
  const f = await fixture({ captureAmount: "1251.00" });
  try {
    await f.service.createOrder({ agreementId: f.saved.id });
    await assert.rejects(
      f.service.captureOrder({ agreementId: f.saved.id, orderId: "PAYPALORDER123" }),
      (error: unknown) => error instanceof PaymentServiceError && error.code === "CAPTURE_NOT_CONFIRMED",
    );
    const agreement = await f.repository.getById(f.saved.id);
    assert.equal(agreement?.paymentStatus, "failed");
    assert.equal(agreement?.paypalCaptureId, null);
  } finally { await f.close(); }
});

test("cancelled orders remain unpaid and cannot be captured", async () => {
  const f = await fixture();
  try {
    await f.service.createOrder({ agreementId: f.saved.id });
    const cancelled = await f.service.cancelOrder({ agreementId: f.saved.id, orderId: "PAYPALORDER123" });
    assert.equal(cancelled.status, "cancelled");
    await assert.rejects(
      f.service.captureOrder({ agreementId: f.saved.id, orderId: "PAYPALORDER123" }),
      (error: unknown) => error instanceof PaymentServiceError && error.code === "ORDER_STATE_CONFLICT",
    );
    assert.equal(f.captureCalls, 0);
  } finally { await f.close(); }
});

test("unsupported saved agreement currencies cannot create PayPal orders", async () => {
  const f = await fixture();
  try {
    // The server validates currencies from the persisted agreement before any provider call.
    const badCurrencyService = createPaymentService({
      repository: {
        getById: async () => ({ ...f.saved, currency: "NGN" as const }),
        beginOrderCreation: async () => null,
        failOrderCreation: async () => null,
        savePayPalOrder: async () => null,
        getCreateRequestId: async () => null,
        claimCapture: async () => null,
        getCaptureRequestId: async () => null,
        markPaid: async () => null,
        markPaymentFailed: async () => null,
        releaseCapture: async () => null,
        cancelOrder: async () => null,
      },
      paypal: { createOrder: async () => { throw new Error("Must not call PayPal"); }, getOrder: async () => { throw new Error("Must not call PayPal"); }, captureOrder: async () => { throw new Error("Must not call PayPal"); } },
      isConfigured: () => true,
    });
    await assert.rejects(
      badCurrencyService.createOrder({ agreementId: f.saved.id }),
      (error: unknown) => error instanceof PaymentServiceError && error.code === "UNSUPPORTED_CURRENCY",
    );
  } finally { await f.close(); }
});
