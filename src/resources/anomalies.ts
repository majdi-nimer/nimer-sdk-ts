import type { HttpClient } from "../http.js";
import type { AnomalyEvent } from "../types.js";

export interface ListAnomaliesOptions {
  limit?: number;
  unacknowledgedOnly?: boolean;
  signal?: AbortSignal;
}

export class AnomaliesResource {
  constructor(private readonly http: HttpClient) {}

  list(opts: ListAnomaliesOptions = {}): Promise<AnomalyEvent[]> {
    const query: Record<string, string | number | boolean | undefined> = {};
    if (opts.limit !== undefined) query.limit = opts.limit;
    if (opts.unacknowledgedOnly) query.unacknowledged_only = true;
    return this.http.get<AnomalyEvent[]>("/v1/anomalies", {
      query,
      signal: opts.signal,
    });
  }

  acknowledge(eventId: number, opts: { signal?: AbortSignal } = {}): Promise<AnomalyEvent> {
    return this.http.post<AnomalyEvent>(
      `/v1/anomalies/${eventId}/acknowledge`,
      undefined,
      opts
    );
  }

  acknowledgeAll(opts: { signal?: AbortSignal } = {}): Promise<{ acknowledged: number }> {
    return this.http.post<{ acknowledged: number }>(
      "/v1/anomalies/acknowledge-all",
      undefined,
      opts
    );
  }
}
