import { describe, expect, it, vi } from "vitest";
import { analyzeWithGemini, geminiParts, VISION_MODEL } from "../src/gemini.js";

describe("Gemini client", () => {
  it("preserves file and page order", () => {
    expect(geminiParts("prompt", [
      { type: "text", fileNumber: 1, pageNumber: 1, text: "first" },
      { type: "image", fileNumber: 1, pageNumber: 1, mediaType: "image/jpeg", bytes: new Uint8Array([1]) },
      { type: "text", fileNumber: 2, text: "second" },
    ])).toEqual([
      { text: "prompt" },
      { text: "\n\n--- File 1, page 1 ---\n" },
      { text: "first" },
      { inlineData: { data: "AQ==", mimeType: "image/jpeg" } },
      { text: "\n\n--- File 2 ---\n" },
      { text: "second" },
    ]);
  });

  it("uses the configured gateway and fixed model", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({
      candidates: [{ content: { parts: [{ text: "answer" }] } }],
    }));
    await expect(analyzeWithGemini(
      { accountId: "account", apiToken: "token", gateway: "gateway" },
      "prompt",
      [{ type: "text", fileNumber: 1, text: "document" }],
      fetcher,
    )).resolves.toBe("answer");
    expect(fetcher.mock.calls[0]?.[0]).toContain(`/models/${VISION_MODEL}:generateContent`);
    expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get("cf-aig-authorization"))
      .toBe("Bearer token");
  });
});
