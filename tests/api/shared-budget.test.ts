import { afterEach, expect, it, vi } from "vitest";
import { reserveProviderCall } from "@/lib/shared-budget";
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it("fails closed in production without shared budget configuration", async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
  expect((await reserveProviderCall(new Request("http://localhost")))?.status).toBe(503);
});
it("atomically reserves the shared budget and returns retry guidance", async () => {
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.com");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test");
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ result: 1 }) });
  vi.stubGlobal("fetch", fetch);
  expect(await reserveProviderCall(new Request("http://localhost"))).toBeNull();
  expect(JSON.parse(fetch.mock.calls[0][1].body)[0]).toBe("EVAL");
  fetch.mockResolvedValue({ ok: true, json: async () => ({ result: 0 }) });
  const response = await reserveProviderCall(new Request("http://localhost"));
  expect(response?.status).toBe(429);
  expect(response?.headers.get("Retry-After")).toBe("60");
});
