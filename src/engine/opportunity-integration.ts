import { REVEAL_LEVELS, type RevealLevel } from '../agents/mystery/types';
import type { FactAliasTable } from '../agents/mystery/fact-aliases';
import type { DynamicRecord } from '../sillytavern/types';
import type { ProgramChecklistAction } from '../agents/mystery/scene-list';
import type { InvestigationOpportunity } from './investigation-opportunities';
import { planQuietWait } from './scheduled-events';

function knowledge(value: unknown): Record<string, RevealLevel> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, RevealLevel] => (
    REVEAL_LEVELS.includes(entry[1] as RevealLevel)
  )));
}

function ids(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((id): id is string => typeof id === 'string' && !!id))]
    : [];
}

/** Exact source identities newly committed by the accepted authority merge. */
export function deriveNewOpportunitySourceIds(
  before: DynamicRecord,
  authorized: DynamicRecord,
  aliases: FactAliasTable,
): string[] {
  const beforeKnowledge = knowledge(before.mysteryKnowledge);
  const afterKnowledge = knowledge(authorized.mysteryKnowledge);
  const result: string[] = [];
  for (const [factId, level] of Object.entries(afterKnowledge)) {
    const prior = beforeKnowledge[factId];
    if (prior && REVEAL_LEVELS.indexOf(prior) >= REVEAL_LEVELS.indexOf(level)) continue;
    const alias = aliases.factIdToAlias[factId];
    if (alias) result.push(`fact:${alias}:${level}`);
  }
  const beforeEvents = new Set(ids(before.knowledgeEvents));
  for (const eventId of ids(authorized.knowledgeEvents)) {
    if (!beforeEvents.has(eventId)) result.push(`accepted-event:${eventId}`);
  }
  return result;
}

export interface BuildProgramChecklistActionsInput {
  currentLocationId: string;
  currentTime: string;
  variables: DynamicRecord;
  stamina: number;
  publicLocations?: readonly { id: string; name: string; canTravel: boolean }[];
  opportunities: readonly InvestigationOpportunity[];
}

/** Program-authored generic menu actions. Numeric prices are added by the checklist quote helper. */
export function buildProgramChecklistActions(input: BuildProgramChecklistActionsInput): ProgramChecklistAction[] {
  const actions: ProgramChecklistAction[] = [];
  if (input.opportunities.length === 0) {
    for (const location of input.publicLocations ?? []) {
      if (location.canTravel && location.id !== input.currentLocationId) {
        actions.push({ id: `program:travel:${location.id}`, publicGoal: `前往${location.name}`,
          kind: 'travel', scope: 'normal', locationId: location.id });
      }
    }
  }
  if (Number.isFinite(input.stamina) && input.stamina < 120) {
    actions.push({ id: `program:rest:${input.currentLocationId}`, publicGoal: '休息一小时',
      kind: 'rest', scope: 'normal', locationId: input.currentLocationId, requestedMinutes: 60 });
  }
  const wait = planQuietWait({
    time: input.currentTime,
    variables: input.variables,
    opportunities: input.opportunities,
  });
  if (wait.kind === 'wait') {
    const tradeoff = wait.expiringOpportunities.length
      ? `；等待会错过：${wait.expiringOpportunities.map(item => item.publicGoal).join('、')}` : '';
    actions.push({
      id: `program:wait:${wait.endTime}`,
      publicGoal: `等待到下一既定时间点（${wait.requestedMinutes}分钟）${tradeoff}`,
      kind: 'wait',
      scope: 'normal',
      locationId: input.currentLocationId,
      requestedMinutes: wait.requestedMinutes,
    });
  }
  return actions;
}
