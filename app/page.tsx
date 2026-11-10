import Link from "next/link";
import { ArrowRight, ArrowUpRight, CalendarDays, Check, FileCheck2, History, Link2, ShieldCheck, Sparkles } from "lucide-react";
import { Nav } from "@/components/nav";
import { Badge, Button, Card } from "@/components/ui";

function AgreementPreview() {
  return <div className="landing-preview" aria-label="Illustrative TrustBridge agreement preview">
    <div className="preview-glow" aria-hidden="true" />
    <div className="preview-float preview-float-top"><span className="preview-float-icon"><Link2 size={16} /></span><span><strong>Review link</strong><small>Ready when you are</small></span></div>
    <Card className="preview-agreement-card">
      <div className="preview-window-bar"><span className="preview-window-label"><span className="preview-window-dot" /> ILLUSTRATIVE WORKSPACE</span><span>Agreement preview</span></div>
      <div className="preview-agreement-body">
        <div className="preview-card-heading">
          <span className="preview-file-icon"><FileCheck2 size={19} /></span>
          <div><span className="preview-eyebrow">AGREEMENT DRAFT</span><h2>Brand identity refresh</h2></div>
          <Badge tone="muted">Manual draft</Badge>
        </div>
        <p className="preview-parties">Buyer <span>and</span> independent service provider</p>
        <div className="preview-divider" />
        <div className="preview-key-terms"><div><span>Agreed amount</span><strong>$1,250.00 <small>USD</small></strong></div><div><span><CalendarDays size={14} /> Deadline</span><strong>November 30, 2026</strong></div></div>
        <div className="preview-scope"><div className="preview-scope-heading"><span className="preview-scope-check"><Check size={13} /></span><strong>Deliverables</strong><span>2 items</span></div><p>Logo suite and a concise brand usage guide</p></div>
        <div className="preview-steps" aria-label="Example review status">
          <div className="preview-step preview-step-current"><span className="preview-step-number"><Check size={11} /></span><span><strong>Terms saved</strong><small>Ready to review</small></span></div>
          <div className="preview-step"><span className="preview-step-number">2</span><span><strong>Counterparty review</strong><small>No response recorded</small></span></div>
          <div className="preview-step"><span className="preview-step-number">3</span><span><strong>Activity history</strong><small>Revisit link and response events</small></span></div>
        </div>
        <div className="preview-card-foot"><span><ShieldCheck size={14} /> Read-only review link</span><span>Illustrative data</span></div>
      </div>
    </Card>
    <div className="preview-float preview-float-bottom"><span className="preview-history-icon"><History size={16} /></span><span><strong>A record to revisit</strong><small>Links, opens, responses</small></span></div>
  </div>;
}

const valueSections = [
  {
    number: "01",
    icon: FileCheck2,
    tone: "blue",
    title: "Clarity before commitment.",
    description: "Bring scope, deliverables, deadlines, and acceptance criteria into one readable agreement before work begins.",
    note: "Use AI-assisted drafting when API access and credits are available, or save a manual draft without an AI request.",
  },
  {
    number: "02",
    icon: Link2,
    tone: "violet",
    title: "One link, shared understanding.",
    description: "Share a time-limited, read-only link so the other party can review the saved terms and record an acceptance or rejection.",
    note: "A response is from someone with the link; it does not verify identity or create a signature.",
  },
  {
    number: "03",
    icon: History,
    tone: "green",
    title: "A record you can revisit.",
    description: "Keep the saved agreement and payment status together, with a history of link creation, first opens, and recorded responses.",
    note: "An open is recorded as an event. It does not prove that the terms were read or understood.",
  },
];

export default function Home() {
  return <main className="landing-page"><Nav active="home" />
    <section className="landing-hero section-wrap">
      <div className="landing-copy">
        <div className="landing-kicker"><span><Sparkles size={13} /></span> A CLEARER START FOR INDEPENDENT WORK</div>
        <h1>Clear agreements.<br /><span className="landing-gradient">Better working relationships.</span></h1>
        <p className="landing-lede">Before work begins or money changes hands, make sure everyone understands what has been agreed.</p>
        <p className="landing-support">Create clear terms, share them for review, record a response, and keep the important activity in one place.</p>
        <div className="landing-actions"><Button href="/dashboard/new">Create an agreement <ArrowRight size={16} /></Button><Link href="#how-it-works" className="landing-secondary-link">See how it works <ArrowUpRight size={15} /></Link></div>
        <div className="landing-assurance"><span><ShieldCheck size={15} /></span><p><strong>Made for real working relationships</strong><small>Counterparties can review terms without creating an account.</small></p></div>
      </div>
      <AgreementPreview />
    </section>

    <section className="landing-proof" aria-label="TrustBridge workflow highlights"><div className="landing-proof-inner section-wrap">
      <div><FileCheck2 size={17} /><span>Clear terms in one place</span></div><span className="landing-proof-divider" />
      <div><Link2 size={17} /><span>Read-only counterparty review</span></div><span className="landing-proof-divider" />
      <div><History size={17} /><span>Responses and activity to revisit</span></div>
    </div></section>

    <section className="value-section section-wrap" id="how-it-works">
      <div className="value-heading"><div><p className="landing-eyebrow">A BETTER WAY TO GET STARTED</p><h2>Make the important details<br /><span className="landing-gradient">easier to work through.</span></h2></div><p>TrustBridge helps clients and independent providers put expectations in writing, invite a review, and keep a useful record as the work moves forward.</p></div>
      <div className="value-grid">{valueSections.map(({ number, icon: Icon, tone, title, description, note }) => <Card className="value-card" key={number}><div className="value-card-top"><span className={`value-icon value-icon-${tone}`}><Icon size={19} /></span><span className="value-number">{number}</span></div><h3>{title}</h3><p className="value-description">{description}</p><p className="value-note">{note}</p></Card>)}</div>
    </section>

    <section className="landing-cta"><div className="section-wrap landing-cta-inner"><div><p className="landing-eyebrow">START WITH WHAT YOU HAVE AGREED</p><h2>Put the terms in one place.</h2><p>Begin with a manual draft, or use AI assistance when your OpenAI API account has available credits.</p></div><Button href="/dashboard/new" variant="secondary">Create a draft <ArrowRight size={16} /></Button></div></section>

    <footer className="landing-footer"><div className="section-wrap landing-footer-inner"><Link href="/" className="brand"><span className="brand-mark"><ShieldCheck size={17} /></span><span>trustbridge<span className="brand-ai">.ai</span></span></Link><span>Clear agreements. Real trust.</span><span>© 2026 TrustBridge AI</span></div></footer>
  </main>;
}
