import Link from "next/link";
import { ArrowDownRight, ArrowRight, ArrowUpRight, BadgeCheck, Check, ChevronRight, CircleDollarSign, FileCheck2, LockKeyhole, Shield, ShieldCheck, Sparkles } from "lucide-react";
import { Nav } from "@/components/nav";
import { Badge, Button, Card } from "@/components/ui";

function AgreementPreview() {
  return <div className="preview-shell">
    <div className="preview-orb orb-one" /><div className="preview-orb orb-two" />
    <div className="preview-label"><span className="preview-live" /> A clearer way to work together</div>
    <Card className="agreement-card">
      <div className="agreement-top"><div className="file-icon"><FileCheck2 size={19} /></div><Badge>Ready to review</Badge><button className="dots" aria-label="More options">···</button></div>
      <p className="eyebrow">AGREEMENT · #TB-2048</p>
      <h3>Brand identity refresh</h3><p className="muted">Prepared for Maya Chen</p>
      <div className="agreement-rule" />
      <div className="agreement-detail"><span>Project total</span><strong>$1,250.00 <small>USD</small></strong></div>
      <div className="agreement-detail"><span>Payment protection</span><span className="protected"><ShieldCheck size={14} /> PayPal protected</span></div>
      <div className="scope-box"><span className="scope-check"><Check size={13} /></span><div><strong>Scope is clear</strong><p>Logo suite, color system, and brand guidelines</p></div></div>
      <div className="agreement-actions"><Button className="preview-button">Review agreement <ArrowRight size={15} /></Button><div className="avatar-stack"><i>MC</i><i>JL</i><span>Shared with both parties</span></div></div>
    </Card>
    <div className="float-note"><span className="float-check"><Check size={14} /></span><div><strong>Both parties aligned</strong><span>Agreement confirmed</span></div></div>
    <div className="float-amount"><span className="amount-icon"><CircleDollarSign size={18} /></span><span><small>Protected payment</small><strong>$1,250.00</strong></span><ArrowUpRight size={16} className="amount-arrow" /></div>
  </div>;
}

export default function Home() {
  return <main><Nav active="home" />
    <section className="hero section-wrap"><div className="hero-copy">
      <div className="kicker"><span className="kicker-star"><Sparkles size={13} /></span> GOOD WORK STARTS WITH CLARITY</div>
      <h1>Make every<br />agreement <span className="gradient-word">clear.</span></h1>
      <p className="hero-description">Turn “let’s figure it out” into a clear agreement, protected payment, and a record you can both trust.</p>
      <div className="hero-actions"><Button href="/dashboard">Get started <ArrowRight size={17} /></Button><Link href="#how-it-works" className="text-link">See how it works <ArrowDownRight size={16} /></Link></div>
      <div className="hero-trust"><div className="trust-icon"><ShieldCheck size={17} /></div><p><strong>Built for better business.</strong><span>Fairer work, from the first conversation.</span></p></div>
    </div><AgreementPreview /></section>
    <section className="proof-strip"><div className="proof-inner"><div><span className="proof-symbol">✳</span><span>One shared understanding</span></div><span className="proof-divider" /><div><ShieldCheck size={17} /><span>Payments with PayPal</span></div><span className="proof-divider" /><div><BadgeCheck size={17} /><span>A record you can return to</span></div></div></section>
    <section className="how section-wrap" id="how-it-works"><div className="section-heading"><div><p className="eyebrow">A BETTER WAY TO GET STARTED</p><h2>Less back-and-forth.<br /><span className="gradient-word">More trust, built in.</span></h2></div><p>Good partnerships deserve a good starting point. TrustBridge brings the important details into one place, from first ask to final payment.</p></div>
      <div className="feature-grid"><Card className="feature-card"><div className="feature-icon feature-blue"><FileCheck2 size={20} /></div><span className="feature-number">01</span><h3>Get on the same page</h3><p>Turn a rough request into a clear scope, timeline, and price both sides can stand behind.</p><Link href="/dashboard">Explore agreements <ChevronRight size={14} /></Link></Card><Card className="feature-card"><div className="feature-icon feature-violet"><LockKeyhole size={20} /></div><span className="feature-number">02</span><h3>Pay with confidence</h3><p>Connect agreement details with PayPal payment flows, without sharing sensitive information here.</p><Link href="/dashboard">Explore payments <ChevronRight size={14} /></Link></Card><Card className="feature-card"><div className="feature-icon feature-green"><Shield size={20} /></div><span className="feature-number">03</span><h3>Keep a shared record</h3><p>Bring conversations, decisions, and milestones together in one reliable transaction history.</p><Link href="/dashboard">Explore your workspace <ChevronRight size={14} /></Link></Card></div>
    </section>
    <section className="bottom-cta"><div className="section-wrap cta-inner"><div><p className="eyebrow">YOUR NEXT PROJECT, WITH MORE CLARITY</p><h2>Start with a better<br />understanding.</h2></div><Button href="/dashboard" variant="secondary">Explore your workspace <ArrowUpRight size={17} /></Button></div></section>
    <footer className="footer"><div className="section-wrap footer-inner"><Link href="/" className="brand"><span className="brand-mark"><ShieldCheck size={18} /></span><span>trustbridge<span className="brand-ai">.ai</span></span></Link><span>Clear agreements. Secure payments. Real trust.</span><span>© 2026 TrustBridge AI</span></div></footer>
  </main>;
}
