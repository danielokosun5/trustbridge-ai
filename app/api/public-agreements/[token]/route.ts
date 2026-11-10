import { NextResponse } from "next/server";
import { z } from "zod";
import { getAgreementRepository } from "@/lib/agreements/repository";
import { hashShareToken, isShareToken, type ShareResponse } from "@/lib/agreements/sharing";
import { sameOriginMutation } from "@/lib/auth/owner-authorization";
import { requestAddress } from "@/lib/http/rate-limit";
import { consumeScopedRateLimit } from "@/lib/auth/owner-session-store";

export const runtime = "nodejs";
const publicHeaders = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" };
const ResponseBody = z.object({ response: z.enum(["accepted", "rejected"]) }).strict();

function unavailable() {
  return NextResponse.json({ error: "This review link is invalid, expired, or no longer available." }, { status: 404, headers: publicHeaders });
}

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  if (!isShareToken(token)) return unavailable();
  try {
    const repository = await getAgreementRepository();
    const result = await repository.resolvePublicShare(hashShareToken(token));
    if (!result || "error" in result) return unavailable();
    return NextResponse.json(result.data, { headers: publicHeaders });
  } catch (error) {
    console.error("Public agreement review lookup failed:", error instanceof Error ? error.message : "Unknown database error");
    return NextResponse.json({ error: "The review is temporarily unavailable." }, { status: 503, headers: publicHeaders });
  }
}

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  if (!sameOriginMutation(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403, headers: publicHeaders });
  const rateSecret = process.env.TRUSTBRIDGE_SESSION_SECRET;
  if (!rateSecret || Buffer.byteLength(rateSecret) < 32) return NextResponse.json({ error: "The review response is temporarily unavailable." }, { status: 503, headers: publicHeaders });
  try {
    if (!await consumeScopedRateLimit("public-response", requestAddress(request), rateSecret, new Date(), 20, 60_000)) {
      return NextResponse.json({ error: "Too many response attempts. Try again shortly." }, { status: 429, headers: publicHeaders });
    }
  } catch {
    return NextResponse.json({ error: "The review response is temporarily unavailable." }, { status: 503, headers: publicHeaders });
  }
  if (!isShareToken(token)) return unavailable();
  let body: unknown;
  try {
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody) > 512) return NextResponse.json({ error: "The response is too large." }, { status: 413, headers: publicHeaders });
    body = JSON.parse(rawBody);
  } catch { return NextResponse.json({ error: "Send a valid response." }, { status: 400, headers: publicHeaders }); }
  const parsed = ResponseBody.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Choose accept or reject." }, { status: 400, headers: publicHeaders });
  try {
    const repository = await getAgreementRepository();
    const result = await repository.respondToShare(hashShareToken(token), parsed.data.response as ShareResponse);
    if ("error" in result) {
      if (result.error === "conflict") return NextResponse.json({ error: "A different response has already been recorded for this link." }, { status: 409, headers: publicHeaders });
      if (result.error === "terms_changed") return NextResponse.json({ error: "The agreement terms changed. Ask the owner for a new review link." }, { status: 410, headers: publicHeaders });
      return unavailable();
    }
    return NextResponse.json({ response: result.response, respondedAt: result.respondedAt, duplicate: result.duplicate }, { headers: publicHeaders });
  } catch (error) {
    console.error("Public agreement response failed:", error instanceof Error ? error.message : "Unknown database error");
    return NextResponse.json({ error: "The response could not be recorded." }, { status: 503, headers: publicHeaders });
  }
}
