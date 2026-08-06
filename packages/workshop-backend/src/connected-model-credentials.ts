import type { AiModelConfig } from "@gadgets/workshop-shared/api";
import type { GatekeeperUser, VendorDescription } from "@gadgets/workshop-shared/gatekeeper";
import type { ModelProviderGatekeeperUser } from "@gadgets/workshop-shared/model-provider";
import { normalizeDirectModelConfig } from "./direct-model-providers.js";

type ConnectedAccount = {
  account: Fetcher<GatekeeperUser>;
  vendorId: string;
};

type Vendor = { describe(): Promise<VendorDescription> };

export async function resolveConnectedModelCredentials(
    config: AiModelConfig,
    getAccount: (id: number) => ConnectedAccount | undefined,
    getVendor: (id: string) => Vendor | undefined,
): Promise<AiModelConfig> {
  config = normalizeDirectModelConfig(config);
  if (config.connectedAccountId === undefined) return config;
  const account = getAccount(config.connectedAccountId);
  if (!account) throw new Error("The selected model-provider account is no longer connected.");
  const provider = await getVendor(account.vendorId)?.describe();
  if (provider?.modelProvider?.id !== config.provider) {
    throw new Error("The selected account does not provide credentials for this model provider.");
  }
  const modelProviderAccount = account.account as Fetcher<ModelProviderGatekeeperUser>;
  const credentials = await modelProviderAccount.getModelProviderCredentials();
  if (credentials.provider !== config.provider) {
    throw new Error("The selected account does not provide credentials for this model provider.");
  }
  return {...config, apiToken: credentials.apiToken};
}
