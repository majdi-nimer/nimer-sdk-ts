import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NimerClient } from "../src/client.js";
import { HalalBlockedError } from "../src/errors.js";

interface MockResponseInit {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
}

function mockJsonResponse(init: MockResponseInit = {}): Response {
  return new Response(init.body === undefined ? "" : JSON.stringify(init.body), {
    status: init.status ?? 200,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

function mockSseResponse(events: string[]): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const ev of events) controller.enqueue(encoder.encode(ev));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

function makeClient(fetchImpl: typeof fetch): NimerClient {
  return new NimerClient({
    apiKey: "nm_test",
    baseUrl: "https://api.test.local",
    fetch: fetchImpl,
    maxRetries: 0,
  });
}

describe("NimerClient construction", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.NIMER_API_KEY;
    delete process.env.NIMER_BASE_URL;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("throws when neither apiKey nor NIMER_API_KEY is set", () => {
    expect(() => new NimerClient()).toThrowError(/NIMER_API_KEY/);
  });

  it("picks up apiKey from NIMER_API_KEY env var", () => {
    process.env.NIMER_API_KEY = "nm_from_env";
    expect(() => new NimerClient()).not.toThrow();
  });

  it("explicit apiKey takes precedence over env var", () => {
    process.env.NIMER_API_KEY = "nm_from_env";
    const client = new NimerClient({ apiKey: "nm_explicit" });
    expect(client.chat).toBeDefined();
  });

  it("baseUrl can be overridden via env var", () => {
    process.env.NIMER_API_KEY = "nm_foo";
    process.env.NIMER_BASE_URL = "https://staging.nimer.dev";
    const client = new NimerClient();
    expect(client.http.buildUrl("/v1/account")).toBe(
      "https://staging.nimer.dev/v1/account"
    );
  });
});

describe("client.chat.create", () => {
  it("posts to /v1/chat with mode=auto by default", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      mockJsonResponse({
        body: {
          mode: "auto",
          provider: "anthropic",
          model: "claude-haiku-4-5",
          content: "Hello",
          task_type: "chat",
          input_tokens: 5,
          output_tokens: 3,
          latency_ms: 200,
          success: true,
        },
      })
    );
    const client = makeClient(fetchImpl);
    const res = await client.chat.create({
      messages: [{ role: "user", content: "hi" }],
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const init = fetchImpl.mock.calls[0]![1] as RequestInit;
    const sent = JSON.parse(init.body as string) as { mode: string };
    expect(sent.mode).toBe("auto");
    if (res.mode === "auto") {
      expect(res.content).toBe("Hello");
    }
  });

  it("strips explicit model when ultrathink mode is selected", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      mockJsonResponse({
        body: {
          mode: "ultrathink",
          content: "Synth",
          providers_used: ["openai", "anthropic"],
          individual_responses: [],
          synthesis_model: "gpt-5",
          total_input_tokens: 1,
          total_output_tokens: 1,
          success: true,
        },
      })
    );
    const client = makeClient(fetchImpl);
    await client.chat.create({
      messages: [{ role: "user", content: "?" }],
      mode: "ultrathink",
      model: "gpt-5-mini",
    });
    const init = fetchImpl.mock.calls[0]![1] as RequestInit;
    const sent = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(sent.mode).toBe("ultrathink");
    expect(sent.model).toBeUndefined();
  });

  it("forwards tools + tool_choice when provided", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      mockJsonResponse({
        body: {
          mode: "auto",
          provider: "openai",
          model: "gpt-5",
          content: "",
          task_type: "chat",
          input_tokens: 0,
          output_tokens: 0,
          latency_ms: 1,
          tool_calls: [
            {
              id: "call_1",
              type: "function",
              function: { name: "get_weather", arguments: '{"city":"Riyadh"}' },
            },
          ],
          success: true,
        },
      })
    );
    const client = makeClient(fetchImpl);
    await client.chat.create({
      messages: [{ role: "user", content: "weather in riyadh" }],
      tools: [
        {
          type: "function",
          function: { name: "get_weather", parameters: { type: "object" } },
        },
      ],
      tool_choice: "auto",
    });
    const init = fetchImpl.mock.calls[0]![1] as RequestInit;
    const sent = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(Array.isArray(sent.tools)).toBe(true);
    expect(sent.tool_choice).toBe("auto");
  });

  it("createText returns just the content string", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      mockJsonResponse({
        body: {
          mode: "auto",
          provider: "openai",
          model: "gpt-5",
          content: "Just text",
          task_type: "chat",
          input_tokens: 1,
          output_tokens: 1,
          latency_ms: 1,
          success: true,
        },
      })
    );
    const client = makeClient(fetchImpl);
    const text = await client.chat.createText([
      { role: "user", content: "hi" },
    ]);
    expect(text).toBe("Just text");
  });

  it("surfaces Halal blocks as HalalBlockedError", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      mockJsonResponse({
        status: 451,
        body: {
          detail: {
            message: "Blocked",
            type: "halal_block",
            reason: "alcohol",
          },
        },
      })
    );
    const client = makeClient(fetchImpl);
    let caught: unknown;
    try {
      await client.chat.create({
        messages: [{ role: "user", content: "best wine pairings" }],
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(HalalBlockedError);
    expect((caught as HalalBlockedError).reason).toBe("alcohol");
  });
});

describe("client.chat.stream", () => {
  it("iterates SSE chunks until [DONE]", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        mockSseResponse([
          'data: {"id":"a","choices":[{"delta":{"content":"He"}}]}\n\n',
          'data: {"id":"a","choices":[{"delta":{"content":"llo"}}]}\n\n',
          "data: [DONE]\n\n",
        ])
      );
    const client = makeClient(fetchImpl);
    const out: string[] = [];
    for await (const chunk of client.chat.stream({
      messages: [{ role: "user", content: "hi" }],
    })) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) out.push(delta);
    }
    expect(out.join("")).toBe("Hello");
  });

  it("streamText filters out non-text deltas", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        mockSseResponse([
          'data: {"choices":[{"delta":{}}]}\n\n',
          'data: {"choices":[{"delta":{"content":"abc"}}]}\n\n',
          'data: {"choices":[{"delta":{"role":"assistant"}}]}\n\n',
          'data: {"choices":[{"delta":{"content":""}}]}\n\n',
          "data: [DONE]\n\n",
        ])
      );
    const client = makeClient(fetchImpl);
    const out: string[] = [];
    for await (const chunk of client.chat.streamText({
      messages: [{ role: "user", content: "?" }],
    })) {
      out.push(chunk);
    }
    expect(out).toEqual(["abc"]);
  });
});

describe("client.embeddings.create", () => {
  it("posts to /v1/embeddings with model + input", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      mockJsonResponse({
        body: {
          object: "list",
          model: "text-embedding-3-small",
          data: [
            { object: "embedding", index: 0, embedding: [0.1, 0.2] },
            { object: "embedding", index: 1, embedding: [0.3, 0.4] },
          ],
          usage: { prompt_tokens: 6, total_tokens: 6 },
        },
      })
    );
    const client = makeClient(fetchImpl);
    const res = await client.embeddings.create({
      model: "text-embedding-3-small",
      input: ["one", "two"],
    });
    expect(res.data).toHaveLength(2);
    expect(res.usage.prompt_tokens).toBe(6);
  });
});

describe("client.virtualKeys", () => {
  it("encodes special characters in keyId", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(mockJsonResponse({ body: { ok: true, id: "vk/1" } }));
    const client = makeClient(fetchImpl);
    await client.virtualKeys.revoke("vk/1");
    const url = fetchImpl.mock.calls[0]![0] as string;
    expect(url).toContain("/v1/virtual-keys/vk%2F1");
  });
});

describe("client.webhooks.test", () => {
  it("returns the synthetic ping result", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      mockJsonResponse({
        body: { delivery_id: 1, status: "queued", message: "Ping enqueued" },
      })
    );
    const client = makeClient(fetchImpl);
    const res = await client.webhooks.test("wh_abc");
    expect(res.delivery_id).toBe(1);
    expect(res.status).toBe("queued");
  });
});

describe("client.audit.list", () => {
  it("supports prefix filtering by action", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(mockJsonResponse({ body: [] }));
    const client = makeClient(fetchImpl);
    await client.audit.list({ action: "key", limit: 10 });
    const url = fetchImpl.mock.calls[0]![0] as string;
    expect(url).toContain("action=key");
    expect(url).toContain("limit=10");
  });
});
