import { receiptClientIp } from "./client-ip";
import { readPilotSession, pilotAccessRequired } from "./pilot-access";

/** Atomic reservation across server instances using a Redis REST endpoint. */
export async function reserveProviderCall(request: Request): Promise<Response | null> {
  const invite=readPilotSession(request);
  if(!invite)return pilotAccessRequired();
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    if (process.env.NODE_ENV !== "production") return null;
    return Response.json({ code: "RATE_LIMITED", error: "Live extraction is temporarily unavailable. Try sample receipts." }, { status: 503 });
  }
  const minute = Math.floor(Date.now() / 60000);
  const day = new Date().toISOString().slice(0, 10);
  const ip = receiptClientIp(request);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip));
  const key = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  const budget = Number(process.env.PROVIDER_DAILY_BUDGET ?? 100);
  if (!Number.isSafeInteger(budget) || budget < 1 || budget > 100) return Response.json({ code: "RATE_LIMITED", error: "Live extraction unavailable. Try samples." }, { status: 503 });
  const script = `local a=tonumber(redis.call('GET',KEYS[1]) or '0') local b=tonumber(redis.call('GET',KEYS[2]) or '0') local c=tonumber(redis.call('GET',KEYS[3]) or '0') if a>=15 or b>=tonumber(ARGV[1]) or c>=tonumber(ARGV[2]) then return 0 end redis.call('INCR',KEYS[1]) redis.call('EXPIRE',KEYS[1],120) redis.call('INCR',KEYS[2]) redis.call('EXPIRE',KEYS[2],172800) redis.call('INCR',KEYS[3]) redis.call('EXPIRE',KEYS[3],tonumber(ARGV[3])) return 1`;
  try {
    const response = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(["EVAL", script, "3", `receipt:minute:${minute}:${key}`, `receipt:day:${day}`, `receipt:invite:${invite.hash}`, String(budget), String(invite.maxCalls), String(Math.max(1,Math.ceil((Date.parse(invite.expiresAt)-Date.now())/1000))+86400)]), signal: AbortSignal.timeout(5000), cache: "no-store" });
    const result = await response.json();
    if (!response.ok || result.error) throw new Error("Budget service unavailable");
    if (result.result === 1) return null;
    return Response.json({ code: "RATE_LIMITED", error: "Extraction allowance reached. Retry later or use sample receipts." }, { status: 429, headers: { "Retry-After": "60" } });
  } catch {
    return Response.json({ code: "RATE_LIMITED", error: "Live extraction temporarily unavailable. Try sample receipts." }, { status: 503 });
  }
}
