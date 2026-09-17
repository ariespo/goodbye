import { candidateFingerprint } from '../../memory/character-continuity';
import type { Scene } from '../../sillytavern/types';
import type { FactReview, WriterPacket } from './types';

/** Mode is deliberately conservative for unknown external/old callers. */
export function styleSemanticModeForTurn(mode: unknown, packet: WriterPacket): 'adaptive' | 'full' {
  if (mode !== 'standard' || packet.authorizedFacts.some(fact => fact.level === 'confirmation')
    || packet.authorizedKnowledgeEvents.length > 0 || packet.approvedBackgroundFactProposals.length > 0
    || packet.resolvedAction?.interruption || packet.resolvedAction?.eventEffectIds.length) return 'full';
  return 'adaptive';
}

export function decideStateReview(input: {
  forceFull: boolean;
  packet: WriterPacket;
  narrative: string;
  scene: Pick<Scene, 'lines'>;
  acceptedReview?: FactReview;
  newEvidenceCount: number;
  saturationPivot?: unknown;
}): { run: boolean; reason: string } {
  const full = (reason: string) => ({ run: true, reason });
  if (input.forceFull || input.saturationPivot) return full('full-policy');
  const { packet, acceptedReview: review } = input;
  if (input.newEvidenceCount > 0 || packet.authorizedFacts.length > 0 || packet.authorizedKnowledgeEvents.length > 0
    || packet.approvedBackgroundFactProposals.length > 0) return full('authorized-change');
  const resolved = packet.resolvedAction;
  if (!resolved || resolved.interruption || resolved.eventEffectIds.length > 0 || resolved.segments.length === 0
    || !resolved.segments.some(segment => segment.executedMinutes > 0)
    || resolved.segments.some(segment => segment.executedMinutes > 0 && !['travel', 'rest', 'wait'].includes(segment.step.kind))
    || resolved.segments.some(segment => ['event', 'fantasy'].includes(segment.step.kind))) return full('non-fixed-or-unknown-action');
  const effects = review?.continuityEffects;
  if (!review?.approved || !review.assertionAudit?.assertions.length || !review.assertionAudit.reviewedFields.length
    || !effects || effects.candidateId !== candidateFingerprint(input.narrative)) return full('missing-current-audit');
  if (effects.cognitionDeltas.length || effects.disclosures.length || effects.commitmentOperations.length
    || review.assertionAudit.assertions.some(assertion => assertion.status !== 'ordinary-present' || assertion.citations.length > 0)) return full('reviewed-narrative-effects');
  if (!input.scene.lines.length || input.scene.lines.some(line => line.speaker !== '旁白')
    || packet.plan.beats.some(beat => (beat.speakerIds?.length ?? 0) > 0)) return full('character-interaction');
  // Missing a synonym must not be the sole authority for skipping State: this
  // last guard is applied only after fixed-action and candidate-bound audit gates.
  if (/文穗|灯织|他|她|对方|朋友|家人|同学|信任|相信|亲近|亲密|疏远|原谅|答应|承诺|道歉|喜欢|讨厌|怨恨|感情|恋|爱上|怀疑|嫌疑|推理|推断|线索|证据|整理|判断|倾向|心理|犯罪|神秘|科学|决定|思考|想起|回忆|觉得|意识到|明白/u.test(input.scene.lines.map(line => line.text).join('\n'))) return full('possible-state-effect');
  return { run: false, reason: 'accepted-fixed-action-only' };
}
