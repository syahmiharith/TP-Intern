import { configurePilotAccess, budgetRequest } from "./support/pilot";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { reserveProviderCall } from "@/lib/shared-budget";
beforeEach(configurePilotAccess);
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it("fails closed in production without shared budget configuration", async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
  vi.stubEnv("KV_REST_API_URL", "");
  expect((await reserveProviderCall(budgetRequest()))?.status).toBe(503);
});
it("uses Vercel integration-managed Redis credentials", async () => {
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
  vi.stubEnv("KV_REST_API_URL", "https://integration.example.com");
  vi.stubEnv("KV_REST_API_TOKEN", "integration-test");
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ result: 1 }) });
  vi.stubGlobal("fetch", fetch);
  expect(await reserveProviderCall(budgetRequest())).toBeNull();
  expect(fetch).toHaveBeenCalledWith("https://integration.example.com", expect.objectContaining({
    headers: { Authorization: "Bearer integration-test", "Content-Type": "application/json" }
  }));
});
it("atomically reserves the shared budget and returns retry guidance", async () => {
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.com");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test");
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ result: 1 }) });
  vi.stubGlobal("fetch", fetch);
  expect(await reserveProviderCall(budgetRequest())).toBeNull();
  expect(JSON.parse(fetch.mock.calls[0][1].body)[0]).toBe("EVAL");
  fetch.mockResolvedValue({ ok: true, json: async () => ({ result: 0 }) });
  const response = await reserveProviderCall(budgetRequest());
  expect(response?.status).toBe(429);
  expect(response?.headers.get("Retry-After")).toBe("60");
});
it("reserves the invite lifetime allowance in the same atomic operation as IP and global limits",async()=>{
 vi.stubEnv("UPSTASH_REDIS_REST_URL","https://example.com");vi.stubEnv("UPSTASH_REDIS_REST_TOKEN","test");const fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>({result:1})});vi.stubGlobal("fetch",fetch);await reserveProviderCall(budgetRequest());const command=JSON.parse(fetch.mock.calls[0][1].body);
 expect(command[0]).toBe("EVAL");expect(command[2]).toBe("3");expect(command[5]).toMatch(/^receipt:invite:[a-f0-9]{64}$/);expect(command.slice(6,8)).toEqual(["100","20"]);expect(command[1]).toContain("c>=tonumber(ARGV[2])");expect(command[1].indexOf("c>=tonumber(ARGV[2])")).toBeLessThan(command[1].indexOf("redis.call('INCR'"));
});
it("rejects missing access, excessive budget configuration and Redis failure without allowing extraction",async()=>{
 const fetch=vi.fn();vi.stubGlobal("fetch",fetch);expect((await reserveProviderCall(new Request("http://localhost")))?.status).toBe(401);expect(fetch).not.toHaveBeenCalled();
 vi.stubEnv("UPSTASH_REDIS_REST_URL","https://example.com");vi.stubEnv("UPSTASH_REDIS_REST_TOKEN","test");vi.stubEnv("PROVIDER_DAILY_BUDGET","101");expect((await reserveProviderCall(budgetRequest()))?.status).toBe(503);expect(fetch).not.toHaveBeenCalled();
 vi.stubEnv("PROVIDER_DAILY_BUDGET","100");fetch.mockRejectedValue(new Error("private Redis detail"));const response=await reserveProviderCall(budgetRequest());expect(response?.status).toBe(503);expect(JSON.stringify(await response?.json())).not.toContain("private Redis detail");
});
