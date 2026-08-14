import { describe, expect, it } from 'vitest';
import {
  appendCharacterPerformancePrompt,
  CHARACTER_PERFORMANCE_PROFILES,
  projectCharacterPerformances,
} from './characterPerformance';
import { buildPlayerKnowledgeBrief } from './playerKnowledge';

describe('character performance profiles', () => {
  it('covers every runtime character that can speak in the mystery pipeline', () => {
    const ids = new Set(CHARACTER_PERFORMANCE_PROFILES.map(profile => profile.id));
    expect(ids).toEqual(new Set([
      'fumi',
      'touko',
      'old-man',
      'detective-a',
      'detective-b',
      'chen-huihui',
      'liu-renguang',
      'school-guard',
      'morning-witness',
    ]));
    for (const profile of CHARACTER_PERFORMANCE_PROFILES) {
      expect(profile.publicIdentity.length).toBeGreaterThan(0);
      expect(profile.actionRules.length).toBeGreaterThan(0);
      expect(profile.reactionRules.length).toBeGreaterThan(0);
      expect(profile.dialogueRules.length).toBeGreaterThan(0);
      expect(profile.emotionRules.length).toBeGreaterThan(0);
      expect(profile.forbiddenPortrayals.length).toBeGreaterThan(0);
    }
  });

  it('anchors the three conditional suspects in their ordinary public identities', () => {
    const profiles = new Map(CHARACTER_PERFORMANCE_PROFILES.map(profile => [profile.id, profile]));
    expect(profiles.get('detective-a')?.publicIdentity).toContain('货车司机');
    expect(profiles.get('detective-b')?.publicIdentity).toContain('普通护士');
    expect(profiles.get('detective-b')?.publicIdentity).toContain('刚来到本地');
    expect(profiles.get('detective-b')?.emotionRules.join('\n')).toContain('只使用 calm 情绪标签');
    expect(profiles.get('old-man')?.publicIdentity).toContain('普通退休老人');
    const serialized = JSON.stringify([
      profiles.get('detective-a'),
      profiles.get('detective-b'),
      profiles.get('old-man'),
    ]);
    expect(serialized).not.toContain('杀害');
    expect(serialized).not.toContain('移尸');
    expect(serialized).not.toContain('邪教');
  });

  it('keeps Huihui tense, sweaty, awkwardly friendly, and unsettling without making her malicious', () => {
    const huihui = CHARACTER_PERFORMANCE_PROFILES.find(profile => profile.id === 'chen-huihui');
    const serialized = JSON.stringify(huihui);
    expect(serialized).toContain('紧张');
    expect(serialized).toContain('不自然的笑容');
    expect(serialized).toContain('冒汗');
    expect(serialized).toContain('阴湿感');
    expect(serialized).toContain('结巴');
    expect(serialized).toContain('吃、吃吃……');
    expect(serialized).toContain('自认为这是友好');
    expect(serialized).toContain('不是超自然气息，也不是犯罪暗示');
  });

  it('only projects known, active, or discoverable characters', () => {
    const home = buildPlayerKnowledgeBrief({ location: 'home', knowledgeEvents: ['meet:touko'] });
    const ids = projectCharacterPerformances(home, []).map(profile => profile.id);
    expect(ids).toContain('fumi');
    expect(ids).toContain('touko');
    expect(ids).toContain('old-man');
    expect(ids).not.toContain('detective-a');
    expect(ids).not.toContain('detective-b');
    expect(ids).not.toContain('school-guard');

    const school = buildPlayerKnowledgeBrief({ location: 'school', knowledgeEvents: [] });
    const schoolIds = projectCharacterPerformances(school, ['school-guard']).map(profile => profile.id);
    expect(schoolIds).toContain('school-guard');
    expect(schoolIds).toContain('liu-renguang');
  });

  it('adds the same scoped performance rules to legacy prompts without granting facts', () => {
    const presentation = buildPlayerKnowledgeBrief({ location: 'home', knowledgeEvents: ['meet:touko'] });
    const prompt = appendCharacterPerformancePrompt('和灯织聊聊', presentation, []);
    expect(prompt).toContain('[角色表演规则]');
    expect(prompt).toContain('生气时不提高音量');
    expect(prompt).toContain('只按 publicIdentity 与日常规则演绎');
    expect(prompt).not.toContain('detective-b');
    expect(prompt).not.toContain('canonicalTruth');
  });
});
