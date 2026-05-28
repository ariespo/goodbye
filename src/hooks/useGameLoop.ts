import { useCallback, useRef } from 'react';
import { useGameStore } from '../stores/gameStore';
import { assemblePrompt } from '../sillytavern/prompt-assembler';
import { streamChatCompletion, callSecondaryApi } from '../sillytavern/api-router';
import { maintextToScene } from '../engine/scene-parser';
import { mergeVariables } from '../sillytavern/vars-merger';
import { createParseState, parseChunk } from '../sillytavern/stream-parser';
import { saveChat } from '../sillytavern/database';
import type { ChatMessage } from '../sillytavern/types';

const SECONDARY_SYSTEM_PROMPT = `你是游戏状态分析助手。基于下面的回合剧情,仅输出两个标签,不写任何正文或解释:
<sum>本回合一句话总结</sum>
<vars>{ "变量名": 值, ... }</vars>

要求:
- vars 中只包含变量发生变化的字段(例如体力 stamina、理智 sanity、时间 time、物品 items 等)
- vars 必须是合法 JSON
- 如果回合内没有数值变化,可以输出空对象 <vars>{}</vars>`;

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

      const finalize = (apiUsed: 'primary' | 'dual') => {
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
          content: fullText,
          timestamp: Date.now(),
          variables: { ...tavern.variables, ...parsed.vars },
          apiUsed: apiUsed === 'dual' ? 'secondary' : 'primary',
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
      };

      // 主 API 完成后,如配置了次 API,用次 API 补 sum/vars
      const maybeAugmentWithSecondary = async () => {
        const sec = settings.api.secondary;
        if (!sec?.enabled || !sec.apiKey || !sec.baseUrl) return false;

        const parsed = parseStateRef.current.parsed;
        try {
          const result = await callSecondaryApi(
            { baseUrl: sec.baseUrl, apiKey: sec.apiKey, model: sec.model },
            [
              { role: 'system', content: SECONDARY_SYSTEM_PROMPT },
              { role: 'user', content: parsed.maintext || fullText },
            ],
            activePreset,
            { temperature: sec.temperature, maxTokens: sec.maxTokens }
          );

          const sumMatch = result.match(/<sum>([\s\S]*?)<\/sum>/);
          if (sumMatch) parsed.summary = sumMatch[1].trim();

          const varsMatch = result.match(/<vars>([\s\S]*?)<\/vars>/);
          if (varsMatch) {
            try {
              const v = JSON.parse(varsMatch[1].trim());
              if (v && typeof v === 'object') parsed.vars = { ...parsed.vars, ...v };
            } catch {
              // 解析失败忽略
            }
          }

          actions.setParsedContent(parsed);
          return true;
        } catch (e) {
          actions.addNotification({
            type: 'warning',
            message: '次 API 调用失败,使用主 API 结果: ' + (e instanceof Error ? e.message : String(e)),
            duration: 4000,
          });
          return false;
        }
      };

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
              const parsed = parseStateRef.current.parsed;
              if (parsed.observe) scene.observe = parsed.observe;
              if (parsed.investigateItems?.length) scene.investigateItems = parsed.investigateItems;
              if (parsed.actionItems?.length) scene.actionItems = parsed.actionItems;
              actions.setCurrentScene(scene);
            }
          },
          onComplete: async () => {
            actions.setStreaming(false);
            actions.setIsWaitingForAI(false);

            const augmented = await maybeAugmentWithSecondary();
            finalize(augmented ? 'dual' : 'primary');
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

  const performAction = useCallback((actionType: 'observe' | 'investigate' | 'actions', itemIndex?: number) => {
    const { game, actions } = store;
    const scene = game.currentScene;

    // 如果当前场景有本地数据，直接展示，不调用 API
    if (actionType === 'observe' && scene?.observe) {
      actions.setActionPanel({ visible: true, type: 'observe', content: scene.observe, selectedIndex: null });
      return;
    }

    if (actionType === 'investigate' && scene?.investigateItems && scene.investigateItems.length > 0) {
      if (itemIndex !== undefined) {
        // 选择了具体调查项：构造 prompt 发送给 LLM 获取详细结果
        const item = scene.investigateItems[itemIndex];
        const prompt = `[系统] 玩家选择了调查："${item.desc}"
当前场景：${game.currentState.background || '未知'}
嫌疑人指向：${item.suspect}
结果风格：${item.style}

请返回详细的调查结果，包含发现、疑点、可能的线索。
输出格式：<action type="investigate">...</action>`;
        sendMessage(prompt);
        actions.setActionPanel({ visible: false, type: null, content: '', selectedIndex: null });
      } else {
        // 显示调查列表（序列化为文本供面板展示）
        const listText = scene.investigateItems.map((item, i) =>
          `[${i + 1}] ${item.desc}\n    嫌疑人：${item.suspect}  风格：${item.style}  耗时：${item.time}  体力-${item.stamina}  理智-${item.sanity}`
        ).join('\n\n');
        actions.setActionPanel({ visible: true, type: 'investigate', content: listText, selectedIndex: null });
      }
      return;
    }

    if (actionType === 'actions' && scene?.actionItems && scene.actionItems.length > 0) {
      if (itemIndex !== undefined) {
        // 选择了具体行动项：构造 prompt 发送给 LLM 获取详细结果
        const item = scene.actionItems[itemIndex];
        const prompt = `[系统] 玩家执行了行动："${item.desc}"
当前场景：${game.currentState.background || '未知'}
结果风格：${item.style}

请描述行动过程、结果、场景变化（如果有）。
如果行动导致场景切换，在文本末尾加上：[变化] 场景切换 → 新场景名
输出格式：<action type="act">...</action>`;
        sendMessage(prompt);
        actions.setActionPanel({ visible: false, type: null, content: '', selectedIndex: null });
      } else {
        // 显示行动列表
        const listText = scene.actionItems.map((item, i) =>
          `[${i + 1}] ${item.desc}\n    风格：${item.style}  耗时：${item.time}  体力-${item.stamina}  理智-${item.sanity}`
        ).join('\n\n');
        actions.setActionPanel({ visible: true, type: 'act', content: listText, selectedIndex: null });
      }
      return;
    }

    // 没有本地数据时，发送通用消息给 LLM
    const message = `${store.tavern.settings?.userName || '玩家'}执行了${actionType}`;
    sendMessage(message);
  }, [sendMessage, store]);

  return { sendMessage, selectOption, performAction };
}
