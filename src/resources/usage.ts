import type { HttpClient } from "../http.js";
import type { TimeseriesPoint, UsageSummary } from "../types.js";

export class UsageResource {
  constructor(private readonly http: HttpClient) {}

  summary(days = 30, opts: { signal?: AbortSignal } = {}): Promise<UsageSummary> {
    return this.http.get<UsageSummary>("/v1/usage/summary", {
      query: { days },
      signal: opts.signal,
    });
  }

  timeseries(days = 30, opts: { signal?: AbortSignal } = {}): Promise<TimeseriesPoint[]> {
    return this.http.get<TimeseriesPoint[]>("/v1/usage/timeseries", {
      query: { days },
      signal: opts.signal,
    });
  }
}
