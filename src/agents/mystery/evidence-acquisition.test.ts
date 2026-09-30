import { describe, expect, it } from 'vitest';
import { buildMysteryBrief } from './brief';
import { buildAliasedMysteryBrief, createFactAliasTable } from './fact-aliases';
import { buildAssertionSources, buildCanonicalPropositionBySourceId } from './fact-assertion-review';
import { buildWriterPacket } from './review';
import { MYSTERY_TRUTH_GRAPH } from './truth-graph';
import type { DirectorPlan, RevealLevel } from './types';
import { selectPresentedActionFacts } from './action-authority';

const aliases = createFactAliasTable(MYSTERY_TRUTH_GRAPH);
function briefAt(location: string, cycleCount = 3) {
  return buildAliasedMysteryBrief(buildMysteryBrief(MYSTERY_TRUTH_GRAPH, {
    cycleCount, currentLocation: location, currentTime: '2024-09-09T16:30:00', lockedRoute: null,
    unlockedClueIds: [], playerKnowledge: {}, suspicion: {}, activeNpcIds: [],
  }), aliases);
}

describe('authored evidence acquisition', () => {
  it.each([
    ['a-orphanage-contact', 'old-man-building', 'clue', '出示'],
    ['a-orphanage-contact', 'water-tower', 'hint', '夹页'],
    ['b-commission-message', 'community-hospital', 'clue', '允许'],
    ['b-commission-message', 'detective-inn', 'hint', '允许'],
  ] as const)('carries the gated source through director, writer and assertion review: %s %s %s', (id, location, level, origin) => {
    const brief = briefAt(location);
    const factId = aliases.factIdToAlias[id];
    const plan: DirectorPlan = { turnGoal: '现场查阅材料', tone: '平静', beats: [],
      revelations: [{ factId, level: level as RevealLevel, delivery: 'object' }], optionIntents: [], assetRequests: [] };
    const packet = buildWriterPacket(plan, brief);
    expect(packet.authorizedFacts[0]).toEqual(expect.objectContaining({ acquisition: expect.stringContaining(origin) }));
    const sources = buildAssertionSources(packet);
    const accessId = `action-outcome:acquisition:${factId}:${level}`;
    expect(sources.find(source => source.id === accessId)).toMatchObject({ kind: 'action-outcome', text: expect.stringContaining(origin) });
    expect(buildCanonicalPropositionBySourceId(sources, aliases)).not.toHaveProperty(accessId);
    expect(selectPresentedActionFacts(packet, { approved: true, violations: [], corrections: [], assertionAudit: {
      reviewedFields: ['maintext'], assertions: [{ field: 'maintext', quote: '你获准查阅。', proposition: '玩家查阅材料',
        status: 'supported', citations: [{ sourceId: accessId, quote: sources.find(source => source.id === accessId)!.text }], reason: '取得动作' }],
    } }, [`fact:${factId}:${level}`]).authorizedFacts).toEqual([]);
    expect(sources.find(source => source.id === `fact:${factId}:${level}`)?.text).not.toContain('允许');
    expect(JSON.stringify(packet)).not.toContain('canonicalTruth');
    if (level === 'hint' && id === 'a-orphanage-contact') expect(JSON.stringify(packet.authorizedFacts)).not.toContain('孤儿院查询便笺');
  });

  it('does not give the writer acquisition material for unselected or still locked evidence', () => {
    const brief = briefAt('community-hospital', 1);
    expect(brief.usableFacts.some(fact => fact.id === aliases.factIdToAlias['b-commission-message'])).toBe(false);
    const packet = buildWriterPacket({ turnGoal: '普通询问', tone: '平静', beats: [], revelations: [], optionIntents: [], assetRequests: [] }, brief);
    expect(JSON.stringify(packet)).not.toContain('委托讯息');
  });
});
