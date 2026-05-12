# @nimerdev/sdk

[![npm version](https://img.shields.io/npm/v/@nimerdev/sdk?color=blue)](https://www.npmjs.com/package/@nimerdev/sdk)
[![npm downloads](https://img.shields.io/npm/dm/@nimerdev/sdk?color=blue)](https://www.npmjs.com/package/@nimerdev/sdk)
[![bundle size](https://img.shields.io/bundlephobia/minzip/@nimerdev/sdk?color=blue)](https://bundlephobia.com/package/@nimerdev/sdk)
[![types](https://img.shields.io/npm/types/@nimerdev/sdk)](https://www.npmjs.com/package/@nimerdev/sdk)
[![license](https://img.shields.io/npm/l/@nimerdev/sdk?color=blue)](./LICENSE)

Official TypeScript SDK for [Nimer](https://nimer.dev) — the multi-provider AI gateway with built-in halal compliance, virtual keys, prompt cache, quality-aware routing, audit log, and outgoing webhooks.

> **One client, 7 providers, halal-aware out of the box.** Switch from OpenAI SDK in 3 lines and inherit virtual keys, budget caps, prompt cache, function calling, streaming, webhooks, audit log, and a halal-content filter — all behind a single `nm_…` key.

- ✅ **Single client, every endpoint** — chat, ultrathink, embeddings, virtual keys, audit log, webhooks
- ✅ **Halal-aware** — typed `HalalBlockedError` with reason + category
- ✅ **Streaming-first** — `client.chat.stream()` yields typed SSE chunks; `streamText()` yields plain strings
- ✅ **Function calling (F8)** — accepts OpenAI- and Anthropic-shaped tool definitions
- ✅ **Webhook verification** — first-class HMAC-SHA256 helper with replay protection
- ✅ **Dual ESM + CJS** — Node 18+, Edge runtimes, modern browsers (with bundler)
- ✅ **Tiny + zero runtime deps** — just the platform `fetch` and Web Crypto

```bash
npm install @nimerdev/sdk
# or
pnpm add @nimerdev/sdk
# or
yarn add @nimerdev/sdk
```

---

## Quick start

```ts
import { NimerClient } from "@nimerdev/sdk";

const client = new NimerClient({ apiKey: process.env.NIMER_API_KEY });

// Smart-routed chat — Nimer picks the best model for the task.
const reply = await client.chat.createText([
  { role: "user", content: "Summarise this in two bullets: …" },
]);
console.log(reply);
```

The client reads `NIMER_API_KEY` and `NIMER_BASE_URL` from `process.env` when present, so you can omit them in most setups:

```ts
const client = new NimerClient(); // uses NIMER_API_KEY
```

## Streaming

```ts
for await (const chunk of client.chat.streamText({
  messages: [{ role: "user", content: "Write me a haiku." }],
})) {
  process.stdout.write(chunk);
}
```

For full SSE chunks (token usage, tool calls, finish reason):

```ts
for await (const chunk of client.chat.stream({
  messages: [{ role: "user", content: "Hello" }],
  model: "claude-haiku-4-5",
})) {
  console.log(chunk);
}
```

## Ultrathink (fan-out + synthesis)

```ts
const res = await client.chat.ultrathink([
  { role: "user", content: "Best framework for a side project?" },
]);
console.log(res.providers_used); // ["openai", "anthropic", "gemini"]
console.log(res.content);        // synthesised answer
```

## Function calling (F8 — unified shape)

Both OpenAI and Anthropic tool shapes are accepted — the gateway normalises them before calling the upstream provider.

```ts
const result = await client.chat.create({
  messages: [{ role: "user", content: "Weather in Riyadh right now?" }],
  tools: [
    {
      type: "function",
      function: {
        name: "get_weather",
        description: "Fetch current weather for a city",
        parameters: {
          type: "object",
          properties: { city: { type: "string" } },
          required: ["city"],
        },
      },
    },
  ],
  tool_choice: "auto",
});
if (result.mode === "auto" && result.tool_calls) {
  for (const call of result.tool_calls) {
    console.log(call.function?.name, call.function?.arguments);
  }
}
```

## Embeddings (F2)

```ts
const { data, usage } = await client.embeddings.create({
  model: "text-embedding-3-small",
  input: ["one document", "another document"],
});
console.log(usage.prompt_tokens, data[0].embedding.length);
```

## Virtual keys

```ts
const vk = await client.virtualKeys.create({
  name: "prod-mobile-app",
  monthly_budget_usd: 50,
  allowed_providers: ["anthropic", "openai"],
  halal_mode: true,
  fallback_chain: ["claude-haiku-4-5", "gpt-5-mini"],
});
console.log("Save this once:", vk.key); // vk_…

const usage = await client.virtualKeys.usage(vk.id);
console.log(usage.spent_usd, usage.remaining_usd);
```

## Outgoing webhooks (F6)

Create an endpoint, then verify deliveries on your server:

```ts
const ep = await client.webhooks.create({
  url: "https://example.com/nimer-events",
  events: ["anomaly.detected", "anomaly.paused", "halal.blocked"],
  description: "Production ops channel",
});
console.log("STORE THIS SECRET:", ep.secret);
```

On the receiving server:

```ts
import { verifyWebhookSignature } from "@nimerdev/sdk";

app.post("/nimer-events", express.text({ type: "*/*" }), async (req, res) => {
  const ok = await verifyWebhookSignature({
    payload: req.body,
    header: req.headers["x-nimer-signature"],
    secret: process.env.NIMER_WEBHOOK_SECRET!,
  });
  if (!ok) return res.sendStatus(401);
  const event = JSON.parse(req.body);
  // handle event …
  res.sendStatus(204);
});
```

`verifyWebhookSignature` performs constant-time HMAC comparison and rejects timestamps outside a 5-minute window by default.

## Audit log (F7)

```ts
// Recent privileged actions for this user
const events = await client.audit.list({ action: "key", limit: 50 });

// Streaming CSV export — pipes directly to disk without buffering
import { createWriteStream } from "node:fs";
const out = createWriteStream("audit.csv");
for await (const line of client.audit.exportCsv({ since: "2026-01-01" })) {
  out.write(line + "\n");
}
out.end();
```

## Halal Mode (F4)

```ts
// Account-wide toggle
await client.account.update({ halal_mode: true });

// Public list of Halal-certified models (no auth required, suitable for landing pages)
const certified = await client.halal.certifiedModels();

// Audit trail of blocks
const audit = await client.halal.audit({ limit: 100, reason: "gambling" });

// Catch blocks
import { HalalBlockedError } from "@nimerdev/sdk";
try {
  await client.chat.create({ messages: [{ role: "user", content: "Best wines?" }] });
} catch (err) {
  if (err instanceof HalalBlockedError) {
    console.log("blocked because:", err.reason); // e.g. "alcohol"
  }
}
```

## Spend protection (F3)

```ts
await client.account.update({
  auto_pause_on_anomaly: true,
  anomaly_threshold_multiplier: 5,
});

const events = await client.anomalies.list({ unacknowledgedOnly: true });
await client.anomalies.acknowledgeAll();
```

## Error handling

Every failure is a subclass of `NimerError`:

| Class                    | When                                                  |
|--------------------------|-------------------------------------------------------|
| `AuthenticationError`    | 401 — bad / revoked / missing API key                 |
| `BudgetExceededError`    | 402 — user or virtual-key budget cap hit              |
| `PermissionError`        | 403 — admin-only resource                             |
| `NotFoundError`          | 404                                                   |
| `ValidationError`        | 422 — exposes Pydantic-shaped `.fields`               |
| `RateLimitError`         | 429 — `.retryAfterMs` when present                    |
| `HalalBlockedError`      | 451 — exposes `.reason` + `.halalType`                |
| `ProviderError`          | 5xx — all upstream-provider fallbacks failed          |
| `NetworkError`           | DNS / connection refused / timeout                    |
| `CancelledError`         | `AbortSignal` was aborted by the caller               |
| `ApiError`               | Generic fallback for unmodelled status codes          |

Use `NimerError.isNimerError(err)` for cross-bundle-safe discrimination (avoids `instanceof` issues with duplicate copies in monorepos).

## Cancellation + timeouts

```ts
const ac = new AbortController();
setTimeout(() => ac.abort(), 5_000);

await client.chat.create(
  { messages: [{ role: "user", content: "Hello" }] },
  { signal: ac.signal, timeoutMs: 10_000 }
);
```

Per-call `timeoutMs` overrides the client-level default (60 s).

## Configuration

```ts
new NimerClient({
  apiKey: "nm_…",            // required
  baseUrl: "https://api.nimer.dev",
  timeoutMs: 60_000,          // hard timeout per request
  maxRetries: 2,              // 5xx + 429-with-Retry-After
  fetch: customFetch,         // BYO fetch (undici, ky, etc.)
  defaultHeaders: { "X-App": "my-bot" },
});
```

## Compatibility

- **Node.js**: 18 LTS or newer
- **Bun / Deno**: should work out of the box (native `fetch` + Web Crypto)
- **Edge runtimes**: Vercel Edge, Cloudflare Workers, Netlify Edge — all good
- **Browsers**: modern evergreen browsers; bundle through Vite/webpack/rollup. Never expose your `nm_…` key client-side; use a virtual key with a tight budget.

## License

MIT — see [LICENSE](./LICENSE).
