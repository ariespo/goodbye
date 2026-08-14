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
    description: '住在旧街区的普通退休老头，笑眯眯地分糖果，熟悉邻里生活。',
    tags: ['old-man', 'normal'],
  },
  {
    id: 'old-man-happy',
    file: 'old-man-happy.png',
    displayName: '周德明慈祥表情',
    description: '用于熟人式招呼、递糖或提醒雨滑等亲切场面。',
    tags: ['old-man', 'happy'],
  },
  {
    id: 'detective-a-normal',
    file: 'detective-a-normal.png',
    displayName: '赵刚',
    description: '约三十岁的健壮男人，以货车司机身份活动；有活力却有些冒失。',
    tags: ['detective-a', 'normal'],
  },
  {
    id: 'detective-a-sad',
    file: 'detective-a-sad.png',
    displayName: '赵刚低落',
    description: '内疚或局面失控后沉坠下来，但不是常态的阴沉与丧气。',
    tags: ['detective-a', 'sad', 'panic'],
  },
  {
    id: 'detective-b-normal',
    file: 'detective-b-normal.png',
    displayName: '林静',
    description: '刚来到本地工作的普通护士，高冷平静，略显古怪。',
    tags: ['detective-b', 'normal'],
  },
  {
    id: 'chen-huihui-normal',
    file: 'chen-huihui-normal.png',
    displayName: '便利店员陈慧慧',
    description: '不擅长和人打交道的便利店员。固定的笑容让人不舒服，但她本意并非恶意。',
    tags: ['clerk', 'chen-huihui', 'normal'],
  },
  {
    id: 'chen-huihui-angry',
    file: 'chen-huihui-angry.png',
    displayName: '陈慧慧罕见的愤怒',
    description: '只用于低血糖与大号巧克力真相获准揭示的场景；不得作为普通质问的常规反应。',
    tags: ['clerk', 'chen-huihui', 'angry', 'rare'],
  },
  {
    id: 'chen-huihui-sad',
    file: 'chen-huihui-sad.png',
    displayName: '陈慧慧悲伤',
    description: '陈慧慧难以继续维持固定笑容时的悲伤姿态。',
    tags: ['clerk', 'chen-huihui', 'sad'],
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
