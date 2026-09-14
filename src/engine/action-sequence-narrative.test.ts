import { describe, expect, it } from 'vitest';
import { actionSequenceNarrativeError } from './action-sequence-narrative';
import { resolveActionNarrativeContext } from './action-narrative-context';
import type { SceneLine } from '../sillytavern/types';
const morning = new Date('2024-09-09T08:00:00');
const school = resolveActionNarrativeContext('前往学校向门卫询问', morning, 0, { currentLocationId: 'home', enRouteEncounterRoll: 1, schoolEncounterRoll: 1 })!;
const zhou = resolveActionNarrativeContext('前往周大爷家询问', morning, 0, { currentLocationId: 'school', enRouteEncounterRoll: 1 })!;
const lines: SceneLine[] = [
  { background: school.background, speaker: '门卫', text: '你想核实什么？', emotion: 'calm' },
  { background: 'street', speaker: '旁白', text: '你沿街走去，准备继续核实。', emotion: 'calm' },
  { background: zhou.background, speaker: '周大爷', text: '有什么事？', emotion: 'calm' },
];
describe('executed action sequence narrative', () => {
  it('requires the original interaction even when the final destination is correctly shown', () => {
    expect(actionSequenceNarrativeError([school, zhou], { lines: lines.slice(1) })).toContain('school');
  });
  it('checks each location within its own part of the scene', () => {
    expect(actionSequenceNarrativeError([{ ...school, forbiddenNpcIds: ['old-man'] }, zhou], { lines })).toBeNull();
  });
  it('rejects reversing the requested and follow-through locations', () => {
    expect(actionSequenceNarrativeError([school, zhou], { lines: [...lines].reverse() })).not.toBeNull();
  });
});
