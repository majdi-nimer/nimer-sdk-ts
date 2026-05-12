import type { HttpClient } from "../http.js";
import type { ModelCatalogItem, ProviderId, ProviderListItem } from "../types.js";

export class ProvidersResource {
  constructor(private readonly http: HttpClient) {}

  /** List supported providers, with connection state for the authenticated user. */
  list(opts: { signal?: AbortSignal } = {}): Promise<ProviderListItem[]> {
    return this.http.get<ProviderListItem[]>("/v1/providers", opts);
  }

  /** Connect a provider by storing the encrypted API key server-side. */
  connect(
    body: { provider: ProviderId; api_key: string },
    opts: { signal?: AbortSignal } = {}
  ): Promise<{ provider: ProviderId; label: string; key_preview: string; status: "connected" }> {
    return this.http.post("/v1/providers", body, opts);
  }

  revoke(
    provider: ProviderId,
    opts: { signal?: AbortSignal } = {}
  ): Promise<{ provider: string; status: string }> {
    return this.http.delete(`/v1/providers/${encodeURIComponent(provider)}`, opts);
  }

  /** Flat list of every model the gateway knows about — used by the dashboard catalog. */
  listAllModels(opts: { signal?: AbortSignal } = {}): Promise<ModelCatalogItem[]> {
    return this.http.get<ModelCatalogItem[]>("/v1/providers/models", opts);
  }
}
