import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui";
import { ownerAuthConfigured } from "@/lib/auth/owner-session";

export const metadata: Metadata = { title: "Owner sign in · TrustBridge AI", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  const configured = ownerAuthConfigured();
  const loginFailed = params.error === "invalid";
  const loginLimited = params.error === "limited";
  return <main className="owner-auth-page"><Card className="owner-auth-card">
    <span className="owner-auth-mark"><ShieldCheck size={22} /></span>
    <p className="welcome-kicker">PRIVATE WORKSPACE</p><h1>Owner sign in</h1>
    <p className="owner-auth-copy">Sign in to view and manage this workspace’s agreement records.</p>
    {!configured ? <div className="owner-auth-message" role="alert">Owner access is not configured. Set TRUSTBRIDGE_OWNER_USERNAME, TRUSTBRIDGE_OWNER_PASSWORD, and a 32-character TRUSTBRIDGE_SESSION_SECRET on the server, then restart the app.</div> : <form className="owner-auth-form" action="/api/auth/login" method="post">
      <label>Username<input name="username" autoComplete="username" required maxLength={120} /></label>
      <label>Password<input name="password" type="password" autoComplete="current-password" required maxLength={256} /></label>
      {loginFailed && <p className="owner-auth-message" role="alert">The username or password was incorrect.</p>}{loginLimited && <p className="owner-auth-message" role="alert">Too many sign-in attempts. Wait 15 minutes and try again.</p>}
      <button className="button button-primary" type="submit">Sign in</button>
    </form>}
    <p className="owner-auth-footnote">Counterparty review links do not require an owner account.</p>
  </Card></main>;
}
