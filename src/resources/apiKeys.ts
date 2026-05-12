import type { HttpClient } from "../http.js";
import type { ApiKey, ApiKeyCreated } from "../types.js";

export class ApiKeysResource {
  constructor(private readonly http: HttpClient) {}

  list(opts: { signal?: AbortSignal } = {}): Promise<ApiKey[]> {
    return this.http.get<ApiKey[]>("/v1/keys", opts);
  }

  /**
   * Create a top-level `nm_…` API key. The raw value is in `.key` — store it
   * once; the server never returns it again.
   */
  create(name: string, opts: { signal?: AbortSignal } = {}): Promise<ApiKeyCreated> {
    return this.http.post<ApiKeyCreated>("/v1/keys", { name }, opts);
  }

  revoke(keyId: string, opts: { signal?: AbortSignal } = {}): Promise<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`/v1/keys/${encodeURIComponent(keyId)}`, opts);
  }
}
