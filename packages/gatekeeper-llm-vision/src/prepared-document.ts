export type PreparedPart =
  | { type: "text"; fileNumber: number; pageNumber?: number; text: string }
  | {
      type: "image";
      fileNumber: number;
      pageNumber?: number;
      mediaType: "application/pdf" | "image/jpeg" | "image/png" | "image/webp";
      bytes: Uint8Array;
    };

export type PageAnalysis = {
  html: string;
  hasMeaningfulImages: boolean;
  hasUsableText: boolean;
};

export type PreparationSummary = {
  imagePages: number;
  mixedPages: number;
  textPages: number;
};

export function pageRoute(
  textDocument: boolean,
  analysis: Pick<PageAnalysis, "hasMeaningfulImages" | "hasUsableText">,
): "text" | "image" | "text-and-image" {
  if (textDocument && analysis.hasUsableText && !analysis.hasMeaningfulImages) return "text";
  return analysis.hasUsableText ? "text-and-image" : "image";
}
