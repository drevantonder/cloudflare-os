import { describe, expect, it } from "vitest";
import { MAX_FILE_COUNT, validateAnalysisInput } from "../src/limits.js";

describe("validateAnalysisInput", () => {
  it("accepts supported files", () => {
    expect(() => validateAnalysisInput("Describe these", [
      new Blob(["image"], { type: "image/jpeg" }),
      new Blob(["pdf"], { type: "application/pdf" }),
    ])).not.toThrow();
  });

  it("rejects empty prompts and file lists", () => {
    expect(() => validateAnalysisInput(" ", [new Blob(["x"], { type: "image/png" })]))
      .toThrow("Prompt must not be empty");
    expect(() => validateAnalysisInput("prompt", [])).toThrow("At least one file");
  });

  it("rejects unsupported and excessive files", () => {
    expect(() => validateAnalysisInput("prompt", [new Blob(["x"], { type: "text/plain" })]))
      .toThrow("Unsupported file type");
    const files = Array.from(
      { length: MAX_FILE_COUNT + 1 },
      () => new Blob(["x"], { type: "image/png" }),
    );
    expect(() => validateAnalysisInput("prompt", files)).toThrow(`At most ${MAX_FILE_COUNT}`);
  });
});
