import { getMaxOutputTokens } from '../../sillytavern/token-budget';
import type { ApiConfig, ChatCompletionMessage } from '../../sillytavern/api-router';
import { callSecondaryApi } from '../../sillytavern/api-router';
import type { ChatPreset, Scene } from '../../sillytavern/types';
import {
  quoteActionSteps,
  type ActionScope,
  type ActionStep,
} from '../../engine/action-resolution';
import type { PublicInvestigationOpportunity } from '../../engine/investigation-opportunities';
import { translateForDirector } from '../../engine/variable-thresholds';
import {
  PROGRAM_SCENE_CHECKLIST_RESPONSE_FORMAT,
  SCENE_CHECKLIST_RESPONSE_FORMAT,
} from './schemas';
import { completeStructured, extractJson } from './structured';
import type { AgentCompletion } from './structured';
import type { DirectorScenePlan } from './types';
import { encodeChecklistMetadata } from '../../engine/checklist-metadata';

export interface SceneChecklistItem {
  desc: string;
  suspect: string;
  style: string;
  time: string;
  stamina: number;
  sanity: number;
  /** Program metadata is absent on legacy checklist rows. */
  actionId?: string;
  opportunityId?: string;
  kind?: ProgramChecklistAction['kind'];
  scope?: ActionScope;
  locationId?: string;
  requestedMinutes?: number;
  quote?: ProgramChecklistQuote;
}

export interface SceneChecklist {
  observe: string;
  investigateItems: SceneChecklistItem[];
  actionItems: Array<Omit<SceneChecklistItem, 'suspect'>>;
}

export const SCENE_LIST_SYSTEM_PROMPT = `你是《漫长的告别》的场景清单 Agent。你根据本回合已生成的剧情正文与导演的场景意图，产出玩家可交互的观察内容与调查/行动清单。

规则：
1. 只依据给定正文与导演意图，不得引入正文未出现、意图未授权的新事实、新地点、新人物。
2. observe 是玩家点击「观察」看到的五感描写；重要发现用 [发现]、异常之处用 [异常]、可整理为线索的信息用 [线索] 标记行首。
3. investigateItems 每项对应导演的一条调查意图；suspect 填意图指向的嫌疑人称呼（玩家视角可见称呼），无则填「无」。
4. costTier 换算：light≈耗时10-20分钟/体力5-10/理智0-3；medium≈30-60分钟/体力10-20/理智3-8；heavy≈60分钟以上/体力20-35/理智8-15。time 用中文如「30分钟」。
5. 若提供了旧清单，保持尚未失效项的延续性，剔除已被正文推进消解的项。
6. 每类 2-4 项。只输出严格 JSON，不要 Markdown 或解释：
{"observe":"string","investigateItems":[{"desc":"string","suspect":"string","style":"string","time":"string","stamina":number,"sanity":number}],"actionItems":[{"desc":"string","style":"string","time":"string","stamina":number,"sanity":number}]}`;

export const PROGRAM_SCENE_LIST_SYSTEM_PROMPT = `你是《漫长的告别》的场景清单 Agent。你只为程序已批准的公开调查机会和通用行动撰写简短的玩家可见描述。

规则：
1. 只能使用已批准正文、导演意图和公开候选中已经出现的材料；不得增加新事实、新地点、新人物、调查结果或隐藏答案。
2. investigateItems/actionItems 每项的 actionId 必须逐字复制公开候选中的 id；不得创造、改写或重复 id，不得把调查候选放入行动列表，反之亦然。
3. desc 必须逐字复制对应候选的 publicGoal，只可为它填写 suspect 和 style。不得输出或推算时间、体力、理智、价格、来源 ID 或事实 ID；时间与资源由程序在验证 id 后添加，程序也会用 publicGoal 覆盖任何不一致的 desc。
4. observe 可以为空；有内容时只能概括正文已呈现的感官信息。
5. 可以输出零项或一项，不得为凑数虚构填充项。只输出严格 JSON，不要 Markdown 或解释：
{"observe":"string","investigateItems":[{"actionId":"string","desc":"string","suspect":"string","style":"string"}],"actionItems":[{"actionId":"string","desc":"string","style":"string"}]}`;

export type ProgramChecklistActionKind = Extract<ActionStep['kind'],
  'inquiry' | 'investigation' | 'search' | 'travel' | 'rest' | 'wait'>;

export interface ProgramChecklistAction {
  id: string;
  publicGoal: string;
  kind: ProgramChecklistActionKind;
  scope: ActionScope;
  locationId: string;
  requestedMinutes?: number;
}

export interface ProgramChecklistQuote {
  workMinutes: number;
  travelMinutes: number;
  totalMinutes: number;
  staminaCost: number;
}

export interface ProgramSceneChecklistDraftItem {
  actionId: string;
  desc: string;
  style: string;
}

export interface ProgramSceneChecklistDraft {
  observe: string;
  investigateItems: Array<ProgramSceneChecklistDraftItem & { suspect: string }>;
  actionItems: ProgramSceneChecklistDraftItem[];
}

export interface SceneListInput {
  maintext: string;
  scenePlan?: DirectorScenePlan | null;
  currentLocation?: string | null;
  currentLocationId?: string | null;
  currentTime?: string | null;
  previousScene?: Pick<Scene, 'observe' | 'investigateItems' | 'actionItems'> | null;
  variables?: Record<string, unknown>;
  /** `undefined` preserves the legacy model-priced checklist path. */
  publicOpportunities?: readonly PublicInvestigationOpportunity[];
  programActions?: readonly ProgramChecklistAction[];
}

export function buildSceneListMessages(input: SceneListInput): ChatCompletionMessage[] {
  const sections = [`[本回合剧情正文]\n${input.maintext}`];
  const usesProgramAuthority = input.publicOpportunities !== undefined;
  const currentLocation = input.currentLocationId ?? input.currentLocation;
  if (currentLocation) sections.push(`[当前地点]\n${currentLocation}`);
  if (usesProgramAuthority && input.currentTime) sections.push(`[当前时间]\n${input.currentTime}`);
  if (input.scenePlan) {
    const scenePlan = usesProgramAuthority ? projectPublicScenePlan(input.scenePlan) : input.scenePlan;
    sections.push(`[导演场景意图]\n${JSON.stringify(scenePlan, null, 2)}`);
  }
  if (!usesProgramAuthority && input.previousScene
    && (input.previousScene.observe || input.previousScene.investigateItems?.length || input.previousScene.actionItems?.length)) {
    sections.push(`[上一份清单]\n${JSON.stringify({
      observe: input.previousScene.observe ?? '',
      investigateItems: input.previousScene.investigateItems ?? [],
      actionItems: input.previousScene.actionItems ?? [],
    }, null, 2)}`);
  }
  if (usesProgramAuthority) {
    const opportunities = activePublicOpportunities(input.publicOpportunities ?? [], input.currentTime);
    sections.push(`[程序已批准的公开调查机会]\n${JSON.stringify(opportunities, null, 2)}`);
    sections.push(`[程序已批准的公开通用行动]\n${JSON.stringify(
      (input.programActions ?? []).map(({ id, publicGoal, kind, scope, locationId }) => ({
        id, publicGoal, kind, scope, locationId,
      })),
      null,
      2,
    )}`);
  } else if (input.variables) {
    sections.push(`[状态指令]\n${translateForDirector(input.variables)}`);
  }
  return [
    { role: 'system', content: usesProgramAuthority ? PROGRAM_SCENE_LIST_SYSTEM_PROMPT : SCENE_LIST_SYSTEM_PROMPT },
    { role: 'user', content: `请生成本回合的场景清单。\n\n${sections.join('\n\n')}` },
  ];
}

function projectPublicScenePlan(scenePlan: DirectorScenePlan): Record<string, unknown> {
  return {
    observeFocus: scenePlan.observeFocus,
    investigateIntents: scenePlan.investigateIntents.map(({ intent, opportunityId, scope }) => ({
      intent,
      ...(opportunityId ? { opportunityId } : {}),
      ...(scope ? { scope } : {}),
    })),
    actionIntents: scenePlan.actionIntents.map(({ intent, opportunityId, scope }) => ({
      intent,
      ...(opportunityId ? { opportunityId } : {}),
      ...(scope ? { scope } : {}),
    })),
  };
}

function activePublicOpportunities(
  opportunities: readonly PublicInvestigationOpportunity[],
  currentTime?: string | null,
): PublicInvestigationOpportunity[] {
  if (!currentTime) return opportunities.map(item => ({ ...item }));
  const now = new Date(currentTime).getTime();
  if (!Number.isFinite(now)) throw new TypeError('currentTime must be a valid clock');
  return opportunities
    .filter(item => item.availableUntil === undefined || new Date(item.availableUntil).getTime() >= now)
    .map(item => ({ ...item }));
}

function parseSceneChecklist(text: string): SceneChecklist {
  const value = extractJson(text);
  if (!value || typeof value !== 'object') throw new Error('场景清单不是对象。');
  const checklist = value as Partial<SceneChecklist>;
  if (typeof checklist.observe !== 'string' || !checklist.observe.trim()) {
    throw new Error('场景清单缺少 observe。');
  }
  if (!Array.isArray(checklist.investigateItems) || !Array.isArray(checklist.actionItems)) {
    throw new Error('场景清单缺少 investigateItems 或 actionItems。');
  }
  return {
    observe: checklist.observe.trim(),
    investigateItems: checklist.investigateItems.map(item => ({
      desc: String(item.desc ?? ''),
      suspect: String(item.suspect ?? '无'),
      style: String(item.style ?? '现实'),
      time: String(item.time ?? '0分钟'),
      stamina: Number(item.stamina) || 0,
      sanity: Number(item.sanity) || 0,
    })).filter(item => item.desc),
    actionItems: checklist.actionItems.map(item => ({
      desc: String(item.desc ?? ''),
      style: String(item.style ?? '现实'),
      time: String(item.time ?? '0分钟'),
      stamina: Number(item.stamina) || 0,
      sanity: Number(item.sanity) || 0,
    })).filter(item => item.desc),
  };
}

function parseProgramSceneChecklist(text: string): ProgramSceneChecklistDraft {
  const value = extractJson(text);
  if (!value || typeof value !== 'object') throw new Error('场景清单不是对象。');
  const checklist = value as Partial<ProgramSceneChecklistDraft>;
  if (typeof checklist.observe !== 'string') throw new Error('场景清单缺少 observe。');
  if (!Array.isArray(checklist.investigateItems) || !Array.isArray(checklist.actionItems)) {
    throw new Error('场景清单缺少 investigateItems 或 actionItems。');
  }
  return {
    observe: checklist.observe.trim(),
    investigateItems: checklist.investigateItems.map(item => ({
      actionId: String(item.actionId ?? ''),
      desc: String(item.desc ?? '').trim(),
      suspect: String(item.suspect ?? '无'),
      style: String(item.style ?? '现实'),
    })).filter(item => item.desc),
    actionItems: checklist.actionItems.map(item => ({
      actionId: String(item.actionId ?? ''),
      desc: String(item.desc ?? '').trim(),
      style: String(item.style ?? '现实'),
    })).filter(item => item.desc),
  };
}

function isInvestigationKind(kind: ProgramChecklistActionKind): boolean {
  return kind === 'inquiry' || kind === 'investigation' || kind === 'search';
}

interface ProgramCandidate extends ProgramChecklistAction {
  opportunityId?: string;
}

function buildProgramCandidateMap(input: Pick<SceneListInput,
  'publicOpportunities' | 'programActions' | 'currentTime'>): Map<string, ProgramCandidate> {
  const candidates = new Map<string, ProgramCandidate>();
  const add = (candidate: ProgramCandidate) => {
    if (candidates.has(candidate.id)) throw new Error(`duplicate approved checklist action id: ${candidate.id}`);
    candidates.set(candidate.id, candidate);
  };
  for (const opportunity of activePublicOpportunities(input.publicOpportunities ?? [], input.currentTime)) {
    add({
      id: opportunity.id,
      publicGoal: opportunity.publicGoal,
      kind: 'investigation',
      scope: opportunity.scope,
      locationId: opportunity.locationId,
      opportunityId: opportunity.id,
    });
  }
  for (const action of input.programActions ?? []) add({ ...action });
  return candidates;
}

export function quoteProgramChecklistAction(
  action: ProgramChecklistAction,
  currentLocationId: string,
  opportunityId?: string,
): ProgramChecklistQuote {
  return quoteActionSteps({
    currentLocationId,
    steps: [{
      id: action.id,
      kind: action.kind,
      scope: action.scope,
      locationId: action.locationId,
      ...(opportunityId ? { opportunityId } : {}),
      completionSourceIds: [],
      ...(action.requestedMinutes !== undefined ? { requestedMinutes: action.requestedMinutes } : {}),
    }],
  });
}

export function materializeProgramSceneChecklist(input: {
  draft: ProgramSceneChecklistDraft;
  currentLocationId: string;
  currentTime?: string | null;
  publicOpportunities: readonly PublicInvestigationOpportunity[];
  programActions?: readonly ProgramChecklistAction[];
}): SceneChecklist {
  const candidates = buildProgramCandidateMap(input);
  const seen = new Set<string>();
  const materialize = <T extends ProgramSceneChecklistDraftItem>(item: T, investigation: boolean) => {
    if (!item.actionId || seen.has(item.actionId)) {
      if (seen.has(item.actionId)) throw new Error(`duplicate checklist action id: ${item.actionId}`);
      throw new Error('unknown checklist action id: empty');
    }
    seen.add(item.actionId);
    const candidate = candidates.get(item.actionId);
    if (!candidate) throw new Error(`unknown checklist action id: ${item.actionId}`);
    if (isInvestigationKind(candidate.kind) !== investigation) {
      throw new Error(`checklist action category mismatch: ${item.actionId}`);
    }
    const quote = quoteProgramChecklistAction(candidate, input.currentLocationId, candidate.opportunityId);
    return {
      ...item,
      // The model may style a candidate, but the operative label remains program-authored.
      desc: candidate.publicGoal,
      opportunityId: candidate.opportunityId,
      kind: candidate.kind,
      scope: candidate.scope,
      locationId: candidate.locationId,
      requestedMinutes: candidate.requestedMinutes,
      quote,
      time: `${quote.totalMinutes}分钟`,
      stamina: quote.staminaCost,
      sanity: 0,
    };
  };
  return {
    observe: input.draft.observe,
    investigateItems: input.draft.investigateItems.map(item => materialize(item, true)),
    actionItems: input.draft.actionItems.map(item => materialize(item, false)),
  };
}

export function buildDeterministicSceneChecklist(input: {
  currentLocationId: string;
  currentTime?: string | null;
  publicOpportunities: readonly PublicInvestigationOpportunity[];
  programActions?: readonly ProgramChecklistAction[];
}): SceneChecklist {
  const candidates = buildProgramCandidateMap(input);
  const draft: ProgramSceneChecklistDraft = { observe: '', investigateItems: [], actionItems: [] };
  for (const candidate of candidates.values()) {
    if (isInvestigationKind(candidate.kind)) {
      draft.investigateItems.push({
        actionId: candidate.id,
        desc: candidate.publicGoal,
        suspect: '无',
        style: '现实',
      });
    } else {
      draft.actionItems.push({ actionId: candidate.id, desc: candidate.publicGoal, style: '现实' });
    }
  }
  return materializeProgramSceneChecklist({ ...input, draft });
}

export interface GenerateSceneChecklistOptions {
  api: ApiConfig;
  preset: ChatPreset | null;
  complete?: AgentCompletion;
  abortSignal?: AbortSignal;
}

export async function generateSceneChecklist(
  input: SceneListInput,
  options: GenerateSceneChecklistOptions,
): Promise<SceneChecklist> {
  const complete = options.complete ?? ((messages, callOptions) => callSecondaryApi(
    options.api,
    messages,
    options.preset,
    { ...callOptions, abortSignal: options.abortSignal },
  ));
  const supportKey = `${options.api.baseUrl}|${options.api.model}`;
  const usesProgramAuthority = input.publicOpportunities !== undefined;
  const text = await completeStructured(
    complete,
    supportKey,
    buildSceneListMessages(input),
    { temperature: 0.4, maxTokens: getMaxOutputTokens(options.preset) },
    usesProgramAuthority ? PROGRAM_SCENE_CHECKLIST_RESPONSE_FORMAT : SCENE_CHECKLIST_RESPONSE_FORMAT,
  );
  if (!usesProgramAuthority) return parseSceneChecklist(text);
  if (!input.currentLocationId) throw new Error('program checklist requires currentLocationId');
  return materializeProgramSceneChecklist({
    draft: parseProgramSceneChecklist(text),
    currentLocationId: input.currentLocationId,
    currentTime: input.currentTime,
    publicOpportunities: input.publicOpportunities ?? [],
    programActions: input.programActions,
  });
}

function sanitizeField(value: string): string {
  return value.replace(/[|｜\n]/g, ' ').trim();
}

export function serializeChecklistToTags(checklist: SceneChecklist, existing?: {
  hasObserve?: boolean;
  hasInvestigate?: boolean;
  hasAction?: boolean;
}): string {
  const blocks: string[] = [];
  if (!existing?.hasObserve && checklist.observe) {
    blocks.push(`<observe>\n${checklist.observe}\n</observe>`);
  }
  if (!existing?.hasInvestigate && checklist.investigateItems.length > 0) {
    const lines = checklist.investigateItems.map(item => {
      const fields: Array<string | number> = [sanitizeField(item.desc), sanitizeField(item.suspect), sanitizeField(item.style), sanitizeField(item.time), item.stamina, item.sanity];
      const metadata = encodeChecklistMetadata(item);
      if (metadata) fields.push(metadata);
      return fields.join('|');
    });
    blocks.push(`<investigate>\n${lines.join('\n')}\n</investigate>`);
  }
  if (!existing?.hasAction && checklist.actionItems.length > 0) {
    const lines = checklist.actionItems.map(item => {
      const fields: Array<string | number> = [sanitizeField(item.desc), sanitizeField(item.style), sanitizeField(item.time), item.stamina, item.sanity];
      const metadata = encodeChecklistMetadata(item);
      if (metadata) fields.push(metadata);
      return fields.join('|');
    });
    blocks.push(`<action>\n${lines.join('\n')}\n</action>`);
  }
  return blocks.join('\n');
}

export function mergeSceneChecklist(prev: Scene, checklist: SceneChecklist): Scene {
  return {
    ...prev,
    observe: prev.observe || checklist.observe,
    investigateItems: prev.investigateItems?.length ? prev.investigateItems : checklist.investigateItems,
    actionItems: prev.actionItems?.length ? prev.actionItems : checklist.actionItems,
  };
}

/** 把补全标签插入 assistant 消息 content 的 </maintext> 之前，保证重载反解可见 */
export function insertTagsIntoMaintext(content: string, tags: string): string {
  if (!tags.trim()) return content;
  const closeIndex = content.lastIndexOf('</maintext>');
  if (closeIndex < 0) return content;
  return `${content.slice(0, closeIndex)}\n${tags}\n${content.slice(closeIndex)}`;
}
