import type { HttpClient } from "../http.js";
import type {
  VirtualKey,
  VirtualKeyCreate,
  VirtualKeyCreated,
  VirtualKeyUsage,
} from "../types.js";

export class VirtualKeysResource {
  constructor(private readonly http: HttpClient) {}

  /** List virtual keys for the authenticated user. Defaults to active-only. */
  list(opts: { includeRevoked?: boolean; signal?: AbortSignal } = {}): Promise<VirtualKey[]> {
    return this.http.get<VirtualKey[]>("/v1/virtual-keys", {
      query: opts.includeRevoked ? { include_revoked: true } : undefined,
      signal: opts.signal,
    });
  }

  /**
   * Create a new virtual sub-key. The raw `vk_…` value is returned in
   * `.key` — store it once and discard; the server keeps only the hash.
   */
  create(body: VirtualKeyCreate, opts: { signal?: AbortSignal } = {}): Promise<VirtualKeyCreated> {
    return this.http.post<VirtualKeyCreated>("/v1/virtual-keys", body, opts);
  }

  /** Month-to-date spend + request count for the given virtual key. */
  usage(keyId: string, opts: { signal?: AbortSignal } = {}): Promise<VirtualKeyUsage> {
    return this.http.get<VirtualKeyUsage>(`/v1/virtual-keys/${encodeURIComponent(keyId)}/usage`, opts);
  }

  /** Revoke (soft-delete) a virtual key. Idempotent. */
  revoke(keyId: string, opts: { signal?: AbortSignal } = {}): Promise<{ ok: boolean; id: string }> {
    return this.http.delete<{ ok: boolean; id: string }>(
      `/v1/virtual-keys/${encodeURIComponent(keyId)}`,
      opts
    );
  }
}
