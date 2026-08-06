import { OPENAI_CODEX_MODEL_PROVIDER, type DirectModelProvider } from "@gadgets/openai-codex-gatekeeper/model-provider";
import type { AiModelConfig } from "@gadgets/workshop-shared/api";

const providers: DirectModelProvider[] = [OPENAI_CODEX_MODEL_PROVIDER];

export function directModelProvider(providerId: string): DirectModelProvider | undefined {
  return providers.find(provider => provider.id === providerId);
}

export function normalizeDirectModelConfig(config: AiModelConfig): AiModelConfig {
  return directModelProvider(config.provider)?.migrateConfig?.(config) ?? config;
}

export function registerDirectModelProviderStreams(
    streams: Record<string, DirectModelProvider["stream"]>): void {
  for (const provider of providers) streams[provider.api] = provider.stream;
}
