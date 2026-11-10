import { NextResponse } from "next/server";
import { z } from "zod";
import { ownerApiError } from "@/lib/auth/owner-authorization";
import { getAgreementRepository } from "@/lib/agreements/repository";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const authError = await ownerApiError(request);
  if (authError) return authError;
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Agreement not found." }, { status: 404 });
  try {
    const repository = await getAgreementRepository();
    if (!await repository.getById(id)) return NextResponse.json({ error: "Agreement not found." }, { status: 404 });
    return NextResponse.json({ activity: await repository.listActivity(id) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Agreement activity lookup failed:", error instanceof Error ? error.message : "Unknown database error");
    return NextResponse.json({ error: "Agreement activity is unavailable." }, { status: 503 });
  }
}
