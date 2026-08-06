# LLM Vision

LLM Vision is an auto-provisioned ambient gatekeeper that analyzes images and PDFs with
`gemini-3.5-flash-lite`. Its MuPDF preprocessing routes text-native PDF pages as semantic text,
scanned pages as rendered images, and mixed pages as both.

The Worker requires `CF_AI_GATEWAY`, `CF_AI_GATEWAY_ACCOUNT_ID`, and
`CF_AI_GATEWAY_API_TOKEN`. The configured gateway must have a stored Google AI Studio key.

The agent-facing API is intentionally small:

```ts
const answer = await VISION.analyze(prompt, files);
```

Files and model responses are not persisted.
