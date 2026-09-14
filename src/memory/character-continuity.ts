import type { AssertionAudit, AssertionSource, NarrativeAssertion } from '../agents/mystery/fact-assertion-review';
import { characterIdFromSpeaker } from '../data/npcPlayerKnowledge';
import { getLocationById } from '../data/locations';
import type { ScheduledBoundary } from '../engine/scheduled-events';
import type { Scene } from '../sillytavern/types';
import type { CognitionDelta, CognitionRecord, WorldMemoryState } from './world-memory';

export interface ReviewedLineSpan {
  lineIndex: number;
  quote: string;
}

export interface ReviewedAssertionSpan extends ReviewedLineSpan {
  assertionIndex: number;
}

export interface DisclosureRecord {
  id: string;
  cycleCount: number;
  speakerId: string;
  listenerIds: string[];
  propositionId: string;
  sourceEventId: string;
  evidenceQuote: string;
  evidenceSpans: Array<ReviewedLineSpan & { assertionIndex?: number }>;
}

export interface CommitmentRecord {
  id: string;
  cycleCount: number;
  actorId: string;
  recipientId: string;
  action: string;
  locationId: string;
  dueAt: string;
  status: 'active' | 'fulfilled' | 'cancelled' | 'expired';
  sourceEventId: string;
  evidenceQuote: string;
  statusSourceEventId?: string;
  statusEvidenceQuote?: string;
  expiredReason?: 'reset' | 'missed';
}

export interface CharacterContinuityAudit {
  reviewed: true;
  disclosures: Array<{
    assertionIndex: number;
    lineIndex: number;
    quote: string;
    listenerIds: string[];
    audienceEvidence: ReviewedLineSpan[];
  }>;
  beliefs: Array<{
    assertionIndex: number;
    observerId: string;
    status: 'believed' | 'suspected' | 'inferred';
    evidence: ReviewedLineSpan[];
  }>;
  commitments: Array<{
    operation: 'accept' | 'fulfill' | 'cancel';
    existingCommitmentId?: string;
    actorId: string;
    recipientId: string;
    evidence: ReviewedLineSpan[];
    action?: string;
    locationId?: string;
    dueAt?: string;
  }>;
}

export interface CharacterContinuityEvidenceLine {
  lineIndex: number;
  speakerId: string | null;
  text: string;
  background?: string;
}

export interface CharacterContinuityCandidateEvidence {
  candidateId: string;
  lines: CharacterContinuityEvidenceLine[];
  assertionAudit: AssertionAudit;
  assertionSources: AssertionSource[];
  canonicalPropositionBySourceId: Record<string, string>;
  possibleAudienceIds: string[];
  resolvedEndTime: string;
}

export interface ValidatedCharacterContinuityEffects {
  candidateId: string;
  cognitionDeltas: CognitionDelta[];
  disclosures: Array<Omit<DisclosureRecord, 'id' | 'cycleCount' | 'sourceEventId'>>;
  commitmentOperations: Array<
    | { operation: 'accept'; actorId: string; recipientId: string; action: string;
      locationId: string; dueAt: string; evidenceQuote: string }
    | { operation: 'fulfill' | 'cancel'; existingCommitmentId: string;
      actorId: string; recipientId: string; evidenceQuote: string }
  >;
}

const NONPLAYABLE_TAGS = ['option', 'sum', 'hint', 'observe', 'investigate', 'action'] as const;

/** Produce the same accepted playable maintext from either a full response or clean maintext. */
export function canonicalCharacterContinuityMaintext(candidateText: string): string {
  const normalized = candidateText.replace(/\r\n?/g, '\n');
  const maintext = normalized.match(/<maintext(?:\s[^>]*)?>([\s\S]*?)<\/maintext\s*>/i)?.[1] ?? normalized;
  return NONPLAYABLE_TAGS.reduce((text, tag) => (
    text.replace(new RegExp(`<${tag}(?:\\s[^>]*)?>[\\s\\S]*?<\\/${tag}\\s*>`, 'gi'), '')
  ), maintext).trim();
}

export function candidateFingerprint(candidateText: string): string {
  const canonical = canonicalCharacterContinuityMaintext(candidateText);
  let hash = 0x811c9dc5;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `candidate:${(hash >>> 0).toString(16).padStart(8, '0')}:${canonical.length}`;
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.filter(value => typeof value === 'string' && value.trim()).map(value => value.trim()))];
}

export function buildCharacterContinuityCandidateEvidence(input: {
  candidateText: string;
  scene: Pick<Scene, 'lines'>;
  assertionAudit: AssertionAudit;
  assertionSources: AssertionSource[];
  possibleAudienceIds: readonly string[];
  resolvedEndTime: string;
  canonicalPropositionBySourceId?: Readonly<Record<string, string>>;
}): CharacterContinuityCandidateEvidence {
  const lines = input.scene.lines.map((line, lineIndex) => ({
    lineIndex,
    speakerId: characterIdFromSpeaker(line.speaker),
    text: line.text,
    ...(line.background ? { background: line.background } : {}),
  }));
  return {
    candidateId: candidateFingerprint(input.candidateText),
    lines,
    assertionAudit: structuredClone(input.assertionAudit),
    assertionSources: structuredClone(input.assertionSources),
    canonicalPropositionBySourceId: Object.fromEntries(Object.entries(input.canonicalPropositionBySourceId ?? {})
      .filter(([sourceId, propositionId]) => (
        input.assertionSources.some(source => source.id === sourceId)
        && /^fact:[^\s:][^\s]*$/u.test(propositionId)
      ))),
    possibleAudienceIds: uniqueStrings([
      'player',
      ...input.possibleAudienceIds,
      ...lines.map(line => line.speakerId).filter((id): id is string => id !== null),
    ]),
    resolvedEndTime: input.resolvedEndTime,
  };
}

const CHARACTER_MENTIONS: Record<string, readonly string[]> = {
  player: ['玩家', '{{user}}'],
  fumi: ['文穗'],
  touko: ['沈灯织', '灯织', '学姐'],
  'chen-huihui': ['陈慧慧', '慧慧', '店员'],
  'old-man': ['周德明', '周大爷'],
  'liu-renguang': ['刘仁光', '体育老师'],
  'school-guard': ['门卫老张', '老张', '学校门卫', '门卫'],
  'detective-a': ['赵刚', '寸头男人', '货车司机'],
  'detective-b': ['林静', '新来的护士', '陌生护士'],
};

function lineMentionsCharacter(text: string, characterId: string): boolean {
  return (CHARACTER_MENTIONS[characterId] ?? [characterId]).some(alias => text.includes(alias));
}

function lineDirectlyAddressesCharacter(text: string, characterId: string): boolean {
  const trimmed = text.trim();
  return (CHARACTER_MENTIONS[characterId] ?? [characterId]).some(alias => (
    trimmed.startsWith(`${alias}，`) || trimmed.startsWith(`${alias},`)
    || trimmed.startsWith(`${alias}：`) || trimmed.startsWith(`${alias}:`)
  ));
}

function validSpan(span: ReviewedLineSpan, evidence: CharacterContinuityCandidateEvidence): CharacterContinuityEvidenceLine | null {
  if (!span || !Number.isSafeInteger(span.lineIndex) || typeof span.quote !== 'string' || !span.quote.trim()) return null;
  const line = evidence.lines[span.lineIndex];
  return line && line.text.includes(span.quote) ? line : null;
}

function listenerHasEvidence(
  listenerId: string,
  spans: readonly ReviewedLineSpan[],
  evidence: CharacterContinuityCandidateEvidence,
  source?: { lineIndex: number; speakerId: string; quote: string; background?: string },
): boolean {
  const nextRepeatedSource = source
    ? evidence.lines.find(line => (
      line.lineIndex > source.lineIndex
      && line.speakerId === source.speakerId
      && line.text.includes(source.quote)
    ))?.lineIndex
    : undefined;
  const bounded = spans.flatMap(span => {
    const line = validSpan(span, evidence);
    if (!line) return [];
    if (source && (line.lineIndex < source.lineIndex
      || (nextRepeatedSource !== undefined && line.lineIndex >= nextRepeatedSource))) return [];
    return [{ span, line }];
  });
  const channelBridge = source && bounded.find(({ line }) => (
    line.lineIndex >= source.lineIndex
    && line.lineIndex <= source.lineIndex + 1
    && lineMentionsCharacter(line.text, listenerId)
    && /(?:听见|听到|听着|电话|通话|耳机|扬声器|消息|短信|频道|接通|电话那头)/u.test(line.text)
  ));
  return bounded.some(({ line }) => {
    if (source) {
      const sameRenderedContext = !source.background || !line.background || source.background === line.background;
      const immediateExchange = line.lineIndex === source.lineIndex
        || (line.lineIndex === source.lineIndex + 1 && sameRenderedContext);
      const connectedChannel = !!channelBridge
        && line.lineIndex >= channelBridge.line.lineIndex
        && line.lineIndex <= channelBridge.line.lineIndex + 1;
      if (!immediateExchange && !connectedChannel) return false;
    }
    if (line.speakerId === listenerId) {
      return true;
    }
    if (!lineMentionsCharacter(line.text, listenerId)) return false;
    return /(?:听见|听到|听着|回应|回答|点头|对.+说|告诉|电话|通话|耳机|扬声器|消息|短信|频道)/u.test(line.text)
      || lineDirectlyAddressesCharacter(line.text, listenerId);
  });
}

function acceptedAssertion(
  index: number,
  evidence: CharacterContinuityCandidateEvidence,
): NarrativeAssertion | null {
  if (!Number.isSafeInteger(index) || index < 0) return null;
  const assertion = evidence.assertionAudit.assertions[index];
  if (!assertion || assertion.field !== 'maintext') return null;
  if (assertion.status === 'unsupported' || assertion.status === 'contradicted') return null;
  return assertion;
}

function propositionIdFor(
  assertion: NarrativeAssertion,
  assertionIndex: number,
  evidence: CharacterContinuityCandidateEvidence,
): string {
  for (const citation of assertion.citations) {
    const source = evidence.assertionSources.find(candidate => candidate.id === citation.sourceId);
    if (!source) continue;
    const bound = evidence.canonicalPropositionBySourceId[source.id];
    if (source.kind === 'fact' && bound) return bound;
  }
  return `claim:${evidence.candidateId}:${assertionIndex}`;
}

function evidenceQuote(spans: readonly ReviewedLineSpan[]): string {
  return spans.map(span => span.quote.trim()).filter(Boolean).join(' / ');
}

function isSameLocalDay(left: number, right: number): boolean {
  const a = new Date(left);
  const b = new Date(right);
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function beliefReactionEvidence(
  observerId: string,
  status: 'believed' | 'suspected' | 'inferred',
  spans: readonly ReviewedLineSpan[],
  evidence: CharacterContinuityCandidateEvidence,
  assertion: NarrativeAssertion,
): boolean {
  const reactionPolarity = (text: string): 'positive' | 'negative' | 'none' => {
    const positive = status === 'believed'
      ? /(?:相信|信了|认同|确信|是真的|有道理|合理)/u
      : status === 'suspected'
        ? /(?:怀疑|可疑|不确定|未必|也许|可能)/u
        : /(?:推断|推测|看来|说明|意味着|所以)/u;
    const negative = status === 'believed'
      ? /(?:不|并不|没(?:有)?|未曾?|无法|不能|难以)(?:再|真|完全)?(?:相信|信服|认同|确信)|(?:不|并不|未必)是真的|(?:不|并不|很不)合理|(?:没(?:有)?|无)(?:什么)?道理/u
      : status === 'suspected'
        ? /(?:不再|并不|没(?:有)?|未曾?)怀疑|(?:一点也不|并不|不)可疑/u
        : /(?:不|并不|没(?:有)?|未曾?|无法|不能)(?:据此)?(?:推断|推测|说明|意味着)/u;
    if (negative.test(text)) return 'negative';
    return positive.test(text) ? 'positive' : 'none';
  };
  return spans.some(span => {
    const line = validSpan(span, evidence);
    if (!line) return false;
    const citedClauses = span.quote.split(/[，。！？,!.?；;]/u).map(text => text.trim()).filter(Boolean);
    if (!citedClauses.some(clause => reactionPolarity(clause) === 'positive')) return false;
    const belongsToObserver = line.speakerId === observerId
      || (line.speakerId === null && lineMentionsCharacter(line.text, observerId));
    if (!belongsToObserver) return false;
    const assertionReferences = [assertion.quote, assertion.proposition]
      .map(text => text.replace(/[\s，。！？、,!.?]/g, ''))
      .filter(Boolean);
    const reactionClauses = line.text.split(/[，。！？,!.?；;]/u).map(text => text.trim()).filter(Boolean);
    const directlyBound = reactionClauses.some(clause => {
      const normalizedClause = clause.replace(/[\s，。！？、,!.?]/g, '');
      return reactionPolarity(clause) === 'positive'
        && assertionReferences.some(reference => normalizedClause.includes(reference));
    });
    if (directlyBound) return true;
    const assertionLine = evidence.lines.find(candidate => candidate.text.includes(assertion.quote));
    if (!assertionLine || line.lineIndex !== assertionLine.lineIndex + 1
      || !/(?:这|此事|这件事|你说的|刚才|那个说法|有道理|合理)/u.test(line.text)) return false;
    const referentialResidue = line.text
      .replace(/(?:嗯|对|是的|没错|好|哦|啊|我|也|现在|开始|已经|确实|的确|真的|很|挺|更|就|便|才|仍然|依然|这件事|此事|这|你说的|刚才(?:的)?|那个说法|说法|有道理|合理|是真的|相信|信了|认同|确信|怀疑|可疑|不确定|未必|也许|可能|推断|推测|看来|说明|意味着|所以|了)/gu, '')
      .replace(/[\s，。！？、,!.?；;]/gu, '');
    return referentialResidue.length === 0;
  });
}

function explicitlyIntroducesPlayerName(text: string, playerName: string): boolean {
  const escaped = playerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:我叫(?:做)?|我的名字(?:是|叫)|我是)\\s*${escaped}(?:$|[，。！？、,!.?\\s])`, 'u').test(text);
}

function clausesForSpans(
  spans: readonly ReviewedLineSpan[],
  evidence: CharacterContinuityCandidateEvidence,
): Array<{ line: CharacterContinuityEvidenceLine; text: string }> {
  return spans.flatMap(span => {
    const line = validSpan(span, evidence);
    if (!line) return [];
    const clauses = line.text.split(/(?<=[。！？!?；;])/u).map(text => text.trim()).filter(Boolean);
    const containing = clauses.filter(text => text.includes(span.quote));
    return (containing.length > 0 ? containing : [line.text]).map(text => ({ line, text }));
  });
}

const LOCATION_MENTIONS: Readonly<Record<string, readonly string[]>> = {
  home: ['玩家公寓', '公寓', '家里', '住处'],
  'senpai-building': ['学姐商住楼', '学姐楼', '商住楼'],
  school: ['中学', '学校', '校门'],
  supermarket: ['便利店', '超市'],
  'old-man-building': ['独居老头楼', '老头楼', '麻将馆楼上'],
  'mountain-trail': ['黔灵山脚步道', '山脚步道', '步道'],
  'detective-inn': ['侦探小旅馆', '小旅馆', '旅馆'],
  'water-tower': ['废弃水塔', '水塔'],
  'community-hospital': ['社区医院', '医院'],
  'observation-deck': ['废弃观景台', '观景台'],
};

function locationGrounded(locationId: string, text: string): boolean {
  const location = getLocationById(locationId);
  if (!location) return false;
  return uniqueStrings([location.id, location.name, location.shortName, ...(LOCATION_MENTIONS[location.id] ?? [])])
    .some(name => text.includes(name));
}

function parseChineseNumber(value: string): number | null {
  const digitByCharacter: Readonly<Record<string, number>> = {
    零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
  };
  if (value.includes('十')) {
    const [tensText, unitsText] = value.split('十');
    const tens = tensText ? digitByCharacter[tensText] : 1;
    const units = unitsText ? digitByCharacter[unitsText] : 0;
    return tens === undefined || units === undefined ? null : tens * 10 + units;
  }
  const digits = [...value].map(character => digitByCharacter[character]);
  return digits.some(digit => digit === undefined) ? null : Number(digits.join(''));
}

function clockMentions(text: string): Array<{ hour: number; minute: number }> {
  const mentions: Array<{ hour: number; minute: number }> = [];
  for (const match of text.matchAll(/(?<!\d)([01]?\d|2[0-3])[:：]([0-5]\d)(?!\d)/gu)) {
    mentions.push({ hour: Number(match[1]), minute: Number(match[2]) });
  }
  for (const match of text.matchAll(/(?<!\d)([01]?\d|2[0-3])点(半|([0-5]?\d)分?)?(?![\d零〇一二两三四五六七八九十])/gu)) {
    mentions.push({ hour: Number(match[1]), minute: match[2] === '半' ? 30 : Number(match[3] ?? 0) });
  }
  const chineseDigit = '零〇一二两三四五六七八九十';
  const chineseClock = new RegExp(`(?<![${chineseDigit}])([${chineseDigit}]{1,3})点(半|([${chineseDigit}]{1,3})分?)?(?![${chineseDigit}\\d])`, 'gu');
  for (const match of text.matchAll(chineseClock)) {
    const hour = parseChineseNumber(match[1]);
    const minute = match[2] === '半' ? 30 : parseChineseNumber(match[3] ?? '零');
    if (hour !== null && minute !== null && hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      mentions.push({ hour, minute });
    }
  }
  return mentions;
}

function timeGrounded(dueAt: string, text: string): boolean {
  const due = new Date(dueAt);
  if (!Number.isFinite(due.getTime())) return false;
  return clockMentions(text).some(({ hour, minute }) => hour === due.getHours() && minute === due.getMinutes());
}

function recipientGrounded(recipientId: string, text: string, actorSpoken: boolean): boolean {
  if (recipientId === 'player') return actorSpoken ? /(?:你|玩家|\{\{user\}\})/u.test(text) : lineMentionsCharacter(text, 'player');
  return lineMentionsCharacter(text, recipientId);
}

function canonicalActionText(text: string): string {
  return text
    .replace(/(?:交给|交出|递给|送给|转交给|给)/gu, '交付')
    .replace(/(?:玩家|\{\{user\}\}|我|你|他|她|把|将|好|可以|没问题|答应|接受|承诺|同意|一定|准时|会)/gu, '')
    .replace(/(?:零|一|二|三|四|五|六|七|八|九|十|两|[0-9]{1,2})(?:点(?:半|[零一二三四五六七八九十0-9]+分?)?|[:：][0-9]{2})/gu, '')
    .replace(/[\s，。！？、,!.?；;：:]/g, '');
}

function actionGrounded(action: string, text: string): boolean {
  const expected = canonicalActionText(action);
  const rendered = canonicalActionText(text);
  return expected.length >= 2 && (rendered.includes(expected) || expected.includes(rendered));
}

function actorActionIsPerformed(action: string, actorId: string, text: string, actorSpoken: boolean): boolean {
  const aliases = CHARACTER_MENTIONS[actorId] ?? [actorId];
  const actorAlias = (actorSpoken ? ['我', '本人', ...aliases] : aliases)
    .find(alias => text.trim().startsWith(alias));
  if (!actorAlias) return false;
  const predicate = text.trim().slice(actorAlias.length).trim()
    .replace(/^(?:已经|刚刚|刚才|终于|当场|随即)/u, '').trim();
  const expected = canonicalActionText(action);
  const renderedPredicate = canonicalActionText(predicate);
  return expected.length >= 2 && renderedPredicate.startsWith(expected);
}

function affirmativeUndertaking(
  proposal: CharacterContinuityAudit['commitments'][number],
  spans: readonly ReviewedLineSpan[],
  evidence: CharacterContinuityCandidateEvidence,
): boolean {
  const action = proposal.action?.trim() ?? '';
  const locationId = proposal.locationId?.trim() ?? '';
  const dueAt = proposal.dueAt?.trim() ?? '';
  return clausesForSpans(spans, evidence).some(({ line, text }) => {
    const actorSpoken = line.speakerId === proposal.actorId;
    const actorRendered = actorSpoken || (line.speakerId === null && lineMentionsCharacter(text, proposal.actorId));
    const positive = /(?:^|[，,。！？!?；;\s])好(?:[，,。！？!?；;\s]|$)|可以|没问题|答应|接受|承诺|同意|(?:我|本人|他|她).{0,8}(?:会|将|一定|准时)/u.test(text);
    const refusal = /(?:不|并不|不会|没(?:有)?|未曾?|无法|不能|不愿|拒绝)(?:再|真|完全)?(?:会|愿|能|答应|接受|承诺|同意|保证|打算)?/u.test(text.replace(/没问题/gu, ''));
    const conditional = /(?:如果|假如|要是|除非|可能|也许|或许|看情况)/u.test(text);
    const question = /[？?]|(?:吗|是否|要不要)(?:[。！？?!；;]|$)/u.test(text);
    return actorRendered && positive && !refusal && !conditional && !question
      && actionGrounded(action, text)
      && locationGrounded(locationId, text)
      && timeGrounded(dueAt, text)
      && recipientGrounded(proposal.recipientId, text, actorSpoken);
  });
}

function actionEvidence(
  action: string,
  actorId: string,
  spans: readonly ReviewedLineSpan[],
  evidence: CharacterContinuityCandidateEvidence,
): boolean {
  return clausesForSpans(spans, evidence).some(({ line, text }) => {
    const actorRendered = line.speakerId === actorId
      || (line.speakerId === null && lineMentionsCharacter(text, actorId));
    const nonPerformance = /(?:还没有|尚未|并未|未曾|没有|还没|没能|不能|无法|不曾|尚没有)/u.test(text);
    const prospective = /(?:如果|假如|要是|可能|也许|或许|会|将要|准备|打算|计划|稍后|等会|待会|到时|想要|想|愿意|承诺|答应|同意|决定|试图|尝试|声称|表示)|[？?]/u.test(text);
    const narratedPerformance = line.speakerId === null;
    const directPerformance = line.speakerId === actorId && /(?:^|[，,。！？!?；;])\s*我(?:已经|刚刚|刚才|终于)?把/u.test(text);
    const completedPerformance = /(?:已经|刚刚|刚才|终于|完成|完毕|办完|做完)|了[。！？!?；;]?$/u.test(text.trim());
    return actorRendered && !nonPerformance && !prospective
      && !/^(?:到达|来到|抵达|赴约|等待|等到)/u.test(text.trim())
      && (narratedPerformance || directPerformance || completedPerformance)
      && actorActionIsPerformed(action, actorId, text, line.speakerId === actorId);
  });
}

function cancellationEvidence(
  actorId: string,
  spans: readonly ReviewedLineSpan[],
  evidence: CharacterContinuityCandidateEvidence,
): boolean {
  return clausesForSpans(spans, evidence).some(({ line, text }) => {
    const actorRendered = line.speakerId === actorId
      || (line.speakerId === null && lineMentionsCharacter(text, actorId));
    const cancellation = /(?:取消|不去|不能|无法|作废|算了)/u.test(text);
    const deniedCancellation = /(?:没有|并未|未曾?|不(?:会)?)(?:真的)?取消|并非(?:不能|无法)/u.test(text);
    return actorRendered && cancellation && !deniedCancellation
      && !/(?:如果|假如|要是|可能|也许|或许)|[？?]/u.test(text);
  });
}

export function validateCharacterContinuityAudit(input: {
  audit: CharacterContinuityAudit | undefined;
  evidence: CharacterContinuityCandidateEvidence;
  memory: WorldMemoryState;
  cycleCount: number;
  playerIdentityName?: string;
}): { approved: boolean; violations: string[]; effects?: ValidatedCharacterContinuityEffects } {
  const violations: string[] = [];
  const audit = input.audit;
  if (!audit || audit.reviewed !== true || !Array.isArray(audit.disclosures)
    || !Array.isArray(audit.beliefs) || !Array.isArray(audit.commitments)) {
    return { approved: false, violations: ['continuity audit must explicitly review all three effect arrays'] };
  }
  const effects: ValidatedCharacterContinuityEffects = {
    candidateId: input.evidence.candidateId,
    cognitionDeltas: [],
    disclosures: [],
    commitmentOperations: [],
  };

  audit.disclosures.forEach((proposal, proposalIndex) => {
    const assertion = acceptedAssertion(proposal.assertionIndex, input.evidence);
    const sourceLine = validSpan({ lineIndex: proposal.lineIndex, quote: proposal.quote }, input.evidence);
    if (!assertion || !sourceLine || !sourceLine.text.includes(assertion.quote)) {
      violations.push(`disclosure ${proposalIndex} is not bound to an accepted assertion and source line`);
      return;
    }
    if (!sourceLine.speakerId) {
      violations.push(`disclosure ${proposalIndex} has no identified speaker`);
      return;
    }
    const listeners = uniqueStrings(proposal.listenerIds ?? []);
    if (listeners.length === 0 || listeners.some(listener => (
      listener === sourceLine.speakerId
      || !input.evidence.possibleAudienceIds.includes(listener)
      || !listenerHasEvidence(listener, proposal.audienceEvidence ?? [], input.evidence, {
        lineIndex: proposal.lineIndex, speakerId: sourceLine.speakerId, quote: proposal.quote,
        background: sourceLine.background,
      })
    ))) {
      violations.push(`disclosure ${proposalIndex} has an unproved listener or audience`);
      return;
    }
    if ((proposal.audienceEvidence ?? []).some(span => !validSpan(span, input.evidence))) {
      violations.push(`disclosure ${proposalIndex} cites invalid audience evidence`);
      return;
    }
    const propositionId = propositionIdFor(assertion, proposal.assertionIndex, input.evidence);
    const sourceEvidence: ReviewedAssertionSpan = {
      assertionIndex: proposal.assertionIndex, lineIndex: proposal.lineIndex, quote: proposal.quote,
    };
    effects.disclosures.push({
      speakerId: sourceLine.speakerId,
      listenerIds: listeners,
      propositionId,
      evidenceQuote: proposal.quote,
      evidenceSpans: [sourceEvidence, ...(proposal.audienceEvidence ?? [])],
    });
    for (const listenerId of listeners) {
      effects.cognitionDeltas.push({
        observerId: listenerId,
        propositionId,
        status: 'heard',
        confidence: 1,
        summary: `${listenerId} 听到 ${sourceLine.speakerId} 陈述：${assertion.proposition}`,
        provenance: 'accepted-turn',
        scope: listenerId === 'player' ? 'durable' : 'day',
        acquiredCycle: input.cycleCount,
        evidenceSpans: [sourceEvidence, ...(proposal.audienceEvidence ?? [])],
      });
      const playerName = input.playerIdentityName?.trim();
      if (sourceLine.speakerId === 'player' && playerName
        && explicitlyIntroducesPlayerName(sourceLine.text, playerName)) {
        const undercover = listenerId === 'detective-a' || listenerId === 'detective-b';
        effects.cognitionDeltas.push({
          observerId: listenerId,
          propositionId: undercover ? 'expression:player-name' : 'identity:player-name',
          subjectId: 'player',
          status: 'confirmed',
          confidence: 1,
          summary: `${listenerId} 在本回合听到玩家明确介绍姓名`,
          identityScope: 'full-name',
          provenance: 'accepted-turn', scope: 'day', acquiredCycle: input.cycleCount,
          evidenceSpans: [sourceEvidence, ...(proposal.audienceEvidence ?? [])],
        });
      }
    }
  });

  audit.beliefs.forEach((proposal, proposalIndex) => {
    const assertion = acceptedAssertion(proposal.assertionIndex, input.evidence);
    const spans = proposal.evidence ?? [];
    if (!assertion || spans.length === 0 || spans.some(span => !validSpan(span, input.evidence))
      || !beliefReactionEvidence(proposal.observerId, proposal.status, spans, input.evidence, assertion)) {
      violations.push(`belief ${proposalIndex} lacks an accepted rendered observer reaction`);
      return;
    }
    effects.cognitionDeltas.push({
      observerId: proposal.observerId,
      propositionId: propositionIdFor(assertion, proposal.assertionIndex, input.evidence),
      status: proposal.status,
      confidence: proposal.status === 'believed' ? 0.75 : proposal.status === 'suspected' ? 0.5 : 0.65,
      summary: assertion.proposition,
      provenance: 'accepted-turn', scope: proposal.observerId === 'player' ? 'durable' : 'day',
      acquiredCycle: input.cycleCount,
      evidenceSpans: spans.map(span => ({ assertionIndex: proposal.assertionIndex, ...span })),
    });
  });

  const touchedCommitments = new Set<string>();
  audit.commitments.forEach((proposal, proposalIndex) => {
    const spans = proposal.evidence ?? [];
    if (spans.length === 0 || spans.some(span => !validSpan(span, input.evidence))) {
      violations.push(`commitment ${proposalIndex} cites invalid rendered evidence`);
      return;
    }
    if (proposal.operation === 'accept') {
      const action = proposal.action?.trim() ?? '';
      const locationId = proposal.locationId?.trim() ?? '';
      const dueAt = proposal.dueAt?.trim() ?? '';
      const end = new Date(input.evidence.resolvedEndTime).getTime();
      const due = new Date(dueAt).getTime();
      if (!affirmativeUndertaking(proposal, spans, input.evidence)
        || !action || !getLocationById(locationId) || !Number.isFinite(end) || !Number.isFinite(due)
        || due <= end || !isSameLocalDay(end, due)) {
        violations.push(`commitment ${proposalIndex} is not a concrete same-day future undertaking by its actor`);
        return;
      }
      effects.commitmentOperations.push({
        operation: 'accept', actorId: proposal.actorId, recipientId: proposal.recipientId,
        action, locationId, dueAt, evidenceQuote: evidenceQuote(spans),
      });
      return;
    }
    const existingId = proposal.existingCommitmentId?.trim() ?? '';
    const existing = input.memory.commitments?.find(commitment => commitment.id === existingId);
    if (!existing || existing.status !== 'active' || existing.cycleCount !== input.cycleCount
      || existing.actorId !== proposal.actorId || existing.recipientId !== proposal.recipientId
      || touchedCommitments.has(existing.id)) {
      violations.push(`commitment ${proposalIndex} does not match one active current-cycle record`);
      return;
    }
    const validOperationEvidence = proposal.operation === 'cancel'
      ? cancellationEvidence(proposal.actorId, spans, input.evidence)
      : actionEvidence(existing.action, proposal.actorId, spans, input.evidence);
    if (!validOperationEvidence) {
      violations.push(`commitment ${proposalIndex} lacks ${proposal.operation} evidence`);
      return;
    }
    touchedCommitments.add(existing.id);
    effects.commitmentOperations.push({
      operation: proposal.operation,
      existingCommitmentId: existing.id,
      actorId: proposal.actorId,
      recipientId: proposal.recipientId,
      evidenceQuote: evidenceQuote(spans),
    });
  });

  return violations.length ? { approved: false, violations } : { approved: true, violations: [], effects };
}

export function resetCharacterContinuity(memory: WorldMemoryState, nextCycle: number): WorldMemoryState {
  return {
    ...structuredClone(memory),
    cognition: memory.cognition.filter(record => (
      record.observerId === 'player' || record.provenance === 'authored-baseline'
    )).map(record => ({ ...structuredClone(record) })),
    disclosures: structuredClone(memory.disclosures ?? []),
    commitments: (memory.commitments ?? []).map(commitment => (
      commitment.status === 'active' && commitment.cycleCount < nextCycle
        ? { ...structuredClone(commitment), status: 'expired' as const, expiredReason: 'reset' as const }
        : structuredClone(commitment)
    )),
    acknowledgedCommitmentBoundaryIds: [],
  };
}

const COMMITMENT_BOUNDARY_PREFIX = 'commitment-boundary:';

export function activeCommitmentBoundaries(memory: WorldMemoryState, cycleCount: number): ScheduledBoundary[] {
  const acknowledged = new Set(memory.acknowledgedCommitmentBoundaryIds ?? []);
  return (memory.commitments ?? []).filter(commitment => (
    commitment.status === 'active'
    && commitment.cycleCount === cycleCount
    && !acknowledged.has(`${COMMITMENT_BOUNDARY_PREFIX}${commitment.id}`)
  )).map(commitment => ({ id: `${COMMITMENT_BOUNDARY_PREFIX}${commitment.id}`, at: commitment.dueAt }))
    .sort((left, right) => new Date(left.at).getTime() - new Date(right.at).getTime() || left.id.localeCompare(right.id));
}

export function commitmentIdFromBoundaryId(boundaryId: string): string | null {
  if (!boundaryId.startsWith(COMMITMENT_BOUNDARY_PREFIX)) return null;
  const commitmentId = boundaryId.slice(COMMITMENT_BOUNDARY_PREFIX.length);
  return commitmentId.trim() ? commitmentId : null;
}

export function cognitionIsPublicPlayerNamePermission(record: CognitionRecord, cycleCount: number): boolean {
  if (record.observerId === 'player' || record.subjectId !== 'player' || record.identityScope !== 'full-name') return false;
  if (record.propositionId === 'expression:player-name') {
    return record.scope === 'day' && record.acquiredCycle === cycleCount;
  }
  return record.propositionId === 'identity:player-name'
    && (record.provenance === 'authored-baseline' || (record.scope === 'day' && record.acquiredCycle === cycleCount));
}
