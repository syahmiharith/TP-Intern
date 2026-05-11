import { receiptExtractionSchema } from "@/lib/receipt";

export const runtime = "nodejs";

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
  "totalAmount": number | null,
  "currency": string | null,
  "confidence": "high" | "medium" | "low",
  "notes": string[]
}

Rules:
- Do not include markdown.
- Do not guess values that are not visible.
- Use null for unreadable or missing values.
- Format date as YYYY-MM-DD when possible.
- totalAmount must be a number only, without currency symbols.
- currency should be a 3-letter code when possible, such as MYR, USD, KRW, EUR, SGD.
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
  };
};

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, { status });
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
    throw new Error("The model did not return a JSON object.");
  }

  return withoutFence.slice(firstBrace, lastBrace + 1);
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

    if (!apiKey) {
      return jsonResponse(
        {
          error: "Missing GEMINI_API_KEY. Add it to .env.local locally or Vercel environment variables."
        },
        500
      );
    }

    const formData = await request.formData();
    const receipt = formData.get("receipt");

    if (!(receipt instanceof File)) {
      return jsonResponse({ error: "No receipt image was uploaded." }, 400);
    }

    if (!receipt.type.startsWith("image/")) {
      return jsonResponse({ error: "Only image receipts are supported in this MVP." }, 400);
    }

    const maxSizeInBytes = 5 * 1024 * 1024;
    if (receipt.size > maxSizeInBytes) {
      return jsonResponse({ error: "Receipt image must be 5MB or smaller." }, 400);
    }

    const arrayBuffer = await receipt.arrayBuffer();
    const base64Image = Buffer.from(arrayBuffer).toString("base64");

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const geminiResponse = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: EXTRACTION_PROMPT },
              {
                inline_data: {
                  mime_type: receipt.type,
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

    const geminiJson = (await geminiResponse.json()) as GeminiResponse;

    if (!geminiResponse.ok) {
      return jsonResponse(
        {
          error: geminiJson.error?.message || "Gemini extraction request failed."
        },
        geminiResponse.status
      );
    }

    const modelText = geminiJson.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("")
      .trim();

    if (!modelText) {
      return jsonResponse({ error: "Gemini returned an empty response." }, 502);
    }

    const parsedJson = JSON.parse(extractJsonText(modelText));
    const extraction = receiptExtractionSchema.parse(parsedJson);

    return jsonResponse({ data: extraction });
  } catch (error) {
    console.error(error);
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : "Unexpected extraction error."
      },
      500
    );
  }
}
