import { describe, it, expect } from 'vitest';
import { OPENING_STORYLINE } from './opening-storyline';
import { maintextToScene } from './scene-parser';

describe('opening storyline parse', () => {
  it('parses the full opening storyline', () => {
    const scene = maintextToScene(OPENING_STORYLINE);
    console.log('lines count:', scene.lines.length);
    console.log('observe:', scene.observe ? 'yes (' + scene.observe.length + ' chars)' : 'no');
    console.log('investigateItems:', scene.investigateItems?.length);
    console.log('actionItems:', scene.actionItems?.length);
    console.log('first line:', scene.lines[0]?.text?.substring(0, 50));
    console.log('last line:', scene.lines[scene.lines.length - 1]?.text?.substring(0, 50));

    expect(scene.lines.length).toBeGreaterThan(0);
    expect(scene.observe).toBeTruthy();
    expect(scene.investigateItems?.length).toBeGreaterThan(0);
    expect(scene.actionItems?.length).toBeGreaterThan(0);
  });
});
