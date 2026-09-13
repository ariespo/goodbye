import { reviewBackgroundFactProposal } from '../../data/backgroundHistory';
import type { FactReview, RevealLevel, WriterPacket } from './types';

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
      speakerIds: [],
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
      speakerIds: [...fact.characterIds],
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

function dialogueSpeaker(fieldText: string, quote: string): string | null {
  const lines = fieldText.split(/\r?\n/).filter(line => line.includes(quote) || quote.includes(line));
  for (const line of lines) {
    const match = line.match(/^(?:对话|dialog|dialogue)[|｜]([^|｜]+)[|｜]/i);
    if (match) return match[1]?.trim() ?? null;
  }
  return null;
}

function isNarrator(speaker: string): boolean {
  return /^(?:旁白|narrator)$/i.test(speaker);
}

export function validateAssertionAudit(
  audit: AssertionAudit,
  sources: AssertionSource[],
  narrativeFields: Record<string, string>,
): FactReview {
  const violations: FactReview['violations'] = [];
  const materialFields = Object.entries(narrativeFields)
    .filter(([, value]) => typeof value === 'string' && value.trim())
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
    if (reviewed.has(field) && !assertions.some(assertion => assertion?.field === field)) {
      violations.push({
        code: 'incomplete-assertion-audit',
        message: `已声明审查字段 ${field}，但没有列出该字段的任何具体断言。`,
      });
    }
  }

  const statuses = new Set(['supported', 'unsupported', 'contradicted', 'question', 'hypothesis', 'ordinary-present']);
  for (const assertion of assertions) {
    const fieldText = typeof assertion?.field === 'string' ? narrativeFields[assertion.field] : undefined;
    const quote = typeof assertion?.quote === 'string' ? assertion.quote.trim() : '';
    const proposition = typeof assertion?.proposition === 'string' ? assertion.proposition.trim() : '';
    const reason = typeof assertion?.reason === 'string' ? assertion.reason.trim() : '';
    const citations = Array.isArray(assertion?.citations) ? assertion.citations : [];
    if (!fieldText || !reviewed.has(assertion.field) || !quote || !fieldText.includes(quote)
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
      const speaker = assertion.field === 'maintext' ? dialogueSpeaker(fieldText, quote) : null;
      if (speaker && !isNarrator(speaker)
        && Array.isArray(source.speakerIds) && !source.speakerIds.includes(speaker)) {
        badCitation = true;
      }
    }
    if (badCitation || (assertion.status === 'supported' && citations.length === 0)) {
      violations.push({
        code: badCitation ? 'invalid-assertion-citation' : 'unsupported-assertion',
        message: `断言“${quote}”没有有效的逐项来源引文或违反来源的讲述权限。`,
      });
    }
    if (assertion.status === 'unsupported') {
      violations.push({ code: 'unsupported-assertion', message: `正文含无来源支持的断言“${quote}”：${reason}` });
    }
    if (assertion.status === 'contradicted') {
      violations.push({ code: 'contradicted-assertion', message: `正文含与来源冲突的断言“${quote}”：${reason}` });
    }
  }

  return {
    approved: violations.length === 0,
    violations,
    corrections: violations.map(violation => violation.message),
    assertionAudit: audit,
  };
}
