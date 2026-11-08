import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { POST } from "@/app/api/extract-receipt/route";
import { reserveProviderCall } from "@/lib/shared-budget";
import { resetReceiptExtractionRateLimitForTests } from "@/lib/rate-limit";

vi.mock("@/lib/shared-budget", () => ({ reserveProviderCall: vi.fn() }));
const budget = vi.mocked(reserveProviderCall);
const extraction = { merchantName: "Cafe", receiptType: "Other", date: "2026-11-06", totalAmount: 12, currency: "USD", confidence: "high", notes: [], items: [] };
function request() {
  const file = new File(["synthetic"], "sample.png", { type: "image/png" });
  Object.defineProperty(file, "arrayBuffer", { value: async () => new ArrayBuffer(9) });
  return { headers: new Headers(), formData: async () => ({ get: () => file }) } as unknown as Request;
}
function success() {
  return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(extraction) }] } }] });
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("GEMINI_API_KEY", "test-key");
  budget.mockReset().mockResolvedValue(null);
  resetReceiptExtractionRateLimitForTests();
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });
it("recovers from transient failure and reserves every attempt", async () => {
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({ error: { status: "UNAVAILABLE" } }, { status: 503 })).mockResolvedValueOnce(success());
  vi.stubGlobal("fetch", fetch);
  const pending = POST(request());
  await vi.runAllTimersAsync();
  expect((await pending).status).toBe(200);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(budget).toHaveBeenCalledTimes(2);
});
it("stops before retry when the budget is exhausted", async () => {
  budget.mockResolvedValueOnce(null).mockResolvedValueOnce(Response.json({ error: "Budget reached" }, { status: 429 }));
  const fetch = vi.fn(async () => Response.json({ error: { status: "UNAVAILABLE" } }, { status: 503 }));
  vi.stubGlobal("fetch", fetch);
  const pending = POST(request());
  await vi.runAllTimersAsync();
  const response = await pending;
  expect(response.status).toBe(429);
  expect(response.headers.get("Retry-After")).toBe("60");
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("does not retry quota errors", async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ error: { status: "RESOURCE_EXHAUSTED" } }, { status: 429 }));
  vi.stubGlobal("fetch", fetch);
  expect((await POST(request())).status).toBe(429);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(budget).toHaveBeenCalledTimes(1);
});
it("bounds persistent transient failures to two provider calls", async () => {
  const fetch = vi.fn(async () => Response.json({ error: { status: "UNAVAILABLE" } }, { status: 503 }));
  vi.stubGlobal("fetch", fetch);
  const pending = POST(request());
  await vi.runAllTimersAsync();
  expect((await pending).status).toBe(503);
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("logs only bounded quota metadata and retry delay without provider message or project identifiers",async()=>{
 const warning=vi.spyOn(console,"warn").mockImplementation(()=>{});
 vi.stubGlobal("fetch",vi.fn().mockResolvedValue(Response.json({error:{status:"RESOURCE_EXHAUSTED",message:"private provider message",details:[{"@type":"type.googleapis.com/google.rpc.QuotaFailure",violations:[{quotaMetric:"generativelanguage.googleapis.com/generate_content_free_tier_requests",quotaId:"GenerateRequestsPerMinutePerProjectPerModel-FreeTier",quotaValue:"2",quotaDimensions:{project:"private-project"}}]},{"@type":"type.googleapis.com/google.rpc.RetryInfo",retryDelay:"12.3s"}]}},{status:429})));
 const response=await POST(request());expect(response.status).toBe(429);
 const failure=warning.mock.calls.find(call=>call[0]==="[receipt-extraction] extraction failed")![1];
 expect(failure).toMatchObject({retryAfterSeconds:13,providerQuota:[{metric:"generativelanguage.googleapis.com/generate_content_free_tier_requests",limit:"GenerateRequestsPerMinutePerProjectPerModel-FreeTier",value:"2"}]});
 expect(JSON.stringify(failure)).not.toContain("private provider message");expect(JSON.stringify(failure)).not.toContain("private-project");expect(JSON.stringify(await response.json())).not.toContain("providerQuota");
});

it("ignores malformed quota details while preserving the original provider failure",async()=>{
 vi.stubGlobal("fetch",vi.fn().mockResolvedValue(Response.json({error:{status:"RESOURCE_EXHAUSTED",details:[null,{violations:"invalid"},{retryDelay:"not a duration"}]}},{status:429})));
 const response=await POST(request());expect(response.status).toBe(429);expect((await response.json()).code).toBe("AI_PROVIDER_ERROR");
});
