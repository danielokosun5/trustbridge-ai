import { NextResponse } from "next/server";
import { getAgreementRepository } from "@/lib/agreements/repository";
import { AgreementContentSchema } from "@/lib/agreements/schema";
import { allowRequest, requestAddress } from "@/lib/http/rate-limit";
import { ownerApiError, sameOriginMutation } from "@/lib/auth/owner-authorization";

export const runtime = "nodejs";

const privateHeaders = { "Cache-Control": "private, no-store" };
const databaseError = () => NextResponse.json({ error: "The agreement database is unavailable. Check the database configuration and local write permissions." }, { status: 503, headers: privateHeaders });

export async function GET(request: Request) {
  const authError = await ownerApiError(request);
  if (authError) return authError;
  try {
    const repository = await getAgreementRepository();
    return NextResponse.json({ agreements: await repository.list() }, { headers: privateHeaders });
  } catch (error) {
    console.error("Agreement list failed:", error instanceof Error ? error.message : "Unknown database error");
    return databaseError();
  }
}

export async function POST(request: Request) {
  const authError = await ownerApiError(request);
  if (authError) return authError;
  if (!sameOriginMutation(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  if (!allowRequest(`save:${requestAddress(request)}`, 20, 60_000)) {
    return NextResponse.json({ error: "Too many save requests. Please wait a minute and try again." }, { status: 429 });
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 32_000) return NextResponse.json({ error: "The agreement is too large." }, { status: 413 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send the agreement as valid JSON." }, { status: 400 });
  }

  const input = AgreementContentSchema.safeParse(body);
  if (!input.success) {
    return NextResponse.json({ error: "Check the agreement details and try again.", issues: input.error.issues.map(({ path, message }) => ({ path: path.join("."), message })) }, { status: 400 });
  }

  try {
    const repository = await getAgreementRepository();
    return NextResponse.json({ agreement: await repository.create(input.data) }, { status: 201 });
  } catch (error) {
    console.error("Agreement save failed:", error instanceof Error ? error.message : "Unknown database error");
    return NextResponse.json({ error: "The agreement could not be saved. Check the database configuration and try again." }, { status: 503 });
  }
}
