import type { MysteryOverlayId, MysteryRouteId } from '../agents/mystery/types';

/** Shared by story availability and program-owned conclusion checks. */
export const ROUTE_SUPPORT_FACTS: Record<MysteryRouteId, string[]> = {
  A: ['a-orphanage-contact', 'a-sacrifice-list', 'a-lured-inside'],
  B: ['shared-detective-tail', 'b-commission-message', 'b-water-tower-blood', 'b-detective-coverup'],
  C: ['shared-male-leave-call', 'c-player-made-leave-call', 'c-night-gap-record'],
  NONE: ['none-letter-bedroom', 'none-letter-water-tower', 'none-letter-door-gap', 'none-railing-maintenance', 'shared-itinerary-crosscheck'],
  FAKE: ['fake-body-mismatch', 'fake-misidentification-chain', 'fake-postdeath-sighting'],
};

export const FAKE_PREPARATION_FACTS = ['fake-alias-ticket', 'fake-empty-savings', 'fake-touko-request'];

export const ROUTE_CAUSAL_FACTS: Record<MysteryRouteId, string[]> = {
  A: ['a-window-transfer-match'],
  B: ['b-contact-injury-match'],
  C: ['c-domestic-injury-match'],
  NONE: ['none-unassisted-fall-record'],
  FAKE: ['fake-verified-survival'],
};

export const SOLUTION_FACTS: Record<MysteryRouteId | MysteryOverlayId, string> = {
  A: 'a-murder-staged-fall', B: 'b-accidental-killing', C: 'c-player-killed-fumi',
  NONE: 'none-accidental-goodbye', FAKE: 'fake-staged-death-escape',
  CULT: 'cult-sacrifice-powers-loop', PSYCH: 'psych-investigation-is-episode',
};

export const OVERLAY_BASE_ROUTES: Record<MysteryOverlayId, MysteryRouteId> = { CULT: 'A', PSYCH: 'C' };

export const OVERLAY_EVIDENCE_FACTS: Record<MysteryOverlayId, string[]> = {
  CULT: ['cult-symbol-sun-room', 'cult-rain-death-pattern', 'cult-old-man-ageless', 'cult-old-man-remembers-loop'],
  PSYCH: ['psych-receipt-year-drift', 'psych-doctor-badge', 'psych-window-without-street', 'psych-medication-label'],
};

/** These are rules for interpreting disclosed evidence, never undisclosed answers. */
export const STORY_WORLD_CONTRACT = `[世界与证据规则]
- 多条主路线是互斥的故事版本。锁线前已展示的材料、言语和观察在各版本都须成立；锁线只确定此后展开的版本，不能改写先前观察或让玩家的怀疑改变过去。
- 嫌疑只影响调查关注，不证明罪行，不决定证据是否存在。尚未获准的事实是玩家未知，不能表述为尚未发生；角色以当前下发的事实与公开身份应对。
- 始终区分“某人这样说”“记录这样写”“据此怀疑”与“已独立核实”。保留来源、日期、身份、肯定程度和未核实项。相似身影不等于本人，通报时间不等于死亡时间，旅行准备不等于实际成行，记忆或症状不等于犯罪证据。
- 16:00的程序事件仅确认初步死亡通报送达。身份、死亡时刻、原因与责任需要分别调查，不能由通报自动补齐。
- 结论需把已获准材料按因果相连，指出能排除什么、还不能排除什么。排他性的伤情鉴定、事故经过和身份认证只能在对应版本授权后出现。
- 解释层只能解释其主路线；不得用梦境、治疗或超自然设定撤销已经确认的行为、死亡事实和责任。别的版本的结局记忆不能充当当前版本的证据。
- 循环首先是玩家经历；在对应解释获准前，不把客观时间倒流或全部世界虚构写成旁白定论。文穗的事前便条与自述证明她曾表达的意愿，不能证明她现在活着。`;
