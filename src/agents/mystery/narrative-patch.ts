import type { ResponseFormat } from '../../sillytavern/api-router';
import type { FactReview, FactReviewViolation, WriterPacket } from './types';

const STYLE_CODES = new Set(['repeated-prose', 'repeated-imagery', 'style-template-repetition']);
const LOCAL_CODES = new Set([...STYLE_CODES, 'unsupported-assertion', 'contradicted-assertion']);
const MAX_TARGETS = 3;
const MAX_ORIGINAL_LENGTH = 900;
const MAX_REPLACEMENT_LENGTH = 600;
const MAX_TOTAL_REPLACEMENT_LENGTH = 1200;
const UNSAFE_REPLACEMENT = /[<>|｜\p{Cc}\p{Zl}\p{Zp}]/u;

interface RawTextSpan {
  field: string;
  start: number;
  end: number;
  originalText: string;
  line?: number;
  attachedItem?: boolean;
}

export interface NarrativePatchTarget extends RawTextSpan {
  id: string;
  /** Only rejected spans must change; neighboring dialogue may stay verbatim. */
  required: boolean;
}

export interface NarrativePatchTask {
  originalNarrative: string;
  targets: readonly NarrativePatchTarget[];
}

export class InvalidNarrativePatchError extends Error {
  constructor(message: string) {
    super(`局部正文修复未应用：${message}`);
    this.name = 'InvalidNarrativePatchError';
  }
}

function textSpan(field: string, raw: string, start: number): RawTextSpan {
  const originalText = raw.trim();
  const trimmedStart = start + raw.length - raw.trimStart().length;
  return { field, start: trimmedStart, end: trimmedStart + originalText.length, originalText };
}

/** Raw offsets only: normalized assertion fields cannot be spliced into tagged output. */
function rawSpans(narrative: string): RawTextSpan[] | undefined {
  const spans: RawTextSpan[] = [];
  const counts = new Map<string, number>();
  const pattern = /<(maintext|option|hint|sum|vars|observe|investigate|action)>([\s\S]*?)<\/\1\s*>/gi;
  let tail = 0;
  for (const match of narrative.matchAll(pattern)) {
    const at = match.index!;
    if (narrative.slice(tail, at).trim()) return undefined;
    const tag = match[1].toLowerCase();
    const body = match[2];
    // Reject nested tags, unrecognized shapes and duplicate blocks, rather than guessing offsets.
    if (/[<>]/u.test(body) || counts.has(tag)) return undefined;
    counts.set(tag, 1);
    const bodyStart = at + match[0].indexOf('>') + 1;
    tail = at + match[0].length;
    if (tag === 'maintext') {
      let line = 0;
      for (const row of body.matchAll(/[^\r\n]+/g)) {
        line += 1; // Every control row is a barrier, including unknown future controls.
        const parsed = row[0].match(/^[ \t]*(?:对话|dialogue|dialog)[|｜][^|｜\r\n]+[|｜][^|｜\r\n]+[|｜]([^|｜\r\n]+)(?:[|｜]([^|｜\r\n]+))?$/iu);
        if (!parsed) continue;
        const separators = [...row[0].matchAll(/[|｜]/g)];
        const start = bodyStart + row.index! + separators[2].index! + 1;
        const span = textSpan('maintext', parsed[1], start);
        if (span.originalText) spans.push({ ...span, line, attachedItem: parsed[2] !== undefined });
      }
    } else if (tag === 'option') {
      let index = 0;
      for (const row of body.matchAll(/[^\r\n]+/g)) {
        if (row[0].trim()) spans.push(textSpan(`option:${index++}`, row[0], bodyStart + row.index!));
      }
    } else if (tag === 'sum' || tag === 'hint') {
      const span = textSpan(tag === 'sum' ? 'summary' : 'hint', body, bodyStart);
      // Single-line replacement cannot represent a multi-line field safely.
      if (!/[\r\n]/u.test(span.originalText) && span.originalText) spans.push(span);
    }
  }
  return counts.has('maintext') && counts.has('option') && counts.has('vars')
    && !narrative.slice(tail).trim() ? spans : undefined;
}

/** Every violation must be exactly locatable, otherwise retain the full-scene repair path. */
export function buildNarrativePatchTask(narrative: string, review: FactReview): NarrativePatchTask | undefined {
  if (review.approved || !review.violations.length) return undefined;
  const spans = rawSpans(narrative);
  if (!spans) return undefined;
  const primary = new Set<RawTextSpan>();
  for (const violation of review.violations) {
    if (!LOCAL_CODES.has(violation.code)) return undefined;
    const field = violation.field ?? (STYLE_CODES.has(violation.code) ? 'maintext' : undefined);
    const quote = violation.candidateQuote;
    if (!field || typeof quote !== 'string' || !quote.trim()
      || (STYLE_CODES.has(violation.code) && field !== 'maintext')) return undefined;
    const matches = spans.filter(span => span.field === field && span.originalText.includes(quote));
    if (matches.length !== 1 || matches[0].attachedItem) return undefined;
    primary.add(matches[0]);
  }
  const selected = new Set(primary);
  for (const span of primary) {
    if (span.field !== 'maintext') continue;
    for (const neighbor of spans) {
      if (neighbor.field === 'maintext' && Math.abs(neighbor.line! - span.line!) === 1) {
        // Do not strand a neighboring answer/question that depends on an item.
        if (neighbor.attachedItem) return undefined;
        selected.add(neighbor);
      }
    }
  }
  const targets = [...selected].sort((a, b) => a.start - b.start)
    .map((span, index) => Object.freeze({ ...span, id: `T${index + 1}`, required: primary.has(span) }));
  if (targets.length > MAX_TARGETS || targets.reduce((sum, t) => sum + t.originalText.length, 0) > MAX_ORIGINAL_LENGTH
    || targets.some(t => t.originalText.length > MAX_REPLACEMENT_LENGTH || UNSAFE_REPLACEMENT.test(t.originalText))) return undefined;
  return Object.freeze({ originalNarrative: narrative, targets: Object.freeze(targets) });
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function applyNarrativePatch(task: NarrativePatchTask, response: string, currentNarrative = task.originalNarrative): string {
  const fail = (message: string): never => { throw new InvalidNarrativePatchError(message); };
  if (currentNarrative !== task.originalNarrative) fail('候选正文已改变。');
  let parsed: unknown;
  try { parsed = JSON.parse(response); } catch { return fail('不是完整的 JSON。'); }
  if (!record(parsed) || Object.keys(parsed).length !== 1 || !Array.isArray(parsed.edits)
    || parsed.edits.length !== task.targets.length) return fail('必须逐项返回全部已授权目标。');
  const replacements = new Map<string, string>();
  let total = 0;
  for (const edit of parsed.edits) {
    if (!record(edit) || Object.keys(edit).length !== 2 || typeof edit.targetId !== 'string'
      || typeof edit.replacement !== 'string') return fail('修改字段无效。');
    const target = task.targets.find(t => t.id === edit.targetId);
    if (!target || replacements.has(target.id)) return fail('目标未知或重复。');
    const replacement = edit.replacement;
    if (!replacement.trim() || replacement.length > MAX_REPLACEMENT_LENGTH
      || UNSAFE_REPLACEMENT.test(replacement)) return fail('替换文本包含协议内容或超出长度限制。');
    if (target.required && replacement.trim() === target.originalText.trim()) return fail('违规目标未修改。');
    total += replacement.length;
    replacements.set(target.id, replacement);
  }
  if (total > MAX_TOTAL_REPLACEMENT_LENGTH) return fail('替换内容超出总预算。');
  let result = currentNarrative;
  let nextStart = currentNarrative.length;
  for (const target of [...task.targets].sort((a, b) => b.start - a.start)) {
    if (target.start < 0 || target.end > nextStart || target.start >= target.end
      || currentNarrative.slice(target.start, target.end) !== target.originalText) return fail('目标位置失效或重叠。');
    result = result.slice(0, target.start) + replacements.get(target.id)! + result.slice(target.end);
    nextStart = target.start;
  }
  return result;
}

export function narrativePatchResponseFormat(task: NarrativePatchTask): ResponseFormat {
  return { type: 'json_schema', json_schema: { name: 'narrative_text_patch', strict: true, schema: {
    type: 'object', additionalProperties: false, required: ['edits'], properties: {
      // Empty is the model's explicit request to use full-scene repair instead.
      edits: { type: 'array', minItems: 0, maxItems: task.targets.length, items: {
        type: 'object', additionalProperties: false, required: ['targetId', 'replacement'], properties: {
          targetId: { type: 'string', enum: task.targets.map(t => t.id) },
          replacement: { type: 'string', minLength: 1, maxLength: MAX_REPLACEMENT_LENGTH },
        },
      } },
    },
  } } };
}

export function buildNarrativePatchPrompt(task: NarrativePatchTask, packet: WriterPacket,
  review: FactReview, priorResiduals: FactReviewViolation[]): string {
  return `只修复程序选定的文字窗口。原场景的事实权限、行动、问答、指代、选项前提和证据顺序继续有效。
只能改目标的 replacement；required=true 的违规目标必须纠正，相邻 required=false 文字仅在衔接确有必要时修改，否则原样返回。
不得添加场景、人物、事实、心理结论、时间或状态。不要用删除问题留下答案等方式破坏上下文。
目标以外内容由程序逐字保留；如果纠正涉及窗口外的依赖，返回 {"edits":[]}，让程序使用完整场景修复。
每项 replacement 只含一行正文，不含标签、管道分隔符、控制指令或解释；每项最多600字符，总计最多1200字符。
只输出严格 JSON：{"edits":[{"targetId":"T1","replacement":"替换文字"}]}，每个目标一次。程序合并后仍会重新审查完整场景。
[WriterPacket]\n${JSON.stringify(packet)}
[RejectedNarrative]\n${task.originalNarrative}
[Review]\n${JSON.stringify(review)}
[PriorResiduals]\n${JSON.stringify(priorResiduals)}
[Targets]\n${JSON.stringify(task.targets.map(({ id, field, originalText, required }) => ({ targetId: id, field, originalText, required })))}`;
}
