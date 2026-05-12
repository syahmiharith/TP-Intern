import { ReceiptExtraction, ExtractionErrorCode } from "@/lib/receipt";
import { normalizeReceiptExtraction } from "@/lib/receipt-normalizer";

const GEMINI_REQUEST_TIMEOUT_MS = 20_000;

const EXTRACTION_PROMPT = `You are a careful receipt data extraction assistant.

Extract only these required fields from the receipt image:
- merchantName
- date
- totalAmount
- currency

Return only valid JSON matching this exact schema:
{
  "merchantName": string | null,
  "date": string | null,
  "totalAmount": number | string | null,
  "currency": string | null,
  "confidence": "high" | "medium" | "low",
  "warnings": string[]
}

Rules:
- Do not include markdown.
- Do not guess values that are not visible.
- Use null for unreadable or missing values.
- Format date as YYYY-MM-DD when possible.
- totalAmount should be a number without currency symbols when possible.
- currency should be a 3-letter code when possible, such as MYR, USD, KRW, EUR, SGD.
- Add short warnings for uncertainty, unreadable fields, or assumptions.`;

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
  };
};

export class ReceiptExtractionError extends Error {
  code: ExtractionErrorCode;
  status: number;

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

export async function extractReceiptFromImage({
  file,
  apiKey,
  model,
  timeoutMs
}: {
  file: File;
  apiKey: string;
  model: string;
  timeoutMs?: number;
}): Promise<ReceiptExtraction> {
  const arrayBuffer = await file.arrayBuffer();
  const base64Image = Buffer.from(arrayBuffer).toString("base64");
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs ?? GEMINI_REQUEST_TIMEOUT_MS);

  let geminiResponse: Response;

  try {
    geminiResponse = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
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
      throw new ReceiptExtractionError("AI_PROVIDER_ERROR", "Gemini extraction timed out. Please try again.", 504);
    }

    throw new ReceiptExtractionError("AI_PROVIDER_ERROR", "Gemini extraction request failed.", 502);
  } finally {
    clearTimeout(timeout);
  }

  const geminiJson = (await geminiResponse.json()) as GeminiResponse;

  if (!geminiResponse.ok) {
    throw new ReceiptExtractionError(
      "AI_PROVIDER_ERROR",
      geminiJson.error?.message || "Gemini extraction request failed.",
      geminiResponse.status
    );
  }

  const modelText = geminiJson.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("")
    .trim();

  if (!modelText) {
    throw new ReceiptExtractionError("INVALID_AI_RESPONSE", "Gemini returned an empty response.", 502);
  }

  try {
    return normalizeReceiptExtraction(JSON.parse(extractJsonText(modelText)));
  } catch (error) {
    if (error instanceof ReceiptExtractionError) throw error;
    throw new ReceiptExtractionError(
      "INVALID_AI_RESPONSE",
      error instanceof Error ? error.message : "Gemini returned an invalid response.",
      502
    );
  }
}
