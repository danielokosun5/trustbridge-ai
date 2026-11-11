import { z } from "zod";
import type { PayPalCurrency, PayPalOrder } from "./types";
export { PAYPAL_CURRENCIES } from "./types";

export class PayPalApiError extends Error {
  constructor(
    readonly httpStatus: number,
    message = "PayPal request failed",
    readonly providerName?: string,
    readonly debugId?: string,
    readonly issueCodes: string[] = [],
  ) {
    super(message);
    this.name = "PayPalApiError";
  }
}

function safeOrderSummary(order: PayPalOrder) {
  const safeApprovalLinks = order.links?.filter((link) => link.rel === "approve" || link.rel === "payer-action").map((link) => {
    try {
      const parsed = new URL(link.href ?? "");
      return { rel: link.rel, method: link.method ?? null, host: parsed.host, path: parsed.pathname };
    } catch {
      return { rel: link.rel, method: link.method ?? null, host: null, path: null };
    }
  }) ?? [];
  return {
    orderId: order.id,
    status: order.status,
    purchaseUnitCount: order.purchase_units?.length ?? 0,
    purchaseUnits: order.purchase_units?.map((unit) => ({
      reference_id: unit.reference_id ?? null,
      custom_id: unit.custom_id ?? null,
      amount: unit.amount?.value ?? null,
      currency: unit.amount?.currency_code ?? null,
      payeeMerchantId: unit.payee?.merchant_id ?? null,
      payeeEmailPresent: Boolean(unit.payee?.email_address),
    })) ?? [],
    links: order.links?.map(({ rel, method }) => ({ rel: rel ?? null, method: method ?? null })) ?? [],
    approvalLinks: safeApprovalLinks,
    paymentSourceTypes: Object.keys(order.payment_source ?? {}),
  };
}

function parseProviderError(body: unknown) {
  const parsed = z.object({
    name: z.string().max(80).optional(),
    message: z.string().max(500).optional(),
    debug_id: z.string().max(100).optional(),
    details: z.array(z.object({ issue: z.string().max(100).optional() }).passthrough()).optional(),
  }).passthrough().safeParse(body);
  if (!parsed.success) return { message: "PayPal request failed", issueCodes: [] as string[] };
  return {
    message: parsed.data.message ?? "PayPal request failed",
    providerName: parsed.data.name,
    debugId: parsed.data.debug_id,
    issueCodes: [...new Set((parsed.data.details ?? []).flatMap((detail) => detail.issue ? [detail.issue] : []))].slice(0, 8),
  };
}

function safeProviderMessage(message: string | undefined) {
  if (!message) return undefined;
  return message
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[redacted-email]")
    .replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, "[redacted-authorization]")
    .replace(/\b(access[_ -]?token|client[_ -]?secret|authorization)\b\s*[:=]\s*[^,\s]+/gi, "$1=[redacted]")
    .slice(0, 240);
}

export function safePayPalErrorDetails(error: unknown) {
  if (!(error instanceof PayPalApiError)) return { type: error instanceof Error ? error.name : "UnknownError" };
  return {
    type: "PayPalApiError",
    httpStatus: error.httpStatus,
    providerName: error.providerName,
    message: safeProviderMessage(error.message),
    debugId: error.debugId,
    issueCodes: error.issueCodes,
  };
}

const PayPalEnvSchema = z.literal("sandbox");

export function getPayPalConfiguration() {
  const clientId = process.env.PAYPAL_CLIENT_ID?.trim();
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET?.trim();
  const envResult = PayPalEnvSchema.safeParse(process.env.PAYPAL_ENV?.trim());
  return {
    enabled: Boolean(clientId && clientSecret && envResult.success),
    clientId: clientId && envResult.success ? clientId : null,
    env: envResult.success ? "sandbox" as const : null,
  };
}

let cachedAccessToken: string | null = null;
let accessTokenExpiresAt = 0;

async function getAccessToken(fetcher: typeof fetch): Promise<string> {
  const configuration = getPayPalConfiguration();
  const clientId = process.env.PAYPAL_CLIENT_ID?.trim();
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET?.trim();
  if (!configuration.enabled || !clientId || !clientSecret) throw new PayPalApiError(503, "PayPal sandbox is not configured");
  if (cachedAccessToken && Date.now() < accessTokenExpiresAt - 30_000) return cachedAccessToken;

  const response = await fetcher("https://api-m.sandbox.paypal.com/v1/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  if (!response.ok) {
    const providerError = parseProviderError(await response.json().catch(() => null));
    throw new PayPalApiError(response.status, providerError.message, providerError.providerName, providerError.debugId, providerError.issueCodes);
  }
  const result = z.object({ access_token: z.string().min(1), expires_in: z.number().positive() }).safeParse(await response.json());
  if (!result.success) throw new PayPalApiError(502, "PayPal returned an invalid access token response");
  cachedAccessToken = result.data.access_token;
  accessTokenExpiresAt = Date.now() + result.data.expires_in * 1000;
  return cachedAccessToken;
}

export function createPayPalClient(fetcher: typeof fetch = fetch) {
  async function request<T>(path: string, init: RequestInit = {}, requestId?: string): Promise<T> {
    const token = await getAccessToken(fetcher);
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    headers.set("Content-Type", "application/json");
    headers.set("Accept", "application/json");
    if (requestId) headers.set("PayPal-Request-Id", requestId);
    const response = await fetcher(`https://api-m.sandbox.paypal.com${path}`, { ...init, headers, cache: "no-store" });
    const debugId = response.headers.get("paypal-debug-id") ?? response.headers.get("PayPal-Debug-Id") ?? undefined;
    if (!response.ok) {
      const providerError = parseProviderError(await response.json().catch(() => null));
      console.warn("[TrustBridge PayPal] Orders API request failed", JSON.stringify({ method: init.method ?? "GET", path, httpStatus: response.status, debugId: debugId ?? providerError.debugId ?? null, providerName: providerError.providerName ?? null, issueCodes: providerError.issueCodes }));
      throw new PayPalApiError(response.status, providerError.message, providerError.providerName, debugId ?? providerError.debugId, providerError.issueCodes);
    }
    const result = await response.json() as T;
    if (path === "/v2/checkout/orders" && init.method === "POST") {
      const order = result as PayPalOrder;
      console.info("[TrustBridge PayPal] Orders API create response", JSON.stringify({ httpStatus: response.status, debugId: debugId ?? null, ...safeOrderSummary(order) }));
    } else if (path.startsWith("/v2/checkout/orders/") && path.endsWith("/capture") && init.method === "POST") {
      const order = result as PayPalOrder;
      const captures = order.purchase_units?.[0]?.payments?.captures ?? [];
      const capture = captures[0];
      console.info("[TrustBridge PayPal] Orders API capture response", JSON.stringify({
        httpStatus: response.status,
        debugId: debugId ?? null,
        orderId: order.id ?? null,
        orderStatus: order.status ?? null,
        purchaseUnitCount: order.purchase_units?.length ?? 0,
        captureCount: captures.length,
        captureId: capture?.id ?? null,
        captureStatus: capture?.status ?? null,
        captureAmount: capture?.amount?.value ?? null,
        captureCurrency: capture?.amount?.currency_code ?? null,
      }));
    } else if (path.startsWith("/v2/checkout/orders/") && init.method === "GET") {
      const order = result as PayPalOrder;
      console.info("[TrustBridge PayPal] Orders API GET response", JSON.stringify({ httpStatus: response.status, debugId: debugId ?? null, ...safeOrderSummary(order) }));
    }
    return result;
  }

  return {
    createOrder(input: { agreementId: string; title: string; amount: string; currency: PayPalCurrency; requestId: string }) {
      return request<PayPalOrder>("/v2/checkout/orders", {
        method: "POST",
        // PayPal defaults to return=minimal, which only includes id, status, and links.
        // The payment service verifies the echoed agreement ID, amount, and currency.
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          intent: "CAPTURE",
          purchase_units: [{
            reference_id: input.agreementId,
            custom_id: input.agreementId,
            description: input.title.slice(0, 127),
            amount: { currency_code: input.currency, value: input.amount },
          }],
        }),
      }, input.requestId);
    },
    getOrder(orderId: string) {
      return request<PayPalOrder>(`/v2/checkout/orders/${encodeURIComponent(orderId)}`, { method: "GET" });
    },
    captureOrder(orderId: string, requestId: string) {
      return request<PayPalOrder>(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: "{}",
      }, requestId);
    },
  };
}
