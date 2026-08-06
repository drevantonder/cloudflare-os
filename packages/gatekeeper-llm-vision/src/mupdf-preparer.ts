import { Parser } from "htmlparser2";
// MuPDF does not export its Wasm asset as a package subpath. prepare-mupdf.mjs copies the installed
// asset here so Wrangler and capnweb-validate can treat it like an ordinary Worker Wasm module.
import mupdfWasm from "./generated/mupdf-wasm.wasm";
import { MAX_PDF_PAGES } from "./limits.js";
import type { PageAnalysis, PreparedPart, PreparationSummary } from "./prepared-document.js";
import { pageRoute } from "./prepared-document.js";

const RENDER_SCALE = 2;
const JPEG_QUALITY = 80;

type MuPdf = typeof import("mupdf");

const mupdfGlobal = globalThis as typeof globalThis & {
  $libmupdf_wasm_Module?: {
    instantiateWasm(
      imports: WebAssembly.Imports,
      success: (instance: WebAssembly.Instance, module: WebAssembly.Module) => void,
    ): WebAssembly.Exports;
  };
};

mupdfGlobal.$libmupdf_wasm_Module = {
  instantiateWasm(
    imports: WebAssembly.Imports,
    success: (instance: WebAssembly.Instance, module: WebAssembly.Module) => void,
  ) {
    const instance = new WebAssembly.Instance(mupdfWasm, imports);
    success(instance, mupdfWasm);
    return instance.exports;
  },
};

let mupdfReady: Promise<MuPdf> | undefined;

export async function prepareFiles(files: Blob[]): Promise<{
  parts: PreparedPart[];
  summary: PreparationSummary;
}> {
  const parts: PreparedPart[] = [];
  const summary: PreparationSummary = { imagePages: 0, mixedPages: 0, textPages: 0 };
  for (const [index, file] of files.entries()) {
    const fileNumber = index + 1;
    if (file.type === "application/pdf") {
      const prepared = await preparePdf(new Uint8Array(await file.arrayBuffer()), fileNumber);
      parts.push(...prepared.parts);
      summary.imagePages += prepared.summary.imagePages;
      summary.mixedPages += prepared.summary.mixedPages;
      summary.textPages += prepared.summary.textPages;
    } else {
      parts.push({
        type: "image",
        fileNumber,
        mediaType: file.type as "image/jpeg" | "image/png" | "image/webp",
        bytes: new Uint8Array(await file.arrayBuffer()),
      });
      summary.imagePages++;
    }
  }
  return { parts, summary };
}

async function preparePdf(bytes: Uint8Array, fileNumber: number): Promise<{
  parts: PreparedPart[];
  summary: PreparationSummary;
}> {
  const mupdf = await (mupdfReady ??=
    import("./generated/lib.mupdf.js") as unknown as Promise<MuPdf>);
  const document = new mupdf.PDFDocument(bytes);
  try {
    if (document.needsPassword()) throw new TypeError("Encrypted PDFs are not supported.");
    const pageCount = document.countPages();
    if (pageCount === 0) throw new TypeError("PDFs must contain at least one page.");
    if (pageCount > MAX_PDF_PAGES) {
      throw new TypeError(`PDFs may contain at most ${MAX_PDF_PAGES} pages.`);
    }

    const analyses: PageAnalysis[] = [];
    for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
      const page = document.loadPage(pageIndex);
      try {
        analyses.push(analyzePage(page));
      } finally {
        page.destroy();
      }
    }

    const usableTextRatio = analyses.filter(({ hasUsableText }) => hasUsableText).length / pageCount;
    const textDocument = usableTextRatio >= 0.9;
    const parts: PreparedPart[] = [];
    const summary: PreparationSummary = { imagePages: 0, mixedPages: 0, textPages: 0 };

    for (const [pageIndex, analysis] of analyses.entries()) {
      const pageNumber = pageIndex + 1;
      const route = pageRoute(textDocument, analysis);
      if (route === "text") {
        parts.push({ type: "text", fileNumber, pageNumber, text: analysis.html });
        summary.textPages++;
        continue;
      }

      const page = document.loadPage(pageIndex);
      try {
        let rendered: Uint8Array;
        try {
          rendered = renderPage(mupdf, page);
        } catch {
          rendered = singlePagePdf(mupdf, document, pageIndex);
          parts.push({
            type: "image",
            fileNumber,
            pageNumber,
            mediaType: "application/pdf",
            bytes: rendered,
          });
          summary.imagePages++;
          continue;
        }
        if (route === "text-and-image") {
          parts.push({ type: "text", fileNumber, pageNumber, text: analysis.html });
          summary.mixedPages++;
        } else {
          summary.imagePages++;
        }
        parts.push({
          type: "image",
          fileNumber,
          pageNumber,
          mediaType: "image/jpeg",
          bytes: rendered,
        });
      } finally {
        page.destroy();
      }
    }
    return { parts, summary };
  } finally {
    document.destroy();
  }
}

function analyzePage(page: import("mupdf").Page): PageAnalysis {
  const pageArea = rectangleArea(page.getBounds());
  const structuredText = page.toStructuredText(
    "preserve-images,preserve-whitespace,structured,vectors,table-hunt",
  );
  try {
    const text = structuredText.asText().trim();
    const html = semanticHtml(structuredText.asHTML(0));
    const uniqueCharacters = new Set<string>();
    const uniqueAlphanumericCharacters = new Set<string>();
    let imageCount = 0;
    let meaningfulImageCount = 0;
    let meaningfulImageRatio = 0;
    let vectorCount = 0;
    structuredText.walk({
      onChar(character) {
        if (!/\s/u.test(character)) uniqueCharacters.add(character);
        if (/[A-Za-z0-9]/u.test(character)) uniqueAlphanumericCharacters.add(character);
      },
      onImageBlock(bbox, _transform, image) {
        imageCount++;
        const placedRatio = pageArea === 0 ? 0 : rectangleArea(bbox) / pageArea;
        const sourceArea = image.getWidth() * image.getHeight();
        if (!image.getImageMask() && sourceArea >= 200_000 && placedRatio >= 0.08) {
          meaningfulImageCount++;
          meaningfulImageRatio += placedRatio;
        }
        image.destroy();
      },
      onVector() {
        vectorCount++;
      },
    });
    const textOperationProxy = text.match(/\S+/gu)?.length ?? 0;
    const minimumTextOperations = imageCount > 0 ? 10 : 3;
    const imageDominated = imageCount > 10 && imageCount > textOperationProxy * 3;
    const vectorText = vectorCount >= 1_000 && vectorCount > textOperationProxy * 200 &&
      uniqueAlphanumericCharacters.size < 30;
    const hasUsableText = textOperationProxy >= minimumTextOperations && !imageDominated &&
      uniqueCharacters.size >= 5 && !vectorText && hasAcceptableText(text);
    const hasMeaningfulImages =
      (meaningfulImageCount >= 2 && meaningfulImageRatio >= 0.35) ||
      (meaningfulImageCount === 1 && meaningfulImageRatio >= 0.45);
    return { hasMeaningfulImages, hasUsableText, html };
  } finally {
    structuredText.destroy();
  }
}

function renderPage(mupdf: MuPdf, page: import("mupdf").Page): Uint8Array {
  const pixmap = page.toPixmap(mupdf.Matrix.scale(RENDER_SCALE, RENDER_SCALE),
    mupdf.ColorSpace.DeviceRGB, false);
  try {
    return Uint8Array.from(pixmap.asJPEG(JPEG_QUALITY));
  } finally {
    pixmap.destroy();
  }
}

function singlePagePdf(mupdf: MuPdf, source: import("mupdf").PDFDocument,
  pageIndex: number): Uint8Array {
  const pageDocument = new mupdf.PDFDocument();
  try {
    pageDocument.graftPage(-1, source, pageIndex);
    const saved = pageDocument.saveToBuffer("compress");
    try {
      return Uint8Array.from(saved.asUint8Array());
    } finally {
      saved.destroy();
    }
  } finally {
    pageDocument.destroy();
  }
}

function semanticHtml(html: string): string {
  const output: string[] = [];
  const paragraphStarts: number[] = [];
  let previousParagraph = "";
  const parser = new Parser({
    onclosetag(name) {
      const tag = semanticTag(name);
      if (!tag) return;
      output.push(`</${tag}>`);
      if (tag === "p") {
        const start = paragraphStarts.pop();
        if (start === undefined) return;
        const paragraph = output.slice(start).join("");
        if (paragraph === "<p></p>" || paragraph === previousParagraph) output.length = start;
        else previousParagraph = paragraph;
      } else if (STRUCTURE_BOUNDARIES.has(tag)) {
        previousParagraph = "";
      }
    },
    onopentag(name, attributes) {
      if (name === "img") {
        const description = attributes.alt?.trim();
        if (description) output.push(`<figure>${escapeHtml(description)}</figure>`);
        return;
      }
      const tag = semanticTag(name);
      if (!tag) return;
      if (STRUCTURE_BOUNDARIES.has(tag)) previousParagraph = "";
      if (tag === "p") paragraphStarts.push(output.length);
      output.push(`<${tag}>`);
    },
    ontext(text) {
      output.push(escapeHtml(text));
    },
  }, { decodeEntities: true });
  parser.end(html);
  return output.join("").replaceAll(/>\s+</gu, "><").trim();
}

const SEMANTIC_TAGS = new Set([
  "b", "blockquote", "caption", "em", "figure", "h1", "h2", "h3", "h4", "h5", "h6",
  "i", "li", "ol", "p", "strong", "table", "tbody", "td", "tfoot", "th", "thead", "tr",
  "ul",
]);
const STRUCTURE_BOUNDARIES = new Set([
  "blockquote", "caption", "figure", "li", "table", "td", "th", "tr",
]);

function semanticTag(name: string): string | undefined {
  if (!SEMANTIC_TAGS.has(name)) return undefined;
  if (name === "strong") return "b";
  return name === "em" ? "i" : name;
}

function escapeHtml(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function hasAcceptableText(text: string): boolean {
  if (!text) return false;
  let replacementCharacters = 0;
  let controlCharacters = 0;
  for (const character of text) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint === 0xfffd) replacementCharacters++;
    if (codePoint <= 8 || codePoint === 11 || codePoint === 12 ||
        (codePoint >= 14 && codePoint <= 31)) {
      controlCharacters++;
    }
  }
  return (replacementCharacters + controlCharacters) / text.length < 0.02;
}

function rectangleArea([x0, y0, x1, y1]: readonly number[]): number {
  return Math.max(0, (x1 ?? 0) - (x0 ?? 0)) * Math.max(0, (y1 ?? 0) - (y0 ?? 0));
}
