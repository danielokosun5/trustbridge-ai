import { NextResponse } from "next/server";
import { getPaymentService } from "@/lib/payments/route-service";
import { PaymentServiceError } from "@/lib/payments/service";
import { allowRequest, requestAddress } from "@/lib/http/rate-limit";
import { ownerApiError, sameOriginMutation } from "@/lib/auth/owner-authorization";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const authError = await ownerApiError(request);
  if (authError) return authError;
  if (!sameOriginMutation(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  if (!allowRequest(`paypal-cancel:${requestAddress(request)}`, 20, 60_000)) {
    return NextResponse.json({ error: "Too many checkout requests. Please wait a minute and try again." }, { status: 429 });
  }
  if (Number(request.headers.get("content-length") ?? 0) > 2048) return NextResponse.json({ error: "The cancellation request is too large." }, { status: 413 });
  let input: unknown;
  try { input = await request.json(); } catch { return NextResponse.json({ error: "Send a valid JSON cancellation request." }, { status: 400 }); }
  try {
    const service = await getPaymentService();
    return NextResponse.json(await service.cancelOrder(input));
  } catch (error) {
    if (error instanceof PaymentServiceError) return NextResponse.json({ code: error.code, error: error.message }, { status: error.status });
    return NextResponse.json({ error: "The checkout cancellation could not be recorded." }, { status: 503 });
  }
}
