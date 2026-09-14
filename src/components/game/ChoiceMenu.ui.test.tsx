// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useGameStore } from '../../stores/gameStore';
import { ChoiceMenu } from './ChoiceMenu';

const loopMocks = vi.hoisted(() => ({ selectOption: vi.fn(() => true), reroll: vi.fn() }));

vi.mock('../../hooks/useGameLoop', () => ({ useGameLoop: () => loopMocks }));

describe('ChoiceMenu action outcome', () => {
  const initialState = useGameStore.getState();

  afterEach(() => {
    cleanup();
    loopMocks.selectOption.mockReset();
    loopMocks.selectOption.mockReturnValue(true);
    loopMocks.reroll.mockReset();
    useGameStore.setState(initialState, true);
  });

  it('displays exact accepted elapsed work and explicit remaining continuation', () => {
    useGameStore.setState(state => ({
      game: { ...state.game, sceneComplete: true, isWaitingForAI: false },
      api: {
        ...state.api,
        isStreaming: false,
        parsedContent: {
          ...state.api.parsedContent,
          options: ['继续调查', '改变计划'],
          actionOutcome: {
            resolutionId: 'resolution-1', actionId: 'deep-search', executedMinutes: 30,
            executedWorkMinutes: 30, executedTravelMinutes: 0,
            endTime: '2024-09-09T16:00:00', staminaDelta: -7, sanityDelta: 0,
            interruption: { id: 'death-news', at: '2024-09-09T16:00:00' },
            remaining: { workMinutes: 75, travelMinutes: 0, totalMinutes: 75, staminaCost: 17, continuationId: 'deep-search' },
          },
          optionBindings: [{ optionIndex: 0, optionText: '继续调查', actionId: 'deep-search', continuationId: 'deep-search' }],
        } as typeof state.api.parsedContent,
      },
      tavern: {
        ...state.tavern,
        variables: {
          ...state.tavern.variables,
          actionContinuity: {
            cycleCount: 3,
            continuation: {
              actionId: 'deep-search', cycleCount: 3, steps: [], previousResolutionId: 'resolution-1',
              stepsDigest: 'steps-x', resumableFromTime: '2024-09-09T16:00:00', expectedLocationId: 'school',
              activeStepId: 'search', completedMinutesByStep: { search: 30 }, chargedStaminaByStep: { search: 7 },
            },
          },
        },
      },
    }));

    render(<ChoiceMenu />);

    expect(screen.getByText('已进行30分钟')).toBeInTheDocument();
    expect(screen.getByText('调查30分钟')).toBeInTheDocument();
    expect(screen.getByText('剩余75分钟')).toBeInTheDocument();
    expect(screen.queryByText(/deep-search/)).not.toBeInTheDocument();
    expect(screen.getByText(/到达既定时间点，行动已暂停/)).toBeInTheDocument();
    expect(screen.queryByText(/死讯|死亡/)).not.toBeInTheDocument();
  });

  it('passes a validated continuation binding once across rapid repeated clicks', () => {
    useGameStore.setState(state => ({
      game: { ...state.game, sceneComplete: true, isWaitingForAI: false },
      api: {
        ...state.api,
        isStreaming: false,
        parsedContent: {
          ...state.api.parsedContent,
          options: ['继续调查'],
          optionBindings: [{ optionIndex: 0, optionText: '继续调查', actionId: 'deep-search', continuationId: 'deep-search' }],
        } as typeof state.api.parsedContent,
      },
      tavern: {
        ...state.tavern,
        variables: {
          ...state.tavern.variables,
          actionContinuity: {
            cycleCount: 3,
            continuation: {
              actionId: 'deep-search', cycleCount: 3, steps: [], previousResolutionId: 'resolution-1',
              stepsDigest: 'steps-x', resumableFromTime: '2024-09-09T16:00:00', expectedLocationId: 'school',
              activeStepId: 'search', completedMinutesByStep: { search: 30 }, chargedStaminaByStep: { search: 7 },
            },
          },
        },
      },
    }));

    render(<ChoiceMenu />);
    const choice = screen.getByRole('button', { name: /继续调查/ });
    fireEvent.click(choice);
    fireEvent.click(choice);

    expect(loopMocks.selectOption).toHaveBeenCalledOnce();
    expect(loopMocks.selectOption).toHaveBeenCalledWith('继续调查', {
      optionIndex: 0, optionText: '继续调查', actionId: 'deep-search', continuationId: 'deep-search',
    });
  });

  it('unlocks the same choice when runtime preflight reports that dispatch did not start', () => {
    loopMocks.selectOption.mockReturnValueOnce(false).mockReturnValue(true);
    useGameStore.setState(state => ({
      game: { ...state.game, sceneComplete: true, isWaitingForAI: false },
      api: {
        ...state.api,
        isStreaming: false,
        parsedContent: { ...state.api.parsedContent, options: ['继续调查'], optionBindings: undefined },
      },
    }));

    render(<ChoiceMenu />);
    const choice = screen.getByRole('button', { name: /继续调查/ });
    fireEvent.click(choice);
    expect(choice).toBeEnabled();
    fireEvent.click(choice);

    expect(loopMocks.selectOption).toHaveBeenCalledTimes(2);
    expect(choice).toBeDisabled();
  });
});
