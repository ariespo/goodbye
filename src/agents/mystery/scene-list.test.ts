import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildSceneListMessages,
  generateSceneChecklist,
  insertTagsIntoMaintext,
  mergeSceneChecklist,
  serializeChecklistToTags,
  type SceneChecklist,
} from './scene-list';
import { resetResponseFormatSupportCache } from './structured';
import { maintextToScene } from '../../engine/scene-parser';
import type { Scene } from '../../sillytavern/types';

const validChecklist: SceneChecklist = {
  observe: '[发现] 衣柜里的围裙不见了。\n空气里有淡淡的洗涤剂味道。',
  investigateItems: [
    { desc: '检查衣柜内侧', suspect: '无', style: '现实', time: '20分钟', stamina: 8, sanity: 2 },
    { desc: '询问文穂围裙去向', suspect: '文穂', style: '现实', time: '30分钟', stamina: 10, sanity: 5 },
  ],
  actionItems: [
    { desc: '整理房间', style: '现实', time: '30分钟', stamina: 15, sanity: 0 },
  ],
};

const options = { api: { baseUrl: 'test', apiKey: 'test', model: 'test' }, preset: null };

describe('generateSceneChecklist', () => {
  beforeEach(() => {
    resetResponseFormatSupportCache();
  });

  it('parses a plain JSON checklist', async () => {
    const complete = vi.fn().mockResolvedValue(JSON.stringify(validChecklist));
    const result = await generateSceneChecklist({ maintext: '对话|旁白|calm|test' }, { ...options, complete });
    expect(result.observe).toContain('[发现]');
    expect(result.investigateItems).toHaveLength(2);
    expect(result.actionItems).toHaveLength(1);
  });

  it('parses a markdown-wrapped JSON checklist', async () => {
    const complete = vi.fn().mockResolvedValue('```json\n' + JSON.stringify(validChecklist) + '\n```');
    const result = await generateSceneChecklist({ maintext: 'x' }, { ...options, complete });
    expect(result.investigateItems[1].suspect).toBe('文穂');
  });

  it('throws when observe is missing', async () => {
    const complete = vi.fn().mockResolvedValue(JSON.stringify({ investigateItems: [], actionItems: [] }));
    await expect(generateSceneChecklist({ maintext: 'x' }, { ...options, complete })).rejects.toThrow('observe');
  });

  it('throws when item arrays are missing', async () => {
    const complete = vi.fn().mockResolvedValue(JSON.stringify({ observe: 'x' }));
    await expect(generateSceneChecklist({ maintext: 'x' }, { ...options, complete })).rejects.toThrow();
  });

  it('drops items without desc and coerces bad numbers', async () => {
    const dirty = {
      observe: 'ok',
      investigateItems: [
        { desc: '', suspect: '无', style: '现实', time: '10分钟', stamina: 5, sanity: 1 },
        { desc: '有效项', stamina: 'abc' },
      ],
      actionItems: [],
    };
    const complete = vi.fn().mockResolvedValue(JSON.stringify(dirty));
    const result = await generateSceneChecklist({ maintext: 'x' }, { ...options, complete });
    expect(result.investigateItems).toHaveLength(1);
    expect(result.investigateItems[0].desc).toBe('有效项');
    expect(result.investigateItems[0].stamina).toBe(0);
    expect(result.investigateItems[0].suspect).toBe('无');
  });
});

describe('buildSceneListMessages', () => {
  it('includes maintext, scene plan and previous checklist sections', () => {
    const messages = buildSceneListMessages({
      maintext: '对话|旁白|calm|正文内容',
      scenePlan: { observeFocus: '衣柜异常', investigateIntents: [], actionIntents: [] },
      currentLocation: 'home',
      previousScene: { observe: '旧观察', investigateItems: [], actionItems: [] },
    });
    const user = messages[1].content;
    expect(user).toContain('正文内容');
    expect(user).toContain('衣柜异常');
    expect(user).toContain('旧观察');
    expect(user).toContain('[当前地点]');
  });

  it('omits optional sections when absent', () => {
    const messages = buildSceneListMessages({ maintext: '正文' });
    const user = messages[1].content;
    expect(user).not.toContain('[导演场景意图]');
    expect(user).not.toContain('[上一份清单]');
    expect(user).not.toContain('[状态指令]');
  });
});

describe('serializeChecklistToTags', () => {
  it('round-trips through maintextToScene', () => {
    const tags = serializeChecklistToTags(validChecklist);
    const maintext = `对话|旁白|calm|正文。\n${tags}`;
    const scene = maintextToScene(maintext);
    expect(scene.observe).toBe(validChecklist.observe);
    expect(scene.investigateItems).toEqual(validChecklist.investigateItems);
    expect(scene.actionItems).toEqual(validChecklist.actionItems);
    expect(scene.lines[0].text).toBe('正文。');
  });

  it('skips blocks the writer already produced', () => {
    const tags = serializeChecklistToTags(validChecklist, { hasObserve: true, hasInvestigate: false, hasAction: true });
    expect(tags).not.toContain('<observe>');
    expect(tags).toContain('<investigate>');
    expect(tags).not.toContain('<action>');
  });

  it('sanitizes separators and newlines inside fields', () => {
    const tags = serializeChecklistToTags({
      observe: '',
      investigateItems: [{ desc: '含|分隔｜符\n换行', suspect: '无', style: '现实', time: '10分钟', stamina: 1, sanity: 0 }],
      actionItems: [],
    });
    const scene = maintextToScene(`对话|旁白|calm|x\n${tags}`);
    expect(scene.investigateItems?.[0].desc).toBe('含 分隔 符 换行');
    expect(scene.investigateItems?.[0].suspect).toBe('无');
  });
});

describe('mergeSceneChecklist', () => {
  const baseScene: Scene = { lines: [], options: [] } as unknown as Scene;

  it('fills only missing fields, keeping writer output', () => {
    const prev: Scene = { ...baseScene, observe: '写手观察', investigateItems: [], actionItems: [] };
    const merged = mergeSceneChecklist(prev, validChecklist);
    expect(merged.observe).toBe('写手观察');
    expect(merged.investigateItems).toEqual(validChecklist.investigateItems);
    expect(merged.actionItems).toEqual(validChecklist.actionItems);
  });

  it('fills everything when writer produced nothing', () => {
    const merged = mergeSceneChecklist(baseScene, validChecklist);
    expect(merged.observe).toBe(validChecklist.observe);
    expect(merged.investigateItems).toEqual(validChecklist.investigateItems);
  });
});

describe('insertTagsIntoMaintext', () => {
  it('inserts tags before the closing maintext tag', () => {
    const content = '<maintext>\n对话|旁白|calm|x\n</maintext>\n<sum>y</sum>';
    const updated = insertTagsIntoMaintext(content, '<observe>\nz\n</observe>');
    expect(updated.indexOf('<observe>')).toBeLessThan(updated.indexOf('</maintext>'));
    expect(updated).toContain('<sum>y</sum>');
  });

  it('returns content unchanged when tags are empty or maintext is absent', () => {
    expect(insertTagsIntoMaintext('abc', '  ')).toBe('abc');
    expect(insertTagsIntoMaintext('no maintext here', '<observe>x</observe>')).toBe('no maintext here');
  });
});
