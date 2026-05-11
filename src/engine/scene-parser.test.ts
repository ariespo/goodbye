import { describe, it, expect } from 'vitest';
import { parseSceneInstructions, maintextToScene } from './scene-parser';

describe('scene-parser', () => {
  it('should parse scene instructions', () => {
    const text = '[background:scene1.jpg]\n[character:hero.png]\n[mood:horror]\n这是一段剧情';
    const { cleanedText, instructions } = parseSceneInstructions(text);
    expect(instructions.background).toBe('scene1.jpg');
    expect(instructions.character).toBe('hero.png');
    expect(instructions.mood).toBe('horror');
    expect(cleanedText).toBe('这是一段剧情');
  });

  it('should convert maintext to scene with speaker', () => {
    const text = '[speaker:少女]\n少女：你好，玩家。\n\n少女：今天天气不错。';
    const scene = maintextToScene(text);
    expect(scene.lines).toHaveLength(2);
    expect(scene.lines[0].speaker).toBe('少女');
    expect(scene.lines[0].text).toBe('你好，玩家。');
  });
});
