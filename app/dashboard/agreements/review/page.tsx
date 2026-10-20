"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, FileCheck2, ShieldCheck } from "lucide-react";
import { Nav } from "@/components/nav";
import { Badge, Button, Card } from "@/components/ui";
import { AgreementContentSchema, type AgreementContent } from "@/lib/agreements/schema";

const listFromText = (value: string) => value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);

export default function AgreementReview() {
  const router = useRouter();
  const [agreement, setAgreement] = useState<AgreementContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    const loadDraft = () => {
      try {
        const raw = window.sessionStorage.getItem("trustbridge:agreement-draft");
        if (raw) {
          const parsed: unknown = JSON.parse(raw);
          const result = AgreementContentSchema.safeParse(parsed);
          if (result.success) setAgreement(result.data);
          else setMessage("The temporary draft is invalid. Start a new agreement draft.");
        }
      } catch {
        setMessage("The temporary draft could not be read. Start a new agreement draft.");
      } finally {
        setLoading(false);
      }
    };
    const frame = window.requestAnimationFrame(() => { if (!cancelled) loadDraft(); });
    return () => { cancelled = true; window.cancelAnimationFrame(frame); };
  }, []);

  function update<K extends keyof AgreementContent>(key: K, value: AgreementContent[K]) {
    setAgreement((previous) => previous ? { ...previous, [key]: value } : previous);
    setErrors((previous) => ({ ...previous, [key]: "" }));
  }

  async function saveAgreement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!agreement) return;
    setMessage("");
    const validation = AgreementContentSchema.safeParse(agreement);
    if (!validation.success) {
      const nextErrors: Record<string, string> = {};
      for (const issue of validation.error.issues) {
        const key = String(issue.path[0] ?? "form");
        if (!nextErrors[key]) nextErrors[key] = issue.message;
      }
      setErrors(nextErrors);
      setMessage("Review the highlighted details before saving.");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/agreements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validation.data),
      });
      const result = await response.json() as { agreement?: { id: string }; error?: string };
      if (!response.ok || !result.agreement?.id) {
        setMessage(result.error ?? "The agreement could not be saved. Please try again.");
        return;
      }
      window.sessionStorage.removeItem("trustbridge:agreement-draft");
      router.push(`/dashboard/agreements/${result.agreement.id}`);
    } catch {
      setMessage("The save request could not reach the server. Your draft is still available in this tab.");
    } finally {
      setSaving(false);
    }
  }

  return <main className="dashboard-page"><Nav active="dashboard" /><div className="dashboard-wrap agreement-builder review-builder">
    <Link className="back-link" href="/dashboard/new"><ArrowLeft size={15} /> Back to agreement details</Link>
    <div className="builder-heading"><div><div className="welcome-kicker"><FileCheck2 size={13} /> REVIEW BEFORE SAVING</div><h1>Make it yours, then save.</h1><p>Review the AI draft carefully. You can edit every field before adding it to your workspace.</p></div><Badge tone="violet">AI draft · Unsaved</Badge></div>
    {loading ? <Card className="review-placeholder"><span className="loading-spinner" /> Loading your draft…</Card> : !agreement ? <Card className="review-missing"><div className="aside-icon"><FileCheck2 size={18} /></div><h2>No draft to review</h2><p>{message || "Drafts are kept in this browser tab until you save. Start a new draft to continue."}</p><Button href="/dashboard/new">Start a new agreement <ArrowRight size={15} /></Button></Card> : <Card className="builder-card review-card"><form className="agreement-form milestone-form" onSubmit={saveAgreement} noValidate>
      <div className="review-summary-head"><div><h2>Agreement draft</h2><p>AI-created from your details · Edit as needed</p></div><Badge tone="muted">Not saved</Badge></div>
      <div className="form-section-label">THE PROJECT</div>
      <label>Agreement title<input value={agreement.title} onChange={(event) => update("title", event.target.value)} aria-invalid={Boolean(errors.title)} />{errors.title && <small className="field-error">{errors.title}</small>}</label>
      <label>Service description<textarea rows={4} value={agreement.serviceDescription} onChange={(event) => update("serviceDescription", event.target.value)} aria-invalid={Boolean(errors.serviceDescription)} />{errors.serviceDescription && <small className="field-error">{errors.serviceDescription}</small>}</label>
      <label>AI summary<textarea rows={3} value={agreement.summary} onChange={(event) => update("summary", event.target.value)} aria-invalid={Boolean(errors.summary)} />{errors.summary && <small className="field-error">{errors.summary}</small>}</label>
      <div className="form-pair"><label>Buyer display name<input value={agreement.buyerName} onChange={(event) => update("buyerName", event.target.value)} aria-invalid={Boolean(errors.buyerName)} />{errors.buyerName && <small className="field-error">{errors.buyerName}</small>}</label><label>Seller display name<input value={agreement.sellerName} onChange={(event) => update("sellerName", event.target.value)} aria-invalid={Boolean(errors.sellerName)} />{errors.sellerName && <small className="field-error">{errors.sellerName}</small>}</label></div>
      <div className="form-section-label">PRICE & TIMING</div>
      <div className="form-pair"><label>Total amount<input type="number" min="0.01" step="0.01" value={agreement.totalAmount} onChange={(event) => update("totalAmount", event.target.value)} aria-invalid={Boolean(errors.totalAmount)} />{errors.totalAmount && <small className="field-error">{errors.totalAmount}</small>}</label><label>Currency<select value={agreement.currency} onChange={(event) => update("currency", event.target.value as AgreementContent["currency"])}>{["USD", "EUR", "GBP", "NGN", "CAD", "AUD"].map((currency) => <option key={currency} value={currency}>{currency}</option>)}</select></label></div>
      <label>Deadline<input type="date" value={agreement.deadline} onChange={(event) => update("deadline", event.target.value)} aria-invalid={Boolean(errors.deadline)} />{errors.deadline && <small className="field-error">{errors.deadline}</small>}</label>
      <div className="form-section-label">DELIVERABLES & EXPECTATIONS</div>
      <label>Deliverables <span className="field-hint">One item per line</span><textarea rows={4} value={agreement.deliverables.join("\n")} onChange={(event) => update("deliverables", listFromText(event.target.value))} aria-invalid={Boolean(errors.deliverables)} />{errors.deliverables && <small className="field-error">{errors.deliverables}</small>}</label>
      <label>Acceptance criteria <span className="field-hint">One item per line</span><textarea rows={3} value={agreement.acceptanceCriteria.join("\n")} onChange={(event) => update("acceptanceCriteria", listFromText(event.target.value))} aria-invalid={Boolean(errors.acceptanceCriteria)} />{errors.acceptanceCriteria && <small className="field-error">{errors.acceptanceCriteria}</small>}</label>
      <div className="form-pair"><label>Included revisions<input type="number" min="0" max="20" step="1" value={agreement.includedRevisions} onChange={(event) => update("includedRevisions", Number(event.target.value))} aria-invalid={Boolean(errors.includedRevisions)} />{errors.includedRevisions && <small className="field-error">{errors.includedRevisions}</small>}</label><label>Additional terms<input value={agreement.additionalTerms} onChange={(event) => update("additionalTerms", event.target.value)} aria-invalid={Boolean(errors.additionalTerms)} />{errors.additionalTerms && <small className="field-error">{errors.additionalTerms}</small>}</label></div>
      <div className="review-legal-note"><ShieldCheck size={15} /><p>AI-generated terms may be incomplete. Confirm names, amounts, dates, deliverables, and acceptance criteria with the other party. This draft is not legal advice.</p></div>
      {message && <div className="form-message" role="status">{message}</div>}
      <div className="form-footer review-actions"><Link href="/dashboard/new" className="cancel-link">Start over</Link><Button type="submit" disabled={saving}>{saving ? <><span className="loading-spinner" /> Saving…</> : <><Check size={15} /> Save agreement</>}</Button></div>
    </form></Card>}
    <p className="builder-caption">Saving stores this draft in your workspace. It does not make a payment or send the agreement.</p>
  </div></main>;
}
