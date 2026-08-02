import { callSecondaryApi } from './api-router';
import type { ApiSettings, ChatPreset, ParsedContent } from './types';

export const SECONDARY_SYSTEM_PROMPT = `你是游戏状态分析助手。基于下面的回合剧情,仅输出两个标签,不写任何正文或解释:
<sum>本回合一句话总结</sum>
<vars>{ "变量名": 值, ... }</vars>

要求:
- vars 中只包含本回合发生变化的字段,写变化后的绝对值
- 可用字段(白名单,其余字段会被程序拒绝):
  stamina(0-120) / sanity(0-100) / time / location / tripProgress(行程还原0-100)
  suspicion: { "old-man" | "detective-a" | "detective-b" | "self" | "clerk" | "teacher" | "senpai": 数值 }
  affinity: { "fumi" | "touko": 0-100 }
  unlockedClues / organizedClues / cultClues / worldGlitchClues / fakeEvidence / letterFragments(字符串数组,只增不减)
  lockedRoute("A"|"B"|"C"|"NONE"|"FAKE",需怀疑度/证据达标才会被接受) / overlay("CULT"|"PSYCH") / finalChoice
- 数值单回合变化有限幅(怀疑度/好感度±15,体力±30),超限会被程序截断
- 禁止写入: cycleCount、stayStreak、stayedEver、routesLockedEver、knowledgeEvents(程序专有)
- vars 必须是合法 JSON 对象
- 如果回合内没有数值变化,可以输出空对象 <vars>{}</vars>`;

export type SecondaryAugmentResult =
  | { status: 'skipped' }
  | { status: 'ok' }
  | { status: 'error'; message: string };

/**
 * 主 API 完成后,如配置了次 API,用次 API 补 sum/vars。
 * 直接就地修改 parsed 的 summary/vars。
 */
export async function augmentWithSecondary(
  secondary: ApiSettings['secondary'],
  preset: ChatPreset | null,
  parsed: ParsedContent,
  fallbackText: string,
): Promise<SecondaryAugmentResult> {
  if (!secondary?.enabled || !secondary.apiKey || !secondary.baseUrl) return { status: 'skipped' };

  try {
    const result = await callSecondaryApi(
      { baseUrl: secondary.baseUrl, apiKey: secondary.apiKey, model: secondary.model },
      [
        { role: 'system', content: SECONDARY_SYSTEM_PROMPT },
        { role: 'user', content: parsed.maintext || fallbackText },
      ],
      preset,
      { temperature: secondary.temperature, maxTokens: secondary.maxTokens }
    );

    const sumMatch = result.match(/<sum>([\s\S]*?)<\/sum>/);
    if (sumMatch) parsed.summary = sumMatch[1].trim();

    const varsMatch = result.match(/<vars>([\s\S]*?)<\/vars>/);
    if (varsMatch) {
      try {
        const v = JSON.parse(varsMatch[1].trim());
        if (v && typeof v === 'object') parsed.vars = { ...parsed.vars, ...v };
      } catch {
        // 解析失败忽略
      }
    }

    return { status: 'ok' };
  } catch (e) {
    return { status: 'error', message: e instanceof Error ? e.message : String(e) };
  }
}
