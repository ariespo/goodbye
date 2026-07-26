import type { ParsedContent } from './types';

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

    // 1. 必填标签检查
    for (const tag of requiredTags) {
      switch (tag) {
        case 'maintext':
          if (!parsed.maintext || parsed.maintext.trim().length === 0) {
            errors.push({ code: 'MISSING_MAINTEXT', message: '缺少 <maintext> 或内容为空', tag });
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
        return !['场景', '音乐', '对话', '镜头', '效果', '动作', '认知'].includes(type);
      });
      if (invalidLines.length > 0) {
        errors.push({
          code: 'MAINTEXT_INVALID_LINES',
          message: `<maintext> 中包含 ${invalidLines.length} 行无法识别的行指令`,
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
