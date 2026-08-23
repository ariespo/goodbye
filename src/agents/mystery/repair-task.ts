import type { DirectorPlan, FactReview, FactReviewViolation } from './types';
import type { ValidationError } from '../../sillytavern/output-protocol';

export type RepairFailedStage =
  | 'hard-review'
  | 'semantic-review'
  | 'pacing-review'
  | 'semantic-pacing-review';

const STAGE_LABEL: Record<RepairFailedStage, string> = {
  'hard-review': '硬审查',
  'semantic-review': '语义事实复核',
  'pacing-review': '节奏与玩家能动性复核',
  'semantic-pacing-review': '语义或节奏复核',
};

const DIRECTOR_REPAIR_HARD_RULES = `修复时必须遵守：
- knowledgeEvents 只能列出本回合确定会触发、且正文会展示充分 evidence 的事件；不要列出“不触发”“暂不触发”或仅作候选的事件。
- revelations 与 knowledgeEvents 完全独立。F001/F002 等案件事实只属于 revelations，不能为它新增、猜测或捏造 knowledgeEvent；若 allowedDiscoveries 为空，knowledgeEvents 必须为空。
- red-herring 只能保持为明确的猜测，不得改写成 NPC 亲眼见闻、环境事实或可靠证据。
- red-herring 若没有 deliveryNpcIds，必须从所有 NPC 台词、回忆和目击 beat 中彻底删除；不得以“好像”“不敢说准”等降调措辞保留。
- dialogue revelation 只有在该事实 deliveryNpcIds 明列对应 speakerId 时才允许。若玩家已持有某事实、但在场 NPC 无讲述权，只能通过玩家出示的物证、记录或 narration/object/environment 重述；绝不能让 NPC 代替证据宣布结论。
- speakerId 必须逐字复制 npcKnowledge[].npcId，不得使用简称、显示名或同义 ID。
- saturationPivot 存在时不可删除或软化：先完整响应 blockedActorId 的原调查，再由 interveningNpcId 在后续独立 beat 自然介入并以 dialogue 揭示 factId。正文只写获准事实，不得直说 redirectedActorId 内部 ID 或补写因果；状态归属由程序处理，不得继续增加 blockedActorId 的嫌疑。
- beat/台词中的结论层级不得高于 revelations。若玩家明确提出凶手、手法等 confirmation 结论，且 brief 允许 confirmation，就必须把对应事实登记为 confirmation；否则必须删掉或降级该结论台词，不能保留指控再只申请 hint。
- stance=lies-about 的 confirmation 不得被修成“证据压力下被迫承认”。用 narration/object/environment 让证据链独立确认，NPC 可平静否认。若确认会解锁 insane，必须先有一个明确的外部证据确认 beat，再在后续独立 beat 安排；否则删除 insane。
- confirmation beat 必须写出 revealOptions.confirmation 已授权的因果。对 playerKnownFacts 已有的 clue，直接写“复核该已知 clue 并与其他已知 clue 合并”即可；不得为了具体化而补造 revealOptions/playerKnownFacts 未定义的脚印、杯痕、录像、证人、检验结果或第三方痕迹。
- 对 lies-about 角色，即使外部证据已经 confirmation，也不要替角色编写含蓄自白或邪恶格言。禁止“你什么都不知道”“她去了该去的地方”“别管闲事”等暗示性台词，以及沉默后默认承认。只能明确否认、声称证据解释错误、普通拒答，或完全不安排该角色发言。
- routeMode 已锁定、allowConfirmation=true 且玩家明确要求用既有 clue 确认真相时，必须使用 usableFacts 允许的 confirmation 收束；禁止降回 hint/clue，禁止新增“巧合、他人布置、缺少未知物证”等替代解释来人为续悬念。
- 当 NPC stance 为 lies-about 时，只能让其平静否认、给出获准的替代说法或拒答；不得用沉默、僵硬、视线转移、笑容消失、异常平直的语气、保留证物等动作暗示其知道事实。除非该 solution 已获 confirmation，否则宁可删除反应 beat。
- corrections 中只有与已批准约束一致的要求才可执行；已批准约束与硬规则优先。删除违规 beat/台词优先于换一种措辞保留同一泄密。
- 对 ungrounded-past-claim 或 unknown-fact，必须从 turnGoal、beats、optionIntents、scenePlan 和 revelations 中删除同一虚构信息，不能只清空 factId 或 revelations 后保留其语义。若玩家追问的旧事没有授权来源，就让 NPC 明确说不知道、记不清，或把互动转回当下；不要为了满足问题而编造答案。`;

export function formatViolationResidual(violation: Pick<FactReviewViolation, 'code' | 'message' | 'factId'>): string {
  const fact = violation.factId ? ` (${violation.factId})` : '';
  return `${violation.code}${fact}: ${violation.message}`;
}

export function mergeRepairResiduals(
  prior: FactReviewViolation[],
  next: FactReviewViolation[],
): FactReviewViolation[] {
  const seen = new Set(prior.map(formatViolationResidual));
  const merged = [...prior];
  for (const item of next) {
    const key = formatViolationResidual(item);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return merged;
}

export function buildDoNotRepeatBlock(
  violations: Array<Pick<FactReviewViolation, 'code' | 'message' | 'factId'>>,
  priorResiduals: Array<Pick<FactReviewViolation, 'code' | 'message' | 'factId'>> = [],
): string {
  const current = violations.map(formatViolationResidual);
  const prior = priorResiduals.map(formatViolationResidual);
  const lines = [
    '不得再次出现下列违规；重复同一 code/message 视为本次修复失败，而不是一次新的采样。',
    ...current.map(item => `- ${item}`),
  ];
  if (prior.length > 0) {
    lines.push('先前失败残留也不得再次出现：');
    lines.push(...prior.map(item => `- ${item}`));
  }
  return lines.join('\n');
}

export function formatProtocolErrorResidual(error: Pick<ValidationError, 'code' | 'message'>): string {
  return `${error.code}: ${error.message}`;
}

export function mergeProtocolRepairResiduals(
  prior: ValidationError[],
  next: ValidationError[],
): ValidationError[] {
  const seen = new Set(prior.map(formatProtocolErrorResidual));
  const merged = [...prior];
  for (const item of next) {
    const key = formatProtocolErrorResidual(item);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return merged;
}

export function buildProtocolDoNotRepeatBlock(
  errors: ValidationError[],
  priorResiduals: ValidationError[] = [],
): string {
  const current = errors.map(formatProtocolErrorResidual);
  const prior = priorResiduals.map(formatProtocolErrorResidual);
  const lines = [
    '不得再次出现下列协议错误；修完后这些 code/message 必须消失。',
    ...current.map(item => `- ${item}`),
  ];
  if (prior.length > 0) {
    lines.push('先前失败残留也不得再次出现：');
    lines.push(...prior.map(item => `- ${item}`));
  }
  return lines.join('\n');
}

export function buildDirectorRepairTask(options: {
  rejectedPlan: DirectorPlan;
  review: FactReview;
  priorResiduals?: FactReviewViolation[];
  failedStage: RepairFailedStage;
}): string {
  const priorResiduals = options.priorResiduals ?? [];
  return `上一版导演计划未通过${STAGE_LABEL[options.failedStage]}。请对已拒绝产物做最小范围修正，只输出一个完整、合法、无 Markdown 的 JSON 对象。
这不是新的回合规划任务：不得重新制定本回合，不得根据原始导演用户提示重采样，不得改写未被 violations 点名的内容。
未点名的 turnGoal、tone、beats、revelations、optionIntents、assetRequests、knowledgeEvents、scenePlan 与 backgroundFactProposals 视为已锁定输入，默认原样保留；只改 corrections 要求的字段。
必须逐条落实 corrections。删除违规 beat/台词优先于换一种措辞保留同一泄密。

${buildDoNotRepeatBlock(options.review.violations, priorResiduals)}

${DIRECTOR_REPAIR_HARD_RULES}

[RejectedPlan]
${JSON.stringify(options.rejectedPlan, null, 2)}

[Violations]
${JSON.stringify(options.review.violations, null, 2)}

[Corrections]
${JSON.stringify(options.review.corrections, null, 2)}`;
}
