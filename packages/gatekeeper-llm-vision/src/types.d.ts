/** A deployment-provided multimodal document-analysis capability. */
export interface VisionSession {
  /**
   * Analyzes one or more images or PDFs using the supplied prompt.
   *
   * Files are interpreted together in their supplied order. Each value must be a `Blob` whose
   * `type` is its MIME type, such as `image/jpeg` or `application/pdf`.
   *
   * Do not pass a platform `File` object or try to read its `.path`: `File` objects cannot cross
   * the RPC boundary and attached files do not expose filesystem paths. Convert the attachment's
   * bytes into a `Blob` first:
   *
   * ```ts
   * const pdf = new Blob([await attachment.arrayBuffer()], { type: "application/pdf" });
   * const result = await env.VISION.analyze(prompt, [pdf]);
   * ```
   *
   * PDF pages are converted internally; callers do not need to render them as images.
   */
  analyze(prompt: string, files: Blob[]): Promise<string>;
}
