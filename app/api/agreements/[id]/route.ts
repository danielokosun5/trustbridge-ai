import { NextResponse } from "next/server";
import { z } from "zod";
import { getAgreementRepository } from "@/lib/agreements/repository";
import { ownerApiError } from "@/lib/auth/owner-authorization";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const authError = await ownerApiError(_request);
  if (authError) return authError;
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Agreement not found." }, { status: 404 });
  try {
    const repository = await getAgreementRepository();
    const agreement = await repository.getById(id);
    return agreement
      ? NextResponse.json({ agreement }, { headers: { "Cache-Control": "private, no-store" } })
      : NextResponse.json({ error: "Agreement not found." }, { status: 404, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Agreement lookup failed:", error instanceof Error ? error.message : "Unknown database error");
    return NextResponse.json({ error: "The agreement database is unavailable." }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
