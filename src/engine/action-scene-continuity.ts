import type { ActionContinuation } from './action-resolution';
import { getLocationById, getLocationBackground } from '../data/locations';
import {
  resolveActionNarrativeContext,
  type ActionNarrativeContext,
  type ResolveActionNarrativeContextOptions,
} from './action-narrative-context';

/** Persisted beside an unfinished action and never serialized into model prompts. */
export interface ActionSceneContinuity {
  actionId: string;
  cycleCount: number;
  contextsByLocation: Record<string, ActionNarrativeContext>;
}

/** Prepared before the resolver has assigned the unfinished action identity. */
export type PendingActionSceneContext = Omit<ActionSceneContinuity, 'actionId'>;

type BuildSceneContextOptions = Pick<ResolveActionNarrativeContextOptions,
  'currentLocationId' | 'cycleCount' | 'destinationLocationId' | 'knowledgeEvents' | 'enRouteEncounterRoll' | 'schoolEncounterRoll'>;

function actionClauses(input: string): string[] {
  const marked = input.replace(/^先(.+?)再/u, '$1；再');
  return marked
    .split(/[，,。；;！!\n]|(?:然后|接着|再)/u)
    .map(clause => clause.trim())
    .filter(Boolean);
}

function cloneContext(context: ActionNarrativeContext): ActionNarrativeContext {
  return structuredClone(context);
}

/** Parse every destination once from the original input, clock, and route order. */
export function buildPendingActionSceneContext(
  input: string,
  currentTime: Date,
  options: BuildSceneContextOptions = {},
): PendingActionSceneContext {
  const cycleCount = options.cycleCount ?? 1;
  let currentLocationId = options.currentLocationId ?? 'home';
  const contextsByLocation: Record<string, ActionNarrativeContext> = {};
  for (const clause of actionClauses(input)) {
    const context = resolveActionNarrativeContext(clause, currentTime, 0, {
      ...options,
      currentLocationId,
      cycleCount,
    });
    if (!context) continue;
    contextsByLocation[context.locationId] ??= cloneContext(context);
    currentLocationId = context.locationId;
  }
  return { cycleCount, contextsByLocation };
}

/** Extend the frozen scene samples; a replan must never reroll an existing destination. */
export function extendPendingActionSceneContext(
  pending: PendingActionSceneContext,
  steps: readonly { locationId: string }[],
  currentTime: Date,
  options: BuildSceneContextOptions = {},
): PendingActionSceneContext {
  const result = structuredClone(pending);
  let currentLocationId = options.currentLocationId ?? 'home';
  for (const step of steps) {
    const location = getLocationById(step.locationId);
    if (!location) throw new Error(`无法为未注册地点 ${step.locationId} 建立场景契约。`);
    if (!result.contextsByLocation[location.id]) {
      const background = getLocationBackground(location, currentTime);
      const directive = `在注册地点 ${location.id} 按玩家原目标进行普通当下互动，不新增案件事实。`;
      result.contextsByLocation[location.id] = resolveActionNarrativeContext(`前往${location.name}`, currentTime, 0, {
        ...options, currentLocationId, cycleCount: pending.cycleCount, destinationLocationId: location.id,
      }) ?? {
        locationId: location.id, background, entryMode: 'destination', requiredNpcIds: [], enRouteNpcIds: [],
        forbiddenNpcIds: [], presentationMode: 'default', costs: {}, directive,
        sceneContract: { destinationLocationId: location.id, destinationBackground: background,
          entryMode: 'destination', requiredDestinationNpcIds: [], requiredEnRouteNpcIds: [],
          forbiddenNpcIds: [], requiredKnowledgeEvents: [], forbiddenKnowledgeEventIds: [], directive },
      };
    }
    currentLocationId = location.id;
  }
  return result;
}


/** Select the original contract for the active or next destination of saved work. */
export function selectContinuationSceneContext(
  saved: ActionSceneContinuity | null | undefined,
  continuation: ActionContinuation | null | undefined,
): ActionNarrativeContext | null {
  if (!saved || !continuation
    || saved.actionId !== continuation.actionId
    || saved.cycleCount !== continuation.cycleCount) return null;
  const activeIndex = continuation.steps.findIndex(step => step.id === continuation.activeStepId);
  if (activeIndex < 0) return null;
  for (const step of continuation.steps.slice(activeIndex)) {
    const context = saved.contextsByLocation[step.locationId];
    if (context) return cloneContext(context);
  }
  return null;
}

export function pendingSceneContextFromSaved(
  saved: ActionSceneContinuity,
): PendingActionSceneContext {
  return {
    cycleCount: saved.cycleCount,
    contextsByLocation: Object.fromEntries(Object.entries(saved.contextsByLocation)
      .map(([locationId, context]) => [locationId, cloneContext(context)])),
  };
}
