/**
 * Helpers for verifying inbound webhooks signed by Nimer (F6).
 *
 * Nimer signs every outbound payload with HMAC-SHA256 using the per-endpoint
 * secret revealed at create time, and ships the signature in the
 * `X-Nimer-Signature` header as `t=<unix-seconds>,v1=<hex>`.
 *
 * Verify on your server like this:
 *
 * ```ts
 * import { verifyWebhookSignature } from "@nimer/sdk";
 *
 * const valid = await verifyWebhookSignature({
 *   payload: rawBody,
 *   header: req.headers["x-nimer-signature"],
 *   secret: process.env.NIMER_WEBHOOK_SECRET!,
 *   toleranceSeconds: 300,
 * });
 * if (!valid) return res.status(401).end();
 * ```
 *
 * Returns `true` only if the signature is valid AND the timestamp is within
 * the tolerance window (default 5 minutes), which protects against replay
 * attacks.
 */

export interface VerifyWebhookOptions {
  /** The raw request body, exactly as the server received it. Do NOT JSON-parse before passing. */
  payload: string | Uint8Array;
  /** Contents of the `X-Nimer-Signature` header. */
  header: string | string[] | null | undefined;
  /** Per-endpoint secret returned by `client.webhooks.create()`. */
  secret: string;
  /** Replay-protection window in seconds. Default: 300 s. Pass `Infinity` to disable. */
  toleranceSeconds?: number;
  /** Override `Date.now()` — test-only. */
  now?: () => number;
}

/**
 * Returns `true` if the payload signature is valid AND the timestamp is fresh.
 * Throws nothing — invalid input simply returns `false`.
 */
export async function verifyWebhookSignature(
  opts: VerifyWebhookOptions
): Promise<boolean> {
  const parsed = parseSignatureHeader(opts.header);
  if (!parsed) return false;

  const toleranceSeconds = opts.toleranceSeconds ?? 300;
  const now = (opts.now ?? Date.now)();
  const driftSec = Math.abs(now / 1000 - parsed.timestamp);
  if (toleranceSeconds !== Infinity && driftSec > toleranceSeconds) return false;

  const payloadBytes = toBytes(opts.payload);
  const message = concatBytes(
    new TextEncoder().encode(`${parsed.timestamp}.`),
    payloadBytes
  );
  const expected = await hmacSha256Hex(opts.secret, message);
  return constantTimeEqual(expected, parsed.signature);
}

/**
 * Compute the signature header value Nimer would attach for this payload.
 * Useful when building tests or simulating webhooks locally. **Never use this
 * on user input** — it's a sender helper, not a validator.
 */
export async function signWebhookPayload(
  payload: string | Uint8Array,
  secret: string,
  timestamp: number = Math.floor(Date.now() / 1000)
): Promise<string> {
  const payloadBytes = toBytes(payload);
  const message = concatBytes(
    new TextEncoder().encode(`${timestamp}.`),
    payloadBytes
  );
  const sig = await hmacSha256Hex(secret, message);
  return `t=${timestamp},v1=${sig}`;
}

// ── internals ─────────────────────────────────────────────────────────────

interface ParsedSignature {
  timestamp: number;
  signature: string;
}

function parseSignatureHeader(
  header: VerifyWebhookOptions["header"]
): ParsedSignature | null {
  if (!header) return null;
  const raw = Array.isArray(header) ? header[0] : header;
  if (!raw || typeof raw !== "string") return null;
  let timestamp: number | null = null;
  let signature: string | null = null;
  for (const part of raw.split(",")) {
    const [k, v] = part.split("=", 2);
    if (!k || !v) continue;
    if (k.trim() === "t") {
      const n = Number(v.trim());
      if (!Number.isNaN(n)) timestamp = n;
    } else if (k.trim() === "v1") {
      signature = v.trim();
    }
  }
  if (timestamp === null || !signature) return null;
  return { timestamp, signature };
}

function toBytes(input: string | Uint8Array): Uint8Array {
  return typeof input === "string" ? new TextEncoder().encode(input) : input;
}

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

async function hmacSha256Hex(secret: string, message: Uint8Array): Promise<string> {
  const subtle = await getSubtleCrypto();
  // Cast through ArrayBuffer to satisfy TS5.7+'s narrowed `BufferSource` type,
  // which excludes SharedArrayBuffer. Web Crypto accepts either at runtime.
  const keyBytes = new TextEncoder().encode(secret) as Uint8Array;
  const key = await subtle.importKey(
    "raw",
    keyBytes.buffer as ArrayBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuf = await subtle.sign(
    "HMAC",
    key,
    (message.buffer as ArrayBuffer).slice(
      message.byteOffset,
      message.byteOffset + message.byteLength
    )
  );
  return bytesToHex(new Uint8Array(sigBuf));
}

function bytesToHex(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i] ?? 0;
    s += b.toString(16).padStart(2, "0");
  }
  return s;
}

/** Constant-time equality on equal-length hex strings. */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function getSubtleCrypto(): Promise<SubtleCrypto> {
  // Browsers + modern Node 18+ expose `globalThis.crypto.subtle`.
  const g = globalThis as unknown as { crypto?: Crypto };
  if (g.crypto?.subtle) return g.crypto.subtle;
  // Older Node fallback.
  try {
    const mod = (await import("node:crypto")) as unknown as {
      webcrypto?: { subtle: SubtleCrypto };
    };
    if (mod.webcrypto?.subtle) return mod.webcrypto.subtle;
  } catch {
    // ignore — handled below.
  }
  throw new Error(
    "Web Crypto API is unavailable. Upgrade to Node 18+ or run in a modern browser."
  );
}
