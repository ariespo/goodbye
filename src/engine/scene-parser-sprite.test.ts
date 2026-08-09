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

  it('maps old man aliases to available emotion sprites', () => {
    const angryScene = maintextToScene('对话|周德明|angry|别再问了。');
    expect(angryScene.lines[0].character).toBe('old-man-angry.png');

    const sadScene = maintextToScene('对话|周德明|sad|是我没能救她。');
    expect(sadScene.lines[0].character).toBe('old-man-sad.png');

    const insaneScene = maintextToScene('对话|周德明|insane|轮到你了。');
    expect(insaneScene.lines[0].character).toBe('old-man-insane.png');

    const horrorScene = maintextToScene('对话|周德明|horror|你看见了。');
    expect(horrorScene.lines[0].character).toBe('old-man-normal.png');

    const normalScene = maintextToScene('对话|老头|calm|唉。');
    expect(normalScene.lines[0].character).toBe('old-man-normal.png');
  });

  it('maps detective aliases to available emotion sprites', () => {
    const detectiveA = maintextToScene('对话|赵刚|sad|不是这样的。');
    expect(detectiveA.lines[0].character).toBe('detective-a-sad.png');

    const detectiveB = maintextToScene('对话|林静|angry|闭嘴。');
    expect(detectiveB.lines[0].character).toBe('detective-b-angry.png');
  });

  it('maps the clerk and teacher to their default portraits', () => {
    const clerk = maintextToScene('dialogue|chen-huihui|calm|欢迎光临。');
    expect(clerk.lines[0].character).toBe('chen-huihui-normal.png');

    const teacher = maintextToScene('dialogue|liu-renguang|calm|先去热身。');
    expect(teacher.lines[0].character).toBe('liu-renguang-normal.png');
  });

  it('maps fixed special sprites', () => {
    const touko = maintextToScene('对话|灯织半眯眼|calm|我在看你。');
    expect(touko.lines[0].character).toBe('touko-half-closed.png');

    const fumi = maintextToScene('对话|文穗剪影|calm|……');
    expect(fumi.lines[0].character).toBe('fumi-silhouette.png');
  });

  it('passes through explicit sprite filenames', () => {
    const scene = maintextToScene('对话|detective-a-normal.png|calm|沉默。');
    expect(scene.lines[0].character).toBe('detective-a-normal.png');
  });
});
