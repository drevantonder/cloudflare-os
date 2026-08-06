import type { Api, Model, ModelCost, SimpleStreamOptions, StreamFunction } from "@earendil-works/pi-ai";
import { stream as openAiCodexResponsesStream } from "@earendil-works/pi-ai/api/openai-codex-responses";
import { OPENAI_CODEX_MODELS } from "@earendil-works/pi-ai/providers/openai-codex.models";
import type { AiModelConfig } from "@gadgets/workshop-shared/api";

export const OPENAI_CODEX_PROVIDER_ID = "openai-codex";
export const OPENAI_CODEX_EGRESS_BINDING = "OPENAI_CODEX_EGRESS";

export type ModelProviderModel = {
  name: string;
  contextWindow: number;
  outputLimit?: number;
};

export type DirectModelProvider = {
  id: string;
  displayName: string;
  api: string;
  models: Record<string, ModelProviderModel>;
  stream: StreamFunction<Api, SimpleStreamOptions>;
  catalogModel(modelId: string): Model<Api> | undefined;
  createModel(modelId: string): Model<Api>;
  createFetch(egress?: Fetcher): typeof globalThis.fetch;
  transport: SimpleStreamOptions["transport"];
  egressBinding?: string;
  migrateConfig?(config: AiModelConfig): AiModelConfig;
};

const ZERO_COST: ModelCost = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

const CF_WORKER_BLOCK_MESSAGE =
    "OpenAI Codex rejected this Cloudflare Worker request because Workers add the " +
    "CF-Worker header. Configure an OPENAI_CODEX_EGRESS VPC Network binding using " +
    'network_id: "cf1:network", then retry.';

function catalogModel(modelId: string): Model<Api> | undefined {
  return (OPENAI_CODEX_MODELS as Record<string, Model<Api>>)[modelId];
}

function createModel(modelId: string): Model<Api> {
  const catalog = catalogModel(modelId);
  const suggestion = OPENAI_CODEX_MODELS_FOR_PICKER[modelId];
  return {
    id: modelId,
    name: catalog?.name ?? suggestion?.name ?? modelId,
    api: "openai-codex-responses",
    provider: OPENAI_CODEX_PROVIDER_ID,
    baseUrl: "https://chatgpt.com/backend-api",
    reasoning: catalog?.reasoning ?? true,
    input: catalog?.input ?? ["text", "image"],
    cost: catalog?.cost ?? ZERO_COST,
    contextWindow: suggestion?.contextWindow ?? catalog?.contextWindow ?? 128_000,
    maxTokens: suggestion?.outputLimit ?? catalog?.maxTokens ?? 4096,
    thinkingLevelMap: catalog?.thinkingLevelMap,
    compat: catalog?.compat,
  };
}

function createFetch(egress?: Fetcher): typeof globalThis.fetch {
  if (egress) return (input, init) => egress.fetch(new Request(input, init));
  return async (input, init) => {
    const response = await globalThis.fetch(input, init);
    if (response.status !== 403 ||
        !response.headers.get("content-type")?.toLowerCase().startsWith("text/html")) {
      return response;
    }
    const headers = new Headers(response.headers);
    headers.set("content-type", "application/json");
    headers.delete("content-encoding");
    headers.delete("content-length");
    return Response.json({
      error: { type: "cf_worker_egress_blocked", message: CF_WORKER_BLOCK_MESSAGE },
    }, { status: response.status, statusText: response.statusText, headers });
  };
}

export const OPENAI_CODEX_MODELS_FOR_PICKER: Record<string, ModelProviderModel> = {
  "gpt-5.6-sol": { name: "GPT 5.6 Sol", contextWindow: 272_000, outputLimit: 128_000 },
  "gpt-5.6-luna": { name: "GPT 5.6 Luna", contextWindow: 272_000, outputLimit: 128_000 },
  "gpt-5.6-terra": { name: "GPT 5.6 Terra", contextWindow: 272_000, outputLimit: 128_000 },
};

export const OPENAI_CODEX_MODEL_PROVIDER: DirectModelProvider = {
  id: OPENAI_CODEX_PROVIDER_ID,
  displayName: "OpenAI Codex",
  api: "openai-codex-responses",
  models: OPENAI_CODEX_MODELS_FOR_PICKER,
  stream: openAiCodexResponsesStream as StreamFunction<Api, SimpleStreamOptions>,
  catalogModel,
  createModel,
  createFetch,
  transport: "sse",
  egressBinding: OPENAI_CODEX_EGRESS_BINDING,
  migrateConfig(config) {
    // This is a one-time data-shape migration from the first package integration. Keep it beside
    // the provider that owned the old field, rather than making the Workshop remember Codex.
    const legacy = config as AiModelConfig & { codexAccountId?: number };
    if (config.provider !== OPENAI_CODEX_PROVIDER_ID ||
        config.connectedAccountId !== undefined || legacy.codexAccountId === undefined) {
      return config;
    }
    const { codexAccountId, ...rest } = legacy;
    return { ...rest, connectedAccountId: codexAccountId };
  },
};
