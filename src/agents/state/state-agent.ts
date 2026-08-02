import type { ChatPreset, GameStatus } from '../../sillytavern/types';
import {
  callSecondaryApi,
  type ApiConfig,
  type ChatCompletionMessage,
  type ResponseFormat,
} from '../../sillytavern/api-router';
import { sanitizeVarsPatch, type SanitizeResult } from '../../sillytavern/vars-validator';
import { setVariablePath } from '../../sillytavern/vars-merger';
import { completeStructured, extractJson } from '../mystery/structured';

export interface StateEvidence {
  path: string;
  quote: string;
  reason?: string;
}

export interface StateAgentResponse {
  summary?: string;
  patch: Record<string, any>;
  evidence: StateEvidence[];
}

export interface ValidatedStateAgentResult extends SanitizeResult {
  summary: string | null;
}

export interface RunStateAgentOptions {
  api: ApiConfig;
  preset: ChatPreset | null;
  currentVariables: Record<string, any>;
  gameStatus: GameStatus;
  playerInput: string;
  narrative: string;
  deterministicCosts?: {
    timeMinutes?: number;
    stamina?: number;
    sanity?: number;
  };
  abortSignal?: AbortSignal;
}

const STATE_RESPONSE_FORMAT: ResponseFormat = { type: 'json_object' };

const STATE_AGENT_SYSTEM_PROMPT = `你是独立的游戏 State Agent。你只分析已经发生的玩家输入和本回合正文，不续写剧情，不推测隐藏真相。

只返回一个 JSON 对象：
{
  "summary": "一句话客观总结",
  "patch": { "发生变化后的变量绝对值": "..." },
  "evidence": [
    { "path": "与 patch 叶节点完全一致的路径", "quote": "从玩家输入或正文原样复制的短句", "reason": "该短句为何证明此变化" }
  ]
}

规则：
- 每个 patch 叶节点必须有一条同 path 的 evidence；quote 必须是输入或正文中的原文。
- 只记录正文明确发生的变化。没有证据就不要改。
- 固定行动成本由游戏引擎另行扣除，不要在 patch 中重复扣除。
- 可写字段：stamina、sanity、location、suspicion.*、affinity.*、investigation.*、
  organizedClues。
- 禁止写入：time、cycleCount、stayStreak、stayedEver、routesLockedEver、endingsSeen、
  knowledgeEvents、mysteryKnowledge、unlockedClues、deathNews、tripProgress、cultClues、
  worldGlitchClues、fakeEvidence、letterFragments、lockedRoute、overlay、finalChoice。
- 数值写变化后的绝对值；数组只增不减；路线指认、解释层和最终选择只由玩家界面与游戏程序写入。
- 路线碎片、假死证据、隐藏层线索和行程进度由事实门在正文生成后另行结算，不要写入。
- 不要使用 Markdown 代码块。`;

function flatten(
  patch: Record<string, any>,
  prefix = '',
  result: Record<string, any> = {},
): Record<string, any> {
  for (const [key, value] of Object.entries(patch)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      flatten(value, path, result);
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
]);

export function validateStateAgentResponse(
  response: StateAgentResponse,
  currentVariables: Record<string, any>,
  evidenceText: string,
): ValidatedStateAgentResult {
  const rejected: SanitizeResult['rejected'] = [];
  const normalizedSource = normalizeQuote(evidenceText);
  const evidenceByPath = new Map(
    (Array.isArray(response.evidence) ? response.evidence : [])
      .filter(item => item && typeof item.path === 'string' && typeof item.quote === 'string')
      .map(item => [item.path, item] as const),
  );

  let evidencedPatch: Record<string, any> = {};
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
      rejected.push({ path, reason: '证据引文不在玩家输入或本回合正文中' });
      continue;
    }
    evidencedPatch = setVariablePath(evidencedPatch, path, value);
  }

  const sanitized = sanitizeVarsPatch(evidencedPatch, currentVariables);
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
          variables: options.currentVariables,
          gameStatus: {
            time: options.gameStatus.time.toISOString(),
            stamina: options.gameStatus.stamina,
            sanity: options.gameStatus.sanity,
          },
        },
        deterministicCostsHandledByEngine: options.deterministicCosts ?? {},
        playerInput: options.playerInput,
        narrative: options.narrative,
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
    { temperature: 0, maxTokens: 1200, abortSignal: options.abortSignal },
    STATE_RESPONSE_FORMAT,
  );
  const response = parseStateAgentResponse(text);
  return validateStateAgentResponse(
    response,
    options.currentVariables,
    `${options.playerInput}\n${options.narrative}`,
  );
}
