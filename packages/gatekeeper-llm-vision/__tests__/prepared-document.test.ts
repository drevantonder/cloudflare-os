import { describe, expect, it } from "vitest";
import { pageRoute } from "../src/prepared-document.js";

describe("pageRoute", () => {
  it("uses semantic text for a text page in a text document", () => {
    expect(pageRoute(true, { hasUsableText: true, hasMeaningfulImages: false })).toBe("text");
  });

  it("keeps both representations for mixed pages", () => {
    expect(pageRoute(true, { hasUsableText: true, hasMeaningfulImages: true }))
      .toBe("text-and-image");
    expect(pageRoute(false, { hasUsableText: true, hasMeaningfulImages: false }))
      .toBe("text-and-image");
  });

  it("renders pages without usable text", () => {
    expect(pageRoute(false, { hasUsableText: false, hasMeaningfulImages: true })).toBe("image");
  });
});
