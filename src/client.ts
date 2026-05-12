import { HttpClient, type HttpClientOptions } from "./http.js";
import { AccountResource } from "./resources/account.js";
import { AnomaliesResource } from "./resources/anomalies.js";
import { ApiKeysResource } from "./resources/apiKeys.js";
import { AuditResource } from "./resources/audit.js";
import { CacheResource } from "./resources/cache.js";
import { ChatResource } from "./resources/chat.js";
import { EmbeddingsResource } from "./resources/embeddings.js";
import { HalalResource } from "./resources/halal.js";
import { ProvidersResource } from "./resources/providers.js";
import { UsageResource } from "./resources/usage.js";
import { VirtualKeysResource } from "./resources/virtualKeys.js";
import { WebhooksResource } from "./resources/webhooks.js";

export interface NimerClientOptions
  extends Omit<HttpClientOptions, "apiKey" | "baseUrl"> {
  /** API key — `nm_…` for top-level, `vk_…` for virtual sub-key. Required. */
  apiKey?: string;
  /** Override the API base URL. Defaults to https://api.nimer.dev or `NIMER_BASE_URL`. */
  baseUrl?: string;
}

/** Read an env var safely in any runtime — falls back to `undefined`. */
function readEnv(name: string): string | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const proc = (globalThis as any).process;
  if (proc?.env && typeof proc.env[name] === "string") return proc.env[name];
  return undefined;
}

const DEFAULT_BASE_URL = "https://api.nimer.dev";

/**
 * Entrypoint to the Nimer API.
 *
 * ```ts
 * import { NimerClient } from "@nimerdev/sdk";
 *
 * const client = new NimerClient({ apiKey: process.env.NIMER_API_KEY });
 * const reply = await client.chat.createText([
 *   { role: "user", content: "Hello, Nimer." },
 * ]);
 * ```
 *
 * The client is stateless — feel free to instantiate per-request in serverless,
 * or keep a singleton in long-lived services. All resources share the same
 * underlying HTTP client + retry policy.
 */
export class NimerClient {
  readonly chat: ChatResource;
  readonly embeddings: EmbeddingsResource;
  readonly apiKeys: ApiKeysResource;
  readonly virtualKeys: VirtualKeysResource;
  readonly providers: ProvidersResource;
  readonly account: AccountResource;
  readonly halal: HalalResource;
  readonly cache: CacheResource;
  readonly anomalies: AnomaliesResource;
  readonly webhooks: WebhooksResource;
  readonly audit: AuditResource;
  readonly usage: UsageResource;

  /** Direct access to the low-level HTTP client. Use for endpoints the SDK hasn't typed yet. */
  readonly http: HttpClient;

  constructor(opts: NimerClientOptions = {}) {
    const apiKey = opts.apiKey ?? readEnv("NIMER_API_KEY");
    const baseUrl = opts.baseUrl ?? readEnv("NIMER_BASE_URL") ?? DEFAULT_BASE_URL;
    if (!apiKey) {
      throw new Error(
        "Missing NIMER_API_KEY. Pass `apiKey` to NimerClient or set the env var."
      );
    }
    this.http = new HttpClient({ ...opts, apiKey, baseUrl });
    this.chat = new ChatResource(this.http);
    this.embeddings = new EmbeddingsResource(this.http);
    this.apiKeys = new ApiKeysResource(this.http);
    this.virtualKeys = new VirtualKeysResource(this.http);
    this.providers = new ProvidersResource(this.http);
    this.account = new AccountResource(this.http);
    this.halal = new HalalResource(this.http, { baseUrl, fetch: opts.fetch });
    this.cache = new CacheResource(this.http);
    this.anomalies = new AnomaliesResource(this.http);
    this.webhooks = new WebhooksResource(this.http);
    this.audit = new AuditResource(this.http);
    this.usage = new UsageResource(this.http);
  }
}
