import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/agreements/draft/route";

test("AI draft endpoint explains when the server API key is not configured", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "";
  const body = {
    title: "Brand identity refresh",
    serviceDescription: "Create a refreshed identity system for a new studio.",
    buyerName: "Jordan Lee",
    sellerName: "Maya Chen",
    totalAmount: "1250.00",
    currency: "USD",
    deadline: new Date().toISOString().slice(0, 10),
    deliverables: ["Primary logo in SVG and PNG formats"],
    acceptanceCriteria: ["Files open and render at the requested sizes"],
    includedRevisions: 2,
    additionalTerms: "",
    clarificationAnswers: [],
  };

  try {
    const request = new NextRequest("http://localhost/api/agreements/draft", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "test-ai-not-configured" },
      body: JSON.stringify(body),
    });
    const response = await POST(request);
    const result = await response.json() as { code?: string; error?: string };

    assert.equal(response.status, 503);
    assert.equal(result.code, "AI_NOT_CONFIGURED");
    assert.match(result.error ?? "", /OPENAI_API_KEY/);
  } finally {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});
