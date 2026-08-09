export interface CharacterCatalogEntry {
  id: string;
  file: string;
  displayName: string;
  description: string;
  tags: string[];
}

export const characterCatalog: CharacterCatalogEntry[] = [
  {
    id: 'old-man-normal',
    file: 'old-man-normal.png',
    displayName: '独居老头周德明',
    description: '笑眯眯分糖果的老头，表面慈祥。',
    tags: ['old-man', 'normal'],
  },
  {
    id: 'old-man-happy',
    file: 'old-man-happy.png',
    displayName: '周德明慈祥表情',
    description: '用于伪装亲切、诱导玩家或文穗放松警惕。',
    tags: ['old-man', 'happy'],
  },
  {
    id: 'detective-a-normal',
    file: 'detective-a-normal.png',
    displayName: '侦探A赵刚',
    description: '消瘦、寸头、不合身风衣，直觉上最可疑。',
    tags: ['detective-a', 'normal'],
  },
  {
    id: 'detective-a-sad',
    file: 'detective-a-sad.png',
    displayName: '侦探A慌乱',
    description: '失手后或被逼问时的慌乱状态。',
    tags: ['detective-a', 'sad', 'panic'],
  },
  {
    id: 'detective-b-normal',
    file: 'detective-b-normal.png',
    displayName: '侦探B林静',
    description: '冷静女性，负责统筹与决策。',
    tags: ['detective-b', 'normal'],
  },
  {
    id: 'detective-b-angry',
    file: 'detective-b-angry.png',
    displayName: '侦探B冷怒',
    description: '计划失控或压制侦探A时的冷怒表情。',
    tags: ['detective-b', 'angry'],
  },
  {
    id: 'chen-huihui-normal',
    file: 'chen-huihui-normal.png',
    displayName: '便利店员陈慧慧',
    description: '不擅长和人打交道的便利店员。固定的笑容让人不舒服，但她本意并非恶意。',
    tags: ['clerk', 'chen-huihui', 'normal'],
  },
  {
    id: 'liu-renguang-normal',
    file: 'liu-renguang-normal.png',
    displayName: '体育老师刘仁光',
    description: '在中学任教的体育老师。外表自信而令人不安，曾因越界的肢体接触被投诉。',
    tags: ['teacher', 'liu-renguang', 'normal'],
  },
  {
    id: 'fumi-gone',
    file: 'fumi-gone.png',
    displayName: '文穗不在场',
    description: '空椅子暗示，表示文穗缺席的位置。',
    tags: ['fumi', 'absence'],
  },
  {
    id: 'fumi-silhouette',
    file: 'fumi-silhouette.png',
    displayName: '文穗剪影',
    description: '结局、幻觉或记忆回放中的半透明形态。',
    tags: ['fumi', 'silhouette', 'ending'],
  },
  {
    id: 'fumi-child',
    file: 'fumi-child.png',
    displayName: '幼年文穗',
    description: '孤儿院时期的小文穗，适合老照片或闪回。',
    tags: ['fumi', 'child', 'flashback'],
  },
  {
    id: 'touko-half-closed',
    file: 'touko-half-closed.png',
    displayName: '灯织半眯眼',
    description: '观察玩家时的标志性表情。',
    tags: ['touko', 'observe'],
  },
];

export function getCharacterPromptCatalog(): string {
  return characterCatalog
    .map(character => `- ${character.id}: ${character.displayName} (${character.file}) - ${character.description}`)
    .join('\n');
}
