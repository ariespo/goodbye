import type { ChatMessage, Scene } from '../sillytavern/types';
import { getLocationById } from '../data/locations';

/** Accepted prose plus program-owned context; never a new source of fact authority. */
export interface NarrativeSummary {
  version: 1;
  text: string;
  startedAt: string;
  endedAt: string;
  cycleCount: number;
  startLocationId: string;
  endLocationId: string;
  participants: string[];
}

export function buildNarrativeSummary(input: {
  text: string;
  scene: Scene;
  startedAt: Date;
  endedAt: Date;
  cycleCount: number;
  startLocationId: string;
  endLocationId: string;
}): NarrativeSummary {
  const participants = new Set(['玩家']);
  for (const line of input.scene.lines) {
    const speaker = line.speaker?.trim();
    if (speaker && !['旁白', 'narrator', '{{user}}', '你', '玩家'].includes(speaker)) participants.add(speaker);
  }
  return {
    version: 1,
    text: input.text.trim(),
    startedAt: input.startedAt.toISOString(),
    endedAt: input.endedAt.toISOString(),
    cycleCount: input.cycleCount,
    startLocationId: input.startLocationId,
    endLocationId: input.endLocationId,
    participants: [...participants],
  };
}

function clockLabel(iso: string): string | null {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return null;
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Old saves use their existing summary; missing summaries never become invented memories. */
export function formatNarrativeSummary(message: ChatMessage): string | null {
  if (message.role !== 'assistant') return null;
  const text = (typeof message.parsed?.summary === 'string' ? message.parsed.summary.trim() : '')
    || /<sum>([\s\S]*?)<\/sum>/u.exec(message.content)?.[1]?.trim();
  if (!text) return null;
  const metadata = message.narrativeSummary;
  const matchingMetadata = metadata?.version === 1 && metadata.text === text
    && typeof metadata.startedAt === 'string' && typeof metadata.endedAt === 'string'
    && typeof metadata.startLocationId === 'string' && typeof metadata.endLocationId === 'string'
    && Number.isInteger(metadata.cycleCount) && metadata.cycleCount > 0
    && Array.isArray(metadata.participants) && metadata.participants.every(name => typeof name === 'string')
    ? metadata : undefined;
  const cycle = Number(matchingMetadata?.cycleCount ?? message.variables?.cycleCount);
  const parts = ['[历史剧情摘要：仅回顾已发生内容，不代表当前状态或新增事实授权]'];
  if (Number.isInteger(cycle) && cycle > 0) parts.push(`第${cycle}个重复日。`);
  if (matchingMetadata) {
    const start = clockLabel(matchingMetadata.startedAt);
    const end = clockLabel(matchingMetadata.endedAt);
    if (start && end) parts.push(`时间：${start} → ${end}。`);
    const from = getLocationById(matchingMetadata.startLocationId)?.name ?? matchingMetadata.startLocationId;
    const to = getLocationById(matchingMetadata.endLocationId)?.name ?? matchingMetadata.endLocationId;
    parts.push(`地点：${from === to ? from : `${from} → ${to}`}。`);
    if (matchingMetadata.participants.length) parts.push(`出场人物：${matchingMetadata.participants.join('、')}。`);
  }
  parts.push(text);
  return parts.join('\n');
}
