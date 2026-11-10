"use client";

import { useState } from "react";
import { Copy, Link2, RotateCcw, Share2 } from "lucide-react";
import { Button, Card } from "@/components/ui";

export function ShareControls({ agreementId }: { agreementId: string }) {
  const [days, setDays] = useState("7");
  const [url, setUrl] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function createLink() {
    setBusy(true); setMessage(""); setUrl("");
    try {
      const response = await fetch(`/api/agreements/${agreementId}/share`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expiresInDays: Number(days) }) });
      const result = await response.json() as { url?: string; error?: string; expiresAt?: string };
      if (!response.ok || !result.url) { setMessage(result.error ?? "The review link could not be created."); return; }
      setUrl(new URL(result.url, window.location.origin).toString());
      setMessage(`This link expires ${new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(result.expiresAt!))}. Copy it now; the raw link is shown only once.`);
    } catch { setMessage("The request could not reach the server."); }
    finally { setBusy(false); }
  }

  async function revokeLinks() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/agreements/${agreementId}/share`, { method: "DELETE" });
      const result = await response.json() as { revoked?: number; error?: string };
      if (!response.ok) { setMessage(result.error ?? "The links could not be revoked."); return; }
      setUrl(""); setMessage(result.revoked ? "Active review links have been revoked." : "There were no active review links to revoke.");
    } catch { setMessage("The request could not reach the server."); }
    finally { setBusy(false); }
  }

  async function copyLink() {
    try { await navigator.clipboard.writeText(url); setMessage("Review link copied. Anyone with it can respond until it expires or is revoked."); }
    catch { setMessage("Copy was unavailable. Select and copy the link shown above."); }
  }

  return <Card className="share-controls-card"><div className="share-controls-heading"><span className="share-icon"><Share2 size={17} /></span><div><p className="eyebrow">COUNTERPARTY REVIEW</p><h2>Create a review link</h2><p>A link holder can review the saved terms and record one response. No account is required.</p></div></div>
    <label className="share-expiration">Link expires after<select value={days} onChange={(event) => setDays(event.target.value)}><option value="1">1 day</option><option value="7">7 days</option><option value="14">14 days</option><option value="30">30 days</option></select></label>
    <div className="share-control-actions"><Button type="button" disabled={busy} onClick={() => void createLink()}><Link2 size={14} />{busy ? "Working…" : "Create new link"}</Button><Button type="button" variant="quiet" disabled={busy} onClick={() => void revokeLinks()}><RotateCcw size={14} />Revoke links</Button></div>
    {url && <div className="share-url-box"><a href={url} target="_blank" rel="noreferrer">{url}</a><Button type="button" variant="secondary" onClick={() => void copyLink()}><Copy size={14} />Copy link</Button></div>}
    {message && <p className="share-feedback" role="status">{message}</p>}
    <p className="share-disclosure">Anyone holding the link can respond. Creating another link revokes previous active links for this agreement. Responses are not identity-verified signatures, and do not change PayPal payment status.</p>
  </Card>;
}
