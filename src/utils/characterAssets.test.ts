import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { characterCanvasSize, resolveCharacterSprite } from './characterAssets';

const ROOT = path.resolve(process.cwd(), 'public/assets/characters');

function readPngSize(file: string) {
  const data = fs.readFileSync(path.join(ROOT, file));
  return [data.readUInt32BE(16), data.readUInt32BE(20)];
}

describe('Fumi emotion sprite alignment', () => {
  it('routes sad and angry moods to their aligned runtime files', () => {
    expect(resolveCharacterSprite('fumi-sad.png')).toBe('fumi-sad-normalized.png');
    expect(resolveCharacterSprite('fumi-angry.png')).toBe('fumi-angry-normalized.png');
  });

  it('keeps sad and angry initial frames on the shared 430x606 stage', () => {
    expect(readPngSize('fumi-sad-normalized.png')).toEqual([430, 606]);
    expect(readPngSize('fumi-angry-normalized.png')).toEqual([430, 606]);
  });
});

describe('detective default portrait alignment', () => {
  it.each([
    ['detective-a-normal.png', 'detective-a-normal-v8.png'],
    ['detective-b-normal.png', 'detective-b-normal-v7.png'],
  ])(
    'routes %s to the new 430x606 portrait %s',
    (legacyFile, currentFile) => {
      expect(resolveCharacterSprite(legacyFile)).toBe(currentFile);
      expect(readPngSize(currentFile)).toEqual([430, 606]);
      expect(characterCanvasSize(legacyFile)).toEqual({ width: 430, height: 606 });
    },
  );
});

describe('Chen Huihui calm portrait alignment', () => {
  it('uses the shared 430x606 animation canvas for calm/default ids', () => {
    expect(characterCanvasSize('chen-huihui-normal.png')).toEqual({ width: 430, height: 606 });
    expect(characterCanvasSize('chen-huihui-calm.png')).toEqual({ width: 430, height: 606 });
    expect(characterCanvasSize('chen-huihui-happy.png')).toEqual({ width: 430, height: 606 });
    expect(characterCanvasSize('chen-huihui-sad.png')).toEqual({ width: 430, height: 606 });
  });
});
