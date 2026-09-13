// @vitest-environment jsdom
// Explicit opt-in only. Real models, real history/transactions, isolated disk I/O.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { transferableAbortController } from 'node:util';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, it, vi, expect } from 'vitest';
import { useGameLoop } from '../src/hooks/useGameLoop';
import { useGameStore } from '../src/stores/gameStore';
import { startNewGame } from '../src/utils/gameSession';
import { commitKnowledgeEvents } from '../src/utils/knowledgeCommit';
import { resolveSceneEnvironment } from '../src/utils/sceneEnvironment';
import { startNextCycle, settleCycleVariables } from '../src/utils/cycleLoop';
import { invalidatePreplans } from '../src/agents/mystery';
import { clearOrchestrationLog, getOrchestrationLog } from '../src/agents/mystery/orchestration-log';
import { clearTurnMetrics, getTurnMetrics } from '../src/agents/mystery/turn-metrics';
import { createDefaultPreset, DEFAULT_FORMAT_PROMPT, type AppSettings, type ChatPreset } from '../src/sillytavern/types';
import { callSecondaryApi } from '../src/sillytavern/api-router';

vi.mock('../src/agents/mystery/style-review', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/agents/mystery/style-review')>();
  return { ...actual, reviewNarrativeStyle: (options: Parameters<typeof actual.reviewNarrativeStyle>[0]) => {
    if (process.env.DAY_STYLE_OBSERVE === '1') return actual.reviewNarrativeStyle(options).then(review => {
      styleFindings.push(review);
      return { approved: true, violations: [], corrections: [] };
    });
    if (process.env.DAY_STYLE_DIAGNOSTIC !== '1') return actual.reviewNarrativeStyle(options);
    return actual.reviewNarrativeStyle({ ...options, complete: (messages, callOptions) => callSecondaryApi(
      options.api, messages.map((message, index) => index === 0 ? { ...message, content: `${message.content}\n\n[诊断性审查校准]\n只报告会让玩家明显感到复读的完整句或大段复用。持续天气、共享场景、角色固定特点、已有事实自然重述不属于文风违规；“环境—动作—停顿”等抽象结构不是证据。任何声称近期旧文重复的引句必须确实逐字存在于近期已接受正文，绝不能将候选正文当旧文。下列已授权事实及必要叙事可以重复出现：${JSON.stringify(options.exemptTexts ?? [])}。如果没有可核验的旧文原句与候选原句配对，approved=true、violations=[]。不要用猜测补出旧文。` } : message), options.preset, callOptions),
    });
  } };
});

vi.mock('../src/sillytavern/database', async importOriginal => ({
  ...await importOriginal<typeof import('../src/sillytavern/database')>(),
  saveChat: vi.fn().mockResolvedValue(undefined), getChats: vi.fn().mockResolvedValue([]),
}));

const enabled = process.env.LIVE_DAY_EVAL === '1';
const profile = process.env.DAY_PROFILE ?? 'fast';
const mode = process.env.DAY_MODE === 'strict' ? 'strict' : 'standard';
const maxTurns = Math.min(120, Number(process.env.DAY_MAX_TURNS) || 90);
const nativeFetch = globalThis.fetch;
const baseline = useGameStore.getState();
const root = '.codex-test-tmp/day-evaluation';
const diagnostic = process.env.DAY_STYLE_OBSERVE === '1' ? 'observe-only' : process.env.DAY_STYLE_DIAGNOSTIC === '1' ? 'calibrated' : false;
const runTag = (process.env.DAY_RUN_TAG ?? '').replace(/[^a-zA-Z0-9_-]/g, '');
const label = `${profile}-${mode}${diagnostic ? `-style-${diagnostic}` : ''}${runTag ? `-${runTag}` : ''}`;
let styleFindings: unknown[] = [];
const file = `${root}/${label}.json`;
const checkpoint = `${root}/${label}-checkpoint.json`;
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const snapshot = () => {
  const state = useGameStore.getState();
  return { time: state.game.gameStatus.time.toISOString(), cycleCount: state.tavern.variables.cycleCount,
    location: state.tavern.variables.location, stamina: state.game.gameStatus.stamina, sanity: state.game.gameStatus.sanity,
    knowledge: state.tavern.variables.knowledgeEvents, facts: state.tavern.variables.mysteryKnowledge,
    suspicion: state.tavern.variables.suspicion, deathNews: state.tavern.variables.deathNews,
    pendingReset: state.game.pendingCycleReset, pendingEnding: state.game.endingPanel.pendingEndingId,
    historyLength: state.game.history.length };
};

function playback() {
  const state = useGameStore.getState();
  const scene = state.game.currentScene;
  if (!scene?.lines.length) return;
  const committed = new Set<string>();
  scene.lines.forEach((line, i) => {
    if (!scene.knowledgeAlreadyCommitted && line.knowledgeEvents?.length)
      commitKnowledgeEvents(line.knowledgeEvents, `${scene.id}:${i}`, committed);
  });
  const line = scene.lines.at(-1)!;
  state.actions.setCurrentState({ background: line.background || null, bgm: line.bgm || null,
    character: line.character ?? null, speaker: line.speaker || null, mood: line.emotion || 'calm',
    effect: line.effect || null, item: line.item || null, environment: resolveSceneEnvironment(line.background) });
  state.actions.setCurrentLineIndex(scene.lines.length - 1);
  state.actions.setIsTyping(false);
  state.actions.setSceneComplete(true);
}

const interactions = [
  '我想去社区便利店，向店员询问文穗今天是否来过。',
  '谢谢你，不着急，你慢慢说。我想先听清楚你亲眼见过的事情。',
  '你刚才一直在擦汗，我有点担心。是我问得太急了吗？',
  '我想去学校找体育老师，询问文穗今天的情况。',
  '我想核实学校现在能够告诉家属的情况，请告诉我接下来应该去哪里找她。',
  '我去周大爷居住的旧楼，敲门向他打听文穗的消息。',
  '周大爷，您先坐，我只问您亲眼见过的事情，不确定的就不用猜。',
  '我现在有一些怀疑，但怀疑不是证据。我想继续核对刚才那件事。',
  '我去社区医院，找值班护士了解有没有文穗的消息。',
  '我很着急，但不想越过规定。哪些事情您能告诉我，哪些需要另找负责人？',
  '我叫李明，现在正式介绍一下。我希望你告诉我接下来实际能做什么。',
  '我去山路和附近街道寻找目击者，只询问他们亲眼见到的事情。',
  '我想去附近旅馆询问有没有人见过文穗。',
  '您方便介绍一下自己吗？平时在这附近做什么工作？',
  '我联系灯织学姐，告诉她目前已发生的情况，听听她的建议。',
  '谢谢你替我考虑，但这次我想自己决定。你能把能说的部分直接告诉我吗？',
];

describe.skipIf(!enabled)('live full repeated-day evaluation', () => {
  it(`${label}: collects continuous real-model evidence (passing does not imply day completion)`, async () => {
    const key = process.env.DEEPSEEK_API_KEY;
    if (!key) throw new Error('DEEPSEEK_API_KEY is required');
    vi.stubGlobal('AbortController', class { constructor() { return transferableAbortController(); } });
    let calls: Record<string, unknown>[] = [];
    let pending = 0;
    vi.stubGlobal('fetch', async (url: RequestInfo | URL, init?: RequestInit) => {
      const started = performance.now();
      const body = JSON.parse(String(init?.body ?? '{}'));
      const call: Record<string, unknown> = { startedAt: Date.now(), stream: !!body.stream,
        inputChars: JSON.stringify(body.messages ?? []).length, maxTokens: body.max_tokens,
        system: body.messages?.[0]?.content, user: body.messages?.at(-1)?.content,
        responseFormat: body.response_format?.type };
      calls.push(call); pending++;
      try {
        const response = await nativeFetch(url, init);
        call.headersMs = performance.now() - started; call.status = response.status;
        const copy = response.clone();
        void (body.stream ? copy.text().then(content => { call.content = content; }) : copy.json().then(result => {
          call.content = result.choices?.[0]?.message?.content; call.usage = result.usage;
          call.providerError = result.error?.message;
        })).catch(() => {}).finally(() => { call.totalMs = performance.now() - started; pending--; });
        return response;
      } catch (error) { call.error = error instanceof Error ? error.name : 'fetch error'; pending--; throw error; }
    });
    const background = async () => {
      const start = Date.now();
      while (Date.now() - start < 75_000) {
        await pause(250);
        if (!pending) { await pause(150); if (!pending) return; }
      }
      invalidatePreplans();
    };
    const preset = { ...createDefaultPreset(), id: 'day-eval', createdAt: 0, updatedAt: 0 } as ChatPreset;
    const settings = { api: { baseUrl: 'https://api.deepseek.com/v1', apiKey: key, model: 'deepseek-v4-flash' },
      activePresetId: preset.id, activeLorebookIds: [], userName: '李明', characterName: '文穗',
      playerGender: 'male', playerIdentityConfirmed: true, agentNarrativeMode: mode,
      formatPromptTemplate: DEFAULT_FORMAT_PROMPT } as AppSettings;
    useGameStore.setState({ ...baseline, tavern: { ...baseline.tavern, settings, presets: [preset] } }, true);
    mkdirSync(root, { recursive: true });
    let rows: Record<string, any>[] = [];
    let startState: unknown;
    if (process.env.DAY_RESUME === '1' && existsSync(checkpoint)) {
      const saved = JSON.parse(readFileSync(checkpoint,'utf8'));
      saved.game.gameStatus.time = new Date(saved.game.gameStatus.time);
      useGameStore.setState(state => ({ game: saved.game, tavern: { ...state.tavern, ...saved.tavern },
        api: { ...state.api, ...saved.api, abortController: null, isStreaming: false } }));
      const old = JSON.parse(readFileSync(file,'utf8')); rows = old.rows; startState = old.startState;
    } else {
      await act(async () => { await startNewGame(); playback(); await pause(25); });
      startState = snapshot();
    }
    const { result, unmount } = renderHook(() => useGameLoop());
    let stopReason = 'turn-cap';
    let consecutiveFailures = 0;
    let successful = rows.filter(row => row.success).length;
    const flush = () => {
      const state = useGameStore.getState();
      writeFileSync(file, JSON.stringify({ profile, mode, diagnosticStylePrompt: diagnostic, startState, finalState: snapshot(), stopReason,
        successful, rows }, null, 2).replaceAll(key,'[redacted]'));
      writeFileSync(checkpoint, JSON.stringify({ game: state.game,
        tavern: { chats: state.tavern.chats, activeChatId: state.tavern.activeChatId, variables: state.tavern.variables },
        api: { parsedContent: state.api.parsedContent, turnRecovery: state.api.turnRecovery, error: state.api.error } }));
    };
    try {
      while (successful < maxTurns && rows.length < maxTurns + 40) {
        calls = []; styleFindings = []; clearTurnMetrics(); clearOrchestrationLog();
        const before = snapshot();
        const state = useGameStore.getState();
        const options = state.api.parsedContent.options ?? [];
        const retry = consecutiveFailures === 1;
        let input: string;
        if (retry) input = rows.at(-1)!.input;
        else if (consecutiveFailures > 1) input = '我停下来整理刚刚发生的事情，先做目前可以做到的下一步。';
        else if (profile === 'fast') input = successful === 0
          ? '我用接下来的两个小时在附近寻找文穗，向愿意回答的人打听，不做越权的事情。'
          : '我继续寻找文穗，愿意花接下来的两个小时做当前实际能够做的搜索或等候，并留意这段时间发生的消息。';
        else if (profile === 'investigator' && successful < interactions.length) input = interactions[successful];
        else if (profile === 'investigator') input = before.deathNews === 'delivered'
          ? '我继续处理刚收到的坏消息，完成当前能做的确认和善后；如果暂时没有可做的事，就回家休息一段时间。'
          : (options.find((option: string) => /去|找|联系|核实|调查|询问/.test(option)) ?? options[0] ?? '我继续寻找文穗。');
        else input = options[0] ?? '我检查眼前能看到的事情，决定接下来去哪里找文穗。';
        const attemptStarted = Date.now();
        const timer = setTimeout(() => useGameStore.getState().api.abortController?.abort(), 180_000);
        await act(async () => {
          if (retry) await result.current.retryTurn();
          else await result.current.sendMessage(input);
        });
        clearTimeout(timer);
        const afterSend = useGameStore.getState();
        const success = afterSend.game.history.length > Number(before.historyLength);
        const accepted = success ? [...afterSend.tavern.chats.find(c=>c.id===afterSend.tavern.activeChatId)!.messages]
          .reverse().find(message=>message.role==='assistant') : null;
        const row: Record<string, any> = { attempt: rows.length + 1, turn: successful + 1, input, retry, success,
          before, after: snapshot(), metrics: getTurnMetrics().at(-1),
          error: afterSend.api.error ?? afterSend.api.turnRecovery.errorMessage,
          accepted: accepted?.content, lines: success ? afterSend.game.currentScene?.lines : [],
          options: [...afterSend.api.parsedContent.options], calls, orchestration: [], styleFindings,
          notifications: afterSend.ui.notifications.map(item=>item.message) };
        rows.push(row);
        if(success) { successful++; consecutiveFailures=0; }
        else consecutiveFailures++;
        await act(async () => { await background(); });
        row.orchestration = getOrchestrationLog();
        row.elapsedIncludingBackgroundMs = Date.now() - attemptStarted;
        row.checklist = useGameStore.getState().game.currentScene && {
          observe: useGameStore.getState().game.currentScene?.observe,
          investigations: useGameStore.getState().game.currentScene?.investigateItems,
          actions: useGameStore.getState().game.currentScene?.actionItems };
        if (success) await act(async () => { playback(); await pause(25); });
        const live = useGameStore.getState();
        if (live.game.pendingCycleReset && live.game.sceneComplete && !live.api.isStreaming
          && !live.game.endingPanel.visible && !live.game.endingPanel.pendingEndingId) {
          row.resetReason = live.game.pendingCycleReset;
          const reason = live.game.pendingCycleReset;
          await act(async () => {
            live.actions.setPendingCycleReset(null);
            await startNextCycle({variables:settleCycleVariables(live.tavern.variables),reason}); playback();
          });
          row.resetScene = useGameStore.getState().game.currentScene?.lines;
          stopReason = reason === 'day-end' ? 'completed-calendar-day' : `early-reset-${reason}`;
        }
        console.log(JSON.stringify({profile,mode,attempt:row.attempt,turn:row.turn,success,
          from:before.time,to:row.after.time,stamina:row.after.stamina,sanity:row.after.sanity,
          playableMs:row.metrics?.playableMs,calls:calls.length,error:row.error,reset:row.resetReason}));
        flush();
        if (calls.some(call => call.status === 402)) { stopReason='provider-insufficient-balance'; flush(); break; }
        if (Number(snapshot().cycleCount)>1) break;
        if (live.game.endingPanel.pendingEndingId) { stopReason='ending-before-day-reset'; break; }
        if (consecutiveFailures>=6) { stopReason='blocked-six-attempts'; break; }
      }
      flush();
      console.log('CAMPAIGN_RESULT', JSON.stringify({profile,mode,diagnostic,successful,attempts:rows.length,stopReason,finalState:snapshot()}));
      expect(rows.length).toBeGreaterThan(0);
    } finally { invalidatePreplans(); unmount(); vi.unstubAllGlobals(); }
  }, 7_200_000);
});
