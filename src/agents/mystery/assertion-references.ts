import { getItemByReference } from '../../data/itemAssets';
import { characterIdFromSpeaker } from '../../data/npcPlayerKnowledge';
import { maintextToScene } from '../../engine/scene-parser';
import type { Scene } from '../../sillytavern/types';
import type { AssertionAudit, AssertionSource, NarrativeAssertion } from './fact-assertion-review';

export interface NarrativeAssertionUnit {
  unitId: string;
  field: string;
  start: number;
  end: number;
  text: string;
  speakerId?: string;
  playableLineIndex?: number;
}

export interface AssertionSourceUnit {
  sourceUnitId: string;
  sourceId: string;
  text: string;
}

export interface AssertionReferenceTable {
  candidateFingerprint: string;
  units: NarrativeAssertionUnit[];
  sourceUnits: AssertionSourceUnit[];
}

export interface AssertionReferenceBinding {
  candidateFingerprint: string;
  start: number;
  end: number;
  speakerId?: string;
  playableLineIndex?: number;
}

type TrustedBinding = AssertionReferenceBinding & { unitId: string; field: string; text: string; playableText?: string; fieldsFingerprint: string; sceneFingerprint: string };
const trustedBindings = new WeakMap<NarrativeAssertion, TrustedBinding>();
const tableFields = new WeakMap<AssertionReferenceTable, Record<string, string>>();
const tableScenes = new WeakMap<AssertionReferenceTable, string>();
const unitPlayableText = new WeakMap<NarrativeAssertionUnit, string>();

export class AssertionReferenceError extends Error {
  readonly assertionIndices: number[];
  readonly missingUnitIds: string[];
  readonly requiresFullRepair: boolean;

  constructor(message: string, assertionIndices: number[] = [], missingUnitIds: string[] = [], requiresFullRepair = false) {
    super(message);
    this.name = 'AssertionReferenceError';
    this.assertionIndices = assertionIndices;
    this.missingUnitIds = missingUnitIds;
    this.requiresFullRepair = requiresFullRepair;
  }
}

function fingerprint(value: string): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return `${(first >>> 0).toString(36)}${(second >>> 0).toString(36)}-${value.length.toString(36)}`;
}

function sceneFingerprint(scene: Pick<Scene, 'lines'>): string {
  return fingerprint(JSON.stringify(scene.lines.map(({ speaker, text, background }) => ({ speaker, text, background }))));
}

const CONTROL_ONLY = new Set(['场景', 'scene', '音乐', 'bgm', 'music', '镜头', 'camera', '效果', 'effect', '动作', 'animation', '认知', 'knowledge', '身份确认', 'identity-prompt']);
// These are exactly the controls consumed without a rendered line by scene-parser.
const PARSER_CONTROLS = new Set(['场景', 'scene', '音乐', 'bgm', 'music', '效果', 'effect', '动作', 'animation', '认知', 'knowledge', '身份确认', 'identity-prompt']);

/** References select intact visible lines; proposition completeness remains a semantic review obligation. */
export function buildAssertionReferenceTable(
  fields: Record<string, string>,
  sources: readonly AssertionSource[],
  scene?: Pick<Scene, 'lines'>,
): AssertionReferenceTable {
  const parsedScene = maintextToScene(fields.maintext ?? '');
  const sceneMatches = !scene || (scene.lines.length === parsedScene.lines.length && scene.lines.every((line, index) => (
    line.text === parsedScene.lines[index].text
    && line.speaker === parsedScene.lines[index].speaker
    && line.background === parsedScene.lines[index].background
  )));
  const candidateFingerprint = fingerprint(JSON.stringify({ fields, sources, scene: sceneFingerprint(scene ?? parsedScene) }));
  const units: NarrativeAssertionUnit[] = [];
  let playableIndex = 0;
  for (const [field, value] of Object.entries(fields)) {
    for (const match of value.matchAll(/[^\r\n]+/g)) {
      const raw = match[0];
      let start = (match.index ?? 0) + raw.length - raw.trimStart().length;
      let end = (match.index ?? 0) + raw.trimEnd().length;
      const line = value.slice(start, end);
      const head = line.split(/[|｜]/, 1)[0]?.trim().toLowerCase() ?? '';
      let lineIndex: number | undefined;
      let speakerId: string | undefined;
      if (field === 'maintext') {
        const isDialogue = ['对话', 'dialog', 'dialogue'].includes(head);
        const separators = [...line.matchAll(/[|｜]/g)].map(item => item.index ?? 0);
        if (isDialogue && separators.length >= 3) {
          const candidateItem = separators.length >= 4 ? line.slice(separators[separators.length - 1] + 1).trim() : '';
          end = candidateItem && getItemByReference(candidateItem) ? start + separators[separators.length - 1] : end;
          const rawSpeaker = line.slice(separators[0] + 1, separators[1]).trim() || '旁白';
          speakerId = /^(?:旁白|narrator)$/i.test(rawSpeaker) ? undefined : characterIdFromSpeaker(rawSpeaker) ?? `unknown:${rawSpeaker}`;
          start += separators[2] + 1;
          while (start < end && /\s/u.test(value[start])) start += 1;
          while (end > start && /\s/u.test(value[end - 1])) end -= 1;
        }
        const rendered = !PARSER_CONTROLS.has(head) && (!isDialogue || (separators.length >= 3 && end > start));
        if (rendered) {
          const renderedText = isDialogue
            ? value.slice(start, end).split(/[|｜]/).map(part => part.trim()).join('|').trim()
            : value.slice(start, end);
          if (sceneMatches && parsedScene.lines[playableIndex]?.text === renderedText) lineIndex = playableIndex;
          playableIndex += 1;
        }
        if (CONTROL_ONLY.has(head) || (isDialogue && separators.length < 3)) continue;
      }
      const text = value.slice(start, end);
      if (!/[^\s\p{P}]/u.test(text)) continue;
      const unit = { unitId: `u:${candidateFingerprint}:${units.length}`, field, start, end, text,
        ...(speakerId ? { speakerId } : {}), ...(lineIndex !== undefined ? { playableLineIndex: lineIndex } : {}) };
      if (lineIndex !== undefined) unitPlayableText.set(unit, parsedScene.lines[lineIndex].text);
      units.push(unit);
    }
  }
  const table: AssertionReferenceTable = {
    candidateFingerprint, units,
    sourceUnits: sources.map((source, index) => ({ sourceUnitId: `s:${candidateFingerprint}:${index}`, sourceId: source.id, text: source.text })),
  };
  tableFields.set(table, { ...fields });
  tableScenes.set(table, sceneFingerprint(scene ?? parsedScene));
  return table;
}

export function trustedAssertionReference(assertion: NarrativeAssertion, fields?: Record<string, string>, scene?: Pick<Scene, 'lines'>): (AssertionReferenceBinding & { playableText?: string }) | undefined {
  const binding = trustedBindings.get(assertion);
  if (!binding || assertion.unitId !== binding.unitId || assertion.field !== binding.field || assertion.quote !== binding.text
    || JSON.stringify(assertion.reference) !== JSON.stringify({ candidateFingerprint: binding.candidateFingerprint, start: binding.start, end: binding.end,
      ...(binding.speakerId ? { speakerId: binding.speakerId } : {}), ...(binding.playableLineIndex !== undefined ? { playableLineIndex: binding.playableLineIndex } : {}) })
    || (fields && fingerprint(JSON.stringify(fields)) !== binding.fieldsFingerprint)
    || (scene && sceneFingerprint(scene) !== binding.sceneFingerprint)) return undefined;
  return binding;
}

/** Continuity snapshots may clone records, but cannot turn model supplied metadata into trusted bindings. */
export function cloneAssertionWithReference(assertion: NarrativeAssertion, fields?: Record<string, string>, scene?: Pick<Scene, 'lines'>): NarrativeAssertion {
  const clone = structuredClone(assertion);
  const binding = trustedBindings.get(assertion);
  if (binding && trustedAssertionReference(assertion, fields, scene)) trustedBindings.set(clone, binding);
  return clone;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function resolveAssertionAuditReferences(rawAudit: unknown, table: AssertionReferenceTable): AssertionAudit {
  if (!isRecord(rawAudit) || !Array.isArray(rawAudit.assertions)) throw new AssertionReferenceError('$.assertionAudit.assertions 必须是数组。');
  const items = rawAudit.assertions;
  const indexed = items.some(item => isRecord(item) && Object.hasOwn(item, 'unitId')) || !Object.hasOwn(rawAudit, 'reviewedFields');
  if (!indexed) {
    if (items.some(item => isRecord(item) && Object.hasOwn(item, 'reference'))) throw new AssertionReferenceError('$.assertionAudit.assertions 不得伪造 reference 位置。');
    return rawAudit as unknown as AssertionAudit;
  }
  const fieldSnapshot = tableFields.get(table);
  if (!fieldSnapshot) throw new AssertionReferenceError('$.assertionAudit 必须使用程序为当前候选建立的引用表。');
  if (Object.hasOwn(rawAudit, 'reviewedFields')) throw new AssertionReferenceError('$.assertionAudit.reviewedFields 由程序派生，编号格式不得混入。');
  const byUnitId = new Map(table.units.map(unit => [unit.unitId, unit]));
  const bySourceId = new Map(table.sourceUnits.map(unit => [unit.sourceUnitId, unit]));
  const covered = new Set<string>();
  const errors: string[] = [];
  const invalidIndices = new Set<number>();
  let requiresFullRepair = false;
  const assertions = items.flatMap((item, index): NarrativeAssertion[] => {
    const path = `$.assertionAudit.assertions[${index}]`;
    const fail = (message: string): void => { errors.push(message); invalidIndices.add(index); };
    if (!isRecord(item)) {
      fail(`${path} 必须是对象。`);
      requiresFullRepair = true;
      return [];
    }
    for (const key of Object.keys(item)) {
      if (!['unitId', 'proposition', 'status', 'citations', 'reason'].includes(key)) fail(`${path}.${key} 不属于编号断言格式，模型不得输出。`);
    }
    const unit = typeof item.unitId === 'string' ? byUnitId.get(item.unitId) : undefined;
    if (unit) covered.add(unit.unitId);
    else {
      fail(`${path}.unitId 必须引用当前候选的正文单元。`);
      requiresFullRepair = true;
    }
    if (!Array.isArray(item.citations)) fail(`${path}.citations 必须是来源单元编号数组。`);
    const citations = (Array.isArray(item.citations) ? item.citations : []).flatMap((id, sourceIndex) => {
      const source = typeof id === 'string' ? bySourceId.get(id) : undefined;
      if (!source) {
        fail(`${path}.citations[${sourceIndex}] 必须引用当前候选的 sourceUnitId。`);
        return [];
      }
      return [{ sourceId: source.sourceId, quote: source.text }];
    });
    if (!unit || invalidIndices.has(index)) return [];
    const reference: AssertionReferenceBinding = { candidateFingerprint: table.candidateFingerprint, start: unit.start, end: unit.end,
      ...(unit.speakerId ? { speakerId: unit.speakerId } : {}), ...(unit.playableLineIndex !== undefined ? { playableLineIndex: unit.playableLineIndex } : {}) };
    const assertion = { field: unit.field, quote: unit.text, proposition: item.proposition, status: item.status,
      citations, reason: item.reason, unitId: unit.unitId, reference } as NarrativeAssertion;
    trustedBindings.set(assertion, { ...reference, unitId: unit.unitId, field: unit.field, text: unit.text, playableText: unitPlayableText.get(unit), fieldsFingerprint: fingerprint(JSON.stringify(fieldSnapshot)), sceneFingerprint: tableScenes.get(table) ?? '' });
    return [assertion];
  });
  // Unknown unit ownership requires a complete corrected report: guessing append targets could duplicate a replacement.
  const missing = requiresFullRepair ? [] : table.units.filter(unit => !covered.has(unit.unitId)).map(unit => unit.unitId);
  if (missing.length) errors.push(`$.assertionAudit.assertions 缺少正文单元：${missing.join(', ')}。每个单元须审查全部命题。`);
  if (errors.length) throw new AssertionReferenceError(errors.join('\n'), [...invalidIndices], missing, requiresFullRepair);
  return { reviewedFields: [...new Set(assertions.map(assertion => assertion.field))], assertions };
}
