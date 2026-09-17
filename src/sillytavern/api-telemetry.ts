/** Only numerical accounting leaves the transport. Never pass request/response text here. */
export type ApiCallPurpose = 'foreground' | 'checklist' | 'preplan';
export type ApiRepairKind = 'structured' | 'director' | 'narrative' | 'protocol';
export type ApiCurrency = 'USD' | 'CNY';
export interface ApiPricing {
  baseUrl: string;
  model: string;
  currency: ApiCurrency;
  inputPerMillion?: number;
  outputPerMillion?: number;
  cachedInputPerMillion?: number;
}
export interface ApiTokenUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  cachedInputTokens: number | null;
}
export interface ApiCostEstimate { currency: ApiCurrency; amount: number; complete: boolean }
export interface ApiRequestEvent {
  durationMs: number;
  status: number | null;
  outcome: 'success' | 'failed' | 'cancelled';
  kind: 'request' | 'retry' | 'auth-fallback' | 'format-fallback' | 'stream-options-fallback';
  usage: ApiTokenUsage | null;
  cost: ApiCostEstimate | null;
}
export interface ApiTelemetryContext {
  onRequest: (event: ApiRequestEvent) => void;
  onRequestStart?: () => void;
  onRepair?: (kind: ApiRepairKind) => void;
}

const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' ? value as Record<string, unknown> : {};
const count = (value: unknown): number | null =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
const rate = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;

export function parseApiUsage(value: unknown): ApiTokenUsage | null {
  const usage = record(value);
  const inputTokens = count(usage.prompt_tokens) ?? count(usage.input_tokens);
  const outputTokens = count(usage.completion_tokens) ?? count(usage.output_tokens);
  let cachedInputTokens = count(record(usage.prompt_tokens_details).cached_tokens)
    ?? count(record(usage.input_tokens_details).cached_tokens) ?? count(usage.prompt_cache_hit_tokens);
  if (inputTokens !== null && cachedInputTokens !== null && cachedInputTokens > inputTokens) cachedInputTokens = null;
  return inputTokens === null && outputTokens === null && cachedInputTokens === null
    ? null : { inputTokens, outputTokens, cachedInputTokens };
}

export function estimateApiCost(
  usage: ApiTokenUsage | null,
  pricing: ApiPricing | undefined,
  request: { baseUrl: string; model: string },
): ApiCostEstimate | null {
  if (!usage || !pricing || pricing.baseUrl !== request.baseUrl || pricing.model !== request.model
    || !['USD', 'CNY'].includes(pricing.currency)) return null;
  let amount = 0;
  let known = false;
  let complete = true;
  const add = (tokens: number | null, price: number | undefined) => {
    if (tokens === 0) { known = true; return; }
    if (tokens === null || !rate(price)) { complete = false; return; }
    known = true;
    amount += tokens * price / 1_000_000;
  };
  if (pricing.cachedInputPerMillion !== undefined) {
    if (usage.cachedInputTokens === null) {
      // A distinct cache rate requires a measured split; otherwise input cost is unknown.
      complete = false;
    } else {
      add(usage.inputTokens === null ? null : usage.inputTokens - usage.cachedInputTokens, pricing.inputPerMillion);
      add(usage.cachedInputTokens, pricing.cachedInputPerMillion);
    }
  } else add(usage.inputTokens, pricing.inputPerMillion);
  add(usage.outputTokens, pricing.outputPerMillion);
  return known && Number.isFinite(amount) ? { currency: pricing.currency, amount: Number(amount.toPrecision(14)), complete } : null;
}

export function notifyApiRepair(context: ApiTelemetryContext | undefined, kind: ApiRepairKind): void {
  try { context?.onRepair?.(kind); } catch { /* Diagnostics never affect gameplay. */ }
}

export function beginApiRequest(
  config: { baseUrl: string; model: string; telemetry?: ApiTelemetryContext; pricing?: ApiPricing },
  kind: ApiRequestEvent['kind'],
): (status: number | null, outcome: ApiRequestEvent['outcome'], usage?: ApiTokenUsage | null) => void {
  const started = performance.now();
  // Capture the observer and prices at dispatch, even when settings change in flight.
  const context = config.telemetry;
  const request = { baseUrl: config.baseUrl, model: config.model };
  const pricing = config.pricing ? { ...config.pricing } : undefined;
  try { context?.onRequestStart?.(); } catch { /* Observers cannot block dispatch. */ }
  let finished = false;
  return (status, outcome, usage = null) => {
    if (finished) return;
    finished = true;
    try {
      context?.onRequest({ durationMs: Math.max(0, Math.round(performance.now() - started)), status,
        outcome, kind, usage, cost: estimateApiCost(usage, pricing, request) });
    } catch { /* Observers cannot break the request. */ }
  };
}
