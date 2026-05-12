import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  AuthenticationError,
  BudgetExceededError,
  HalalBlockedError,
  NetworkError,
  NimerError,
  NotFoundError,
  PermissionError,
  RateLimitError,
  ValidationError,
} from "../src/errors.js";
import { HttpClient } from "../src/http.js";

interface MockResponseInit {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
}

function mockJsonResponse(init: MockResponseInit = {}): Response {
  const status = init.status ?? 200;
  const body = init.body === undefined ? "" : JSON.stringify(init.body);
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

function makeClient(fetchImpl: typeof fetch): HttpClient {
  return new HttpClient({
    baseUrl: "https://api.test.local",
    apiKey: "nm_test_key",
    fetch: fetchImpl,
    timeoutMs: 5_000,
    maxRetries: 2,
  });
}

describe("HttpClient", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("requires an apiKey", () => {
    expect(
      () =>
        new HttpClient({
          baseUrl: "https://api.test.local",
          apiKey: "",
        })
    ).toThrowError(NimerError);
  });

  it("requires a baseUrl", () => {
    expect(
      () =>
        new HttpClient({
          baseUrl: "",
          apiKey: "nm_foo",
        })
    ).toThrowError(NimerError);
  });

  it("attaches Authorization + User-Agent headers", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(mockJsonResponse({ body: { ok: true } }));
    const client = makeClient(fetchImpl);
    await client.get<{ ok: boolean }>("/v1/account");
    const call = fetchImpl.mock.calls[0]!;
    const init = call[1] as RequestInit;
    const headers = init.headers as Headers;
    expect(headers.get("authorization")).toBe("Bearer nm_test_key");
    expect(headers.get("user-agent")).toContain("nimer-sdk-ts");
    expect(headers.get("x-nimer-sdk")).toContain("nimer-sdk-ts");
  });

  it("appends query parameters and strips nullish values", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(mockJsonResponse({ body: [] }));
    const client = makeClient(fetchImpl);
    await client.get("/v1/audit", {
      query: { limit: 50, action: undefined, since: null, x: 0, y: false },
    });
    const url = fetchImpl.mock.calls[0]![0] as string;
    expect(url).toContain("limit=50");
    expect(url).toContain("x=0");
    expect(url).toContain("y=false");
    expect(url).not.toContain("action=");
    expect(url).not.toContain("since=");
  });

  it("parses 401 into AuthenticationError", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        mockJsonResponse({ status: 401, body: { detail: "bad token" } })
      );
    const client = makeClient(fetchImpl);
    await expect(client.get("/v1/account")).rejects.toBeInstanceOf(
      AuthenticationError
    );
  });

  it("parses 402 into BudgetExceededError with provider/model context", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        mockJsonResponse({
          status: 402,
          body: {
            detail: {
              message: "Budget exceeded",
              provider: "openai",
              model: "gpt-5-mini",
            },
          },
        })
      );
    const client = makeClient(fetchImpl);
    let caught: unknown;
    try {
      await client.post("/v1/chat", { messages: [] });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(BudgetExceededError);
    const err = caught as BudgetExceededError;
    expect(err.provider).toBe("openai");
    expect(err.model).toBe("gpt-5-mini");
  });

  it("parses 403 into PermissionError", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        mockJsonResponse({ status: 403, body: { detail: "admin only" } })
      );
    const client = makeClient(fetchImpl);
    await expect(client.get("/v1/admin/users")).rejects.toBeInstanceOf(
      PermissionError
    );
  });

  it("parses 404 into NotFoundError", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        mockJsonResponse({ status: 404, body: { detail: "missing" } })
      );
    const client = makeClient(fetchImpl);
    await expect(client.get("/v1/keys/foo")).rejects.toBeInstanceOf(
      NotFoundError
    );
  });

  it("parses 422 + Pydantic detail array into ValidationError", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      mockJsonResponse({
        status: 422,
        body: {
          detail: [
            { loc: ["body", "messages"], msg: "field required", type: "missing" },
          ],
        },
      })
    );
    const client = makeClient(fetchImpl);
    let caught: unknown;
    try {
      await client.post("/v1/chat", { mode: "auto" });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ValidationError);
    const err = caught as ValidationError;
    expect(err.fields).toHaveLength(1);
    expect(err.fields?.[0]?.msg).toBe("field required");
  });

  it("parses 451 into HalalBlockedError with reason + type", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      mockJsonResponse({
        status: 451,
        body: {
          detail: {
            message: "Halal block",
            type: "halal_block",
            reason: "gambling",
          },
        },
      })
    );
    const client = makeClient(fetchImpl);
    let caught: unknown;
    try {
      await client.post("/v1/chat", { messages: [] });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(HalalBlockedError);
    const err = caught as HalalBlockedError;
    expect(err.reason).toBe("gambling");
    expect(err.halalType).toBe("halal_block");
  });

  it("retries on 5xx and eventually succeeds", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(mockJsonResponse({ status: 503 }))
      .mockResolvedValueOnce(mockJsonResponse({ status: 502 }))
      .mockResolvedValueOnce(mockJsonResponse({ body: { ok: true } }));
    const client = makeClient(fetchImpl);
    const promise = client.get<{ ok: boolean }>("/v1/account");
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("respects maxRetries and surfaces the final error", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(mockJsonResponse({ status: 503, body: { detail: "down" } }));
    const client = makeClient(fetchImpl);
    let caught: unknown;
    const settled = client.get<unknown>("/v1/account").catch((err) => {
      caught = err;
    });
    await vi.runAllTimersAsync();
    await settled;
    expect(NimerError.isNimerError(caught)).toBe(true);
    expect((caught as NimerError).status).toBe(503);
    expect(fetchImpl).toHaveBeenCalledTimes(3); // 1 + 2 retries
  });

  it("retries on 429 only when Retry-After is present", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        mockJsonResponse({
          status: 429,
          body: { detail: "slow down" },
          headers: { "Retry-After": "0" },
        })
      )
      .mockResolvedValueOnce(mockJsonResponse({ body: { ok: true } }));
    const client = makeClient(fetchImpl);
    const promise = client.get<{ ok: boolean }>("/v1/chat");
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does not retry on 429 without Retry-After", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        mockJsonResponse({ status: 429, body: { detail: "slow down" } })
      );
    const client = makeClient(fetchImpl);
    let caught: unknown;
    const settled = client.get<unknown>("/v1/chat").catch((err) => {
      caught = err;
    });
    await vi.runAllTimersAsync();
    await settled;
    expect(caught).toBeInstanceOf(RateLimitError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("surfaces 204 No Content as undefined", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 204 }));
    const client = makeClient(fetchImpl);
    const result = await client.delete<void>("/v1/webhook-endpoints/abc");
    expect(result).toBeUndefined();
  });

  it("wraps a non-NimerError fetch failure as NetworkError after retries", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new TypeError("connect ECONNREFUSED"));
    const client = makeClient(fetchImpl);
    let caught: unknown;
    const settled = client.get<unknown>("/v1/account").catch((err) => {
      caught = err;
    });
    await vi.runAllTimersAsync();
    await settled;
    expect(caught).toBeInstanceOf(NetworkError);
  });

  it("does not retry 400 (bad request)", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      mockJsonResponse({ status: 400, body: { detail: "bad shape" } })
    );
    const client = makeClient(fetchImpl);
    let caught: unknown;
    try {
      await client.post("/v1/chat", { messages: [] });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ApiError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("falls back to a plain ApiError on unknown 4xx", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        mockJsonResponse({ status: 418, body: { detail: "I'm a teapot" } })
      );
    const client = makeClient(fetchImpl);
    let caught: unknown;
    try {
      await client.get("/v1/teapot");
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).status).toBe(418);
    expect((caught as ApiError).message).toContain("teapot");
  });

  it("preserves trailing-slash safety in buildUrl", () => {
    const client = new HttpClient({
      baseUrl: "https://api.test.local/",
      apiKey: "k",
      fetch: vi.fn(),
    });
    expect(client.buildUrl("/v1/x")).toBe("https://api.test.local/v1/x");
    expect(client.buildUrl("v1/y")).toBe("https://api.test.local/v1/y");
  });

  it("isNimerError discriminates across copies of the class", () => {
    const err = new AuthenticationError();
    expect(NimerError.isNimerError(err)).toBe(true);
    expect(NimerError.isNimerError(new Error("plain"))).toBe(false);
    expect(NimerError.isNimerError(null)).toBe(false);
    expect(NimerError.isNimerError({ status: 401 })).toBe(false);
  });
});
