# OpenAI Codex gatekeeper

This gatekeeper connects a ChatGPT account with OpenAI's Codex device authorization flow. The
Workshop uses the resulting short-lived access token with Pi's direct OpenAI Codex provider.

## Cloudflare OS integration

Cloudflare OS owns the explicit Codex model catalog, Pi transport, account-picker integration, and
Cloudflare-specific egress handling. This package owns only the OpenAI device OAuth flow and token
storage/refresh.

## Cloudflare Workers egress

Cloudflare adds a `CF-Worker` header to public Internet requests made with ordinary Worker
`fetch()`. The ChatGPT Codex endpoint currently rejects those requests with an HTML `403` response
before it checks the access token. Worker code cannot remove the header because Cloudflare adds it
after the request leaves the isolate.

Production deployments should add this VPC Network binding to the **Workshop backend Worker**,
where model inference runs:

```jsonc
{
  "vpc_networks": [
    {
      "binding": "OPENAI_CODEX_EGRESS",
      "network_id": "cf1:network"
    }
  ]
}
```

The backend sends Codex inference through `OPENAI_CODEX_EGRESS.fetch()`. Workers VPC is currently
in beta and is available on all Workers plans. Public-Internet egress through `cf1:network` also
requires an active Cloudflare Tunnel, Mesh node, or Cloudflare WAN on-ramp that can reach the
destination.

If the binding is absent, the provider falls back to ordinary `fetch()`. This supports local and
non-Cloudflare runtimes. If that fallback receives the HTML `403` caused by `CF-Worker`, the model
shows an actionable configuration error instead of the block page. JSON `403` authorization and
account errors are preserved unchanged.

For local development against the remote VPC Network binding, start the development server with:

```sh
pnpm dev-server --use-openai-codex-egress
```
