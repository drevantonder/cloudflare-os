import type { PreparedPart } from "./prepared-document.js";

export const VISION_MODEL = "gemini-3.5-flash-lite";

export type GatewayConfig = {
  accountId: string;
  apiToken: string;
  gateway: string;
};

export function readGatewayConfig(env: Cloudflare.Env): GatewayConfig {
  if (!env.CF_AI_GATEWAY || !env.CF_AI_GATEWAY_ACCOUNT_ID || !env.CF_AI_GATEWAY_API_TOKEN) {
    throw new Error(
      "LLM Vision requires CF_AI_GATEWAY, CF_AI_GATEWAY_ACCOUNT_ID, and " +
      "CF_AI_GATEWAY_API_TOKEN.",
    );
  }
  return {
    accountId: env.CF_AI_GATEWAY_ACCOUNT_ID,
    apiToken: env.CF_AI_GATEWAY_API_TOKEN,
    gateway: env.CF_AI_GATEWAY,
  };
}

export async function analyzeWithGemini(
  config: GatewayConfig,
  prompt: string,
  parts: PreparedPart[],
  fetcher: typeof fetch = fetch,
): Promise<string> {
  const response = await fetcher(
    `https://gateway.ai.cloudflare.com/v1/${encodeURIComponent(config.accountId)}/` +
      `${encodeURIComponent(config.gateway)}/google-ai-studio/v1beta/models/` +
      `${encodeURIComponent(VISION_MODEL)}:generateContent`,
    {
      method: "POST",
      headers: {
        "cf-aig-authorization": `Bearer ${config.apiToken}`,
        "content-type": "application/json",
        "x-goog-api-key": config.apiToken,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: geminiParts(prompt, parts) }],
        generationConfig: {
          maxOutputTokens: 8192,
          temperature: 0,
          thinkingConfig: { thinkingLevel: "low" },
        },
      }),
    },
  );
  if (!response.ok) {
    throw new Error(`LLM Vision request failed with HTTP ${response.status}.`);
  }
  const result = await response.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = result.candidates?.flatMap(({ content }) => content?.parts ?? [])
    .map((part) => part.text ?? "").join("").trim() ?? "";
  if (!text) throw new Error("LLM Vision returned an empty response.");
  return text;
}

export function geminiParts(prompt: string, parts: PreparedPart[]): Array<Record<string, unknown>> {
  const result: Array<Record<string, unknown>> = [{ text: prompt }];
  let previousBoundary = "";
  for (const part of parts) {
    const boundary = `File ${part.fileNumber}${part.pageNumber ? `, page ${part.pageNumber}` : ""}`;
    if (boundary !== previousBoundary) {
      result.push({ text: `\n\n--- ${boundary} ---\n` });
      previousBoundary = boundary;
    }
    if (part.type === "text") result.push({ text: part.text });
    else result.push({ inlineData: { data: bytesToBase64(part.bytes), mimeType: part.mediaType } });
  }
  return result;
}

function bytesToBase64(bytes: Uint8Array): string {
  let value = "";
  for (let offset = 0; offset < bytes.length; offset += 32 * 1024) {
    value += String.fromCharCode(...bytes.subarray(offset, offset + 32 * 1024));
  }
  return btoa(value);
}
