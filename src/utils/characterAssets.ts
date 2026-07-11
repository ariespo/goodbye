const NORMALIZED_SPRITES: Record<string, string> = {
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
  if (sprite.startsWith('touko-')) return { width: 430, height: 580 };
  return { width: 412, height: 606 };
}
