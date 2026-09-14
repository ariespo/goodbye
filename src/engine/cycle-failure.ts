export type CycleResetReason = 'stamina' | 'sanity' | 'day-end' | 'stay';

const DAY_END = new Date(2024, 8, 10, 0, 0);

/** Shared by settlement and the pre-commit writer contract. */
export function checkCycleFailure(status: { stamina: number; sanity: number; time: Date }): CycleResetReason | null {
  if (status.stamina <= 0) return 'stamina';
  if (status.sanity <= 0) return 'sanity';
  if (status.time instanceof Date && !Number.isNaN(status.time.getTime()) && status.time.getTime() >= DAY_END.getTime()) {
    return 'day-end';
  }
  return null;
}
