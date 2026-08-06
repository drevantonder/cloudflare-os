import { afterEach, describe, expect, it, vi } from "vitest";
import { createOpenAICodexFetch } from "../src/openai-codex.js";

describe("OpenAI Codex egress", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses the VPC binding when present", async () => {
    const egress = { fetch: vi.fn(async () => Response.json({ ok: true })) } as unknown as Fetcher;

    await createOpenAICodexFetch(egress)("https://chatgpt.com/backend-api/codex/responses");

    expect(egress.fetch).toHaveBeenCalledOnce();
  });

  it("explains a Cloudflare Worker egress block", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>blocked</html>", {
      status: 403,
      headers: { "content-type": "text/html" },
    })));

    const response = await createOpenAICodexFetch()("https://chatgpt.com/backend-api/codex/responses");

    await expect(response.json()).resolves.toMatchObject({
      error: { type: "cf_worker_egress_blocked" },
    });
  });
});
