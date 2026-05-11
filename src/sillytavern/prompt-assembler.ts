import type { ChatPreset, Lorebook, ChatMessage, AppSettings } from './types';
import { scanLorebooks, buildLorebookPrompt } from './lorebook-engine';

export interface PromptContext {
  userInput: string;
  history: ChatMessage[];
  preset: ChatPreset | null;
  lorebooks: Lorebook[];
  activeLorebookIds: string[];
  userName: string;
  characterName: string;
  variables: Record<string, any>;
}

export function assemblePrompt(context: PromptContext): { messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> } {
  const parts: string[] = [];

  parts.push(`你是 ${context.characterName}。用户的名字是 ${context.userName}。`);
  parts.push('');

  const lorebookMatches = scanLorebooks(context.lorebooks, context.activeLorebookIds, buildContextText(context));
  const lorebookPrompt = buildLorebookPrompt(lorebookMatches);
  if (lorebookPrompt) {
    parts.push('=== 世界设定 ===');
    parts.push(lorebookPrompt);
    parts.push('');
  }

  if (Object.keys(context.variables).length > 0) {
    parts.push('=== 当前状态 ===');
    parts.push(JSON.stringify(context.variables, null, 2));
    parts.push('');
  }

  parts.push('=== 输出格式 ===');
  parts.push('请严格使用以下 XML 标签格式输出：');
  parts.push('<thinking>（可选）你的思考过程</thinking>');
  parts.push('<maintext>剧情正文，支持多行。可用 [background:路径] [character:路径] [bgm:路径] [mood:情绪] [speaker:名字] 指令控制场景</maintext>');
  parts.push('<option>选项A描述');
  parts.push('选项B描述');
  parts.push('选项C描述</option>');
  parts.push('<sum>本回合一句话总结</sum>');
  parts.push('<vars>{"stamina": 数值, "sanity": 数值, "time": "ISO时间字符串"}</vars>');
  parts.push('');

  const systemPrompt = parts.join('\n');

  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemPrompt },
  ];

  const recentHistory = context.history.slice(-20);
  for (const msg of recentHistory) {
    messages.push({
      role: msg.role,
      content: msg.content,
    });
  }

  messages.push({
    role: 'user',
    content: context.userInput,
  });

  return { messages };
}

function buildContextText(context: PromptContext): string {
  const parts: string[] = [];
  parts.push(context.userInput);

  for (const msg of context.history.slice(-5)) {
    parts.push(msg.content);
  }

  return parts.join(' ');
}
