import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveCharacterSprite } from './characterAssets';

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
