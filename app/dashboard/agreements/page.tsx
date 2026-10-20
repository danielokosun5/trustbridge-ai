import Link from "next/link";
import { ArrowLeft, ArrowRight, FileCheck2, Plus } from "lucide-react";
import { Nav } from "@/components/nav";
import { Badge, Button, Card } from "@/components/ui";
import { getAgreementRepository } from "@/lib/agreements/repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const formatAmount = (amount: string, currency: string) => new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(amount));
const formatDate = (value: string) => new Intl.DateTimeFormat("en", { year: "numeric", month: "short", day: "numeric" }).format(new Date(value));

export default async function AgreementListPage() {
  const agreements = await (async () => {
    try {
      const repository = await getAgreementRepository();
      return { data: await repository.list(), failed: false };
    } catch (error) {
      console.error("Agreement page could not load records:", error instanceof Error ? error.message : "Unknown database error");
      return { data: [], failed: true };
    }
  })();

  return <main className="dashboard-page"><Nav active="agreements" /><div className="dashboard-wrap agreements-page">
    <Link className="back-link" href="/dashboard"><ArrowLeft size={15} /> Back to workspace</Link>
    <div className="agreements-page-heading"><div><div className="welcome-kicker"><FileCheck2 size={13} /> YOUR SHARED RECORD</div><h1>Agreements</h1><p>Saved drafts and their details, together in one place.</p></div><Button href="/dashboard/new"><Plus size={16} /> New agreement</Button></div>
    {agreements.failed ? <Card className="list-empty"><div className="aside-icon"><FileCheck2 size={18} /></div><h2>Agreements couldn’t load</h2><p>Check your database settings and local write permissions, then reload this page.</p></Card> : agreements.data.length === 0 ? <Card className="list-empty"><div className="empty-circle"><FileCheck2 size={22} /></div><h2>Your agreement record starts here</h2><p>Once you review and save an AI-assisted draft, it’ll be listed here with its status and key details.</p><Button href="/dashboard/new">Create an agreement <ArrowRight size={15} /></Button></Card> : <div className="agreement-list">{agreements.data.map((agreement) => <Link href={`/dashboard/agreements/${agreement.id}`} key={agreement.id} className="agreement-list-link"><Card className="agreement-list-card"><div className="agreement-list-icon"><FileCheck2 size={18} /></div><div className="agreement-list-main"><div className="agreement-list-title-row"><h2>{agreement.title}</h2><Badge tone="green">Saved</Badge></div><p>{agreement.buyerName} <span>and</span> {agreement.sellerName}</p><div className="agreement-list-meta"><span>Due {formatDate(agreement.deadline)}</span><span>Saved {formatDate(agreement.createdAt)}</span></div></div><strong className="agreement-list-amount">{formatAmount(agreement.totalAmount, agreement.currency)}</strong><ArrowRight size={16} className="agreement-list-arrow" /></Card></Link>)}</div>}
    <p className="builder-caption">Agreements are stored in this application’s database. They are not shared between people until authentication and collaboration are implemented.</p>
  </div></main>;
}
