import { describe, expect, it } from 'vitest';
import { createFactAliasTable } from '../agents/mystery/fact-aliases';
import { MYSTERY_TRUTH_GRAPH } from '../agents/mystery/truth-graph';
import { deriveNewOpportunitySourceIds, buildProgramChecklistActions } from './opportunity-integration';
import { insertTagsIntoMaintext, serializeChecklistToTags } from '../agents/mystery/scene-list';
import { rebuildSceneFromChat } from '../utils/sceneFromChat';

describe('opportunity runtime integration', () => {
  it('derives only genuinely new committed fact levels and knowledge ids using public aliases', () => {
    const aliases = createFactAliasTable(MYSTERY_TRUTH_GRAPH);
    const before = {
      mysteryKnowledge: { 'shared-apron-missing': 'atmosphere' },
      knowledgeEvents: ['meet:chen-huihui'],
    };
    const authorized = {
      mysteryKnowledge: {
        'shared-apron-missing': 'clue',
        'shared-school-absence': 'atmosphere',
      },
      knowledgeEvents: ['meet:chen-huihui', 'insight:school-guard'],
    };

    expect(deriveNewOpportunitySourceIds(before, authorized, aliases)).toEqual([
      'fact:F001:clue',
      'fact:F002:atmosphere',
      'accepted-event:insight:school-guard',
    ]);
    expect(deriveNewOpportunitySourceIds(authorized, authorized, aliases)).toEqual([]);
  });

  it('offers authored travel, rest and a boundary wait without inventing model prices', () => {
    const actions = buildProgramChecklistActions({
      currentLocationId: 'home',
      currentTime: '2024-09-09T08:00:00',
      variables: { deathNews: 'untriggered' },
      stamina: 80,
      publicLocations: [{ id: 'school', name: '学校', canTravel: true }],
      opportunities: [],
    });

    expect(actions).toEqual([
      { id: 'program:travel:school', publicGoal: '前往学校', kind: 'travel', scope: 'normal', locationId: 'school' },
      { id: 'program:rest:home', publicGoal: '休息一小时', kind: 'rest', scope: 'normal', locationId: 'home', requestedMinutes: 60 },
      { id: 'program:wait:2024-09-09T16:00:00', publicGoal: '等待到下一既定时间点（480分钟）', kind: 'wait', scope: 'normal', locationId: 'home', requestedMinutes: 480 },
    ]);
  });

  it('quotes quiet wait against an earlier active commitment boundary', () => {
    const actions = buildProgramChecklistActions({
      currentLocationId: 'home',
      currentTime: '2024-09-09T08:00:00',
      variables: { deathNews: 'untriggered' },
      stamina: 120,
      opportunities: [],
      commitmentBoundaries: [{ id: 'commitment-boundary:commitment:turn-1:0', at: '2024-09-09T10:00:00' }],
    });

    expect(actions).toContainEqual(expect.objectContaining({
      id: 'program:wait:2024-09-09T10:00:00',
      requestedMinutes: 120,
    }));
  });

  it('round-trips authoritative menu metadata through persisted checklist tags', () => {
    const tags = serializeChecklistToTags({ observe: '', investigateItems: [{
      desc: '检查文穗留下的衣物和随身物品', suspect: '无', style: '现实', time: '25分钟', stamina: 3, sanity: 0,
      actionId: 'investigation:c1:F001:atmosphere:home',
      opportunityId: 'investigation:c1:F001:atmosphere:home',
      kind: 'investigation', scope: 'short', locationId: 'home',
      quote: { workMinutes: 25, travelMinutes: 0, totalMinutes: 25, staminaCost: 3 },
    }], actionItems: [] });

    const content = insertTagsIntoMaintext(
      '<maintext>对话|旁白|calm|你看了看衣柜。</maintext><option>继续\n休息</option><sum>检查衣柜。</sum>',
      tags,
    );
    const restored = rebuildSceneFromChat({
      id: 'chat', name: 'test', characterName: '文穗', userName: '玩家', presetId: null,
      lorebookIds: [], variables: {}, createdAt: 0, updatedAt: 0,
      messages: [{ id: 'assistant', role: 'assistant', content, timestamp: 0, variables: {} }],
    });
    expect(restored.investigateItems?.[0]).toMatchObject({
      actionId: 'investigation:c1:F001:atmosphere:home',
      opportunityId: 'investigation:c1:F001:atmosphere:home',
      kind: 'investigation', scope: 'short', locationId: 'home',
      quote: { workMinutes: 25, travelMinutes: 0, totalMinutes: 25, staminaCost: 3 },
    });
  });

  it('persists authoritative empty menus so reload cannot resurrect older rows', () => {
    const tags = serializeChecklistToTags(
      { observe: '', investigateItems: [], actionItems: [] },
      undefined,
      { authoritativeMenus: true },
    );
    expect(tags).toContain('<investigate>');
    expect(tags).toContain('<action>');

    const content = insertTagsIntoMaintext(
      '<maintext>对话|旁白|calm|这一轮没有新的明确调查目标。</maintext><option>继续\n休息</option><sum>暂无目标。</sum>',
      tags,
    );
    const restored = rebuildSceneFromChat({
      id: 'chat', name: 'test', characterName: '文穗', userName: '玩家', presetId: null,
      lorebookIds: [], variables: {}, createdAt: 0, updatedAt: 0,
      messages: [{ id: 'assistant', role: 'assistant', content, timestamp: 0, variables: {} }],
    });
    expect(restored).not.toBeNull();
    expect(restored?.investigateItems).toEqual([]);
    expect(restored?.actionItems).toEqual([]);
  });
});
