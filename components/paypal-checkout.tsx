"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { Badge, Card } from "@/components/ui";
import { PAYPAL_CURRENCIES } from "@/lib/payments/types";

type PaymentStatus = "unpaid" | "creating" | "pending" | "capturing" | "paid" | "cancelled" | "failed";
type PayPalFundingSource = "paypal";
const PAYPAL_BUTTON_STYLE = { layout: "vertical", color: "gold", shape: "rect", label: "paypal", height: 45 } as const;
type ButtonInstance = { render(target: HTMLElement): Promise<void>; close?: () => void | Promise<void> };
type ButtonOptions = {
  fundingSource: PayPalFundingSource;
  style: { layout: "vertical"; color: "gold"; shape: "rect"; label: "paypal"; height: number };
  createOrder: () => Promise<string>;
  onApprove: (data: { orderID: string }) => Promise<void>;
  onCancel: (data: { orderID?: string; reason?: string }) => void;
  onError: (error: unknown) => void;
};

function safeCheckoutDiagnostic(error: unknown) {
  const source = error instanceof Error ? error : new Error("Unknown PayPal SDK error");
  const message = source.message
    .replace(/\bBearer\s+[^\s"']+/gi, "Bearer [redacted]")
    .replace(/(client[_-]?secret|access[_-]?token|client[_-]?id)["'=:\s]+[^\s,"'}]+/gi, "$1=[redacted]")
    .slice(0, 240);
  return { name: source.name.slice(0, 80), message };
}

declare global {
  interface Window {
    paypal?: { FUNDING: { PAYPAL: PayPalFundingSource }; Buttons(options: ButtonOptions): ButtonInstance };
  }
}

export function PayPalCheckout({
  agreementId,
  currency,
  paymentStatus,
  paypalOrderId,
  clientId,
  enabled,
}: {
  agreementId: string;
  currency: string;
  paymentStatus: PaymentStatus;
  paypalOrderId: string | null;
  clientId: string | null;
  enabled: boolean;
}) {
  const router = useRouter();
  const buttonHost = useRef<HTMLDivElement>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [statusOverride, setStatusOverride] = useState<PaymentStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [canRetryCapture, setCanRetryCapture] = useState(paymentStatus === "capturing");
  const [retryOrderId, setRetryOrderId] = useState<string | null>(paypalOrderId);
  const [message, setMessage] = useState("");
  const activeOrderId = useRef<string | null>(paypalOrderId);
  const supportedCurrency = (PAYPAL_CURRENCIES as readonly string[]).includes(currency);
  const status = paymentStatus === "paid" ? "paid" : statusOverride ?? paymentStatus;

  const captureApprovedOrder = useCallback(async (orderId: string) => {
    setBusy(true);
    setCanRetryCapture(false);
    setStatusOverride("capturing");
    setMessage("Buyer approval received. Verifying the payment with PayPal…");
    buttonHost.current?.replaceChildren();
    let retryAllowed = true;
    try {
      const response = await fetch("/api/payments/capture-order", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agreementId, orderId }),
      });
      const result = await response.json() as { status?: string; error?: string; code?: string };
      if (!response.ok || result.status !== "paid") {
        retryAllowed = !["CAPTURE_FAILED", "CAPTURE_NOT_CONFIRMED", "ORDER_VERIFICATION_FAILED", "PAYER_APPROVAL_REQUIRED"].includes(result.code ?? "");
        throw new Error(result.error ?? "PayPal has not confirmed this payment yet. You can retry safely.");
      }
      setStatusOverride("paid");
      setCanRetryCapture(false);
      setRetryOrderId(null);
      buttonHost.current?.replaceChildren();
      setMessage("Payment confirmed by PayPal sandbox.");
      router.refresh();
    } catch (error) {
      setStatusOverride(null);
      setCanRetryCapture(retryAllowed);
      setMessage(error instanceof Error ? error.message : "Payment confirmation is pending. Please retry.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }, [agreementId, router]);

  useEffect(() => {
    const host = buttonHost.current;
    if (!host || !sdkReady || !enabled || !supportedCurrency || paymentStatus === "paid" || paymentStatus === "capturing" || !window.paypal) return;
    let mounted = true;
    let buttons: ButtonInstance | undefined;

    const renderButtons = async () => {
      console.info("[TrustBridge PayPal] Buttons render started", { agreementId, currency, sdkIntent: "capture", orderIntent: "CAPTURE", fundingSource: "paypal" });
      host.replaceChildren();
      buttons = window.paypal!.Buttons({
        fundingSource: window.paypal!.FUNDING.PAYPAL,
        style: PAYPAL_BUTTON_STYLE,
        async createOrder() {
          console.info("[TrustBridge PayPal] Browser createOrder started", { agreementId });
          setBusy(true);
          setMessage("");
          try {
            const response = await fetch("/api/payments/create-order", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ agreementId }),
            });
            const result = await response.json() as { orderId?: string; error?: string };
            if (!response.ok || !result.orderId) throw new Error(result.error ?? "The sandbox order could not be started.");
            console.info("[TrustBridge PayPal] Browser createOrder received order ID", { orderId: result.orderId });
            activeOrderId.current = result.orderId;
            setRetryOrderId(result.orderId);
            setStatusOverride("pending");
            setBusy(false);
            return result.orderId;
          } catch (error) {
            console.error("[TrustBridge PayPal] Browser createOrder failed", safeCheckoutDiagnostic(error));
            setMessage(error instanceof Error ? error.message : "The sandbox order could not be started.");
            setBusy(false);
            throw error;
          }
        },
        async onApprove(data) {
          console.info("[TrustBridge PayPal] Browser onApprove fired", { orderId: data.orderID });
          activeOrderId.current = data.orderID;
          setRetryOrderId(data.orderID);
          await captureApprovedOrder(data.orderID);
        },
        onCancel(data) {
          console.info("[TrustBridge PayPal] Browser onCancel fired", {
            orderId: data.orderID ?? activeOrderId.current ?? null,
            reason: typeof data.reason === "string" ? data.reason.slice(0, 120) : null,
            callbackFields: Object.keys(data),
          });
          setBusy(false);
          setStatusOverride("cancelled");
          setMessage("Checkout cancelled. No completed payment was recorded.");
          const orderId = data.orderID ?? activeOrderId.current;
          if (orderId) {
            void fetch("/api/payments/cancel-order", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ agreementId, orderId }),
            }).then(() => router.refresh()).catch(() => undefined);
          }
        },
        onError(error) {
          console.error("[TrustBridge PayPal] Browser onError fired", { orderId: activeOrderId.current, ...safeCheckoutDiagnostic(error) });
          setBusy(false);
          setMessage("PayPal sandbox reported a checkout error. No payment is marked complete; retry or choose another sandbox buyer account.");
        },
      });
      try {
        await buttons.render(host);
        console.info("[TrustBridge PayPal] Buttons render completed", { agreementId });
      } catch {
        console.error("[TrustBridge PayPal] Buttons render rejected", { agreementId });
        if (mounted) setMessage("The PayPal sandbox button could not load. Check the client ID and try again.");
      }
    };

    void renderButtons();
    return () => {
      mounted = false;
      console.info("[TrustBridge PayPal] Buttons effect cleanup", { agreementId, activeOrderId: activeOrderId.current, checkoutPending: Boolean(activeOrderId.current) });
      host.replaceChildren();
      if (buttons?.close) {
        console.info("[TrustBridge PayPal] Buttons close invoked by effect cleanup", { agreementId });
        void buttons.close();
      }
    };
  }, [agreementId, captureApprovedOrder, currency, enabled, paymentStatus, router, sdkReady, supportedCurrency]);

  const sdkUrl = clientId && supportedCurrency
    ? `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=${encodeURIComponent(currency)}&intent=capture&components=buttons&disable-funding=card`
    : undefined;

  return <Card className="payment-card" aria-busy={busy}>
    {sdkUrl && enabled && status !== "paid" && <Script src={sdkUrl} strategy="afterInteractive" onReady={() => setSdkReady(true)} onError={() => setMessage("PayPal’s sandbox checkout script could not load. Check your connection and client ID.")} />}
    <div className="payment-card-heading"><div><p className="eyebrow">PAYMENT</p><h2>Pay with PayPal</h2><p>Sandbox checkout for the amount in this saved agreement.</p></div><Badge tone={status === "paid" ? "green" : status === "failed" ? "muted" : "blue"}>{status === "paid" ? "Paid" : status === "cancelled" ? "Cancelled" : status === "capturing" ? "Verifying" : status === "pending" ? "Awaiting approval" : status === "failed" ? "Payment failed" : "Unpaid"}</Badge></div>
    {status === "paid" ? <div className="payment-state payment-state-success"><span className="payment-state-mark">✓</span><div><strong>Payment confirmed</strong><p>The PayPal capture was verified and saved to this agreement.</p></div></div>
      : !supportedCurrency ? <div className="payment-state payment-state-error"><strong>Checkout unavailable for {currency}</strong><p>PayPal sandbox checkout does not support this saved agreement currency.</p></div>
      : !enabled ? <div className="payment-state"><strong>Sandbox checkout is not configured</strong><p>Add the PayPal sandbox variables to .env.local and restart the server to enable checkout.</p></div>
      : <><div className="payment-button-shell"><div ref={buttonHost} />{!sdkReady && <div className="payment-loading">Loading PayPal sandbox…</div>}</div>{status === "cancelled" && <p className="payment-state-inline">Checkout was cancelled. You can try again when ready.</p>}{status === "failed" && <p className="payment-state-inline payment-error">The previous payment did not complete. You can try again.</p>}{canRetryCapture && retryOrderId && <button className="button button-quiet payment-retry-button" type="button" disabled={busy} onClick={() => void captureApprovedOrder(retryOrderId)}>{busy ? "Verifying with PayPal…" : "Retry payment verification"}</button>}</>}
    {message && <p className={`payment-message ${status === "paid" ? "payment-message-success" : ""}`} role="status">{message}</p>}
    <p className="payment-footnote">Payments are processed by PayPal sandbox and recorded after server verification. This is not escrow.</p>
  </Card>;
}
