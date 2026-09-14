import type { ChecklistActionMetadata } from '../sillytavern/types';

const KINDS = new Set(['inquiry', 'investigation', 'search', 'travel', 'rest', 'wait']);
const SCOPES = new Set(['short', 'normal', 'deep']);

export function encodeChecklistMetadata(metadata: ChecklistActionMetadata): string | undefined {
  if (!metadata.actionId && !metadata.opportunityId) return undefined;
  return `meta:${encodeURIComponent(JSON.stringify({
    actionId: metadata.actionId,
    opportunityId: metadata.opportunityId,
    kind: metadata.kind,
    scope: metadata.scope,
    locationId: metadata.locationId,
    requestedMinutes: metadata.requestedMinutes,
    quote: metadata.quote,
  }))}`;
}

export function parseChecklistMetadata(value: string | undefined): ChecklistActionMetadata {
  if (!value?.startsWith('meta:')) return {};
  try {
    const parsed = JSON.parse(decodeURIComponent(value.slice(5))) as Record<string, unknown>;
    const metadata: ChecklistActionMetadata = {};
    if (typeof parsed.actionId === 'string' && parsed.actionId) metadata.actionId = parsed.actionId;
    if (typeof parsed.opportunityId === 'string' && parsed.opportunityId) metadata.opportunityId = parsed.opportunityId;
    if (typeof parsed.kind === 'string' && KINDS.has(parsed.kind)) metadata.kind = parsed.kind as NonNullable<ChecklistActionMetadata['kind']>;
    if (typeof parsed.scope === 'string' && SCOPES.has(parsed.scope)) metadata.scope = parsed.scope as NonNullable<ChecklistActionMetadata['scope']>;
    if (typeof parsed.locationId === 'string' && parsed.locationId) metadata.locationId = parsed.locationId;
    if (Number.isInteger(parsed.requestedMinutes) && Number(parsed.requestedMinutes) > 0) {
      metadata.requestedMinutes = Number(parsed.requestedMinutes);
    }
    if (parsed.quote && typeof parsed.quote === 'object' && !Array.isArray(parsed.quote)) {
      const quote = parsed.quote as Record<string, unknown>;
      const values = ['workMinutes', 'travelMinutes', 'totalMinutes', 'staminaCost'].map(key => Number(quote[key]));
      if (values.every(number => Number.isInteger(number) && number >= 0)) {
        metadata.quote = { workMinutes: values[0], travelMinutes: values[1], totalMinutes: values[2], staminaCost: values[3] };
      }
    }
    return metadata;
  } catch {
    return {};
  }
}
