import { describe, expect, it } from "vitest";
import { parseJsonStream, parseSseStream } from "../src/stream.js";

function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
}

async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of iter) out.push(item);
  return out;
}

describe("parseSseStream", () => {
  it("parses well-formed OpenAI-style SSE", async () => {
    const stream = streamFromChunks([
      'data: {"id":"1","choices":[{"delta":{"content":"Hi"}}]}\n\n',
      'data: {"id":"1","choices":[{"delta":{"content":" there"}}]}\n\n',
      "data: [DONE]\n\n",
    ]);
    const out = await collect(parseSseStream(stream));
    expect(out).toEqual([
      '{"id":"1","choices":[{"delta":{"content":"Hi"}}]}',
      '{"id":"1","choices":[{"delta":{"content":" there"}}]}',
    ]);
  });

  it("handles chunk boundaries mid-event", async () => {
    const stream = streamFromChunks([
      'data: {"foo":',
      '"bar"}\n',
      "\ndata: ",
      '{"baz":1}\n\n',
      "data: [DONE]\n\n",
    ]);
    const out = await collect(parseSseStream(stream));
    expect(out).toEqual(['{"foo":"bar"}', '{"baz":1}']);
  });

  it("ignores SSE comments (heartbeats)", async () => {
    const stream = streamFromChunks([
      ": keep-alive\n\n",
      'data: {"x":1}\n\n',
      ": another\n\n",
      "data: [DONE]\n\n",
    ]);
    const out = await collect(parseSseStream(stream));
    expect(out).toEqual(['{"x":1}']);
  });

  it("returns no items if [DONE] is the first event", async () => {
    const stream = streamFromChunks(["data: [DONE]\n\n"]);
    const out = await collect(parseSseStream(stream));
    expect(out).toEqual([]);
  });

  it("joins multi-line data fields", async () => {
    const stream = streamFromChunks([
      "data: line1\n",
      "data: line2\n",
      "\n",
      "data: [DONE]\n\n",
    ]);
    const out = await collect(parseSseStream(stream));
    expect(out).toEqual(["line1\nline2"]);
  });

  it("flushes a partial trailing event missing \\n\\n", async () => {
    const stream = streamFromChunks(["data: tail"]);
    const out = await collect(parseSseStream(stream));
    expect(out).toEqual(["tail"]);
  });
});

describe("parseJsonStream", () => {
  it("yields parsed JSON objects", async () => {
    const stream = streamFromChunks([
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
      "data: [DONE]\n\n",
    ]);
    const out = await collect(parseJsonStream<{ choices: unknown[] }>(stream));
    expect(out).toHaveLength(2);
    expect(out[0]?.choices).toBeDefined();
  });

  it("drops malformed JSON lines silently", async () => {
    const stream = streamFromChunks([
      'data: {"ok":1}\n\n',
      "data: NOT JSON\n\n",
      'data: {"ok":2}\n\n',
      "data: [DONE]\n\n",
    ]);
    const out = await collect(parseJsonStream<{ ok: number }>(stream));
    expect(out).toEqual([{ ok: 1 }, { ok: 2 }]);
  });
});
