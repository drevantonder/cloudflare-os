import { afterEach, describe, expect, it, vi } from "vitest";
import { OPENAI_CODEX_MODEL_PROVIDER } from "./model-provider.js";

describe("OpenAI Codex model provider", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses VPC egress when configured", async () => {
    const egress = { fetch: vi.fn(async () => Response.json({ ok: true })) } as unknown as Fetcher;

    await OPENAI_CODEX_MODEL_PROVIDER.createFetch(egress)("https://chatgpt.com/backend-api/codex/responses");

    expect(egress.fetch).toHaveBeenCalledOnce();
    expect((egress.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0].url)
        .toBe("https://chatgpt.com/backend-api/codex/responses");
  });

  it("turns the Cloudflare HTML block page into a helpful provider error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>blocked</html>", {
      status: 403, headers: { "content-type": "text/html" },
    })));

    const response = await OPENAI_CODEX_MODEL_PROVIDER.createFetch()("https://chatgpt.com/backend-api/codex/responses");

    await expect(response.json()).resolves.toEqual({
      error: {
        type: "cf_worker_egress_blocked",
        message: "OpenAI Codex rejected this Cloudflare Worker request because Workers add the " +
            "CF-Worker header. Configure an OPENAI_CODEX_EGRESS VPC Network binding using " +
            'network_id: "cf1:network", then retry.',
      },
    });
  });

  it("migrates the initial package account field without changing other providers", () => {
    expect(OPENAI_CODEX_MODEL_PROVIDER.migrateConfig?.({
      provider: "openai-codex", model: "gpt-5.6-terra", apiToken: "", codexAccountId: 7,
    } as never)).toMatchObject({ connectedAccountId: 7 });
    expect(OPENAI_CODEX_MODEL_PROVIDER.migrateConfig?.({
      provider: "openai", model: "gpt-5.6-terra", apiToken: "", accountId: "account",
    })).toMatchObject({ accountId: "account" });
  });
});
