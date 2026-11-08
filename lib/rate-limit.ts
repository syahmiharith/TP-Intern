import { receiptClientIp } from "./client-ip";

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 15;
const MAX_BUCKETS = 4096;

const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

export function checkReceiptExtractionRateLimit(request: Request) {
  const now = Date.now();
  const clientIp = receiptClientIp(request);
  const current = rateLimitBuckets.get(clientIp);

  if (!current || current.resetAt <= now) {
    if(rateLimitBuckets.size>=MAX_BUCKETS){
      for(const [key,bucket] of rateLimitBuckets)if(bucket.resetAt<=now)rateLimitBuckets.delete(key);
      if(!current && rateLimitBuckets.size>=MAX_BUCKETS)return Response.json({code:"RATE_LIMITED",error:"Extraction is busy. Retry shortly."},{status:429,headers:{"Retry-After":"60"}});
    }
    rateLimitBuckets.set(clientIp, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return null;
  }

  if (current.count >= RATE_LIMIT_MAX_REQUESTS) {
    return Response.json(
      {
        code: "RATE_LIMITED",
        error: "Rate limit exceeded. You can extract up to 15 receipts per minute. Please wait before trying again."
      },
      { status: 429, headers: { "Retry-After": String(Math.max(1,Math.ceil((current.resetAt-now)/1000))) } }
    );
  }

  current.count += 1;
  return null;
}

export function resetReceiptExtractionRateLimitForTests() {
  rateLimitBuckets.clear();
}
