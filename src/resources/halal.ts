import type { HttpClient, HttpClientOptions } from "../http.js";
import type { HalalAuditList, ModelCatalogItem } from "../types.js";

export interface HalalAuditListOptions {
  limit?: number;
  offset?: number;
  reason?: string;
  virtualKeyId?: string;
  signal?: AbortSignal;
}

export class HalalResource {
  constructor(
    private readonly http: HttpClient,
    private readonly baseOpts: Pick<HttpClientOptions, "baseUrl" | "fetch">
  ) {}

  /** Paginated audit trail of Halal-blocked prompts (decrypted server-side). */
  audit(opts: HalalAuditListOptions = {}): Promise<HalalAuditList> {
    const query: Record<string, string | number | undefined> = {};
    if (opts.limit !== undefined) query.limit = opts.limit;
    if (opts.offset !== undefined) query.offset = opts.offset;
    if (opts.reason) query.reason = opts.reason;
    if (opts.virtualKeyId) query.virtual_key_id = opts.virtualKeyId;
    return this.http.get<HalalAuditList>("/v1/halal/audit", {
      query,
      signal: opts.signal,
    });
  }

  /**
   * Public endpoint — lists Halal-certified models a user may explicitly
   * select while Halal Mode is on. No auth required, useful for landing pages
   * and `/halal-certificate`.
   */
  async certifiedModels(
    opts: { signal?: AbortSignal } = {}
  ): Promise<ModelCatalogItem[]> {
    const url = `${this.baseOpts.baseUrl.replace(/\/+$/, "")}/v1/halal/certified-models`;
    const fetchImpl = this.baseOpts.fetch ?? globalThis.fetch.bind(globalThis);
    const res = await fetchImpl(url, { signal: opts.signal });
    if (!res.ok) {
      throw new Error(`Request failed (${res.status})`);
    }
    return (await res.json()) as ModelCatalogItem[];
  }
}
