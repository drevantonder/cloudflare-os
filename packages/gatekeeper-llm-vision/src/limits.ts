export const MAX_FILE_COUNT = 10;
export const MAX_FILE_BYTES = 14 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 14 * 1024 * 1024;
export const MAX_PDF_PAGES = 50;
export const MAX_PROMPT_LENGTH = 20_000;

export const SUPPORTED_MEDIA_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export function validateAnalysisInput(prompt: string, files: Blob[]): void {
  if (prompt.trim().length === 0) throw new TypeError("Prompt must not be empty.");
  if (prompt.length > MAX_PROMPT_LENGTH) {
    throw new TypeError(`Prompt must be at most ${MAX_PROMPT_LENGTH} characters.`);
  }
  if (files.length === 0) throw new TypeError("At least one file is required.");
  if (files.length > MAX_FILE_COUNT) {
    throw new TypeError(`At most ${MAX_FILE_COUNT} files may be analyzed at once.`);
  }
  let totalBytes = 0;
  for (const file of files) {
    if (!(file instanceof Blob)) throw new TypeError("Every file must be a Blob.");
    if (!SUPPORTED_MEDIA_TYPES.has(file.type)) {
      throw new TypeError(`Unsupported file type: ${file.type || "unknown"}.`);
    }
    if (file.size === 0) throw new TypeError("Files must not be empty.");
    if (file.size > MAX_FILE_BYTES) {
      throw new TypeError(`Each file must be at most ${MAX_FILE_BYTES} bytes.`);
    }
    totalBytes += file.size;
  }
  if (totalBytes > MAX_TOTAL_BYTES) {
    throw new TypeError(`Files must total at most ${MAX_TOTAL_BYTES} bytes.`);
  }
}
