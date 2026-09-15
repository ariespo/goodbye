// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getConclusionChoices, getConclusionRoutes, type ConclusionRouteId } from '../../engine/conclusion-system';
import { ROUTE_SUPPORT_FACTS, SOLUTION_FACTS } from '../../engine/story-rules';
import { createDefaultVariables } from '../../sillytavern/vars-merger';
import { useGameStore } from '../../stores/gameStore';
import { investigatedStoryState } from '../../test-support/story-state';
import { ConclusionModal } from './ConclusionModal';

const flow = vi.hoisted(() => ({
  lockProgramConclusion: vi.fn(),
  commitProgramConclusion: vi.fn(),
  selectProgramConclusionOverlay: vi.fn(),
}));
vi.mock('../../utils/conclusionFlow', () => flow);
const initialState = useGameStore.getState();

function show(variables: Record<string, unknown>, sceneComplete = true, isWaitingForAI = false) {
  useGameStore.setState(state => ({
    ui: { ...state.ui, showConclusion: true },
    game: { ...state.game, sceneComplete, isWaitingForAI },
    tavern: { ...state.tavern, variables },
  }));
  return render(<ConclusionModal />);
}

afterEach(() => {
  cleanup();
  useGameStore.setState(initialState, true);
  vi.resetAllMocks();
});

describe('conclusion disclosure', () => {
  it('shows a neutral empty state without revealing locked route names, theses or criteria', () => {
    const variables = createDefaultVariables();
    show(variables);
    for (const route of getConclusionRoutes(variables)) {
      expect(screen.queryByText(route.title)).not.toBeInTheDocument();
      expect(screen.queryByText(route.thesis)).not.toBeInTheDocument();
      for (const criterion of route.criteria) {
        expect(screen.queryByText(criterion.label)).not.toBeInTheDocument();
      }
    }
    expect(screen.getByText('尚无可作出的指认')).toBeInTheDocument();
    expect(screen.queryByText(/0\s*\/\s*5/)).not.toBeInTheDocument();
  });

  it.each<ConclusionRouteId>(['A', 'B', 'C', 'NONE', 'FAKE'])('reveals only the eligible %s route and permits confirmation', async routeId => {
    const variables = { ...investigatedStoryState(routeId), lockedRoute: null };
    const routes = getConclusionRoutes(variables);
    const ready = routes.find(route => route.id === routeId)!;
    flow.lockProgramConclusion.mockResolvedValue({ accepted: true });
    show(variables);
    for (const route of routes.filter(route => !route.available)) {
      expect(screen.queryByText(route.title)).not.toBeInTheDocument();
      expect(screen.queryByText(route.thesis)).not.toBeInTheDocument();
    }
    const card = screen.getByRole('button', { name: new RegExp(ready.title) });
    expect(card).toBeEnabled();
    fireEvent.click(card);
    fireEvent.click(screen.getByRole('button', { name: '确认' }));
    await waitFor(() => expect(flow.lockProgramConclusion).toHaveBeenCalledWith(routeId));
  });

  it('keeps a route hidden before day four or when one required fact is missing', () => {
    const variables: Record<string, unknown> = { ...investigatedStoryState('A'), lockedRoute: null, cycleCount: 3 };
    const { unmount } = show(variables);
    expect(screen.queryByText('独居老人')).not.toBeInTheDocument();
    unmount();
    const knowledge = { ...variables.mysteryKnowledge as Record<string, string> };
    delete knowledge[ROUTE_SUPPORT_FACTS.A[0]];
    show({ ...variables, cycleCount: 4, mysteryKnowledge: knowledge });
    expect(screen.queryByText('独居老人')).not.toBeInTheDocument();
  });

  it.each([[false, false], [true, true]])('does not reveal new cards while playback or generation is pending (%s, %s)', (sceneComplete, waiting) => {
    const { unmount } = show({ ...investigatedStoryState('A'), lockedRoute: null }, sceneComplete, waiting);
    expect(screen.queryByText('独居老人')).not.toBeInTheDocument();
    unmount();
    show(investigatedStoryState('A'), sceneComplete, waiting);
    expect(screen.queryByRole('button', { name: /公开指认/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /仪式确实存在/ })).not.toBeInTheDocument();
  });

  it('hides ending titles and descriptions until the exact final confirmation gate is met', () => {
    const variables = investigatedStoryState('A');
    const knowledge = { ...variables.mysteryKnowledge as Record<string, string> };
    delete knowledge[SOLUTION_FACTS.A];
    show({ ...variables, mysteryKnowledge: knowledge });
    for (const choice of getConclusionChoices(variables)) {
      expect(screen.queryByText(choice.title)).not.toBeInTheDocument();
      expect(screen.queryByText(choice.description)).not.toBeInTheDocument();
    }
    expect(screen.queryByText('仪式确实存在')).not.toBeInTheDocument();
  });

  it('shows eligible final choices in the shared modal and submits the selected action', async () => {
    flow.commitProgramConclusion.mockResolvedValue({ accepted: true });
    show(investigatedStoryState('B'));
    expect(screen.getByRole('dialog', { name: '路线指认' })).toHaveClass('pixel-modal-shell');
    fireEvent.click(screen.getByRole('button', { name: /揭发掩盖/ }));
    fireEvent.click(screen.getByRole('button', { name: '确认' }));
    await waitFor(() => expect(flow.commitProgramConclusion).toHaveBeenCalledWith('report'));
  });

  it('reveals deep interpretation only with its evidence and keeps unconfirmed deep endings hidden', () => {
    const variables = investigatedStoryState('A');
    const knowledge = { ...variables.mysteryKnowledge as Record<string, string> };
    delete knowledge[SOLUTION_FACTS.CULT];
    show({ ...variables, overlay: 'CULT', mysteryKnowledge: knowledge });
    expect(screen.getByRole('button', { name: /仪式确实存在/ })).toBeEnabled();
    expect(screen.queryByText('摧毁仪式')).not.toBeInTheDocument();
    expect(screen.queryByText('封存清晨')).not.toBeInTheDocument();
  });

  it('invalidates a pending decision when a different save changes its route or chat', () => {
    show(investigatedStoryState('A'));
    fireEvent.click(screen.getByRole('button', { name: /公开指认/ }));
    act(() => useGameStore.setState(state => ({ tavern: { ...state.tavern, variables: investigatedStoryState('B') } })));
    expect(screen.queryByRole('dialog', { name: '作出最终选择' })).not.toBeInTheDocument();
    expect(screen.queryByText(/确定选择“公开指认”/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /揭发掩盖/ }));
    act(() => useGameStore.setState(state => ({ tavern: { ...state.tavern, activeChatId: 'another-save' } })));
    expect(screen.queryByRole('dialog', { name: '作出最终选择' })).not.toBeInTheDocument();
    expect(flow.commitProgramConclusion).not.toHaveBeenCalled();
  });
});
