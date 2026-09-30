import type { RevealLevel } from './types';

// Authored delivery paths, not player knowledge. Only project after the fact's
// location, day, route and reveal-level gates pass; never send the whole table.
const PATHS: Record<string, Partial<Record<RevealLevel, Record<string, string>>>> = {
  'shared-supermarket-receipt': {
    hint: { supermarket: '玩家询问留存记录，店员从店内留存单据中取出签收底单，翻到背面供玩家查看。' },
    clue: { supermarket: '玩家询问留存记录，店员出示店内签收底单与代为保留的文穗留存联，玩家当面核对号码、日期和背面文字。' },
  },
  'shared-senpai-camera': {
    hint: { 'senpai-building': '玩家询问来访记录，灯织同意出示寄存卡，并陪玩家在楼内查阅门口影像。先呈现查阅过程，再指出日期需要核对。' },
    clue: { 'senpai-building': '灯织出示她保管的寄存卡，并陪玩家在楼内查阅门口原始影像；玩家在当前调查中对照日期与卡片文字。' },
  },
  'shared-observation-deck-plan': {
    hint: { 'observation-deck': '玩家向救援登记处申请查阅位置记录，获准查看登记材料及所附的事前路线页副本，先说明两份材料从何处取得。' },
    clue: { 'observation-deck': '玩家向救援登记处申请查阅位置记录，获准查看登记材料及所附的事前路线页副本，再逐项核对地点；副本不构成本日到场证明。' },
  },
  'a-orphanage-contact': {
    hint: {
      'water-tower': '玩家检查水塔内文穗留存的身世笔记，在夹页中看到档案借阅回条；先写翻到夹页的过程。',
      'old-man-building': '玩家询问与文穗的联系，周大爷出示文穗留下的身世笔记夹页及其中的档案借阅回条，供玩家现场阅读；出示材料不等于承认罪行。',
    },
    clue: {
      'water-tower': '玩家检查水塔内文穗留存的身世笔记，在夹页中找到她保留的孤儿院查询便笺副本和档案借阅回条，再对照内容与签名。',
      'old-man-building': '玩家询问与文穗的联系，周大爷出示保存的孤儿院查询便笺和档案借阅回条，玩家现场阅读并对照签名；出示联系材料不等于承认会面或罪行。',
    },
  },
  'b-commission-message': {
    hint: {
      'community-hospital': '玩家询问医院里遇到的女子是否在寻找文穗，经她允许查看她手机中保存的一条联络讯息；先写她翻到讯息并展示屏幕，再读获准内容。人物称呼仍按玩家已知身份。',
      'detective-inn': '玩家询问旅馆里遇到的男子为何寻找文穗，经他允许查看他手机中保存的一条联络讯息；先展示屏幕再读获准内容。人物称呼仍按玩家已知身份。',
    },
    clue: {
      'community-hospital': '玩家询问寻找文穗的缘由，经当事女子允许查看她保存的委托讯息及另一方转发的对应讯息，现场核对姓名和联络账号；须先写她同意并展示屏幕，不得虚构玩家此前已经拿到手机。',
      'detective-inn': '玩家询问寻找文穗的缘由，经当事男子允许查看他保存的委托讯息及另一方转发的对应讯息，现场核对姓名和联络账号；须先写他同意并展示屏幕，不得虚构玩家此前已经拿到手机。',
    },
  },
  'c-night-gap-record': {
    hint: {
      home: '玩家在家中打开自己的设备记录，再取出个人记事，先展示查找和翻阅过程，再比较前夜的记录。',
      'community-hospital': '玩家在医院调出随身设备保存的个人日志与记事，当前自行对照；不得让医护人员凭空宣布记录内容。',
    },
    clue: {
      home: '玩家在家中调出设备日志和个人记事，通过警方反馈取得楼道记录的封存编号后再对照；先交代查阅与反馈到达，不得把编号写成此前已知。',
      'community-hospital': '玩家调出自己的设备日志和个人记事，通过警方反馈取得楼道记录的封存编号后再对照；医院病历不能代替这些外部记录。',
    },
  },
  'none-railing-maintenance': {
    hint: { 'observation-deck': '玩家检查栏杆时先看见锚栓旁的维修编号，再向现场维护方询问并获准查看对应工单。' },
    clue: { 'observation-deck': '玩家检查栏杆时发现维修编号，向现场维护方申请查阅对应工单，拿到材料后才对照登记内容与现场状况。' },
  },
  'fake-body-mismatch': {
    atmosphere: { 'community-hospital': '玩家向医院提出身份核验请求，获准查看收到的初报转录表；先交代表格由院方提供，再查看修改栏。' },
    hint: { 'community-hospital': '玩家向医院提出身份核验请求，获准查看初报转录表与文穗既往病历中的对应栏目；先交代院方提供查阅，再比较材料，不接触遗体或宣告身份。' },
    clue: { 'community-hospital': '玩家向医院提出身份核验请求，获准查看初报转录表与文穗既往病历中的对应栏目；先交代院方提供查阅，再比较材料，不接触遗体或宣告身份。' },
  },
};

const VERIFIED_RECORD_LOCATIONS: Record<string, string[]> = {
  'a-window-transfer-match': ['old-man-building', 'observation-deck'],
  'b-contact-injury-match': ['water-tower', 'detective-inn', 'observation-deck'],
  'c-domestic-injury-match': ['home', 'community-hospital'],
  'none-unassisted-fall-record': ['observation-deck'],
  'fake-misidentification-chain': ['community-hospital', 'observation-deck'],
};

export function evidenceAcquisition(factId: string, level: RevealLevel, locationId: string): string | undefined {
  const authored = PATHS[factId]?.[level]?.[locationId];
  if (authored) return authored;
  if (factId === 'fake-verified-survival' && level === 'clue'
    && ['observation-deck', 'senpai-building', 'community-hospital'].includes(locationId)) {
    return '玩家提出核验请求，通过灯织转交的联络取得受托方的本人核验回执与交接记录，并收到警方反馈的正式遗体核验结果。先演出反馈到达和查阅，再对照获准内容；不公开落脚处，不让灯织代替警方完成鉴定。';
  }
  if ((level === 'hint' || level === 'clue') && VERIFIED_RECORD_LOCATIONS[factId]?.includes(locationId)) {
    return '玩家从已知疑点提出核验请求，通过警方的案件反馈渠道获准查看本条授权材料。先写申请、反馈到达和实际查阅，再写获准结果；不得把全部档案写成随身已有，不得补充未授权的检验细节或让无权知情的在场人物宣读结论。';
  }
  if (factId === 'shared-itinerary-crosscheck' && level === 'clue') {
    return '玩家取出此前已经看过的六处行程材料或对应记录，逐项整理其来源、日期与身份核验范围；这里只整理既有材料，不生成第七份新证据。';
  }
  return undefined;
}
