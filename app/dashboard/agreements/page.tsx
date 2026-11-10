import Link from "next/link";
import { ArrowLeft, ArrowRight, FileCheck2, Plus, Search } from "lucide-react";
import { Nav } from "@/components/nav";
import { Badge, Button, Card } from "@/components/ui";
import { getAgreementRepository } from "@/lib/agreements/repository";
import { agreementDraftLabel, isManualAgreementDraft } from "@/lib/agreements/manual-draft";
import { filterAgreementsByQuery } from "@/lib/agreements/search";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const formatAmount = (amount: string, currency: string) => new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(amount));
const formatDate = (value: string) => new Intl.DateTimeFormat("en", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(`${value.slice(0, 10)}T00:00:00.000Z`));

export default async function AgreementListPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const params = await searchParams;
  const rawQuery = Array.isArray(params.q) ? params.q[0] : params.q;
  const query = rawQuery?.trim().slice(0, 120) ?? "";
  const agreements = await (async () => {
    try {
      const repository = await getAgreementRepository();
      return { data: await repository.list(), failed: false };
    } catch (error) {
      console.error("Agreement page could not load records:", error instanceof Error ? error.message : "Unknown database error");
      return { data: [], failed: true };
    }
  })();
  const matchingAgreements = filterAgreementsByQuery(agreements.data, query);

  return <main className="dashboard-page"><Nav active="agreements" /><div className="dashboard-wrap agreements-page">
    <Link className="back-link" href="/dashboard"><ArrowLeft size={15} /> Back to workspace</Link>
    <div className="agreements-page-heading"><div><div className="welcome-kicker"><FileCheck2 size={13} /> YOUR AGREEMENT RECORD</div><h1>Agreements</h1><p>Find saved terms, review recorded responses, and check payment status. Open an agreement to share a read-only review link.</p></div><Button href="/dashboard/new"><Plus size={16} /> New agreement</Button></div>
    {!agreements.failed && <form className="agreement-search" action="/dashboard/agreements" method="get" role="search"><label htmlFor="agreement-search-input">Search saved agreements</label><div className="agreement-search-controls"><Search size={16} aria-hidden="true" /><input id="agreement-search-input" name="q" type="search" maxLength={120} value={query} placeholder="Title, buyer, seller, or agreement details" /><Button type="submit" variant="secondary">Search</Button>{query && <Link className="agreement-search-clear" href="/dashboard/agreements">Clear</Link>}</div><p>Search titles, party names, service details, deliverables, and acceptance criteria.</p></form>}
    {agreements.failed ? <Card className="list-empty"><div className="aside-icon"><FileCheck2 size={18} /></div><h2>Agreements couldn’t load</h2><p>Check the database connection or configuration, then reload this page.</p></Card> : matchingAgreements.length === 0 ? <Card className="list-empty"><div className="empty-circle"><FileCheck2 size={22} /></div><h2>{query ? "No matching agreements" : "Your agreement record starts here"}</h2><p>{query ? `No saved agreement matched “${query}”. Try another title, party name, or term.` : "Saved manual and AI-assisted drafts will appear here with their status and key details."}</p>{query ? <Button href="/dashboard/agreements" variant="secondary">Clear search</Button> : <Button href="/dashboard/new">Create an agreement <ArrowRight size={15} /></Button>}</Card> : <><p className="agreement-search-count">{query ? `${matchingAgreements.length} matching agreement${matchingAgreements.length === 1 ? "" : "s"}` : `${matchingAgreements.length} saved agreement${matchingAgreements.length === 1 ? "" : "s"}`}</p><div className="agreement-list">{matchingAgreements.map((agreement) => <Link href={`/dashboard/agreements/${agreement.id}`} key={agreement.id} className="agreement-list-link"><Card className="agreement-list-card"><div className="agreement-list-icon"><FileCheck2 size={18} /></div><div className="agreement-list-main"><div className="agreement-list-title-row"><h2>{agreement.title}</h2><span className="agreement-list-badges"><Badge tone={isManualAgreementDraft(agreement.summary) ? "muted" : "violet"}>{agreementDraftLabel(agreement.summary)}</Badge><Badge tone={agreement.paymentStatus === "paid" ? "green" : agreement.paymentStatus === "creating" || agreement.paymentStatus === "pending" || agreement.paymentStatus === "capturing" ? "violet" : "muted"}>{agreement.paymentStatus === "paid" ? "Paid" : agreement.paymentStatus === "creating" ? "Creating PayPal order" : agreement.paymentStatus === "pending" ? "Awaiting buyer approval" : agreement.paymentStatus === "capturing" ? "Verifying capture" : agreement.paymentStatus === "cancelled" ? "Cancelled" : agreement.paymentStatus === "failed" ? "Payment failed" : "Unpaid"}</Badge></span></div><p>{agreement.buyerName} <span>and</span> {agreement.sellerName}</p><div className="agreement-list-meta"><span>Due {formatDate(agreement.deadline)}</span><span>Saved {formatDate(agreement.createdAt)}</span></div></div><strong className="agreement-list-amount">{formatAmount(agreement.totalAmount, agreement.currency)}</strong><ArrowRight size={16} className="agreement-list-arrow" /></Card></Link>)}</div></>}
    <p className="builder-caption">Create an optional, time-limited review link from an agreement detail page. A link holder can record one response; the response does not verify their identity or change payment status.</p>
  </div></main>;
}
