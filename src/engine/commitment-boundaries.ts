import type { DynamicRecord } from '../sillytavern/types';
import { activeCommitmentBoundaries } from '../memory/character-continuity';
import { normalizeWorldMemory } from '../memory/world-memory';
import type { ScheduledBoundary } from './scheduled-events';

export function commitmentBoundariesFromVariables(variables: DynamicRecord): ScheduledBoundary[] {
  const cycleCount = Number.isSafeInteger(variables.cycleCount) && Number(variables.cycleCount) > 0
    ? Number(variables.cycleCount) : 1;
  return activeCommitmentBoundaries(normalizeWorldMemory(variables), cycleCount);
}
