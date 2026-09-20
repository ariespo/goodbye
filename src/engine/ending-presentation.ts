import { maintextToScene } from './scene-parser';
import type { Ending, Scene } from '../sillytavern/types';

/** Presentation only. Route facts, ending eligibility and saved IDs live in their existing authorities. */
export interface EndingPresentation {
  label: string;
  layers: readonly ('reality' | 'recollection' | 'meta')[];
}

const aftermath: EndingPresentation = { label: '这条路线的后续', layers: ['reality'] };
const recollection: EndingPresentation = { label: '现实与回忆', layers: ['reality', 'recollection'] };

export const FIXED_ENDING_PRESENTATIONS: Readonly<Record<string, EndingPresentation>> = {
  'A-1': aftermath,
  'A-2': aftermath,
  'B-1': aftermath,
  'B-2': aftermath,
  'C-1': aftermath,
  'C-2': recollection,
  'N-1': aftermath,
  'N-2': recollection,
  'F-1': aftermath,
  'F-2': aftermath,
  'X-1': { label: '仪式成真的路线', layers: ['reality'] },
  'X-2': { label: '仪式中的封存画面', layers: ['reality', 'recollection'] },
  'P-1': { label: '治疗中的现实', layers: ['reality'] },
  'P-2': { label: '内心重构与病房现实', layers: ['recollection', 'reality'] },
  STAY: { label: '记忆中的陪伴', layers: ['meta', 'recollection'] },
  TRUE: { label: '故事之外的告别', layers: ['meta', 'recollection'] },
  LOOP: { label: '尚未解开的困局', layers: ['reality', 'recollection'] },
};

export function getEndingPresentation(id: string): EndingPresentation | undefined {
  return Object.hasOwn(FIXED_ENDING_PRESENTATIONS, id) ? FIXED_ENDING_PRESENTATIONS[id] : undefined;
}

export function endingTextToScene(text: string, ending: Ending): Scene {
  const trimmed = text.trim();
  const context = getEndingPresentation(ending.id);
  const bgm = ending.bgm || defaultEndingBgm(ending);
  const heading = `dialog|旁白|calm|${ending.name}${context ? ` · ${context.label}` : ''}`;
  const intro = `scene|black\nbgm|${bgm}\n${heading}`;
  // Both supported script dialects retain their scene changes, after the narrative frame.
  if (/^(?:scene|bgm|music|dialog|dialogue|场景|背景|音乐|对话)\s*\|/im.test(trimmed)) {
    return maintextToScene(`${intro}\n${trimmed}`);
  }
  return maintextToScene([
    intro,
    `scene|${ending.backgroundImage || 'black'}`,
    ...trimmed.split(/\n\s*\n/)
      .map(paragraph => paragraph.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .map(paragraph => `dialog|旁白|calm|${paragraph}`),
  ].join('\n'));
}

function defaultEndingBgm(ending: Ending): string {
  if (ending.tag === 'bad') return 'horror';
  if (ending.tag === 'good' || ending.tag === 'true') return 'peace';
  if (ending.tag === 'hidden') return 'silence';
  return 'suspense';
}
