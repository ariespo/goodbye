import { describe, it, expect } from 'vitest';
import { maintextToScene } from './scene-parser';

describe('emotion sprite mapping', () => {
  it('uses normal sprite for calm emotion', () => {
    const maintext = '对话|文穂|calm|你好。';
    const scene = maintextToScene(maintext);
    expect(scene.lines[0].character).toBe('fumi-normal.png');
  });

  it('uses happy sprite for happy emotion', () => {
    const maintext = '对话|文穂|happy|好开心！';
    const scene = maintextToScene(maintext);
    expect(scene.lines[0].character).toBe('fumi-happy.png');
  });

  it('uses sad sprite for sad emotion', () => {
    const maintext = '对话|文穂|sad|好难过...';
    const scene = maintextToScene(maintext);
    expect(scene.lines[0].character).toBe('fumi-sad.png');
  });

  it('uses angry sprite for angry emotion', () => {
    const maintext = '对话|文穂|angry|生气！';
    const scene = maintextToScene(maintext);
    expect(scene.lines[0].character).toBe('fumi-angry.png');
  });

  it('uses horror sprite for horror emotion', () => {
    const maintext = '对话|文穂|horror|好可怕...';
    const scene = maintextToScene(maintext);
    expect(scene.lines[0].character).toBe('fumi-horror.png');
  });

  it('uses insane sprite for insane emotion', () => {
    const maintext = '对话|文穂|insane|哈哈哈...';
    const scene = maintextToScene(maintext);
    expect(scene.lines[0].character).toBe('fumi-insane.png');
  });

  it('falls back to normal for unknown emotion', () => {
    const maintext = '对话|文穂|calm|默认。';
    const scene = maintextToScene(maintext);
    expect(scene.lines[0].character).toBe('fumi-normal.png');
  });

  it('returns undefined for narrator', () => {
    const maintext = '对话|旁白|calm|旁白文本。';
    const scene = maintextToScene(maintext);
    expect(scene.lines[0].character).toBeUndefined();
  });

  it('handles touko with emotion suffix even if file may not exist', () => {
    const maintext = '对话|緋室灯織|happy|你好。';
    const scene = maintextToScene(maintext);
    // 代码会根据情绪返回对应文件名（若文件不存在，浏览器 404 后自然不显示立绘）
    expect(scene.lines[0].character).toBe('touko-happy.png');
  });
});
