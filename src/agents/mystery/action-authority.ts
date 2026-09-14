import { readActionIntentSnapshot, resolvePlayerActionIntent, type ActionIntentSnapshot } from '../../engine/player-action-intent';
import { getLocationById, resolveRegisteredLocation } from '../../data/locations';
import { checkCycleFailure } from '../../engine/cycle-failure';
import { resolveActionNarrativeContext, splitPlayerActionClauses, type ActionNarrativeContext } from '../../engine/action-narrative-context';
import type { ActionContinuation, ActionScope, ActionStep, ResolveActionInput, ResolvedActionOutcome } from '../../engine/action-resolution';
import type { DirectorPlan, FactReview, WriterPacket } from './types';
import type { InvestigationOpportunity } from '../../engine/investigation-opportunities';
import type { QuietWaitDecision } from '../../engine/scheduled-events';
import type { ProgramChecklistAction } from './scene-list';

/** Constructed by the game, never by a model response. Kept out of model prompts. */
export interface ActionAuthorityContext {
  cycleCount: number;
  startTime: string;
  currentLocationId: string;
  stamina: number;
  sanity: number;
  originalInput: string;
  playerActionIntent?: ActionIntentSnapshot;
  /** Trusted location whose approved case-fact budget produced this plan. */
  sourceLocationId?: string;
  deathNews?: string;
  proposedScene?: ActionNarrativeContext | null;
  nextBoundary?: ResolveActionInput['nextBoundary'];
  appliedEventEffectIds?: string[];
  continuation?: ActionContinuation;
  pendingAuthorization?: import('./pending-action-authorization').PendingActionAuthorization;
  resumeActionId?: string;
  fantasy?: boolean;
  selection?: { actionId?: string; opportunityId?: string;
    kind: 'inquiry' | 'investigation' | 'search' | 'travel' | 'rest' | 'wait';
    scope?: ActionScope; locationId?: string; requestedMinutes?: number };
  /** Private program snapshot selected from the legal map; never serialized to a model prompt. */
  selectedOpportunity?: InvestigationOpportunity;
  selectedProgramAction?: ProgramChecklistAction;
  quietWaitDecision?: QuietWaitDecision;
  /** Menu prose/time fields are generated; only free player input imposes a budget. */
  inputOrigin?: 'player' | 'menu';
}

function durationNumber(raw: string): number | undefined {
  if (/^\d+$/.test(raw)) return Number(raw);
  if (raw === '半') return 0.5;
  const digits: Record<string, number> = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if (raw in digits) return digits[raw];
  if (/^[一二两三四五六七八九]?十[一二三四五六七八九]?$/.test(raw)) {
    const [a, b] = raw.split('十');
    return (a ? digits[a] : 1) * 10 + (b ? digits[b] : 0);
  }
  return undefined;
}

function summedDurations(matches: RegExpMatchArray[]): number | undefined {
  const minutes = matches.map(match => {
    const value = durationNumber(match[1]);
    return value === undefined ? NaN : value * (match[2] === '小时' ? 60 : 1);
  });
  return minutes.length && minutes.every(value => Number.isFinite(value) && value > 0)
    ? minutes.reduce((sum, value) => sum + value, 0) : undefined;
}

function explicitDuration(text: string): number | undefined {
  const leadingCap = text.match(/^\s*(?:我\s*)?(?:只用|只花|最多|总共|总计|限定|预算|给自己)([半一二两三四五六七八九十\d]+)(分钟|小时)(?!前(?!往)|后|之)/u);
  const explicitTotal = text.match(/(?:^|[，,；;])\s*(?:我\s*)?(?:总共|总计)([半一二两三四五六七八九十\d]+)(分钟|小时)(?!前(?!往)|后|之)/u);
  const aggregateCap = leadingCap ?? explicitTotal;
  if (aggregateCap) return summedDurations([aggregateCap]);
  return summedDurations([...text.matchAll(/(?:用|花|休息|等待|等)([半一二两三四五六七八九十\d]+)(分钟|小时)(?!前(?!往)|后|之)/gu)]);
}

function explicitStageDuration(text: string): number | undefined {
  const suffixDurations = [...text.matchAll(/(?:休息|等待|等)([半一二两三四五六七八九十\d]+)(分钟|小时)(?!前(?!往)|后|之)/gu)];
  if (suffixDurations.length) return summedDurations(suffixDurations);
  return summedDurations([...text.matchAll(/(?:只用|只花|用|花)?([半一二两三四五六七八九十\d]+)(分钟|小时)(?!前(?!往)|后|之)(?:来)?(?:休息|等待|等)/gu)]);
}

function actionClauses(text: string): string[] {
  const clauses = splitPlayerActionClauses(text);
  if (clauses.length > 8) throw new Error('单次复合行动超过八个阶段，请拆分行动。');
  return clauses.length ? clauses : [text];
}

function inferScope(text: string): ActionScope {
  if (/深入|彻底|全面|长时间|仔细搜查/u.test(text)) return 'deep';
  if (/简短|问一句|简单问|短暂/u.test(text)) return 'short';
  return 'normal';
}

function inferKind(text: string): ActionStep['kind'] {
  if (/^(?:原地)?(?:休息|睡|小睡|躺下)/u.test(text)) return 'rest';
  if (/^(?:原地)?(?:等待|等到|等[半一二两三四五六七八九十\d])/u.test(text)) return 'wait';
  if (/搜查|翻找|搜寻/u.test(text)) return 'search';
  if (/调查|查看|检查|观察/u.test(text)) return 'investigation';
  return 'inquiry';
}

export function buildActionAuthorityInput(
  plan: Omit<DirectorPlan, 'actionSteps'> & { actionSteps?: unknown },
  context: ActionAuthorityContext,
  id: string,
): ResolveActionInput {
  const base = { id, cycleCount: context.cycleCount, startTime: context.startTime,
    currentLocationId: context.currentLocationId, stamina: context.stamina, sanity: context.sanity,
    nextBoundary: context.nextBoundary ? { ...context.nextBoundary } : undefined,
    appliedEventEffectIds: context.appliedEventEffectIds ? [...context.appliedEventEffectIds] : undefined };
  if (context.deathNews === 'pending') return { ...base, steps: [{ id: 'death-news', kind: 'event',
    eventId: 'death-news', scope: 'normal', locationId: context.currentLocationId, completionSourceIds: [] }] };
  if (context.quietWaitDecision?.kind === 'deliver-boundary'
    && context.quietWaitDecision.boundary.id === 'death-news'
    && (context.selection?.kind === 'wait' || inferKind(context.originalInput) === 'wait')) {
    return { ...base, steps: [{ id: 'death-news', kind: 'event', eventId: 'death-news',
      scope: 'normal', locationId: context.currentLocationId, completionSourceIds: [] }] };
  }
  if (context.resumeActionId) {
    if (!context.continuation || context.continuation.actionId !== context.resumeActionId) throw new Error('没有匹配的未完成行动。');
    const continuation: ActionContinuation = {
      ...context.continuation,
      steps: context.continuation.steps.map(step => ({ ...step, completionSourceIds: [...step.completionSourceIds] })),
      completedMinutesByStep: { ...context.continuation.completedMinutesByStep },
      chargedStaminaByStep: { ...context.continuation.chargedStaminaByStep },
    };
    return { ...base, id: continuation.actionId,
      steps: continuation.steps.map(step => ({ ...step, completionSourceIds: [...step.completionSourceIds] })), continuation,
      explicitBudgetMinutes: context.inputOrigin === 'menu' ? undefined : explicitDuration(context.originalInput) };
  }
  if (context.fantasy) return { ...base, steps: [{ id: 'fantasy', kind: 'fantasy', eventId: 'fantasy',
    scope: 'normal', locationId: context.currentLocationId, completionSourceIds: [] }] };

  const selectedOpportunity = context.selectedOpportunity;
  if (context.selection?.opportunityId) {
    if (!selectedOpportunity
      || context.selection.opportunityId !== selectedOpportunity.id
      || context.selection.kind !== 'investigation'
      || context.selection.scope !== selectedOpportunity.scope
      || context.selection.locationId !== selectedOpportunity.locationId) {
      throw new Error('调查机会已经失效或选择元数据与当前合法机会不匹配。');
    }
  } else if (selectedOpportunity) {
    throw new Error('调查机会选择缺少程序标识。');
  }
  const selectedProgramAction = context.selectedProgramAction;
  if (!context.selection?.opportunityId && context.selection?.actionId) {
    if (!selectedProgramAction
      || context.selection.actionId !== selectedProgramAction.id
      || context.selection.kind !== selectedProgramAction.kind
      || context.selection.scope !== selectedProgramAction.scope
      || context.selection.locationId !== selectedProgramAction.locationId
      || context.selection.requestedMinutes !== selectedProgramAction.requestedMinutes) {
      throw new Error('程序行动已经失效或选择元数据与当前合法行动不匹配。');
    }
  } else if (selectedProgramAction && !context.selection?.actionId) {
    throw new Error('程序行动选择缺少程序标识。');
  }

  const operativeInput = selectedOpportunity?.publicGoal ?? selectedProgramAction?.publicGoal ?? context.originalInput;
  const boundIntent = context.playerActionIntent === undefined ? undefined : readActionIntentSnapshot(context.playerActionIntent);
  if (context.playerActionIntent !== undefined && (!boundIntent
    || boundIntent.originalInput !== context.originalInput || boundIntent.startLocationId !== context.currentLocationId)) {
    throw new Error('玩家行动意图绑定已经失效或被修改。');
  }
  const recognizedIntent = boundIntent ?? resolvePlayerActionIntent(operativeInput, context.currentLocationId, new Date(context.startTime));
  if (!recognizedIntent) throw new Error('玩家行动意图的目的地无法解析，请明确注册地点。');
  const clauses = actionClauses(operativeInput);
  const approvedFactSources = plan.revelations.map(fact => `fact:${fact.factId}:${fact.level}`);
  const approvedKnowledgeSources = (plan.knowledgeEvents ?? []).map(event => `accepted-event:${event.eventId}`);
  const approvedSources = [...approvedFactSources, ...approvedKnowledgeSources];
  const allowedSources = new Set(approvedSources);
  const proposals = plan.actionSteps;
  if (proposals !== undefined && (!Array.isArray(proposals) || !proposals.length || proposals.length > 8)) {
    throw new Error('导演行动阶段必须是非空且最多八项的数组。');
  }
  const supplied: unknown[] = Array.isArray(proposals) ? proposals : [];
  if (supplied.length && !selectedOpportunity && !selectedProgramAction && !context.selection) {
    // A separate travel proposal may precede work; it cannot replace or add work.
    const semantic = supplied.filter(raw => !(raw && typeof raw === 'object'
      && (raw as Partial<ActionStep>).kind === 'travel'
      && recognizedIntent.steps.some(step => step.kind !== 'travel' && step.locationId === (raw as Partial<ActionStep>).locationId)));
    if (semantic.length !== recognizedIntent.steps.length || semantic.some((raw, index) => {
      const step = raw as Partial<ActionStep> | null;
      const expected = recognizedIntent.steps[index];
      const explicitKind = /调查|查看|检查|观察|搜查|翻找|搜寻|休息|睡|等待|询问|打听|问|交谈|对话|聊|拜访|探访|找|同步|商讨|交流|讨论|谈|梳理/u.test(clauses[index] ?? operativeInput) || expected.kind === 'travel';
      return !step || ((boundIntent || explicitKind) && step.kind !== expected.kind) || step.locationId !== expected.locationId
        || (boundIntent && step.scope !== expected.scope);
    })) throw new Error('导演行动阶段与玩家原始意图的种类或目的地不匹配。');
  }
  if ((selectedOpportunity || selectedProgramAction) && supplied.length > 1) {
    throw new Error('单个程序行动不能被模型扩展为复合行动。');
  }
  const count = Math.max(clauses.length, supplied.length, 1);
  const steps: ActionStep[] = [];
  let location = context.currentLocationId;
  const ids = new Set<string>();
  for (let index = 0; index < count; index += 1) {
    const clause = clauses[index] ?? context.originalInput;
    const proposed = supplied[index] as Partial<ActionStep> | undefined;
    if (index < supplied.length && (!proposed || typeof proposed !== 'object' || Array.isArray(proposed))) throw new Error('无效行动阶段。');
    const destination = resolveActionNarrativeContext(clause, new Date(context.startTime), 0, {
      currentLocationId: location, cycleCount: context.cycleCount,
    })?.locationId ?? (clauses.length === 1 ? context.proposedScene?.locationId : undefined) ?? location;
    const requestedLocation = proposed?.locationId ?? context.selection?.locationId ?? destination;
    const registered = resolveRegisteredLocation(requestedLocation, location);
    if (!registered.accepted || registered.sceneId || (proposed?.locationId && proposed.locationId !== destination)) {
      throw new Error('行动地点未注册或与玩家请求的目的地不符。');
    }
    const kind = context.selection?.kind ?? proposed?.kind ?? recognizedIntent.steps[index]?.kind ?? inferKind(clause);
    if (!['inquiry', 'investigation', 'search', 'travel', 'rest', 'wait'].includes(kind)
      || proposed?.eventId !== undefined || proposed?.requestedMinutes !== undefined) {
      throw new Error('模型不能创建事件效果或指定确定性行动价格。');
    }
    const inputScope = inferScope(clause);
    const scope = inputScope === 'deep' ? 'deep' : context.selection?.scope ?? proposed?.scope ?? inputScope;
    if (!['short', 'normal', 'deep'].includes(scope)) throw new Error('无效行动强度。');
    const stepId = proposed?.id ?? `work:${index}`;
    if (typeof stepId !== 'string' || !stepId.trim() || ids.has(stepId)) throw new Error('行动阶段标识为空或重复。');
    ids.add(stepId);
    if (proposed?.completionSourceIds !== undefined
      && (!Array.isArray(proposed.completionSourceIds) || proposed.completionSourceIds.some(source => !allowedSources.has(source)))) {
      throw new Error('行动结果引用了未授权的事实来源。');
    }
    const duration = context.inputOrigin === 'menu' ? undefined : explicitStageDuration(clause);
    if ((selectedOpportunity || selectedProgramAction) && proposed
      && ((proposed.kind !== undefined && proposed.kind !== context.selection?.kind)
        || (proposed.scope !== undefined && proposed.scope !== context.selection?.scope)
        || (proposed.locationId !== undefined && proposed.locationId !== context.selection?.locationId))) {
      throw new Error('导演行动阶段与已选择调查机会不匹配。');
    }
    const quietMinutes = kind === 'wait' && duration === undefined
      ? selectedProgramAction?.requestedMinutes
        ?? (context.quietWaitDecision?.kind === 'wait' ? context.quietWaitDecision.requestedMinutes : undefined)
      : undefined;
    steps.push({ id: stepId, kind, scope, locationId: registered.locationId,
      ...(selectedOpportunity ? { opportunityId: selectedOpportunity.id } : {}), completionSourceIds: [],
      ...((kind === 'rest' || kind === 'wait') ? { requestedMinutes: duration ?? quietMinutes ?? 60 } : {}) });
    location = registered.locationId;
  }
  const requiredArrivalEvents = new Set(context.proposedScene?.sceneContract.requiredKnowledgeEvents
    .map(event => event.eventId) ?? []);
  const arrivalSources = approvedKnowledgeSources.filter(source => requiredArrivalEvents.has(source.slice('accepted-event:'.length)));
  const workKnowledgeSources = approvedKnowledgeSources.filter(source => !arrivalSources.includes(source));

  if (arrivalSources.length && context.proposedScene) {
    const arrivalLocationId = context.proposedScene.locationId;
    let priorLocationId = context.currentLocationId;
    for (let index = 0; index < steps.length; index += 1) {
      const step = steps[index];
      if (step.locationId === arrivalLocationId && priorLocationId !== arrivalLocationId) {
        if (step.kind === 'travel') {
          step.completionSourceIds = [...arrivalSources];
        } else {
          let arrivalId = `arrival:${index}:${arrivalLocationId}`;
          while (ids.has(arrivalId)) arrivalId = `${arrivalId}:program`;
          ids.add(arrivalId);
          steps.splice(index, 0, { id: arrivalId, kind: 'travel', scope: 'normal',
            locationId: arrivalLocationId, completionSourceIds: [...arrivalSources] });
        }
        break;
      }
      priorLocationId = step.locationId;
    }
  }

  // Ambiguous case facts remain tied to the fact gate's location, while other
  // knowledge milestones remain on the final completed work stage.
  const workSteps = steps.filter(step => ['inquiry', 'investigation', 'search'].includes(step.kind));
  const sourceLocationId = context.sourceLocationId ?? context.currentLocationId;
  const lastEligibleFactWork = [...workSteps].reverse().find(step => step.locationId === sourceLocationId);
  if (lastEligibleFactWork) lastEligibleFactWork.completionSourceIds.push(...approvedFactSources);
  const lastWork = workSteps.at(-1);
  if (lastWork) {
    lastWork.completionSourceIds.push(...workKnowledgeSources);
    lastWork.completionSourceIds = [...new Set(lastWork.completionSourceIds)];
  }
  if (context.proposedScene?.locationId === context.currentLocationId) {
    const introductionWork = workSteps.find(step => step.locationId === context.currentLocationId);
    if (introductionWork) introductionWork.completionSourceIds = [...new Set([...introductionWork.completionSourceIds, ...arrivalSources])];
  }
  return { ...base, steps, explicitBudgetMinutes: context.inputOrigin === 'menu' ? undefined : explicitDuration(context.originalInput) };
}

/** A passed final audit is necessary; merely planned/summary-only facts are not learned. */
export function selectPresentedActionFacts(
  packet: WriterPacket,
  review: FactReview | undefined,
  completedSourceIds: readonly string[],
): WriterPacket {
  const completed = new Set(completedSourceIds);
  const cited = new Set(review?.approved ? review.assertionAudit?.assertions
    .filter(assertion => assertion.field === 'maintext' && assertion.status === 'supported')
    .flatMap(assertion => assertion.citations.map(citation => citation.sourceId)) ?? [] : []);
  return { ...packet, authorizedFacts: packet.authorizedFacts.filter(fact => {
    const sourceId = `fact:${fact.id}:${fact.level}`;
    return completed.has(sourceId) && cited.has(sourceId);
  }) };
}

export function isNonWorkResolution(resolution: ResolvedActionOutcome): boolean {
  return !resolution.segments.some(segment => segment.executedMinutes > 0
    && ['inquiry', 'investigation', 'search'].includes(segment.step.kind));
}

function cloneBeat(beat: DirectorPlan['beats'][number]): DirectorPlan['beats'][number] {
  return { ...beat,
    speakerIds: beat.speakerIds ? [...beat.speakerIds] : undefined,
    sourceMemoryIds: beat.sourceMemoryIds ? [...beat.sourceMemoryIds] : undefined,
    sourceBackgroundFactIds: beat.sourceBackgroundFactIds ? [...beat.sourceBackgroundFactIds] : undefined };
}

function cloneScenePlan(scenePlan: DirectorPlan['scenePlan']): DirectorPlan['scenePlan'] {
  return scenePlan ? { ...scenePlan,
    investigateIntents: scenePlan.investigateIntents.map(intent => ({ ...intent })),
    actionIntents: scenePlan.actionIntents.map(intent => ({ ...intent })) } : undefined;
}

function executedSegmentDescription(segment: ResolvedActionOutcome['segments'][number]): string {
  if (segment.step.eventId === 'death-news') {
    return '警方明确告知玩家文穗已经死亡；消息通过正式电话送达。电话没有说明死因、凶手或案发经过。';
  }
  if (segment.step.kind === 'travel') {
    return segment.completed
      ? `前往目的地的路程实际用了${segment.executedMinutes}分钟，并已抵达。`
      : `前往目的地的路程实际进行了${segment.executedMinutes}分钟，目前仍在途中。`;
  }
  const label = segment.step.kind === 'rest' ? '休息' : segment.step.kind === 'wait' ? '等待' : '行动';
  return `${label}实际进行了${segment.executedMinutes}分钟，累计${segment.cumulativeExecutedMinutes}/${segment.plannedMinutes}分钟。${segment.completed ? '这一阶段已经完成。' : '这一阶段尚未完成，也没有产生完整结果。'}`;
}

/** Project intentions into executed beats; withheld findings must leave every dependent field. */
export function projectExecutedPlan(
  plan: DirectorPlan,
  resolution: ResolvedActionOutcome,
  presentNpcIds: readonly string[] = [],
  segmentNpcIdsByLocation: Readonly<Record<string, readonly string[]>> = {},
  executedSceneContract?: WriterPacket['sceneContract'],
): DirectorPlan {
  const completed = new Set(resolution.completedSourceIds);
  const partial = resolution.executedMinutes < resolution.plannedMinutes
    || resolution.segments.some(segment => !segment.completed);
  const nonWork = isNonWorkResolution(resolution);
  const withheldOutcome = plan.revelations.some(fact => !completed.has(`fact:${fact.factId}:${fact.level}`))
    || (plan.knowledgeEvents ?? []).some(event => !completed.has(`accepted-event:${event.eventId}`));
  const rewriteBeats = partial || nonWork || withheldOutcome;
  const castForSegment = (locationId: string) => {
    const allowed = new Set(segmentNpcIdsByLocation[locationId] ?? (locationId === resolution.endLocationId ? presentNpcIds : []));
    return [...new Set(plan.beats.filter(beat => !beat.locationId || beat.locationId === locationId)
      .flatMap(beat => beat.speakerIds ?? []).filter(npcId => allowed.has(npcId)))];
  };
  const beats: DirectorPlan['beats'] = rewriteBeats ? resolution.segments.map((segment, index) => ({
    id: `executed:${index}`, purpose: segment.step.kind === 'event' ? '传达定时事件' : '演绎已执行的行动片段',
    description: executedSegmentDescription(segment),
    // Event/transit beats do not imply an in-person reception at the map anchor.
    ...(!nonWork ? { locationId: segment.step.kind === 'travel' && !segment.completed
      ? resolution.startLocationId : segment.step.locationId } : {}),
    speakerIds: !nonWork && segment.executedMinutes > 0
      && ['inquiry', 'investigation', 'search'].includes(segment.step.kind)
      ? castForSegment(segment.step.locationId) : [],
  })) : plan.beats.map(cloneBeat);
  // A later boundary may withhold work results, but cannot erase an encounter
  // from a journey already completed in this execution. Rebuild only public
  // interaction, never copy plan prose that may depend on withheld findings.
  const enRouteNpcIds = executedSceneContract?.requiredEnRouteNpcIds ?? [];
  if (rewriteBeats && !nonWork && enRouteNpcIds.length) {
    const arrivalIndex = resolution.segments.findIndex(segment => segment.step.kind === 'travel'
      && segment.step.locationId === executedSceneContract?.destinationLocationId
      && segment.completed && segment.executedMinutes > 0
      && segment.cumulativeExecutedMinutes === segment.executedMinutes);
    if (arrivalIndex >= 0) beats.splice(arrivalIndex, 0, {
      id: `executed:en-route:${arrivalIndex}`, purpose: '演绎已完成路程中的规定遭遇',
      description: '在抵达前的路途中，与场景契约规定的人物短暂互动；只按公开身份演绎，不披露未完成调查的结果。',
      locationId: 'street', speakerIds: [...enRouteNpcIds],
    });
  }
  if (!beats.length) beats.push({ id: 'boundary', purpose: '行动在事件边界暂停',
    description: '尚未执行新的调查。说明当前事件打断，保留后续选择。', speakerIds: [] });
  return {
    ...plan,
    turnGoal: rewriteBeats ? '呈现本次已执行的行动，并交代当前进度' : plan.turnGoal,
    beats,
    revelations: plan.revelations.filter(fact => completed.has(`fact:${fact.factId}:${fact.level}`)).map(fact => ({ ...fact })),
    knowledgeEvents: (plan.knowledgeEvents ?? []).filter(event => completed.has(`accepted-event:${event.eventId}`)).map(event => ({ ...event })),
    optionIntents: plan.optionIntents.map(intent => ({ ...intent })),
    assetRequests: [...plan.assetRequests],
    backgroundFactProposals: plan.backgroundFactProposals?.map(proposal => ({ ...proposal,
      characterIds: [...proposal.characterIds], locationIds: [...proposal.locationIds], knowerIds: [...proposal.knowerIds] })),
    scenePlan: cloneScenePlan(plan.scenePlan),
    timeCostMinutes: resolution.executedMinutes,
    ...(rewriteBeats ? { backgroundFactProposals: [], scenePlan: undefined,
      assetRequests: [], optionIntents: [
        { id: 'next', intent: resolution.continuation ? '继续未完成的调查' : '查看接下来的调查机会', tone: '克制', expectedPressure: 'low' as const },
        { id: 'rest', intent: '休息一会儿', tone: '克制', expectedPressure: 'low' as const },
      ] } : {}),
  };
}

export function buildActionOutcomeSources(resolution: ResolvedActionOutcome, retainedTransit = false): NonNullable<WriterPacket['authorizedActionOutcomes']> {
  const before = resolution.resources.before;
  const after = resolution.resources.after;
  const locationName = getLocationById(resolution.endLocationId)?.name ?? resolution.endLocationId;
  const inTransit = retainedTransit || resolution.segments.some(segment => segment.step.kind === 'travel' && !segment.completed);
  const locationOutcome = inTransit
    ? `玩家仍在途中，尚未抵达目的地；地图锚点暂保留${locationName}（${resolution.endLocationId}）。`
    : `行动结束时，玩家位于${locationName}（${resolution.endLocationId}）。`;
  const sources = [{ id: `resolution:${resolution.id}`,
    text: `本次行动从${resolution.startTime}持续到${resolution.endTime}，共过去${resolution.executedMinutes}分钟。${locationOutcome}体力从${before.stamina}变为${after.stamina}，理智从${before.sanity}变为${after.sanity}。` }];
  const resetReason = checkCycleFailure({ ...after, time: new Date(resolution.endTime) });
  if (resetReason) sources.push({ id: `cycle-boundary:${resolution.id}`,
    text: `本次结算在${resolution.endTime}到达当日行动终止边界，原因是${resetReason === 'day-end' ? '午夜已到' : resetReason === 'stamina' ? '体力耗尽' : '理智耗尽'}。当天行动在此中断，未执行的计划不能继续完成。仅演出已发生的原因与中断；后续进入结局还是重置到9月9日08:00，由程序按结局优先规则决定，当前正文不得提前宣告。` });
  if (resolution.segments.some(segment => !segment.completed)) sources.push({ id: `partial:${resolution.id}`,
    text: '这次行动在全部计划完成前暂停；尚未完成的阶段没有产生完整结果。' });
  if (resolution.interruption) sources.push({ id: `interruption:${resolution.id}`,
    text: resolution.interruption.id === 'explicit-budget'
      ? `在${resolution.interruption.at}，玩家限定的时间已经用完，因此暂停行动；这不表示发生了新的世界事件。`
      : `在${resolution.interruption.at}，到达了程序确定的时间边界，行动在此暂停。` });
  if (resolution.segments.some(segment => segment.completed && segment.step.eventId === 'death-news')) {
    sources.push({ id: `death-news:${resolution.cycleCount}`, text: '警方明确告知玩家文穗已经死亡；消息通过正式电话送达。电话没有说明死因、凶手或案发经过。' });
  }
  return sources;
}
