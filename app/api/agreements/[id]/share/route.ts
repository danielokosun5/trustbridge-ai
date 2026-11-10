import { NextResponse } from "next/server";
import { z } from "zod";
import { ownerApiError, sameOriginMutation } from "@/lib/auth/owner-authorization";
import { getAgreementRepository } from "@/lib/agreements/repository";
import { createShareToken, hashShareToken } from "@/lib/agreements/sharing";
import { allowRequest, requestAddress } from "@/lib/http/rate-limit";

export const runtime = "nodejs";
const Params = z.object({ id: z.string().uuid() });
const Body = z.object({ expiresInDays: z.number().int().min(1).max(30) }).strict();

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const authError = await ownerApiError(request);
  if (authError) return authError;
  if (!sameOriginMutation(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  if (!allowRequest(`share-create:${requestAddress(request)}`, 10, 60_000)) return NextResponse.json({ error: "Too many link requests. Please try again shortly." }, { status: 429 });
  const params = Params.safeParse(await context.params);
  if (!params.success) return NextResponse.json({ error: "Agreement not found." }, { status: 404 });
  let body: unknown;
  try {
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody) > 1024) return NextResponse.json({ error: "The request is too large." }, { status: 413 });
    body = JSON.parse(rawBody);
  } catch { return NextResponse.json({ error: "Send valid JSON." }, { status: 400 }); }
  const input = Body.safeParse(body);
  if (!input.success) return NextResponse.json({ error: "Choose an expiration from 1 to 30 days." }, { status: 400 });

  try {
    const repository = await getAgreementRepository();
    const token = createShareToken();
    const expiresAt = new Date(Date.now() + input.data.expiresInDays * 24 * 60 * 60 * 1000).toISOString();
    const share = await repository.createShare(params.data.id, hashShareToken(token), expiresAt);
    if (!share) return NextResponse.json({ error: "Agreement not found." }, { status: 404 });
    const response = NextResponse.json({ url: `/share/${token}`, expiresAt: share.expiresAt }, { status: 201 });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    console.error("Agreement share creation failed:", error instanceof Error ? error.message : "Unknown database error");
    return NextResponse.json({ error: "The review link could not be created." }, { status: 503 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const authError = await ownerApiError(request);
  if (authError) return authError;
  if (!sameOriginMutation(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const params = Params.safeParse(await context.params);
  if (!params.success) return NextResponse.json({ error: "Agreement not found." }, { status: 404 });
  try {
    const repository = await getAgreementRepository();
    const agreement = await repository.getById(params.data.id);
    if (!agreement) return NextResponse.json({ error: "Agreement not found." }, { status: 404 });
    const revoked = await repository.revokeShares(params.data.id);
    return NextResponse.json({ revoked }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Agreement share revocation failed:", error instanceof Error ? error.message : "Unknown database error");
    return NextResponse.json({ error: "The review link could not be revoked." }, { status: 503 });
  }
}
