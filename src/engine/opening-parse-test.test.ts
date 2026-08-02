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
  });

  it('shows Fumi as a memory before Touko and exercises the opening animations', () => {
    const scene = parseOpeningStoryline();
    const fumiFirstLine = scene.lines.findIndex((line) => line.character === 'fumi-normal.png');
    const toukoFirstLine = scene.lines.findIndex((line) => line.speaker === 'touko');
    const animationIds = scene.lines
      .map((line) => line.animation)
      .filter((animation): animation is string => Boolean(animation));

    expect(fumiFirstLine).toBeGreaterThan(-1);
    expect(fumiFirstLine).toBeLessThan(toukoFirstLine);
    expect(animationIds).toContain('idle');
    expect(animationIds).toContain('fold-cloth');
    expect(animationIds).toContain('reset-cuff');
    expect(scene.lines.some((line) => line.text.includes('桌边没有人'))).toBe(true);
  });
});
