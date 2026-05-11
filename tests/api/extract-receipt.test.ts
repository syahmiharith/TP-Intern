import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/extract-receipt/route";

const originalEnv = process.env;

function createRequest(file?: File) {
  const formData = new FormData();
  if (file) {
    formData.append("receipt", file);
  }

  return new Request("http://localhost:3000/api/extract-receipt", {
    method: "POST",
    body: formData
  });
}

function createImageFile(name = "receipt.png", content = "fake image content") {
  return new File([content], name, { type: "image/png" });
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
  return response.json() as Promise<{ data?: unknown; error?: string }>;
}

describe("POST /api/extract-receipt", () => {
  beforeEach(() => {
    vi.resetModules();
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
    expect(body.error).toContain("Missing GEMINI_API_KEY");
  });

  it("returns 400 when no file is uploaded", async () => {
    process.env.GEMINI_API_KEY = "test-key";

    const response = await POST(createRequest());
    const body = await readJson(response);

    expect(response.status).toBe(400);
    expect(body.error).toBe("No receipt image was uploaded.");
  });

  it("returns 400 for non-image files", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    const file = new File(["hello"], "notes.txt", { type: "text/plain" });

    const response = await POST(createRequest(file));
    const body = await readJson(response);

    expect(response.status).toBe(400);
    expect(body.error).toContain("Only image receipts are supported");
  });

  it("returns 400 for images larger than 5MB", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    const largeFile = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "large.png", {
      type: "image/png"
    });

    const response = await POST(createRequest(largeFile));
    const body = await readJson(response);

    expect(response.status).toBe(400);
    expect(body.error).toBe("Receipt image must be 5MB or smaller.");
  });

  it("extracts and validates a successful Gemini JSON response", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    mockGeminiResponse(
      JSON.stringify({
        merchantName: "FamilyMart",
        date: "2026-05-11",
        totalAmount: 12000,
        currency: "KRW",
        confidence: "high",
        notes: []
      })
    );

    const response = await POST(createRequest(createImageFile()));
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(body.data).toEqual({
      merchantName: "FamilyMart",
      date: "2026-05-11",
      totalAmount: 12000,
      currency: "KRW",
      confidence: "high",
      notes: []
    });
  });

  it("parses Gemini JSON even when wrapped in markdown fences", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    mockGeminiResponse(`\`\`\`json
{
  "merchantName": "Tealive",
  "date": "2026-05-11",
  "totalAmount": 8.9,
  "currency": "MYR",
  "confidence": "medium",
  "notes": ["Currency inferred from receipt symbol."]
}
\`\`\``);

    const response = await POST(createRequest(createImageFile()));
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(body.data).toEqual({
      merchantName: "Tealive",
      date: "2026-05-11",
      totalAmount: 8.9,
      currency: "MYR",
      confidence: "medium",
      notes: ["Currency inferred from receipt symbol."]
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
    expect(body.error).toBe("Rate limit exceeded");
  });

  it("returns 500 when Gemini returns invalid JSON", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    mockGeminiResponse("I cannot read this receipt.");

    const response = await POST(createRequest(createImageFile()));
    const body = await readJson(response);

    expect(response.status).toBe(500);
    expect(body.error).toContain("JSON object");
  });
});
