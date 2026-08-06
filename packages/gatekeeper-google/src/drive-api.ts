import type {
  GoogleDriveDownload, GoogleDriveItem, GoogleDriveListOptions, GoogleDrivePage,
} from "./drive-types";
import { AccessTokenProvider, fetchWithAuthRetry } from "./auth-retry";

const FILES_API = "https://www.googleapis.com/drive/v3/files";
const MAX_PAGE_SIZE = 100;
const MAX_QUERY_LENGTH = 500;
const MAX_ID_LENGTH = 1_000;
const MAX_PAGE_TOKEN_LENGTH = 2_000;
const MAX_METADATA_BYTES = 2 * 1024 * 1024;
const MAX_ERROR_BYTES = 64 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;
const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
const GOOGLE_MIME_PREFIX = "application/vnd.google-apps.";

type RestDriveFile = {
  id?: string;
  name?: string;
  mimeType?: string;
  parents?: string[];
  size?: string;
  modifiedTime?: string;
  webViewLink?: string;
};

type RestDrivePage = {
  files?: RestDriveFile[];
  nextPageToken?: string;
};

function validateText(value: string, name: string, maxLength: number): string {
  let normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maxLength) {
    throw new Error(`${name} must contain between 1 and ${maxLength} characters.`);
  }
  return normalized;
}

function escapeDriveQuery(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function parseItem(file: RestDriveFile): GoogleDriveItem {
  if (!file.id || !file.name || !file.mimeType || !file.modifiedTime) {
    throw new Error("Google Drive returned incomplete file metadata.");
  }
  let modifiedAt = new Date(file.modifiedTime);
  if (Number.isNaN(modifiedAt.valueOf())) {
    throw new Error("Google Drive returned an invalid modification time.");
  }
  let size = file.size === undefined ? undefined : Number(file.size);
  if (size !== undefined && (!Number.isSafeInteger(size) || size < 0)) {
    throw new Error("Google Drive returned an invalid file size.");
  }
  return {
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    parentIds: file.parents ?? [],
    ...(size !== undefined ? { size } : {}),
    modifiedAt,
    ...(file.webViewLink ? { webUrl: file.webViewLink } : {}),
  };
}

async function readBoundedText(response: Response, maxBytes: number): Promise<string> {
  let declaredLength = Number(response.headers.get("Content-Length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    await response.body?.cancel().catch(() => {});
    throw new Error(`Google Drive response exceeded the ${maxBytes}-byte limit.`);
  }
  if (!response.body) return "";
  let reader = response.body.getReader();
  let chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      let { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new Error(`Google Drive response exceeded the ${maxBytes}-byte limit.`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  let bytes = new Uint8Array(length);
  let offset = 0;
  for (let chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function defaultExportMimeType(mimeType: string): string | undefined {
  switch (mimeType) {
    case "application/vnd.google-apps.document": return "text/plain";
    case "application/vnd.google-apps.spreadsheet": return "text/csv";
    case "application/vnd.google-apps.presentation": return "application/pdf";
    case "application/vnd.google-apps.drawing": return "image/png";
    default: return undefined;
  }
}

export class GoogleDriveApi {
  constructor(private getAccessToken: AccessTokenProvider) {}

  async #requestJson<T>(url: URL): Promise<T> {
    let response = await fetchWithAuthRetry(
      url.toString(), {}, this.getAccessToken, { timeoutMs: REQUEST_TIMEOUT_MS },
    );
    let text = await readBoundedText(response, response.ok ? MAX_METADATA_BYTES : MAX_ERROR_BYTES);
    if (!response.ok) {
      let detail = "";
      try {
        let body = JSON.parse(text) as { error?: { message?: string } };
        if (body.error?.message) detail = `: ${body.error.message}`;
      } catch {}
      throw new Error(`Google Drive request failed [http=${response.status}]${detail}`);
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error("Google Drive returned an invalid JSON response.");
    }
  }

  async list(options: GoogleDriveListOptions = {}): Promise<GoogleDrivePage> {
    let pageSize = options.pageSize ?? MAX_PAGE_SIZE;
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
      throw new Error(`pageSize must be an integer between 1 and ${MAX_PAGE_SIZE}.`);
    }
    let conditions = ["trashed = false"];
    if (options.parentId !== undefined) {
      let parentId = validateText(options.parentId, "parentId", MAX_ID_LENGTH);
      conditions.push(`'${escapeDriveQuery(parentId)}' in parents`);
    }
    if (options.query !== undefined) {
      let query = validateText(options.query, "query", MAX_QUERY_LENGTH);
      let escaped = escapeDriveQuery(query);
      conditions.push(`(name contains '${escaped}' or fullText contains '${escaped}')`);
    }

    let url = new URL(FILES_API);
    url.searchParams.set("q", conditions.join(" and "));
    url.searchParams.set("pageSize", String(pageSize));
    url.searchParams.set("orderBy", "folder,name_natural");
    url.searchParams.set("spaces", "drive");
    // The user corpus includes files owned by or shared with the account, including shared-drive
    // items, without the incomplete-search behavior possible with the broader allDrives corpus.
    url.searchParams.set("corpora", "user");
    url.searchParams.set("includeItemsFromAllDrives", "true");
    url.searchParams.set("supportsAllDrives", "true");
    url.searchParams.set(
      "fields",
      "nextPageToken,files(id,name,mimeType,parents,size,modifiedTime,webViewLink)",
    );
    if (options.pageToken !== undefined) {
      url.searchParams.set(
        "pageToken", validateText(options.pageToken, "pageToken", MAX_PAGE_TOKEN_LENGTH),
      );
    }

    let result = await this.#requestJson<RestDrivePage>(url);
    return {
      items: (result.files ?? []).map(parseItem),
      ...(result.nextPageToken ? { nextPageToken: result.nextPageToken } : {}),
    };
  }

  async get(itemId: string): Promise<GoogleDriveItem> {
    let id = validateText(itemId, "itemId", MAX_ID_LENGTH);
    let url = new URL(`${FILES_API}/${encodeURIComponent(id)}`);
    url.searchParams.set("supportsAllDrives", "true");
    url.searchParams.set("fields", "id,name,mimeType,parents,size,modifiedTime,webViewLink");
    return parseItem(await this.#requestJson<RestDriveFile>(url));
  }

  async download(itemId: string, exportMimeType?: string): Promise<GoogleDriveDownload> {
    let item = await this.get(itemId);
    if (item.mimeType === FOLDER_MIME_TYPE) throw new Error("Google Drive folders cannot be downloaded.");

    let url = new URL(`${FILES_API}/${encodeURIComponent(item.id)}`);
    let contentType: string;
    if (item.mimeType.startsWith(GOOGLE_MIME_PREFIX)) {
      let requestedMimeType = exportMimeType === undefined
        ? defaultExportMimeType(item.mimeType)
        : validateText(exportMimeType, "exportMimeType", 200);
      if (!requestedMimeType) {
        throw new Error(
          `Google-native file type "${item.mimeType}" needs an explicit supported exportMimeType.`,
        );
      }
      contentType = requestedMimeType;
      url.pathname += "/export";
      url.searchParams.set("mimeType", contentType);
    } else {
      if (exportMimeType !== undefined) {
        throw new Error("exportMimeType is only valid for Google-native files.");
      }
      contentType = item.mimeType;
      url.searchParams.set("alt", "media");
      url.searchParams.set("supportsAllDrives", "true");
    }

    // Bound the wait for headers, then detach the timer so it cannot terminate a legitimate
    // long-running streamed body.
    let controller = new AbortController();
    let timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetchWithAuthRetry(
        url.toString(), { signal: controller.signal }, this.getAccessToken,
      );
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) {
      let text = await readBoundedText(response, MAX_ERROR_BYTES);
      let detail = "";
      try {
        let body = JSON.parse(text) as { error?: { message?: string } };
        if (body.error?.message) detail = `: ${body.error.message}`;
      } catch {}
      throw new Error(`Google Drive download failed [http=${response.status}]${detail}`);
    }
    if (!response.body) throw new Error("Google Drive returned an empty download response.");
    return {
      item,
      contentType: response.headers.get("Content-Type")?.split(";", 1)[0] || contentType,
      content: response.body,
    };
  }
}
