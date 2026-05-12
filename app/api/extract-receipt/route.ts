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

export async function POST(request: Request) {
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

    const receiptFile = receipt as File;

    console.info("[receipt-extraction] file validation passed");
    console.info("[receipt-extraction] ai call started");

    const extraction = await extractReceiptFromImage({
      file: receiptFile,
      apiKey,
      model
    });

    console.info("[receipt-extraction] ai call succeeded");
    console.info("[receipt-extraction] schema validation passed");

    return jsonResponse({ data: extraction });
  } catch (error) {
    if (error instanceof ReceiptExtractionError) {
      console.warn("[receipt-extraction] extraction failed", { code: error.code, status: error.status });
      return errorResponse(error.code, error.message, error.status);
    }

    console.error("[receipt-extraction] unexpected failure", error);
    return errorResponse(
      "UNKNOWN_ERROR",
      "Receipt extraction failed. Please try again with a clearer image.",
      500
    );
  }
}
