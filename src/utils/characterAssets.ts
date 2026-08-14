const NORMALIZED_SPRITES: Record<string, string> = {
  'detective-a-normal.png': 'detective-a-normal-v8.png',
  'detective-b-normal.png': 'detective-b-normal-v7.png',
  'fumi-angry.png': 'fumi-angry-normalized.png',
  'fumi-happy.png': 'fumi-happy-normalized.png',
  'fumi-horror.png': 'fumi-horror-normalized.png',
  'fumi-insane.png': 'fumi-insane-normalized.png',
  'fumi-sad.png': 'fumi-sad-normalized.png',
  'touko-angry.png': 'touko-angry-normalized.png',
  'touko-happy.png': 'touko-happy-normalized.png',
  'touko-horror.png': 'touko-horror-normalized.png',
  'touko-insane.png': 'touko-insane-normalized.png',
  'touko-sad.png': 'touko-sad-normalized.png',
};

export function resolveCharacterSprite(character: string): string {
  return NORMALIZED_SPRITES[character] ?? character;
}

export function characterCanvasSize(character: string): { width: number; height: number } {
  const sprite = resolveCharacterSprite(character);
  if (sprite.startsWith('fumi-') || sprite.startsWith('touko-')) return { width: 430, height: 606 };
  if (sprite.startsWith('detective-a-') || sprite.startsWith('detective-b-')) return { width: 430, height: 606 };
  if (/^chen-huihui-(normal|calm|angry|happy|sad)\.png$/i.test(sprite)) return { width: 430, height: 606 };
  if (sprite === 'liu-renguang-normal.png') return { width: 404, height: 606 };
  return { width: 412, height: 606 };
}
