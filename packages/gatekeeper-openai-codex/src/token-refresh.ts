export type CodexTokens = {
  access: string;
  refresh: string;
  id: string | null;
  expires: number;
};

// A refresh response may arrive after reconnect or revoke changed persistent credentials.
export function tokensChanged(current: CodexTokens, refreshedFrom: CodexTokens): boolean {
  return current.access !== refreshedFrom.access
    || current.refresh !== refreshedFrom.refresh
    || current.id !== refreshedFrom.id
    || current.expires !== refreshedFrom.expires;
}
