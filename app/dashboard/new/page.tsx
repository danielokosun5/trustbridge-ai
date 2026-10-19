"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, FileCheck2, ShieldCheck, Sparkles } from "lucide-react";
import { Nav } from "@/components/nav";
import { Button, Card } from "@/components/ui";

export default function NewAgreement() {
  const [preview, setPreview] = useState(false);
  const [service, setService] = useState("");
  const [scope, setScope] = useState("");
  const [amount, setAmount] = useState("");
  const [partner, setPartner] = useState("");

  return <main className="dashboard-page"><Nav active="dashboard" /><div className="dashboard-wrap agreement-builder">
    <Link className="back-link" href="/dashboard"><ArrowLeft size={15} /> Back to workspace</Link>
    <div className="builder-heading"><div><div className="welcome-kicker"><Sparkles size={13} /> START WITH CLEAR EXPECTATIONS</div><h1>{preview ? "Your agreement preview" : "A better start to your next project."}</h1><p>{preview ? "Take a look at the details you’ve brought together." : "Write down the essentials. You and your client can build from the same understanding."}</p></div><span className="builder-step"><i className="step-current">{preview ? <Check size={12} /> : "1"}</i><span className="step-line" /><i className={preview ? "step-current" : ""}>{preview ? "2" : "2"}</i><span>{preview ? "Preview" : "Details"}</span></span></div>
    {!preview ? <div className="builder-grid"><Card className="builder-card"><div className="builder-card-heading"><span className="builder-icon"><FileCheck2 size={18} /></span><div><h2>Project details</h2><p>A few clear details make a great first step.</p></div></div>
      <form className="agreement-form" onSubmit={(event) => { event.preventDefault(); setPreview(true); }}>
        <label>What are you working on?<input required maxLength={80} value={service} onChange={(event) => setService(event.target.value)} placeholder="e.g. Brand identity refresh" /></label>
        <label>Who are you working with?<input maxLength={60} value={partner} onChange={(event) => setPartner(event.target.value)} placeholder="Client or provider name" /></label>
        <label>What’s included?<textarea required maxLength={400} rows={4} value={scope} onChange={(event) => setScope(event.target.value)} placeholder="Describe the deliverables, milestones, or key expectations" /></label>
        <label>Agreed project total <span className="input-wrap"><span>$</span><input required type="number" min="1" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" /><i>USD</i></span></label>
        <div className="form-note"><ShieldCheck size={15} /><span>Creating this preview doesn’t charge anyone. Payment connection comes in a later milestone.</span></div>
        <div className="form-footer"><Link href="/dashboard" className="cancel-link">Cancel</Link><Button type="submit">Preview agreement <ArrowRight size={16} /></Button></div>
      </form>
    </Card><Card className="builder-aside"><div className="aside-icon"><ShieldCheck size={18} /></div><h3>Clarity protects everyone.</h3><p>Write the key details in a way both sides can revisit. There’s no payment or signature in this frontend preview.</p><div className="aside-check"><span><Check size={12} /></span>Agree on what “done” means</div><div className="aside-check"><span><Check size={12} /></span>Set a fair, shared price</div><div className="aside-check"><span><Check size={12} /></span>Keep expectations in one place</div></Card></div>
    : <Card className="agreement-result"><div className="result-top"><div className="result-file"><FileCheck2 size={19} /></div><span className="preview-only">DRAFT PREVIEW</span></div><p className="eyebrow">AGREEMENT · UNSAVED DRAFT</p><h2>{service}</h2><p className="result-partner">Prepared{partner ? ` for ${partner}` : " for your project partner"}</p><div className="result-rule" /><p className="eyebrow">PROJECT SCOPE</p><p className="result-scope">{scope}</p><div className="result-rule" /><div className="result-total"><span>Agreed project total</span><strong>${Number(amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <small>USD</small></strong></div><div className="result-notice"><ShieldCheck size={16} /><p>This is an unsaved preview. No agreement was sent and no payment was made.</p></div><div className="result-actions"><Button variant="quiet" onClick={() => setPreview(false)}>Edit details</Button><Button href="/dashboard">Return to workspace <ArrowRight size={15} /></Button></div></Card>}
    <p className="builder-caption">TrustBridge AI helps both sides start from the same page.</p>
  </div></main>;
}
