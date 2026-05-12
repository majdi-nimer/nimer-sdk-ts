import {
  ApiError,
  AuthenticationError,
  BudgetExceededError,
  CancelledError,
  HalalBlockedError,
  NetworkError,
  NimerError,
  NotFoundError,
  PermissionError,
  ProviderError,
  RateLimitError,
  ValidationError,
} from "./errors.js";

export interface HttpClientOptions {
  baseUrl: string;
  apiKey: string;
  /** Per-request hard timeout. Default 60 s for chat, but the client allows per-call override. */
  timeoutMs?: number;
  /** Total retries on transient failures (5xx + network). Default 2 → 3 total attempts. */
  maxRetries?: number;
  /** Custom fetch implementation. Defaults to globalThis.fetch. */
  fetch?: typeof globalThis.fetch;
  /** Default headers to merge into every request (e.g. `X-Forwarded-For` from a proxy). */
  defaultHeaders?: Record<string, string>;
  /** SDK version string forwarded as `User-Agent`. */
  userAgent?: string;
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
  headers?: Record<string, string>;
  /** Override the client-level timeout for this single call. */
  timeoutMs?: number;
  /** Override the client-level retry count for this single call. */
  maxRetries?: number;
  /** Caller-supplied abort signal — composed with the timeout signal. */
  signal?: AbortSignal;
  /** Skip JSON parsing — useful for streaming + CSV download. */
  rawResponse?: boolean;
}

const TRANSIENT_STATUSES = new Set([502, 503, 504]);

export class HttpClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly defaultHeaders: Record<string, string>;
  private readonly defaultTimeoutMs: number;
  private readonly defaultMaxRetries: number;
  private readonly userAgent: string;

  constructor(opts: HttpClientOptions) {
    if (!opts.apiKey || typeof opts.apiKey !== "string") {
      throw new NimerError("apiKey is required to construct a NimerClient");
    }
    if (!opts.baseUrl || typeof opts.baseUrl !== "string") {
      throw new NimerError("baseUrl is required to construct a NimerClient");
    }
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.apiKey = opts.apiKey;
    this.fetchImpl = opts.fetch ?? globalThis.fetch.bind(globalThis);
    this.defaultHeaders = opts.defaultHeaders ?? {};
    this.defaultTimeoutMs = opts.timeoutMs ?? 60_000;
    this.defaultMaxRetries = opts.maxRetries ?? 2;
    this.userAgent = opts.userAgent ?? `nimer-sdk-ts/0.1.0`;
  }

  /** Builds a fully-qualified URL — exposed so streaming helpers can reuse it. */
  buildUrl(path: string, query?: RequestOptions["query"]): string {
    const search = encodeQuery(query);
    return `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}${search}`;
  }

  buildHeaders(extra?: Record<string, string>, hasBody?: boolean): Headers {
    const headers = new Headers();
    headers.set("Authorization", `Bearer ${this.apiKey}`);
    headers.set("User-Agent", this.userAgent);
    headers.set("X-Nimer-SDK", "nimer-sdk-ts/0.1.0");
    if (hasBody) headers.set("Content-Type", "application/json");
    for (const [k, v] of Object.entries(this.defaultHeaders)) headers.set(k, v);
    for (const [k, v] of Object.entries(extra ?? {})) headers.set(k, v);
    return headers;
  }

  /**
   * Single request — typed JSON unless `rawResponse: true` is passed (in which
   * case the caller is responsible for consuming the body).
   */
  async request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    const method = opts.method ?? "GET";
    const maxRetries = opts.maxRetries ?? this.defaultMaxRetries;
    const timeoutMs = opts.timeoutMs ?? this.defaultTimeoutMs;
    const url = this.buildUrl(path, opts.query);
    const hasBody = opts.body !== undefined;
    const headers = this.buildHeaders(opts.headers, hasBody);
    const bodyInit: BodyInit | undefined = hasBody
      ? typeof opts.body === "string"
        ? opts.body
        : JSON.stringify(opts.body)
      : undefined;

    let lastError: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const { signal, cancel } = composeSignal(opts.signal, timeoutMs);
      try {
        const res = await this.fetchImpl(url, {
          method,
          headers,
          body: bodyInit,
          signal,
        });
        cancel();

        if (res.ok) {
          if (opts.rawResponse) return res as unknown as T;
          if (res.status === 204) return undefined as unknown as T;
          const text = await res.text();
          if (!text) return undefined as unknown as T;
          return JSON.parse(text) as T;
        }

        const shouldRetry =
          attempt < maxRetries &&
          (TRANSIENT_STATUSES.has(res.status) ||
            (res.status === 429 && hasRetryAfter(res)));

        if (shouldRetry) {
          const wait = retryDelay(attempt, res);
          await sleep(wait);
          continue;
        }

        throw await mapResponseToError(res);
      } catch (err) {
        cancel();
        // Re-throw response-mapped Nimer errors verbatim — retry decisions for
        // 5xx + 429 already happen via `shouldRetry` above so they never
        // reach this branch when a retry is warranted.
        if (NimerError.isNimerError(err)) throw err;
        // Network / abort / DNS.
        if (isAbortError(err)) {
          if (opts.signal?.aborted) throw new CancelledError();
          if (attempt < maxRetries) {
            lastError = err;
            await sleep(retryDelay(attempt));
            continue;
          }
          throw new NetworkError(`Request timed out after ${timeoutMs}ms`, { cause: err });
        }
        if (attempt < maxRetries) {
          lastError = err;
          await sleep(retryDelay(attempt));
          continue;
        }
        throw new NetworkError(
          err instanceof Error ? err.message : "Network request failed",
          { cause: err }
        );
      }
    }
    // Unreachable in practice — the loop either returns or throws.
    throw lastError instanceof Error
      ? lastError
      : new NetworkError("Request failed after retries");
  }

  /** Convenience for `GET` with typed JSON body. */
  get<T>(path: string, opts: Omit<RequestOptions, "method" | "body"> = {}): Promise<T> {
    return this.request<T>(path, { ...opts, method: "GET" });
  }

  post<T>(path: string, body?: unknown, opts: Omit<RequestOptions, "method"> = {}): Promise<T> {
    return this.request<T>(path, { ...opts, method: "POST", body });
  }

  patch<T>(path: string, body?: unknown, opts: Omit<RequestOptions, "method"> = {}): Promise<T> {
    return this.request<T>(path, { ...opts, method: "PATCH", body });
  }

  delete<T>(path: string, opts: Omit<RequestOptions, "method" | "body"> = {}): Promise<T> {
    return this.request<T>(path, { ...opts, method: "DELETE" });
  }
}

// ── helpers ────────────────────────────────────────────────────────────────

function encodeQuery(q: RequestOptions["query"]): string {
  if (!q) return "";
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined || v === null) continue;
    params.append(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

function composeSignal(
  caller: AbortSignal | undefined,
  timeoutMs: number
): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const onAbort = () => controller.abort(caller?.reason);
  if (caller) {
    if (caller.aborted) controller.abort(caller.reason);
    else caller.addEventListener("abort", onAbort, { once: true });
  }
  const timer: ReturnType<typeof setTimeout> | undefined =
    timeoutMs > 0 ? setTimeout(() => controller.abort(new Error("timeout")), timeoutMs) : undefined;
  return {
    signal: controller.signal,
    cancel: () => {
      if (timer) clearTimeout(timer);
      caller?.removeEventListener("abort", onAbort);
    },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelay(attempt: number, res?: Response): number {
  if (res) {
    const retryAfter = res.headers.get("retry-after");
    if (retryAfter) {
      const n = Number(retryAfter);
      if (!Number.isNaN(n)) return n * 1000;
    }
  }
  // 250 ms, 750 ms, 2.25 s, 6.75 s — exponential with jitter cap.
  const base = 250 * Math.pow(3, attempt);
  const jitter = Math.random() * 250;
  return Math.min(base + jitter, 10_000);
}

function hasRetryAfter(res: Response): boolean {
  return res.headers.has("retry-after");
}

function isAbortError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    ((err as { name?: string }).name === "AbortError" ||
      (err as { code?: string }).code === "ABORT_ERR")
  );
}

async function mapResponseToError(res: Response): Promise<NimerError> {
  const requestId = res.headers.get("x-request-id") ?? undefined;
  let body: unknown = {};
  let bodyText = "";
  try {
    bodyText = await res.text();
    body = bodyText ? JSON.parse(bodyText) : {};
  } catch {
    body = { detail: bodyText };
  }
  const detail = (body as Record<string, unknown>).detail;

  // Pydantic 422 emits `detail: [{loc, msg, type}, …]`.
  if (res.status === 422 && Array.isArray(detail)) {
    return new ValidationError("Request validation failed", {
      fields: detail as ValidationError["fields"],
      requestId,
    });
  }

  // Structured provider/halal error from the API.
  if (detail && typeof detail === "object" && !Array.isArray(detail)) {
    const d = detail as Record<string, unknown>;
    const message =
      (typeof d.message === "string" && d.message) ||
      (typeof d.error === "string" && d.error) ||
      `Request failed (${res.status})`;
    const opts = {
      status: res.status,
      requestId,
      provider: typeof d.provider === "string" ? d.provider : undefined,
      model: typeof d.model === "string" ? d.model : undefined,
      rawError: typeof d.raw_error === "string" ? d.raw_error : undefined,
    };
    if (res.status === 451) {
      return new HalalBlockedError(message, {
        ...opts,
        halalType: typeof d.type === "string" ? d.type : undefined,
        reason: typeof d.reason === "string" ? d.reason : undefined,
      });
    }
    if (res.status === 402) return new BudgetExceededError(message, opts);
    if (res.status === 401) return new AuthenticationError(message, opts);
    if (res.status === 403) return new PermissionError(message, opts);
    if (res.status === 404) return new NotFoundError(message, opts);
    if (res.status === 429) {
      const retryAfter = res.headers.get("retry-after");
      const retryAfterMs = retryAfter ? Number(retryAfter) * 1000 : undefined;
      return new RateLimitError(message, { ...opts, retryAfterMs });
    }
    if (res.status >= 500) return new ProviderError(message, opts);
    return new ApiError(message, opts);
  }

  const fallback =
    (typeof detail === "string" && detail) || `Request failed (${res.status})`;
  switch (res.status) {
    case 401:
      return new AuthenticationError(fallback, { requestId });
    case 402:
      return new BudgetExceededError(fallback, { requestId });
    case 403:
      return new PermissionError(fallback, { requestId });
    case 404:
      return new NotFoundError(fallback, { requestId });
    case 429: {
      const retryAfter = res.headers.get("retry-after");
      const retryAfterMs = retryAfter ? Number(retryAfter) * 1000 : undefined;
      return new RateLimitError(fallback, { status: 429, retryAfterMs, requestId });
    }
    case 451:
      return new HalalBlockedError(fallback, { requestId });
    default:
      return res.status >= 500
        ? new ProviderError(fallback, { status: res.status, requestId })
        : new ApiError(fallback, { status: res.status, requestId });
  }
}
