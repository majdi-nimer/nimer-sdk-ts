import { ApiError } from "../errors.js";
import type { HttpClient } from "../http.js";
import type { AuditEvent, AuditQuery } from "../types.js";

export class AuditResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Paginated audit log for the authenticated user (F7).
   *
   * Filter by dotted-prefix `action` (e.g. `"key"` matches `key.create` +
   * `key.revoke`), `resource_type`, and an ISO date range.
   */
  list(q: AuditQuery = {}, opts: { signal?: AbortSignal } = {}): Promise<AuditEvent[]> {
    return this.http.get<AuditEvent[]>("/v1/audit", {
      query: buildAuditQuery(q),
      signal: opts.signal,
    });
  }

  /**
   * Streaming CSV export — yields one CSV line at a time.
   *
   * Suitable for piping into a file or another stream without buffering the
   * whole dataset in memory:
   *
   * ```ts
   * for await (const line of client.audit.exportCsv()) {
   *   process.stdout.write(line + "\n");
   * }
   * ```
   */
  async *exportCsv(
    q: AuditQuery = {},
    opts: { signal?: AbortSignal } = {}
  ): AsyncGenerator<string, void, void> {
    const res = await this.http.request<Response>("/v1/audit/export", {
      method: "GET",
      query: buildAuditQuery(q),
      signal: opts.signal,
      rawResponse: true,
      maxRetries: 0,
      timeoutMs: 600_000,
    });
    if (!res.body) throw new ApiError("CSV export response had no body");
    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          if (buffer.length > 0) yield buffer;
          return;
        }
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, idx).replace(/\r$/, "");
          buffer = buffer.slice(idx + 1);
          yield line;
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /** Download the full CSV blob in one shot. Convenience for small datasets. */
  async downloadCsv(
    q: AuditQuery = {},
    opts: { signal?: AbortSignal } = {}
  ): Promise<string> {
    const res = await this.http.request<Response>("/v1/audit/export", {
      method: "GET",
      query: buildAuditQuery(q),
      signal: opts.signal,
      rawResponse: true,
      maxRetries: 0,
      timeoutMs: 600_000,
    });
    return res.text();
  }
}

function buildAuditQuery(q: AuditQuery): Record<string, string | number | undefined> {
  return {
    limit: q.limit,
    offset: q.offset,
    action: q.action,
    resource_type: q.resource_type,
    since: q.since,
    until: q.until,
  };
}
