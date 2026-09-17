import { reviewBackgroundFactProposal } from '../../data/backgroundHistory';
import { getItemByReference } from '../../data/itemAssets';
import { characterIdFromSpeaker } from '../../data/npcPlayerKnowledge';
import type { FactAliasTable } from './fact-aliases';
import type { FactReview, RevealLevel, WriterPacket } from './types';
import { trustedAssertionReference, type AssertionReferenceBinding } from './assertion-references';

export interface AssertionSource {
  id: string;
  kind: 'fact' | 'public-event' | 'background' | 'accepted-event' | 'action-outcome';
  text: string;
  factId?: string;
  level?: RevealLevel;
  speakerIds?: string[];
  requiredEvidenceText?: string;
}

export interface NarrativeAssertion {
  unitId?: string;
  reference?: AssertionReferenceBinding;
  field: string;
  quote: string;
  proposition: string;
  status: 'supported' | 'unsupported' | 'contradicted' | 'question' | 'hypothesis' | 'ordinary-present';
  citations: Array<{ sourceId: string; quote: string }>;
  reason: string;
}

export interface AssertionAudit {
  reviewedFields: string[];
  assertions: NarrativeAssertion[];
}

/** Program-private binding from public per-turn aliases to durable fact propositions. */
export function buildCanonicalPropositionBySourceId(
  sources: readonly AssertionSource[],
  aliases: FactAliasTable,
): Record<string, string> {
  return Object.fromEntries(sources.flatMap(source => {
    if (source.kind !== 'fact' || !source.factId) return [];
    const canonicalFactId = aliases.aliasToFactId[source.factId];
    return canonicalFactId ? [[source.id, `fact:${canonicalFactId}`] as const] : [];
  }));
}

const NESTED_NONPLAYABLE_TAGS = ['option', 'sum', 'hint', 'observe', 'investigate', 'action'] as const;

function tagBlocks(raw: string, tag: string): Array<{ attributes: string; content: string }> {
  const pattern = new RegExp(`<${tag}(\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}\\s*>`, 'gi');
  return [...raw.matchAll(pattern)].map(match => ({
    attributes: match[1] ?? '',
    content: (match[2] ?? '').trim(),
  }));
}

function stripNestedNonplayable(content: string): string {
  let result = content;
  for (const tag of NESTED_NONPLAYABLE_TAGS) {
    const pattern = new RegExp(`<${tag}(?:\\s[^>]*)?>[\\s\\S]*?<\\/${tag}\\s*>`, 'gi');
    result = result.replace(pattern, '');
  }
  return result.trim();
}

function addLines(fields: Record<string, string>, prefix: string, content: string, start: number): number {
  let index = start;
  for (const line of content.split(/\r?\n/).map(item => item.trim()).filter(Boolean)) {
    fields[`${prefix}:${index}`] = line;
    index += 1;
  }
  return index;
}

/** Extracts every player-visible narrative field while excluding nested checklist tags from playable prose. */
export function extractNarrativeFields(narrative: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const maintext = tagBlocks(narrative, 'maintext')[0]?.content;
  if (maintext) {
    const playable = stripNestedNonplayable(maintext);
    if (playable) fields.maintext = playable;
  }

  let optionIndex = 0;
  for (const block of tagBlocks(narrative, 'option')) {
    optionIndex = addLines(fields, 'option', block.content, optionIndex);
  }
  const summary = tagBlocks(narrative, 'sum')[0]?.content;
  if (summary) fields.summary = summary;
  const hint = tagBlocks(narrative, 'hint')[0]?.content;
  if (hint) fields.hint = hint;
  const observation = tagBlocks(narrative, 'observe')[0]?.content;
  if (observation) fields.observation = observation;

  let investigateIndex = 0;
  for (const block of tagBlocks(narrative, 'investigate')) {
    investigateIndex = addLines(fields, 'investigate', block.content, investigateIndex);
  }
  let actionIndex = 0;
  for (const block of tagBlocks(narrative, 'action')) {
    actionIndex = addLines(fields, 'action', block.content, actionIndex);
  }
  if (Object.keys(fields).length === 0 && narrative.trim()) fields.maintext = narrative.trim();
  return fields;
}

function publicRecords(value: unknown): Array<{ id: string; text: string; speakerIds?: string[] }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (!item || typeof item !== 'object') return [];
    const record = item as { id?: unknown; text?: unknown; speakerIds?: unknown };
    if (typeof record.id !== 'string' || typeof record.text !== 'string'
      || !record.id.trim() || !record.text.trim()) return [];
    return [{
      id: record.id,
      text: record.text,
      ...(Array.isArray(record.speakerIds)
        ? { speakerIds: record.speakerIds.filter((speaker): speaker is string => typeof speaker === 'string') }
        : {}),
    }];
  });
}

export function buildAssertionSources(
  packet: WriterPacket,
  narrativeFields: Record<string, string> = {},
): AssertionSource[] {
  const continuity = packet.continuityContext && typeof packet.continuityContext === 'object'
    ? packet.continuityContext
    : {};
  const backgroundSpeakers = new Map(
    (packet.authorizedBackgroundSpeakers ?? []).map(item => [item.factId, item.speakerIds] as const),
  );
  const sources: AssertionSource[] = [
    ...(packet.authorizedFacts ?? []).map(fact => ({
      id: `fact:${fact.id}:${fact.level}`,
      kind: 'fact' as const,
      text: fact.text,
      factId: fact.id,
      level: fact.level,
      speakerIds: fact.delivery === 'dialogue' && fact.speakerId ? [fact.speakerId] : [],
    })),
    ...(packet.playerKnownFacts ?? []).map(fact => ({
      id: `known-fact:${fact.id}:${fact.level}`,
      kind: 'fact' as const,
      text: fact.text,
      factId: fact.id,
      level: fact.level,
      speakerIds: [...(packet.knownFactSpeakers?.find(grant => grant.factId === fact.id && grant.level === fact.level)?.speakerIds ?? [])],
    })),
    ...publicRecords(continuity.publicContinuity).map(event => ({
      id: `public-event:${event.id}`,
      kind: 'public-event' as const,
      text: event.text,
      speakerIds: event.speakerIds ?? [],
    })),
    ...(packet.authorizedBackgroundFacts ?? []).map(fact => ({
      id: `background:${fact.factId}`,
      kind: 'background' as const,
      text: fact.text,
      factId: fact.factId,
      speakerIds: [...(backgroundSpeakers.get(fact.factId) ?? [])],
    })),
    ...(packet.authorizedKnowledgeEvents ?? []).map(event => ({
      id: `accepted-event:${event.eventId}`,
      kind: 'accepted-event' as const,
      text: event.evidence,
      speakerIds: [],
    })),
    ...publicRecords(packet.authorizedActionOutcomes).map(outcome => ({
      id: `action-outcome:${outcome.id}`,
      kind: 'action-outcome' as const,
      text: outcome.text,
      speakerIds: outcome.speakerIds ?? [],
    })),
  ];

  const playableMaintext = narrativeFields.maintext ?? '';
  for (const proposal of packet.approvedBackgroundFactProposals ?? []) {
    if (!reviewBackgroundFactProposal(proposal).approved) continue;
    if (!playableMaintext.includes(proposal.evidenceText)) continue;
    sources.push({
      id: `background-proposal:${proposal.proposalId}`,
      kind: 'background',
      text: `${proposal.text}\n${proposal.evidenceText}`,
      factId: `soft:${proposal.proposalId}`,
      speakerIds: [...proposal.knowerIds],
      requiredEvidenceText: proposal.evidenceText,
    });
  }
  return sources;
}

function dialogueSpeakersForQuote(fieldText: string, quote: string): string[] {
  const quoteRanges: Array<{ start: number; end: number }> = [];
  let offset = 0;
  while (offset <= fieldText.length - quote.length) {
    const index = fieldText.indexOf(quote, offset);
    if (index < 0) break;
    quoteRanges.push({ start: index, end: index + quote.length });
    offset = index + Math.max(1, quote.length);
  }
  const speakers: string[] = [];
  for (const lineMatch of fieldText.matchAll(/[^\r\n]+/g)) {
    const start = lineMatch.index ?? 0;
    const end = start + lineMatch[0].length;
    if (!quoteRanges.some(range => range.start < end && range.end > start)) continue;
    const match = lineMatch[0].trim().match(/^(?:对话|dialog|dialogue)[|｜]([^|｜]+)[|｜]/i);
    if (match?.[1]) {
      const rawSpeaker = match[1].trim();
      if (isNarrator(rawSpeaker)) continue;
      speakers.push(characterIdFromSpeaker(rawSpeaker) ?? `unknown:${rawSpeaker}`);
    }
  }
  return speakers;
}

function isNarrator(speaker: string): boolean {
  return /^(?:旁白|narrator)$/i.test(speaker);
}

const CONTROL_ONLY_LINE_TYPES = new Set([
  '场景', 'scene', '音乐', 'bgm', 'music', '镜头', 'camera', '效果', 'effect',
  '动作', 'animation', '认知', 'knowledge', '身份确认', 'identity-prompt',
]);

function isCoveragePunctuation(value: string): boolean {
  return /[\s\p{P}]/u.test(value);
}

function markMaterialRange(mask: boolean[], text: string, start: number, end: number): void {
  for (let index = start; index < end; index += 1) {
    if (!isCoveragePunctuation(text[index] ?? '')) mask[index] = true;
  }
}

function materialCoverageMask(field: string, text: string): boolean[] {
  const mask = Array.from({ length: text.length }, () => false);
  if (field !== 'maintext') {
    markMaterialRange(mask, text, 0, text.length);
    return mask;
  }

  for (const match of text.matchAll(/[^\r\n]+/g)) {
    const rawLine = match[0];
    const lineStart = match.index ?? 0;
    const leading = rawLine.length - rawLine.trimStart().length;
    const trailing = rawLine.length - rawLine.trimEnd().length;
    const start = lineStart + leading;
    const end = lineStart + rawLine.length - trailing;
    const line = text.slice(start, end);
    const head = line.split(/[|｜]/, 1)[0]?.trim().toLowerCase() ?? '';
    if (CONTROL_ONLY_LINE_TYPES.has(head)) continue;
    if (['对话', 'dialog', 'dialogue'].includes(head)) {
      const separators = [...line.matchAll(/[|｜]/g)].map(item => item.index ?? -1);
      if (separators.length < 3) continue;
      const contentStart = start + separators[2] + 1;
      const itemCandidate = separators.length >= 4
        ? line.slice(separators[separators.length - 1] + 1).trim()
        : '';
      const contentEnd = itemCandidate && getItemByReference(itemCandidate)
        ? start + separators[separators.length - 1]
        : end;
      markMaterialRange(mask, text, contentStart, contentEnd);
      continue;
    }
    markMaterialRange(mask, text, start, end);
  }
  return mask;
}

function assertionCoverageMask(fieldText: string, assertions: NarrativeAssertion[], fields: Record<string, string>): boolean[] {
  const mask = Array.from({ length: fieldText.length }, () => false);
  for (const assertion of assertions) {
    if (assertion.unitId || assertion.reference) {
      const reference = trustedAssertionReference(assertion, fields);
      if (reference) for (let cursor = reference.start; cursor < reference.end; cursor += 1) mask[cursor] = true;
      continue;
    }
    const quote = typeof assertion?.quote === 'string' ? assertion.quote.trim() : '';
    if (!quote) continue;
    let offset = 0;
    while (offset <= fieldText.length - quote.length) {
      const index = fieldText.indexOf(quote, offset);
      if (index < 0) break;
      for (let cursor = index; cursor < index + quote.length; cursor += 1) mask[cursor] = true;
      offset = index + Math.max(1, quote.length);
    }
  }
  return mask;
}

export function validateAssertionAudit(
  audit: AssertionAudit,
  sources: AssertionSource[],
  narrativeFields: Record<string, string>,
): FactReview {
  const violations: FactReview['violations'] = [];
  const materialMasks = new Map(
    Object.entries(narrativeFields).map(([field, value]) => [field, materialCoverageMask(field, value)]),
  );
  const materialFields = Object.entries(narrativeFields)
    .filter(([field, value]) => typeof value === 'string'
      && value.trim()
      && materialMasks.get(field)?.some(Boolean))
    .map(([field]) => field);
  const reviewedFields = Array.isArray(audit?.reviewedFields)
    ? audit.reviewedFields.filter((field): field is string => typeof field === 'string' && !!field.trim())
    : [];
  const assertions = Array.isArray(audit?.assertions) ? audit.assertions : [];
  const reviewed = new Set(reviewedFields);
  const byId = new Map(sources.map(source => [source.id, source]));

  if (reviewedFields.length !== reviewed.size
    || reviewedFields.some(field => !Object.prototype.hasOwnProperty.call(narrativeFields, field))
    || materialFields.some(field => !reviewed.has(field))) {
    violations.push({
      code: 'incomplete-assertion-audit',
      message: '正文断言审查没有逐项覆盖全部可播放及衍生字段。',
    });
  }
  if (materialFields.length > 0 && assertions.length === 0) {
    violations.push({ code: 'incomplete-assertion-audit', message: '有实质正文时 assertionAudit.assertions 不得为空。' });
  }

  for (const field of materialFields) {
    const fieldAssertions = assertions.filter(assertion => assertion?.field === field);
    if (reviewed.has(field) && fieldAssertions.length === 0) {
      violations.push({
        code: 'incomplete-assertion-audit',
        message: `已声明审查字段 ${field}，但没有列出该字段的任何具体断言。`,
      });
      continue;
    }
    const required = materialMasks.get(field) ?? [];
    const covered = assertionCoverageMask(narrativeFields[field] ?? '', fieldAssertions, narrativeFields);
    if (required.some((isRequired, index) => isRequired && !covered[index])) {
      violations.push({
        code: 'incomplete-assertion-audit',
        message: `字段 ${field} 的 assertion.quote 合集没有覆盖全部可播放文字。`,
      });
    }
  }

  const statuses = new Set(['supported', 'unsupported', 'contradicted', 'question', 'hypothesis', 'ordinary-present']);
  for (const assertion of assertions) {
    const reference = trustedAssertionReference(assertion, narrativeFields);
    const fieldText = typeof assertion?.field === 'string' ? narrativeFields[assertion.field] : undefined;
    const quote = typeof assertion?.quote === 'string' ? assertion.quote.trim() : '';
    const proposition = typeof assertion?.proposition === 'string' ? assertion.proposition.trim() : '';
    const reason = typeof assertion?.reason === 'string' ? assertion.reason.trim() : '';
    const citations = Array.isArray(assertion?.citations) ? assertion.citations : [];
    if (!fieldText || !reviewed.has(assertion.field) || !quote || !fieldText.includes(quote)
      || ((assertion.unitId || assertion.reference) && !reference)
      || !proposition || !reason || !statuses.has(assertion.status)) {
      violations.push({
        code: 'incomplete-assertion-audit',
        message: `断言缺少有效字段、原文引文、命题、状态或理由：${assertion?.field ?? 'unknown'}。`,
      });
      continue;
    }

    let badCitation = false;
    for (const citation of citations) {
      const source = typeof citation?.sourceId === 'string' ? byId.get(citation.sourceId) : undefined;
      const sourceQuote = typeof citation?.quote === 'string' ? citation.quote.trim() : '';
      if (!source || !sourceQuote || !source.text.includes(sourceQuote)
        || (source.requiredEvidenceText && !(narrativeFields.maintext ?? '').includes(source.requiredEvidenceText))) {
        badCitation = true;
        continue;
      }
      const speakers = assertion.field === 'maintext'
        ? reference ? (reference.speakerId ? [reference.speakerId] : []) : dialogueSpeakersForQuote(fieldText, quote)
        : [];
      if (speakers.some(speaker => !(
        source.id.startsWith('known-fact:') && speaker === 'player'
      ) && (!Array.isArray(source.speakerIds) || !source.speakerIds.includes(speaker)))) {
        badCitation = true;
      }
    }
    if (badCitation || (assertion.status === 'supported' && citations.length === 0)) {
      violations.push({
        code: badCitation ? 'invalid-assertion-citation' : 'unsupported-assertion',
        message: `断言“${quote}”没有有效的逐项来源引文或违反来源的讲述权限。`,
        field: assertion.field, candidateQuote: quote,
      });
    }
    if (assertion.status === 'unsupported') {
      violations.push({ code: 'unsupported-assertion', message: `正文含无来源支持的断言“${quote}”：${reason}`,
        field: assertion.field, candidateQuote: quote });
    }
    if (assertion.status === 'contradicted') {
      violations.push({ code: 'contradicted-assertion', message: `正文含与来源冲突的断言“${quote}”：${reason}`,
        field: assertion.field, candidateQuote: quote });
    }
  }

  return {
    approved: violations.length === 0,
    violations,
    corrections: violations.map(violation => violation.message),
    assertionAudit: audit,
  };
}
