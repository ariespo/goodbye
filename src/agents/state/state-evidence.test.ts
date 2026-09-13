import { describe, expect, it } from 'vitest';
import type { MysteryTruthGraph, WriterPacket } from '../mystery/types';
import { buildStateEvidenceAuthority } from './state-evidence';

const graph: MysteryTruthGraph = {
  version: 'test', npcKnowledge: [], facts: [{
    id: 'canonical', route: 'A', kind: 'evidence', canonicalTruth: 'secret',
    characters: ['old-man', 'self'], suspicionTargets: ['old-man'], locations: [],
    revelations: { clue: '老人的证词前后矛盾' }, availability: {},
  }],
};
const packet: Pick<WriterPacket, 'authorizedFacts'> = { authorizedFacts: [{
  id: 'F001', level: 'clue', text: '老人的证词前后矛盾', delivery: 'narration',
}] };

describe('buildStateEvidenceAuthority', () => {
  it('uses canonical ownership while exposing only approved alias and text', () => {
    expect(buildStateEvidenceAuthority(packet, graph, {}, [], { F001: 'canonical' })).toEqual({
      newEvidence: [{ id: 'fact:F001', actorIds: ['old-man'], text: '老人的证词前后矛盾' }],
    });
  });
  it('does not award the same fact again, even when upgraded to confirmation', () => {
    const upgraded = { authorizedFacts: [{ ...packet.authorizedFacts[0], level: 'confirmation' as const }] };
    expect(buildStateEvidenceAuthority(upgraded, graph, { canonical: 'clue' }, [], { F001: 'canonical' }).newEvidence).toEqual([]);
    expect(buildStateEvidenceAuthority(packet, graph, {}, ['canonical'], { F001: 'canonical' }).newEvidence).toEqual([]);
  });
  it('authorizes new early-day hints and an atmosphere-to-hint upgrade once', () => {
    const hintPacket = { authorizedFacts: [{ ...packet.authorizedFacts[0], level: 'hint' as const }] };
    const dayTwoGraph = { ...graph, facts: [{ ...graph.facts[0], availability: { minCycle: 2 } }] };
    const expected = [{ id: 'fact:F001', actorIds: ['old-man'], text: '老人的证词前后矛盾' }];
    expect(buildStateEvidenceAuthority(hintPacket, dayTwoGraph, {}, [], { F001: 'canonical' }).newEvidence).toEqual(expected);
    expect(buildStateEvidenceAuthority(hintPacket, dayTwoGraph, { canonical: 'atmosphere' }, [], { F001: 'canonical' }).newEvidence).toEqual(expected);
    expect(buildStateEvidenceAuthority(packet, graph, { canonical: 'hint' }, [], { F001: 'canonical' }).newEvidence).toEqual([]);
  });
  it('rejects atmosphere, unknown facts, and facts without explicit suspicion ownership', () => {
    expect(buildStateEvidenceAuthority({ authorizedFacts: [{ ...packet.authorizedFacts[0], level: 'atmosphere' }] }, graph, {}, [], { F001: 'canonical' }).newEvidence).toEqual([]);
    expect(buildStateEvidenceAuthority(packet, graph, {}).newEvidence).toEqual([]);
    expect(buildStateEvidenceAuthority(packet, { ...graph, facts: [{ ...graph.facts[0], suspicionTargets: undefined }] }, {}, [], { F001: 'canonical' }).newEvidence).toEqual([]);
  });
});
