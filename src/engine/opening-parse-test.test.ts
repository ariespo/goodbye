import { describe, it, expect } from 'vitest';
import { parseOpeningStoryline } from './opening-storyline';

describe('opening storyline parse', () => {
  it('parses the full opening storyline', () => {
    const scene = parseOpeningStoryline();

    expect(scene.lines.length).toBeGreaterThan(0);
    expect(scene.observe).toBeTruthy();
    expect(scene.investigateItems?.length).toBeGreaterThan(0);
    expect(scene.actionItems).toHaveLength(5);
  });

  it('pauses the black-screen prologue for player identity confirmation', () => {
    const scene = parseOpeningStoryline();
    const identityLine = scene.lines.find(line => line.playerIdentityPrompt);
    const identityIndex = scene.lines.findIndex(line => line.playerIdentityPrompt);

    expect(identityLine?.background).toBe('opening-rain-black');
    expect(identityLine?.text).toBe('我是——');
    expect(scene.lines[identityIndex + 1]?.text).toBe('对了，我是{{user}}。');
  });

  it('introduces Touko while leaving the old man for player-directed investigation', () => {
    const scene = parseOpeningStoryline();
    const toukoFirstLine = scene.lines.findIndex((line) => line.speaker === 'touko');
    const oldManFirstLine = scene.lines.findIndex((line) => line.speaker === 'old-man');
    const toukoUnlockLine = scene.lines.findIndex((line) =>
      line.knowledgeEvents?.includes('meet:touko'),
    );
    const oldManUnlockLine = scene.lines.findIndex((line) =>
      line.knowledgeEvents?.includes('meet:old-man'),
    );

    expect(toukoFirstLine).toBeGreaterThan(-1);
    expect(oldManFirstLine).toBe(-1);
    expect(toukoUnlockLine).toBeGreaterThan(toukoFirstLine);
    expect(oldManUnlockLine).toBe(-1);

    expect(scene.lines[toukoUnlockLine]?.text).toContain('灯织');
    expect(scene.lines[toukoUnlockLine]?.text).toContain('商住楼');
    expect(scene.actionItems?.some(item => item.desc.includes('周大爷'))).toBe(true);
  });

  it('keeps Fumi physically absent while recalling her ordinary morning voice', () => {
    const scene = parseOpeningStoryline();
    const fumiLines = scene.lines.filter((line) => line.speaker === '文穗');
    const rememberedVoice = scene.lines.find((line) => line.text.includes('牛奶要趁热喝'));

    expect(fumiLines).toEqual([]);
    expect(scene.lines.some((line) => line.character?.startsWith('fumi-'))).toBe(false);
    expect(rememberedVoice).toMatchObject({ speaker: '旁白', emotion: 'calm' });
    expect(scene.lines.some((line) => line.text.includes('那里没有人'))).toBe(true);
  });

  it('uses Touko to establish a credible contact without preloading a mystery answer', () => {
    const toukoLines = parseOpeningStoryline().lines.filter((line) => line.speaker === 'touko');

    expect(toukoLines.length).toBeGreaterThanOrEqual(3);
    expect(toukoLines.every((line) => line.emotion === 'calm')).toBe(true);
    expect(toukoLines.some((line) => ['happy', 'angry', 'insane'].includes(line.emotion))).toBe(false);
    expect(toukoLines.some((line) => line.text.includes('饭盒'))).toBe(true);
    expect(toukoLines.some((line) => line.text.includes('山里'))).toBe(false);
  });

  it('hands control to the player at home with grounded investigation directions', () => {
    const scene = parseOpeningStoryline();
    const actionText = scene.actionItems?.map(item => item.desc).join('\n') ?? '';

    expect(scene.lines.at(-1)?.background).toBe('home-day');
    expect(actionText).toContain('中学');
    expect(actionText).toContain('便利店');
    expect(actionText).toContain('灯织');
    expect(actionText).toContain('周大爷');
    expect(scene.actionItems?.some(item => /拨打.*文穗.*电话/.test(item.desc))).toBe(true);
  });

  it('keeps optional room observations at the first-day atmosphere level', () => {
    const observe = parseOpeningStoryline().observe ?? '';

    expect(observe).toContain('空缺');
    expect(observe).not.toContain('绿色围裙');
    expect(observe).toContain('药瓶');
    expect(observe).not.toContain('她今天不是去学校');
    expect(observe).not.toContain('好像有人重新涂过');
    expect(observe).not.toContain('周大爷在楼下');
  });

  it('does not claim the 06:50 message knew about the later leave call', () => {
    const scene = parseOpeningStoryline();
    const departureMessage = scene.lines.find(line => line.text.includes('我先出门了'))?.text ?? '';

    expect(departureMessage).toMatch(/^“我先出门了，今天不去学校。晚饭不用等我，回来再跟你说。”$/);
    expect(departureMessage).not.toMatch(/请假|老师|学校.{0,8}(?:知道|说过)|电话/);
  });

  it('presents breakfast as an observation and a familiar habit without witnessing morning preparation', () => {
    const scene = parseOpeningStoryline();
    const breakfast = scene.lines.find(line => line.text.includes('面包皮'))?.text ?? '';

    expect(breakfast).toMatch(/面包皮.*切掉/);
    expect(breakfast).toMatch(/想起|记得|习惯/);
    expect(breakfast).not.toMatch(/她又把面包皮切掉了|今早.*(?:她|文穗).*(?:做|准备|留下)/);
    expect(scene.investigateItems?.some(item => /文穗留的早餐/.test(item.desc))).toBe(false);
  });

  it('keeps the displayed message time and reported departure distinct from a witnessed event', () => {
    const lines = parseOpeningStoryline().lines;
    const timestamp = lines.find(line => line.text.includes('六点五十'))?.text ?? '';
    const departureReply = lines.find(line => line.text.includes('你今天跟她联系过吗'))?.text ?? '';

    expect(timestamp).toMatch(/显示.*六点五十/);
    expect(timestamp).not.toContain('六点五十发的');
    expect(departureReply).toMatch(/消息.*说.*出门了/);
  });

  it('keeps the returned lunchbox as characterization rather than a case lead', () => {
    const scene = parseOpeningStoryline();

    expect(scene.investigateItems?.some(item => item.desc.includes('饭盒'))).toBe(false);
    expect(scene.observe).not.toContain('厨房纸还是干的');
  });
});
