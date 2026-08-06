import { RpcStub, RpcTarget } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import { VisionSessionImpl } from "../src/session.js";

class TestApprovalQueue extends RpcTarget {
  calls = 0;

  authorizeObservation(): Promise<void> {
    this.calls++;
    return Promise.resolve();
  }
}

describe("VisionSessionImpl", () => {
  it("authorizes the model result before returning it", async () => {
    const approvalQueue = new TestApprovalQueue();
    const infer = vi.fn(async () => "result");
    const session = new VisionSessionImpl({
      approvalQueue: new RpcStub(approvalQueue) as never,
      infer,
      prepare: async () => ({
        parts: [{ type: "text", fileNumber: 1, text: "content" }],
        summary: { imagePages: 0, mixedPages: 0, textPages: 1 },
      }),
    });
    await expect(session.analyze("prompt", [new Blob(["x"], { type: "image/png" })]))
      .resolves.toBe("result");
    expect(infer).toHaveBeenCalledOnce();
    expect(approvalQueue.calls).toBe(1);
  });
});
