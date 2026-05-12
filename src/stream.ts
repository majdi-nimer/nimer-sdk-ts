/**
 * Minimal SSE parser for Nimer's streaming chat endpoint. Mirrors the format
 * OpenAI emits — `data: { json }` lines separated by blank lines, terminated
 * by `data: [DONE]`.
 *
 * Used internally by `client.chat.stream()`. Exported so power-users can
 * consume custom routes (or pipe a server-side response into their own
 * pipeline) without re-implementing the parser.
 */
export async function* parseSseStream(
  stream: ReadableStream<Uint8Array>
): AsyncGenerator<string, void, void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        // Flush any partial event the server didn't trail with \n\n.
        if (buffer.length > 0) {
          for (const data of extractDataLines(buffer)) {
            if (data === "[DONE]") return;
            yield data;
          }
        }
        return;
      }
      buffer += decoder.decode(value, { stream: true });
      let sepIdx: number;
      while ((sepIdx = buffer.search(/\r?\n\r?\n/)) !== -1) {
        const eventBlock = buffer.slice(0, sepIdx);
        const matched = buffer.slice(sepIdx).match(/^\r?\n\r?\n/);
        buffer = buffer.slice(sepIdx + (matched?.[0].length ?? 2));
        for (const data of extractDataLines(eventBlock)) {
          if (data === "[DONE]") return;
          yield data;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function extractDataLines(block: string): string[] {
  const out: string[] = [];
  let current: string[] = [];
  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith(":")) continue; // SSE comment heartbeat.
    if (line.startsWith("data:")) {
      // Per the spec the leading space after `data:` is optional + stripped.
      current.push(line.slice(5).replace(/^ /, ""));
    } else if (line === "" && current.length > 0) {
      out.push(current.join("\n"));
      current = [];
    }
  }
  if (current.length > 0) out.push(current.join("\n"));
  return out;
}

/** Helper: parse a stream of `data:` lines as JSON objects of type `T`. */
export async function* parseJsonStream<T>(
  stream: ReadableStream<Uint8Array>
): AsyncGenerator<T, void, void> {
  for await (const data of parseSseStream(stream)) {
    if (!data) continue;
    try {
      yield JSON.parse(data) as T;
    } catch {
      // Drop malformed lines silently — the server is the source of truth on
      // framing; one bad chunk should not nuke the whole stream.
    }
  }
}
