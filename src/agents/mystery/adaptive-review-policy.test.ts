import { describe, expect, it } from 'vitest';
import { decideStateReview, styleSemanticModeForTurn } from './adaptive-review-policy';
import { resolveAction } from '../../engine/action-resolution';
import { maintextToScene } from '../../engine/scene-parser';
import { candidateFingerprint } from '../../memory/character-continuity';
import type { WriterPacket, FactReview } from './types';

function fixture() {
  const narrative = '对话|旁白|calm|你在长椅上休息了一会儿。';
  const resolution = resolveAction({ id: 'rest', cycleCount: 1, startTime: '2024-09-09T08:00:00',
    currentLocationId: 'home', stamina: 60, sanity: 70,
    steps: [{ id: 'rest-step', kind: 'rest', scope: 'short', locationId: 'home', requestedMinutes: 10, completionSourceIds: [] }] });
  const packet: WriterPacket = { plan: { turnGoal: '休息', tone: '克制', beats: [], optionIntents: [], assetRequests: [] },
    playerKnownFacts: [], authorizedFacts: [], authorizedKnowledgeEvents: [], authorizedBackgroundFacts: [],
    approvedBackgroundFactProposals: [], forbiddenInstructions: [], characterPerformances: [],
    playerPresentation: { locations: [], entities: [], namingRules: [], allowedDiscoveries: [] }, resolvedAction: resolution };
  const review: FactReview = { approved: true, violations: [], corrections: [], assertionAudit: { reviewedFields: ['maintext'],
    assertions: [{ field: 'maintext', quote: '你在长椅上休息了一会儿。', proposition: '休息', status: 'ordinary-present', citations: [], reason: '当下动作' }] },
    continuityEffects: { candidateId: candidateFingerprint(narrative), cognitionDeltas: [], disclosures: [], commitmentOperations: [] } };
  return { forceFull: false, packet, narrative, scene: maintextToScene(narrative), acceptedReview: review, newEvidenceCount: 0 };
}

describe('adaptive invocation policy', () => {
  it('skips State only for an accepted fixed-cost action with no narrative state effects', () => {
    expect(decideStateReview(fixture()).run).toBe(false);
  });
  it('keeps full State for strict, missing/stale audits and new evidence', () => {
    const input = fixture();
    expect(decideStateReview({ ...input, forceFull: true }).run).toBe(true);
    expect(decideStateReview({ ...input, acceptedReview: undefined }).run).toBe(true);
    expect(decideStateReview({ ...input, narrative: `${input.narrative}变化了` }).run).toBe(true);
    expect(decideStateReview({ ...input, newEvidenceCount: 1 }).run).toBe(true);
  });
  it('retains State for NPC interactions, reflective changes, boundaries and any executed investigation segment', () => {
    const input = fixture();
    expect(decideStateReview({ ...input, scene: maintextToScene('对话|陈慧慧|calm|你先坐着吧。') }).run).toBe(true);
    const reflection = '对话|旁白|calm|你整理线索，开始相信文穗。';
    expect(decideStateReview({ ...input, narrative: reflection, scene: maintextToScene(reflection),
      acceptedReview: { ...input.acceptedReview, continuityEffects: { ...input.acceptedReview.continuityEffects!, candidateId: candidateFingerprint(reflection) } } }).run).toBe(true);
    expect(decideStateReview({ ...input, packet: { ...input.packet, resolvedAction: { ...input.packet.resolvedAction!,
      interruption: { id: 'death-news', at: '2024-09-09T16:00:00' } } } }).run).toBe(true);
    const mixed = { ...input.packet.resolvedAction!, segments: [...input.packet.resolvedAction!.segments,
      { ...input.packet.resolvedAction!.segments[0], step: { ...input.packet.resolvedAction!.segments[0].step, kind: 'inquiry' as const, locationId: 'supermarket' } }] };
    expect(decideStateReview({ ...input, packet: { ...input.packet, resolvedAction: mixed } }).run).toBe(true);
  });
  it('retains State for commitments and cited old evidence despite a fixed action', () => {
    const input = fixture();
    const commitment = { ...input.acceptedReview, continuityEffects: { ...input.acceptedReview.continuityEffects!,
      commitmentOperations: [{ operation: 'cancel' as const, existingCommitmentId: 'promise', actorId: 'player', recipientId: 'fumi', evidenceQuote: 'cancel' }] } };
    expect(decideStateReview({ ...input, acceptedReview: commitment }).run).toBe(true);
    const cited = { ...input.acceptedReview, assertionAudit: { ...input.acceptedReview.assertionAudit!, assertions: [
      { ...input.acceptedReview.assertionAudit!.assertions[0], citations: [{ sourceId: 'known-fact:F001:clue', quote: '旧材料' }] },
    ] } };
    expect(decideStateReview({ ...input, acceptedReview: cited }).run).toBe(true);
  });
  it('keeps important scene and old packet style behavior conservative', () => {
    const { packet } = fixture();
    expect(styleSemanticModeForTurn('standard', packet)).toBe('adaptive');
    expect(styleSemanticModeForTurn('strict', packet)).toBe('full');
    expect(styleSemanticModeForTurn(undefined, packet)).toBe('full');
    expect(styleSemanticModeForTurn('standard', { ...packet, authorizedKnowledgeEvents: [{ eventId: 'meet:x', evidence: '介绍' }] })).toBe('full');
  });
});
