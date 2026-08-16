import { isRevealAtMost } from './reveal-level';
import { isAllowedKnowledgeDiscovery } from '../../data/playerKnowledge';
import {
  FIXED_BACKGROUND_FACTS,
  reviewBackgroundFactProposal,
  type BackgroundFactRecord,
} from '../../data/backgroundHistory';
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

const HISTORICAL_CLAIM = /(?:昨天|昨晚|前天|上次|此前|之前|早些时候|曾经|以前|平时|一向|向来|经常|总是|每次|(?:今天)?早上|今早)[^。！？\n]{0,100}(?:说|提到|告诉|表示|来|去|见|听|买|拿|做|发生|同行|生活|照顾|打招呼|认识)/;
const UNGROUNDED_EVIDENCE_DETAIL = /小票|收据|文件夹|监控(?:记录|录像)?|病历|短信(?:记录)?|聊天记录|通话记录|照片|票据|物证/;
const OPEN_HISTORY_QUESTION = /是否|有没有|有没|可能|吗|未必|不确定/;

/** 将确定性场景契约落实为导演节拍；只补角色与地点，不新增案件事实。 */
export function enforceNarrativeSceneContract(plan: DirectorPlan, brief: MysteryBrief): DirectorPlan {
  const contract = brief.sceneContract;
  const authorizedKnowledgeEvidence = (plan.knowledgeEvents ?? []).map(event => event.evidence).join('\n');
  const stripUngroundedEvidence = plan.revelations.length === 0 && brief.playerKnownFacts.length === 0;
  const hasUngroundedEvidence = (text: string) => {
    if (!stripUngroundedEvidence) return false;
    const detail = text.match(UNGROUNDED_EVIDENCE_DETAIL)?.[0];
    return !!detail && !authorizedKnowledgeEvidence.includes(detail);
  };
  const hasUngroundedHistory = (text: string) => HISTORICAL_CLAIM.test(text)
    && !OPEN_HISTORY_QUESTION.test(text);
  let beats = plan.beats.map(beat => {
    const hasSource = (beat.sourceMemoryIds?.length ?? 0) > 0
      || (beat.sourceBackgroundFactIds?.length ?? 0) > 0;
    const description = beat.description
      .split(/(?<=[。！？；])/)
      .filter(sentence => !(!hasSource && hasUngroundedHistory(sentence)))
      .filter(sentence => {
        return !hasUngroundedEvidence(sentence);
      })
      .join('')
      .trim();
    return {
      ...beat,
      description: description || '围绕玩家当前输入进行当下普通互动，不新增既往事实或可调查物件。',
    };
  });
  if (contract) {
    beats = beats.filter((_, index) => {
      const original = plan.beats[index];
      const originalText = `${original.purpose} ${original.description}`;
      if (hasUngroundedHistory(originalText)
        && (original.sourceMemoryIds?.length ?? 0) === 0
        && (original.sourceBackgroundFactIds?.length ?? 0) === 0) return false;
      return !hasUngroundedEvidence(originalText);
    });
  }
  const scenePlan = plan.scenePlan ? {
    ...plan.scenePlan,
    observeFocus: hasUngroundedEvidence(plan.scenePlan.observeFocus)
      || hasUngroundedHistory(plan.scenePlan.observeFocus)
      ? '当前可观察的人物反应与普通环境'
      : plan.scenePlan.observeFocus,
    observeConceal: plan.scenePlan.observeConceal
      && !hasUngroundedEvidence(plan.scenePlan.observeConceal)
      && !hasUngroundedHistory(plan.scenePlan.observeConceal)
      ? plan.scenePlan.observeConceal
      : undefined,
    investigateIntents: plan.scenePlan.investigateIntents.filter(item => (
      !hasUngroundedEvidence(item.intent) && !hasUngroundedHistory(item.intent)
    )),
    actionIntents: plan.scenePlan.actionIntents.filter(item => (
      !hasUngroundedEvidence(item.intent) && !hasUngroundedHistory(item.intent)
    )),
  } : undefined;
  const sanitizedPlan = {
    ...plan,
    turnGoal: hasUngroundedEvidence(plan.turnGoal) || hasUngroundedHistory(plan.turnGoal)
      ? '围绕玩家当前输入推进当下互动'
      : plan.turnGoal,
    beats,
    optionIntents: plan.optionIntents.filter(item => (
      !hasUngroundedEvidence(item.intent) && !hasUngroundedHistory(item.intent)
    )),
    scenePlan,
  };
  if (!contract) return sanitizedPlan;

  const forbidden = new Set(contract.forbiddenNpcIds);
  beats = beats.map(beat => ({
    ...beat,
    speakerIds: beat.speakerIds?.filter(id => !forbidden.has(id)),
  }));

  const destinationIndex = beats.findIndex(beat => beat.locationId === contract.destinationLocationId);
  const destinationSpeakers = contract.requiredDestinationNpcIds;
  if (destinationIndex >= 0) {
    const beat = beats[destinationIndex];
    beats[destinationIndex] = {
      ...beat,
      speakerIds: [...new Set([...(beat.speakerIds ?? []), ...destinationSpeakers])],
      description: beat.description.includes(contract.directive)
        ? beat.description
        : `${beat.description} ${contract.directive}`,
    };
  } else {
    beats.push({
      id: 'scene-contract-destination',
      purpose: '抵达目的地并由固定在场人物承接剧情',
      description: contract.directive,
      locationId: contract.destinationLocationId,
      speakerIds: destinationSpeakers,
    });
  }

  const missingEnRoute = contract.requiredEnRouteNpcIds.filter(
    npcId => !beats.some(beat => beat.speakerIds?.includes(npcId)),
  );
  if (missingEnRoute.length > 0) {
    beats = [{
      id: 'scene-contract-en-route',
      purpose: '在前往目的地途中落实固定概率遭遇',
      description: '玩家先在暴雨街道途中遇到本回合已确定的在途人物；只按其公开身份进行短暂而有后果的互动，然后继续前往目的地。',
      locationId: 'street',
      speakerIds: missingEnRoute,
    }, ...beats];
  }
  const forbiddenKnowledgeEvents = new Set(contract.forbiddenKnowledgeEventIds);
  const knowledgeEvents = (plan.knowledgeEvents ?? [])
    .filter(item => !forbiddenKnowledgeEvents.has(item.eventId));
  for (const required of contract.requiredKnowledgeEvents) {
    if (!knowledgeEvents.some(item => item.eventId === required.eventId)) knowledgeEvents.push(required);
  }
  return { ...sanitizedPlan, beats, knowledgeEvents };
}

function selectedMemoryIds(turnContext?: Record<string, unknown>): Set<string> {
  const memoryContext = turnContext?.memoryContext;
  const nestedIds = memoryContext && typeof memoryContext === 'object'
    ? (memoryContext as { selectedIds?: unknown }).selectedIds
    : undefined;
  return new Set([
    ...(Array.isArray(turnContext?.contextSelectionIds) ? turnContext.contextSelectionIds : []),
    ...(Array.isArray(nestedIds) ? nestedIds : []),
  ].filter((item): item is string => typeof item === 'string'));
}

function selectedBackgroundFacts(turnContext?: Record<string, unknown>): BackgroundFactRecord[] {
  const memoryContext = turnContext?.memoryContext;
  if (!memoryContext || typeof memoryContext !== 'object') return [];
  const facts = (memoryContext as { backgroundFacts?: unknown }).backgroundFacts;
  return Array.isArray(facts)
    ? facts.filter((item): item is BackgroundFactRecord => !!item && typeof item === 'object' && typeof (item as BackgroundFactRecord).factId === 'string')
    : [];
}

function expressibleBackgroundFactIds(turnContext?: Record<string, unknown>): Set<string> {
  const memoryContext = turnContext?.memoryContext;
  if (!memoryContext || typeof memoryContext !== 'object') return new Set();
  const cognition = (memoryContext as { backgroundCognition?: unknown }).backgroundCognition;
  if (!Array.isArray(cognition)) return new Set();
  return new Set(cognition.flatMap(item => (
    item && typeof item === 'object'
      && (item as { expressibleUnderCover?: unknown }).expressibleUnderCover === true
      && typeof (item as { factId?: unknown }).factId === 'string'
      ? [(item as { factId: string }).factId]
      : []
  )));
}

export function reviewDirectorPlan(
  plan: DirectorPlan,
  brief: MysteryBrief,
  turnContext?: Record<string, unknown>,
): FactReview {
  const violations: FactReviewViolation[] = [];
  const seen = new Set<string>();
  const allowedMemoryIds = selectedMemoryIds(turnContext);
  const contextBackgroundFacts = selectedBackgroundFacts(turnContext);
  const expressibleBackgroundIds = expressibleBackgroundFactIds(turnContext);
  const allowedBackgroundIds = new Set([
    ...contextBackgroundFacts.map(fact => fact.factId),
    ...(plan.backgroundFactProposals ?? []).map(proposal => proposal.proposalId),
    ...(plan.backgroundFactProposals ?? []).map(proposal => `soft:${proposal.proposalId}`),
  ]);

  const seenProposalIds = new Set<string>();
  for (const proposal of plan.backgroundFactProposals ?? []) {
    const proposalReview = reviewBackgroundFactProposal(proposal);
    const duplicate = seenProposalIds.has(proposal.proposalId);
    seenProposalIds.add(proposal.proposalId);
    const existing = contextBackgroundFacts.find(fact => fact.factId === `soft:${proposal.proposalId}`);
    if (!proposalReview.approved || duplicate || (existing && existing.text !== proposal.text)) {
      violations.push({
        code: 'soft-canon-violation',
        message: `软设定 ${proposal.proposalId} 未通过程序审查：${proposalReview.reason ?? (duplicate ? '提案 ID 重复' : '与既有软设定冲突')}`,
      });
    }
  }

  for (const beat of plan.beats) {
    if (!HISTORICAL_CLAIM.test(`${beat.purpose} ${beat.description}`)) continue;
    const memorySources = beat.sourceMemoryIds ?? [];
    const backgroundSources = beat.sourceBackgroundFactIds ?? [];
    const invalidMemorySources = memorySources.filter(id => !allowedMemoryIds.has(id));
    const invalidBackgroundSources = backgroundSources.filter(id => !allowedBackgroundIds.has(id));
    if ((memorySources.length === 0 && backgroundSources.length === 0)
      || invalidMemorySources.length > 0 || invalidBackgroundSources.length > 0) {
      violations.push({
        code: 'ungrounded-past-claim',
        message: memorySources.length === 0 && backgroundSources.length === 0
          ? `beat ${beat.id} 写了旧经历，却未引用 sourceMemoryIds 或 sourceBackgroundFactIds。`
          : `beat ${beat.id} 引用了未授权来源：${[...invalidMemorySources, ...invalidBackgroundSources].join('、')}。`,
      });
    }
    const hiddenSources = backgroundSources.filter(id => {
      const fact = contextBackgroundFacts.find(item => item.factId === id);
      return fact?.privacy === 'investigative' && !expressibleBackgroundIds.has(id);
    });
    if (hiddenSources.length > 0) {
      violations.push({
        code: 'npc-knowledge-violation',
        message: `beat ${beat.id} 试图让公开身份表达不可暴露的调查认知：${hiddenSources.join('、')}。`,
      });
    }
  }

  if (plan.revelations.length === 0 && brief.playerKnownFacts.length === 0) {
    const evidenceText = JSON.stringify({
      turnGoal: plan.turnGoal,
      beats: plan.beats,
      optionIntents: plan.optionIntents,
      scenePlan: plan.scenePlan,
    });
    const evidenceDetail = evidenceText.match(UNGROUNDED_EVIDENCE_DETAIL);
    const authorizedKnowledgeEvidence = (plan.knowledgeEvents ?? []).map(event => event.evidence).join('\n');
    if (evidenceDetail && !authorizedKnowledgeEvidence.includes(evidenceDetail[0])) {
      violations.push({
        code: 'ungrounded-evidence-detail',
        message: `当前没有获准案件事实，禁止新增可调查物件或记录“${evidenceDetail[0]}”；请改为普通当下互动。`,
      });
    }
  }

  if (brief.sceneContract) {
    const contract = brief.sceneContract;
    const destinationIndex = plan.beats.findIndex(beat => beat.locationId === contract.destinationLocationId);
    if (destinationIndex < 0) {
      violations.push({
        code: 'scene-contract-violation',
        message: `beats 必须明确抵达目的地 ${contract.destinationLocationId}。`,
      });
    }
    for (const npcId of contract.requiredDestinationNpcIds) {
      if (!plan.beats.some(beat => beat.locationId === contract.destinationLocationId && beat.speakerIds?.includes(npcId))) {
        violations.push({
          code: 'scene-contract-violation',
          message: `目的地 ${contract.destinationLocationId} 必须由 ${npcId} 实际参与剧情，不能用泛称或临时 NPC 替代。`,
        });
      }
    }
    for (const npcId of contract.requiredEnRouteNpcIds) {
      const encounterIndex = plan.beats.findIndex(beat => beat.locationId === 'street' && beat.speakerIds?.includes(npcId));
      if (encounterIndex < 0 || (destinationIndex >= 0 && encounterIndex >= destinationIndex)) {
        violations.push({
          code: 'scene-contract-violation',
          message: `在抵达目的地前，必须先在 street 安排 ${npcId} 的途中遭遇。`,
        });
      }
    }
    for (const npcId of contract.forbiddenNpcIds) {
      if (plan.beats.some(beat => beat.speakerIds?.includes(npcId))) {
        violations.push({
          code: 'scene-contract-violation',
          message: `当前进入条件不成立，禁止安排 ${npcId} 出场。`,
        });
      }
    }
    for (const required of contract.requiredKnowledgeEvents) {
      if (!(plan.knowledgeEvents ?? []).some(item => item.eventId === required.eventId)) {
        violations.push({
          code: 'scene-contract-violation',
          message: `本场景必须在正文证据后提交认知事件 ${required.eventId}。`,
        });
      }
    }
    for (const eventId of contract.forbiddenKnowledgeEventIds) {
      if ((plan.knowledgeEvents ?? []).some(item => item.eventId === eventId)) {
        violations.push({
          code: 'scene-contract-violation',
          message: `本场景不得更新尚未被玩家确认的认知事件 ${eventId}。`,
        });
      }
    }
  }

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

export function buildWriterPacket(
  plan: DirectorPlan,
  brief: MysteryBrief,
  turnContext?: Record<string, unknown>,
): WriterPacket {
  const review = reviewDirectorPlan(plan, brief, turnContext);
  if (!review.approved) {
    throw new Error(`导演计划未通过事实审查：${review.corrections.join('；')}`);
  }

  const {
    revelations: _revelations,
    knowledgeEvents: authorizedKnowledgeEvents = [],
    backgroundFactProposals = [],
    ...safePlan
  } = plan;
  void _revelations;
  const backgroundById = new Map([
    ...FIXED_BACKGROUND_FACTS.map(fact => [fact.factId, fact] as const),
    ...selectedBackgroundFacts(turnContext).map(fact => [fact.factId, fact] as const),
  ]);
  const usedBackgroundIds = new Set(plan.beats.flatMap(beat => beat.sourceBackgroundFactIds ?? []));
  const authorizedBackgroundFacts = [...backgroundById.values()].filter(fact => (
    fact.level === 'soft'
    || expressibleBackgroundFactIds(turnContext).has(fact.factId)
    || (usedBackgroundIds.has(fact.factId) && fact.privacy !== 'investigative')
  ));
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
    authorizedBackgroundFacts,
    approvedBackgroundFactProposals: backgroundFactProposals,
    forbiddenInstructions: [
      '只能使用 authorizedFacts 中的事实及其给定措辞层级。',
      '不得推断、补写或暗示其他隐藏真相。',
      '不得让 NPC 说出其授权范围外的信息。',
      '不得新增关键证据、凶手、动机、死因或时间线节点。',
      ...brief.playerPresentation.namingRules,
      ...(brief.npcPlayerKnowledge ?? []).map(item => item.knowsPlayerName
        ? `${item.npcId} 称呼玩家时只可使用“${item.allowedAddress}”。`
        : `${item.npcId} 不知道玩家姓名，不得说出或猜中姓名。`),
      'authorizedKnowledgeEvents 中的新人或新地点只能在 evidence 所描述的玩家可见事件发生后，才可使用新称呼或地址。',
    ],
    playerPresentation: brief.playerPresentation,
    characterPerformances: brief.characterPerformances,
    npcPlayerKnowledge: brief.npcPlayerKnowledge?.map(item => ({
      ...item,
      actualKnowledgeScope: item.expressibleKnowledgeScope,
    })),
    sceneContract: brief.sceneContract,
    saturationPivot: brief.saturationPivot,
  };
}
