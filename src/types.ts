// ── Common ──────────────────────────────────────────────────────────────────

export type ProviderId =
  | "anthropic"
  | "openai"
  | "gemini"
  | "deepseek"
  | "xai"
  | "mistral"
  | "groq";

export type ModelTier = "fast" | "balanced" | "reasoning" | "premium";

export interface ModelCatalogItem {
  id: string;
  label: string;
  provider: ProviderId;
  tier: ModelTier;
  input_per_1m: number;
  output_per_1m: number;
  context: number;
  description: string;
  free_tier: boolean;
  halal_certified: boolean;
}

// ── Account ─────────────────────────────────────────────────────────────────

export type CreatorStatus = "none" | "pending" | "approved" | "rejected";

export type TrialStateStatus =
  | "trial_active"
  | "trial_expired"
  | "creator"
  | "creator_pending"
  | "paid"
  | "inactive";

export type Plan = "free" | "pro" | "scale";

export interface TrialState {
  status: TrialStateStatus;
  days_remaining: number;
  can_call_api: boolean;
  badge: string;
  message: string;
  creator_status: CreatorStatus;
  is_early_believer: boolean;
  plan: Plan;
  trial_ends_at: string | null;
}

export interface UserAccount {
  id: string;
  email: string;
  plan: Plan;
  budget_limit_usd: number | null;
  trial_ends_at: string | null;
  trial_days_remaining: number;
  halal_mode: boolean;
  cache_enabled: boolean;
  creator_status: CreatorStatus;
  creator_handle: string | null;
  is_early_believer: boolean;
  auto_pause_on_anomaly: boolean;
  anomaly_threshold_multiplier: number;
  paused_for_anomaly_at: string | null;
  is_active: boolean;
  trial_state: TrialState | null;
  created_at: string;
}

export interface AccountUpdate {
  budget_limit_usd?: number | null;
  halal_mode?: boolean;
  cache_enabled?: boolean;
  auto_pause_on_anomaly?: boolean;
  anomaly_threshold_multiplier?: number;
  /** Setting `true` clears the auto-pause stamp server-side. */
  is_active?: boolean;
}

// ── Chat ────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export type ChatMode = "auto" | "ultrathink";

/** OpenAI-compatible tool definition for function calling (F8). */
export interface ChatTool {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

/** Anthropic-flavoured tool definition — the SDK accepts both and normalises server-side. */
export interface AnthropicTool {
  name: string;
  description?: string;
  input_schema?: Record<string, unknown>;
}

export type ChatToolChoice =
  | "auto"
  | "none"
  | "required"
  | { type: "function"; function: { name: string } }
  | { type: "tool"; name: string };

export interface ChatToolCall {
  id?: string;
  type?: "function";
  function?: { name: string; arguments: string };
}

export interface ChatCompletionRequest {
  messages: ChatMessage[];
  mode?: ChatMode;
  model?: string | null;
  tools?: (ChatTool | AnthropicTool)[];
  tool_choice?: ChatToolChoice;
}

export interface ChatResponseAuto {
  mode: "auto" | "manual" | "fallback_chain";
  provider: string;
  model: string;
  content: string;
  task_type: string | null;
  input_tokens: number;
  output_tokens: number;
  latency_ms: number;
  cached?: boolean;
  cache_saved_usd?: number;
  tool_calls?: ChatToolCall[];
  success: true;
}

export interface ChatResponseUltrathink {
  mode: "ultrathink";
  content: string;
  providers_used: string[];
  individual_responses: Array<{
    provider: string;
    model: string;
    content: string;
    input_tokens: number;
    output_tokens: number;
    latency_ms: number;
    success: true;
  }>;
  synthesis_model: string;
  total_input_tokens: number;
  total_output_tokens: number;
  success: true;
}

export type ChatResponse = ChatResponseAuto | ChatResponseUltrathink;

/** A single chunk yielded by `client.chat.stream()`. Modelled on OpenAI's SSE format. */
export interface ChatStreamChunk {
  id?: string;
  object?: string;
  created?: number;
  model?: string;
  provider?: string;
  choices: Array<{
    index?: number;
    delta?: {
      role?: string;
      content?: string;
      tool_calls?: Array<{
        index?: number;
        id?: string;
        type?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

// ── Embeddings (F2) ─────────────────────────────────────────────────────────

export type EmbeddingInput = string | string[] | number[] | number[][];

export interface EmbeddingsRequest {
  model: string;
  input: EmbeddingInput;
  dimensions?: number;
  user?: string;
  encoding_format?: "float" | "base64";
}

export interface EmbeddingObject {
  object: "embedding";
  index: number;
  embedding: number[];
}

export interface EmbeddingsUsage {
  prompt_tokens: number;
  total_tokens: number;
}

export interface EmbeddingsResponse {
  object: "list";
  data: EmbeddingObject[];
  model: string;
  usage: EmbeddingsUsage;
}

// ── API Keys + Virtual Keys ─────────────────────────────────────────────────

export interface ApiKey {
  id: string;
  name: string;
  key_preview: string;
  created_at: string;
  last_used_at: string | null;
  is_active: boolean;
}

export interface ApiKeyCreated extends ApiKey {
  /** Returned only at creation. Show once, store securely, never re-fetch. */
  key: string;
}

export interface VirtualKey {
  id: string;
  name: string;
  key_preview: string;
  monthly_budget_usd: number | null;
  allowed_models: string[] | null;
  allowed_providers: string[] | null;
  fallback_chain: string[] | null;
  halal_mode: boolean;
  expires_at: string | null;
  created_at: string;
  last_used_at: string | null;
  is_active: boolean;
}

export interface VirtualKeyCreated extends VirtualKey {
  /** Raw `vk_…` value — only returned at creation, never again. */
  key: string;
}

export interface VirtualKeyUsage {
  virtual_key_id: string;
  month_start: string;
  spent_usd: number;
  request_count: number;
  monthly_budget_usd: number | null;
  remaining_usd: number | null;
}

export interface VirtualKeyCreate {
  name: string;
  monthly_budget_usd?: number | null;
  allowed_models?: string[] | null;
  allowed_providers?: string[] | null;
  fallback_chain?: string[] | null;
  halal_mode?: boolean;
  expires_at?: string | null;
}

// ── Halal ──────────────────────────────────────────────────────────────────

export interface HalalAuditEntry {
  id: number;
  virtual_key_id: string | null;
  prompt_excerpt: string;
  blocked_reason: string;
  classifier_score: number;
  endpoint: string;
  created_at: string;
}

export interface HalalAuditList {
  items: HalalAuditEntry[];
  total: number;
}

// ── Anomalies (F3) ─────────────────────────────────────────────────────────

export interface AnomalyEvent {
  id: number;
  spend_last_hour_usd: number;
  baseline_p95_usd: number;
  ratio: number;
  threshold_multiplier: number;
  paused: boolean;
  top_contributor: string | null;
  acknowledged: boolean;
  acknowledged_at: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

// ── Cache ──────────────────────────────────────────────────────────────────

export interface CacheStats {
  enabled: boolean;
  entries: number;
  total_hits: number;
  total_saved_usd: number;
  last_hit_at: string | null;
}

// ── Webhooks (F6) ──────────────────────────────────────────────────────────

export interface WebhookEndpoint {
  id: string;
  url: string;
  events: string[];
  description: string | null;
  is_active: boolean;
  created_at: string;
  last_delivery_at: string | null;
}

export interface WebhookEndpointWithSecret extends WebhookEndpoint {
  /** Returned ONLY from create(). Show once and store securely. */
  secret: string;
}

export interface WebhookDelivery {
  id: number;
  webhook_endpoint_id: string;
  event_type: string;
  status: "pending" | "succeeded" | "failed";
  attempts: number;
  last_status_code: number | null;
  last_error: string | null;
  next_retry_at: string | null;
  delivered_at: string | null;
  created_at: string;
  payload: Record<string, unknown>;
}

export interface WebhookEndpointCreate {
  url: string;
  events: string[];
  description?: string;
}

export interface WebhookEndpointUpdate {
  url?: string;
  events?: string[];
  description?: string;
  is_active?: boolean;
}

// ── Audit (F7) ─────────────────────────────────────────────────────────────

export interface AuditEvent {
  id: number;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface AuditQuery {
  limit?: number;
  offset?: number;
  /** Dotted-prefix match — `"key"` matches `key.create` + `key.revoke`. */
  action?: string;
  resource_type?: string;
  since?: string;
  until?: string;
}

// ── Providers ──────────────────────────────────────────────────────────────

export interface ProviderListItem {
  provider: ProviderId;
  label: string;
  key_url: string;
  cheapest_model: string;
  cost_per_1m: string;
  has_free_tier: boolean;
  key_format_hint: string;
  connected: boolean;
  key_preview: string | null;
  connected_at: string | null;
  models?: ModelCatalogItem[];
}

// ── Feedback ───────────────────────────────────────────────────────────────

export interface FeedbackCreate {
  rating?: number | null;
  category: string;
  message: string;
}

// ── Usage ──────────────────────────────────────────────────────────────────

export interface UsageSummary {
  total_requests: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_saved_usd: number;
  total_cost_usd: number;
  avg_safety_score: number;
  unsafe_requests: number;
  model_mix: Record<string, number>;
}

export interface TimeseriesPoint {
  date: string;
  requests: number;
  saved_usd: number;
  cost_usd: number;
  avg_safety_score: number;
  unsafe_requests: number;
}
