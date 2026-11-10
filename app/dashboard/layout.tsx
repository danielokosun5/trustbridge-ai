import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { OWNER_SESSION_COOKIE, ownerAuthConfigured, verifyOwnerSession } from "@/lib/auth/owner-session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function PrivateDashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  if (!ownerAuthConfigured() || !await verifyOwnerSession(cookieStore.get(OWNER_SESSION_COOKIE)?.value)) redirect("/login");
  return children;
}
