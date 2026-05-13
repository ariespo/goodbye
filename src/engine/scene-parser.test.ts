import { describe, it, expect } from 'vitest';
import { maintextToScene } from './scene-parser';

describe('scene-parser (GalGame format)', () => {
  it('parses scene/music/dialog lines', () => {
    const maintext = `场景|school_corridor.jpg
音乐|silence.mp3
对话|少女|horror|你来了。
对话|旁白|calm|她背对着你,声音平淡得像背书。`;
    const scene = maintextToScene(maintext);
    expect(scene.lines).toHaveLength(2);
    expect(scene.lines[0].background).toBe('school_corridor.jpg');
    expect(scene.lines[0].bgm).toBe('silence.mp3');
    expect(scene.lines[0].speaker).toBe('少女');
    expect(scene.lines[0].emotion).toBe('horror');
    expect(scene.lines[0].text).toBe('你来了。');
    expect(scene.lines[1].speaker).toBe('旁白');
    expect(scene.lines[1].emotion).toBe('calm');
    expect(scene.lines[1].text).toBe('她背对着你,声音平淡得像背书。');
  });

  it('inherits background/bgm across multiple dialogs', () => {
    const maintext = `场景|classroom.jpg
音乐|tension.mp3
对话|老师|angry|上课!`;
    const scene = maintextToScene(maintext);
    expect(scene.lines[0].background).toBe('classroom.jpg');
    expect(scene.lines[0].bgm).toBe('tension.mp3');
  });

  it('sets narrator without character asset', () => {
    const maintext = `对话|旁白|calm|夜空繁星点点。`;
    const scene = maintextToScene(maintext);
    expect(scene.lines[0].speaker).toBe('旁白');
    expect(scene.lines[0].character).toBeUndefined();
  });

  it('switches background mid-scene', () => {
    const maintext = `场景|room.jpg
对话|少女|sad|为什么...
场景|hallway.jpg
对话|少女|sad|我等你很久了。`;
    const scene = maintextToScene(maintext);
    expect(scene.lines[0].background).toBe('room.jpg');
    expect(scene.lines[1].background).toBe('hallway.jpg');
  });
});
