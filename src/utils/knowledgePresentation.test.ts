import { describe, expect, it } from 'vitest';
import type { Scene } from '../sillytavern/types';
import { resolvePlayerFacingSpeaker } from '../data/playerKnowledge';
import { projectKnowledgeForPlayback } from './knowledgePresentation';

const scene: Scene = {
  id: 'huihui-intro',
  knowledgeAlreadyCommitted: true,
  lines: [
    { speaker: '店员', text: '欢、欢迎光临……', emotion: 'calm' },
    { speaker: '旁白', text: '这是附近便利店的店员陈慧慧。', emotion: 'calm', knowledgeEvents: ['meet:chen-huihui'] },
    { speaker: '陈慧慧', text: 'C、C姐……', emotion: 'calm' },
  ],
};

describe('atomic knowledge presentation projection', () => {
  it('keeps committed identity hidden until its evidence line has completed', () => {
    const committed = { knowledgeEvents: ['know:supermarket', 'meet:chen-huihui'] };
    expect(projectKnowledgeForPlayback(committed, scene, 0, false).knowledgeEvents)
      .toEqual(['know:supermarket']);
    expect(projectKnowledgeForPlayback(committed, scene, 1, false).knowledgeEvents)
      .toEqual(['know:supermarket']);
    expect(projectKnowledgeForPlayback(committed, scene, 2, false).knowledgeEvents)
      .toEqual(['know:supermarket', 'meet:chen-huihui']);
  });

  it('shows the public role before evidence and the real name afterwards', () => {
    const committed = { location: 'supermarket', knowledgeEvents: ['know:supermarket', 'meet:chen-huihui'] };
    const beforeEvidence = projectKnowledgeForPlayback(committed, scene, 0, false);
    const afterEvidence = projectKnowledgeForPlayback(committed, scene, 2, false);
    expect(resolvePlayerFacingSpeaker('陈慧慧', 'chen-huihui-normal.png', beforeEvidence)).toBe('店员');
    expect(resolvePlayerFacingSpeaker('陈慧慧', 'chen-huihui-normal.png', afterEvidence)).toBe('陈慧慧');
  });
});
