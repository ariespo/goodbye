import type { CSSProperties } from 'react';

export function emotionLabel(mood: string): string {
  const labels: Record<string, string> = {
    calm: '平静',
    horror: '恐惧',
    insane: '疯狂',
    sad: '悲伤',
    angry: '愤怒',
    happy: '开心',
  };
  return labels[mood] || mood;
}

export function emotionTextClass(emotion: string | undefined): string {
  switch (emotion) {
    case 'horror': return 'animate-[textHorror_2.5s_infinite]';
    case 'insane': return 'animate-[textInsane_1.5s_infinite]';
    case 'sad': return 'animate-[textSad_3s_infinite_ease-in-out]';
    case 'angry': return 'animate-[textAngry_1.2s_infinite]';
    case 'happy': return 'animate-[textHappy_2s_infinite_ease-in-out]';
    default: return '';
  }
}

export function emotionTextStyle(emotion: string | undefined): CSSProperties {
  switch (emotion) {
    case 'horror': return { color: '#e8b4b0' };
    case 'insane': return { color: '#c9a0e0' };
    case 'sad': return { color: '#8eb4d8' };
    case 'angry': return { color: '#ef9a8f' };
    case 'happy': return { color: '#e8d08a' };
    default: return { color: '#efefe9' };
  }
}

export function applyMacros(text: string, user: string, character: string): string {
  if (!text) return text;
  return text.replace(/\{\{user\}\}/g, user).replace(/\{\{char\}\}/g, character);
}
