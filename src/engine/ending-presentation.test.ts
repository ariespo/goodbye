import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createDefaultEndings } from '../stores/gameStore';
import { endingTextToScene, FIXED_ENDING_PRESENTATIONS, getEndingPresentation } from './ending-presentation';

const endings = createDefaultEndings();
const assetDirectory = resolve(process.cwd(), 'public/assets/endings');

describe('fixed ending playback contract', () => {
  it('covers every collectible and every shipped text asset without orphaned presentation entries', () => {
    const ids = endings.map(ending => ending.id).sort();
    expect(ids).toHaveLength(17);
    expect(Object.keys(FIXED_ENDING_PRESENTATIONS).sort()).toEqual(ids);
    expect(readdirSync(assetDirectory).filter(file => file.endsWith('.txt')).map(file => file.slice(0, -4)).sort()).toEqual(ids);
  });

  it.each(endings)('plays every paragraph of $id after a narrative frame, without spawning a present-day actor', ending => {
    const text = readFileSync(resolve(assetDirectory, `${ending.id}.txt`), 'utf8');
    const paragraphs = text.trim().split(/\n\s*\n/).map(paragraph => paragraph.replace(/\s+/g, ' ').trim());
    const scene = endingTextToScene(text, ending);
    expect(scene.lines[0].text).toContain(getEndingPresentation(ending.id)!.label);
    expect(scene.lines[0].background).toBe('black');
    expect(scene.lines.slice(1).map(line => line.text)).toEqual(paragraphs);
    expect(scene.lines.every(line => line.speaker === '旁白' && !line.character)).toBe(true);
    expect(scene.lines.every(line => !line.knowledgeEvents?.length)).toBe(true);
    expect(scene.lines[1].background).toBe(ending.backgroundImage || 'black');
    expect(new Set(scene.lines.map(line => line.id)).size).toBe(scene.lines.length);
  });

  it.each([
    '场景|home-day\n音乐|peace\n对话|文穗|calm|这是回忆。\n场景|black\n对话|旁白|calm|画面结束。',
    'scene|home-day\nmusic|peace\ndialog|文穗|calm|这是回忆。\nscene|black\ndialog|旁白|calm|画面结束。',
  ])('retains scripted scene boundaries after the recollection frame', script => {
    const scene = endingTextToScene(script, endings.find(ending => ending.id === 'STAY')!);
    expect(scene.lines).toHaveLength(3);
    expect(scene.lines[0]).toMatchObject({ background: 'black', speaker: '旁白' });
    expect(scene.lines[1]).toMatchObject({ background: 'home-day', bgm: 'peace', speaker: '文穗', text: '这是回忆。' });
    expect(scene.lines[2]).toMatchObject({ background: 'black', speaker: '旁白', text: '画面结束。' });
  });

  it.each(['C-1', 'F-1', 'LOOP', 'STAY', 'TRUE'])('does not show the retired contradictory clock or character artwork in %s', id => {
    const ending = endings.find(item => item.id === id)!;
    const scene = endingTextToScene(readFileSync(resolve(assetDirectory, `${id}.txt`), 'utf8'), ending);
    const retired = new Set(['ending-c-1', 'ending-f-1', 'ending-loop', 'ending-stay', 'ending-true']);
    expect(scene.lines.some(line => retired.has(line.background ?? ''))).toBe(false);
  });

  it('does not assign built-in lore or a narrative layer to a custom ending', () => {
    const custom = { ...endings[0], id: 'custom', name: '自己的尾声', bgm: 'silence', backgroundImage: 'home-day' };
    expect(getEndingPresentation('custom')).toBeUndefined();
    const scene = endingTextToScene('自己的文字。', custom);
    expect(scene.lines.map(line => line.text)).toEqual(['自己的尾声', '自己的文字。']);
    expect(scene.lines[1]).toMatchObject({ background: 'home-day', bgm: 'silence' });
  });
});
