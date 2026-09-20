import { db } from '../sillytavern/database';
import type { SaveSlot } from '../sillytavern/types';

export const MAX_SAVE_ARCHIVE_BYTES = 32 * 1024 * 1024;
const FORMAT = 'farewell-save';
const VERSION = 1;
const MAX_COUNT = 1_000_000;
type Check = (value: unknown, path: string) => void;
type Fields = Record<string, Check>;

function invalid(path: string): never { throw new Error(`存档数据无效：${path}`); }
const str: Check = (value, path) => { if (typeof value !== 'string') invalid(path); };
const bool: Check = (value, path) => { if (typeof value !== 'boolean') invalid(path); };
const number = (min = 0, max = MAX_COUNT, integer = false): Check => (value, path) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max
    || (integer && !Number.isSafeInteger(value))) invalid(path);
};
const count = number(0, MAX_COUNT, true);
const cycle = number(1, MAX_COUNT, true);
const timestamp = number(0, 8_640_000_000_000_000, true);
const percent = number(0, 100);
const unit = number(0, 1);
const choice = (...values: unknown[]): Check => (value, path) => { if (!values.includes(value)) invalid(path); };
const optional = (check: Check): Check => (value, path) => { if (value !== undefined) check(value, path); };
const nullable = (check: Check): Check => (value, path) => { if (value !== null) check(value, path); };
const array = (check: Check): Check => (value, path) => {
  if (!Array.isArray(value) || value.length > 100_000) invalid(path);
  value.forEach((entry, i) => check(entry, `${path}[${i}]`));
};
const strings = array(str);
function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(path);
  return value as Record<string, unknown>;
}
const shape = (fields: Fields): Check => (value, path) => {
  const obj = record(value, path);
  for (const [key, check] of Object.entries(fields)) check(obj[key], `${path}.${key}`);
};
const dictionary = (check: Check): Check => (value, path) => {
  for (const [key, entry] of Object.entries(record(value, path))) check(entry, `${path}.${key}`);
};
const clock: Check = (value, path) => {
  if (typeof value !== 'string') invalid(path);
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?$/.exec(value);
  if (!match || !Number.isFinite(Date.parse(value))) invalid(path);
  const [, year, month, day, hour, minute, second = '0'] = match.map(Number);
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (month < 1 || month > 12 || day < 1 || day > days || hour > 23 || minute > 59 || Number(second) > 59) invalid(path);
};
const mood = choice('calm', 'horror', 'insane', 'sad', 'angry', 'happy');
const reveal = choice('atmosphere', 'hint', 'clue', 'confirmation');
const scope = choice('short', 'normal', 'deep');
const kind = choice('inquiry', 'investigation', 'search', 'travel', 'rest', 'wait');
const gameStatus = shape({ time: clock, stamina: percent, sanity: percent, items: strings });
const currentState = shape({ bgm: nullable(str), background: nullable(str), character: nullable(str), speaker: nullable(str),
  mood, effect: nullable(str), environment: choice('none', 'indoor-muted-rain', 'indoor-audible-rain', 'outdoor-light-rain', 'outdoor-heavy-rain'), item: nullable(str) });
const quote = shape({ workMinutes: count, travelMinutes: count, totalMinutes: count, staminaCost: count });
const intent = shape({ version: choice(1), originalInput: str, startLocationId: str,
  steps: array(shape({ kind, scope, locationId: str, targetNpcIds: optional(strings) })) });
const actionOutcome = shape({ resolutionId: str, actionId: str, executedMinutes: count, executedWorkMinutes: count,
  executedTravelMinutes: count, endTime: clock, staminaDelta: number(-100, 100), sanityDelta: number(-100, 100),
  interruption: optional(shape({ id: str, at: clock })), remaining: optional((v, p) => { quote(v, p); shape({ continuationId: str })(v, p); }) });
const metadata: Fields = { actionId: optional(str), opportunityId: optional(str), kind: optional(kind), scope: optional(scope),
  locationId: optional(str), requestedMinutes: optional(number(1, MAX_COUNT, true)), quote: optional(quote) };
const actions = array(shape({ desc: str, style: str, time: str, stamina: percent, sanity: percent, ...metadata }));
const investigations = array(shape({ desc: str, suspect: str, style: str, time: str, stamina: percent, sanity: percent, ...metadata }));
const optionBinding = shape({ optionIndex: count, optionText: str, actionId: optional(str), continuationId: optional(str),
  playerActionIntent: optional(intent), unavailable: optional(choice(true)) });
const parsed: Check = (value, path) => shape({ thinking: str, maintext: str, options: strings, summary: str,
  vars: variables, observe: optional(str), investigateItems: optional(investigations), actionItems: optional(actions),
  actionType: optional(choice('investigate', 'act')), actionResult: optional(str), actionOutcome: optional(actionOutcome),
  optionBindings: optional(array(optionBinding)) })(value, path);
const scene = shape({ id: str, sourceMessageId: optional(str), knowledgeAlreadyCommitted: optional(bool),
  background: optional(str), character: optional(str), bgm: optional(str), mood: optional(mood), observe: optional(str),
  investigateItems: optional(investigations), actionItems: optional(actions), actionOutcome: optional(actionOutcome),
  emotionPolicyContext: optional(shape({ huihuiChocolateKnownAtSceneStart: bool, zhouKillerConfirmedAtSceneStart: bool })),
  lines: array(shape({ id: optional(str), speaker: str, text: str, background: optional(str), bgm: optional(str),
    character: optional(str), emotion: optional(mood), effect: optional(str), animation: optional(str), item: optional(str),
    knowledgeEvents: optional(strings), minimumDisplayMs: optional(count), playerIdentityPrompt: optional(bool) })) });
const evidenceSpan = shape({ lineIndex: count, quote: str, assertionIndex: optional(count) });
const worldMemory = shape({ version: choice(2), canonicalTruthVersion: str,
  events: array(shape({ eventId: str, turnId: str, turnIndex: count, cycleCount: cycle, occurredAt: clock,
    locationId: str, actorIds: strings, kind: choice('narrative-turn', 'knowledge', 'identity', 'fact'), summary: str,
    evidenceLineIds: strings, factIds: strings, tags: strings, salience: unit, createdAt: timestamp })),
  cognition: array(shape({ cognitionId: str, observerId: str, propositionId: str, subjectId: optional(str),
    status: choice('observed', 'heard', 'inferred', 'suspected', 'believed', 'confirmed', 'disproved'), confidence: unit,
    sourceEventIds: strings, firstLearnedTurn: count, lastUpdatedTurn: count, summary: str,
    identityScope: optional(choice('full-name', 'familiar-honorific', 'family-nickname', 'guardian-formal', 'unknown')),
    provenance: optional(choice('authored-baseline', 'accepted-turn', 'legacy-import')), scope: optional(choice('day', 'durable')),
    acquiredCycle: optional(count), evidenceSpans: optional(array(evidenceSpan)) })),
  episodes: array(shape({ episodeId: str, turnId: str, turnIndex: count, cycleCount: cycle, locationId: str,
    actorIds: strings, summary: str, factIds: strings, cognitionIds: strings, unresolvedTags: strings, salience: unit, createdAt: timestamp })),
  softCanonFacts: array(shape({ factId: str, text: str, characterIds: strings, locationIds: strings, level: choice('soft'),
    privacy: choice('common', 'personal', 'investigative'), timeScope: choice('pre-game'), source: choice('author', 'director'), createdTurn: count })),
  disclosures: optional(array(shape({ id: str, cycleCount: cycle, speakerId: str, listenerIds: strings, propositionId: str,
    sourceEventId: str, evidenceQuote: str, evidenceSpans: array(evidenceSpan) }))),
  commitments: optional(array(shape({ id: str, cycleCount: cycle, actorId: str, recipientId: str, action: str,
    locationId: str, dueAt: clock, status: choice('active', 'fulfilled', 'cancelled', 'expired'), sourceEventId: str,
    evidenceQuote: str, statusSourceEventId: optional(str), statusEvidenceQuote: optional(str), expiredReason: optional(choice('reset', 'missed')) }))),
  acknowledgedCommitmentBoundaryIds: optional(strings),
});
const continuation = shape({ actionId: str, cycleCount: cycle, previousResolutionId: str, stepsDigest: str,
  resumableFromTime: clock, expectedLocationId: str, activeStepId: str, completedMinutesByStep: dictionary(count),
  chargedStaminaByStep: dictionary(count), steps: array(shape({ id: str, kind: choice('inquiry', 'investigation', 'search', 'travel', 'rest', 'wait', 'event', 'fantasy'),
    scope, locationId: str, completionSourceIds: strings, opportunityId: optional(str), requestedMinutes: optional(number(1, MAX_COUNT, true)),
    eventId: optional(choice('death-news', 'fantasy')) })) });
const narrativeContext = shape({ locationId: str, background: str, entryMode: choice('exterior', 'interior', 'destination'),
  requiredNpcIds: strings, enRouteNpcIds: strings, forbiddenNpcIds: strings,
  presentationMode: choice('default', 'huihui-first', 'huihui-known', 'hospital-first', 'hospital-unknown', 'hospital-known'),
  costs: shape({ timeMinutes: optional(count), stamina: optional(percent) }), directive: str,
  sceneContract: shape({ destinationLocationId: str, destinationBackground: str, entryMode: choice('exterior', 'interior', 'destination'),
    requiredDestinationNpcIds: strings, requiredEnRouteNpcIds: strings, forbiddenNpcIds: strings,
    requiredKnowledgeEvents: array(shape({ eventId: str, evidence: str })), forbiddenKnowledgeEventIds: strings, directive: str }) });
const actionContinuity = shape({ cycleCount: cycle, lastResolutionId: optional(str), settledResolutionIds: optional(strings),
  appliedEventEffectIds: optional(strings), continuation: optional(nullable(continuation)),
  pendingAuthorization: optional(nullable(shape({ actionId: str, cycleCount: cycle, graphFingerprint: str,
    revelations: array(shape({ sourceId: str, alias: str, canonicalFactId: str, level: reveal,
      delivery: choice('narration', 'dialogue', 'object', 'environment'), speakerId: optional(str), sourceLocationId: str })),
    knowledgeMilestones: array(shape({ sourceId: str, eventId: str, evidence: str, sourceLocationId: str })) }))),
  sceneContext: optional(nullable(shape({ actionId: str, cycleCount: cycle, contextsByLocation: dictionary(narrativeContext) }))),
  selectedOpportunity: optional(nullable(shape({ id: str, locationId: str, publicGoal: str, scope, availableUntil: optional(clock), sourceIds: strings, topicKey: str }))) });

function variables(value: unknown, path: string) {
  shape({ cycleCount: optional(cycle), location: optional(str), time: optional(clock), stamina: optional(percent), sanity: optional(percent),
    affinity: optional(dictionary(percent)), suspicion: optional(dictionary(percent)), investigation: optional(dictionary(percent)),
    loopSuspicionStart: optional(dictionary(percent)), tripProgress: optional(percent), stayStreak: optional(count), stayedEver: optional(bool),
    lockedRoute: optional(choice(null, 'A', 'B', 'C', 'NONE', 'FAKE')), overlay: optional(choice(null, 'CULT', 'PSYCH')),
    finalChoice: optional(nullable(str)), deathNews: optional(choice('untriggered', 'pending', 'delivered')),
    routesLockedEver: optional(array(choice('A', 'B', 'C', 'NONE', 'FAKE'))), endingsSeen: optional(strings),
    unlockedClues: optional(strings), cultClues: optional(strings), worldGlitchClues: optional(strings), fakeEvidence: optional(strings),
    letterFragments: optional(strings), knowledgeEvents: optional(strings), playerNameKnownByNpcIds: optional(strings),
    organizedClues: optional(array(shape({ id: str, title: str, description: str, source: str, createdAt: timestamp }))),
    mysteryKnowledge: optional(dictionary(reveal)), worldMemory: optional(worldMemory), actionContinuity: optional(actionContinuity),
    storyProgress: optional(shape({ presentedBeatIds: strings, versionStartCycle: optional(cycle),
      recalledSourcesByBeat: optional(dictionary(array(shape({ factId: str, level: reveal })))) })),
    opportunityProgress: optional(shape({ cycleCount: cycle, completedIds: strings, noProgressByTopic: dictionary(count), settledResolutionIds: optional(strings) })),
  })(value, path);
}
const snapshot = shape({ turnIndex: count, timestamp, summary: str, gameStatus, variables });
const message = shape({ id: str, role: choice('user', 'assistant', 'system'), content: str, timestamp, variables,
  parsed: optional(parsed), apiUsed: optional(choice('primary', 'secondary')), localAction: optional(choice('map-travel')),
  acceptedActionOutcome: optional(actionOutcome),
  narrativeSummary: optional(shape({ version: choice(1), text: str, startedAt: clock, endedAt: clock, cycleCount: cycle,
    startLocationId: str, endLocationId: str, participants: strings })),
  turnState: optional(shape({ gameStatus, currentState, currentScene: nullable(scene), currentLineIndex: count, sceneComplete: bool, variables })),
  actionRequest: optional(shape({ playerActionIntent: optional(intent), resumeActionId: optional(str), originalInput: optional(str),
    selection: optional(shape({ ...metadata, kind })), narrativeContext: optional(narrativeContext), inputOrigin: optional(choice('player', 'menu')) })),
});

const privateKeys = new Set(['api', 'apikey', 'api_key', 'settings', 'providersettings', 'provider', 'authorization', 'password', 'accesstoken', 'refreshtoken']);
function unsafeKey(key: string) { return key.split('.').some(part => ['__proto__', 'prototype', 'constructor'].includes(part)); }
function checkJson(value: unknown, path = 'save', depth = 0) {
  if (depth > 64) invalid(`${path}（嵌套过深）`);
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') { if (!Number.isFinite(value)) invalid(path); return; }
  if (Array.isArray(value)) { value.forEach((item, i) => checkJson(item, `${path}[${i}]`, depth + 1)); return; }
  for (const [key, item] of Object.entries(record(value, path))) {
    if (unsafeKey(key) || privateKeys.has(key.toLowerCase())) invalid(`${path}.${key}`);
    checkJson(item, `${path}.${key}`, depth + 1);
  }
}
function validateSave(value: unknown): asserts value is SaveSlot {
  checkJson(value);
  shape({ id: str, name: str, createdAt: timestamp, thumbnail: (v, p) => {
    str(v, p);
    if (v !== '' && !/^data:image\/(?:png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(v as string)) invalid(p);
  }, historyIndex: count,
  gameState: shape({ currentSceneIndex: count, currentLineIndex: count, gameStatus, currentState,
    history: optional(array(snapshot)), endingsSeen: optional(strings), autoMode: optional(bool), sceneComplete: optional(bool), parsedContent: optional(parsed) }),
  tavernState: shape({ variables, messages: array(message) }) })(value, 'save');
}

/** Restore only typed status clocks; variable clocks and summaries remain ISO strings. */
function restoreDates(save: SaveSlot): SaveSlot {
  save.gameState.gameStatus.time = new Date(save.gameState.gameStatus.time);
  save.gameState.history?.forEach(item => { item.gameStatus.time = new Date(item.gameStatus.time); });
  save.tavernState.messages.forEach(item => {
    if (item.turnState) item.turnState.gameStatus.time = new Date(item.turnState.gameStatus.time);
  });
  return save;
}

export function parseSaveArchive(text: string): SaveSlot {
  if (new TextEncoder().encode(text).byteLength > MAX_SAVE_ARCHIVE_BYTES) throw new Error('存档文件超过 32 MB，无法导入');
  let input: unknown;
  try { input = JSON.parse(text); } catch { throw new Error('无法读取存档：文件不是有效的 JSON'); }
  const envelope = record(input, '文件');
  if (envelope.format !== FORMAT) throw new Error('这不是《告别之日》的存档文件');
  if (envelope.version !== VERSION) throw new Error('暂不支持这个存档版本');
  checkJson(envelope, '文件');
  validateSave(envelope.save);
  return restoreDates(envelope.save);
}

export function serializeSaveArchive(save: SaveSlot): string {
  // Copy known SaveSlot containers instead of serializing the application store.
  const { currentSceneIndex, currentLineIndex, gameStatus: status, currentState: state, history, endingsSeen, autoMode, sceneComplete, parsedContent } = save.gameState;
  const payload = { id: save.id, name: save.name, createdAt: save.createdAt, thumbnail: save.thumbnail,
    gameState: { currentSceneIndex, currentLineIndex, gameStatus: status, currentState: state, history, endingsSeen, autoMode, sceneComplete, parsedContent },
    tavernState: { variables: save.tavernState.variables, messages: save.tavernState.messages }, historyIndex: save.historyIndex };
  const text = JSON.stringify({ format: FORMAT, version: VERSION, save: payload }, (key, value) => {
    if (unsafeKey(key)) invalid(key);
    return privateKeys.has(key.toLowerCase()) ? undefined : value;
  }, 2);
  parseSaveArchive(text);
  return text;
}

export async function readSaveArchiveFile(file: File): Promise<string> {
  if (file.size > MAX_SAVE_ARCHIVE_BYTES) throw new Error('存档文件超过 32 MB，无法导入');
  return file.text();
}

export async function importSaveArchive(text: string): Promise<SaveSlot> {
  const save = { ...parseSaveArchive(text), id: crypto.randomUUID() };
  // add, never put: IndexedDB rejects a collision instead of overwriting a save.
  await db.saves.add(save);
  return save;
}

export function downloadSaveArchive(save: SaveSlot): void {
  const blob = new Blob([serializeSaveArchive(save)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const filename = Array.from(save.name, char => char.charCodeAt(0) < 32 || /[<>:"/\\|?*]/.test(char) ? '_' : char).join('').slice(0, 80);
  link.download = `${filename || 'farewell-save'}.farewell.json`;
  document.body.append(link);
  try { link.click(); } finally { link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
}
