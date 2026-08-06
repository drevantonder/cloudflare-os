import { describe, expect, it } from "vitest";
import { tokensChanged, type CodexTokens } from "./token-refresh.js";

const TOKENS: CodexTokens = {
  access: "access",
  refresh: "refresh",
  id: null,
  expires: 1_000,
};

describe("tokensChanged", () => {
  it("preserves credentials written by reconnect or another refresh", () => {
    expect(tokensChanged({...TOKENS, access: "new-access"}, TOKENS)).toBe(true);
    expect(tokensChanged({...TOKENS, refresh: "new-refresh"}, TOKENS)).toBe(true);
    expect(tokensChanged({...TOKENS, id: "new-id"}, TOKENS)).toBe(true);
    expect(tokensChanged({...TOKENS, expires: 2_000}, TOKENS)).toBe(true);
  });

  it("allows the refresh that produced the current credentials to persist", () => {
    expect(tokensChanged(TOKENS, TOKENS)).toBe(false);
  });
});
