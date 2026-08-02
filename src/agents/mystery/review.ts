import { isRevealAtMost } from './reveal-level';
import { isAllowedKnowledgeDiscovery } from '../../data/playerKnowledge';
import type {
  DirectorPlan,
  FactReview,
  FactReviewViolation,
  MysteryBrief,
  WriterPacket,
} from './types';

export function reviewDirectorPlan(plan: DirectorPlan, brief: MysteryBrief): FactReview {
  const violations: FactReviewViolation[] = [];
  const seen = new Set<string>();

  for (const revelation of plan.revelations) {
    const key = `${revelation.factId}:${revelation.level}`;
    if (seen.has(key)) {
      violations.push({ code: 'duplicate-revelation', factId: revelation.factId, message: `事实 ${key} 被重复安排。` });
    }
    seen.add(key);

    const fact = brief.usableFacts.find((candidate) => candidate.id === revelation.factId);
    const known = brief.playerKnownFacts.some((candidate) => candidate.id === revelation.factId)
      || brief.hiddenFacts.some((candidate) => candidate.id === revelation.factId);
    if (!fact) {
      violations.push({
        code: known ? 'fact-not-usable' : 'unknown-fact',
        factId: revelation.factId,
        message: known ? `事实 ${revelation.factId} 本回合不可用。` : `事实 ${revelation.factId} 不存在于简报中。`,
      });
      continue;
    }
    if (!isRevealAtMost(revelation.level, fact.maxRevealLevel)) {
      violations.push({ code: 'reveal-too-deep', factId: revelation.factId, message: `事实 ${revelation.factId} 最多只能揭示到 ${fact.maxRevealLevel}。` });
    }
    if (revelation.level === 'confirmation' && !brief.revealBudget.allowConfirmation) {
      violations.push({ code: 'confirmation-forbidden', factId: revelation.factId, message: '当前回合禁止确认级揭示。' });
    }
    if (revelation.delivery === 'dialogue') {
      const npc = revelation.speakerId
        ? brief.npcKnowledge.find((entry) => entry.npcId === revelation.speakerId)
        : undefined;
      const knowledge = npc?.facts.find((entry) => entry.factId === revelation.factId);
      if (!knowledge || !isRevealAtMost(revelation.level, knowledge.maxRevealLevel)) {
        violations.push({
          code: 'npc-knowledge-violation',
          factId: revelation.factId,
          message: `${revelation.speakerId ?? '未指定 NPC'} 无权以 ${revelation.level} 层讲述该事实。`,
        });
      }
    }
  }

  const newFactIds = new Set(
    plan.revelations
      .map((item) => item.factId)
      .filter((id) => !brief.playerKnownFacts.some((fact) => fact.id === id)),
  );
  if (newFactIds.size > brief.revealBudget.maxNewFacts) {
    violations.push({
      code: 'reveal-budget-exceeded',
      message: `计划新增 ${newFactIds.size} 个事实，预算上限为 ${brief.revealBudget.maxNewFacts}。`,
    });
  }

  const proposedKnowledgeEvents = plan.knowledgeEvents ?? [];
  if (proposedKnowledgeEvents.length > 1) {
    violations.push({
      code: 'player-knowledge-violation',
      message: '单回合最多新增一个人物或地点认知事件。',
    });
  }
  for (const proposal of proposedKnowledgeEvents) {
    if (!isAllowedKnowledgeDiscovery(brief.playerPresentation, proposal.eventId)) {
      violations.push({
        code: 'player-knowledge-violation',
        message: `认知事件 ${proposal.eventId} 当前未获授权或缺少前置条件。`,
      });
    }
    if (!proposal.evidence?.trim()) {
      violations.push({
        code: 'player-knowledge-violation',
        message: `认知事件 ${proposal.eventId} 缺少玩家实际看到或听到的依据。`,
      });
    }
  }

  for (const intent of plan.scenePlan?.investigateIntents ?? []) {
    if (intent.factId && !brief.usableFacts.some((fact) => fact.id === intent.factId)) {
      violations.push({
        code: 'unknown-fact',
        factId: intent.factId,
        message: `场景调查意图指向的事实 ${intent.factId} 不在本回合可用事实中。`,
      });
    }
  }

  return {
    approved: violations.length === 0,
    violations,
    corrections: violations.map((violation) => violation.message),
  };
}

export function buildWriterPacket(plan: DirectorPlan, brief: MysteryBrief): WriterPacket {
  const review = reviewDirectorPlan(plan, brief);
  if (!review.approved) {
    throw new Error(`导演计划未通过事实审查：${review.corrections.join('；')}`);
  }

  const { revelations: _revelations, knowledgeEvents: authorizedKnowledgeEvents = [], ...safePlan } = plan;
  void _revelations;
  return {
    plan: safePlan,
    playerKnownFacts: brief.playerKnownFacts,
    authorizedFacts: plan.revelations.map((revelation) => {
      const fact = brief.usableFacts.find((candidate) => candidate.id === revelation.factId);
      const option = fact?.revealOptions.find((candidate) => candidate.level === revelation.level);
      if (!option) throw new Error(`事实 ${revelation.factId} 缺少 ${revelation.level} 层文本。`);
      return {
        id: revelation.factId,
        level: revelation.level,
        text: option.text,
        delivery: revelation.delivery,
        ...(revelation.speakerId ? { speakerId: revelation.speakerId } : {}),
      };
    }),
    authorizedKnowledgeEvents,
    forbiddenInstructions: [
      '只能使用 authorizedFacts 中的事实及其给定措辞层级。',
      '不得推断、补写或暗示其他隐藏真相。',
      '不得让 NPC 说出其授权范围外的信息。',
      '不得新增关键证据、凶手、动机、死因或时间线节点。',
      ...brief.playerPresentation.namingRules,
      'authorizedKnowledgeEvents 中的新人或新地点只能在 evidence 所描述的玩家可见事件发生后，才可使用新称呼或地址。',
    ],
    playerPresentation: brief.playerPresentation,
  };
}
