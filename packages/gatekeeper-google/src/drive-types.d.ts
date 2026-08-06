/** Metadata for a file or folder visible in the connected Google Drive account. */
export type GoogleDriveItem = {
  /** Stable Google Drive file ID. */
  id: string;
  /** Display name. */
  name: string;
  /** Google Drive MIME type. Folders use `application/vnd.google-apps.folder`. */
  mimeType: string;
  /** IDs of the folders that directly contain this item. */
  parentIds: string[];
  /** File size in bytes when Google reports one. */
  size?: number;
  /** Time the content or metadata was last changed. */
  modifiedAt: Date;
  /** Browser URL for this item when Google reports one. */
  webUrl?: string;
};

/** One page from a Google Drive listing or search. */
export type GoogleDrivePage = {
  items: GoogleDriveItem[];
  /** Pass this token to the next `list()` call to continue the same query. */
  nextPageToken?: string;
};

/** Options for listing or searching Google Drive. */
export type GoogleDriveListOptions = {
  /** Return only direct children of this folder. Omit to search the whole Drive. */
  parentId?: string;
  /** Find items whose name or indexed text contains this plain-text query. */
  query?: string;
  /** Continuation token returned by the previous page. */
  pageToken?: string;
  /** Number of results to request, from 1 to 100. Defaults to 100. */
  pageSize?: number;
};

/** A streamed Google Drive download or export. */
export type GoogleDriveDownload = {
  item: GoogleDriveItem;
  /** MIME type of the returned stream. */
  contentType: string;
  content: ReadableStream<Uint8Array>;
};

/** Read-only access to every file visible to the connected Google account. */
export interface GoogleDriveSession {
  /** List a folder or search across the whole Drive, including shared drives. */
  list(options?: GoogleDriveListOptions): Promise<GoogleDrivePage>;

  /** Get metadata for a file or folder by ID. */
  get(itemId: string): Promise<GoogleDriveItem>;

  /**
   * Stream a file's content. Google Docs export as plain text, Sheets as CSV,
   * Slides as PDF, and Drawings as PNG by default. Pass an export MIME type to
   * request another supported format or to export another Google-native type.
   */
  download(itemId: string, exportMimeType?: string): Promise<GoogleDriveDownload>;
}
