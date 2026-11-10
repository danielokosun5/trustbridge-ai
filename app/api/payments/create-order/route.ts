import { NextResponse } from "next/server";
import { getPaymentService } from "@/lib/payments/route-service";
import { PaymentServiceError } from "@/lib/payments/service";
import { safePayPalErrorDetails } from "@/lib/payments/paypal-client";
import { allowRequest, requestAddress } from "@/lib/http/rate-limit";
import { ownerApiError, sameOriginMutation } from "@/lib/auth/owner-authorization";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const authError = await ownerApiError(request);
  if (authError) return authError;
  if (!sameOriginMutation(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  if (!allowRequest(`paypal-create:${requestAddress(request)}`, 12, 60_000)) {
    return NextResponse.json({ error: "Too many checkout attempts. Please wait a minute and try again." }, { status: 429 });
  }
  if (Number(request.headers.get("content-length") ?? 0) > 2048) return NextResponse.json({ error: "The checkout request is too large." }, { status: 413 });
  let input: unknown;
  try { input = await request.json(); } catch { return NextResponse.json({ error: "Send a valid JSON checkout request." }, { status: 400 }); }
  try {
    const service = await getPaymentService();
    return NextResponse.json(await service.createOrder(input));
  } catch (error) {
    if (error instanceof PaymentServiceError) return NextResponse.json({ code: error.code, error: error.message }, { status: error.status });
    console.error("[TrustBridge PayPal] Create-order request failed", safePayPalErrorDetails(error));
    return NextResponse.json({ error: "PayPal sandbox could not create this order. Please retry." }, { status: 502 });
  }
}
