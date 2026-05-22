import { describe, it, expect } from 'vitest';
import { maintextToScene } from './scene-parser';

describe('scene-parser XML tags', () => {
  it('extracts observe tag', () => {
    const maintext = `场景|bedroom1
对话|旁白|calm|你好。
<observe>
房间里有煎蛋的香气。
[发现] 桌上有张纸条。
</observe>`;
    const scene = maintextToScene(maintext);
    expect(scene.lines).toHaveLength(1);
    expect(scene.observe).toContain('煎蛋的香气');
    expect(scene.observe).toContain('[发现]');
  });

  it('extracts investigate items', () => {
    const maintext = `对话|旁白|calm|开始。
<investigate>
检查药瓶|玩家|心理|2分钟|1|8
查看挂钟|无|邪神|3分钟|0|10
</investigate>`;
    const scene = maintextToScene(maintext);
    expect(scene.lines).toHaveLength(1);
    expect(scene.investigateItems).toHaveLength(2);
    expect(scene.investigateItems![0].desc).toBe('检查药瓶');
    expect(scene.investigateItems![0].suspect).toBe('玩家');
    expect(scene.investigateItems![0].stamina).toBe(1);
    expect(scene.investigateItems![0].sanity).toBe(8);
  });

  it('extracts action items', () => {
    const maintext = `对话|旁白|calm|开始。
<action>
去厨房|现实|5分钟|2|0
拥抱文穂|心理|1分钟|0|3
</action>`;
    const scene = maintextToScene(maintext);
    expect(scene.lines).toHaveLength(1);
    expect(scene.actionItems).toHaveLength(2);
    expect(scene.actionItems![0].desc).toBe('去厨房');
    expect(scene.actionItems![0].style).toBe('现实');
    expect(scene.actionItems![0].stamina).toBe(2);
    expect(scene.actionItems![0].sanity).toBe(0);
  });

  it('cleans XML tags from lines', () => {
    const maintext = `对话|旁白|calm|第一行。
<observe>
观察内容
</observe>
对话|旁白|calm|第二行。`;
    const scene = maintextToScene(maintext);
    expect(scene.lines).toHaveLength(2);
    expect(scene.lines[0].text).toBe('第一行。');
    expect(scene.lines[1].text).toBe('第二行。');
    expect(scene.observe).toBe('观察内容');
  });
});
