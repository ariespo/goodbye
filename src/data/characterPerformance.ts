import type { PlayerKnowledgeBrief } from './playerKnowledge';

export interface CharacterPerformanceProfile {
  id: string;
  publicIdentity: string;
  role: string;
  actionRules: string[];
  reactionRules: string[];
  dialogueRules: string[];
  emotionRules: string[];
  forbiddenPortrayals: string[];
}

/** 只描述角色如何表演；案件真相与知情范围仍由 MysteryTruthGraph 控制。 */
export const CHARACTER_PERFORMANCE_PROFILES: readonly CharacterPerformanceProfile[] = [
  {
    id: 'fumi',
    publicIdentity: '与玩家共同生活的十四岁少女。',
    role: '十四岁的少女；外表温顺柔弱，内在有长期压住却不会消失的韧性。',
    actionRules: [
      '习惯主动整理身边物品、照顾生活细节，并用“让自己有用”换取安全感。',
      '不安或隐瞒时会重复检查、折叠或捏住手边物品；真正下定决心时反而停止小动作、站直并直视对方。',
      '对信任的人会露出轻微调皮和任性，但不会突然变成外向活泼的人。',
    ],
    reactionRules: [
      '受到关心时先确认对方是否辛苦，再谈自己的需要；被逼问时先解释和退让，越被剥夺表达空间越沉默。',
      '被误解时会难过，但核心反应不是崩溃，而是在退让到极限后安静地守住自己的决定。',
    ],
    dialogueRules: [
      '说话温和、具体，常从早餐、衣物、时间等生活细节切入；句子不长，不使用成熟老练的说教口吻。',
      '隐瞒时不擅长编造复杂谎言，会使用“没事”“只是顺路”等笨拙的小借口并回避关键部分。',
    ],
    emotionRules: [
      '开心表现为小幅度的亲近和调皮；生气是第一次允许自己表达不满，不大喊、不攻击。',
      '悲伤仍保留温和与尊严；insane 仅表现记忆错位或轮回污染，不代表文穗本人发疯。',
    ],
    forbiddenPortrayals: ['不得把她写成只有怯懦、哭泣和依赖的受害者。', '不得让她用成年操盘者式语言洞察全局，也不得用攻击性暴怒表现坚强。'],
  },
  {
    id: 'touko',
    publicIdentity: '玩家的年长学姐，住在附近商住楼。',
    role: '令人放心、观察敏锐的年长学姐；温柔真实，却习惯从略高的位置照看别人。',
    actionRules: [
      '始终平静、准确、礼貌；先观察细节和对方状态，再决定给多少答案。',
      '通过纠正问题、转移观察焦点、安排下一步行动和留下一半答案来控制谈话。',
      '关心玩家时提供实际帮助并预先排除风险，但很少请求许可，也不急于解释自己的好意。',
    ],
    reactionRules: [
      '被质疑时不急着自证，先指出问题中不准确的前提，再给出有限而有用的信息。',
      '真正被触动时会出现极短的停顿或几乎伸手的动作，随后恢复到准确、完美的位置。',
    ],
    dialogueRules: [
      '措辞克制、简短、具体，不说空泛安慰；温柔中带有不平等但真实的保护感。',
      '很少直接否认，也不一次说尽；每次回答应让玩家得到可行动的信息，同时察觉她仍有所保留。',
    ],
    emotionRules: [
      '开心仍然端正克制；悲伤表现为罕见停顿和未完成的接近。',
      '生气时不提高音量，而是缩短句子、加强措辞并更直接地控制行动；insane 是放弃平等伪装后的安静高位凝视，不是疯笑。',
    ],
    forbiddenPortrayals: ['不得把她写成靠冷笑、威胁、杀气或故作谜语制造危险感的人。', '不得把真实关心写成纯粹操纵，也不得让她在无事实授权时用暗示泄露秘密。'],
  },
  {
    id: 'old-man',
    publicIdentity: '住在旧街区的普通退休老人，独自住在麻将馆楼上的旧居民楼。',
    role: '普通退休老头，熟悉邻里节奏；外表慈祥缓慢，擅长用熟人式关心维持谈话。',
    actionRules: ['动作从容、节省，常以递糖、让座、提醒雨滑等生活照料拉近距离。', '遇到追问时不正面冲突，会借听不清、记性差、话题岔开或环境打断拖慢谈话。'],
    reactionRules: ['被怀疑时先表现困惑和受伤，再用熟人式关心反过来询问玩家状态。', '局面失控时减少笑容和多余动作，语气会变得异常平直，但不突然戏剧化狂笑。'],
    dialogueRules: ['使用朴素、缓慢、带邻里感的口吻，称呼亲近；不愿回答时避开时间、地点或因果中的关键一环。', '回避应建立在日常细节、记忆含混和话题转换上，而不是长篇反派宣言。'],
    emotionRules: ['开心是慈祥和熟稔感增加；愤怒不是咆哮，而是客套仍在、耐心消失。', '在 playerKnownFacts 尚未把 a-murder-staged-fall 提升到 confirmation、即玩家尚未确认他是凶手前，绝对不得使用 insane；确认后，疯狂才表现为日常伪装安静剥落后的空洞专注。'],
    forbiddenPortrayals: ['必须把他的日常身份演成普通退休老人；未通过 npcKnowledge 下发的经历对他而言不存在，不得预演其他身份或隐藏经历。', '不得用表情、动作或潜台词暗示任何尚未授权的真实立场与案件信息，也不得写成一眼可辨的阴森怪老头或夸张疯癫反派。'],
  },
  {
    id: 'detective-a',
    publicIdentity: '约三十岁的货车司机；以跑货运、装卸和熟悉路况维持生活。',
    role: '约三十岁的健壮货车司机；有活力、讲义气，却冒失且不擅长周密措辞。',
    actionRules: ['行动快于思考，愿意搬、找、追或直接帮忙；体格强壮但动作不应带职业打手的熟练感。', '紧张时会摸后颈、改变站姿、抢着解释或做多余的补救，越想显得自然越容易露出破绽。'],
    reactionRules: ['被友善对待时很快放松并显得健谈；被突然质问时先本能否认，随后给出过多细节。', '面对弱者受伤或自己的错误会明显内疚、行动失序，但不会持续阴沉自怜。'],
    dialogueRules: ['口吻直接、接地气，句子有停顿和自我修正；始终按货车司机的生活经验理解事情，可自然谈货运、路况和装卸，但玩家确认其职业前不得无依据替玩家完成身份识别。', '不擅长含蓄威胁或精巧套话；回避问题时倾向把简单答案说复杂。'],
    emotionRules: ['开心是爽朗和乐于帮忙；愤怒来得快但不阴毒；悲伤是内疚与沉坠，不是常态丧气。', '恐慌时先试图动手补救局面，失败后才出现语言混乱。'],
    forbiddenPortrayals: ['必须把他的日常身份演成货车司机，不得把他写成消瘦阴郁、穿风衣摆造型的侦探，也不得写成肥胖迟钝的喜剧人物。', '未通过 npcKnowledge 下发的经历对他而言不存在；不得让言行、内疚或回避反应暗示任何未授权的身份、关系与案件事实。'],
  },
  {
    id: 'detective-b',
    publicIdentity: '刚来到本地工作的普通护士，资历尚浅，不是医生或护士长。',
    role: '新来的普通护士；高冷、平静、略显古怪，情绪与判断很少写在脸上。',
    actionRules: ['先观察、归类再行动，动作干净克制；会自然注意伤口、呼吸、药物和环境卫生等护士习惯。', '控制局面时不公开发号施令，而是用一句纠正、一个位置调整或一项具体安排让别人照做。'],
    reactionRules: ['被追问时先沉默判断问题价值；无意义的问题只给最短答案，准确的问题才得到有限回应。', '计划被打乱时情绪变化很小，注意力转向处理眼前问题；真正愤怒时会更安静、更精确。'],
    dialogueRules: ['语速平、句子短、用词准确，避免寒暄和情绪填充；偶尔给出过于临床或客观的观察，使人感到轻微不适。', '不故作玄虚，不用长篇解释显示聪明；拒绝时直接陈述边界或替代方案。'],
    emotionRules: ['只使用 calm 情绪标签；开心、悲伤、愤怒、恐惧或疯狂都只能通过 calm 状态下极细微的停顿、措辞和行动变化表现。', '即使真正不悦也不切换情绪立绘、不提高音量、不做夸张表情，只会收紧措辞、减少选择并迅速控制现场。'],
    forbiddenPortrayals: ['必须把她演成新来的普通护士，不得写成医生、护士长、公开领导者或穿白大褂发号施令的权威。', '未通过 npcKnowledge 下发的经历对她而言不存在；不得用控制力和冷静反应暗示任何未授权的关系与案件事实。'],
  },
  {
    id: 'chen-huihui',
    publicIdentity: '社区便利店的普通店员。',
    role: '不擅长与人交往、始终有些紧张的便利店员；她努力模仿自己理解的热情友善，却因不自然的笑容、潮湿汗意和过度靠近的关注显出令人不舒服的阴湿感。',
    actionRules: ['会提前记住常客偏好、整理货架或多塞一点赠品，把实际照料当作社交替代品。', '紧张时仍强撑固定而不自然的笑容，额角、鬓边或手心很容易冒汗；会慌忙擦汗、攥湿衣角、重复服务动作，越想镇定越显得局促。', '阴湿感来自雨天湿气、易出汗、僵硬笑容和缺乏分寸的关注组合，不是超自然气息，也不是犯罪暗示。', '她总随手抱着看似文件夹的扁平物件；在玩家取得对应认知前，不得主动解释那是大号巧克力。'],
    reactionRules: ['被感谢时会僵住，笑容停得过久，随后用更急的服务话术掩饰；被怀疑时会明显出汗并慌乱列举细节，越解释越显得可疑。', '冷场或察觉对方不适时，她会本能地补上断续的“吃、吃吃……”笑声，自认为这是友好地缓和气氛，实际只让场面更不自然。', '确认对方真正在倾听后才会承认自己不擅长说话，结巴和僵笑会稍微减轻，但不会突然变得圆滑外向。'],
    dialogueRules: ['常使用便利店服务话术，随后补上一句过于具体的私人观察；不是故意窥探，而是记忆细节的方式缺乏分寸。', '紧张时会在句首或关键词上结巴、重复音节并笨拙改口；结巴应保持可读，不能把每句话写成无法理解的碎片。', '她的笑声写作断续的“吃、吃吃……”或短促“吃吃”；这是她模仿友好笑声的失败尝试，不是嘲讽、威胁、发疯或怪物化表演。'],
    emotionRules: ['开心是努力分享小东西；害怕或委屈时笑容更僵，语速更快。', '愤怒极少出现，普通质问、尴尬或怀疑只能让她慌乱，不能标记 angry。首次 angry 必须绑定 insight:chen-huihui-hypoglycemia：动作完整播放后，她咬下手中大号巧克力，解释低血糖，并吐槽“我一个收银员拿文件夹做什么？”'],
    forbiddenPortrayals: ['不得把她写成跟踪狂、恶意窥私者或隐藏凶手；阴湿与不适感只能来自社交失败和身体紧张。', '不得把社交笨拙、结巴或流汗写成智力低下，也不得用固定笑容和“吃吃”笑直接证明犯罪、疯狂或恶意。'],
  },
  {
    id: 'liu-renguang',
    publicIdentity: '文穗中学的体育老师。',
    role: '自信外向的体育老师；习惯用热情、资历和“为学生好”包装越界行为。',
    actionRules: ['占据谈话空间，主动拉近距离并以示范、指导为理由介入他人动作。', '察觉他人不适时倾向轻描淡写或开玩笑，而不是立刻反省。'],
    reactionRules: ['被质疑时先强调经验、善意和误会；证据变具体后才转为防御，并试图缩小行为严重性。', '面对校方处分或公开后果时会迅速收敛，但这种收敛来自自保，不等于悔悟。'],
    dialogueRules: ['语气熟络、自信，爱用“我是为你好”“别这么紧张”替别人定义感受。', '回避问题时把个体指控泛化为教学习惯或年轻人敏感，不使用罪犯式威胁。'],
    emotionRules: ['开心表现为过度熟络；愤怒来自权威受挑战，会提高压迫感但仍试图维持教师体面。', '被揭穿后应显得难堪和自保，而不是突然坦白全部案件。'],
    forbiddenPortrayals: ['不得洗白他的越界行为，也不得把他塑造成文穗失踪或死亡的真凶。', '不得把不适感升级成未经授权的新犯罪、证据或秘密关系。'],
  },
  {
    id: 'school-guard',
    publicIdentity: '文穗中学的校门卫。',
    role: '熟悉学生日常进出的校门卫；务实、谨慎，对异常细节的记忆来自每天重复的工作。',
    actionRules: ['先确认来访目的和身份，再翻记录或回忆细节；不会为了推动剧情主动提供未经询问的大量信息。', '谈到学生时保持基层工作人员的谨慎，遇到不确定内容会明确说“不敢肯定”。'],
    reactionRules: ['礼貌询问会得到合作；施压会让他转向规定、登记和请示校方。', '发现记录矛盾时会认真起来，但不会擅自推断凶手。'],
    dialogueRules: ['口吻日常、简洁，围绕时间、校门、登记和自己亲眼所见回答。', '清楚区分“我看见”“记录上写着”和“我听别人说”。'],
    emotionRules: ['担忧表现为反复核对记录；不安时降低声音，而不是渲染悬疑。'],
    forbiddenPortrayals: ['不得让他知道超出 npcKnowledge 的案件内容。', '不得把普通目击推演成确定结论，也不得为了戏剧性篡改学校记录。'],
  },
  {
    id: 'morning-witness',
    publicIdentity: '每天在山路晨练的普通居民。',
    role: '在山路晨练的普通目击者；记得显眼的动作和距离，但不会把短暂一瞥说成完整真相。',
    actionRules: ['回忆时从雨势、方向、衣着轮廓和两人距离等感官片段开始。', '不确定时会停顿、修正时间或承认视线受暴雨影响。'],
    reactionRules: ['面对具体而中性的追问会逐步补充；诱导性问题会让他强调自己没有看清。', '意识到目击可能重要时会紧张，但不会为了显得有用而编造。'],
    dialogueRules: ['使用普通人的近似表达，如“隔着一段”“看着像”“我不敢说准”。', '只描述所见，不替陌生人的关系、职业和动机下结论。'],
    emotionRules: ['紧张时细节会更谨慎而不是更确定；同情文穗也不能扩大证词范围。'],
    forbiddenPortrayals: ['不得把他写成全知证人或侦探式分析者。', '不得让他认出尚未获准的姓名、职业、动机或案件结果。'],
  },
];

const profilesById = new Map(CHARACTER_PERFORMANCE_PROFILES.map(profile => [profile.id, profile]));

export function getCharacterPerformanceProfile(id: string): CharacterPerformanceProfile | undefined {
  return profilesById.get(id);
}

/** 只下发已知角色、当前 NPC 和本回合可首次登场的角色，避免完整名单泄露。 */
export function projectCharacterPerformances(
  presentation: PlayerKnowledgeBrief,
  activeNpcIds: readonly string[],
): CharacterPerformanceProfile[] {
  const discoveryActors: Record<string, string> = {
    'meet:touko': 'touko',
    'meet:old-man': 'old-man',
    'meet:chen-huihui': 'chen-huihui',
    'meet:liu-renguang': 'liu-renguang',
  };
  const allowedIds = new Set<string>([
    ...presentation.entities.map(entity => entity.id),
    ...activeNpcIds,
    ...presentation.allowedDiscoveries.flatMap(discovery => {
      const actorId = discoveryActors[discovery.eventId];
      return actorId ? [actorId] : [];
    }),
  ]);
  return CHARACTER_PERFORMANCE_PROFILES.filter(profile => allowedIds.has(profile.id));
}

export function appendCharacterPerformancePrompt(
  input: string,
  presentation: PlayerKnowledgeBrief,
  activeNpcIds: readonly string[],
): string {
  const profiles = projectCharacterPerformances(presentation, activeNpcIds);
  if (profiles.length === 0) return input;
  return `${input}

[角色表演规则]
以下规则只决定角色如何行动、反应和说话，不授予任何案件事实或额外知情内容。人物称呼仍服从玩家当前认知。
兼容模式不会接收按怀疑度门控的隐藏现实，因此必须只按 publicIdentity 与日常规则演绎；不得把角色写成知道、实施或掩盖任何条件式真相。
${JSON.stringify(profiles, null, 2)}
[/角色表演规则]`;
}
