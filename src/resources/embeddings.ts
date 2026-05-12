import type { HttpClient } from "../http.js";
import type {
  EmbeddingsRequest,
  EmbeddingsResponse,
  ModelCatalogItem,
} from "../types.js";

export class EmbeddingsResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * OpenAI-compatible embeddings (F2). Accepts a string, array of strings,
   * or pre-tokenised integer arrays. Returns vectors in the same order.
   *
   * @example
   * ```ts
   * const { data } = await client.embeddings.create({
   *   model: "text-embedding-3-small",
   *   input: ["hello world", "another doc"],
   * });
   * ```
   */
  async create(
    body: EmbeddingsRequest,
    opts: { signal?: AbortSignal; timeoutMs?: number } = {}
  ): Promise<EmbeddingsResponse> {
    return this.http.post<EmbeddingsResponse>("/v1/embeddings", body, opts);
  }

  /** List embedding-capable models in the catalog. Halal-aware: respects account mode. */
  async listModels(
    opts: { signal?: AbortSignal } = {}
  ): Promise<ModelCatalogItem[]> {
    return this.http.get<ModelCatalogItem[]>("/v1/catalog/embeddings", opts);
  }
}
