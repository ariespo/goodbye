import { describe, expect, it } from 'vitest';
import {
  buildNpcPlayerKnowledgeBrief,
  characterIdFromSpeaker,
  doesPlayerIntroduceName,
  npcPlayerKnowledgeError,
  resolveNpcPlayerKnowledge,
} from './npcPlayerKnowledge';
import { buildCharacterContinuityCandidateEvidence, validateCharacterContinuityAudit } from '../memory/character-continuity';
import { buildTurnCommit, normalizeWorldMemory } from '../memory/world-memory';

const identity = { name: '张明', gender: 'male' as const };

describe('NPC knowledge of player identity', () => {
  it('maps only exact player, NPC, and narrator speaker aliases', () => {
    expect(characterIdFromSpeaker('玩家')).toBe('player');
    expect(characterIdFromSpeaker('{{user}}')).toBe('player');
    expect(characterIdFromSpeaker('门卫老张')).toBe('school-guard');
    expect(characterIdFromSpeaker('school-guard')).toBe('school-guard');
    expect(characterIdFromSpeaker('旁白')).toBeNull();
    expect(characterIdFromSpeaker('门卫站在值班室门口')).toBeNull();
    expect(characterIdFromSpeaker('陌生人')).toBeNull();
  });
  it('gives established relationships distinct natural forms of address', () => {
    expect(resolveNpcPlayerKnowledge('fumi', identity).allowedAddress).toBe('张明');
    expect(resolveNpcPlayerKnowledge('touko', identity).allowedAddress).toBe('张明');
    expect(resolveNpcPlayerKnowledge('chen-huihui', identity).allowedAddress).toBe('张哥');
    expect(resolveNpcPlayerKnowledge('old-man', identity).allowedAddress).toBe('小张');
  });

  it('uses the first grapheme for a Latin nickname', () => {
    const latinIdentity = { name: 'CC', gender: 'female' as const };
    expect(resolveNpcPlayerKnowledge('chen-huihui', latinIdentity).allowedAddress).toBe('C姐');
    expect(resolveNpcPlayerKnowledge('old-man', latinIdentity).allowedAddress).toBe('小C');
    expect(resolveNpcPlayerKnowledge('detective-b', latinIdentity).allowedAddress).toBe('你');
  });

  it('keeps strangers from knowing the name until explicitly recorded', () => {
    const undercover = resolveNpcPlayerKnowledge('detective-b', identity);
    expect(undercover.knowsPlayerName).toBe(false);
    expect(undercover.actualKnowledgeScope).toBe('full-name');
    expect(undercover.expressibleKnowledgeScope).toBe('unknown');
    expect(resolveNpcPlayerKnowledge('detective-b', identity, {
      playerNameKnownByNpcIds: ['detective-b'],
    }).allowedAddress).toBe('张明');
  });

  it('lets the teacher use a formal guardian-contact address without granting family secrets', () => {
    const teacher = resolveNpcPlayerKnowledge('liu-renguang', identity);
    expect(teacher.allowedAddress).toBe('张先生');
    expect(teacher.knowledgeScope).toBe('guardian-formal');
  });

  it('recognizes an explicit self-introduction but not a refusal to share the name', () => {
    expect(doesPlayerIntroduceName('我叫张明，是来找人的。', identity)).toBe(true);
    expect(doesPlayerIntroduceName('先自我介绍，再询问值班记录。', identity)).toBe(true);
    expect(doesPlayerIntroduceName('我不想告诉她我的名字。', identity)).toBe(false);
  });

  it('grants current-cycle public name use only from an audited rendered introduction and audience', () => {
    const narrativeText = '对话|玩家|calm|赵刚，我叫张明。\n对话|赵刚|calm|张明，我记住了。\n对话|林静|calm|你们在聊什么？';
    const acceptedScene = {
      id: 'intro', lines: [
        { speaker: '玩家', text: '赵刚，我叫张明。' },
        { speaker: '赵刚', text: '张明，我记住了。' },
        { speaker: '林静', text: '你们在聊什么？' },
      ],
    };
    const evidence = buildCharacterContinuityCandidateEvidence({
      candidateText: narrativeText,
      scene: acceptedScene,
      assertionAudit: { reviewedFields: ['maintext'], assertions: [{
        field: 'maintext', quote: '我叫张明', proposition: '玩家介绍自己叫张明',
        status: 'ordinary-present', citations: [], reason: '当下说话行为',
      }] },
      assertionSources: [], possibleAudienceIds: ['detective-a', 'detective-b'],
      resolvedEndTime: '2024-09-09T09:00:00',
    });
    const validation = validateCharacterContinuityAudit({
      audit: { reviewed: true, disclosures: [{
        assertionIndex: 0, lineIndex: 0, quote: '我叫张明', listenerIds: ['detective-a'],
        audienceEvidence: [{ lineIndex: 1, quote: '张明，我记住了' }],
      }], beliefs: [], commitments: [] },
      evidence, memory: normalizeWorldMemory({ cycleCount: 1 }), cycleCount: 1, playerIdentityName: '张明',
    });
    expect(validation.approved).toBe(true);
    const commit = buildTurnCommit({
      turnId: 'intro', turnIndex: 1, createdAt: 1, occurredAt: '2024-09-09T09:00:00',
      locationId: 'school', cycleCount: 1, summary: '玩家向赵刚介绍姓名。', scene: acceptedScene,
      beforeVariables: {}, settledVariables: {}, narrativeText, continuityEffects: validation.effects,
    });
    expect(commit.playerNameKnownByNpcIds).toEqual(['detective-a']);
    const projectedVariables = { playerNameKnownByNpcIds: commit.playerNameKnownByNpcIds };
    expect(resolveNpcPlayerKnowledge('detective-a', identity, projectedVariables).allowedAddress).toBe('张明');
    const detectiveB = resolveNpcPlayerKnowledge('detective-b', identity, projectedVariables);
    expect(detectiveB.knowsPlayerName).toBe(false);
    expect(detectiveB.actualKnowledgeScope).toBe('full-name');
  });

  it('does not grant name use from an input-only introduction hint', () => {
    const commit = buildTurnCommit({
      turnId: 'hint-only', turnIndex: 1, createdAt: 1, occurredAt: '2024-09-09T09:00:00',
      locationId: 'school', cycleCount: 1, summary: '没有演出介绍。',
      scene: { id: 'hint-only', lines: [{ speaker: '旁白', text: '雨还在下。' }] },
      beforeVariables: {}, settledVariables: {}, introducedPlayerNameToNpcIds: ['detective-a'],
    });
    expect(commit.playerNameKnownByNpcIds).toEqual([]);
  });

  it('rejects an unknown NPC saying the player name but permits established addresses', () => {
    const briefs = buildNpcPlayerKnowledgeBrief(['detective-b', 'chen-huihui'], identity);
    expect(npcPlayerKnowledgeError([
      { speaker: '新来的护士', text: '张明，请在这里登记。' },
    ], identity, briefs)).toContain('不知道玩家姓名');
    expect(npcPlayerKnowledgeError([
      { speaker: '新来的护士', text: '{{user}}，请在这里登记。' },
    ], identity, briefs)).toContain('不知道玩家姓名');
    expect(npcPlayerKnowledgeError([
      { speaker: '店员', text: '张、张哥，欢迎光临……吃吃。' },
    ], identity, briefs)).toBeNull();
  });
});
