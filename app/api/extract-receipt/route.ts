import { reserveProviderCall } from "@/lib/shared-budget";
import { validateReceiptForm, extractionToFormValues } from "@/lib/receipt";
import { extractReceiptFromImage, ReceiptExtractionError } from "@/lib/ai/extract-receipt";
import {
  ExtractionErrorCode,
  allowedReceiptImageTypes,
  maxReceiptImageSizeBytes
} from "@/lib/receipt";
import { checkReceiptExtractionRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

type ErrorBody = {
  code: ExtractionErrorCode;
  error: string;
};

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, { status });
}

function errorResponse(code: ExtractionErrorCode, error: string, status: number) {
  return jsonResponse({ code, error } satisfies ErrorBody, status);
}

function validateReceiptFile(receipt: unknown) {
  if (!(receipt instanceof File)) {
    return errorResponse("NO_RECEIPT_UPLOADED", "No receipt image was uploaded.", 400);
  }

  if (!allowedReceiptImageTypes.includes(receipt.type as (typeof allowedReceiptImageTypes)[number])) {
    return errorResponse("INVALID_FILE_TYPE", "Only JPG, PNG, or WEBP receipt images are supported.", 400);
  }

  if (receipt.size > maxReceiptImageSizeBytes) {
    return errorResponse("FILE_TOO_LARGE", "Receipt image must be 5MB or smaller.", 400);
  }

  return null;
}

async function extract(request: Request, requestId: string) {
  console.info("[receipt-extraction] request received");

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

    if (!apiKey) {
      console.warn("[receipt-extraction] missing provider api key");
      return errorResponse(
        "AI_PROVIDER_ERROR",
        "Receipt extraction is not configured. Please contact the project owner.",
        500
      );
    }

    const rateLimitResponse = checkReceiptExtractionRateLimit(request);
    if (rateLimitResponse) {
      console.warn("[receipt-extraction] rate limit exceeded");
      return rateLimitResponse;
    }

    const formData = await request.formData();
    const receipt = formData.get("receipt");
    const validationError = validateReceiptFile(receipt);

    if (validationError) {
      console.warn("[receipt-extraction] file validation failed");
      return validationError;
    }

    const sharedLimit = await reserveProviderCall(request);
    if (sharedLimit) return sharedLimit;
    const receiptFile = receipt as File;

    console.info("[receipt-extraction] file validation passed");
    console.info("[receipt-extraction] ai call started", {
      requestId,
      model: /^gemini-[a-zA-Z0-9._-]+$/.test(model) ? model : "unrecognized-model-setting"
    });

    const extraction = await extractReceiptFromImage({
      file: receiptFile,
      apiKey,
      model,
      beforeRetry: async () => {
        const limit = await reserveProviderCall(request);
        if (limit) {
          const body = await limit.json() as { error: string };
          throw new ReceiptExtractionError("RATE_LIMITED", body.error, limit.status);
        }
      }
    });

    console.info("[receipt-extraction] ai call succeeded");
    console.info("[receipt-extraction] schema validation passed");

    return jsonResponse({ data: extraction, requestId, extractedAt: new Date().toISOString(), warnings: Object.entries(validateReceiptForm(extractionToFormValues(extraction))).map(([field, message]) => ({ field, message })) });
  } catch (error) {
    if (error instanceof ReceiptExtractionError) {
      console.warn("[receipt-extraction] extraction failed", {
        requestId, code: error.code, status: error.status, providerStatus: error.providerStatus
      });
      const response = errorResponse(error.code, error.message, error.status);
      if (error.code === "RATE_LIMITED" && error.status === 429) response.headers.set("Retry-After", "60");
      return response;
    }

    console.error("[receipt-extraction] unexpected failure", { code: "UNKNOWN_ERROR" });
    return errorResponse(
      "UNKNOWN_ERROR",
      "Receipt extraction failed. Please try again with a clearer image.",
      500
    );
  }
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  const response = await extract(request, requestId);
  response.headers.set("X-Request-ID", requestId);
  console.info("[receipt-extraction] completed", { requestId, durationMs: Date.now() - startedAt, status: response.status });
  return response;
}
