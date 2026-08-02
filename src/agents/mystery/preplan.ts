import { prepareMysteryTurn } from './orchestrator';
import type { PreparedMysteryTurn, PrepareMysteryTurnOptions } from './orchestrator';

export type PreplanRunner = (options: PrepareMysteryTurnOptions) => Promise<PreparedMysteryTurn>;

export interface PreplanRequest {
  /** 预测的玩家输入（通常是当前场景的第一个选项） */
  input: string;
  /** 编排上下文指纹，任一要素变化即视为失效（cycle/location/route/chat/mode 等） */
  contextKey: string;
  options: Omit<PrepareMysteryTurnOptions, 'abortSignal' | 'speculative'>;
}

interface PreplanSlot {
  input: string;
  contextKey: string;
  controller: AbortController;
  promise: Promise<PreparedMysteryTurn>;
}

// 单槽位：只预跑最可能的一个输入，避免并发浪费额度
let slot: PreplanSlot | null = null;

export function normalizePreplanInput(input: string): string {
  return input.trim();
}

/** 启动后台预规划；会先作废旧的预规划任务。 */
export function startPreplan(request: PreplanRequest, run: PreplanRunner = prepareMysteryTurn): void {
  invalidatePreplans();
  const controller = new AbortController();
  const promise = run({
    ...request.options,
    abortSignal: controller.signal,
    speculative: true,
  });
  promise.catch(() => { /* 失败留给 consume 时兜底，避免 unhandled rejection */ });
  slot = {
    input: normalizePreplanInput(request.input),
    contextKey: request.contextKey,
    controller,
    promise,
  };
}

/**
 * 玩家实际输入到达时尝试复用预规划结果。
 * 输入或上下文不匹配、或预规划失败时返回 null（并作废旧任务），调用方应重新编排。
 */
export async function consumePreplan(input: string, contextKey: string): Promise<PreparedMysteryTurn | null> {
  const current = slot;
  if (!current) return null;
  if (current.input !== normalizePreplanInput(input) || current.contextKey !== contextKey) {
    invalidatePreplans();
    return null;
  }
  slot = null;
  try {
    return await current.promise;
  } catch {
    return null;
  }
}

/** 作废并中止所有预规划任务（reroll / 轮回重置 / 会话切换 / 新回合开始时调用）。 */
export function invalidatePreplans(): void {
  if (!slot) return;
  try { slot.controller.abort(); } catch { /* ignore */ }
  slot = null;
}

export function hasPendingPreplan(): boolean {
  return slot !== null;
}
