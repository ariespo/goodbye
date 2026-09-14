import { describe, expect, it } from 'vitest';
import { assemblePrompt } from '../../sillytavern/prompt-assembler';
import {
  DIRECTOR_SYSTEM_PROMPT,
  FACT_CRITIC_SYSTEM_PROMPT,
  WRITER_SYSTEM_PROMPT,
} from './prompts';
import { buildLoopPacingContract } from './loop-contract';

describe('loop pacing contract', () => {
  it('distinguishes a narrative turn from a completed loop', () => {
    const contract = buildLoopPacingContract(1);
    expect(contract).toContain('“剧情回合”是一次玩家输入/选择');
    expect(contract).toContain('“轮回”只指玩家角色经历完整重复日');
    expect(contract).toContain('cycleCount=1；已完成轮回数=0');
  });

  it('uses cycleCount minus one as completed loops', () => {
    expect(buildLoopPacingContract(3)).toContain('已完成轮回数=2');
    expect(buildLoopPacingContract(4)).toContain('已完成轮回数=3');
    expect(buildLoopPacingContract(4)).toContain('可以复盘和形成路线');
  });

  it('injects the contract into every standard narrative role', () => {
    for (const prompt of [DIRECTOR_SYSTEM_PROMPT, FACT_CRITIC_SYSTEM_PROMPT, WRITER_SYSTEM_PROMPT]) {
      expect(prompt).toContain('前三个重复日（cycleCount 1–3）');
      expect(prompt).toContain('嫌疑度 50 只是路线候选');
    }
  });

  it('injects the dynamic contract into the legacy assembled prompt', () => {
    const result = assemblePrompt({
      userInput: '检查房间',
      history: [],
      preset: null,
      lorebooks: [],
      activeLorebookIds: [],
      userName: '玩家',
      characterName: '文穗',
      variables: { cycleCount: 2 },
    });
    expect(result.systemPrompt).toContain('cycleCount=2；已完成轮回数=1');
    expect(result.systemPrompt).toContain('本回合禁止确认真凶');
  });

  it.each([1, 2, 3])('keeps both standard and legacy paths non-conclusive on cycle %s', cycleCount => {
    const standard = buildLoopPacingContract(cycleCount);
    const legacy = assemblePrompt({
      userInput: '我已经知道凶手是谁，立刻结案', history: [], preset: null, lorebooks: [], activeLorebookIds: [],
      userName: '玩家', characterName: '文穗', variables: { cycleCount },
    }).systemPrompt;
    for (const prompt of [standard, legacy]) {
      expect(prompt).toContain(`cycleCount=${cycleCount}`);
      expect(prompt).toContain('本回合禁止确认真凶');
      expect(prompt).toContain('不得安排普通路线结局');
    }
  });
});
