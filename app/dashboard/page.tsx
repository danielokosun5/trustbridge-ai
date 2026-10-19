import Link from "next/link";
import { Activity, ArrowDownLeft, ArrowRight, ArrowUpRight, Bell, ChevronDown, CircleHelp, Clock3, FileCheck2, Plus, Search, ShieldCheck, Sparkles, WalletCards } from "lucide-react";
import { Nav } from "@/components/nav";
import { Button, Card } from "@/components/ui";

const stats = [
  { label: "In active agreements", value: "$0.00", note: "No active agreements yet", icon: FileCheck2, tone: "blue" },
  { label: "Payments received", value: "$0.00", note: "Your first payment starts here", icon: ArrowDownLeft, tone: "green" },
  { label: "Awaiting your review", value: "0", note: "Nothing needs your attention", icon: Clock3, tone: "violet" },
];

export default function Dashboard() {
  return <main className="dashboard-page"><Nav active="dashboard" /><div className="dashboard-wrap">
    <div className="dashboard-topline"><div className="breadcrumb"><span>Workspace</span><span className="crumb-slash">/</span><strong>Overview</strong></div><div className="topline-actions"><button className="icon-button" aria-label="Search"><Search size={17} /></button><button className="icon-button notification-button" aria-label="Notifications"><Bell size={17} /><i /></button><span className="user-avatar">JD</span></div></div>
    <section className="welcome-row"><div><div className="welcome-kicker"><span className="welcome-spark"><Sparkles size={13} /></span> YOUR TRUSTBRIDGE WORKSPACE</div><h1>Good morning, Jordan <span className="wave">✳</span></h1><p>Here’s where your work and agreements come together.</p></div><Button href="/dashboard/new"><Plus size={17} /> New agreement</Button></section>
    <section className="stat-grid">{stats.map(({ label, value, note, icon: Icon, tone }) => <Card className="stat-card" key={label}><div className="stat-top"><span>{label}</span><span className={`stat-icon stat-${tone}`}><Icon size={17} /></span></div><div className="stat-value">{value}</div><p className="stat-note"><span className="stat-note-dot" />{note}</p></Card>)}</section>
    <section className="dashboard-grid"><Card className="transactions-card"><div className="panel-heading"><div><h2>Recent transactions</h2><p>Your latest agreements and payments</p></div><button className="filter-button">All activity <ChevronDown size={14} /></button></div><div className="empty-transactions"><div className="empty-art"><div className="empty-circle"><WalletCards size={24} /></div><span className="empty-spark spark-a">✳</span><span className="empty-spark spark-b">✦</span><span className="empty-dash dash-a" /><span className="empty-dash dash-b" /></div><h3>Your next collaboration starts here</h3><p>When you create an agreement, it’ll show up here alongside every update, milestone, and payment.</p><Button href="/dashboard/new" className="empty-action"><Plus size={15} /> Create your first agreement</Button><div className="secure-footnote"><ShieldCheck size={14} /> Your transactions stay private and secure</div></div></Card>
    <div className="side-stack"><Card className="activity-card"><div className="panel-heading"><div><h2>Activity</h2><p>A little more breathing room.</p></div><span className="activity-icon"><Activity size={17} /></span></div><div className="activity-empty"><div className="activity-line"><span><Clock3 size={15} /></span></div><p>No updates just yet</p><small>Agreement updates and payment activity will appear here.</small></div></Card><Card className="help-card"><div className="help-icon"><CircleHelp size={18} /></div><div><h3>New to TrustBridge?</h3><p>See how a clear agreement can make your next project feel easier.</p><Link href="/#how-it-works">Take a quick look <ArrowRight size={14} /></Link></div></Card></div></section>
    <footer className="dashboard-footer"><span>© 2026 TrustBridge AI</span><span><ShieldCheck size={13} /> A clearer way to work together</span><Link href="/#how-it-works">How it works <ArrowUpRight size={13} /></Link></footer>
  </div></main>;
}
