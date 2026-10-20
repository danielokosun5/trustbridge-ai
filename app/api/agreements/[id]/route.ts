import { NextResponse } from "next/server";
import { z } from "zod";
import { getAgreementRepository } from "@/lib/agreements/repository";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Agreement not found." }, { status: 404 });
  try {
    const repository = await getAgreementRepository();
    const agreement = await repository.getById(id);
    return agreement
      ? NextResponse.json({ agreement })
      : NextResponse.json({ error: "Agreement not found." }, { status: 404 });
  } catch (error) {
    console.error("Agreement lookup failed:", error instanceof Error ? error.message : "Unknown database error");
    return NextResponse.json({ error: "The agreement database is unavailable." }, { status: 503 });
  }
}
