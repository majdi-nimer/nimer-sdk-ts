import { ApiError, NetworkError, NimerError } from "../errors.js";
import type { HttpClient } from "../http.js";
import { parseJsonStream } from "../stream.js";
import type {
  ChatCompletionRequest,
  ChatMessage,
  ChatResponse,
  ChatResponseUltrathink,
  ChatStreamChunk,
} from "../types.js";

export interface ChatCreateOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface ChatStreamOptions extends ChatCreateOptions {
  /** Override the path. Default `/v1/chat/completions`. */
  path?: string;
}

export class ChatResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Synchronous chat completion against `/v1/chat`.
   *
   * - `mode: "auto"` (default) lets the gateway pick the best model per task.
   *   Quality-aware bandit routing (F1) kicks in when no explicit model is set.
   * - `mode: "ultrathink"` fans out to all connected providers and synthesises
   *   one answer (returns {@link ChatResponseUltrathink}).
   * - Passing `tools` enables function-calling (F8). Both OpenAI- and Anthropic-
   *   shaped definitions are accepted; the gateway normalises them.
   */
  async create(
    body: ChatCompletionRequest,
    opts: ChatCreateOptions = {}
  ): Promise<ChatResponse> {
    const payload: Record<string, unknown> = {
      messages: body.messages,
      mode: body.mode ?? "auto",
    };
    if (body.model && (body.mode ?? "auto") !== "ultrathink") {
      payload.model = body.model;
    }
    if (body.tools && body.tools.length > 0) payload.tools = body.tools;
    if (body.tool_choice !== undefined) payload.tool_choice = body.tool_choice;

    return this.http.post<ChatResponse>("/v1/chat", payload, {
      signal: opts.signal,
      timeoutMs: opts.timeoutMs,
    });
  }

  /**
   * Convenience wrapper around `create()` that returns just the assistant's
   * text content. Use this when you don't care about token counts or routing
   * metadata.
   */
  async createText(
    messages: ChatMessage[],
    opts: Omit<ChatCompletionRequest, "messages"> & ChatCreateOptions = {}
  ): Promise<string> {
    const { signal, timeoutMs, ...rest } = opts;
    const res = await this.create({ messages, ...rest }, { signal, timeoutMs });
    return res.content;
  }

  /**
   * Fan-out + synthesis (Ultrathink). Equivalent to `create({ mode: "ultrathink", … })`
   * but with a narrower return type.
   */
  async ultrathink(
    messages: ChatMessage[],
    opts: ChatCreateOptions = {}
  ): Promise<ChatResponseUltrathink> {
    return this.http.post<ChatResponseUltrathink>(
      "/v1/ultrathink",
      { messages },
      { signal: opts.signal, timeoutMs: opts.timeoutMs }
    );
  }

  /**
   * Streaming chat against `/v1/chat/completions` (OpenAI-compatible SSE).
   *
   * Yields {@link ChatStreamChunk} objects in order. Always finalise the iterator
   * — either iterate to completion or abort via the `signal` option — to release
   * the underlying connection.
   *
   * @example
   * ```ts
   * for await (const chunk of client.chat.stream({ messages: [{ role: "user", content: "Hi" }] })) {
   *   process.stdout.write(chunk.choices[0]?.delta?.content ?? "");
   * }
   * ```
   */
  async *stream(
    body: ChatCompletionRequest,
    opts: ChatStreamOptions = {}
  ): AsyncGenerator<ChatStreamChunk, void, void> {
    const path = opts.path ?? "/v1/chat/completions";
    const payload: Record<string, unknown> = {
      messages: body.messages,
      mode: body.mode ?? "auto",
      stream: true,
    };
    if (body.model && (body.mode ?? "auto") !== "ultrathink") {
      payload.model = body.model;
    }
    if (body.tools && body.tools.length > 0) payload.tools = body.tools;
    if (body.tool_choice !== undefined) payload.tool_choice = body.tool_choice;

    const res = await this.http.request<Response>(path, {
      method: "POST",
      body: payload,
      headers: { Accept: "text/event-stream" },
      signal: opts.signal,
      timeoutMs: opts.timeoutMs ?? 120_000,
      rawResponse: true,
      maxRetries: 0,
    });

    if (!res.body) {
      throw new NetworkError("Streaming response had no body");
    }
    try {
      for await (const chunk of parseJsonStream<ChatStreamChunk>(res.body)) {
        yield chunk;
      }
    } catch (err) {
      if (NimerError.isNimerError(err)) throw err;
      throw new ApiError(
        err instanceof Error ? err.message : "Stream parse failed",
        { cause: err }
      );
    }
  }

  /**
   * Streaming convenience that yields only the assistant's incremental text.
   * Skips chunks that contain tool calls or metadata-only deltas.
   */
  async *streamText(
    body: ChatCompletionRequest,
    opts: ChatStreamOptions = {}
  ): AsyncGenerator<string, void, void> {
    for await (const chunk of this.stream(body, opts)) {
      const delta = chunk.choices[0]?.delta?.content;
      if (typeof delta === "string" && delta.length > 0) yield delta;
    }
  }
}
