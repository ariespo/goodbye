import { describe, it, expect } from 'vitest';
import { maintextToScene, mergeParsedIntoScene } from './scene-parser';

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

  it('attaches one-shot effect to next line', () => {
    const maintext = `场景|water-tower
效果|lightning-flash
对话|旁白|calm|闪电照亮墙上的刻痕。
对话|旁白|calm|黑暗又压了回来。`;
    const scene = maintextToScene(maintext);
    expect(scene.lines[0].effect).toBe('lightning-flash');
    expect(scene.lines[1].effect).toBeUndefined();
  });

  it('attaches a supported character action to the next dialogue line', () => {
    const scene = maintextToScene(`动作|文穗|fold-cloth
对话|文穗|calm|“等一下……这边没有叠齐。”`);

    expect(scene.lines).toHaveLength(1);
    expect(scene.lines[0].character).toBe('fumi-normal.png');
    expect(scene.lines[0].animation).toBe('fold-cloth');
  });

  it('attaches Touko reset-cuff action to the next dialogue line', () => {
    const scene = maintextToScene(`animation|touko|reset-cuff
dialogue|touko|calm|先把袖口整理好。`);

    expect(scene.lines).toHaveLength(1);
    expect(scene.lines[0].character).toBe('touko-normal.png');
    expect(scene.lines[0].animation).toBe('reset-cuff');
  });

  it('keeps an acting character visible over a narrator line', () => {
    const scene = maintextToScene(`动作|文穗|idle
对话|旁白|calm|记忆先一步替这个清晨补上了她。`);

    expect(scene.lines).toHaveLength(1);
    expect(scene.lines[0].speaker).toBe('旁白');
    expect(scene.lines[0].character).toBe('fumi-normal.png');
    expect(scene.lines[0].animation).toBe('idle');
  });

  it('ignores unsupported actions instead of turning them into narration', () => {
    const scene = maintextToScene(`动作|文穗|teleport
对话|旁白|calm|客厅里没有人。`);

    expect(scene.lines).toHaveLength(1);
    expect(scene.lines[0].text).toBe('客厅里没有人。');
    expect(scene.lines[0].character).toBeUndefined();
    expect(scene.lines[0].animation).toBeUndefined();
  });

  it('parses optional item callout on dialogue lines', () => {
    const scene = maintextToScene('对话|旁白|calm|桌上放着那只马克杯。|opening-mug');

    expect(scene.lines[0].text).toBe('桌上放着那只马克杯。');
    expect(scene.lines[0].item).toBe('opening-mug');
  });
  it('keeps unknown fifth fields as dialogue text', () => {
    const scene = maintextToScene('dialog|Narrator|calm|The line contains|plain extra text');

    expect(scene.lines[0].text).toBe('The line contains|plain extra text');
    expect(scene.lines[0].item).toBeUndefined();
  });

  it('attaches only director-authorized knowledge events to the evidence line', () => {
    const maintext = `对话|周德明|calm|还记得我吗？
对话|旁白|calm|眼前的老人姓周，附近的人都叫他周大爷。
认知|meet:old-man
认知|identify:zhao-gang
对话|周德明|happy|雨大，慢些走。`;
    const scene = maintextToScene(maintext, { authorizedKnowledgeEvents: ['meet:old-man'] });

    expect(scene.lines).toHaveLength(3);
    expect(scene.lines[1].knowledgeEvents).toEqual(['meet:old-man']);
    expect(scene.lines[2].knowledgeEvents).toBeUndefined();
  });
});

describe('mergeParsedIntoScene', () => {
  const item = { desc: '旧调查', suspect: '无', style: '现实', time: '10分钟', stamina: 5, sanity: 1 };
  const prev = maintextToScene('对话|旁白|calm|旧');
  prev.observe = '旧观察';
  prev.investigateItems = [item];
  prev.actionItems = [{ desc: '旧行动', style: '现实', time: '10分钟', stamina: 5, sanity: 1 }];

  it('keeps previous checklist fields when parsed lacks them', () => {
    const scene = maintextToScene('对话|旁白|calm|新');
    const merged = mergeParsedIntoScene(prev, scene, {});
    expect(merged.observe).toBe('旧观察');
    expect(merged.investigateItems).toEqual(prev.investigateItems);
    expect(merged.actionItems).toEqual(prev.actionItems);
    expect(merged.lines[0].text).toBe('新');
  });

  it('overrides with parsed values when present', () => {
    const scene = maintextToScene('对话|旁白|calm|新');
    const merged = mergeParsedIntoScene(prev, scene, {
      observe: '新观察',
      investigateItems: [{ ...item, desc: '新调查' }],
      actionItems: [],
    });
    expect(merged.observe).toBe('新观察');
    expect(merged.investigateItems?.[0].desc).toBe('新调查');
    expect(merged.actionItems).toEqual(prev.actionItems);
  });

  it('works without a previous scene', () => {
    const scene = maintextToScene('对话|旁白|calm|新');
    const merged = mergeParsedIntoScene(null, scene, {});
    expect(merged.observe).toBeUndefined();
    expect(merged.investigateItems).toBeUndefined();
  });
});
