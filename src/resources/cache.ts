import type { HttpClient } from "../http.js";
import type { CacheStats } from "../types.js";

export class CacheResource {
  constructor(private readonly http: HttpClient) {}

  stats(opts: { signal?: AbortSignal } = {}): Promise<CacheStats> {
    return this.http.get<CacheStats>("/v1/cache/stats", opts);
  }

  /** Flush all cached entries for the authenticated user. Returns deleted count. */
  purge(opts: { signal?: AbortSignal } = {}): Promise<{ deleted: number }> {
    return this.http.delete<{ deleted: number }>("/v1/cache", opts);
  }
}
