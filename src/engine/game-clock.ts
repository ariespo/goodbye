const FALLBACK_TIME = '2024-09-09T08:00:00';

function toDate(iso: string): Date | null {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toLocalISO(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** 把「5分钟」「2小时」「1小时30分钟」解析成分钟数；无法解析返回 0 */
export function parseTimeCost(text: string | undefined | null): number {
  if (!text) return 0;
  const hourMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:小时|时)/);
  const minMatch = text.match(/(\d+(?:\.\d+)?)\s*分/);
  const hours = hourMatch ? parseFloat(hourMatch[1]) : 0;
  const mins = minMatch ? parseFloat(minMatch[1]) : 0;
  return Math.round(hours * 60 + mins);
}

/** 钳制到 1–180 分钟，防止 LLM 报离谱值一回合跳一天 */
export function clampTimeCost(minutes: number): number {
  if (!Number.isFinite(minutes)) return 10;
  return Math.min(180, Math.max(1, Math.round(minutes)));
}

export function advanceClock(timeISO: string, minutes: number): string {
  const base = toDate(timeISO) ?? toDate(FALLBACK_TIME)!;
  return toLocalISO(new Date(base.getTime() + minutes * 60_000));
}

/** 时钟只进不退：返回较晚者 */
export function laterTime(aISO: string, bISO: string): string {
  const a = toDate(aISO);
  const b = toDate(bISO);
  if (!a) return bISO;
  if (!b) return aISO;
  return a.getTime() >= b.getTime() ? aISO : bISO;
}

export function crossesThreshold(prevISO: string, nextISO: string, thresholdISO: string): boolean {
  const prev = toDate(prevISO);
  const next = toDate(nextISO);
  const threshold = toDate(thresholdISO);
  if (!prev || !next || !threshold) return false;
  return prev.getTime() < threshold.getTime() && next.getTime() >= threshold.getTime();
}
