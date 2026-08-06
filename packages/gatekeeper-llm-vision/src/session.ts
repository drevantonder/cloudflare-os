import { RpcStub as NativeRpcStub, RpcTarget } from "cloudflare:workers";
import { createLogger } from "@gadgets/backend-utils/logger";
import { validateRpc } from "capnweb-validate";
import type { ApprovalQueue } from "@gadgets/workshop-shared/gatekeeper";
import { MAX_TOTAL_BYTES, validateAnalysisInput } from "./limits.js";
import type { PreparedPart, PreparationSummary } from "./prepared-document.js";
import type { VisionSession } from "./types.js";

type VisionLogFields = {
  fileCount?: number;
  imagePages?: number;
  mixedPages?: number;
  textPages?: number;
  totalBytes?: number;
  vendorId?: string;
};
const logger = createLogger<VisionLogFields>({
  component: "gatekeeper.llm-vision",
  vendorId: "llm_vision",
});

export type VisionDependencies = {
  approvalQueue: NativeRpcStub<ApprovalQueue>;
  infer(prompt: string, parts: PreparedPart[]): Promise<string>;
  prepare(files: Blob[]): Promise<{ parts: PreparedPart[]; summary: PreparationSummary }>;
};

@validateRpc()
export class VisionSessionImpl extends RpcTarget implements VisionSession {
  readonly #approvalQueue: NativeRpcStub<ApprovalQueue>;
  readonly #infer: VisionDependencies["infer"];
  readonly #prepare: VisionDependencies["prepare"];

  constructor(dependencies: VisionDependencies) {
    super();
    this.#approvalQueue = dependencies.approvalQueue;
    this.#infer = dependencies.infer;
    this.#prepare = dependencies.prepare;
  }

  /** Analyzes the supplied files and authorizes the derived response as an observation. */
  async analyze(prompt: string, files: Blob[]): Promise<string> {
    validateAnalysisInput(prompt, files);
    const totalBytes = files.reduce((total, file) => total + file.size, 0);
    const { parts, summary } = await this.#prepare(files);
    const preparedBytes = parts.reduce(
      (total, part) => total +
        (part.type === "image" ? part.bytes.length : new TextEncoder().encode(part.text).byteLength),
      0,
    );
    if (preparedBytes > MAX_TOTAL_BYTES) {
      throw new TypeError("Prepared files are too large for one vision request.");
    }
    logger.info("vision analysis prepared", {
      event: "analysis.prepared",
      fileCount: files.length,
      totalBytes,
      ...summary,
    });
    const result = await this.#infer(prompt, parts);
    await this.#approvalQueue.authorizeObservation({
      title: "Analyze files with LLM Vision",
      description: `Analyze ${files.length} attached file${files.length === 1 ? "" : "s"}.`,
    });
    return result;
  }

  [Symbol.dispose](): void {
    this.#approvalQueue[Symbol.dispose]?.();
  }
}
