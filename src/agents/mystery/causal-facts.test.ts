import { describe, expect, it } from 'vitest';
import { buildMysteryBrief } from './brief';
import { MYSTERY_TRUTH_GRAPH } from './truth-graph';
import type { MysteryRouteId, RevealLevel, TruthContext } from './types';

const allClues = Object.fromEntries(MYSTERY_TRUTH_GRAPH.facts.map(fact => [fact.id, 'clue' as const]));
function brief(overrides: Partial<TruthContext> = {}) {
  return buildMysteryBrief(MYSTERY_TRUTH_GRAPH, {
    cycleCount: 5, currentTime: '2024-09-09T16:10:00', currentLocation: 'home', lockedRoute: null, unlockedClueIds: [],
    playerKnowledge: {}, suspicion: {}, activeNpcIds: [], ...overrides,
  });
}

describe('version-compatible evidence access', () => {
  it.each([undefined, 'invalid', '2024-09-09T08:00:00', '2024-09-09T15:59:59'])('withholds new post-notification findings at %s', currentTime => {
    const result = brief({ currentTime, currentLocation: 'community-hospital' });
    expect(result.usableFacts.some(fact => fact.id === 'fake-body-mismatch')).toBe(false);
  });

  it('makes the initial notification record obtainable at 16:00 using the displayed local clock', () => {
    const result = brief({ currentTime: new Date('2024-09-09T16:00:00').toISOString(), currentLocation: 'community-hospital' });
    expect(result.usableFacts.some(fact => fact.id === 'fake-body-mismatch')).toBe(true);
  });

  it('does not disclose Touko receiving a post-notification message before the notification time', () => {
    const early = brief({ currentTime: '2024-09-09T08:00:00', currentLocation: 'senpai-building', affinity: { touko: 80 } });
    expect(early.usableFacts.some(fact => fact.id === 'fake-touko-request')).toBe(false);
  });

  it('allows morning recall of acquired materials without authorizing a new solution upgrade', () => {
    const result = brief({ currentTime: '2024-09-09T08:00:00', lockedRoute: 'A', currentLocation: 'old-man-building',
      playerKnowledge: { ...allClues, 'a-murder-staged-fall': 'clue' } });
    expect(result.playerKnownFacts.find(fact => fact.id === 'a-murder-staged-fall')?.level).toBe('clue');
    expect(result.usableFacts.some(fact => fact.id === 'a-murder-staged-fall')).toBe(false);
  });
  it('makes substantive evidence accessible on days one through three without permitting solutions', () => {
    for (const cycleCount of [1, 2, 3]) {
      const result = brief({ cycleCount, currentLocation: 'school', lockedRoute: 'A', playerKnowledge: allClues });
      expect(result.usableFacts.find(f => f.id === 'shared-school-absence')?.maxRevealLevel).toBe('clue');
      expect(result.revealBudget.maxNewFacts).toBe(1);
      expect(result.revealBudget.allowConfirmation).toBe(false);
      expect(result.usableFacts.some(f => f.kind === 'solution')).toBe(false);
    }
  });

  it('does not let suspicion create or withhold obtainable evidence', () => {
    const low = brief({ cycleCount: 3, currentLocation: 'old-man-building', suspicion: { 'old-man': 0 } });
    const high = brief({ cycleCount: 3, currentLocation: 'old-man-building', suspicion: { 'old-man': 50 } });
    expect(low.usableFacts.find(f => f.id === 'a-sacrifice-list')?.maxRevealLevel).toBe('clue');
    expect(low.usableFacts).toEqual(high.usableFacts);
  });

  it('does not count remembered hints or bare clue ids as a causal prerequisite', () => {
    const result = brief({ currentLocation: 'old-man-building', unlockedClueIds: ['a-sacrifice-list'],
      playerKnowledge: { 'a-sacrifice-list': 'hint' }, suspicion: { 'old-man': 50 } });
    expect(result.usableFacts.some(f => f.id === 'a-lured-inside')).toBe(false);
  });

  it('keeps earlier materials but downgrades another version confirmation and hides its solution', () => {
    const result = brief({ lockedRoute: 'C', playerKnowledge: {
      'a-lured-inside': 'confirmation', 'a-murder-staged-fall': 'confirmation',
      'shared-school-absence': 'clue',
    } });
    expect(result.playerKnownFacts.find(f => f.id === 'a-lured-inside')?.level).toBe('clue');
    expect(result.playerKnownFacts.some(f => f.id === 'a-murder-staged-fall')).toBe(false);
    expect(result.playerKnownFacts.find(f => f.id === 'shared-school-absence')?.text).toContain('不能确认');
  });

  it('hides imported solutions while no version is selected', () => {
    const result = brief({ playerKnowledge: { 'a-murder-staged-fall': 'confirmation' } });
    expect(result.playerKnownFacts).toEqual([]);
  });

  it('keeps a legacy current-version solution out of Writer memory until its causal prerequisites exist', () => {
    const stale = brief({ lockedRoute: 'A', playerKnowledge: { 'a-murder-staged-fall': 'confirmation' } });
    expect(stale.playerKnownFacts.some(fact => fact.kind === 'solution')).toBe(false);
    const complete = brief({ lockedRoute: 'A', currentTime: '2024-09-09T08:00:00',
      playerKnowledge: { ...allClues, 'a-murder-staged-fall': 'confirmation' } });
    expect(complete.playerKnownFacts.find(fact => fact.id === 'a-murder-staged-fall')?.level).toBe('confirmation');
  });

  it('does not use a stale base confirmation to unlock the deeper explanation', () => {
    const knowledge: Record<string, RevealLevel> = { ...allClues, 'c-player-killed-fumi': 'confirmation' };
    delete knowledge['c-domestic-injury-match'];
    const result = brief({ lockedRoute: 'C', activeOverlay: 'PSYCH', currentLocation: 'community-hospital',
      sanity: 10, playerKnowledge: knowledge });
    expect(result.usableFacts.some(fact => fact.id === 'psych-investigation-is-episode')).toBe(false);
  });

  it.each([
    ['A', 'old-man-building', 'a-murder-staged-fall', 'a-window-transfer-match'],
    ['B', 'water-tower', 'b-accidental-killing', 'b-contact-injury-match'],
    ['C', 'home', 'c-player-killed-fumi', 'c-domestic-injury-match'],
    ['NONE', 'observation-deck', 'none-accidental-goodbye', 'none-unassisted-fall-record'],
    ['FAKE', 'observation-deck', 'fake-staged-death-escape', 'fake-verified-survival'],
  ] as const)('requires the %s external causal evidence before exposing a solution', (route, location, solution, causal) => {
    const knowledge: Record<string, RevealLevel> = { ...allClues };
    delete knowledge[causal];
    const base = { lockedRoute: route as MysteryRouteId, currentLocation: location, playerKnowledge: knowledge,
      unlockedClueIds: Object.keys(knowledge), tripProgress: 100, suspicion: { self: 50, 'old-man': 50, 'detective-a': 50 } };
    expect(brief(base).usableFacts.some(f => f.id === solution)).toBe(false);
    const ready = brief({ ...base, playerKnowledge: { ...knowledge, [causal]: 'clue' } });
    expect(ready.usableFacts.find(f => f.id === solution)?.maxRevealLevel).toBe('confirmation');
  });

  it('does not let an overlay explain away an unconfirmed base crime', () => {
    const base = { lockedRoute: 'C' as const, activeOverlay: 'PSYCH' as const, currentLocation: 'community-hospital',
      sanity: 10, playerKnowledge: allClues, unlockedClueIds: Object.keys(allClues) };
    expect(brief(base).usableFacts.some(f => f.id === 'psych-investigation-is-episode')).toBe(false);
    expect(brief({ ...base, playerKnowledge: { ...allClues, 'c-player-killed-fumi': 'confirmation' } })
      .usableFacts.find(f => f.id === 'psych-investigation-is-episode')?.maxRevealLevel).toBe('confirmation');
  });
});
