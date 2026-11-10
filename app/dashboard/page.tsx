import Link from "next/link";
import { ArrowDownLeft, ArrowRight, ArrowUpRight, Check, ChevronRight, CircleHelp, Clock3, FileCheck2, Plus, ShieldCheck, Sparkles, WalletCards } from "lucide-react";
import { Nav } from "@/components/nav";
import { Badge, Button, Card } from "@/components/ui";
import { getAgreementRepository } from "@/lib/agreements/repository";
import type { SavedAgreement } from "@/lib/agreements/schema";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const formatAmount = (amount: string, currency: string) => new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(amount));
const formatDate = (value: string) => new Intl.DateTimeFormat("en", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${value.slice(0, 10)}T00:00:00.000Z`));
const paymentLabel = (status: SavedAgreement["paymentStatus"]) => status === "paid" ? "Paid" : status === "creating" ? "Creating PayPal order" : status === "pending" ? "Awaiting buyer approval" : status === "capturing" ? "Verifying capture" : status === "cancelled" ? "Cancelled" : status === "failed" ? "Payment failed" : "Unpaid";

export default async function Dashboard() {
  let agreements: SavedAgreement[] = [];
  let databaseFailed = false;
  try {
    const repository = await getAgreementRepository();
    agreements = await repository.list();
  } catch (error) {
    databaseFailed = true;
    console.error("Dashboard agreements failed to load:", error instanceof Error ? error.message : "Unknown database error");
  }

  const recent = agreements.slice(0, 5);
  const paidCount = agreements.filter((agreement) => agreement.paymentStatus === "paid").length;
  const paymentInProgressCount = agreements.filter((agreement) => agreement.paymentStatus === "creating" || agreement.paymentStatus === "pending" || agreement.paymentStatus === "capturing").length;
  const stats = [
    { label: "Agreements saved", value: databaseFailed ? "—" : String(agreements.length), note: databaseFailed ? "Unavailable — database could not be read" : agreements.length ? "Saved in this workspace" : "No saved agreements yet", icon: FileCheck2, tone: "blue" },
    { label: "Paid agreements", value: databaseFailed ? "—" : String(paidCount), note: databaseFailed ? "Unavailable — database could not be read" : paidCount ? "Capture confirmed by the server" : "No confirmed payments yet", icon: ArrowDownLeft, tone: "green" },
    { label: "Payments in progress", value: databaseFailed ? "—" : String(paymentInProgressCount), note: databaseFailed ? "Unavailable — database could not be read" : "Orders awaiting approval or server verification", icon: Clock3, tone: "violet" },
  ];

  return <main className="dashboard-page"><Nav active="dashboard" /><div className="dashboard-wrap">
    <div className="dashboard-topline"><div className="breadcrumb"><span>Workspace</span><span className="crumb-slash">/</span><strong>Overview</strong></div></div>
    <section className="welcome-row"><div><div className="welcome-kicker"><span className="welcome-spark"><Sparkles size={13} /></span> YOUR TRUSTBRIDGE WORKSPACE</div><h1>Your workspace</h1><p>Create an AI-assisted draft when OpenAI access and credits are available, or save a manual draft without an AI request. Your saved agreements and activity appear here.</p></div><Button href="/dashboard/new"><Plus size={17} /> New agreement</Button></section>
    <section className="stat-grid">{stats.map(({ label, value, note, icon: Icon, tone }) => <Card className="stat-card" key={label}><div className="stat-top"><span>{label}</span><span className={`stat-icon stat-${tone}`}><Icon size={17} /></span></div><div className="stat-value">{value}</div><p className="stat-note"><span className="stat-note-dot" />{note}</p></Card>)}</section>
    <section className="dashboard-grid"><Card className="transactions-card"><div className="panel-heading"><div><h2>Recent agreements</h2><p>Saved terms and their current payment status</p></div><Link href="/dashboard/agreements" className="filter-button">All agreements <ChevronRight size={14} /></Link></div>
      {databaseFailed ? <div className="empty-transactions"><div className="empty-circle"><WalletCards size={24} /></div><h3>Your agreements couldn’t load</h3><p>Check the database connection or configuration, then refresh this page.</p></div> : recent.length === 0 ? <div className="empty-transactions"><div className="empty-art"><div className="empty-circle"><WalletCards size={24} /></div><span className="empty-spark spark-a">✳</span><span className="empty-spark spark-b">✦</span><span className="empty-dash dash-a" /><span className="empty-dash dash-b" /></div><h3>Your workspace is ready</h3><p>Create an agreement to see its saved terms and payment status here. Manual drafts do not require an AI request.</p><Button href="/dashboard/new" className="empty-action"><Plus size={15} /> Create your first agreement</Button><div className="secure-footnote"><ShieldCheck size={14} /> Agreement data stays in your configured database</div></div> : <div className="recent-agreements">{recent.map((agreement) => <Link className="recent-agreement-row" href={`/dashboard/agreements/${agreement.id}`} key={agreement.id}><span className="recent-agreement-icon"><FileCheck2 size={15} /></span><span className="recent-agreement-main"><strong>{agreement.title}</strong><small>{agreement.buyerName} <span>with</span> {agreement.sellerName} · Due {formatDate(agreement.deadline)}</small></span><span className="recent-agreement-value">{formatAmount(agreement.totalAmount, agreement.currency)}</span><Badge tone={agreement.paymentStatus === "paid" ? "green" : agreement.paymentStatus === "pending" || agreement.paymentStatus === "capturing" ? "violet" : "muted"}>{paymentLabel(agreement.paymentStatus)}</Badge><ArrowRight size={14} className="recent-agreement-arrow" /></Link>)}</div>}
    </Card>
    <div className="side-stack"><Card className="activity-card"><div className="panel-heading"><div><h2>Recent saves</h2><p>Agreements most recently added</p></div><span className="activity-icon"><Clock3 size={17} /></span></div>{recent.length === 0 ? <div className="activity-empty"><div className="activity-line"><span><Clock3 size={15} /></span></div><div><p>No saved agreements yet</p><small>New agreements will appear here.</small></div></div> : <div className="activity-feed">{recent.slice(0, 3).map((agreement) => <Link href={`/dashboard/agreements/${agreement.id}`} className="activity-feed-row" key={agreement.id}><span className="activity-feed-dot"><Check size={11} /></span><span><strong>{agreement.title}</strong><small>Saved {formatDate(agreement.createdAt)}</small></span></Link>)}</div>}</Card><Card className="help-card"><div className="help-icon"><CircleHelp size={18} /></div><div><h3>Review every draft before sharing</h3><p>AI drafts need an OpenAI API account with available credits. Manual drafts work without an AI request.</p><Link href="/dashboard/agreements">View saved agreements <ArrowRight size={14} /></Link></div></Card></div></section>
    <footer className="dashboard-footer"><span>© 2026 TrustBridge AI</span><span><ShieldCheck size={13} /> Private to this installation</span><Link href="/#how-it-works">How it works <ArrowUpRight size={13} /></Link></footer>
  </div></main>;
}
