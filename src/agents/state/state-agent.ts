import { getMaxOutputTokens } from '../../sillytavern/token-budget';
import type { ChatPreset, DynamicRecord, GameStatus } from '../../sillytavern/types';
import {
  callSecondaryApi,
  type ApiConfig,
  type ChatCompletionMessage,
  type ResponseFormat,
} from '../../sillytavern/api-router';
import { sanitizeVarsPatch, type SanitizeResult } from '../../sillytavern/vars-validator';
import { getVariablePath, setVariablePath } from '../../sillytavern/vars-merger';
import { completeStructured, extractJson } from '../mystery/structured';
import { LOOP_PACING_CONTRACT } from '../mystery/loop-contract';
import type { StateEvidenceAuthority } from './state-evidence';

export interface StateEvidence {
  path: string;
  quote: string;
  reason?: string;
  evidenceId?: string;
}

export interface StateAgentResponse {
  summary?: string;
  patch: DynamicRecord;
  evidence: StateEvidence[];
}

export interface ValidatedStateAgentResult extends SanitizeResult {
  summary: string | null;
}

export interface RunStateAgentOptions {
  api: ApiConfig;
  preset: ChatPreset | null;
  currentVariables: DynamicRecord;
  gameStatus: GameStatus;
  playerInput: string;
  narrative: string;
  evidenceAuthority?: StateEvidenceAuthority;
  deterministicCosts?: {
    timeMinutes?: number;
    stamina?: number;
    sanity?: number;
  };
  saturationPivot?: {
    blockedActorId: string;
    redirectedActorId: string;
    requiredSuspicionGain: number;
  };
  abortSignal?: AbortSignal;
}

const STATE_RESPONSE_FORMAT: ResponseFormat = { type: 'json_object' };

const STATE_AGENT_SYSTEM_PROMPT = `${LOOP_PACING_CONTRACT}

你是独立的游戏 State Agent。玩家输入只是行动意图，你只结算本回合正文明确发生的结果，不续写剧情，不推测隐藏真相。

只返回一个 JSON 对象：
{
  "summary": "一句话客观总结",
  "patch": { "发生变化后的变量绝对值": "..." },
  "evidence": [
    { "path": "与 patch 叶节点完全一致的路径", "quote": "从正文原样复制的短句", "evidenceId": "嫌疑增长必填的程序授权 ID", "reason": "该短句为何证明此变化" }
  ]
}

规则：
- 每个 patch 叶节点必须有一条同 path 的 evidence；quote 必须是正文中的原文。playerInput 只是尝试和意图，不能证明事情发生。
- 增加 suspicion 必须引用 evidenceAuthority.newEvidence 中的 evidenceId（如 fact:F001），且角色必须属于该项 actorIds；没有新的程序授权证据就不得增加嫌疑。引文同时必须出现在该授权项 text 中。
- 只记录正文明确发生的变化。没有证据就不要改。
- 纯氛围、眼神、停顿、玩家主观猜测或同一证据的重复叙述，不足以支持新的决定性嫌疑增长。
- 固定行动成本由游戏引擎另行扣除，不要在 patch 中重复扣除。
- 可写字段：stamina、sanity、location、suspicion.*、affinity.*、investigation.*、
  organizedClues。
- 禁止写入：time、cycleCount、stayStreak、stayedEver、routesLockedEver、endingsSeen、
  knowledgeEvents、playerNameKnownByNpcIds、mysteryKnowledge、unlockedClues、deathNews、tripProgress、cultClues、
  worldGlitchClues、fakeEvidence、letterFragments、lockedRoute、overlay、finalChoice。
- 数值写变化后的绝对值；数组只增不减；路线指认、解释层和最终选择只由玩家界面与游戏程序写入。
- 如果请求中有 saturationPivot，且正文确实落地该转场：绝对禁止增加 blockedActorId 的嫌疑；必须把 redirectedActorId 的嫌疑在当前值基础上增加 requiredSuspicionGain。该增量来自程序已审查的线索归属，不得转给其他角色。
- 路线碎片、假死证据、隐藏层线索和行程进度由事实门在正文生成后另行结算，不要写入。
- 不要使用 Markdown 代码块。`;

function flatten(
  patch: DynamicRecord,
  prefix = '',
  result: DynamicRecord = {},
): DynamicRecord {
  for (const [key, value] of Object.entries(patch)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      flatten(value as DynamicRecord, path, result);
    } else {
      result[path] = value;
    }
  }
  return result;
}

function normalizeQuote(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

const STATE_AGENT_FORBIDDEN_ROOTS = new Set([
  'time',
  'cycleCount',
  'stayStreak',
  'stayedEver',
  'routesLockedEver',
  'endingsSeen',
  'knowledgeEvents',
  'playerNameKnownByNpcIds',
  'mysteryKnowledge',
  'unlockedClues',
  'deathNews',
  'tripProgress',
  'cultClues',
  'worldGlitchClues',
  'fakeEvidence',
  'letterFragments',
  'lockedRoute',
  'overlay',
  'finalChoice',
  'loopSuspicionStart',
  'worldMemory',
]);

export function validateStateAgentResponse(
  response: StateAgentResponse,
  currentVariables: DynamicRecord,
  evidenceText: string,
  saturationPivot?: RunStateAgentOptions['saturationPivot'],
  evidenceAuthority?: StateEvidenceAuthority,
): ValidatedStateAgentResult {
  const rejected: SanitizeResult['rejected'] = [];
  const normalizedSource = normalizeQuote(evidenceText);
  const evidenceByPath = new Map(
    (Array.isArray(response.evidence) ? response.evidence : [])
      .filter(item => item && typeof item.path === 'string' && typeof item.quote === 'string')
      .map(item => [item.path, item] as const),
  );

  let evidencedPatch: DynamicRecord = {};
  for (const [path, value] of Object.entries(flatten(response.patch ?? {}))) {
    const root = path.split('.')[0];
    if (STATE_AGENT_FORBIDDEN_ROOTS.has(root)) {
      rejected.push({ path, reason: '该字段由游戏程序或事实门维护，State Agent 无权写入' });
      continue;
    }

    const evidence = evidenceByPath.get(path);
    const quote = normalizeQuote(evidence?.quote ?? '');
    if (!quote) {
      rejected.push({ path, reason: '缺少同路径的原文证据' });
      continue;
    }
    if (Array.from(quote).length < 4) {
      rejected.push({ path, reason: '证据引文过短，无法唯一支持状态变化' });
      continue;
    }
    if (!normalizedSource.includes(quote)) {
      rejected.push({ path, reason: '证据引文不在本回合正文中' });
      continue;
    }
    if (path.startsWith('suspicion.')
      && Number(value) > Number(getVariablePath(currentVariables, path) ?? 0)) {
      const actorId = path.slice('suspicion.'.length);
      const authorized = evidenceAuthority?.newEvidence.find(item => item.id === evidence?.evidenceId
        && item.actorIds.includes(actorId) && normalizeQuote(item.text).includes(quote));
      if (!authorized) {
        rejected.push({ path, reason: '嫌疑增长缺少归属于该角色的新程序授权事实证据' });
        continue;
      }
    }
    evidencedPatch = setVariablePath(evidencedPatch, path, value);
  }

  const sanitized = sanitizeVarsPatch(evidencedPatch, currentVariables);
  if (saturationPivot) {
    const blockedPath = `suspicion.${saturationPivot.blockedActorId}`;
    const redirectedPath = `suspicion.${saturationPivot.redirectedActorId}`;
    // 线索归属由事实门和硬审查确定，不再信任模型自行挑选状态目标。
    delete sanitized.vars[blockedPath];
    const current = Number(getVariablePath(currentVariables, redirectedPath) ?? 0);
    const deterministic = sanitizeVarsPatch({
      suspicion: { [saturationPivot.redirectedActorId]: current + saturationPivot.requiredSuspicionGain },
    }, currentVariables);
    sanitized.vars[redirectedPath] = deterministic.vars[redirectedPath];
    sanitized.clamped.push(...deterministic.clamped);
  }
  return {
    summary: typeof response.summary === 'string' && response.summary.trim()
      ? response.summary.trim()
      : null,
    vars: sanitized.vars,
    rejected: [...rejected, ...sanitized.rejected],
    clamped: sanitized.clamped,
  };
}

function parseStateAgentResponse(text: string): StateAgentResponse {
  const value = extractJson(text);
  if (!value || typeof value !== 'object') throw new Error('State Agent 返回值不是对象。');
  const candidate = value as Partial<StateAgentResponse>;
  if (!candidate.patch || typeof candidate.patch !== 'object' || Array.isArray(candidate.patch)) {
    throw new Error('State Agent 缺少 patch 对象。');
  }
  if (!Array.isArray(candidate.evidence)) {
    throw new Error('State Agent 缺少 evidence 数组。');
  }
  return candidate as StateAgentResponse;
}

export async function runStateAgent(options: RunStateAgentOptions): Promise<ValidatedStateAgentResult> {
  const messages: ChatCompletionMessage[] = [
    { role: 'system', content: STATE_AGENT_SYSTEM_PROMPT },
    {
      role: 'user',
      content: JSON.stringify({
        currentState: {
          variables: projectWritableState(options.currentVariables),
          gameStatus: {
            time: options.gameStatus.time.toISOString(),
            stamina: options.gameStatus.stamina,
            sanity: options.gameStatus.sanity,
          },
        },
        deterministicCostsHandledByEngine: options.deterministicCosts ?? {},
        playerInput: options.playerInput,
        narrative: options.narrative,
        evidenceAuthority: options.evidenceAuthority ?? { newEvidence: [] },
        saturationPivot: options.saturationPivot ?? null,
      }, null, 2),
    },
  ];
  const complete = (
    requestMessages: ChatCompletionMessage[],
    callOptions?: {
      temperature?: number;
      maxTokens?: number;
      abortSignal?: AbortSignal;
      responseFormat?: ResponseFormat;
    },
  ) => callSecondaryApi(
    options.api,
    requestMessages,
    options.preset,
    {
      ...callOptions,
      abortSignal: options.abortSignal ?? callOptions?.abortSignal,
    },
  );
  const text = await completeStructured(
    complete,
    `state|${options.api.baseUrl}|${options.api.model}`,
    messages,
    { temperature: 0, maxTokens: getMaxOutputTokens(options.preset), abortSignal: options.abortSignal },
    STATE_RESPONSE_FORMAT,
  );
  const response = parseStateAgentResponse(text);
  return validateStateAgentResponse(
    response,
    options.currentVariables,
    options.narrative,
    options.saturationPivot,
    options.evidenceAuthority,
  );
}

export function projectWritableState(variables: DynamicRecord): DynamicRecord {
  const paths = [
    'stamina', 'sanity', 'location', 'organizedClues',
    ...['old-man', 'detective-a', 'detective-b', 'self', 'clerk', 'teacher', 'senpai'].map(id => `suspicion.${id}`),
    ...['fumi', 'touko'].map(id => `affinity.${id}`),
    ...['psych', 'crime', 'occult', 'science'].map(id => `investigation.${id}`),
  ];
  let projected: DynamicRecord = {};
  for (const path of paths) {
    const value = getVariablePath(variables, path);
    if (value !== undefined) projected = setVariablePath(projected, path, value);
  }
  return projected;
}
