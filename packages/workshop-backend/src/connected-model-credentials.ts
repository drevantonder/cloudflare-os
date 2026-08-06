import type { AiModelConfig } from "@gadgets/workshop-shared/api";
import type { GatekeeperUser } from "@gadgets/workshop-shared/gatekeeper";

type ConnectedAccount = {
  account: Fetcher<GatekeeperUser>;
  vendorId: string;
};

interface OpenAICodexAccount extends GatekeeperUser {
  getModelProviderCredentials(): Promise<{ provider: "openai-codex"; apiToken: string }>;
}

export async function resolveConnectedModelCredentials(
    config: AiModelConfig,
    getAccount: (id: number) => ConnectedAccount | undefined,
): Promise<AiModelConfig> {
  if (config.provider !== "openai-codex" || config.connectedAccountId === undefined) return config;
  const account = getAccount(config.connectedAccountId);
  if (!account || account.vendorId !== "openai-codex") {
    throw new Error("The selected OpenAI Codex account is no longer connected.");
  }
  const credentials = await (account.account as Fetcher<OpenAICodexAccount>).getModelProviderCredentials();
  return {...config, apiToken: credentials.apiToken};
}
