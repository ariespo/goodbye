import type { ApiConfig, ChatCompletionMessage } from '../../sillytavern/api-router';
import { callSecondaryApi } from '../../sillytavern/api-router';
import type { ChatPreset, Scene } from '../../sillytavern/types';
import { translateForDirector } from '../../engine/variable-thresholds';
import { SCENE_CHECKLIST_RESPONSE_FORMAT } from './schemas';
import { completeStructured, extractJson } from './structured';
import type { AgentCompletion } from './structured';
import type { DirectorScenePlan } from './types';

export interface SceneChecklistItem {
  desc: string;
  suspect: string;
  style: string;
  time: string;
  stamina: number;
  sanity: number;
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

export interface SceneListInput {
  maintext: string;
  scenePlan?: DirectorScenePlan | null;
  currentLocation?: string | null;
  previousScene?: Pick<Scene, 'observe' | 'investigateItems' | 'actionItems'> | null;
  variables?: Record<string, unknown>;
}

export function buildSceneListMessages(input: SceneListInput): ChatCompletionMessage[] {
  const sections = [`[本回合剧情正文]\n${input.maintext}`];
  if (input.currentLocation) sections.push(`[当前地点]\n${input.currentLocation}`);
  if (input.scenePlan) sections.push(`[导演场景意图]\n${JSON.stringify(input.scenePlan, null, 2)}`);
  if (input.previousScene && (input.previousScene.observe || input.previousScene.investigateItems?.length || input.previousScene.actionItems?.length)) {
    sections.push(`[上一份清单]\n${JSON.stringify({
      observe: input.previousScene.observe ?? '',
      investigateItems: input.previousScene.investigateItems ?? [],
      actionItems: input.previousScene.actionItems ?? [],
    }, null, 2)}`);
  }
  if (input.variables) sections.push(`[状态指令]\n${translateForDirector(input.variables)}`);
  return [
    { role: 'system', content: SCENE_LIST_SYSTEM_PROMPT },
    { role: 'user', content: `请生成本回合的场景清单。\n\n${sections.join('\n\n')}` },
  ];
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
  const text = await completeStructured(
    complete,
    supportKey,
    buildSceneListMessages(input),
    { temperature: 0.4, maxTokens: 1200 },
    SCENE_CHECKLIST_RESPONSE_FORMAT,
  );
  return parseSceneChecklist(text);
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
    const lines = checklist.investigateItems.map(item =>
      [sanitizeField(item.desc), sanitizeField(item.suspect), sanitizeField(item.style), sanitizeField(item.time), item.stamina, item.sanity].join('|'));
    blocks.push(`<investigate>\n${lines.join('\n')}\n</investigate>`);
  }
  if (!existing?.hasAction && checklist.actionItems.length > 0) {
    const lines = checklist.actionItems.map(item =>
      [sanitizeField(item.desc), sanitizeField(item.style), sanitizeField(item.time), item.stamina, item.sanity].join('|'));
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
