const CF_WORKER_BLOCK_MESSAGE =
    "OpenAI Codex rejected this Cloudflare Worker request because Workers add the " +
    "CF-Worker header. Configure an OPENAI_CODEX_EGRESS VPC Network binding using " +
    'network_id: "cf1:network", then retry.';

export function createOpenAICodexFetch(egress?: Fetcher): typeof globalThis.fetch {
  if (egress) return (input, init) => egress.fetch(new Request(input, init));
  return async (input, init) => {
    const response = await globalThis.fetch(input, init);
    if (response.status !== 403 ||
        !response.headers.get("content-type")?.toLowerCase().startsWith("text/html")) {
      return response;
    }
    const headers = new Headers(response.headers);
    headers.set("content-type", "application/json");
    headers.delete("content-encoding");
    headers.delete("content-length");
    return Response.json({
      error: { type: "cf_worker_egress_blocked", message: CF_WORKER_BLOCK_MESSAGE },
    }, { status: response.status, statusText: response.statusText, headers });
  };
}
