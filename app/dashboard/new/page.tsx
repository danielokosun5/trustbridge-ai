"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, FileCheck2, ShieldCheck, Sparkles } from "lucide-react";
import { Nav } from "@/components/nav";
import { Badge, Button, Card } from "@/components/ui";
import { DraftRequestSchema, type AgreementContent, type AgreementFields } from "@/lib/agreements/schema";
import { createManualAgreementDraft } from "@/lib/agreements/manual-draft";

type FormState = Omit<AgreementFields, "deliverables" | "acceptanceCriteria" | "includedRevisions"> & {
  deliverablesText: string;
  acceptanceCriteriaText: string;
  includedRevisions: string;
};

const initialForm: FormState = {
  title: "", serviceDescription: "", buyerName: "", sellerName: "", totalAmount: "", currency: "USD",
  deadline: "", deliverablesText: "", acceptanceCriteriaText: "", includedRevisions: "0", additionalTerms: "",
};

type DraftApiResponse = {
  status?: "ready" | "needs_clarification";
  agreement?: AgreementContent;
  questions?: string[];
  error?: string;
  issues?: Array<{ path: string; message: string }>;
};

const listFromText = (value: string) => value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);

export default function NewAgreement() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(initialForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [questions, setQuestions] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => ({ ...previous, [key]: "" }));
  }

  async function requestDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    const input = DraftRequestSchema.safeParse({
      title: form.title,
      serviceDescription: form.serviceDescription,
      buyerName: form.buyerName,
      sellerName: form.sellerName,
      totalAmount: form.totalAmount,
      currency: form.currency,
      deadline: form.deadline,
      deliverables: listFromText(form.deliverablesText),
      acceptanceCriteria: listFromText(form.acceptanceCriteriaText),
      includedRevisions: Number(form.includedRevisions),
      additionalTerms: form.additionalTerms,
      clarificationAnswers: questions.map((question) => ({ question, answer: answers[question] ?? "" })),
    });

    if (!input.success) {
      const nextErrors: Record<string, string> = {};
      for (const issue of input.error.issues) {
        const key = String(issue.path[0] ?? "form");
        if (!nextErrors[key]) nextErrors[key] = issue.message;
      }
      if (questions.some((question) => !answers[question]?.trim())) {
        nextErrors.clarificationAnswers = "Answer each question before continuing.";
      }
      setErrors(nextErrors);
      return;
    }

    setErrors({});
    setBusy(true);
    try {
      const response = await fetch("/api/agreements/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input.data),
      });
      const result = (await response.json()) as DraftApiResponse;

      if (!response.ok) {
        if (result.issues) {
          const serverErrors: Record<string, string> = {};
          for (const issue of result.issues) if (!serverErrors[issue.path]) serverErrors[issue.path] = issue.message;
          setErrors(serverErrors);
        }
        setMessage(result.error ?? "The draft could not be prepared. Please try again.");
        return;
      }

      if (result.status === "needs_clarification" && result.questions?.length) {
        setAnswers((previous) => Object.fromEntries(result.questions!.map((question) => [question, previous[question] ?? ""])));
        setQuestions(result.questions);
        setMessage("A few details need your input before the agreement is ready to review.");
        return;
      }

      if (result.status === "ready" && result.agreement) {
        window.sessionStorage.setItem("trustbridge:agreement-draft", JSON.stringify(result.agreement));
        router.push("/dashboard/agreements/review");
        return;
      }

      setMessage("The AI service returned an incomplete response. Nothing was saved; please try again.");
    } catch {
      setMessage("The request could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function saveManualDraft() {
    setMessage("");
    const input = createManualAgreementDraft({
      title: form.title,
      serviceDescription: form.serviceDescription,
      buyerName: form.buyerName,
      sellerName: form.sellerName,
      totalAmount: form.totalAmount,
      currency: form.currency,
      deadline: form.deadline,
      deliverables: listFromText(form.deliverablesText),
      acceptanceCriteria: listFromText(form.acceptanceCriteriaText),
      includedRevisions: Number(form.includedRevisions),
      additionalTerms: form.additionalTerms,
    });

    if (!input.success) {
      const nextErrors: Record<string, string> = {};
      for (const issue of input.error.issues) {
        const key = String(issue.path[0] ?? "form");
        if (!nextErrors[key]) nextErrors[key] = issue.message;
      }
      setErrors(nextErrors);
      setMessage("Review the highlighted fields before saving this manual draft.");
      return;
    }

    setErrors({});
    setBusy(true);
    try {
      const response = await fetch("/api/agreements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input.data),
      });
      const result = (await response.json()) as { agreement?: { id: string }; error?: string };
      if (!response.ok || !result.agreement?.id) {
        setMessage(result.error ?? "The manual draft could not be saved. Please try again.");
        return;
      }
      router.push(`/dashboard/agreements/${result.agreement.id}`);
    } catch {
      setMessage("The request could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="dashboard-page"><Nav active="dashboard" /><div className="dashboard-wrap agreement-builder">
    <Link className="back-link" href="/dashboard"><ArrowLeft size={15} /> Back to workspace</Link>
    <div className="builder-heading"><div><div className="welcome-kicker"><Sparkles size={13} /> START WITH CLEAR EXPECTATIONS</div><h1>Start with the important details.</h1><p>TrustBridge AI will help clarify the request and prepare a draft for your review.</p></div><span className="builder-step"><i className="step-current">1</i><span className="step-line" /><i>2</i><span>Review</span></span></div>
    <div className="builder-grid"><Card className="builder-card"><div className="builder-card-heading"><span className="builder-icon"><FileCheck2 size={18} /></span><div><h2>Agreement details</h2><p>Clear details make for a better first draft.</p></div></div>
      <form className="agreement-form milestone-form" onSubmit={requestDraft} noValidate>
        <div className="form-section-label">THE PROJECT</div>
        <label>Agreement title <span className="required-mark">Required</span><input required maxLength={120} value={form.title} onChange={(event) => update("title", event.target.value)} placeholder="e.g. Brand identity refresh" aria-invalid={Boolean(errors.title)} />{errors.title && <small className="field-error">{errors.title}</small>}</label>
        <label>Service description<textarea required rows={4} maxLength={3000} value={form.serviceDescription} onChange={(event) => update("serviceDescription", event.target.value)} placeholder="Describe the work in your own words. What outcome are you looking for?" aria-invalid={Boolean(errors.serviceDescription)} />{errors.serviceDescription && <small className="field-error">{errors.serviceDescription}</small>}</label>
        <div className="form-pair"><label>Buyer display name<input required maxLength={80} value={form.buyerName} onChange={(event) => update("buyerName", event.target.value)} placeholder="Who is commissioning the work?" aria-invalid={Boolean(errors.buyerName)} />{errors.buyerName && <small className="field-error">{errors.buyerName}</small>}</label><label>Seller display name<input required maxLength={80} value={form.sellerName} onChange={(event) => update("sellerName", event.target.value)} placeholder="Who is providing the service?" aria-invalid={Boolean(errors.sellerName)} />{errors.sellerName && <small className="field-error">{errors.sellerName}</small>}</label></div>

        <div className="form-section-label">PRICE & TIMING</div>
        <div className="form-pair"><label>Total amount <span className="input-wrap"><span>{form.currency}</span><input required type="number" min="0.01" step="0.01" max="999999999" value={form.totalAmount} onChange={(event) => update("totalAmount", event.target.value)} placeholder="0.00" aria-invalid={Boolean(errors.totalAmount)} /></span>{errors.totalAmount && <small className="field-error">{errors.totalAmount}</small>}</label><label>Currency<select value={form.currency} onChange={(event) => update("currency", event.target.value as FormState["currency"])}>{["USD", "EUR", "GBP", "NGN", "CAD", "AUD"].map((currency) => <option key={currency} value={currency}>{currency}</option>)}</select></label></div>
        <label>Deadline<input required type="date" min={new Date().toISOString().slice(0, 10)} value={form.deadline} onChange={(event) => update("deadline", event.target.value)} aria-invalid={Boolean(errors.deadline)} />{errors.deadline && <small className="field-error">{errors.deadline}</small>}</label>

        <div className="form-section-label">WHAT DOES “DONE” LOOK LIKE?</div>
        <label>Deliverables <span className="field-hint">One item per line</span><textarea required rows={4} maxLength={4000} value={form.deliverablesText} onChange={(event) => update("deliverablesText", event.target.value)} placeholder={"Brand logo files\nColor palette and typography guide\nOne-page usage guide"} aria-invalid={Boolean(errors.deliverables)} />{errors.deliverables && <small className="field-error">{errors.deliverables}</small>}</label>
        <label>Acceptance criteria <span className="field-hint">One item per line · the AI will ask if this needs more detail</span><textarea rows={3} maxLength={4000} value={form.acceptanceCriteriaText} onChange={(event) => update("acceptanceCriteriaText", event.target.value)} placeholder="How will both sides know each deliverable is complete?" aria-invalid={Boolean(errors.acceptanceCriteria)} />{errors.acceptanceCriteria && <small className="field-error">{errors.acceptanceCriteria}</small>}</label>
        <div className="form-pair"><label>Included revisions<input type="number" min="0" max="20" step="1" value={form.includedRevisions} onChange={(event) => update("includedRevisions", event.target.value)} aria-invalid={Boolean(errors.includedRevisions)} />{errors.includedRevisions && <small className="field-error">{errors.includedRevisions}</small>}</label><label>Additional terms <span className="field-hint">Optional</span><textarea rows={2} maxLength={1500} value={form.additionalTerms} onChange={(event) => update("additionalTerms", event.target.value)} placeholder="Any other agreed details" aria-invalid={Boolean(errors.additionalTerms)} />{errors.additionalTerms && <small className="field-error">{errors.additionalTerms}</small>}</label></div>

        {questions.length > 0 && <section className="clarification-panel" aria-labelledby="clarification-title"><div className="clarification-heading"><span className="clarification-icon"><Sparkles size={15} /></span><div><h3 id="clarification-title">A few things to clarify</h3><p>The AI found details that need clarification before it can prepare the draft.</p></div><Badge tone="violet">Needs your input</Badge></div>{questions.map((question, index) => <label className="clarification-question" key={`${question}-${index}`}>{question}<textarea required rows={2} maxLength={1000} value={answers[question] ?? ""} onChange={(event) => setAnswers((previous) => ({ ...previous, [question]: event.target.value }))} placeholder="Add the agreed detail" />{errors.clarificationAnswers && !answers[question]?.trim() && <small className="field-error">{errors.clarificationAnswers}</small>}</label>)}</section>}

        {message && <div className="form-message" role="status">{message}</div>}
        <div className="form-note"><ShieldCheck size={15} /><span>Draft with AI to clarify your request, or save a clearly labelled manual draft from these details. Nothing is signed or charged.</span></div>
        <div className="form-footer"><Link href="/dashboard" className="cancel-link">Cancel</Link><Button type="button" variant="secondary" disabled={busy} onClick={() => void saveManualDraft()}>{busy ? <><span className="loading-spinner" /> Saving…</> : <>Save Draft <FileCheck2 size={16} /></>}</Button><Button type="submit" disabled={busy}>{busy ? <><span className="loading-spinner" /> Drafting…</> : <>{questions.length ? "Continue with answers" : "Draft with AI"} <ArrowRight size={16} /></>}</Button></div>
      </form>
    </Card><Card className="builder-aside"><div className="aside-icon"><ShieldCheck size={18} /></div><h3>Start with clear details.</h3><p>AI suggestions are a starting point, not legal advice. Both parties should review the terms before relying on them.</p><div className="aside-check"><span><Check size={12} /></span>Keep expectations specific</div><div className="aside-check"><span><Check size={12} /></span>Answer clarification questions first</div><div className="aside-check"><span><Check size={12} /></span>Review and edit before saving</div><div className="aside-privacy"><ShieldCheck size={14} /> Your OpenAI key stays on the server.</div></Card></div>
    <p className="builder-caption">No payment is made by drafting or saving an agreement.</p>
  </div></main>;
}
