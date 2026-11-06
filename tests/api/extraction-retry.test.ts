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
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
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
