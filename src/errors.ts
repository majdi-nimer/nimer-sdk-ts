/**
 * Module-level brand symbol — must live outside the class so it can be
 * referenced from a computed property name in the same declaration.
 */
const NIMER_ERROR_BRAND: unique symbol = Symbol.for("nimer.sdk.error");

/**
 * Base class for all errors thrown by the Nimer SDK.
 *
 * Use {@link NimerError.isNimerError} to discriminate at runtime — `instanceof`
 * checks across dual ESM/CJS builds can be flaky when consumers bundle the
 * SDK twice. The static guard inspects a brand symbol instead.
 */
export class NimerError extends Error {
  static readonly brand: symbol = NIMER_ERROR_BRAND;
  readonly [NIMER_ERROR_BRAND]: true = true;

  /** HTTP status when the error originated from a response, else `undefined`. */
  readonly status?: number;
  /** Provider name (e.g. `"openai"`) when the upstream LLM provider returned the error. */
  readonly provider?: string;
  /** Model identifier (e.g. `"gpt-5-mini"`) when the error is model-specific. */
  readonly model?: string;
  /** Sanitised raw upstream error (already passed through Nimer's redaction layer). */
  readonly rawError?: string;
  /** Request-id header echoed by the API when available — useful for support. */
  readonly requestId?: string;

  constructor(
    message: string,
    opts: {
      status?: number;
      provider?: string;
      model?: string;
      rawError?: string;
      requestId?: string;
      cause?: unknown;
    } = {}
  ) {
    super(message, opts.cause ? { cause: opts.cause } : undefined);
    this.name = "NimerError";
    this.status = opts.status;
    this.provider = opts.provider;
    this.model = opts.model;
    this.rawError = opts.rawError;
    this.requestId = opts.requestId;
  }

  static isNimerError(value: unknown): value is NimerError {
    return (
      typeof value === "object" &&
      value !== null &&
      (value as Record<symbol, unknown>)[NIMER_ERROR_BRAND] === true
    );
  }
}

/** 401 — the API key is missing, malformed, or revoked. */
export class AuthenticationError extends NimerError {
  constructor(message = "Authentication required — check your API key", opts: ConstructorParameters<typeof NimerError>[1] = {}) {
    super(message, { ...opts, status: opts.status ?? 401 });
    this.name = "AuthenticationError";
  }
}

/** 402 — the request exceeds the user or virtual-key budget. */
export class BudgetExceededError extends NimerError {
  constructor(message = "Budget exceeded", opts: ConstructorParameters<typeof NimerError>[1] = {}) {
    super(message, { ...opts, status: opts.status ?? 402 });
    this.name = "BudgetExceededError";
  }
}

/** 403 — admin-only or wrong role. */
export class PermissionError extends NimerError {
  constructor(message = "Permission denied", opts: ConstructorParameters<typeof NimerError>[1] = {}) {
    super(message, { ...opts, status: opts.status ?? 403 });
    this.name = "PermissionError";
  }
}

/** 404 — resource (key, virtual key, webhook endpoint) not found. */
export class NotFoundError extends NimerError {
  constructor(message = "Not found", opts: ConstructorParameters<typeof NimerError>[1] = {}) {
    super(message, { ...opts, status: opts.status ?? 404 });
    this.name = "NotFoundError";
  }
}

/** 422 — request body failed Pydantic validation server-side. */
export class ValidationError extends NimerError {
  /** Structured field errors when the server emits Pydantic-style detail arrays. */
  readonly fields?: Array<{ loc: (string | number)[]; msg: string; type: string }>;

  constructor(
    message: string,
    opts: ConstructorParameters<typeof NimerError>[1] & {
      fields?: Array<{ loc: (string | number)[]; msg: string; type: string }>;
    } = {}
  ) {
    super(message, { ...opts, status: opts.status ?? 422 });
    this.name = "ValidationError";
    this.fields = opts.fields;
  }
}

/** 429 — global or per-key rate limit; check `retryAfterMs` if present. */
export class RateLimitError extends NimerError {
  readonly retryAfterMs?: number;

  constructor(
    message = "Rate limit exceeded",
    opts: ConstructorParameters<typeof NimerError>[1] & { retryAfterMs?: number } = {}
  ) {
    super(message, { ...opts, status: opts.status ?? 429 });
    this.name = "RateLimitError";
    this.retryAfterMs = opts.retryAfterMs;
  }
}

/** 451 — request was blocked by Halal Mode (denylist hit, or non-certified model). */
export class HalalBlockedError extends NimerError {
  /** `"halal_block"` (prompt rejected) or `"halal_uncertified_model"` (explicit model not on whitelist). */
  readonly halalType?: string;
  /** Category that triggered the block (e.g. `"gambling"`, `"alcohol"`, `"riba"`). */
  readonly reason?: string;

  constructor(
    message = "Request blocked by Halal Mode",
    opts: ConstructorParameters<typeof NimerError>[1] & {
      halalType?: string;
      reason?: string;
    } = {}
  ) {
    super(message, { ...opts, status: opts.status ?? 451 });
    this.name = "HalalBlockedError";
    this.halalType = opts.halalType;
    this.reason = opts.reason;
  }
}

/** 5xx — upstream provider failure that bubbled through all fallbacks. */
export class ProviderError extends NimerError {
  constructor(message: string, opts: ConstructorParameters<typeof NimerError>[1] = {}) {
    super(message, opts);
    this.name = "ProviderError";
  }
}

/** Network failure, DNS error, fetch abort — no HTTP response was received. */
export class NetworkError extends NimerError {
  constructor(message: string, opts: ConstructorParameters<typeof NimerError>[1] = {}) {
    super(message, opts);
    this.name = "NetworkError";
  }
}

/** The request was cancelled via an `AbortSignal`. */
export class CancelledError extends NimerError {
  constructor(message = "Request was cancelled") {
    super(message);
    this.name = "CancelledError";
  }
}

/** Generic API error with no specific subclass — typically 4xx/5xx we don't model. */
export class ApiError extends NimerError {
  constructor(message: string, opts: ConstructorParameters<typeof NimerError>[1] = {}) {
    super(message, opts);
    this.name = "ApiError";
  }
}
