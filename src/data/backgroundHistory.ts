export const BACKGROUND_HISTORY_VERSION = 'pre-game-history-v1';

export type BackgroundFactLevel = 'fixed' | 'soft';
export type BackgroundPrivacy = 'common' | 'personal' | 'investigative';

export interface BackgroundFactRecord {
  factId: string;
  text: string;
  characterIds: string[];
  locationIds: string[];
  level: BackgroundFactLevel;
  privacy: BackgroundPrivacy;
  timeScope: 'pre-game';
  source: 'author' | 'director';
  createdTurn: number;
}

export interface NpcFactCognition {
  npcId: string;
  factId: string;
  confidence: number;
  source: 'lived-experience' | 'neighborhood-contact' | 'school-record' | 'investigation-dossier';
  expressibleUnderCover: boolean;
  expressionDepth: 'mention' | 'familiar' | 'personal' | 'full';
}

export interface BackgroundFactProposal {
  proposalId: string;
  text: string;
  characterIds: string[];
  locationIds: string[];
  knowerIds: string[];
  evidenceText: string;
}

export interface BackgroundProposalReview {
  approved: boolean;
  reason?: string;
}

export const FIXED_BACKGROUND_FACTS: readonly BackgroundFactRecord[] = [
  {
    factId: 'bg:player-fumi-family',
    text: '玩家与文穗长期共同生活；两人并非血亲，却将彼此视作家人，并且非常在乎对方。',
    characterIds: ['player', 'fumi'], locationIds: ['home'], level: 'fixed', privacy: 'personal',
    timeScope: 'pre-game', source: 'author', createdTurn: 0,
  },
  {
    factId: 'bg:fumi-caretaker-habits',
    text: '文穗年纪虽小却很会照顾人，经常担心玩家的健康、安全、作息和饮食，偶尔显露近似母性的照料感。',
    characterIds: ['player', 'fumi'], locationIds: ['home'], level: 'fixed', privacy: 'personal',
    timeScope: 'pre-game', source: 'author', createdTurn: 0,
  },
  {
    factId: 'bg:supermarket-regulars',
    text: '便利店是住处附近最近、常去的店；陈慧慧长期见过玩家与文穗，两人经常同行，彼此关系亲近。',
    characterIds: ['player', 'fumi', 'chen-huihui'], locationIds: ['supermarket'], level: 'fixed', privacy: 'common',
    timeScope: 'pre-game', source: 'author', createdTurn: 0,
  },
  {
    factId: 'bg:huihui-knows-fumi',
    text: '陈慧慧知道文穗的姓名，并与玩家、文穗有过普通的结账、招呼和少量日常交流；她不了解两人的血缘与家庭私事。',
    characterIds: ['player', 'fumi', 'chen-huihui'], locationIds: ['supermarket'], level: 'fixed', privacy: 'common',
    timeScope: 'pre-game', source: 'author', createdTurn: 0,
  },
  {
    factId: 'bg:zhou-neighbor',
    text: '周德明是附近街区的熟悉邻居，认识玩家与文穗，知道两人共同生活、关系亲近；平时会打招呼并有少量交流，但不知道非血缘关系和家庭私事。',
    characterIds: ['player', 'fumi', 'old-man'], locationIds: ['street', 'old-man-home'], level: 'fixed', privacy: 'common',
    timeScope: 'pre-game', source: 'author', createdTurn: 0,
  },
  {
    factId: 'bg:teacher-guardian-contact',
    text: '刘仁光知道文穗是自己的学生，玩家是校方记录中的家庭联系人或监护责任人；他不知道无关的家庭隐私。',
    characterIds: ['player', 'fumi', 'liu-renguang'], locationIds: ['school'], level: 'fixed', privacy: 'personal',
    timeScope: 'pre-game', source: 'author', createdTurn: 0,
  },
  {
    factId: 'bg:detective-dossier',
    text: '两名侦探在调查档案中掌握玩家与文穗的全名、住处、关系、学校、常去地点及重要熟人。该信息属于调查认知，伪装身份下不得主动表现。',
    characterIds: ['player', 'fumi', 'detective-a', 'detective-b'], locationIds: [], level: 'fixed', privacy: 'investigative',
    timeScope: 'pre-game', source: 'author', createdTurn: 0,
  },
] as const;

export const FIXED_NPC_BACKGROUND_COGNITION: readonly NpcFactCognition[] = [
  { npcId: 'fumi', factId: 'bg:player-fumi-family', confidence: 1, source: 'lived-experience', expressibleUnderCover: true, expressionDepth: 'full' },
  { npcId: 'fumi', factId: 'bg:fumi-caretaker-habits', confidence: 1, source: 'lived-experience', expressibleUnderCover: true, expressionDepth: 'full' },
  { npcId: 'touko', factId: 'bg:player-fumi-family', confidence: 1, source: 'lived-experience', expressibleUnderCover: true, expressionDepth: 'personal' },
  { npcId: 'touko', factId: 'bg:fumi-caretaker-habits', confidence: 1, source: 'lived-experience', expressibleUnderCover: true, expressionDepth: 'personal' },
  { npcId: 'chen-huihui', factId: 'bg:supermarket-regulars', confidence: 1, source: 'lived-experience', expressibleUnderCover: true, expressionDepth: 'familiar' },
  { npcId: 'chen-huihui', factId: 'bg:huihui-knows-fumi', confidence: 1, source: 'lived-experience', expressibleUnderCover: true, expressionDepth: 'familiar' },
  { npcId: 'old-man', factId: 'bg:zhou-neighbor', confidence: 1, source: 'neighborhood-contact', expressibleUnderCover: true, expressionDepth: 'familiar' },
  { npcId: 'liu-renguang', factId: 'bg:teacher-guardian-contact', confidence: 1, source: 'school-record', expressibleUnderCover: true, expressionDepth: 'familiar' },
  { npcId: 'detective-a', factId: 'bg:detective-dossier', confidence: 1, source: 'investigation-dossier', expressibleUnderCover: false, expressionDepth: 'full' },
  { npcId: 'detective-b', factId: 'bg:detective-dossier', confidence: 1, source: 'investigation-dossier', expressibleUnderCover: false, expressionDepth: 'full' },
] as const;

const FORBIDDEN_SOFT_CANON = /(?:今(?:天|早)|昨(?:天|晚)|前天|\d{1,2}\s*[:：]\s*\d{2}|不在场证明|监控|收据|小票|物证|证据|凶手|杀(?:人|害)|死亡原因|死因|伪装|侦探|血缘|亲生|收养|监护权|结婚|离婚|疾病|病史|诊断|创伤|霸凌|自杀|路线真相)/u;

export function reviewBackgroundFactProposal(proposal: BackgroundFactProposal): BackgroundProposalReview {
  if (typeof proposal?.proposalId !== 'string' || typeof proposal?.text !== 'string'
    || typeof proposal?.evidenceText !== 'string'
    || !proposal.proposalId.trim() || !proposal.text.trim() || !proposal.evidenceText.trim()) {
    return { approved: false, reason: '软设定必须包含稳定 ID、事实文本和正文证据文本。' };
  }
  if (proposal.text.length > 120 || proposal.evidenceText.length > 120) {
    return { approved: false, reason: '软设定必须是简短的日常背景。' };
  }
  if (FORBIDDEN_SOFT_CANON.test(`${proposal.text} ${proposal.evidenceText}`)) {
    return { approved: false, reason: '软设定触及案件、精确时间、身份、家庭法律关系或严重经历。' };
  }
  if (!Array.isArray(proposal.characterIds) || !Array.isArray(proposal.locationIds)
    || !Array.isArray(proposal.knowerIds)
    || proposal.characterIds.length === 0 || proposal.knowerIds.length === 0
    || [...proposal.characterIds, ...proposal.locationIds, ...proposal.knowerIds].some(id => typeof id !== 'string')) {
    return { approved: false, reason: '软设定必须明确涉及角色与知情者。' };
  }
  return { approved: true };
}

export function fixedBackgroundFactsById(): Map<string, BackgroundFactRecord> {
  return new Map(FIXED_BACKGROUND_FACTS.map(fact => [fact.factId, fact]));
}

export function relevantFixedBackgroundFacts(locationId: string, npcIds: readonly string[]): BackgroundFactRecord[] {
  const active = new Set(npcIds);
  return FIXED_BACKGROUND_FACTS.filter(fact => (
    fact.locationIds.includes(locationId)
    || fact.characterIds.some(id => active.has(id))
  ));
}
