import type { ParsedContent, Scene, SceneLine, Mood } from '../sillytavern/types';

export interface SceneInstructions {
  background?: string;
  character?: string;
  bgm?: string;
  mood?: Mood;
  speaker?: string;
}

export function parseSceneInstructions(text: string): { cleanedText: string; instructions: SceneInstructions } {
  const instructions: SceneInstructions = {};
  let cleanedText = text;

  const patterns = [
    { key: 'background' as const, regex: /\[background:([^\]]+)\]/g },
    { key: 'character' as const, regex: /\[character:([^\]]+)\]/g },
    { key: 'bgm' as const, regex: /\[bgm:([^\]]+)\]/g },
    { key: 'mood' as const, regex: /\[mood:(calm|horror|insane|sad|angry|happy)\]/g },
    { key: 'speaker' as const, regex: /\[speaker:([^\]]+)\]/g },
  ];

  for (const { key, regex } of patterns) {
    const matches = [...cleanedText.matchAll(regex)];
    if (matches.length > 0) {
      instructions[key] = matches[matches.length - 1][1].trim();
      cleanedText = cleanedText.replace(regex, '');
    }
  }

  cleanedText = cleanedText.replace(/\n{3,}/g, '\n\n').trim();

  return { cleanedText, instructions };
}

export function maintextToScene(maintext: string): Scene {
  const { cleanedText, instructions } = parseSceneInstructions(maintext);
  const paragraphs = cleanedText.split('\n\n').filter(p => p.trim());

  const lines: SceneLine[] = [];
  let currentSpeaker = instructions.speaker || '';

  for (const paragraph of paragraphs) {
    const speakerMatch = paragraph.match(/^(.+?)[:：]\s*([\s\S]+)$/);
    if (speakerMatch) {
      currentSpeaker = speakerMatch[1].trim();
      lines.push({ speaker: currentSpeaker, text: speakerMatch[2].trim() });
    } else {
      lines.push({ speaker: currentSpeaker, text: paragraph.trim() });
    }
  }

  return {
    id: crypto.randomUUID(),
    lines,
    background: instructions.background,
    character: instructions.character,
    bgm: instructions.bgm,
    mood: instructions.mood,
  };
}
