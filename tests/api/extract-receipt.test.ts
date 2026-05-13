import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/extract-receipt/route";
import { resetReceiptExtractionRateLimitForTests } from "@/lib/rate-limit";

const originalEnv = process.env;

function createRequest(file?: File, headers?: Record<string, string>) {
  if (file && typeof file.arrayBuffer !== "function") {
    Object.defineProperty(file, "arrayBuffer", {
      value: async () => new ArrayBuffer(file.size)
    });
  }

  return {
    headers: new Headers(headers),
    formData: async () =>
      ({
        get: (name: string) => (name === "receipt" ? file ?? null : null)
      }) as FormData
  } as unknown as Request;
}

function createBrokenRequest() {
  return {
    headers: new Headers(),
    formData: async () => {
      throw new Error("internal parser detail");
    }
  } as unknown as Request;
}

function createImageFile(name = "receipt.png", content = "fake image content") {
  return new File([content], name, { type: "image/png" });
}

function createReceiptFile(type: string, name = "receipt") {
  const extension = type.split("/")[1]?.replace("jpeg", "jpg") || "bin";
  return new File(["fake image content"], `${name}.${extension}`, { type });
}

function mockGeminiResponse(text: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text }]
            }
          }
        ]
      })
    }))
  );
}

async function readJson(response: Response) {
  return response.json() as Promise<{ data?: unknown; code?: string; error?: string }>;
}

describe("POST /api/extract-receipt", () => {
  beforeEach(() => {
    vi.resetModules();
    resetReceiptExtractionRateLimitForTests();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns 500 when GEMINI_API_KEY is missing", async () => {
    delete process.env.GEMINI_API_KEY;

    const response = await POST(createRequest(createImageFile()));
    const body = await readJson(response);

    expect(response.status).toBe(500);
    expect(body.code).toBe("AI_PROVIDER_ERROR");
    expect(body.error).toBe("Receipt extraction is not configured. Please contact the project owner.");
  });

  it("returns 400 when no file is uploaded", async () => {
    process.env.GEMINI_API_KEY = "test-key";

    const response = await POST(createRequest());
    const body = await readJson(response);

    expect(response.status).toBe(400);
    expect(body.code).toBe("NO_RECEIPT_UPLOADED");
    expect(body.error).toBe("No receipt image was uploaded.");
  });

  it("returns 400 for non-image files", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    const file = new File(["hello"], "notes.txt", { type: "text/plain" });

    const response = await POST(createRequest(file));
    const body = await readJson(response);

    expect(response.status).toBe(400);
    expect(body.code).toBe("INVALID_FILE_TYPE");
    expect(body.error).toContain("Only JPG, PNG, or WEBP");
  });

  it.each(["image/svg+xml", "image/gif"])("rejects unsupported image MIME type: %s", async (mimeType) => {
    process.env.GEMINI_API_KEY = "test-key";

    const response = await POST(createRequest(createReceiptFile(mimeType)));
    const body = await readJson(response);

    expect(response.status).toBe(400);
    expect(body.code).toBe("INVALID_FILE_TYPE");
    expect(body.error).toContain("Only JPG, PNG, or WEBP");
  });

  it.each(["image/jpeg", "image/png", "image/webp"])("accepts supported image MIME type: %s", async (mimeType) => {
    process.env.GEMINI_API_KEY = "test-key";
    mockGeminiResponse(
      JSON.stringify({
        merchantName: "FamilyMart",
        receiptType: "Groceries",
        date: "2026-05-11",
        totalAmount: 12000,
        currency: "KRW",
        confidence: "high",
        notes: [],
        items: []
      })
    );

    const response = await POST(createRequest(createReceiptFile(mimeType)));
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({
      merchantName: "FamilyMart",
      currency: "KRW"
    });
  });

  it("returns 400 for images larger than 5MB", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    const largeFile = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "large.png", {
      type: "image/png"
    });

    const response = await POST(createRequest(largeFile));
    const body = await readJson(response);

    expect(response.status).toBe(400);
    expect(body.code).toBe("FILE_TOO_LARGE");
    expect(body.error).toBe("Receipt image must be 5MB or smaller.");
  });

  it("extracts and validates a successful Gemini JSON response", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    mockGeminiResponse(
      JSON.stringify({
        merchantName: "FamilyMart",
        receiptType: "Groceries",
        date: "2026-05-11",
        totalAmount: 12000,
        currency: "KRW",
        confidence: "high",
        notes: [],
        items: []
      })
    );

    const response = await POST(createRequest(createImageFile()));
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(body.data).toEqual({
      merchantName: "FamilyMart",
      receiptType: "Groceries",
      date: "2026-05-11",
      totalAmount: 12000,
      currency: "KRW",
      confidence: "high",
      notes: [],
      items: []
    });
  });

  it("parses Gemini JSON even when wrapped in markdown fences", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    mockGeminiResponse(`\`\`\`json
{
  "merchantName": "Tealive",
  "receiptType": "Food & Beverage",
  "date": "2026-05-11",
  "totalAmount": 8.9,
  "currency": "MYR",
  "confidence": "medium",
  "notes": ["Currency inferred from receipt symbol."],
  "items": [{"name": "Milk Tea", "quantity": 1, "value": 8.9}]
}
\`\`\``);

    const response = await POST(createRequest(createImageFile()));
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(body.data).toEqual({
      merchantName: "Tealive",
      receiptType: "Food & Beverage",
      date: "2026-05-11",
      totalAmount: 8.9,
      currency: "MYR",
      confidence: "medium",
      notes: ["Currency inferred from receipt symbol."],
      items: [{ name: "Milk Tea", quantity: 1, value: 8.9 }]
    });
  });

  it("normalizes partial Gemini responses and returns notes", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    mockGeminiResponse(
      JSON.stringify({
        merchantName: "  Starbucks  ",
        receiptType: "Retail",
        date: null,
        totalAmount: "MYR 18.90",
        currency: "rm",
        confidence: "medium",
        warnings: ["Date is unreadable."]
      })
    );

    const response = await POST(createRequest(createImageFile()));
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(body.data).toEqual({
      merchantName: "Starbucks",
      receiptType: "Retail",
      date: null,
      totalAmount: 18.9,
      currency: "MYR",
      confidence: "medium",
      notes: [
        "Date is unreadable.",
        "Date could not be confidently extracted. Please enter it manually."
      ],
      items: []
    });
  });

  it("passes through Gemini API failures safely", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 429,
        json: async () => ({
          error: { message: "Rate limit exceeded" }
        })
      }))
    );

    const response = await POST(createRequest(createImageFile()));
    const body = await readJson(response);

    expect(response.status).toBe(429);
    expect(body.code).toBe("AI_PROVIDER_ERROR");
    expect(body.error).toBe("Rate limit exceeded");
  });

  it("returns a structured timeout error when Gemini aborts", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw Object.assign(new Error("aborted"), { name: "AbortError" });
      })
    );

    const response = await POST(createRequest(createImageFile()));
    const body = await readJson(response);

    expect(response.status).toBe(504);
    expect(body.code).toBe("AI_PROVIDER_ERROR");
    expect(body.error).toBe("Gemini extraction timed out. Please try again.");
  });

  it("returns a safe public message for unexpected failures", async () => {
    process.env.GEMINI_API_KEY = "test-key";

    const response = await POST(createBrokenRequest());
    const body = await readJson(response);

    expect(response.status).toBe(500);
    expect(body.code).toBe("UNKNOWN_ERROR");
    expect(body.error).toBe("Receipt extraction failed. Please try again with a clearer image.");
    expect(body.error).not.toContain("internal parser detail");
  });

  it("rate limits repeated extraction requests from the same client IP", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    mockGeminiResponse(
      JSON.stringify({
        merchantName: "FamilyMart",
        receiptType: "Groceries",
        date: "2026-05-11",
        totalAmount: 12000,
        currency: "KRW",
        confidence: "high",
        notes: [],
        items: []
      })
    );

    const headers = { "x-forwarded-for": "203.0.113.10" };

    for (let index = 0; index < 5; index += 1) {
      const response = await POST(createRequest(createImageFile(`receipt-${index}.png`), headers));
      expect(response.status).toBe(200);
    }

    const response = await POST(createRequest(createImageFile("receipt-6.png"), headers));
    const body = await readJson(response);

    expect(response.status).toBe(429);
    expect(body.code).toBe("RATE_LIMITED");
    expect(body.error).toContain("Rate limit exceeded");
    expect(fetch).toHaveBeenCalledTimes(5);
  });

  it("returns 502 when Gemini returns invalid JSON", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    mockGeminiResponse("I cannot read this receipt.");

    const response = await POST(createRequest(createImageFile()));
    const body = await readJson(response);

    expect(response.status).toBe(502);
    expect(body.code).toBe("INVALID_AI_RESPONSE");
    expect(body.error).toContain("JSON object");
  });
});
