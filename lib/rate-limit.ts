const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 15;

const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

function getClientIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedFor || request.headers.get("x-real-ip") || "unknown";
}

export function checkReceiptExtractionRateLimit(request: Request) {
  const now = Date.now();
  const clientIp = getClientIp(request);
  const current = rateLimitBuckets.get(clientIp);

  if (!current || current.resetAt <= now) {
    rateLimitBuckets.set(clientIp, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return null;
  }

  if (current.count >= RATE_LIMIT_MAX_REQUESTS) {
    return Response.json(
      {
        code: "RATE_LIMITED",
        error: "Rate limit exceeded. You can extract up to 15 receipts per minute. Please wait before trying again."
      },
      { status: 429 }
    );
  }

  current.count += 1;
  return null;
}

export function resetReceiptExtractionRateLimitForTests() {
  rateLimitBuckets.clear();
}
