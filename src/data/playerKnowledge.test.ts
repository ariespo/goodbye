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
    const oldMan = getPlayerEntities(variables).find(person => person.id === 'old-man');
    expect(oldMan?.displayName).toBe('周大爷');
    expect(oldMan?.subtitle).toContain('退休老人');
    expect(oldMan?.profile).not.toContain('真实立场');
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

  it('records the investigators ordinary jobs only after reliable identification', () => {
    const zhao = getPlayerEntities({
      location: 'detective-inn',
      knowledgeEvents: ['observe:shaved-man', 'follow:shaved-man-to-inn', 'identify:zhao-gang'],
    }).find(person => person.id === 'detective-a');
    expect(zhao?.subtitle).toContain('货车司机');
    expect(zhao?.facts).toContain('公开职业是货车司机');

    const lin = getPlayerEntities({
      location: 'detective-inn',
      knowledgeEvents: ['observe:unknown-woman', 'identify:lin-jing'],
    }).find(person => person.id === 'detective-b');
    expect(lin?.subtitle).toContain('普通护士');
    expect(lin?.facts).toContain('是刚来到本地工作的普通护士');
  });

  it('tracks Zhao Gang name, job, temperament and relationship as independent knowledge', () => {
    const observed = ['observe:shaved-man'];
    const jobOnly = getPlayerEntities({
      knowledgeEvents: [...observed, 'learn:zhao-gang-job'],
    }).find(person => person.id === 'detective-a');
    expect(jobOnly).toMatchObject({
      stage: 'public-known',
      displayName: '寸头男人',
      subtitle: '公开职业是货车司机的陌生男人',
    });
    expect(jobOnly?.facts).not.toContain('姓名已确认：赵刚');

    const named = getPlayerEntities({
      knowledgeEvents: [...observed, 'identify:zhao-gang-name'],
    }).find(person => person.id === 'detective-a');
    expect(named).toMatchObject({ stage: 'identified', displayName: '赵刚' });
    expect(named?.facts).not.toContain('公开职业是货车司机');

    const familiar = getPlayerEntities({
      knowledgeEvents: [
        ...observed,
        'identify:zhao-gang-name',
        'learn:zhao-gang-job',
        'insight:zhao-gang-reckless',
        'observe:unknown-woman',
        'identify:lin-jing-name',
        'learn:zhao-lin-connection',
      ],
    }).find(person => person.id === 'detective-a');
    expect(familiar?.stage).toBe('familiar');
    expect(familiar?.facts).toEqual(expect.arrayContaining([
      '精力充沛、讲义气，但行动有些冒失',
      '与林静认识或保持联系',
    ]));
  });

  it('keeps existing saves compatible with the legacy combined identity events', () => {
    const normalized = normalizeKnowledgeEvents([
      'observe:shaved-man',
      'identify:zhao-gang',
      'observe:unknown-woman',
      'identify:lin-jing',
    ]);
    expect(normalized).toEqual(expect.arrayContaining([
      'identify:zhao-gang-name',
      'learn:zhao-gang-job',
      'identify:lin-jing-name',
      'learn:lin-jing-job',
    ]));
  });

  it('does not preload personality judgments at first meeting', () => {
    const firstMeeting = getPlayerEntities({
      knowledgeEvents: ['meet:chen-huihui', 'meet:liu-renguang'],
    });
    expect(firstMeeting.find(person => person.id === 'chen-huihui')?.facts)
      .not.toContain('待人方式有些笨拙');
    expect(firstMeeting.find(person => person.id === 'liu-renguang')?.facts)
      .not.toContain('与人接触时缺乏应有的分寸');

    const learned = getPlayerEntities({
      knowledgeEvents: [
        'meet:chen-huihui',
        'insight:chen-huihui-social-strain',
        'meet:liu-renguang',
        'insight:liu-renguang-boundaries',
      ],
    });
    expect(learned.find(person => person.id === 'chen-huihui')?.stage).toBe('familiar');
    expect(learned.find(person => person.id === 'liu-renguang')?.stage).toBe('familiar');
  });

  it('exposes evidence standards with each available character discovery', () => {
    const discoveries = buildPlayerKnowledgeBrief({
      location: 'street',
      knowledgeEvents: [],
    }).allowedDiscoveries;
    const identity = discoveries.find(item => item.eventId === 'identify:zhao-gang-name');
    expect(identity).toMatchObject({ kind: 'identity', subjectId: 'detective-a' });
    expect(identity?.evidenceStandard).toContain('姓名证件');
  });

  it('allows reliable identification on first contact and implies the observed profile', () => {
    const events = normalizeKnowledgeEvents(['identify:zhao-gang-name']);
    expect(events).toEqual(expect.arrayContaining(['observe:shaved-man', 'identify:zhao-gang-name']));
    expect(getPlayerEntities({ knowledgeEvents: events }).find(person => person.id === 'detective-a'))
      .toMatchObject({ displayName: '赵刚', stage: 'identified' });
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

  it('creates a profile update when a new behavior insight adds facts', () => {
    const before = { location: 'supermarket', knowledgeEvents: ['meet:chen-huihui'] };
    const after = {
      location: 'supermarket',
      knowledgeEvents: ['meet:chen-huihui', 'insight:chen-huihui-social-strain'],
    };
    expect(getKnowledgeVisualUpdates(before, after)).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'character-updated', title: '陈慧慧' }),
    ]));
  });

  it('unlocks Huihui hypoglycemia and chocolate facts only after the dedicated reveal', () => {
    const before = getPlayerEntities({
      location: 'supermarket',
      knowledgeEvents: ['meet:chen-huihui'],
    }).find(person => person.id === 'chen-huihui');
    expect(before?.facts).not.toContain('有低血糖');

    const discovery = buildPlayerKnowledgeBrief({
      location: 'supermarket',
      knowledgeEvents: ['meet:chen-huihui'],
    }).allowedDiscoveries.find(item => item.eventId === 'insight:chen-huihui-hypoglycemia');
    expect(discovery).toMatchObject({ kind: 'personal-fact', subjectId: 'chen-huihui' });
    expect(discovery?.evidenceStandard).toContain('我一个收银员拿文件夹做什么？');

    const after = getPlayerEntities({
      location: 'supermarket',
      knowledgeEvents: ['meet:chen-huihui', 'insight:chen-huihui-hypoglycemia'],
    }).find(person => person.id === 'chen-huihui');
    expect(after).toMatchObject({ stage: 'understood' });
    expect(after?.facts).toEqual(expect.arrayContaining([
      '有低血糖',
      '手中的“文件夹”其实是大号巧克力',
    ]));
  });
});
