import { writeFile } from 'node:fs/promises';
import { callSecondaryApi, type ApiConfig } from '../src/sillytavern/api-router';
import { prepareMysteryTurn } from '../src/agents/mystery/orchestrator';
import { clearOrchestrationLog, getOrchestrationLog } from '../src/agents/mystery/orchestration-log';
import type { TruthContext } from '../src/agents/mystery/types';
import { createDefaultPreset, DEFAULT_FORMAT_PROMPT, type ChatPreset } from '../src/sillytavern/types';
import { createParseState, parseChunk } from '../src/sillytavern/stream-parser';
import { createOutputProtocol } from '../src/sillytavern/output-protocol';
import { maintextToScene } from '../src/engine/scene-parser';
import { settleCycleVariables } from '../src/engine/cycle-settlement';
import { buildPlayerKnowledgeBrief } from '../src/data/playerKnowledge';
import { evaluatePlayerIntent } from '../src/engine/player-intent-policy';
import { validateStateAgentResponse } from '../src/agents/state/state-agent';
import { buildNarrativeFactCriticUserPrompt, buildNarrativeRepairPrompt, FACT_CRITIC_SYSTEM_PROMPT, WRITER_SYSTEM_PROMPT } from '../src/agents/mystery/prompts';

const apiKey = process.env.DEEPSEEK_API_KEY;
if (!apiKey) throw new Error('DEEPSEEK_API_KEY is required');

const api: ApiConfig = {
  baseUrl: process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com/v1',
  apiKey,
  model: process.env.DEEPSEEK_MODEL ?? 'deepseek-v4-flash',
};

const presetBase = createDefaultPreset();
const preset: ChatPreset = {
  ...presetBase,
  id: 'deepseek-flash-e2e',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  settings: { ...presetBase.settings, openai_max_tokens: 8000 },
};

const protocol = createOutputProtocol({
  requiredTags: ['maintext', 'option', 'sum'],
  requireMinOptions: 2,
  validateVarsJson: true,
  checkUnclosedTags: true,
});

type Scenario = {
  id: string;
  target: 'old-man' | 'detective-a' | 'self';
  location: string;
  activeNpcIds: string[];
  suspicion: Record<string, number>;
  unlockedClueIds: string[];
  playerKnowledge: TruthContext['playerKnowledge'];
  input: string;
  lockedRoute: 'A' | 'B' | 'C';
  knowledgeEvents: string[];
};

const scenarios: Scenario[] = [
  {
    id: 'old-man-route-a', target: 'old-man', location: 'old-man-building', activeNpcIds: [],
    suspicion: { 'old-man': 50, 'detective-a': 8, 'detective-b': 8, self: 5 },
    unlockedClueIds: ['a-sacrifice-list', 'a-lured-inside'],
    playerKnowledge: { 'a-sacrifice-list': 'clue', 'a-lured-inside': 'clue' },
    knowledgeEvents: ['meet:old-man', 'insight:old-man-neighborhood'],
    input: '周德明不在场。我复核已经掌握的祭坛名单 clue 与诱入楼内 clue，不新增脚印、录像、证人或其他物证；只把这两条已知线索和真相简报允许的坠落现场事实合并，确认谁杀害了文穗以及现场如何被伪装。', lockedRoute: 'A',
  },
  {
    id: 'detective-route-b', target: 'detective-a', location: 'water-tower', activeNpcIds: ['detective-a', 'detective-b'],
    suspicion: { 'old-man': 10, 'detective-a': 50, 'detective-b': 42, self: 5 },
    unlockedClueIds: ['b-water-tower-blood', 'b-detective-coverup'],
    playerKnowledge: { 'b-water-tower-blood': 'clue', 'b-detective-coverup': 'clue' },
    knowledgeEvents: [
      'observe:shaved-man', 'identify:zhao-gang-name', 'learn:zhao-gang-job',
      'insight:zhao-gang-reckless', 'observe:unknown-woman', 'identify:lin-jing-name',
      'learn:lin-jing-job', 'insight:lin-jing-composure', 'learn:zhao-lin-connection',
    ],
    input: '我以货车司机赵刚和新护士林静的公开身份称呼两人，把已掌握的水塔血迹 clue 与通讯记录 clue 并列，明确要求用这两条获准证据确认案发后的完整行动、谁误杀了文穗以及谁参与掩盖；不要新增证据。', lockedRoute: 'B',
  },
  {
    id: 'self-route-c', target: 'self', location: 'community-hospital', activeNpcIds: ['detective-b'],
    suspicion: { 'old-man': 10, 'detective-a': 10, 'detective-b': 10, self: 50 },
    unlockedClueIds: ['shared-male-leave-call', 'c-player-made-leave-call', 'c-loop-is-reenactment'],
    playerKnowledge: { 'shared-male-leave-call': 'clue', 'c-player-made-leave-call': 'clue', 'c-loop-is-reenactment': 'clue' },
    knowledgeEvents: [
      'observe:unknown-woman', 'identify:lin-jing-name', 'learn:lin-jing-job',
      'insight:lin-jing-composure',
    ],
    input: '我把自己已掌握的男性请假电话 clue、通话归属 clue 与轮回重演 clue 作为既有证据，亲自核对病历时间锚点；请林静只按普通护士权限协助调取我的病历，不替我认罪。请按获准证据确认凶手是否是我自己，不新增记录或物证。', lockedRoute: 'C',
  },
];

async function complete(messages: Parameters<typeof callSecondaryApi>[1], options?: Parameters<typeof callSecondaryApi>[3]) {
  return callSecondaryApi(api, messages, preset, options);
}

function sanitizeNarrativeReview(review: any) {
  const violations = (review.violations ?? []).filter((item: any) => !/不构成违规|故不违规|已获授权.*(?:符合|不违规)/.test(item.message ?? ''));
  return { ...review, approved: violations.length === 0, violations };
}

async function runScenario(scenario: Scenario) {
  let variables: Record<string, any> = {
    cycleCount: 1, location: scenario.location, stamina: 100, sanity: 70,
    suspicion: { 'old-man': 0, 'detective-a': 0, 'detective-b': 0, self: 0 },
    unlockedClues: [], knowledgeEvents: [], mysteryKnowledge: {}, loopSuspicionStart: {},
  };
  variables.knowledgeEvents = scenario.target === 'old-man'
    ? ['meet:old-man']
    : scenario.target === 'detective-a'
      ? ['observe:shaved-man', 'identify:zhao-gang-name', 'learn:zhao-gang-job']
      : [];
  const loopAudit = [];
  for (let cycle = 1; cycle <= 3; cycle++) {
    const saturatedTarget = scenario.target;
    const pivotToDetective = cycle === 2 && saturatedTarget === 'self';
    const earlyLocation = cycle === 1 ? 'home' : cycle === 2
      ? (pivotToDetective ? 'mountain-trail' : 'school')
      : 'mountain-trail';
    const earlyInput = cycle === 1
      ? '检查文穗房间和她留下的早餐，只记录亲眼可见的日常异常。'
      : cycle === 2
        ? saturatedTarget === 'old-man'
          ? '我仍要继续调查周大爷：先打电话追问他今天见过文穗没有，再按现场发生的事继续调查。'
          : saturatedTarget === 'detective-a'
            ? '我仍要继续调查赵刚：先追问他的货运路线，再按现场发生的事继续调查。'
            : '我仍要调查自己：先复核我的记忆和行动，再按现场发生的事继续调查。'
        : '沿山路只向晨练者询问雨中人数、前后距离和行走方向；不要询问衣着、随身物品或动机，保留多个解释。';
    variables = { ...variables, cycleCount: cycle, location: earlyLocation };
    if (cycle === 2) {
      variables = {
        ...variables,
        suspicion: { ...variables.suspicion, [saturatedTarget]: 15 },
        loopSuspicionStart: { ...variables.loopSuspicionStart, [saturatedTarget]: 0 },
      };
    }
    const intentPolicy = evaluatePlayerIntent(earlyInput, variables);
    const activeNpcIds = cycle === 2
      ? (pivotToDetective ? ['morning-witness'] : ['school-guard'])
      : cycle === 3 ? ['morning-witness'] : [];
    const earlyContext: TruthContext = {
      cycleCount: cycle,
      currentLocation: earlyLocation,
      lockedRoute: null,
      unlockedClueIds: [],
      playerKnowledge: {},
      suspicion: variables.suspicion,
      sanity: variables.sanity,
      activeNpcIds,
      playerPresentation: buildPlayerKnowledgeBrief(variables),
    };
    const prepared = await prepareMysteryTurn({
      mode: 'standard', api, preset, truthContext: earlyContext,
      turnContext: { playerInput: earlyInput, cycleCount: cycle, playerIntentPolicy: intentPolicy },
      presentationContext: { location: earlyLocation, cycleCount: cycle },
      formatPrompt: DEFAULT_FORMAT_PROMPT, complete,
    });
    let earlyRaw = await callSecondaryApi(api, prepared.writerMessages, preset, { temperature: 0.35, maxTokens: 8000 });
    let earlyParseState = parseChunk(createParseState(), earlyRaw, { strict: true });
    let earlyValidationErrors = [
      ...protocol.validate(earlyRaw, earlyParseState.parsed),
      ...earlyParseState.errors.map(message => ({ code: 'STREAM', message })),
    ];
    if (earlyValidationErrors.length > 0) {
      earlyRaw = await callSecondaryApi(api, [
        ...prepared.writerMessages,
        { role: 'assistant', content: earlyRaw },
        { role: 'user', content: '上一响应标签不完整。请从头输出完整场景，严格闭合 maintext、option、hint、sum、vars；不要解释。' },
      ], preset, { temperature: 0, maxTokens: 8000 });
      earlyParseState = parseChunk(createParseState(), earlyRaw, { strict: true });
      earlyValidationErrors = [
        ...protocol.validate(earlyRaw, earlyParseState.parsed),
        ...earlyParseState.errors.map(message => ({ code: 'STREAM', message })),
      ];
    }
    const pivotState = prepared.brief.saturationPivot
      ? validateStateAgentResponse({ patch: {}, evidence: [] }, variables, earlyParseState.parsed.maintext, {
          blockedActorId: prepared.brief.saturationPivot.blockedActorId,
          redirectedActorId: prepared.brief.saturationPivot.redirectedActorId,
          requiredSuspicionGain: prepared.brief.saturationPivot.requiredSuspicionGain,
        })
      : null;
    loopAudit.push({
      cycle,
      completedLoops: cycle - 1,
      maxReveal: prepared.brief.revealBudget.maxRevealLevel,
      allowConfirmation: prepared.brief.revealBudget.allowConfirmation,
      revelations: prepared.directorPlan.revelations,
      reviews: [prepared.hardReview.approved, prepared.semanticReview?.approved, prepared.pacingReview?.approved],
      intentMode: intentPolicy.mode,
      saturationPivot: prepared.brief.saturationPivot ?? null,
      pivotStatePatch: pivotState?.vars ?? null,
      writerValidationErrors: earlyValidationErrors,
      maintext: earlyParseState.parsed.maintext,
    });
    variables = settleCycleVariables(variables);
  }

  variables = {
    ...variables,
    cycleCount: 5,
    location: scenario.location,
    suspicion: scenario.suspicion,
    unlockedClues: scenario.unlockedClueIds,
    mysteryKnowledge: scenario.playerKnowledge,
    knowledgeEvents: scenario.knowledgeEvents,
  };
  const finalContext: TruthContext = {
    cycleCount: 5,
    currentLocation: scenario.location,
    lockedRoute: scenario.lockedRoute,
    unlockedClueIds: scenario.unlockedClueIds,
    playerKnowledge: scenario.playerKnowledge,
    suspicion: scenario.suspicion,
    sanity: 70,
    activeNpcIds: scenario.activeNpcIds,
    playerPresentation: buildPlayerKnowledgeBrief(variables),
  };
  const prepared = await prepareMysteryTurn({
    mode: 'standard', api, preset, truthContext: finalContext,
    turnContext: { playerInput: scenario.input, cycleCount: 5 },
    presentationContext: { location: scenario.location, cycleCount: 5 },
    formatPrompt: DEFAULT_FORMAT_PROMPT, complete,
  });
  let raw = await callSecondaryApi(api, prepared.writerMessages, preset, { temperature: 0.35, maxTokens: 8000 });
  let parseState = parseChunk(createParseState(), raw, { strict: true });
  const validationErrors = [...protocol.validate(raw, parseState.parsed), ...parseState.errors.map(message => ({ code: 'STREAM', message }))];
  let narrativeReview: unknown = null;
  if (validationErrors.length === 0) {
    const reviewRaw = await callSecondaryApi(api, [
      { role: 'system', content: FACT_CRITIC_SYSTEM_PROMPT },
      { role: 'user', content: buildNarrativeFactCriticUserPrompt(prepared.writerPacket, parseState.parsed.maintext) },
    ], preset, { temperature: 0, maxTokens: 2500 });
    narrativeReview = sanitizeNarrativeReview(JSON.parse(reviewRaw.slice(reviewRaw.indexOf('{'), reviewRaw.lastIndexOf('}') + 1)));
    for (let repairAttempt = 0; repairAttempt < 2 && (narrativeReview as { approved?: boolean }).approved !== true; repairAttempt++) {
      raw = await callSecondaryApi(api, [
        { role: 'system', content: `${WRITER_SYSTEM_PROMPT}\n\n[项目输出格式补充]\n${DEFAULT_FORMAT_PROMPT}` },
        { role: 'user', content: buildNarrativeRepairPrompt(prepared.writerPacket, parseState.parsed.maintext, narrativeReview) },
      ], preset, { temperature: 0, maxTokens: 8000 });
      parseState = parseChunk(createParseState(), raw, { strict: true });
      validationErrors.push(...protocol.validate(raw, parseState.parsed), ...parseState.errors.map(message => ({ code: 'STREAM', message })));
      if (validationErrors.length === 0) {
        const retryReviewRaw = await callSecondaryApi(api, [
          { role: 'system', content: FACT_CRITIC_SYSTEM_PROMPT },
          { role: 'user', content: buildNarrativeFactCriticUserPrompt(prepared.writerPacket, parseState.parsed.maintext) },
        ], preset, { temperature: 0, maxTokens: 2500 });
        narrativeReview = sanitizeNarrativeReview(JSON.parse(retryReviewRaw.slice(retryReviewRaw.indexOf('{'), retryReviewRaw.lastIndexOf('}') + 1)));
      }
    }
    if ((narrativeReview as { approved?: boolean }).approved !== true) {
      validationErrors.push({ code: 'NARRATIVE_FACT_REVIEW', message: JSON.stringify(narrativeReview) });
    }
  }
  const scene = maintextToScene(parseState.parsed.maintext, {
    authorizedKnowledgeEvents: prepared.writerPacket.authorizedKnowledgeEvents.map(event => event.eventId),
    variables,
  });
  return {
    ...scenario,
    loopAudit,
    final: {
      directorAttempts: prepared.directorAttempts,
      reviews: {
        hard: prepared.hardReview,
        semantic: prepared.semanticReview,
        pacing: prepared.pacingReview,
      },
      revealBudget: prepared.brief.revealBudget,
      authorizedFacts: prepared.writerPacket.authorizedFacts,
      hiddenFactCount: prepared.brief.hiddenFacts.length,
      validationErrors,
      narrativeReview,
      parsed: parseState.parsed,
      sceneLines: scene.lines,
      raw,
    },
  };
}

const selectedScenarioIds = new Set((process.env.E2E_SCENARIOS ?? '').split(',').filter(Boolean));
const selectedScenarios = selectedScenarioIds.size > 0
  ? scenarios.filter(scenario => selectedScenarioIds.has(scenario.id))
  : scenarios;
const results = [];
for (const scenario of selectedScenarios) {
  clearOrchestrationLog();
  console.log(`START ${scenario.id}`);
  try {
    const result = await runScenario(scenario);
    results.push({ ok: true, result });
    console.log(`DONE ${scenario.id} errors=${result.final.validationErrors.length}`);
  } catch (error) {
    results.push({
      ok: false,
      id: scenario.id,
      error: error instanceof Error ? error.stack ?? error.message : String(error),
      orchestration: getOrchestrationLog().slice(0, 8),
    });
    console.error(`FAIL ${scenario.id}`, error);
  }
}

const output = process.env.E2E_OUTPUT ?? 'D:/deepseek-flash-e2e-results.json';
await writeFile(output, JSON.stringify({ generatedAt: new Date().toISOString(), model: api.model, results }, null, 2), 'utf8');
console.log(`WROTE ${output}`);
if (results.some(result => !result.ok || (result.ok && result.result.final.validationErrors.length > 0))) process.exitCode = 1;
if (results.some(result => result.ok && result.result.loopAudit.some(loop => loop.writerValidationErrors.length > 0))) process.exitCode = 1;
