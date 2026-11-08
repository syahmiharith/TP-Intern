import { isIP } from "node:net";

/** Vercel overwrites these headers at its trusted edge. Other production hosts
 * share an unknown bucket until a trusted proxy integration is implemented. */
export function receiptClientIp(request: Request) {
  if(process.env.NODE_ENV==="production" && process.env.VERCEL!=="1")return "unknown";
  const value=(process.env.VERCEL==="1" ? request.headers.get("x-vercel-forwarded-for") : null)
    ?? request.headers.get("x-forwarded-for") ?? "";
  const ip=value.split(",")[0].trim();
  if(ip.length>64 || !isIP(ip))return "unknown";
  return isIP(ip)===6 ? new URL(`http://[${ip}]/`).hostname : ip;
}
