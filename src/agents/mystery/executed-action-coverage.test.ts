import { describe, expect, it } from 'vitest';
import { resolveAction, type ResolveActionInput } from '../../engine/action-resolution';
import { buildNarrativeFactCriticUserPrompt, buildNarrativeRepairPrompt, buildWriterSystemPrompt, buildWriterUserPrompt, DIRECTOR_SYSTEM_PROMPT } from './prompts';
import type { WriterPacket } from './types';

const input: ResolveActionInput = {
  id: 'inquiry', cycleCount: 1, startTime: '2024-09-09T08:00:00', currentLocationId: 'home', stamina: 100, sanity: 70,
  steps: [{ id: 'q', kind: 'inquiry', scope: 'normal', locationId: 'school', completionSourceIds: ['fact:F001:clue'] }],
};
function packet(explicitBudgetMinutes?: number): WriterPacket {
  return {
    resolvedAction: resolveAction({ ...input, explicitBudgetMinutes }),
    plan: { turnGoal: '问询', tone: '克制', timeCostMinutes: 1, beats: [], assetRequests: [], optionIntents: [] },
    authorizedFacts: [], playerKnownFacts: [], authorizedKnowledgeEvents: [], authorizedBackgroundFacts: [],
    approvedBackgroundFactProposals: [], forbiddenInstructions: [], characterPerformances: [],
    playerPresentation: {} as WriterPacket['playerPresentation'],
  };
}
function prompts(authority: WriterPacket) {
  return [buildWriterUserPrompt(authority, {}), buildNarrativeFactCriticUserPrompt(authority, '<maintext>问答</maintext>'),
    buildNarrativeRepairPrompt(authority, '<maintext>问答</maintext>', {
      approved: false, violations: [{ code: 'scene-contract-violation', message: '55分钟问询缺少持续过程。' }], corrections: ['补足当下问询过程。'],
    })];
}
function resolutionIn(prompt: string): WriterPacket['resolvedAction'] {
  return JSON.parse(prompt.match(/\[WriterPacket\]\n([^\n]+)/)![1]).resolvedAction;
}

describe('time-aware planning with existing action authority and prompt contracts', () => {
  it('gives Writer, final critic and repair actual travel/work costs with the process requirement', () => {
    for (const prompt of prompts(packet())) {
      expect(resolutionIn(prompt)).toMatchObject({ executedMinutes: 65, startTime: '2024-09-09T08:00:00', endTime: '2024-09-09T09:05:00',
        segments: [ { step: { kind: 'travel' }, executedMinutes: 10, completed: true },
          { step: { kind: 'inquiry', scope: 'normal', locationId: 'school' }, executedMinutes: 55, completed: true } ] });
      expect(prompt).toContain('不能只有一问一答后声称“55分钟过去了”');
      expect(prompt).toContain('时间推进、持续活动和授权结果或局限');
      expect(prompt).toContain('旅行、工作、等待/休息分别落实');
      expect(prompt).toContain('不输出内部检查或推理');
      expect(prompt).toContain('不得虚构线索、记录、历史、身份或承诺来填时间');
      expect(prompt).toContain('不按固定字数、行数或逐分钟检查');
    }
    expect(prompts(packet())[2]).toContain('不禁止符合 resolvedAction 且不产生新事实的当下工作概述');
  });

  it('keeps partial execution and withheld rewards in the same packet and limits the process to current work', () => {
    for (const prompt of prompts(packet(25))) {
      expect(resolutionIn(prompt)).toMatchObject({ executedMinutes: 25, completedSourceIds: [],
        segments: [ { executedMinutes: 10, completed: true },
          { executedMinutes: 15, cumulativeExecutedMinutes: 15, plannedMinutes: 55, completed: false } ] });
      expect(prompt).toContain('本次 executedMinutes>0');
      expect(prompt).toContain('短暂的部分工作只写实际进展');
      expect(prompt).toContain('续作不重演此前时间');
      expect(prompt).toContain('零分钟事件仍按既有事件要求演出');
    }
  });

  it('keeps Director estimates subordinate to resolution and exempts auxiliary checklists from process coverage', () => {
    expect(DIRECTOR_SYSTEM_PROMPT).toContain('这里只提出可执行节拍，不自行确定实际耗时');
    expect(DIRECTOR_SYSTEM_PROMPT).toContain('不要输出内部检查过程或增加 JSON 字段');
    expect(buildWriterSystemPrompt()).toContain('在内部按 resolvedAction.segments 检查');
    expect(buildWriterSystemPrompt()).toContain('机械旁白复述答案充数');
    const prompt = buildNarrativeFactCriticUserPrompt(packet(), '<observe>学校门口</observe>', {
      mode: 'auxiliary', lines: [], possibleAudienceIds: [], activeCommitments: [], resolvedEndTime: '2024-09-09T09:05:00',
    });
    expect(prompt).toContain('本次是辅助清单审查，不检查行动演出覆盖');
    expect(prompt).not.toContain('行动时间与演出：');
    expect(resolutionIn(prompt)?.executedMinutes).toBe(65);
  });
});
