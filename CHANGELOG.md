# Changelog

All notable changes to `@nimerdev/sdk` are documented in this file. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] — 2026-05-12

**Initial public release.** Mirrors the full surface of the [Python SDK](https://pypi.org/project/nimer-sdk/) (`nimer-sdk` 0.2.0) and adds first-class streaming, function calling, and webhook verification for the JavaScript ecosystem.

### Added

- **`NimerClient`** — single entry point reading `NIMER_API_KEY` + `NIMER_BASE_URL` from `process.env` when present.
- **Chat** — `chat.create`, `chat.createText`, `chat.ultrathink` (fan-out + synthesis).
- **Streaming** — `chat.stream` (typed SSE chunks) and `chat.streamText` (plain strings). Cancellable via `AbortSignal`.
- **Function calling (F8)** — accepts OpenAI- and Anthropic-shaped tool definitions in the same request; gateway normalises before dispatch.
- **Embeddings (F2)** — `embeddings.create` with OpenAI-compatible shape; supports Voyage, Cohere, Gemini, and OpenAI families.
- **Virtual keys** — `virtualKeys.create / list / get / usage / revoke`. Per-key halal mode, fallback chains, budget caps, expiry, provider scope.
- **API keys** — `apiKeys.create / list / revoke` for top-level `nm_…` keys.
- **Account** — `account.get / update`. Toggle account-wide halal mode, spend protection, cache.
- **Halal (F4)** — `halal.certifiedModels()` (public, no-auth), `halal.audit()`, typed `HalalBlockedError`.
- **Cache** — `cache.stats()`, `cache.flush()`.
- **Anomalies (F3)** — `anomalies.list({ unacknowledgedOnly })`, `anomalies.acknowledge / acknowledgeAll`.
- **Webhooks (F6)** — `webhooks.create / list / get / update / delete / testPing`, plus delivery inspector.
- **Audit (F7)** — `audit.list({ action, since, until })`, streaming `audit.exportCsv()` for SOC2-ready exports.
- **Providers** — `providers.list / connect / disconnect / test`.
- **Usage** — `usage.summary({ since, until })` returning per-model spend and request counts.
- **Webhook signature helper** — `verifyWebhookSignature` (HMAC-SHA256, 5-minute replay window, constant-time compare) + `signWebhookPayload` for tests.
- **Typed errors** — `NimerError` base with subclasses for every HTTP status (`AuthenticationError`, `BudgetExceededError`, `HalalBlockedError`, `RateLimitError`, `ValidationError`, `ProviderError`, `NetworkError`, …). Cross-bundle-safe `NimerError.isNimerError(err)` brand guard.
- **Retries** — automatic on 5xx + 429-with-`Retry-After` with exponential backoff and jitter; per-call `maxRetries` override.
- **Cancellation** — `AbortSignal` plumbed through every endpoint; per-call `timeoutMs` overrides the client default.

### Build

- Dual ESM + CJS + `.d.ts` via `tsup`.
- Node 18+, neutral platform (Edge runtimes / Bun / Deno).
- Zero runtime dependencies — just the platform `fetch` and Web Crypto.
- 54 unit tests under Vitest; `tsc --noEmit` clean under `strict` + `noUncheckedIndexedAccess`.

### Examples

- `examples/basic.ts` — first chat in 8 lines.
- `examples/webhook-server.ts` — Express endpoint verifying `x-nimer-signature`.
- `examples/tool-calling.ts` — function calling with both OpenAI and Anthropic shapes in one request.

---

[0.1.0]: https://github.com/majdi-nimer/nimer-sdk-ts/releases/tag/v0.1.0
