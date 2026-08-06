/** A deployment-provided multimodal document-analysis capability. */
export interface VisionSession {
  /**
   * Analyzes one or more images or PDFs using the supplied prompt.
   *
   * Files are interpreted together in their supplied order. Set each Blob's `type` to its MIME
   * type, such as `image/jpeg` or `application/pdf`.
   */
  analyze(prompt: string, files: Blob[]): Promise<string>;
}
