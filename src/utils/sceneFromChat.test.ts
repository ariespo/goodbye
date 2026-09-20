import { describe, expect, it } from 'vitest';
import type { ChatMessage, ChatSession } from '../sillytavern/types';
import { buildTurnCommit } from '../memory/world-memory';
import { maintextToScene } from '../engine/scene-parser';
import { resolvePlayerFacingSpeaker } from '../data/playerKnowledge';
import { projectKnowledgeForPlayback } from './knowledgePresentation';
import { rebuildSceneFromChat } from './sceneFromChat';

function acceptedChat(): ChatSession {
  const before = { cycleCount: 1, location: 'supermarket', knowledgeEvents: ['know:supermarket'] };
  const after = { ...before, knowledgeEvents: [...before.knowledgeEvents, 'meet:chen-huihui'] };
  const maintext = '场景|supermarket-day\n对话|店员|calm|欢迎光临。\n对话|旁白|calm|这是便利店的店员陈慧慧。\n认知|meet:chen-huihui\n对话|陈慧慧|calm|有什么事吗？\n<observe>雨水打在店门上。</observe>';
  const scene = maintextToScene(maintext, { authorizedKnowledgeEvents: ['meet:chen-huihui'], variables: before });
  const commit = buildTurnCommit({ turnId: 'accepted', turnIndex: 1, createdAt: 2,
    occurredAt: '2024-09-09T08:10:00', locationId: 'supermarket', cycleCount: 1,
    summary: '玩家认出店员陈慧慧。', scene, beforeVariables: before, settledVariables: after });
  const message: ChatMessage = { id: 'accepted', role: 'assistant', content: `<maintext>${maintext}</maintext>`,
    timestamp: 2, variables: { ...after, worldMemory: commit.worldMemory } };
  return { id: 'chat', name: 'test', characterName: '文穗', userName: '玩家', presetId: null, lorebookIds: [],
    messages: [{ id: 'request', role: 'user', content: '进店', timestamp: 1, variables: before }, message],
    variables: message.variables, createdAt: 1, updatedAt: 2 };
}

describe('persisted scene knowledge presentation', () => {
  it('restores only committed introductions and hides the name until their evidence line is read', () => {
    const chat = acceptedChat();
    const scene = rebuildSceneFromChat(chat)!;
    expect(scene.knowledgeAlreadyCommitted).toBe(true);
    expect(scene.lines[1].knowledgeEvents).toEqual(['meet:chen-huihui']);
    const before = projectKnowledgeForPlayback(chat.variables, scene, 0, false);
    const after = projectKnowledgeForPlayback(chat.variables, scene, 2, false);
    expect(resolvePlayerFacingSpeaker('陈慧慧', undefined, before)).toBe('店员');
    expect(resolvePlayerFacingSpeaker('陈慧慧', undefined, after)).toBe('陈慧慧');
  });

  it('uses committed evidence positions when raw recognition syntax is missing or moved', () => {
    const chat = acceptedChat();
    chat.messages[1].content = chat.messages[1].content.replace('认知|meet:chen-huihui\n', '').replace('欢迎光临。', '欢迎光临。\n认知|meet:chen-huihui');
    const scene = rebuildSceneFromChat(chat)!;
    expect(scene.lines[0].knowledgeEvents).toBeUndefined();
    expect(scene.lines[1].knowledgeEvents).toEqual(['meet:chen-huihui']);
  });

  it('cannot authorize an extra raw event or events belonging to a different committed turn', () => {
    const chat = acceptedChat();
    chat.messages[1].content = chat.messages[1].content.replace('认知|meet:chen-huihui', '认知|meet:chen-huihui\n认知|identify:lin-jing');
    const scene = rebuildSceneFromChat(chat)!;
    expect(scene.lines.flatMap(line => line.knowledgeEvents ?? [])).not.toContain('identify:lin-jing');
    chat.messages[1].id = 'different-turn';
    expect(rebuildSceneFromChat(chat)!.lines.flatMap(line => line.knowledgeEvents ?? [])).toEqual([]);
  });
});
