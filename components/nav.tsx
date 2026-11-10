import Link from "next/link";
import { ArrowUpRight, ShieldCheck } from "lucide-react";

export function Nav({ active }: { active?: "home" | "dashboard" | "agreements" }) {
  return <header className="site-header"><div className="nav-wrap">
    <Link href="/" className="brand"><span className="brand-mark"><ShieldCheck size={20} strokeWidth={2.2} /></span><span>trustbridge<span className="brand-ai">.ai</span></span></Link>
    <nav className="nav-links" aria-label="Main navigation">
      <Link className={active === "home" ? "nav-active" : ""} href="/#how-it-works">How it works</Link>
      <Link className={active === "dashboard" ? "nav-active" : ""} href="/dashboard">Dashboard</Link>
      <Link className={active === "agreements" ? "nav-active" : ""} href="/dashboard/agreements">Agreements</Link>
    </nav>
    <div className="nav-actions"><Link href="/dashboard" className="nav-cta">Open dashboard <ArrowUpRight size={15} /></Link>{active !== "home" && <form action="/api/auth/logout" method="post"><button className="nav-logout" type="submit">Sign out</button></form>}</div>
  </div></header>;
}
