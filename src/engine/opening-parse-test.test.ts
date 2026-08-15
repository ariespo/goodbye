import { describe, it, expect } from 'vitest';
import { parseOpeningStoryline } from './opening-storyline';

describe('opening storyline parse', () => {
  it('parses the full opening storyline', () => {
    const scene = parseOpeningStoryline();

    expect(scene.lines.length).toBeGreaterThan(0);
    expect(scene.observe).toBeTruthy();
    expect(scene.investigateItems?.length).toBeGreaterThan(0);
    expect(scene.actionItems).toHaveLength(7);
  });

  it('pauses the black-screen prologue for player identity confirmation', () => {
    const scene = parseOpeningStoryline();
    const identityLine = scene.lines.find(line => line.playerIdentityPrompt);
    const identityIndex = scene.lines.findIndex(line => line.playerIdentityPrompt);

    expect(identityLine?.background).toBe('opening-rain-black');
    expect(identityLine?.text).toBe('我是——');
    expect(scene.lines[identityIndex + 1]?.text).toBe('对了，我是{{user}}。');
  });

  it('introduces Touko and the old man before unlocking their profiles', () => {
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
    expect(oldManFirstLine).toBeGreaterThan(toukoFirstLine);
    expect(toukoUnlockLine).toBeGreaterThan(toukoFirstLine);
    expect(oldManUnlockLine).toBeGreaterThan(oldManFirstLine);

    expect(scene.lines[toukoUnlockLine]?.text).toContain('灯织');
    expect(scene.lines[toukoUnlockLine]?.text).toContain('商住楼');
    expect(scene.lines[oldManUnlockLine]?.text).toContain('周大爷');
    expect(scene.lines[oldManUnlockLine]?.text).toContain('旧楼');

    const oldManGreeting = scene.lines.find((line) =>
      line.text.includes('这么早就出门？雨大，走慢些。'),
    );
    expect(oldManGreeting).toMatchObject({
      speaker: 'old-man',
      emotion: 'happy',
      character: 'old-man-happy.png',
    });
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

  it('keeps Touko restrained instead of cycling through showcase emotions', () => {
    const toukoLines = parseOpeningStoryline().lines.filter((line) => line.speaker === 'touko');

    expect(toukoLines.map((line) => line.emotion)).toEqual(['calm', 'calm', 'sad', 'calm']);
    expect(toukoLines.some((line) => ['happy', 'angry', 'insane'].includes(line.emotion))).toBe(false);
    expect(toukoLines.find((line) => line.emotion === 'sad')?.text).toContain('没有回我的消息');
  });
});
