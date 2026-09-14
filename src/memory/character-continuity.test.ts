import { describe, expect, it } from 'vitest';
import type { AssertionAudit, AssertionSource } from '../agents/mystery/fact-assertion-review';
import type { Scene } from '../sillytavern/types';
import {
  activeCommitmentBoundaries,
  buildCharacterContinuityCandidateEvidence,
  candidateFingerprint,
  commitmentIdFromBoundaryId,
  resetCharacterContinuity,
  validateCharacterContinuityAudit,
  type CharacterContinuityAudit,
  type CommitmentRecord,
} from './character-continuity';
import { buildTurnCommit, normalizeWorldMemory } from './world-memory';

const receiptSource: AssertionSource = {
  id: 'fact:receipt', kind: 'fact', text: '收据显示文穗买过牛奶。', factId: 'F001', level: 'clue',
};

function scene(...lines: Array<[string, string]>): Scene {
  return {
    id: 'accepted-scene',
    lines: lines.map(([speaker, text], index) => ({ id: `random-${index}`, speaker, text })),
  };
}

function assertionAudit(assertions: AssertionAudit['assertions']): AssertionAudit {
  return { reviewedFields: ['maintext'], assertions };
}

function evidence(input: {
  candidateText: string;
  scene: Scene;
  assertions: AssertionAudit['assertions'];
  sources?: AssertionSource[];
  audience?: string[];
  end?: string;
  canonicalBindings?: Record<string, string>;
}) {
  return buildCharacterContinuityCandidateEvidence({
    candidateText: input.candidateText,
    scene: input.scene,
    assertionAudit: assertionAudit(input.assertions),
    assertionSources: input.sources ?? [],
    possibleAudienceIds: input.audience ?? [],
    resolvedEndTime: input.end ?? '2024-09-09T09:00:00',
    canonicalPropositionBySourceId: input.canonicalBindings,
  });
}

function reviewed(overrides: Partial<CharacterContinuityAudit> = {}): CharacterContinuityAudit {
  return { reviewed: true, disclosures: [], beliefs: [], commitments: [], ...overrides };
}

describe('character continuity audit validation', () => {
  it('grants heard cognition only to the listener with line-bound hearing evidence', () => {
    const acceptedScene = scene(
      ['玩家', '赵刚，我看到收据了。'],
      ['赵刚', '我听见了，但我还不信。'],
      ['林静', '我刚从外面回来。'],
    );
    const candidate = evidence({
      candidateText: '<maintext>对话|玩家|calm|赵刚，我看到收据了。\n对话|赵刚|calm|我听见了，但我还不信。\n对话|林静|calm|我刚从外面回来。</maintext><sum>交谈</sum>',
      scene: acceptedScene,
      assertions: [{
        field: 'maintext', quote: '我看到收据了', proposition: '玩家看到收据', status: 'supported',
        citations: [{ sourceId: receiptSource.id, quote: '收据' }], reason: '获准线索',
      }],
      sources: [receiptSource],
      canonicalBindings: { 'fact:receipt': 'fact:canonical-receipt' },
      audience: ['detective-a', 'detective-b'],
    });
    const result = validateCharacterContinuityAudit({
      audit: reviewed({ disclosures: [{
        assertionIndex: 0, lineIndex: 0, quote: '我看到收据了', listenerIds: ['detective-a'],
        audienceEvidence: [{ lineIndex: 1, quote: '我听见了' }],
      }] }),
      evidence: candidate,
      memory: normalizeWorldMemory({ cycleCount: 1 }),
      cycleCount: 1,
    });
    expect(result).toMatchObject({ approved: true });
    expect(result.effects?.disclosures).toEqual([expect.objectContaining({
      speakerId: 'player', listenerIds: ['detective-a'], propositionId: 'fact:canonical-receipt',
    })]);
    expect(result.effects?.cognitionDeltas).toContainEqual(expect.objectContaining({
      observerId: 'detective-a', propositionId: 'fact:canonical-receipt', status: 'heard',
    }));
    expect(result.effects?.cognitionDeltas.some(delta => delta.observerId === 'detective-b')).toBe(false);
  });

  it('records an NPC lie as said and heard without confirming the proposition', () => {
    const acceptedScene = scene(['赵刚', '玩家，我昨晚一直在旅馆。'], ['玩家', '我听到了。']);
    const candidate = evidence({
      candidateText: '对话|赵刚|calm|玩家，我昨晚一直在旅馆。\n对话|玩家|calm|我听到了。',
      scene: acceptedScene,
      assertions: [{
        field: 'maintext', quote: '我昨晚一直在旅馆', proposition: '赵刚声称昨晚一直在旅馆',
        status: 'ordinary-present', citations: [], reason: '只审核说话行为',
      }],
      audience: ['player'],
    });
    const result = validateCharacterContinuityAudit({
      audit: reviewed({ disclosures: [{
        assertionIndex: 0, lineIndex: 0, quote: '我昨晚一直在旅馆', listenerIds: ['player'],
        audienceEvidence: [{ lineIndex: 1, quote: '我听到了' }],
      }] }),
      evidence: candidate, memory: normalizeWorldMemory({ cycleCount: 1 }), cycleCount: 1,
    });
    expect(result.approved).toBe(true);
    expect(result.effects?.cognitionDeltas).toEqual([expect.objectContaining({ status: 'heard' })]);
    expect(result.effects?.cognitionDeltas.some(delta => delta.status === 'confirmed')).toBe(false);
  });

  it('does not reuse an earlier segment listener for a repeated identical utterance', () => {
    const candidate = evidence({
      candidateText: '对话|玩家|calm|我看到收据了。\n对话|赵刚|calm|我听见了。\n对话|玩家|calm|我看到收据了。\n对话|林静|calm|我听见了。',
      scene: scene(
        ['玩家', '我看到收据了。'], ['赵刚', '我听见了。'],
        ['玩家', '我看到收据了。'], ['林静', '我听见了。'],
      ),
      assertions: [{ field: 'maintext', quote: '我看到收据了', proposition: '看到收据', status: 'supported', citations: [{ sourceId: receiptSource.id, quote: '收据' }], reason: '线索' }],
      sources: [receiptSource], audience: ['detective-a', 'detective-b'],
    });
    const result = validateCharacterContinuityAudit({
      audit: reviewed({ disclosures: [{
        assertionIndex: 0, lineIndex: 2, quote: '我看到收据了', listenerIds: ['detective-a'],
        audienceEvidence: [{ lineIndex: 1, quote: '我听见了' }],
      }] }),
      evidence: candidate, memory: normalizeWorldMemory({ cycleCount: 1 }), cycleCount: 1,
    });
    expect(result.approved).toBe(false);
  });

  it('does not treat a visual mention of someone as evidence they heard the disclosure', () => {
    const candidate = evidence({
      candidateText: '对话|玩家|calm|我看见赵刚站在雨里。我看到收据了。',
      scene: scene(['玩家', '我看见赵刚站在雨里。我看到收据了。']),
      assertions: [{ field: 'maintext', quote: '我看到收据了', proposition: '看到收据', status: 'supported', citations: [{ sourceId: receiptSource.id, quote: '收据' }], reason: '线索' }],
      sources: [receiptSource], audience: ['detective-a'],
    });
    const result = validateCharacterContinuityAudit({
      audit: reviewed({ disclosures: [{
        assertionIndex: 0, lineIndex: 0, quote: '我看到收据了', listenerIds: ['detective-a'],
        audienceEvidence: [{ lineIndex: 0, quote: '我看见赵刚站在雨里' }],
      }] }),
      evidence: candidate, memory: normalizeWorldMemory({ cycleCount: 1 }), cycleCount: 1,
    });
    expect(result.approved).toBe(false);
  });

  it.each([
    ['empty audience evidence', [], ['detective-a']],
    ['absent listener', [{ lineIndex: 1, quote: '我听见了' }], ['detective-b']],
    ['uncited telephone channel', [{ lineIndex: 0, quote: '我看到收据了' }], ['detective-a']],
  ])('rejects %s', (_name, audienceEvidence, listenerIds) => {
    const candidate = evidence({
      candidateText: '对话|玩家|calm|我看到收据了。\n对话|赵刚|calm|我听见了。',
      scene: scene(['玩家', '我看到收据了。'], ['赵刚', '我听见了。']),
      assertions: [{ field: 'maintext', quote: '我看到收据了', proposition: '看到收据', status: 'supported', citations: [{ sourceId: receiptSource.id, quote: '收据' }], reason: '线索' }],
      sources: [receiptSource], audience: ['detective-a', 'detective-b'],
    });
    const result = validateCharacterContinuityAudit({
      audit: reviewed({ disclosures: [{ assertionIndex: 0, lineIndex: 0, quote: '我看到收据了', listenerIds, audienceEvidence }] }),
      evidence: candidate, memory: normalizeWorldMemory({ cycleCount: 1 }), cycleCount: 1,
    });
    expect(result.approved).toBe(false);
  });

  it('requires a rendered observer reaction before writing belief', () => {
    const candidate = evidence({
      candidateText: '对话|玩家|calm|我看到收据了。\n对话|赵刚|calm|这让我开始相信你。',
      scene: scene(['玩家', '我看到收据了。'], ['赵刚', '这让我开始相信你。']),
      assertions: [{ field: 'maintext', quote: '这让我开始相信你', proposition: '赵刚相信玩家', status: 'ordinary-present', citations: [], reason: '当下反应' }],
      audience: ['detective-a'],
    });
    const valid = validateCharacterContinuityAudit({
      audit: reviewed({ beliefs: [{ assertionIndex: 0, observerId: 'detective-a', status: 'believed', evidence: [{ lineIndex: 1, quote: '开始相信你' }] }] }),
      evidence: candidate, memory: normalizeWorldMemory({ cycleCount: 1 }), cycleCount: 1,
    });
    expect(valid.approved).toBe(true);
    expect(valid.effects?.cognitionDeltas).toContainEqual(expect.objectContaining({ observerId: 'detective-a', status: 'believed' }));
    const invalid = validateCharacterContinuityAudit({
      audit: reviewed({ beliefs: [{ assertionIndex: 0, observerId: 'detective-b', status: 'believed', evidence: [{ lineIndex: 1, quote: '开始相信你' }] }] }),
      evidence: candidate, memory: normalizeWorldMemory({ cycleCount: 1 }), cycleCount: 1,
    });
    expect(invalid.approved).toBe(false);

    const unrelated = evidence({
      candidateText: '对话|赵刚|calm|今天天气不错。',
      scene: scene(['赵刚', '今天天气不错。']),
      assertions: [{ field: 'maintext', quote: '今天天气不错', proposition: '赵刚相信玩家', status: 'ordinary-present', citations: [], reason: '当下台词' }],
      audience: ['detective-a'],
    });
    expect(validateCharacterContinuityAudit({
      audit: reviewed({ beliefs: [{ assertionIndex: 0, observerId: 'detective-a', status: 'believed', evidence: [{ lineIndex: 0, quote: '今天天气不错' }] }] }),
      evidence: unrelated, memory: normalizeWorldMemory({ cycleCount: 1 }), cycleCount: 1,
    }).approved).toBe(false);
  });

  it('creates a commitment only from the obligated actor\'s accepted future undertaking', () => {
    const candidate = evidence({
      candidateText: '对话|玩家|calm|十点在学校把值班表给我。\n对话|赵刚|calm|好，我十点在学校把值班表给你。',
      scene: scene(['玩家', '十点在学校把值班表给我。'], ['赵刚', '好，我十点在学校把值班表给你。']),
      assertions: [], audience: ['detective-a'], end: '2024-09-09T09:00:00',
    });
    const noProposal = validateCharacterContinuityAudit({
      audit: reviewed(), evidence: candidate, memory: normalizeWorldMemory({ cycleCount: 1 }), cycleCount: 1,
    });
    expect(noProposal.effects?.commitmentOperations).toEqual([]);
    const accepted = validateCharacterContinuityAudit({
      audit: reviewed({ commitments: [{
        operation: 'accept', actorId: 'detective-a', recipientId: 'player',
        action: '把值班表交给玩家', locationId: 'school', dueAt: '2024-09-09T10:00:00',
        evidence: [{ lineIndex: 1, quote: '好，我十点在学校把值班表给你' }],
      }] }),
      evidence: candidate, memory: normalizeWorldMemory({ cycleCount: 1 }), cycleCount: 1,
    });
    expect(accepted.approved).toBe(true);
    expect(accepted.effects?.commitmentOperations).toEqual([expect.objectContaining({ operation: 'accept', actorId: 'detective-a' })]);

    const actorQuestion = evidence({
      candidateText: '对话|赵刚|calm|你要我十点在学校把值班表给你吗？',
      scene: scene(['赵刚', '你要我十点在学校把值班表给你吗？']), assertions: [],
      audience: ['detective-a'], end: '2024-09-09T09:00:00',
    });
    expect(validateCharacterContinuityAudit({
      audit: reviewed({ commitments: [{
        operation: 'accept', actorId: 'detective-a', recipientId: 'player', action: '把值班表交给玩家',
        locationId: 'school', dueAt: '2024-09-09T10:00:00', evidence: [{ lineIndex: 0, quote: '你要我十点在学校把值班表给你吗' }],
      }] }),
      evidence: actorQuestion, memory: normalizeWorldMemory({ cycleCount: 1 }), cycleCount: 1,
    }).approved).toBe(false);
  });

  it('does not grant player-name expression from merely mentioning that name', () => {
    const candidate = evidence({
      candidateText: '对话|玩家|calm|赵刚，张明今天不在这里。\n对话|赵刚|calm|我听见了。',
      scene: scene(['玩家', '赵刚，张明今天不在这里。'], ['赵刚', '我听见了。']),
      assertions: [{ field: 'maintext', quote: '张明今天不在这里', proposition: '玩家说张明不在', status: 'ordinary-present', citations: [], reason: '说话行为' }],
      audience: ['detective-a'],
    });
    const result = validateCharacterContinuityAudit({
      audit: reviewed({ disclosures: [{ assertionIndex: 0, lineIndex: 0, quote: '张明今天不在这里', listenerIds: ['detective-a'], audienceEvidence: [{ lineIndex: 1, quote: '我听见了' }] }] }),
      evidence: candidate, memory: normalizeWorldMemory({ cycleCount: 1 }), cycleCount: 1, playerIdentityName: '张明',
    });
    expect(result.approved).toBe(true);
    expect(result.effects?.cognitionDeltas.some(delta => delta.propositionId === 'expression:player-name')).toBe(false);
  });

  it.each([
    ['unknown location', 'detective-a', 'police-station', '2024-09-09T10:00:00'],
    ['due at resolved end', 'detective-a', 'school', '2024-09-09T09:00:00'],
    ['next-day due time', 'detective-a', 'school', '2024-09-10T10:00:00'],
    ['third-party acceptance', 'detective-b', 'school', '2024-09-09T10:00:00'],
  ])('rejects commitment acceptance with %s', (_name, actorId, locationId, dueAt) => {
    const candidate = evidence({
      candidateText: '对话|赵刚|calm|好，我十点在学校把值班表给你。',
      scene: scene(['赵刚', '好，我十点在学校把值班表给你。']), assertions: [],
      audience: ['detective-a', 'detective-b'], end: '2024-09-09T09:00:00',
    });
    const result = validateCharacterContinuityAudit({
      audit: reviewed({ commitments: [{ operation: 'accept', actorId, recipientId: 'player', action: '把值班表交给玩家', locationId, dueAt, evidence: [{ lineIndex: 0, quote: '好，我十点在学校把值班表给你' }] }] }),
      evidence: candidate, memory: normalizeWorldMemory({ cycleCount: 1 }), cycleCount: 1,
    });
    expect(result.approved).toBe(false);
  });

  it('binds evidence to the accepted candidate text, line index, and exact quote', () => {
    const text = '对话|玩家|calm|赵刚，我看到收据了。\n对话|赵刚|calm|我听见了。';
    const candidate = evidence({
      candidateText: `<maintext>${text}</maintext><sum>摘要不参与指纹</sum>`,
      scene: scene(['玩家', '赵刚，我看到收据了。'], ['赵刚', '我听见了。']),
      assertions: [{ field: 'maintext', quote: '我看到收据了', proposition: '看到收据', status: 'supported', citations: [{ sourceId: receiptSource.id, quote: '收据' }], reason: '线索' }],
      sources: [receiptSource], audience: ['detective-a'],
    });
    expect(candidate.candidateId).toBe(candidateFingerprint(text));
    const shifted = validateCharacterContinuityAudit({
      audit: reviewed({ disclosures: [{ assertionIndex: 0, lineIndex: 1, quote: '我看到收据了', listenerIds: ['detective-a'], audienceEvidence: [{ lineIndex: 1, quote: '我听见了' }] }] }),
      evidence: candidate, memory: normalizeWorldMemory({ cycleCount: 1 }), cycleCount: 1,
    });
    expect(shifted.approved).toBe(false);
  });

  it('does not fulfill on clock arrival but accepts performed-action or actor cancellation evidence', () => {
    const commitment: CommitmentRecord = {
      id: 'commitment:existing:0', cycleCount: 1, actorId: 'detective-a', recipientId: 'player',
      action: '把值班表交给玩家', locationId: 'school', dueAt: '2024-09-09T10:00:00',
      status: 'active', sourceEventId: 'turn:promise', evidenceQuote: '我会交给你',
    };
    const memory = normalizeWorldMemory({ cycleCount: 1, worldMemory: {
      ...normalizeWorldMemory({ cycleCount: 1 }), commitments: [commitment],
    } });
    const arrival = evidence({
      candidateText: '对话|旁白|calm|十点到了，玩家来到学校。',
      scene: scene(['旁白', '十点到了，玩家来到学校。']), assertions: [], audience: ['detective-a'],
    });
    expect(validateCharacterContinuityAudit({
      audit: reviewed({ commitments: [{ operation: 'fulfill', existingCommitmentId: commitment.id, actorId: 'detective-a', recipientId: 'player', evidence: [{ lineIndex: 0, quote: '十点到了，玩家来到学校' }] }] }),
      evidence: arrival, memory, cycleCount: 1,
    }).approved).toBe(false);

    const performed = evidence({
      candidateText: '对话|旁白|calm|赵刚把值班表交给玩家。',
      scene: scene(['旁白', '赵刚把值班表交给玩家。']), assertions: [], audience: ['detective-a'],
    });
    expect(validateCharacterContinuityAudit({
      audit: reviewed({ commitments: [{ operation: 'fulfill', existingCommitmentId: commitment.id, actorId: 'detective-a', recipientId: 'player', evidence: [{ lineIndex: 0, quote: '赵刚把值班表交给玩家' }] }] }),
      evidence: performed, memory, cycleCount: 1,
    }).effects?.commitmentOperations).toEqual([expect.objectContaining({ operation: 'fulfill', existingCommitmentId: commitment.id })]);

    const cancelled = evidence({
      candidateText: '对话|赵刚|calm|我取消约定，今天不能把值班表给你。',
      scene: scene(['赵刚', '我取消约定，今天不能把值班表给你。']), assertions: [], audience: ['detective-a'],
    });
    expect(validateCharacterContinuityAudit({
      audit: reviewed({ commitments: [{ operation: 'cancel', existingCommitmentId: commitment.id, actorId: 'detective-a', recipientId: 'player', evidence: [{ lineIndex: 0, quote: '我取消约定' }] }] }),
      evidence: cancelled, memory, cycleCount: 1,
    }).effects?.commitmentOperations).toEqual([expect.objectContaining({ operation: 'cancel', existingCommitmentId: commitment.id })]);
    expect(validateCharacterContinuityAudit({
      audit: reviewed({ commitments: [{ operation: 'cancel', existingCommitmentId: commitment.id, actorId: 'detective-b', recipientId: 'player', evidence: [{ lineIndex: 0, quote: '我取消约定' }] }] }),
      evidence: cancelled, memory, cycleCount: 1,
    }).approved).toBe(false);
  });

  it('uses only a cited program binding and keeps public aliases opaque when bindings drift', () => {
    const candidate = evidence({
      candidateText: '对话|玩家|calm|赵刚，我看到收据了。\n对话|赵刚|calm|听见了。',
      scene: scene(['玩家', '赵刚，我看到收据了。'], ['赵刚', '听见了。']),
      assertions: [{ field: 'maintext', quote: '我看到收据了', proposition: '玩家看到收据', status: 'supported', citations: [{ sourceId: receiptSource.id, quote: '收据' }], reason: '线索' }],
      sources: [receiptSource], audience: ['detective-a'],
      canonicalBindings: { 'fact:unknown-alias': 'fact:secret-unknown', 'fact:receipt': 'F001' },
    });
    const result = validateCharacterContinuityAudit({
      audit: reviewed({ disclosures: [{ assertionIndex: 0, lineIndex: 0, quote: '我看到收据了', listenerIds: ['detective-a'], audienceEvidence: [{ lineIndex: 1, quote: '听见了' }] }] }),
      evidence: candidate, memory: normalizeWorldMemory({ cycleCount: 1 }), cycleCount: 1,
    });
    expect(result.approved).toBe(true);
    expect(result.effects?.disclosures[0].propositionId).toMatch(new RegExp(`^claim:${candidate.candidateId}:0$`));
    expect(JSON.stringify(result.effects)).not.toContain('secret-unknown');
    expect(JSON.stringify(result.effects)).not.toContain('fact:F001');
  });
});

describe('commitment boundary and reset policy', () => {
  const active: CommitmentRecord = {
    id: 'commitment:turn-1:0', cycleCount: 3, actorId: 'detective-a', recipientId: 'player',
    action: '交出值班表', locationId: 'school', dueAt: '2024-09-09T10:00:00', status: 'active',
    sourceEventId: 'turn:turn-1', evidenceQuote: '我十点把值班表给你',
  };

  it('projects only current active unacknowledged commitments and parses their boundary IDs', () => {
    const memory = normalizeWorldMemory({ cycleCount: 3, worldMemory: {
      ...normalizeWorldMemory({ cycleCount: 3 }),
      commitments: [active, { ...active, id: 'fulfilled', status: 'fulfilled' }, { ...active, id: 'old', cycleCount: 2 }],
    } });
    const boundaries = activeCommitmentBoundaries(memory, 3);
    expect(boundaries).toEqual([{ id: 'commitment-boundary:commitment:turn-1:0', at: active.dueAt }]);
    expect(commitmentIdFromBoundaryId(boundaries[0].id)).toBe(active.id);
    expect(commitmentIdFromBoundaryId('death-news')).toBeNull();
    expect(activeCommitmentBoundaries({ ...memory, acknowledgedCommitmentBoundaryIds: [boundaries[0].id] }, 3)).toEqual([]);
  });

  it('keeps player recollection, removes NPC day cognition, and expires active promises on reset', () => {
    const memory = normalizeWorldMemory({ cycleCount: 3, worldMemory: {
      ...normalizeWorldMemory({ cycleCount: 3 }),
      cognition: [
        { cognitionId: 'player|fact:F001', observerId: 'player', propositionId: 'fact:F001', status: 'believed', confidence: 0.8, sourceEventIds: ['turn:x'], firstLearnedTurn: 1, lastUpdatedTurn: 1, summary: '玩家记得收据', provenance: 'accepted-turn', scope: 'durable', acquiredCycle: 3 },
        { cognitionId: 'detective-a|fact:F001', observerId: 'detective-a', propositionId: 'fact:F001', status: 'heard', confidence: 1, sourceEventIds: ['turn:x'], firstLearnedTurn: 1, lastUpdatedTurn: 1, summary: '赵刚听过收据', provenance: 'accepted-turn', scope: 'day', acquiredCycle: 3 },
      ],
      disclosures: [{ id: 'disclosure:x:0', cycleCount: 3, speakerId: 'player', listenerIds: ['detective-a'], propositionId: 'fact:F001', sourceEventId: 'turn:x', evidenceQuote: '我看到收据了', evidenceSpans: [{ assertionIndex: 0, lineIndex: 0, quote: '我看到收据了' }] }],
      commitments: [active], acknowledgedCommitmentBoundaryIds: ['commitment-boundary:commitment:turn-1:0'],
    } });
    const reset = resetCharacterContinuity(memory, 4);
    expect(reset.cognition).toContainEqual(expect.objectContaining({ cognitionId: 'player|fact:F001' }));
    expect(reset.cognition.some(item => item.cognitionId === 'detective-a|fact:F001')).toBe(false);
    expect(reset.disclosures).toHaveLength(1);
    expect(reset.commitments).toContainEqual(expect.objectContaining({ id: active.id, status: 'expired', expiredReason: 'reset' }));
    expect(reset.acknowledgedCommitmentBoundaryIds).toEqual([]);
  });

  it('acknowledges a due boundary once without auto-fulfillment, then expires it after due time', () => {
    const before = normalizeWorldMemory({ cycleCount: 3, worldMemory: {
      ...normalizeWorldMemory({ cycleCount: 3 }), commitments: [active],
    } });
    const boundaryId = activeCommitmentBoundaries(before, 3)[0].id;
    const due = buildTurnCommit({
      turnId: 'at-due', turnIndex: 2, createdAt: 2, occurredAt: active.dueAt,
      locationId: 'school', cycleCount: 3, summary: '约定时间到了。',
      scene: scene(['旁白', '十点到了。']), beforeVariables: { cycleCount: 3, worldMemory: before },
      settledVariables: {}, encounteredCommitmentBoundaryId: boundaryId,
    });
    expect(due.worldMemory.commitments).toContainEqual(expect.objectContaining({ id: active.id, status: 'active' }));
    expect(due.worldMemory.acknowledgedCommitmentBoundaryIds).toEqual([boundaryId]);
    expect(activeCommitmentBoundaries(due.worldMemory, 3)).toEqual([]);
    const repeated = buildTurnCommit({
      turnId: 'at-due', turnIndex: 2, createdAt: 2, occurredAt: active.dueAt,
      locationId: 'school', cycleCount: 3, summary: '约定时间到了。',
      scene: scene(['旁白', '十点到了。']), beforeVariables: { cycleCount: 3, worldMemory: due.worldMemory },
      settledVariables: {}, encounteredCommitmentBoundaryId: boundaryId,
    });
    expect(repeated.worldMemory.acknowledgedCommitmentBoundaryIds).toEqual([boundaryId]);
    const missed = buildTurnCommit({
      turnId: 'past-due', turnIndex: 3, createdAt: 3, occurredAt: '2024-09-09T10:01:00',
      locationId: 'school', cycleCount: 3, summary: '约定已经错过。',
      scene: scene(['旁白', '一分钟过去了。']), beforeVariables: { cycleCount: 3, worldMemory: repeated.worldMemory },
      settledVariables: {},
    });
    expect(missed.worldMemory.commitments).toContainEqual(expect.objectContaining({
      id: active.id, status: 'expired', expiredReason: 'missed', statusSourceEventId: 'turn:past-due',
    }));
  });
});
