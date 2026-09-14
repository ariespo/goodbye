import { describe, expect, it } from 'vitest';
import type { ChatMessage, ChatSession } from '../sillytavern/types';
import { resolveSavedParsedContent } from './gameSession';
import { rebuildSceneFromChat } from './sceneFromChat';

const acceptedOutcome = {
  resolutionId: 'resolution-1',
  actionId: 'school-check',
  executedMinutes: 30,
  executedWorkMinutes: 20,
  executedTravelMinutes: 10,
  endTime: '2024-09-09T16:00:00.000Z',
  staminaDelta: -7,
  sanityDelta: 0,
  interruption: { id: 'death-news', at: '2024-09-09T16:00:00.000Z' },
  remaining: {
    workMinutes: 35,
    travelMinutes: 0,
    totalMinutes: 35,
    staminaCost: 8,
    continuationId: 'school-check',
  },
};

const parsed = {
  thinking: '',
  maintext: '场景|school-day\n对话|旁白|calm|行动暂时停了下来。',
  options: ['继续未完成的行动（剩余35分钟）', '改变计划'],
  summary: '行动暂停。',
  vars: {},
};

function acceptedMessage(): ChatMessage {
  return {
    id: 'assistant-1',
    role: 'assistant',
    content: `<maintext>${parsed.maintext}</maintext><option>${parsed.options.join('\n')}</option><sum>${parsed.summary}</sum><vars>{}</vars>`,
    timestamp: 1,
    variables: {
      location: 'school',
      actionContinuity: {
        cycleCount: 1,
        continuation: {
          actionId: 'school-check', cycleCount: 1, steps: [], previousResolutionId: 'resolution-1',
          stepsDigest: 'steps', resumableFromTime: acceptedOutcome.endTime, expectedLocationId: 'school',
          activeStepId: 'school-check', completedMinutesByStep: {}, chargedStaminaByStep: {},
        },
      },
    },
    acceptedActionOutcome: acceptedOutcome,
    parsed: {
      ...parsed,
      optionBindings: [{
        optionIndex: 0,
        optionText: parsed.options[0],
        actionId: 'school-check',
        continuationId: 'school-check',
      }],
    },
  } as ChatMessage;
}

describe('program action UI persistence', () => {
  it('rebuilds only the strict public outcome from the accepted assistant message', () => {
    const message = acceptedMessage();
    message.acceptedActionOutcome = { ...acceptedOutcome, privateSourceIds: ['fact:secret'] } as typeof acceptedOutcome;
    const chat: ChatSession = {
      id: 'chat-1', name: 'test', messages: [message], characterName: '文穗', userName: '玩家',
      presetId: null, lorebookIds: [], variables: message.variables, createdAt: 1, updatedAt: 1,
    };

    const scene = rebuildSceneFromChat(chat);

    expect(scene?.actionOutcome).toEqual({
      resolutionId: 'resolution-1', actionId: 'school-check', executedMinutes: 30,
      executedWorkMinutes: 20, executedTravelMinutes: 10,
      endTime: '2024-09-09T16:00:00.000Z', staminaDelta: -7, sanityDelta: 0,
      interruption: { id: 'death-news', at: '2024-09-09T16:00:00.000Z' },
      remaining: { workMinutes: 35, travelMinutes: 0, totalMinutes: 35, staminaCost: 8, continuationId: 'school-check' },
    });
    expect(scene?.actionOutcome).not.toHaveProperty('privateSourceIds');
  });

  it('does not turn model text or unaccepted parsed fields into action authority', () => {
    const message: ChatMessage = {
      id: 'assistant-forged', role: 'assistant', timestamp: 1, variables: { location: 'home' },
      content: '<maintext>对话|旁白|calm|普通叙事。</maintext><actionOutcome>{"executedMinutes":999}</actionOutcome>',
      parsed: { ...parsed, actionOutcome: acceptedOutcome, optionBindings: [{ optionIndex: 0, optionText: parsed.options[0], continuationId: 'school-check' }] },
    } as ChatMessage;
    const chat: ChatSession = {
      id: 'chat-1', name: 'test', messages: [message], characterName: '文穗', userName: '玩家',
      presetId: null, lorebookIds: [], variables: message.variables, createdAt: 1, updatedAt: 1,
    };

    expect(rebuildSceneFromChat(chat)?.actionOutcome).toBeUndefined();
  });

  it('restores accepted outcome and only a binding that matches the saved continuation and option', () => {
    const message = acceptedMessage();
    const save = {
      gameState: {
        parsedContent: { ...parsed, actionOutcome: { ...acceptedOutcome, executedMinutes: 999 }, optionBindings: [] },
      },
    } as never;

    const restored = resolveSavedParsedContent(save, [message]);

    expect(restored.actionOutcome).toEqual(acceptedOutcome);
    expect(restored.optionBindings).toEqual(message.parsed?.optionBindings);
    expect(restored.actionOutcome).not.toBe((message as typeof message & { acceptedActionOutcome: object }).acceptedActionOutcome);
  });
});
