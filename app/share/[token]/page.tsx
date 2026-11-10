import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarDays, Check, FileCheck2, RotateCcw, ShieldCheck, UsersRound } from "lucide-react";
import { Card, Badge } from "@/components/ui";
import { getAgreementRepository } from "@/lib/agreements/repository";
import { hashShareToken, isShareToken } from "@/lib/agreements/sharing";
import { CounterpartyResponse } from "@/components/counterparty-response";
import { agreementDraftLabel, isManualAgreementDraft } from "@/lib/agreements/manual-draft";

export const metadata: Metadata = { title: "Agreement review · TrustBridge AI", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const formatAmount = (amount: string, currency: string) => new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(amount));
const formatDate = (value: string) => new Intl.DateTimeFormat("en", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${value.slice(0, 10)}T00:00:00.000Z`));

export default async function ShareReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let result: Awaited<ReturnType<Awaited<ReturnType<typeof getAgreementRepository>>["resolvePublicShare"]>> | null = null;
  if (isShareToken(token)) {
    try {
      const repository = await getAgreementRepository();
      result = await repository.resolvePublicShare(hashShareToken(token));
    } catch (error) {
      console.error("Shared agreement page failed:", error instanceof Error ? error.message : "Unknown database error");
    }
  }

  if (!result || "error" in result) return <main className="public-review-page"><header className="public-review-header"><Link href="/" className="brand"><span className="brand-mark"><ShieldCheck size={18} /></span><span>trustbridge<span className="brand-ai">.ai</span></span></Link></header><div className="public-review-wrap"><Card className="public-review-unavailable"><span className="public-review-icon"><FileCheck2 size={21} /></span><h1>This review link is unavailable</h1><p>It may be invalid, expired, revoked, or the agreement terms may have changed. Ask the owner for a new link.</p></Card></div></main>;

  const { agreement, expiresAt, response, respondedAt } = result.data;
  return <main className="public-review-page"><header className="public-review-header"><Link href="/" className="brand"><span className="brand-mark"><ShieldCheck size={18} /></span><span>trustbridge<span className="brand-ai">.ai</span></span></Link><Badge tone="violet">Counterparty review</Badge></header>
    <div className="public-review-wrap"><div className="public-review-heading"><p className="welcome-kicker"><FileCheck2 size={13} /> AGREEMENT REVIEW</p><h1>{agreement.title}</h1><div className="public-review-draft-label"><Badge tone={isManualAgreementDraft(agreement.summary) ? "muted" : "violet"}>{agreementDraftLabel(agreement.summary)}</Badge></div><p>Review the saved terms below. This page is read-only; your response does not edit the agreement or change payment status.</p></div>
      <div className="public-review-grid"><div className="public-review-main"><Card className="public-review-card"><div className="public-review-section-heading"><span className="detail-section-icon"><FileCheck2 size={17} /></span><div><h2>Agreement summary</h2><p>Saved terms for review</p></div></div><p className="public-review-summary">{agreement.summary}</p><div className="detail-divider" /><p className="eyebrow">SERVICE DESCRIPTION</p><p className="detail-copy">{agreement.serviceDescription}</p><div className="detail-divider" /><p className="eyebrow">DELIVERABLES</p><ul className="detail-list">{agreement.deliverables.map((item, index) => <li key={`${item}-${index}`}><span><Check size={12} /></span>{item}</li>)}</ul><div className="detail-divider" /><p className="eyebrow">ACCEPTANCE CRITERIA</p>{agreement.acceptanceCriteria.length ? <ul className="detail-list">{agreement.acceptanceCriteria.map((item, index) => <li key={`${item}-${index}`}><span><Check size={12} /></span>{item}</li>)}</ul> : <p className="detail-muted">No acceptance criteria were listed.</p>}{agreement.additionalTerms && <><div className="detail-divider" /><p className="eyebrow">ADDITIONAL TERMS</p><p className="detail-copy">{agreement.additionalTerms}</p></>}</Card>
        <Card className="public-review-disclosure"><ShieldCheck size={16} /><p>Your response is recorded as coming from someone with this link. TrustBridge does not verify the responder’s identity or create a legal signature.</p></Card>
      </div><aside className="public-review-side"><Card className="public-review-card public-review-terms"><div className="public-review-section-heading"><span className="detail-section-icon detail-terms-icon"><FileCheck2 size={17} /></span><div><h2>Key terms</h2><p>Review before responding</p></div></div><div className="detail-amount-block"><span>Amount in this draft</span><strong>{formatAmount(agreement.totalAmount, agreement.currency)}</strong></div><div className="detail-meta-row"><span><CalendarDays size={14} /> Deadline</span><strong>{formatDate(agreement.deadline)}</strong></div><div className="detail-meta-row"><span><RotateCcw size={14} /> Included revisions</span><strong>{agreement.includedRevisions}</strong></div><div className="detail-divider" /><p className="eyebrow">PARTIES</p><div className="detail-person"><span className="party-avatar buyer-avatar"><UsersRound size={14} /></span><span><small>Buyer</small><strong>{agreement.buyerName}</strong></span></div><div className="detail-person"><span className="party-avatar seller-avatar"><UsersRound size={14} /></span><span><small>Seller</small><strong>{agreement.sellerName}</strong></span></div><p className="share-expiry-note">This link expires {new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(expiresAt))}.</p></Card>
        <Card className="public-response-card"><CounterpartyResponse token={token} response={response} respondedAt={respondedAt} /></Card></aside></div>
      <footer className="public-review-footer"><span>Clear agreement terms. Recorded link-holder response.</span><Link href="/">About TrustBridge <ArrowRight size={13} /></Link></footer>
    </div></main>;
}
