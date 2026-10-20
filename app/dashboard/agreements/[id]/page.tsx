import Link from "next/link";
import { ArrowLeft, ArrowUpRight, CalendarDays, Check, FileCheck2, RotateCcw, ShieldCheck, UsersRound } from "lucide-react";
import { notFound } from "next/navigation";
import { Nav } from "@/components/nav";
import { Badge, Button, Card } from "@/components/ui";
import { getAgreementRepository } from "@/lib/agreements/repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const formatAmount = (amount: string, currency: string) => new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(amount));
const formatDate = (value: string) => new Intl.DateTimeFormat("en", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(`${value.slice(0, 10)}T00:00:00.000Z`));

export default async function AgreementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let agreement;
  try {
    const repository = await getAgreementRepository();
    agreement = await repository.getById(id);
  } catch (error) {
    console.error("Agreement detail could not load:", error instanceof Error ? error.message : "Unknown database error");
    return <main className="dashboard-page"><Nav active="agreements" /><div className="dashboard-wrap agreements-page"><Card className="list-empty"><h2>Agreement unavailable</h2><p>The database could not be reached. Check the database configuration and try again.</p><Button href="/dashboard/agreements">Back to agreements</Button></Card></div></main>;
  }
  if (!agreement) notFound();

  return <main className="dashboard-page"><Nav active="agreements" /><div className="dashboard-wrap agreements-page agreement-detail-page">
    <Link className="back-link" href="/dashboard/agreements"><ArrowLeft size={15} /> All agreements</Link>
    <div className="detail-heading"><div><div className="welcome-kicker"><FileCheck2 size={13} /> AGREEMENT RECORD</div><h1>{agreement.title}</h1><p>Saved {formatDate(agreement.createdAt)}</p></div><Badge tone="green">Saved</Badge></div>
    <div className="agreement-detail-grid"><div className="detail-main-column"><Card className="detail-card"><div className="detail-section-heading"><div className="detail-section-icon"><FileCheck2 size={17} /></div><div><h2>Agreement summary</h2><p>The AI-assisted draft, reviewed and saved by you</p></div></div><p className="detail-summary">{agreement.summary}</p><div className="detail-divider" /><p className="eyebrow">SERVICE DESCRIPTION</p><p className="detail-copy">{agreement.serviceDescription}</p><div className="detail-divider" /><p className="eyebrow">DELIVERABLES</p><ul className="detail-list">{agreement.deliverables.map((item, index) => <li key={`${item}-${index}`}><span><Check size={12} /></span>{item}</li>)}</ul><div className="detail-divider" /><p className="eyebrow">ACCEPTANCE CRITERIA</p>{agreement.acceptanceCriteria.length ? <ul className="detail-list">{agreement.acceptanceCriteria.map((item, index) => <li key={`${item}-${index}`}><span><Check size={12} /></span>{item}</li>)}</ul> : <p className="detail-muted">No acceptance criteria were listed.</p>}{agreement.additionalTerms && <><div className="detail-divider" /><p className="eyebrow">ADDITIONAL TERMS</p><p className="detail-copy">{agreement.additionalTerms}</p></>}</Card></div>
      <div className="detail-side-column"><Card className="detail-card detail-terms-card"><div className="detail-section-heading"><div className="detail-section-icon detail-terms-icon"><ShieldCheck size={17} /></div><div><h2>Key terms</h2><p>Confirm details with the other party</p></div></div><div className="detail-amount-block"><span>Total agreed amount</span><strong>{formatAmount(agreement.totalAmount, agreement.currency)}</strong></div><div className="detail-meta-row"><span><CalendarDays size={14} /> Deadline</span><strong>{formatDate(agreement.deadline)}</strong></div><div className="detail-meta-row"><span><RotateCcw size={14} /> Included revisions</span><strong>{agreement.includedRevisions}</strong></div><div className="detail-divider" /><p className="eyebrow">PARTIES</p><div className="detail-person"><span className="party-avatar buyer-avatar"><UsersRound size={14} /></span><span><small>Buyer</small><strong>{agreement.buyerName}</strong></span></div><div className="detail-person"><span className="party-avatar seller-avatar"><UsersRound size={14} /></span><span><small>Seller</small><strong>{agreement.sellerName}</strong></span></div></Card><Card className="detail-notice"><ShieldCheck size={16} /><p>This saved record is private to this installation. Authentication, signatures, and payments are not part of this milestone.</p></Card></div>
    </div>
    <div className="detail-footer-actions"><Link className="cancel-link" href="/dashboard/agreements">Back to agreement list</Link><Link href="/dashboard" className="detail-dashboard-link">Workspace <ArrowUpRight size={14} /></Link></div>
  </div></main>;
}
