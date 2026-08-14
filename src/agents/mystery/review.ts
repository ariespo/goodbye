import { isRevealAtMost } from './reveal-level';
import { isAllowedKnowledgeDiscovery } from '../../data/playerKnowledge';
import type {
  DirectorPlan,
  FactReview,
  FactReviewViolation,
  MysteryBrief,
  WriterPacket,
} from './types';

function impliesConfession(description: string): boolean {
  if (/没有否认|不再(?:否认|反驳)|低头沉默|默认(?:承认)?/.test(description)) return true;
  const withoutExplicitDenials = description
    .replace(/(?:始终|仍然|仍|明确|坚决|一直)?不承认/g, '')
    .replace(/(?:两人|双方|他们|她|他)?(?:均|都)?未(?:曾|亲口)?承认/g, '')
    .replace(/拒绝承认/g, '')
    .replace(/否认/g, '')
    .replace(/要求.{0,16}承认/g, '');
  return /承认|坦白|招供|供述|说漏嘴|脱口而出|讲出.*经过|交代.*经过/.test(withoutExplicitDenials);
}

export function removeConfessionBySilence(plan: DirectorPlan, brief: MysteryBrief): DirectorPlan {
  const lyingNpcIds = new Set(brief.npcKnowledge
    .filter(entry => entry.facts.some(fact => fact.stance === 'lies-about'))
    .map(entry => entry.npcId));
  const authorizedConfirmations = plan.revelations
    .filter(revelation => revelation.level === 'confirmation')
    .map(revelation => {
      const fact = brief.usableFacts.find(item => item.id === revelation.factId);
      return fact?.revealOptions.find(option => option.level === 'confirmation')?.text;
    })
    .filter((text): text is string => !!text);
  const beats = plan.beats.flatMap(beat => {
    const implicated = beat.speakerIds?.some(id => lyingNpcIds.has(id)) && impliesConfession(beat.description);
    if (!implicated) return [beat];
    const carriesConfirmation = /确认|证据|指出|真相|完整行动|误杀|掩盖|移尸|伪装|凶手|杀害/.test(`${beat.purpose} ${beat.description}`);
    if (!carriesConfirmation || authorizedConfirmations.length === 0) return [];
    return [{
      ...beat,
      purpose: '由玩家以外部证据独立确认获准事实',
      description: `玩家只依据本回合已获准证据独立闭合结论：${authorizedConfirmations.join('；')}。在场嫌疑人不发言，也不描写其沉默、表情、动作或其他可被解释为承认的反应。`,
      speakerIds: [],
    }];
  });
  return { ...plan, beats };
}

export function ensureSaturationPivotOrder(plan: DirectorPlan, brief: MysteryBrief): DirectorPlan {
  const pivot = brief.saturationPivot;
  if (!pivot) return plan;
  const interventionIndex = plan.beats.findIndex(beat => beat.speakerIds?.includes(pivot.interveningNpcId));
  const hasOriginalFirst = plan.beats.slice(0, Math.max(0, interventionIndex)).some(beat => (
    pivot.blockedActorId === 'self'
      ? /自己|记忆|行动|复核/.test(`${beat.purpose} ${beat.description}`)
      : beat.speakerIds?.includes(pivot.blockedActorId)
  ));
  if (hasOriginalFirst) return plan;
  return {
    ...plan,
    beats: [{
      id: 'saturation-original-action',
      purpose: `先完整响应玩家对 ${pivot.blockedActorId} 的原调查`,
      description: pivot.blockedActorId === 'self'
        ? '玩家先按原意复核自己的记忆与行动；本段只落实调查行为，不获得新事实，也不增加原目标嫌疑。'
        : `玩家先按原意联系并调查 ${pivot.blockedActorId}；该角色只按公开身份和本回合获准知识作普通回应，不提供新事实，也不增加原目标嫌疑。`,
      locationId: pivot.currentLocationId,
      speakerIds: pivot.blockedActorId === 'self' ? [] : [pivot.blockedActorId],
    }, ...plan.beats],
  };
}

export function reviewDirectorPlan(plan: DirectorPlan, brief: MysteryBrief): FactReview {
  const violations: FactReviewViolation[] = [];
  const seen = new Set<string>();

  if (brief.saturationPivot) {
    const pivot = brief.saturationPivot;
    const revelation = plan.revelations.find(item => item.factId === pivot.factId);
    if (!revelation) {
      violations.push({ code: 'saturation-pivot-violation', factId: pivot.factId, message: `目标嫌疑已达当日上限；必须让 ${pivot.interveningNpcId} 介入并揭示 ${pivot.factId}，把新压力转向 ${pivot.redirectedActorId}。` });
    } else if (revelation.delivery !== 'dialogue' || revelation.speakerId !== pivot.interveningNpcId) {
      violations.push({ code: 'saturation-pivot-violation', factId: pivot.factId, message: `调查饱和转场的 ${pivot.factId} 必须由 ${pivot.interveningNpcId} 以 dialogue 揭示。` });
    }
    const interventionIndex = (plan.beats ?? []).findIndex(beat => beat.speakerIds?.includes(pivot.interveningNpcId));
    const originalInvestigationIndex = (plan.beats ?? []).findIndex(beat => {
      const text = `${beat.purpose} ${beat.description}`;
      return pivot.blockedActorId === 'self'
        ? /玩家|自身|自己|记忆|行动/.test(text)
        : !!beat.speakerIds?.includes(pivot.blockedActorId) || text.includes(pivot.blockedActorId);
    });
    if (originalInvestigationIndex < 0 || interventionIndex <= originalInvestigationIndex) {
      violations.push({ code: 'saturation-pivot-violation', factId: pivot.factId, message: `beats 必须先响应对 ${pivot.blockedActorId} 的原调查，再让 ${pivot.interveningNpcId} 自然介入。` });
    }
    const misplacedBeat = (plan.beats ?? []).find(beat => beat.locationId && beat.locationId !== pivot.currentLocationId);
    if (misplacedBeat) {
      violations.push({ code: 'saturation-pivot-violation', factId: pivot.factId, message: `调查饱和转场必须发生在当前场景 ${pivot.currentLocationId}，不得擅自切换到 ${misplacedBeat.locationId}。` });
    }
  }

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
  const proposedDiscoveries = proposedKnowledgeEvents.map(proposal => brief.playerPresentation.allowedDiscoveries
    .find(candidate => candidate.eventId === proposal.eventId));
  const canPairPublicIdentity = proposedKnowledgeEvents.length === 2
    && proposedDiscoveries.every(Boolean)
    && proposedDiscoveries[0]?.subjectId === proposedDiscoveries[1]?.subjectId
    && proposedDiscoveries.every(discovery => discovery?.kind === 'identity' || discovery?.kind === 'public-fact');
  if (proposedKnowledgeEvents.length > 1 && !canPairPublicIdentity) {
    violations.push({
      code: 'player-knowledge-violation',
      message: '单回合最多新增一个认知事件；唯一例外是同一人物的“姓名确认+公开职业确认”可由同一组可靠依据同时更新。',
    });
  }
  for (const proposal of proposedKnowledgeEvents) {
    const discovery = brief.playerPresentation.allowedDiscoveries
      .find(candidate => candidate.eventId === proposal.eventId);
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
    if (discovery && proposal.evidence.trim().length < 12) {
      violations.push({
        code: 'player-knowledge-violation',
        message: `认知事件 ${proposal.eventId} 的依据过于笼统；必须具体说明如何满足：${discovery.evidenceStandard}`,
      });
    }
  }

  const beatText = (plan.beats ?? []).map(beat =>
    `${Array.isArray(beat.speakerIds) ? beat.speakerIds.join(' ') : ''} ${beat.description ?? ''}`,
  );
  for (const npc of brief.npcKnowledge.filter(entry => entry.facts.some(fact => fact.stance === 'lies-about'))) {
    const confessionBeat = (plan.beats ?? []).find(beat => {
      if (!beat.speakerIds?.includes(npc.npcId)) return false;
      return impliesConfession(beat.description);
    });
    if (confessionBeat) {
      violations.push({
        code: 'character-performance-violation',
        message: `${npc.npcId} 的 stance=lies-about；即使事实已确认，也不得安排自白、说漏嘴或默认承认。`,
      });
    }
  }
  const huihuiAngryIndex = beatText.findIndex(text => /chen-huihui|陈慧慧|慧慧/.test(text) && /angry|愤怒|生气|发火/.test(text));
  const huihuiRevealIndex = beatText.findIndex(text => /低血糖/.test(text) && /巧克力/.test(text) && /收银员/.test(text) && /文件夹/.test(text));
  const huihuiKnowledge = proposedKnowledgeEvents.find(item => item.eventId === 'insight:chen-huihui-hypoglycemia');
  if (huihuiAngryIndex >= 0 && !huihuiKnowledge) {
    violations.push({
      code: 'character-performance-violation',
      message: '陈慧慧的愤怒只能与 insight:chen-huihui-hypoglycemia 人物揭示绑定，不能作为普通情绪使用。',
    });
  }
  if (huihuiKnowledge) {
    const evidence = huihuiKnowledge.evidence ?? '';
    if (huihuiAngryIndex < 0 || huihuiRevealIndex <= huihuiAngryIndex
      || !/低血糖/.test(evidence) || !/巧克力/.test(evidence)
      || !/收银员/.test(evidence) || !/文件夹/.test(evidence)) {
      violations.push({
        code: 'player-knowledge-violation',
        message: '慧慧低血糖认知必须按“愤怒动作后揭示低血糖与大号巧克力，并由她吐槽收银员为何拿文件夹”的顺序给出完整证据。',
      });
    }
  }

  const oldManInsanePlanned = beatText.some(text =>
    /old-man|周德明|周大爷|老头/.test(text) && /insane|疯狂|疯癫|癫狂|狂笑/.test(text),
  );
  const oldManKillerPreviouslyConfirmed = brief.playerKnownFacts.some(fact =>
    fact.level === 'confirmation'
      && (fact.id === 'a-murder-staged-fall' || /周德明.*推下.*文穗|周德明.*伪装成.*坠亡/.test(fact.text)),
  );
  const oldManInsaneIndex = beatText.findIndex(text =>
    /old-man|周德明|周大爷|老头/.test(text) && /insane|疯狂|疯癫|癫狂|狂笑/.test(text),
  );
  const schedulesOldManConfirmation = plan.revelations.some(revelation => {
    if (revelation.level !== 'confirmation') return false;
    const fact = brief.usableFacts.find(candidate => candidate.id === revelation.factId);
    return fact?.revealOptions.some(option =>
      option.level === 'confirmation' && /周德明.*推下.*文穗|周德明.*伪装成.*坠亡/.test(option.text),
    );
  });
  const confirmationBeatBeforeInsane = beatText
    .slice(0, Math.max(0, oldManInsaneIndex))
    .some(text => /确认|证实|凶手|推下|杀害/.test(text) && /周德明|周大爷|老头/.test(text));
  const oldManConfirmedBeforeInsane = oldManKillerPreviouslyConfirmed
    || (schedulesOldManConfirmation && confirmationBeatBeforeInsane);
  if (oldManInsanePlanned && !oldManConfirmedBeforeInsane) {
    violations.push({
      code: 'character-performance-violation',
      factId: 'a-murder-staged-fall',
      message: '玩家确认周德明是凶手前，禁止安排其 insane 或等价疯癫表演。',
    });
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
    characterPerformances: brief.characterPerformances,
    saturationPivot: brief.saturationPivot,
  };
}
