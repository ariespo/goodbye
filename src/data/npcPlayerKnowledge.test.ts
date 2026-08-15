import { describe, expect, it } from 'vitest';
import {
  buildNpcPlayerKnowledgeBrief,
  doesPlayerIntroduceName,
  npcPlayerKnowledgeError,
  resolveNpcPlayerKnowledge,
} from './npcPlayerKnowledge';

const identity = { name: '张明', gender: 'male' as const };

describe('NPC knowledge of player identity', () => {
  it('gives established relationships distinct natural forms of address', () => {
    expect(resolveNpcPlayerKnowledge('fumi', identity).allowedAddress).toBe('张明');
    expect(resolveNpcPlayerKnowledge('touko', identity).allowedAddress).toBe('张明');
    expect(resolveNpcPlayerKnowledge('chen-huihui', identity).allowedAddress).toBe('张哥');
    expect(resolveNpcPlayerKnowledge('old-man', identity).allowedAddress).toBe('小张');
  });

  it('uses the first grapheme for a Latin nickname', () => {
    const latinIdentity = { name: 'CC', gender: 'female' as const };
    expect(resolveNpcPlayerKnowledge('chen-huihui', latinIdentity).allowedAddress).toBe('C姐');
    expect(resolveNpcPlayerKnowledge('old-man', latinIdentity).allowedAddress).toBe('小C');
    expect(resolveNpcPlayerKnowledge('detective-b', latinIdentity).allowedAddress).toBe('你');
  });

  it('keeps strangers from knowing the name until explicitly recorded', () => {
    const undercover = resolveNpcPlayerKnowledge('detective-b', identity);
    expect(undercover.knowsPlayerName).toBe(false);
    expect(undercover.actualKnowledgeScope).toBe('full-name');
    expect(undercover.expressibleKnowledgeScope).toBe('unknown');
    expect(resolveNpcPlayerKnowledge('detective-b', identity, {
      playerNameKnownByNpcIds: ['detective-b'],
    }).allowedAddress).toBe('张明');
  });

  it('lets the teacher use a formal guardian-contact address without granting family secrets', () => {
    const teacher = resolveNpcPlayerKnowledge('liu-renguang', identity);
    expect(teacher.allowedAddress).toBe('张先生');
    expect(teacher.knowledgeScope).toBe('guardian-formal');
  });

  it('recognizes an explicit self-introduction but not a refusal to share the name', () => {
    expect(doesPlayerIntroduceName('我叫张明，是来找人的。', identity)).toBe(true);
    expect(doesPlayerIntroduceName('先自我介绍，再询问值班记录。', identity)).toBe(true);
    expect(doesPlayerIntroduceName('我不想告诉她我的名字。', identity)).toBe(false);
  });

  it('rejects an unknown NPC saying the player name but permits established addresses', () => {
    const briefs = buildNpcPlayerKnowledgeBrief(['detective-b', 'chen-huihui'], identity);
    expect(npcPlayerKnowledgeError([
      { speaker: '新来的护士', text: '张明，请在这里登记。' },
    ], identity, briefs)).toContain('不知道玩家姓名');
    expect(npcPlayerKnowledgeError([
      { speaker: '新来的护士', text: '{{user}}，请在这里登记。' },
    ], identity, briefs)).toContain('不知道玩家姓名');
    expect(npcPlayerKnowledgeError([
      { speaker: '店员', text: '张、张哥，欢迎光临……吃吃。' },
    ], identity, briefs)).toBeNull();
  });
});
