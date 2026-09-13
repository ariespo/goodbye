import type { ParsedContent } from './types';
import { maintextToScene } from '../engine/scene-parser';

export interface ValidationError {
  code: string;
  message: string;
  tag?: string;
}

export interface ValidationOptions {
  /** 必填标签 */
  requiredTags?: string[];
  /** 是否要求选项至少 2 项 */
  requireMinOptions?: number;
  /** 是否校验 vars 为合法 JSON */
  validateVarsJson?: boolean;
  /** 是否校验未闭合标签 */
  checkUnclosedTags?: boolean;
  /** 允许的标签白名单(不在名单中的标签视为警告) */
  allowedTags?: string[];
}

const DEFAULT_ALLOWED_TAGS = new Set([
  'maintext', 'option', 'sum', 'vars', 'thinking', 'think',
  'observe', 'investigate', 'action', 'hint',
]);

export interface OutputRepairResult {
  text: string;
  repairedTags: string[];
}

function windowsPathRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const pathPattern = /[A-Za-z]:\\[^\s|"'【】<>，。！？；：]+/gu;
  for (const match of text.matchAll(pathPattern)) {
    if (match.index === undefined) continue;
    ranges.push([match.index, match.index + match[0].length]);
  }
  return ranges;
}

function hasDialogueEscapeArtifact(text: string): boolean {
  const pathRanges = windowsPathRanges(text);
  for (const match of text.matchAll(/\\(?:n|r)/gu)) {
    const index = match.index ?? -1;
    let precedingSlashes = 0;
    for (let i = index - 1; i >= 0 && text[i] === '\\'; i -= 1) precedingSlashes += 1;
    if (precedingSlashes % 2 === 1) continue;
    if (pathRanges.some(([start, end]) => index >= start && index < end)) continue;
    return true;
  }
  return false;
}

/**
 * 修复边界可由后续必填标签唯一确定的轻微 XML 疏漏。
 * 仅当 option 与 sum 均完整存在时，才允许在首个 option 前补 maintext 闭合；
 * 真正被截断的回复仍会进入严格失败恢复流程。
 */
export function repairRecoverableOutput(rawText: string): OutputRepairResult {
  const mainOpenMatches = rawText.match(/<maintext(?:\s[^>]*)?>/gi) ?? [];
  const mainCloseMatches = rawText.match(/<\/maintext\s*>/gi) ?? [];
  if (mainOpenMatches.length !== 1 || mainCloseMatches.length !== 0) {
    return { text: rawText, repairedTags: [] };
  }

  const mainOpenIndex = rawText.search(/<maintext(?:\s[^>]*)?>/i);
  const optionIndex = rawText.search(/<option(?:\s[^>]*)?>/i);
  const hasClosedOption = /<option(?:\s[^>]*)?>[\s\S]*?<\/option\s*>/i.test(rawText);
  const hasClosedSummary = /<sum(?:\s[^>]*)?>[\s\S]*?<\/sum\s*>/i.test(rawText);
  if (optionIndex <= mainOpenIndex || !hasClosedOption || !hasClosedSummary) {
    return { text: rawText, repairedTags: [] };
  }

  return {
    text: `${rawText.slice(0, optionIndex).trimEnd()}\n</maintext>\n${rawText.slice(optionIndex)}`,
    repairedTags: ['maintext'],
  };
}

export function createOutputProtocol(options: ValidationOptions = {}) {
  const {
    requiredTags = ['maintext', 'option', 'sum'],
    requireMinOptions = 2,
    validateVarsJson = true,
    checkUnclosedTags = true,
    allowedTags = Array.from(DEFAULT_ALLOWED_TAGS),
  } = options;

  const allowedSet = new Set(allowedTags);

  function validate(rawText: string, parsed: ParsedContent): ValidationError[] {
    const errors: ValidationError[] = [];
    if (/(^|[^\\])\\(?:r\\n|n)(?:对话|场景|音乐|认知|dialogue|scene)\|/u.test(parsed.maintext ?? '')) {
      errors.push({ code: 'ESCAPED_INSTRUCTION_NEWLINE', message: '指令之间必须使用真实换行，不能把字面量\\n和下一条指令写进台词。', tag: 'maintext' });
    }
    const dialogueEscape = (parsed.maintext ?? '').split(/\r?\n/).some(line => {
      const type = line.split('|')[0]?.trim().toLowerCase();
      if (!['对话', 'dialog', 'dialogue'].includes(type)) return false;
      const text = line.split('|').slice(3).join('|');
      return hasDialogueEscapeArtifact(text);
    });
    if (dialogueEscape) {
      errors.push({ code: 'ESCAPED_DIALOGUE_NEWLINE', message: '对话中包含未渲染的字面量\\n或\\r，请使用真实换行。', tag: 'maintext' });
    }

    // 1. 必填标签检查
    for (const tag of requiredTags) {
      switch (tag) {
        case 'maintext':
          if (!parsed.maintext || parsed.maintext.trim().length === 0) {
            errors.push({ code: 'MISSING_MAINTEXT', message: '缺少 <maintext> 或内容为空', tag });
          } else if (!maintextToScene(parsed.maintext).lines.some(line => line.text.trim())) {
            errors.push({ code: 'EMPTY_PLAYABLE_SCENE', message: 'maintext必须包含实际可播放的对话或旁白；场景、音乐和observe面板不能代替正文。', tag });
          }
          break;
        case 'option': {
          const opts = parsed.options || [];
          if (opts.length < requireMinOptions) {
            errors.push({
              code: 'INSUFFICIENT_OPTIONS',
              message: `<option> 至少需要 ${requireMinOptions} 项,当前 ${opts.length} 项`,
              tag,
            });
          }
          break;
        }
        case 'sum':
          if (!parsed.summary || parsed.summary.trim().length === 0) {
            errors.push({ code: 'MISSING_SUM', message: '缺少 <sum> 或内容为空', tag });
          }
          break;
        case 'vars':
          if (!parsed.vars || Object.keys(parsed.vars).length === 0) {
            errors.push({ code: 'MISSING_VARS', message: '缺少 <vars> 或内容为空', tag });
          }
          break;
      }
    }

    // 2. vars 必须是合法 JSON(且为对象)
    if (validateVarsJson && rawText.includes('<vars>')) {
      const match = rawText.match(/<vars>([\s\S]*?)<\/vars>/);
      if (match) {
        const content = match[1].trim();
        if (content) {
          try {
            const parsedVars = JSON.parse(content);
            if (parsedVars !== null && typeof parsedVars === 'object' && !Array.isArray(parsedVars)) {
              // OK
            } else {
              errors.push({
                code: 'VARS_NOT_OBJECT',
                message: '<vars> 必须是一个 JSON 对象,例如 {"stamina": 90}',
                tag: 'vars',
              });
            }
          } catch {
            errors.push({
              code: 'VARS_INVALID_JSON',
              message: '<vars> 内容不是合法 JSON',
              tag: 'vars',
            });
          }
        }
      }
    }

    // 3. 未闭合标签检查
    if (checkUnclosedTags) {
      const openMatches = Array.from(rawText.matchAll(/<([a-zA-Z][a-zA-Z0-9]*)(?:\s[^>]*)?>/g));
      const closeMatches = new Set(
        Array.from(rawText.matchAll(/<\/([a-zA-Z][a-zA-Z0-9]*)>/g)).map(m => m[1])
      );
      const stack: string[] = [];
      for (const m of openMatches) {
        const tag = m[1];
        if (!allowedSet.has(tag)) continue; // 未知标签不检查闭合
        if (tag === 'vars' || tag === 'thinking' || tag === 'think') {
          // 这些标签不允许嵌套,简单检查是否有关闭标签
          if (!closeMatches.has(tag)) {
            errors.push({ code: 'UNCLOSED_TAG', message: `<${tag}> 缺少闭合标签`, tag });
          }
        } else {
          stack.push(tag);
        }
      }
      // 简化检查:所有允许标签都应有闭合
      for (const tag of allowedSet) {
        if (tag === 'vars' || tag === 'thinking' || tag === 'think') continue;
        const openCount = (rawText.match(new RegExp(`<${tag}\\b`, 'g')) || []).length;
        const closeCount = (rawText.match(new RegExp(`<\\/${tag}>`, 'g')) || []).length;
        // 多余的闭合标签无害（解析器会忽略），只有缺闭合才可能丢内容
        if (openCount > closeCount && openCount > 0) {
          errors.push({
            code: 'MISMATCHED_TAG',
            message: `<${tag}> 开启(${openCount})与闭合(${closeCount})数量不匹配`,
            tag,
          });
        }
      }
    }

    // 4. investigate / action 项格式检查
    if (parsed.investigateItems) {
      for (let i = 0; i < parsed.investigateItems.length; i++) {
        const item = parsed.investigateItems[i];
        if (!item.desc) {
          errors.push({
            code: 'INVESTIGATE_MISSING_DESC',
            message: `第 ${i + 1} 条调查项缺少描述`,
            tag: 'investigate',
          });
        }
      }
    }
    if (parsed.actionItems) {
      for (let i = 0; i < parsed.actionItems.length; i++) {
        const item = parsed.actionItems[i];
        if (!item.desc) {
          errors.push({
            code: 'ACTION_MISSING_DESC',
            message: `第 ${i + 1} 条行动项缺少描述`,
            tag: 'action',
          });
        }
      }
    }

    // 5. maintext 行指令基本检查
    if (parsed.maintext) {
      const lines = parsed.maintext.split('\n').filter(l => l.trim());
      const invalidLines = lines.filter(line => {
        const type = line.split('|')[0]?.trim();
        // Keep validation in lockstep with scene-parser.ts. OpenAI-compatible
        // models sometimes follow the documented English aliases even when
        // the surrounding prompt is Chinese; the parser already accepts
        // these forms, so rejecting them here creates a false recovery state.
        return ![
          '场景', 'scene',
          '音乐', 'bgm', 'music',
          '对话', 'dialog', 'dialogue',
          '镜头',
          '效果', 'effect',
          '动作', 'animation',
          '认知', 'knowledge',
        ].includes(type.toLowerCase());
      });
      if (invalidLines.length > 0) {
        errors.push({
          code: 'MAINTEXT_INVALID_LINES',
          message: `<maintext> 中包含 ${invalidLines.length} 行无法识别的行指令：${invalidLines.slice(0, 5).map(line => JSON.stringify(line.slice(0, 200))).join('；')}。使用场景、音乐、对话、镜头、效果、动作或认知指令；立绘由对话行自动选择，不支持单独的角色指令。`,
          tag: 'maintext',
        });
      }
    }

    return errors;
  }

  return { validate };
}

export const DEFAULT_PROTOCOL = createOutputProtocol();

export function formatValidationErrors(errors: ValidationError[]): string {
  return errors.map(e => `• ${e.message}`).join('\n');
}
