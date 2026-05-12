import type { HttpClient } from "../http.js";
import type {
  WebhookDelivery,
  WebhookEndpoint,
  WebhookEndpointCreate,
  WebhookEndpointUpdate,
  WebhookEndpointWithSecret,
} from "../types.js";

export interface ListDeliveriesOptions {
  limit?: number;
  status?: "pending" | "succeeded" | "failed";
  signal?: AbortSignal;
}

export class WebhooksResource {
  constructor(private readonly http: HttpClient) {}

  /** List the event types the API can fire. Useful for building UI multi-selects. */
  events(opts: { signal?: AbortSignal } = {}): Promise<{ events: string[] }> {
    return this.http.get<{ events: string[] }>("/v1/webhook-endpoints/events", opts);
  }

  list(opts: { signal?: AbortSignal } = {}): Promise<WebhookEndpoint[]> {
    return this.http.get<WebhookEndpoint[]>("/v1/webhook-endpoints", opts);
  }

  /**
   * Create an endpoint. The `secret` field is returned **once** — store it
   * securely; you'll need it for HMAC verification of inbound deliveries
   * (see {@link verifyWebhookSignature}).
   */
  create(
    body: WebhookEndpointCreate,
    opts: { signal?: AbortSignal } = {}
  ): Promise<WebhookEndpointWithSecret> {
    return this.http.post<WebhookEndpointWithSecret>("/v1/webhook-endpoints", body, opts);
  }

  update(
    id: string,
    body: WebhookEndpointUpdate,
    opts: { signal?: AbortSignal } = {}
  ): Promise<WebhookEndpoint> {
    return this.http.patch<WebhookEndpoint>(
      `/v1/webhook-endpoints/${encodeURIComponent(id)}`,
      body,
      opts
    );
  }

  delete(id: string, opts: { signal?: AbortSignal } = {}): Promise<void> {
    return this.http.delete<void>(`/v1/webhook-endpoints/${encodeURIComponent(id)}`, opts);
  }

  /** Fire a synthetic ping at the endpoint to validate URL + signature wiring. */
  test(
    id: string,
    opts: { signal?: AbortSignal } = {}
  ): Promise<{ delivery_id: number; status: string; message: string }> {
    return this.http.post<{ delivery_id: number; status: string; message: string }>(
      `/v1/webhook-endpoints/${encodeURIComponent(id)}/test`,
      undefined,
      opts
    );
  }

  /** Recent delivery attempts for a given endpoint — for debugging + audit. */
  deliveries(id: string, opts: ListDeliveriesOptions = {}): Promise<WebhookDelivery[]> {
    const query: Record<string, string | number | undefined> = {};
    if (opts.limit !== undefined) query.limit = opts.limit;
    if (opts.status) query.status = opts.status;
    return this.http.get<WebhookDelivery[]>(
      `/v1/webhook-endpoints/${encodeURIComponent(id)}/deliveries`,
      { query, signal: opts.signal }
    );
  }
}
