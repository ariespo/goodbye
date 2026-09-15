import { describe, expect, it } from 'vitest';
import { buildMysteryBrief } from './brief';
import { buildAliasedMysteryBrief, createFactAliasTable } from './fact-aliases';
import { buildAssertionSources, validateAssertionAudit, type AssertionAudit } from './fact-assertion-review';
import { buildWriterPacket } from './review';
import { MYSTERY_TRUTH_GRAPH } from './truth-graph';
import type { DirectorPlan, MysteryBrief, TruthContext, WriterPacket } from './types';

const factId = 'F002';
const sourceId = 'known-fact:F002:atmosphere';
const knownText = '门卫说，今天在校门口见过文穗。';
const repeatedText = '今天在校门口见过文穗。';

function schoolBrief(overrides: Partial<TruthContext> = {}): MysteryBrief {
  return buildAliasedMysteryBrief(buildMysteryBrief(MYSTERY_TRUTH_GRAPH, {
    cycleCount: 1,
    currentLocation: 'school',
    lockedRoute: null,
    unlockedClueIds: [],
    playerKnowledge: { 'shared-school-absence': 'atmosphere' },
    suspicion: {},
    activeNpcIds: ['school-guard', 'touko'],
    ...overrides,
  }), createFactAliasTable(MYSTERY_TRUTH_GRAPH));
}

function plan(): DirectorPlan {
  return { turnGoal: '回应玩家', tone: '平静', beats: [], revelations: [], optionIntents: [], assetRequests: [] };
}

function repeatAudit(citationSourceId = sourceId, citationQuote = repeatedText): AssertionAudit {
  return {
    reviewedFields: ['maintext'],
    assertions: [{
      field: 'maintext', quote: repeatedText, proposition: '文穗今天到过校门口', status: 'supported',
      citations: [{ sourceId: citationSourceId, quote: citationQuote }], reason: '逐字引用已经获准的见闻。',
    }],
  };
}

function reviewRepeat(packet: WriterPacket, speaker = 'school-guard', audit = repeatAudit()) {
  const fields = { maintext: `对话|${speaker}|calm|${repeatedText}` };
  return validateAssertionAudit(audit, buildAssertionSources(packet, fields), fields);
}

describe('known fact speaker projection', () => {
  it('lets the same currently authorized witness repeat the accepted F002 atmosphere fact', () => {
    const packet = buildWriterPacket(plan(), schoolBrief());

    expect(packet.authorizedFacts).toEqual([]);
    expect(reviewRepeat(packet)).toMatchObject({ approved: true, violations: [] });
    expect(packet.knownFactSpeakers).toEqual([{ factId: 'F002', level: 'atmosphere', speakerIds: ['school-guard'] }]);
    expect(buildAssertionSources(packet)).toContainEqual({
      id: sourceId, kind: 'fact', factId: 'F002', level: 'atmosphere', text: knownText, speakerIds: ['school-guard'],
    });
    expect(JSON.stringify(packet.knownFactSpeakers)).not.toContain('shared-school-absence');
    expect(JSON.stringify(packet)).not.toContain('canonicalTruth');
  });

  it('does not authorize an unrelated active NPC or a character merely named in the fact', () => {
    const packet = buildWriterPacket(plan(), schoolBrief({ activeNpcIds: ['school-guard', 'touko', 'fumi'] }));

    expect(reviewRepeat(packet, 'touko').violations).toContainEqual(expect.objectContaining({ code: 'invalid-assertion-citation' }));
    expect(reviewRepeat(packet, 'fumi').approved).toBe(false);
  });

  it.each([
    ['inactive witness', { activeNpcIds: ['touko'] }],
    ['fact gated by current location', { currentLocation: 'home' }],
    ['stale higher revelation on day one', { playerKnowledge: { 'shared-school-absence': 'clue' as const } }],
    ['no player-known fact', { playerKnowledge: {} }],
  ] satisfies Array<[string, Partial<TruthContext>]>)('does not grant a speaker for %s', (_name, overrides) => {
    const packet = buildWriterPacket(plan(), schoolBrief(overrides));

    expect(packet.knownFactSpeakers).toEqual([]);
    expect(reviewRepeat(packet).approved).toBe(false);
  });

  it.each([
    ['absent usable fact', (brief: MysteryBrief) => { brief.usableFacts = []; }],
    ['mismatched usable fact id', (brief: MysteryBrief) => { brief.usableFacts[0].id = 'F999'; }],
    ['absent reveal option', (brief: MysteryBrief) => { brief.usableFacts[0].revealOptions = []; }],
    ['mismatched reveal option id', (brief: MysteryBrief) => { brief.usableFacts[0].revealOptions[0].id = 'F999'; }],
    ['mismatched text', (brief: MysteryBrief) => { brief.usableFacts[0].revealOptions[0].text = '门卫说，昨天见过文穗。'; }],
    ['mismatched level', (brief: MysteryBrief) => { brief.usableFacts[0].revealOptions[0].level = 'hint'; }],
    ['absent NPC knowledge', (brief: MysteryBrief) => { brief.npcKnowledge = []; }],
    ['mismatched NPC fact id', (brief: MysteryBrief) => { brief.npcKnowledge[0].facts[0].factId = 'F999'; }],
  ])('does not infer authority from a named witness with %s', (_name, change) => {
    const brief = schoolBrief();
    change(brief);
    const packet = buildWriterPacket(plan(), brief);

    expect(packet.knownFactSpeakers).toEqual([]);
    expect(reviewRepeat(packet).violations).toContainEqual(expect.objectContaining({ code: 'invalid-assertion-citation' }));
  });

  it.each(['believes', 'suspects', 'lies-about'] as const)('does not promote %s into a factual speaker grant', stance => {
    const brief = schoolBrief();
    brief.npcKnowledge[0].facts[0].stance = stance;
    const packet = buildWriterPacket(plan(), brief);

    expect(packet.knownFactSpeakers).toEqual([]);
    expect(reviewRepeat(packet).approved).toBe(false);
  });

  it.each(['fact cap', 'NPC knowledge cap'] as const)('does not grant a known hint above the current %s', cap => {
    const brief = schoolBrief({ cycleCount: 2, playerKnowledge: { 'shared-school-absence': 'hint' } });
    if (cap === 'fact cap') brief.usableFacts.find(fact => fact.id === factId)!.maxRevealLevel = 'atmosphere';
    else brief.npcKnowledge[0].facts.find(fact => fact.factId === factId)!.maxRevealLevel = 'atmosphere';
    const packet = buildWriterPacket(plan(), brief);
    const fields = { maintext: '对话|school-guard|calm|门卫记得文穗在校门口短暂停留。' };
    const audit = repeatAudit('known-fact:F002:hint', '门卫记得文穗在校门口短暂停留。');
    audit.assertions[0].quote = '门卫记得文穗在校门口短暂停留。';

    expect(packet.knownFactSpeakers).toEqual([]);
    expect(validateAssertionAudit(audit, buildAssertionSources(packet), fields).approved).toBe(false);
  });

  it.each(['sceneContract', 'sceneContracts'] as const)('does not grant a witness forbidden by %s', field => {
    const brief = schoolBrief();
    const contract = {
      destinationLocationId: 'school', destinationBackground: 'school', entryMode: 'exterior' as const,
      requiredDestinationNpcIds: [], requiredEnRouteNpcIds: [], forbiddenNpcIds: ['school-guard'],
      requiredKnowledgeEvents: [], forbiddenKnowledgeEventIds: [], directive: '门卫当前不出场。',
    };
    if (field === 'sceneContract') brief.sceneContract = contract;
    else brief.sceneContracts = [contract];
    const approvedPlan = plan();
    approvedPlan.beats = [{ id: 'wait', purpose: '等待', description: '玩家在校门外停下。', locationId: 'school' }];
    const packet = buildWriterPacket(approvedPlan, brief);

    expect(packet.knownFactSpeakers).toEqual([]);
    expect(reviewRepeat(packet).approved).toBe(false);
  });

  it('does not add a speaker grant for the saturated actor while another NPC intervenes', () => {
    const brief = schoolBrief();
    brief.npcKnowledge[1].facts = [{ factId, maxRevealLevel: 'atmosphere', stance: 'knows' }];
    brief.saturationPivot = {
      blockedActorId: 'school-guard', redirectedActorId: 'detective-b', factId,
      interveningNpcId: 'touko', currentLocationId: 'school', requiredSuspicionGain: 5, directive: '东子介入。',
    };
    const approvedPlan = plan();
    approvedPlan.beats = [
      { id: 'original', purpose: '回应原调查', description: '门卫回应玩家。', speakerIds: ['school-guard'], locationId: 'school' },
      { id: 'intervene', purpose: '介入', description: '东子随后走近。', speakerIds: ['touko'], locationId: 'school' },
    ];
    approvedPlan.revelations = [{ factId, level: 'atmosphere', delivery: 'dialogue', speakerId: 'touko' }];
    const packet = buildWriterPacket(approvedPlan, brief);

    expect(packet.knownFactSpeakers).toEqual([{ factId, level: 'atmosphere', speakerIds: ['touko'] }]);
    expect(reviewRepeat(packet).approved).toBe(false);
    expect(reviewRepeat(packet, 'touko').approved).toBe(true);
  });

  it('keeps the divert policy effective if the executed brief no longer carries its pivot', () => {
    const packet = buildWriterPacket(plan(), schoolBrief(), {
      playerIntentPolicy: { mode: 'divert', targetedActorId: 'school-guard' },
    });

    expect(packet.knownFactSpeakers).toEqual([]);
    expect(reviewRepeat(packet).approved).toBe(false);
  });

  it.each([
    ['fake source id', 'known-fact:F999:atmosphere', repeatedText],
    ['invented source quote', sourceId, '文穗今天进入了学校。'],
    ['higher source level', 'known-fact:F002:clue', repeatedText],
  ])('still rejects a %s after the speaker is authorized', (_name, citationSourceId, citationQuote) => {
    const packet = buildWriterPacket(plan(), schoolBrief());

    expect(reviewRepeat(packet, 'school-guard', repeatAudit(citationSourceId, citationQuote)).violations)
      .toContainEqual(expect.objectContaining({ code: 'invalid-assertion-citation' }));
  });

  it.each([
    ['missing grant', undefined],
    ['grant for another fact', [{ factId: 'F999', level: 'atmosphere' as const, speakerIds: ['school-guard'] }]],
    ['grant for another level', [{ factId, level: 'hint' as const, speakerIds: ['school-guard'] }]],
  ])('keeps packet compatibility conservative with %s', (_name, grants) => {
    const packet = { ...buildWriterPacket(plan(), schoolBrief()), knownFactSpeakers: grants };

    expect(reviewRepeat(packet).approved).toBe(false);
    expect(reviewRepeat(packet, 'player').approved).toBe(true);
    expect(reviewRepeat(packet, '旁白').approved).toBe(true);
  });
});
