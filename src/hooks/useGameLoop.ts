import { useCallback, useRef } from 'react';
import { useGameStore } from '../stores/gameStore';
import { assemblePrompt } from '../sillytavern/prompt-assembler';
import { streamChatCompletion } from '../sillytavern/api-router';
import { maintextToScene } from '../engine/scene-parser';
import { mergeVariables } from '../sillytavern/vars-merger';
import { createParseState, parseChunk } from '../sillytavern/stream-parser';
import { saveChat } from '../sillytavern/database';
import type { ChatMessage } from '../sillytavern/types';

export function useGameLoop() {
  const store = useGameStore();
  const parseStateRef = useRef(createParseState());

  const sendMessage = useCallback(async (userInput: string) => {
    const { tavern, game, actions } = store;
    const settings = tavern.settings;
    const activePreset = tavern.presets.find(p => p.id === settings?.activePresetId) || null;

    if (!settings) {
      actions.addNotification({ type: 'error', message: '设置未加载', duration: 4000 });
      return;
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: userInput,
      timestamp: Date.now(),
      variables: { ...tavern.variables },
    };

    const activeChat = tavern.chats.find(c => c.id === tavern.activeChatId);
    const messages = activeChat ? [...activeChat.messages, userMessage] : [userMessage];

    if (activeChat) {
      const updatedChat = { ...activeChat, messages, updatedAt: Date.now() };
      await saveChat(updatedChat);
      actions.setChats(tavern.chats.map(c => c.id === updatedChat.id ? updatedChat : c));
    }

    actions.setIsWaitingForAI(true);
    actions.setApiError(null);
    actions.setStreaming(true);
    parseStateRef.current = createParseState();

    try {
      const { messages: promptMessages } = assemblePrompt({
        userInput,
        history: messages,
        preset: activePreset,
        lorebooks: tavern.lorebooks,
        activeLorebookIds: settings.activeLorebookIds,
        userName: settings.userName,
        characterName: settings.characterName,
        variables: tavern.variables,
        formatPrompt: settings.formatPromptTemplate,
      });

      const abortController = new AbortController();
      actions.setAbortController(abortController);

      let fullText = '';

      await streamChatCompletion(
        settings.api,
        promptMessages,
        activePreset,
        {
          onToken: (token) => {
            fullText += token;
            actions.setStreamBuffer(fullText);
            parseStateRef.current = parseChunk(parseStateRef.current, token);
            actions.setParsedContent(parseStateRef.current.parsed);

            if (parseStateRef.current.parsed.maintext) {
              const scene = maintextToScene(parseStateRef.current.parsed.maintext);
              actions.setCurrentScene(scene);
              if (scene.mood) actions.setCurrentState({ mood: scene.mood });
              if (scene.background) actions.setCurrentState({ background: scene.background });
              if (scene.character) actions.setCurrentState({ character: scene.character });
              if (scene.bgm) actions.setCurrentState({ bgm: scene.bgm });
            }
          },
          onComplete: () => {
            actions.setStreaming(false);
            actions.setIsWaitingForAI(false);

            const parsed = parseStateRef.current.parsed;

            if (Object.keys(parsed.vars).length > 0) {
              const merged = mergeVariables(tavern.variables, parsed.vars);
              actions.setVariables(merged);

              if (parsed.vars.stamina !== undefined) {
                actions.setGameStatus({ stamina: parsed.vars.stamina });
              }
              if (parsed.vars.sanity !== undefined) {
                actions.setGameStatus({ sanity: parsed.vars.sanity });
              }
              if (parsed.vars.time !== undefined) {
                actions.setGameStatus({ time: new Date(parsed.vars.time) });
              }
            }

            const assistantMessage: ChatMessage = {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: parsed.maintext || fullText,
              timestamp: Date.now(),
              variables: { ...tavern.variables, ...parsed.vars },
            };

            const finalMessages = [...messages, assistantMessage];
            if (activeChat) {
              const updated = { ...activeChat, messages: finalMessages, variables: { ...tavern.variables, ...parsed.vars }, updatedAt: Date.now() };
              saveChat(updated);
              actions.setChats(tavern.chats.map(c => c.id === updated.id ? updated : c));
            }

            actions.addHistorySnapshot({
              turnIndex: game.history.length,
              timestamp: Date.now(),
              summary: parsed.summary || '回合结束',
              gameStatus: { ...game.gameStatus },
              variables: { ...tavern.variables, ...parsed.vars },
            });
          },
          onError: (error) => {
            actions.setStreaming(false);
            actions.setIsWaitingForAI(false);
            actions.setApiError(error.message);
            actions.addNotification({ type: 'error', message: error.message, duration: 6000 });
          },
        },
        abortController.signal
      );
    } catch (error) {
      actions.setStreaming(false);
      actions.setIsWaitingForAI(false);
      const message = error instanceof Error ? error.message : '未知错误';
      actions.setApiError(message);
      actions.addNotification({ type: 'error', message, duration: 6000 });
    }
  }, [store]);

  const selectOption = useCallback((optionText: string) => {
    sendMessage(optionText);
  }, [sendMessage]);

  const performAction = useCallback((actionType: string, itemDescription?: string) => {
    const message = itemDescription || `${store.tavern.settings?.userName || '玩家'}执行了${actionType}`;
    sendMessage(message);
  }, [sendMessage, store]);

  return { sendMessage, selectOption, performAction };
}
