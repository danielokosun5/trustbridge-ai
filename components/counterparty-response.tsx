"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import type { ShareResponse } from "@/lib/agreements/sharing";

export function CounterpartyResponse({ token, response, respondedAt }: { token: string; response: ShareResponse | null; respondedAt: string | null }) {
  const [recordedResponse, setRecordedResponse] = useState(response);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(nextResponse: ShareResponse) {
    setBusy(true); setMessage("");
    try {
      const result = await fetch(`/api/public-agreements/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response: nextResponse }),
      });
      const body = await result.json() as { response?: ShareResponse; error?: string };
      if (!result.ok) { setMessage(body.error ?? "The response could not be recorded."); return; }
      setRecordedResponse(body.response ?? nextResponse);
      setMessage("Your response has been recorded for this review link.");
    } catch { setMessage("The request could not reach the server."); }
    finally { setBusy(false); }
  }

  return <section className="counterparty-response" aria-labelledby="response-title">
    <div><p className="eyebrow">YOUR RESPONSE</p><h2 id="response-title">Record a response</h2><p>This records a response from someone with this link. It does not verify identity or create a legal signature.</p></div>
    {recordedResponse ? <div className="response-recorded" role="status"><strong>Response recorded: {recordedResponse === "accepted" ? "Accepted" : "Rejected"}</strong>{respondedAt && <span>{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(respondedAt))}</span>}<small>This link cannot record a different response.</small></div> : <div className="response-actions"><Button type="button" disabled={busy} onClick={() => void submit("accepted")}>Accept these terms</Button><Button type="button" variant="quiet" disabled={busy} onClick={() => void submit("rejected")}>Reject these terms</Button></div>}
    {message && <p className="response-feedback" role="status">{message}</p>}
  </section>;
}
