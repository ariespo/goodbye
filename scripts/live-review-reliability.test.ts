// Explicit opt-in only. This replays fixed critic inputs; it never runs a Writer or commits state.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { reviewNarrativeAgainstWriterPacket } from '../src/agents/mystery/narrative-review';
import { buildWriterPacket } from '../src/agents/mystery/review';
import { createFactAliasTable } from '../src/agents/mystery/fact-aliases';
import { MYSTERY_TRUTH_GRAPH } from '../src/agents/mystery/truth-graph';
import { resetResponseFormatSupportCache, type AgentCompletion } from '../src/agents/mystery/structured';
import type { DirectorPlan, FactReview, MysteryBrief, WriterPacket } from '../src/agents/mystery/types';
import { normalizeWorldMemory } from '../src/memory/world-memory';
import { callSecondaryApi, type ChatCompletionMessage } from '../src/sillytavern/api-router';
import { createDefaultPreset } from '../src/sillytavern/types';

const attempts = [6, 7, 8, 10, 13, 16, 18];
const dryRun = process.env.REVIEW_RELIABILITY_DRY_RUN === '1';
const enabled = process.env.LIVE_REVIEW_RELIABILITY === '1';
const sourcePath = '.codex-test-tmp/day-evaluation/options-standard-audit946ce32-g37juice-c1.json';
const outputRoot = '.codex-test-tmp/review-reliability';
const maxHttpPerSample = 3;
const targetModel = 'gemini-3.7-flash【果汁】';
const hash = (text: string) => createHash('sha256').update(text).digest('hex');

interface RecordedCall {
  requestIndex: number;
  system?: string;
  user?: string;
  maxTokens?: number;
  responseFormat?: string;
  usage?: unknown;
}
interface RecordedRow {
  attempt: number;
  turn: number;
  error: string;
  calls: RecordedCall[];
  orchestration: Array<{ directorPlan: DirectorPlan }>;
  before: { cycleCount: number; persistedEvidence: { characterContinuity: Record<string, unknown> } };
}
interface RecordedRun { rows: RecordedRow[]; baseUrl: string; model: string }
interface ContinuityEvidence {
  mode: 'playable' | 'auxiliary';
  possibleAudienceIds: string[];
  activeCommitments: Array<{ id: string }>;
  resolvedEndTime: string;
}

function section(prompt: string, name: string): string {
  const marker = `[${name}]\n`;
  const start = prompt.indexOf(marker);
  if (start < 0) throw new Error(`Missing source section ${name}`);
  const tail = prompt.slice(start + marker.length);
  // Narrative is the final section and must remain byte-for-byte unchanged.
  return name === 'Narrative' ? tail : tail.split(/\n\n\[[A-Za-z][A-Za-z0-9]*\]\n/, 1)[0];
}

function prepareSample(recorded: RecordedRun, attempt: number) {
  const row = recorded.rows.find(item => item.attempt === attempt);
  if (!row) throw new Error(`Missing attempt ${attempt}`);
  const critic = row.calls.filter(call => call.user?.includes('[CharacterContinuityEvidence]\n')).at(-1);
  if (!critic?.user) throw new Error(`Missing final critic input in attempt ${attempt}`);
  const rawPacket = section(critic.user, 'WriterPacket');
  const originalPacket = JSON.parse(rawPacket) as WriterPacket;
  const narrative = section(critic.user, 'Narrative');
  const evidence = JSON.parse(section(critic.user, 'CharacterContinuityEvidence')) as ContinuityEvidence;
  const actionId = originalPacket.resolvedAction?.id;
  if (!actionId) throw new Error(`Missing fixed action ID in attempt ${attempt}`);
  // A review-only retry (attempt 7) inherits its exact action from a preceding row.
  const directorRow = recorded.rows.filter(item => item.attempt <= attempt && item.orchestration.length
    && item.calls.some(call => call.user?.includes('[WriterPacket]\n')
      && (JSON.parse(section(call.user, 'WriterPacket')) as WriterPacket).resolvedAction?.id === actionId)).at(-1);
  const directorCall = directorRow?.calls.filter(call => call.user?.includes('[MysteryBrief]\n')).at(-1);
  if (!directorRow || !directorCall?.user) throw new Error(`Missing matching Director for ${actionId}`);
  const brief = JSON.parse(section(directorCall.user, 'MysteryBrief')) as MysteryBrief;
  const turnContext = JSON.parse(section(directorCall.user, 'TurnContext')) as Record<string, unknown>;
  const plan = directorRow.orchestration.at(-1)!.directorPlan;
  const limitations = ['The recorded Director brief predates execution-time re-gating; this is a fixed-input critic replay, not a full turn replay.',
    'World-memory events/cognition/disclosures/commitments are restored from the untruncated before snapshot; episode and soft-canon archives are not restored.'];
  let packet = structuredClone(originalPacket);
  let projectionError: string | null = null;
  try {
    const projected = buildWriterPacket(plan, brief, turnContext);
    if (JSON.stringify(projected.plan) !== JSON.stringify(originalPacket.plan)
      || JSON.stringify(projected.playerKnownFacts) !== JSON.stringify(originalPacket.playerKnownFacts)) {
      throw new Error('Current packet projection does not match the original plan or player-known facts');
    }
    // No hand-written grants: all original packet fields stay fixed except this program projection.
    packet = { ...packet, knownFactSpeakers: projected.knownFactSpeakers };
  } catch (error) {
    projectionError = error instanceof Error ? error.message : String(error);
    limitations.push('Known-fact speaker reconstruction failed; the original packet is reviewed without additional grants.');
  }
  const saved = row.before.persistedEvidence.characterContinuity;
  const restored: Record<string, unknown> = { ...saved };
  for (const key of ['events', 'cognition', 'disclosures', 'commitments']) {
    const slice = saved[key] as { truncated: boolean; items: unknown[] };
    if (!slice || slice.truncated || !Array.isArray(slice.items)) throw new Error(`Incomplete source memory: ${key}`);
    restored[key] = slice.items;
  }
  const continuityMemory = normalizeWorldMemory({ worldMemory: restored, cycleCount: row.before.cycleCount });
  const activeIds = continuityMemory.commitments?.filter(item => item.status === 'active'
    && item.cycleCount === row.before.cycleCount).map(item => item.id).sort();
  if (JSON.stringify(activeIds) !== JSON.stringify(evidence.activeCommitments.map(item => item.id).sort())) {
    throw new Error('Restored active commitments differ from the original critic request');
  }
  return { attempt, narrative, packet, evidence, continuityMemory, cycleCount: row.before.cycleCount,
    maxTokens: critic.maxTokens,
    provenance: { attempt, turn: row.turn, originalError: row.error, actionId,
      criticRequestIndex: critic.requestIndex, directorAttempt: directorRow.attempt,
      directorRequestIndex: directorCall.requestIndex, narrativeSha256: hash(narrative), narrativeChars: narrative.length,
      originalPacketSha256: hash(rawPacket), replayPacketSha256: hash(JSON.stringify(packet)),
      directorRequestSha256: hash(directorCall.user), originalCriticInputSha256: hash(`${critic.system ?? ''}\n${critic.user}`),
      originalCriticSystemUserChars: (critic.system?.length ?? 0) + critic.user.length,
      originalCriticUsage: critic.usage ?? null, originalResponseFormat: critic.responseFormat ?? 'text',
      projection: projectionError ? 'original-packet-preserved' : 'buildWriterPacket', projectionError,
      knownFactSpeakers: packet.knownFactSpeakers ?? [], limitations } };
}

describe.skipIf(!enabled && !dryRun)('fixed failed narrative-review reliability', () => {
  it('replays all seven frozen candidates and records each outcome without rewriting', async () => {
    const sourceText = readFileSync(sourcePath, 'utf8');
    const recorded = JSON.parse(sourceText) as RecordedRun;
    const model = process.env.DAY_MODEL ?? recorded.model;
    if (model !== targetModel || recorded.model !== targetModel) throw new Error(`This replay requires ${targetModel}`);
    const baseUrl = process.env.DAY_API_BASE_URL ?? recorded.baseUrl;
    const endpoint = new URL(baseUrl);
    if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error('Use a base URL without credentials or query parameters');
    const key = dryRun ? '' : process.env.DAY_API_KEY;
    if (!dryRun && !key) throw new Error('Set DAY_API_KEY explicitly before opting in');
    const scrub = (value: unknown) => {
      const json = JSON.stringify(value, null, 2);
      return key ? json.split(key).join('[REDACTED]') : json;
    };
    const file = `${outputRoot}/${dryRun ? 'dry-run' : 'live'}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    const results: Array<Record<string, unknown>> = [];
    const report = { kind: dryRun ? 'preparation-only' : 'live-fixed-critic-replay',
      sourcePath, sourceSha256: hash(sourceText), testedCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      workingTreeDirty: execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim().length > 0,
      workingTreeDiffSha256: hash(execFileSync('git', ['diff', '--binary', 'HEAD', '--', 'src', 'scripts'], { encoding: 'utf8', stdio: 'pipe' })),
      workingTreeDiffScope: 'Tracked src/ and scripts/ changes against HEAD; the untracked replay harness is hashed separately.',
      harnessSha256: hash(readFileSync('scripts/live-review-reliability.test.ts', 'utf8')),
      model, baseUrl, maxHttpAttempts: attempts.length * maxHttpPerSample, perSampleTimeoutMs: 120_000,
      costMetricNote: 'JavaScript system+user character counts are not exact tokens or monetary cost; provider usage is retained separately.',
      samples: results };
    mkdirSync(outputRoot, { recursive: true });
    const persist = () => writeFileSync(file, scrub(report));
    const nativeFetch = globalThis.fetch;
    let totalHttp = 0;
    resetResponseFormatSupportCache();
    try {
      for (const attempt of attempts) {
        const started = performance.now();
        const calls: Array<Record<string, unknown>> = [];
        const result: Record<string, unknown> = { attempt, status: 'running', approved: null, violations: [], exception: null,
          calls, fallback: false, correction: false, durationMs: 0, currentFirstRequestSystemUserChars: null };
        results.push(result);
        persist();
        try {
          const sample = prepareSample(recorded, attempt);
          result.input = sample.provenance;
          persist();
          if (dryRun) { result.status = 'prepared-no-request'; continue; }
          vi.stubGlobal('fetch', async (url: RequestInfo | URL, init?: RequestInit) => {
            if (calls.length >= maxHttpPerSample || totalHttp >= attempts.length * maxHttpPerSample) {
              throw new DOMException('Fixed replay HTTP attempt budget exhausted', 'AbortError');
            }
            const body = JSON.parse(String(init?.body ?? '{}'));
            const messages = body.messages as ChatCompletionMessage[];
            const systemUserChars = messages.filter(message => message.role === 'system' || message.role === 'user')
              .reduce((sum, message) => sum + message.content.length, 0);
            const call: Record<string, unknown> = { httpAttempt: ++totalHttp, responseFormat: body.response_format?.type ?? 'text',
              systemUserChars, correction: messages.some(message => message.role === 'assistant'),
              requestSha256: hash(String(init?.body ?? '')), maxTokens: body.max_tokens, temperature: body.temperature };
            calls.push(call);
            result.currentFirstRequestSystemUserChars ??= systemUserChars;
            result.fallback ||= call.responseFormat !== 'json_schema';
            result.correction ||= call.correction;
            persist();
            const callStarted = performance.now();
            try {
              const response = await nativeFetch(url, init);
              call.status = response.status;
              const data = await response.clone().json().catch(() => null);
              call.usage = data?.usage ?? null;
              call.responseModel = data?.model ?? null;
              call.finishReason = data?.choices?.[0]?.finish_reason ?? null;
              const content = data?.choices?.[0]?.message?.content;
              call.responseChars = typeof content === 'string' ? content.length : null;
              call.responseSha256 = typeof content === 'string' ? hash(content) : null;
              return response;
            } catch (error) {
              call.exception = error instanceof Error ? { name: error.name, message: error.message } : String(error);
              throw error;
            } finally { call.durationMs = Math.round(performance.now() - callStarted); persist(); }
          });
          const api = { baseUrl, apiKey: key!, model };
          const preset = { ...createDefaultPreset(), id: 'review-reliability', createdAt: 0, updatedAt: 0 };
          if (sample.maxTokens !== undefined) preset.settings.openai_max_tokens = sample.maxTokens;
          const complete: AgentCompletion = (messages, options) => callSecondaryApi(api, messages, preset, options);
          const review: FactReview = await reviewNarrativeAgainstWriterPacket({ api, preset, complete,
            abortSignal: AbortSignal.timeout(120_000),
            narrative: sample.narrative, packet: sample.packet, continuityMemory: sample.continuityMemory,
            cycleCount: sample.cycleCount, continuityMode: sample.evidence.mode,
            possibleAudienceIds: sample.evidence.possibleAudienceIds, resolvedEndTime: sample.evidence.resolvedEndTime,
            playerIdentityName: typeof sample.packet.continuityContext?.userName === 'string' ? sample.packet.continuityContext.userName : undefined,
            factAliases: createFactAliasTable(MYSTERY_TRUTH_GRAPH) });
          result.approved = review.approved;
          result.violations = review.violations;
          result.corrections = review.corrections;
          result.status = review.approved ? 'approved' : 'semantic-rejection';
        } catch (error) {
          result.status = 'exception';
          result.exception = error instanceof Error ? { name: error.name, message: error.message } : String(error);
        } finally {
          vi.unstubAllGlobals();
          result.httpCalls = calls.length;
          result.durationMs = Math.round(performance.now() - started);
          persist();
        }
      }
    } finally { vi.unstubAllGlobals(); persist(); }
    expect(results.map(sample => sample.attempt)).toEqual(attempts);
    expect(totalHttp).toBeLessThanOrEqual(21);
    if (dryRun) expect(results.filter(sample => sample.exception)).toEqual([]);
    console.log(`Review reliability report: ${file}; HTTP attempts: ${totalHttp}`);
  }, 20 * 60_000);
});
