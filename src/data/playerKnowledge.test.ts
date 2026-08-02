import { describe, expect, it } from 'vitest';
import {
  buildPlayerKnowledgeBrief,
  getLocationPresentation,
  getPlayerEntities,
  getKnowledgeVisualUpdates,
  getVisibleLocationPresentations,
  normalizeKnowledgeEvents,
  resolvePlayerFacingSpeaker,
} from './playerKnowledge';

describe('player knowledge projection', () => {
  it('starts with only locations the player can reasonably know', () => {
    const visible = getVisibleLocationPresentations({ location: 'home', knowledgeEvents: [] });
    expect(visible.map(location => location.id)).toEqual(['home', 'school', 'supermarket']);
    expect(visible.some(location => location.id === 'detective-inn')).toBe(false);
    expect(visible.some(location => location.id === 'water-tower')).toBe(false);
  });

  it('introduces the old man before revealing his residence', () => {
    expect(getLocationPresentation('old-man-building', { location: 'home' })).toBeNull();
    const variables = { location: 'home', knowledgeEvents: ['meet:old-man'] };
    expect(getPlayerEntities(variables).find(person => person.id === 'old-man')?.displayName).toBe('周大爷');
    expect(getLocationPresentation('old-man-building', variables)?.name).toBe('周大爷住的旧楼');
  });

  it('keeps a rumored water-tower clue non-travelable until its route is confirmed', () => {
    const rumored = getLocationPresentation('water-tower', {
      location: 'home',
      knowledgeEvents: ['find:water-tower-fragment'],
    });
    expect(rumored?.stage).toBe('rumored');
    expect(rumored?.name).toBe('山中的旧设施？');
    expect(rumored?.canTravel).toBe(false);

    const located = getLocationPresentation('water-tower', {
      location: 'home',
      knowledgeEvents: ['find:water-tower-fragment', 'locate:water-tower-route'],
    });
    expect(located?.stage).toBe('located');
    expect(located?.name).toBe('废弃水塔');
    expect(located?.canTravel).toBe(true);
  });

  it('uses diegetic aliases for the investigators and inn', () => {
    const observed = { location: 'home', knowledgeEvents: ['observe:shaved-man'] };
    expect(getPlayerEntities(observed).find(person => person.id === 'detective-a')?.displayName).toBe('寸头男人');
    expect(getLocationPresentation('detective-inn', observed)).toBeNull();

    const followed = { location: 'home', knowledgeEvents: ['observe:shaved-man', 'follow:shaved-man-to-inn'] };
    expect(getLocationPresentation('detective-inn', followed)?.name).toBe('黔灵旅社');
    expect(JSON.stringify(buildPlayerKnowledgeBrief(followed))).not.toContain('侦探小旅馆');
  });

  it('migrates recognized legacy clue ids into knowledge events', () => {
    expect(normalizeKnowledgeEvents([], ['water-tower-route'])).toEqual(expect.arrayContaining([
      'find:water-tower-fragment',
      'locate:water-tower-route',
    ]));
  });

  it('shows a game character as unknown until the introduction event completes', () => {
    expect(resolvePlayerFacingSpeaker('周德明', 'old-man-normal.png', { location: 'home' })).toBe('？？？');
    expect(resolvePlayerFacingSpeaker('周德明', 'old-man-normal.png', {
      location: 'home', knowledgeEvents: ['meet:old-man'],
    })).toBe('周大爷');
  });

  it('reveals the clerk and teacher profiles only after their first meetings', () => {
    const before = getPlayerEntities({ location: 'home', knowledgeEvents: [] });
    expect(before.some(entity => entity.id === 'chen-huihui')).toBe(false);
    expect(before.some(entity => entity.id === 'liu-renguang')).toBe(false);

    const after = getPlayerEntities({
      location: 'school',
      knowledgeEvents: ['meet:chen-huihui', 'meet:liu-renguang'],
    });
    expect(after.find(entity => entity.id === 'chen-huihui')?.portrait).toBe('chen-huihui-normal.png');
    expect(after.find(entity => entity.id === 'liu-renguang')?.portrait).toBe('liu-renguang-normal.png');
  });

  it('only authorizes each new profile at the character’s own location', () => {
    const supermarketDiscoveries = buildPlayerKnowledgeBrief({ location: 'supermarket', knowledgeEvents: [] })
      .allowedDiscoveries.map(item => item.eventId);
    const schoolDiscoveries = buildPlayerKnowledgeBrief({ location: 'school', knowledgeEvents: [] })
      .allowedDiscoveries.map(item => item.eventId);

    expect(supermarketDiscoveries).toContain('meet:chen-huihui');
    expect(supermarketDiscoveries).not.toContain('meet:liu-renguang');
    expect(schoolDiscoveries).toContain('meet:liu-renguang');
    expect(schoolDiscoveries).not.toContain('meet:chen-huihui');
  });

  it('creates visual updates for both a new profile and its newly known location', () => {
    const before = { location: 'home', knowledgeEvents: [] };
    const after = { location: 'home', knowledgeEvents: ['meet:old-man'] };
    const updates = getKnowledgeVisualUpdates(before, after);
    expect(updates).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'character-new', title: '周大爷' }),
      expect.objectContaining({ kind: 'location-located', title: '周大爷住的旧楼' }),
    ]));
  });
});
