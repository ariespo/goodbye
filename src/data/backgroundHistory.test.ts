import { describe, expect, it } from 'vitest';
import { FIXED_BACKGROUND_FACTS, reviewBackgroundFactProposal } from './backgroundHistory';

describe('pre-game background history', () => {
  it('contains the established convenience-store and guardian-contact history', () => {
    expect(FIXED_BACKGROUND_FACTS.map(fact => fact.factId)).toEqual(expect.arrayContaining([
      'bg:supermarket-regulars',
      'bg:teacher-guardian-contact',
      'bg:detective-dossier',
    ]));
  });

  it('accepts mundane habits and rejects case or severe-history proposals', () => {
    const base = {
      proposalId: 'coffee', characterIds: ['player', 'chen-huihui'], locationIds: ['supermarket'],
      knowerIds: ['chen-huihui'], evidenceText: '你还是买无糖咖啡',
    };
    expect(reviewBackgroundFactProposal({ ...base, text: '玩家平时会买无糖咖啡。' }).approved).toBe(true);
    expect(reviewBackgroundFactProposal({ ...base, text: '文穗今早七点半买了绷带后去了山上。' }).approved).toBe(false);
    expect(reviewBackgroundFactProposal({ ...base, text: '慧慧曾遭受严重霸凌。' }).approved).toBe(false);
  });
});
