import type { GatekeeperUser } from "./gatekeeper";

/** A model catalog supplied by a connected-account gatekeeper. */
export type ModelProviderDescription = {
  id: string;
  displayName: string;
  models: Record<string, { name: string; contextWindow: number; outputLimit?: number }>;
};

/** A connected account that can mint a short-lived model-provider access token. */
export interface ModelProviderGatekeeperUser extends GatekeeperUser {
  getModelProviderCredentials(): Promise<{ provider: string; apiToken: string }>;
}
