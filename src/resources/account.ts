import type { HttpClient } from "../http.js";
import type { AccountUpdate, UserAccount } from "../types.js";

export class AccountResource {
  constructor(private readonly http: HttpClient) {}

  /** Fetch the authenticated user's account, including trial state + budget caps. */
  get(opts: { signal?: AbortSignal } = {}): Promise<UserAccount> {
    return this.http.get<UserAccount>("/v1/account", opts);
  }

  /**
   * Partially update the account. Pass `is_active: true` to resume after an
   * F3 auto-pause; the server clears the `paused_for_anomaly_at` stamp.
   */
  update(body: AccountUpdate, opts: { signal?: AbortSignal } = {}): Promise<UserAccount> {
    return this.http.patch<UserAccount>("/v1/account", body, opts);
  }
}
