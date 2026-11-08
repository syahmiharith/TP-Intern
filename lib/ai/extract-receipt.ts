import { createHash } from "node:crypto";
import { ReceiptExtraction, ExtractionErrorCode, receiptExtractionSchema } from "@/lib/receipt";
import { normalizeReceiptExtraction } from "@/lib/receipt-normalizer";

const GEMINI_REQUEST_TIMEOUT_MS = 45_000;

const EXTRACTION_PROMPT = `You are a careful receipt data extraction assistant.

Extract only these fields from the receipt image:
- merchantName
- receiptType
- currency
- totalAmount
- date
- confidence
- notes
- items

Classify receiptType into exactly one of:
Food & Beverage, Groceries, Retail, Transport, Utilities, Medical, Accommodation, Entertainment, Other.

Return only valid JSON matching this exact schema:
{
  "merchantName": string | null,
  "receiptType": "Food & Beverage" | "Groceries" | "Retail" | "Transport" | "Utilities" | "Medical" | "Accommodation" | "Entertainment" | "Other" | null,
  "currency": string | null,
  "date": string | null,
  "totalAmount": number | null,
  "confidence": "high" | "medium" | "low",
  "notes": string[],
  "items": [
    {
      "name": string,
      "quantity": number | null,
      "value": number | null
    }
  ]
}

Rules:
- Do not include markdown.
- Do not guess values that are not visible.
- Use null for unreadable or missing values.
- Use Other when receipt type is unclear.
- Format date as YYYY-MM-DD when possible.
- totalAmount must be a number only, without currency symbols.
- currency should be a 3-letter code when possible, such as MYR, USD, KRW, EUR, SGD.
- Do not invent line items.
- If item quantity is unclear, use null.
- If item value is unclear, use null.
- Add short notes for uncertainty, unreadable fields, or assumptions.`;

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
  error?: {
    message?: string;
    status?: string;
    details?: Array<{
      "@type"?: string;
      retryDelay?: string;
      reason?: string;
      metadata?: Record<string,string>;
      violations?: Array<{quotaMetric?:string;quotaId?:string;quotaValue?:string}>;
    }>;
  };
};

export class ReceiptExtractionError extends Error {
  code: ExtractionErrorCode;
  status: number;
  providerStatus?: string;
  providerQuota?: {metric?:string;limit?:string;value?:string}[];
  providerReason?: string;
  retryAfterSeconds?: number;

  constructor(code: ExtractionErrorCode, message: string, status: number) {
    super(message);
    this.name = "ReceiptExtractionError";
    this.code = code;
    this.status = status;
  }
}

function extractJsonText(rawText: string) {
  const trimmed = rawText.trim();
  const withoutFence = trimmed
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  const firstBrace = withoutFence.indexOf("{");
  const lastBrace = withoutFence.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1 || firstBrace > lastBrace) {
    throw new ReceiptExtractionError("INVALID_AI_RESPONSE", "The model did not return a JSON object.", 502);
  }

  return withoutFence.slice(firstBrace, lastBrace + 1);
}

function getGeminiPublicErrorMessage(status: number) {
  if (status === 429) {
    return "Too many requests. Try again later, or use sample receipts.";
  }

  if (status === 500 || status === 502 || status === 503 || status === 504) {
    return "Extraction is temporarily unavailable. Try again later, or use sample receipts.";
  }

  return "Extraction is unavailable. Try sample receipts or retry later.";
}

function buildNeedsReviewFallback(note: string): ReceiptExtraction {
  return receiptExtractionSchema.parse({
    merchantName: null,
    receiptType: null,
    currency: null,
    totalAmount: null,
    date: null,
    confidence: "low",
    notes: [note],
    items: []
  });
}

type ExtractReceiptOptions = {
  file: File;
  apiKey: string;
  model: string;
  timeoutMs?: number;
  beforeRetry?: () => Promise<void>;
  fallbackModel?: string;
};

const dailyQuotaModels = new Map<string,{day:string;until?:number}>();
const quotaDay = new Intl.DateTimeFormat("en-CA",{timeZone:"America/Los_Angeles",year:"numeric",month:"2-digit",day:"2-digit"});
export function resetGeminiQuotaCacheForTests() { dailyQuotaModels.clear(); }

function isExhaustedModelDay(error:ReceiptExtractionError) {
  const quotas=error.providerQuota??[];
  return error.status===429 && quotas.length>0 && quotas.every(quota=>quota.limit?.includes("PerModel") && Number.isSafeInteger(Number(quota.value)) && Number(quota.value)>0)
    && quotas.some(quota=>quota.limit?.includes("PerDay"));
}

export async function extractReceiptFromImage(options: ExtractReceiptOptions): Promise<ReceiptExtraction> {
  const attemptOptions = { ...options, timeoutMs: options.timeoutMs ?? GEMINI_REQUEST_TIMEOUT_MS };
  const fallback=options.fallbackModel;
  const canFallback=Boolean(fallback && fallback!==options.model && /^gemini-[a-zA-Z0-9._-]+$/.test(fallback));
  const cacheKey=`${options.model}:${createHash("sha256").update(options.apiKey).digest("hex").slice(0,16)}`;
  const day=quotaDay.format(new Date());
  const unavailable=dailyQuotaModels.get(cacheKey);
  const cached=canFallback && unavailable?.day===day && (!unavailable.until||unavailable.until>Date.now());
  if(cached)console.info("[receipt-extraction] using Gemini fallback",{model:fallback,reason:"known model daily quota"});
  else dailyQuotaModels.delete(cacheKey);
  const firstAttempt=cached?{...attemptOptions,model:fallback!}:attemptOptions;
  try {
    return await extractReceiptAttempt(firstAttempt);
  } catch (error) {
    if (error instanceof ReceiptExtractionError && canFallback && !cached && isExhaustedModelDay(error)) {
      // A different Gemini model has its own entitlement. Never repeat the exhausted model,
      // rotate credentials, or bypass account-wide, zero-allocation or unknown quota errors.
      if(dailyQuotaModels.size>=4)dailyQuotaModels.delete(dailyQuotaModels.keys().next().value!);
      dailyQuotaModels.set(cacheKey,{day,until:error.retryAfterSeconds?Date.now()+error.retryAfterSeconds*1000:undefined});
      await options.beforeRetry?.();
      console.info("[receipt-extraction] using Gemini fallback",{model:fallback,reason:"model daily quota",providerQuota:error.providerQuota});
      return extractReceiptAttempt({...attemptOptions,model:fallback!});
    }
    if (!(error instanceof ReceiptExtractionError) || error.code !== "AI_PROVIDER_ERROR" ||
        ![500, 502, 503, 504].includes(error.status)) {
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
    await options.beforeRetry?.();
    console.info("[receipt-extraction] retrying transient provider failure", {
      status: error.status,
      providerStatus: error.providerStatus
    });
    return extractReceiptAttempt({ ...firstAttempt, timeoutMs: Math.min(attemptOptions.timeoutMs, 10_000) });
  }
}

async function extractReceiptAttempt({ file, apiKey, model, timeoutMs }: ExtractReceiptOptions): Promise<ReceiptExtraction> {
  const arrayBuffer = await file.arrayBuffer();
  const base64Image = Buffer.from(arrayBuffer).toString("base64");
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs ?? GEMINI_REQUEST_TIMEOUT_MS);

  let geminiResponse: Response;

  try {
    geminiResponse = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: EXTRACTION_PROMPT },
              {
                inline_data: {
                  mime_type: file.type,
                  data: base64Image
                }
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json"
        }
      })
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new ReceiptExtractionError("AI_PROVIDER_ERROR", "Extraction timed out. Please try again.", 504);
    }

    throw new ReceiptExtractionError("AI_PROVIDER_ERROR", "Extraction failed.", 502);
  } finally {
    clearTimeout(timeout);
  }

  const geminiJson = (await geminiResponse.json()) as GeminiResponse;

  if (!geminiResponse.ok) {
    const error = new ReceiptExtractionError(
      "AI_PROVIDER_ERROR",
      getGeminiPublicErrorMessage(geminiResponse.status),
      geminiResponse.status
    );
    const providerStatus = geminiJson.error?.status;
    if (providerStatus && /^[A-Z_]{1,64}$/.test(providerStatus)) {
      error.providerStatus = providerStatus;
    }
    const details=Array.isArray(geminiJson.error?.details)?geminiJson.error.details.filter(detail=>detail&&typeof detail==="object").slice(0,10):[];
    const safe=(value:unknown)=>typeof value==="string"&&/^[a-zA-Z0-9_./-]{1,180}$/.test(value)?value:undefined;
    error.providerQuota=details.flatMap(detail=>[
      ...(Array.isArray(detail.violations)?detail.violations.filter(violation=>violation&&typeof violation==="object"):[]).map(violation=>({metric:safe(violation.quotaMetric),limit:safe(violation.quotaId),value:safe(violation.quotaValue)})),
      ...(detail.metadata?.quota_metric?[{metric:safe(detail.metadata.quota_metric),limit:safe(detail.metadata.quota_limit),value:safe(detail.metadata.quota_limit_value)}]:[])
    ]).filter(quota=>quota.metric||quota.limit).slice(0,10);
    error.providerReason=details.map(detail=>detail.reason).find(reason=>typeof reason==="string"&&/^[A-Z_]{1,64}$/.test(reason));
    const retryDelay=details.find(detail=>detail["@type"]==="type.googleapis.com/google.rpc.RetryInfo")?.retryDelay;
    if(typeof retryDelay==="string"&&/^\d+(?:\.\d+)?s$/.test(retryDelay)){
      const seconds=Math.ceil(Number(retryDelay.slice(0,-1)));
      if(seconds>0&&seconds<=86400)error.retryAfterSeconds=seconds;
    }
    throw error;
  }

  const modelText = geminiJson.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("")
    .trim();

  if (!modelText) {
    return buildNeedsReviewFallback(
      "No details could be read. Check the image and enter the fields manually."
    );
  }

  try {
    return normalizeReceiptExtraction(JSON.parse(extractJsonText(modelText)));
  } catch (error) {
    if (error instanceof ReceiptExtractionError) {
      return buildNeedsReviewFallback(
        "Some details could not be read. Please inspect the image and enter the fields manually."
      );
    }

    throw new ReceiptExtractionError(
      "INVALID_AI_RESPONSE",
      error instanceof Error ? error.message : "The extraction service returned an invalid response.",
      502
    );
  }
}
