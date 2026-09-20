import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, initializeDatabase } from '../sillytavern/database';
import { useGameStore } from '../stores/gameStore';
import { buildSaveSlotPayload, loadGameFromSave, startNewGame } from './gameSession';
import { captureTurnState } from './turnStateSnapshot';
import { importSaveArchive, MAX_SAVE_ARCHIVE_BYTES, parseSaveArchive, readSaveArchiveFile, serializeSaveArchive } from './save-transfer';

const initial = useGameStore.getState();

async function fixture() {
  await startNewGame();
  const state = useGameStore.getState();
  const chat = state.tavern.chats[0];
  const message = chat.messages[0];
  message.turnState = captureTurnState({ ...state.game, variables: state.tavern.variables });
  useGameStore.setState(s => ({
    tavern: { ...s.tavern, variables: { ...s.tavern.variables, routesLockedEver: ['A'], stayedEver: true } },
    game: { ...s.game, endingsSeen: ['A_GOOD'], history: [{ turnIndex: 1, timestamp: 1, summary: '雨声仍在。',
      gameStatus: { ...s.game.gameStatus }, variables: { ...s.tavern.variables } }] },
  }));
  return buildSaveSlotPayload('完整记忆', '');
}

beforeEach(async () => {
  useGameStore.setState(initial, true);
  const quiet = vi.spyOn(console, 'warn').mockImplementation(() => {});
  await initializeDatabase();
  quiet.mockRestore();
  await db.saves.clear();
  await db.chats.clear();
});
afterEach(() => { useGameStore.setState(initial, true); vi.restoreAllMocks(); });

describe('portable save archives', () => {
  it('round-trips full prose, summaries, progress and typed dates through the real load path', async () => {
    const save = await fixture();
    const originalText = save.tavernState.messages[0].content;
    const archive = serializeSaveArchive(save);
    const restored = parseSaveArchive(archive);
    expect(restored.tavernState.messages[0].content).toBe(originalText);
    expect(restored.tavernState.messages[0].narrativeSummary?.text).toContain('9月9日08:00');
    expect(restored.gameState.gameStatus.time).toBeInstanceOf(Date);
    expect(restored.gameState.history?.[0].gameStatus.time).toBeInstanceOf(Date);
    expect(restored.tavernState.messages[0].turnState?.gameStatus.time).toBeInstanceOf(Date);
    await loadGameFromSave(restored);
    const loaded = useGameStore.getState();
    expect(loaded.tavern.chats[0].messages[0].content).toBe(originalText);
    expect(loaded.game.history[0].summary).toBe('雨声仍在。');
    expect(loaded.game.endingsSeen).toContain('A_GOOD');
    expect(loaded.tavern.variables.routesLockedEver).toContain('A');
    expect(loaded.tavern.variables.stayedEver).toBe(true);
    expect(loaded.game.gameStatus.time.getHours()).toBe(8);
  });

  it('imports two new copies without overwriting the source or activating either save', async () => {
    const save = await fixture();
    await db.saves.add(save);
    const before = useGameStore.getState();
    const first = await importSaveArchive(serializeSaveArchive(save));
    const second = await importSaveArchive(serializeSaveArchive(save));
    expect(new Set([save.id, first.id, second.id]).size).toBe(3);
    expect(await db.saves.toArray()).toHaveLength(3);
    expect((await db.saves.toArray()).find(s => s.id === save.id)).toEqual(save);
    expect(useGameStore.getState()).toBe(before);
  });

  it('exports only gameplay save fields, never provider settings or API credentials', async () => {
    const save = await fixture();
    Object.assign(save, { api: { apiKey: 'DO-NOT-EXPORT' }, settings: { provider: 'private' } });
    Object.assign(save.tavernState, { settings: { api: { apiKey: 'DO-NOT-EXPORT' } } });
    const text = serializeSaveArchive(save);
    expect(text).not.toContain('DO-NOT-EXPORT');
    expect(JSON.parse(text)).toMatchObject({ format: 'farewell-save', version: 1 });
    expect(JSON.parse(text).save.tavernState).not.toHaveProperty('settings');
  });

  it.each([
    ['unsupported version', 'version', 99],
    ['missing state', 'save.gameState', undefined],
    ['invalid clock', 'save.gameState.gameStatus.time', 'not-a-date'],
    ['impossible calendar day', 'save.gameState.gameStatus.time', '2024-02-30T08:00:00Z'],
    ['invalid resource', 'save.gameState.gameStatus.sanity', 101],
    ['invalid index', 'save.gameState.currentLineIndex', -1],
    ['invalid role', 'save.tavernState.messages.0.role', 'admin'],
    ['invalid mood', 'save.gameState.currentState.mood', 'god'],
    ['corrupt cycle', 'save.tavernState.variables.cycleCount', '4'],
    ['corrupt proof', 'save.tavernState.variables.mysteryKnowledge', { fact: 'yes' }],
    ['corrupt cognition', 'save.tavernState.variables.worldMemory.cognition', [{ status: 'confirmed' }]],
    ['bad historical clock', 'save.gameState.history.0.gameStatus.time', null],
    ['bad summary clock', 'save.tavernState.messages.0.narrativeSummary.endedAt', 'yesterday'],
    ['remote thumbnail', 'save.thumbnail', 'https://example.com/tracker.png'],
  ] as const)('rejects %s before writing any save', async (_label, path, value) => {
    const envelope = JSON.parse(serializeSaveArchive(await fixture()));
    const parts = path.split('.');
    let target: Record<string, unknown> = envelope;
    for (const part of parts.slice(0, -1)) target = target[part] as Record<string, unknown>;
    target[parts.at(-1)!] = value;
    await expect(importSaveArchive(JSON.stringify(envelope))).rejects.toThrow();
    expect(await db.saves.toArray()).toHaveLength(0);
  });

  it('preserves accepted event and pending revelation enums without repairing them', async () => {
    const save = await fixture();
    save.tavernState.variables.deathNews = 'delivered';
    save.tavernState.variables.mysteryKnowledge = { 'shared-school-absence': 'atmosphere' };
    save.tavernState.variables.actionContinuity = {
      cycleCount: 1, pendingAuthorization: { actionId: 'interrupted', cycleCount: 1, graphFingerprint: 'graph',
        revelations: [{ sourceId: 'source', alias: 'F1', canonicalFactId: 'shared-school-absence', level: 'hint',
          delivery: 'narration', sourceLocationId: 'school' }], knowledgeMilestones: [] },
    };
    const restored = parseSaveArchive(serializeSaveArchive(save));
    expect(restored.tavernState.variables).toEqual(save.tavernState.variables);
  });

  it('rejects malformed frozen scene contracts rather than retaining corrupt authority metadata', async () => {
    const envelope = JSON.parse(serializeSaveArchive(await fixture()));
    envelope.save.tavernState.messages[0].actionRequest = { narrativeContext: {
      locationId: 'home', background: 'home-day.png', entryMode: 'destination', requiredNpcIds: [], enRouteNpcIds: [],
      forbiddenNpcIds: [], presentationMode: 'default', costs: {}, directive: '留在家中。', sceneContract: {},
    } };
    await expect(importSaveArchive(JSON.stringify(envelope))).rejects.toThrow();
    expect(await db.saves.toArray()).toHaveLength(0);
  });

  it.each(['__proto__', 'constructor', 'prototype', 'nested.__proto__.polluted'])('rejects unsafe object key %s', async key => {
    const envelope = JSON.parse(serializeSaveArchive(await fixture()));
    Object.defineProperty(envelope.save.tavernState.variables, key, { value: { polluted: true }, enumerable: true });
    expect(() => parseSaveArchive(JSON.stringify(envelope))).toThrow();
    expect(Object.prototype).not.toHaveProperty('polluted');
  });

  it('rejects corrupt JSON and oversized files before reading their contents', async () => {
    expect(() => parseSaveArchive('{bad')).toThrow();
    expect(() => parseSaveArchive(' '.repeat(MAX_SAVE_ARCHIVE_BYTES + 1))).toThrow();
    const text = vi.fn();
    await expect(readSaveArchiveFile({ size: MAX_SAVE_ARCHIVE_BYTES + 1, text } as unknown as File)).rejects.toThrow();
    expect(text).not.toHaveBeenCalled();
  });

  it('accepts absent legacy optional fields without inventing new state', async () => {
    const save = await fixture();
    delete save.gameState.history;
    delete save.gameState.parsedContent;
    delete save.gameState.autoMode;
    delete save.tavernState.messages[0].narrativeSummary;
    delete save.tavernState.messages[0].turnState;
    expect(parseSaveArchive(serializeSaveArchive(save))).toEqual(save);
  });
});
