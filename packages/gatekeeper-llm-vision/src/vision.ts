import { DurableObject, RpcStub as NativeRpcStub, WorkerEntrypoint } from "cloudflare:workers";
import { skipRpcValidation, validateRpc } from "capnweb-validate";
import type {
  AccountDescription,
  ActionKind,
  ApprovalQueue,
  Gatekeeper,
  GatekeeperConnectCallback,
  GatekeeperConnectOptions,
  GatekeeperUser,
  GatekeeperUserVerifier,
  ResourceConfiguratorFrame,
  ResourceDescription,
  SupportedResource,
  VendorDescription,
} from "@gadgets/workshop-shared/gatekeeper";
import { analyzeWithGemini, readGatewayConfig } from "./gemini.js";
import { prepareFiles } from "./mupdf-preparer.js";
import { VisionSessionImpl } from "./session.js";
import type { VisionSession } from "./types.js";
import TYPES_CODE from "./types.txt";

const VISION_ICON = {
  url: "data:image/svg+xml," + encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 256 256' fill='currentColor'>" +
      "<path d='M128 40C48 40 16 128 16 128s32 88 112 88 112-88 112-88-32-88-112-88Zm0 152a64 64 0 1 1 64-64 64 64 0 0 1-64 64Zm0-104a40 40 0 1 0 40 40 40 40 0 0 0-40-40Z'/></svg>",
  ),
};

@validateRpc()
export class VisionGatekeeper extends DurableObject<Cloudflare.Env> implements Gatekeeper<VisionSession> {
  /** Describes the ambient LLM Vision capability. */
  async describe(): Promise<ResourceDescription> {
    return {
      url: "vision://analyze",
      title: "LLM Vision",
      snippet: "Analyze images and PDFs with a multimodal language model.",
      suggestedBindingName: "VISION",
      tsType: "VisionSession",
    };
  }

  /** Returns the agent-facing Vision declarations. */
  async getTypeScriptTypes(): Promise<string> {
    return TYPES_CODE;
  }

  /** Reports that LLM Vision has no auto-applicable actions. */
  async getAutoApprovableActions(): Promise<ActionKind[]> {
    return [];
  }

  /** Opens a stateless Vision session. */
  async startSession(approvalQueue: NativeRpcStub<ApprovalQueue>): Promise<VisionSession> {
    const config = readGatewayConfig(this.env);
    return new VisionSessionImpl({
      approvalQueue: approvalQueue.dup(),
      prepare: prepareFiles,
      infer: (prompt, parts) => analyzeWithGemini(config, prompt, parts),
    });
  }

  /** Accepts collaborators because this capability retains no private external data. */
  async addObserver(_id: string, _user: Fetcher<GatekeeperUserVerifier>): Promise<void> {}

  /** Removes a collaborator; no observer state is retained. */
  async removeObserver(_id: string): Promise<void> {}

  applyAction(_action: number): Promise<void> {
    throw new Error("LLM Vision is read-only and implements no actions.");
  }
  rejectAction(_action: number): Promise<void> {
    throw new Error("LLM Vision is read-only and implements no actions.");
  }
  revertAction(_action: number): Promise<void> {
    throw new Error("LLM Vision is read-only and implements no actions.");
  }
}

@validateRpc()
export class VisionAccount extends WorkerEntrypoint<Cloudflare.Env> implements GatekeeperUser {
  async describe(): Promise<AccountDescription> {
    return {
      displayName: "LLM Vision",
      avatar: VISION_ICON,
      singleton: { tsType: "VisionSession" },
    };
  }

  @skipRpcValidation()
  async getSingletonGatekeeperClass(): Promise<DurableObjectClass<Gatekeeper<VisionSession>>> {
    return this.ctx.exports.VisionGatekeeper({});
  }

  async getSupportedResources(): Promise<SupportedResource[]> {
    return [];
  }
  getGatekeeperClassFor(_url: string): never {
    throw new Error("LLM Vision has no URL-addressed resources.");
  }
  startResourceConfigurator(_resourceUrlPattern: string): Promise<ResourceConfiguratorFrame> {
    throw new Error("LLM Vision has no resource configurator.");
  }
  async ensureResources(_resourceUrlPatterns: string[]): Promise<{ url?: string }> {
    return {};
  }
  async revoke(): Promise<void> {}
  reconnect(): Promise<{ url: string }> {
    throw new Error("LLM Vision has no connect flow.");
  }
  async getAuthenticatedEmail(): Promise<null> {
    return null;
  }
  @skipRpcValidation()
  async getVerifier(): Promise<Fetcher<GatekeeperUserVerifier>> {
    return this.ctx.exports.VisionVerifier({});
  }
}

@validateRpc()
export class VisionVerifier extends WorkerEntrypoint<Cloudflare.Env> implements GatekeeperUserVerifier {
  verify(): void {}
}

@validateRpc()
export class GatekeeperVendor extends WorkerEntrypoint<Cloudflare.Env> {
  async describe(): Promise<VendorDescription> {
    return {
      displayName: "LLM Vision",
      url: "https://ai.google.dev/gemini-api/docs/vision",
      logo: VISION_ICON,
      tagline: "Analyze images and PDFs",
      description: "Analyze attached images and PDFs with Gemini 3.5 Flash Lite.",
      autoProvisionsAccount: true,
      providesAuth: false,
    };
  }

  @skipRpcValidation()
  async createAccount(): Promise<Fetcher<GatekeeperUser>> {
    return this.ctx.exports.VisionAccount({}) as unknown as Fetcher<GatekeeperUser>;
  }

  connectAccount(
    _callback: Fetcher<GatekeeperConnectCallback>,
    _options?: GatekeeperConnectOptions,
  ): Promise<{ url: string }> {
    throw new Error("LLM Vision is auto-provisioned and has no connect flow.");
  }

  async getSupportedResources(_options?: { userId?: string }): Promise<SupportedResource[]> {
    return [];
  }

  async getTypeScriptTypes(): Promise<string> {
    return TYPES_CODE;
  }
}
