/**
 * 游戏开局剧本 (storyline) — GalGame 行格式
 *
 * 暴雨第五天。文穗已经出门，玩家从她留下的早餐、纸条和消息里
 * 察觉今天的安排与往常不同，并在家中选择第一条调查方向。
 */

import { maintextToScene } from './scene-parser';

export const OPENING_KNOWLEDGE_EVENTS = ['meet:touko'] as const;

/** Public continuity from the mandatory prologue only; these are not mystery evidence IDs.
 * The first generated turn follows the prologue. Optional observe/investigate content
 * must never be added here merely because it is available in a panel.
 */
export const OPENING_PUBLIC_CONTINUITY = [
  { id: 'opening-morning', text: '开局是九月九日08:00，暴雨第五天；这是开局时刻，后续当前时间以游戏时钟为准。' },
  { id: 'opening-breakfast', text: '今早文穗留下了切去面包皮的三明治和已经凉了的牛奶，家中无人应答。' },
  { id: 'opening-note', text: '今早杯底纸条写着“公交卡在外层口袋！今天可能晚一点回来。”署名旁画着猫，尾巴延到纸背；纸条没有写目的地。' },
  { id: 'opening-message-0650', text: '今早06:50文穗发来聊天消息：“我先出门了，今天不去学校。晚饭不用等我，回来再跟你说。”这是她自述的安排，尚未核实学校请假或她的去向。' },
  { id: 'opening-unanswered-contact', text: '玩家今早看消息后问她去哪儿，尚无回复；随后拨打电话无人接听。开局只能确定暂时联系不上，尚不清楚原因与去向。' },
  { id: 'opening-touko-visit', text: '灯织今早来归还洗好的饭盒；她说今天尚未联系文穗，当面发消息询问，并答应收到回复就告诉玩家，随后离开。' },
  { id: 'opening-weather', text: '手机收到暴雨橙色预警，预计傍晚六点前后雨势最强。' },
] as const;

export const OPENING_MAINTEXT = `场景|opening-rain-black
音乐|silence
对话|旁白|calm|雨声一直响着。
对话|旁白|calm|你闭着眼睛，听见水滴接连落在窗外的铁棚上。后脑有些发沉。刚才似乎做了一个梦，等你想起要记住，已经什么都不剩了。
对话|旁白|calm|先想一件确定的事。
对话|旁白|calm|我是——
身份确认
对话|旁白|calm|对了，我是{{user}}。

场景|bedroom1-day
音乐|silence
对话|旁白|calm|闹钟响了。你伸手摸到手机，把它按掉。
对话|旁白|calm|九月九日，早上八点。
对话|旁白|calm|屋里还暗着。你坐了一会儿，才把脚放进拖鞋。窗帘下摆碰着小腿，有点潮。雨已经下到第五天，晾在阳台上的衣服一直没干。
对话|旁白|calm|床头柜上放着药瓶。标签磨得模糊，你把它往里推了推，给手机腾出地方。
对话|旁白|calm|“文穗？”
对话|旁白|calm|没人应。

场景|home-day
音乐|peace
对话|旁白|calm|你走进客厅。记忆里先响起文穗的声音：“早餐放在桌上了，牛奶要趁热喝。”
对话|旁白|calm|那里没有人。餐桌上放着三明治，用盘子盖着。
对话|旁白|calm|你掀开盘子。面包有一角粘在盘底，你小心地把它揭下来。她又把面包皮切掉了。
对话|旁白|calm|旁边的马克杯里盛着牛奶，已经凉了。杯身画着两个牵手的小人，其中一个胳膊长得出奇。去年在植物园画杯子时，你提过这件事，文穗把杯子转过去看了看，说这样才牵得到。|opening-mug
对话|旁白|calm|杯底压着一张折过的纸。|opening-note
对话|旁白|calm|“公交卡在外层口袋！今天可能晚一点回来。”
对话|旁白|calm|署名旁边画着一只猫。地方不够，尾巴拐到了纸背面。

音乐|suspense
对话|旁白|calm|你沿折痕展开纸条，拇指停在“可能”两个字上。还没翻过去，你忽然觉得，背面应该有一截猫尾巴。
对话|旁白|calm|翻过去，确实有。
对话|旁白|calm|你看了一会儿，把纸重新折好。大概是刚才拿起来时已经瞥见了。

音乐|peace
对话|旁白|calm|手机振了一下。
对话|旁白|calm|暴雨橙色预警。预计傍晚六点前后雨势最强，提醒市民减少外出。|opening-weather-alert
对话|旁白|calm|你点开文穗的聊天框。最新的一条消息是六点五十发的。
对话|旁白|calm|“我先出门了，今天不去学校。晚饭不用等我，回来再跟你说。”
对话|旁白|calm|你盯着“今天不去学校”几个字。昨晚她没提过这件事。
对话|旁白|calm|你回了一句：“今天不去学校？去哪儿？”
对话|旁白|calm|屏幕暗下去，也没等到回复。
对话|旁白|calm|你拨了电话。回铃声响了一阵，转成无人接听的提示。
对话|旁白|calm|也许她正在车上。你放下手机，又拿起那张纸条。上面只说会晚一点回来，没有写去哪里。

对话|旁白|calm|门外有人敲了两下。
对话|touko|calm|“你们家的饭盒。洗好了。”
对话|旁白|calm|灯织站在门口，手里提着一个小袋子。她住在对面的商住楼，平时和你们都有来往。
认知|meet:touko
对话|旁白|calm|你接过袋子。饭盒的盖子和盒身分开放着，里面垫了一张厨房纸。
对话|touko|calm|“文穗呢？”
对话|旁白|calm|“出门了。你今天跟她联系过吗？”
对话|touko|calm|“没有。怎么了？”
对话|旁白|calm|“她说今天不去学校，晚上也不回来吃饭。我打过去没人接。”
对话|touko|calm|“什么时候打的？”
对话|旁白|calm|“刚才。”
对话|touko|calm|“可能没听见吧。”
对话|旁白|calm|你也这样想过。听她说出来，心里稍微松了一点。
对话|旁白|calm|“我以为她跟你说了。”
对话|touko|calm|“没有。我问问她。”
对话|旁白|calm|灯织低头发了条消息。过了一会儿，她收起手机。
对话|touko|calm|“回了我就告诉你。我早上还有事，先走了。”
对话|旁白|calm|她转身进了楼道。你把饭盒拿进厨房，再回到餐桌边，手机仍然没有新消息。

对话|旁白|calm|学校那边应该能查到她有没有请假。去学校的路上会经过那家二十四小时便利店，文穗常在那里买东西，店员也认识她。
对话|旁白|calm|你又想到周大爷。他住在两条街外，早晨常在附近散步。雨这么大，他未必出门；如果出去了，也许见过文穗。
对话|旁白|calm|灯织就在对面。她和文穗联系得上时，也会来告诉你。
对话|旁白|calm|现在去问，会不会显得小题大做？
对话|旁白|calm|窗外的积水已经漫过楼下那截矮台阶。你按亮手机，还是没有回复。
对话|旁白|calm|只问问她在哪里。至少得确定她有地方避雨。
对话|旁白|calm|钥匙挂在门边。你坐在餐桌旁，先想该从哪里问起。`;

export const OPENING_PANELS = `<observe>
客厅里还有三明治和牛奶的气味。纸条放在桌边，背面露出一截画歪的猫尾巴。手机上没有新消息。

隔着阳台玻璃上的水雾，只能看见对面商住楼模糊的轮廓。灯织刚回去不久。

文穗的房门开着一条缝。床尾叠着被子，书桌上的课本收成一摞。衣柜门没有关严，里面有一处不自然的空缺，从门口还看不清少了什么。

床头柜上的药瓶标签已经磨得模糊，从门口看不清上面写着什么。

饭盒放在厨房水槽边，盖子和盒身分开放着。
</observe>

<investigate>
检查文穗留的早餐和马克杯|无|现实|3分钟|0|0
查看手机中文穗的消息记录|玩家|心理|2分钟|0|3
检查床头柜上的药瓶|玩家|心理|2分钟|1|8
查看文穗的房间（书桌、衣柜、床头）|无|现实|5分钟|2|0
细看文穗留下的纸条|无|心理|2分钟|0|2
</investigate>

<action>
前往中学确认文穗的请假情况|现实|15分钟|10|0
去附近的便利店打听文穗是否来过|现实|10分钟|5|2
再次拨打文穗的电话|现实|2分钟|0|0
去对面商住楼找灯织，看看文穗有没有回复她|现实|5分钟|3|1
去找周大爷，问他早上散步时有没有见过文穗|现实|12分钟|7|2
</action>`;

export const OPENING_STORYLINE = `${OPENING_MAINTEXT}\n\n${OPENING_PANELS}`;

export function parseOpeningStoryline() {
  const scene = maintextToScene(OPENING_STORYLINE, {
    authorizedKnowledgeEvents: [...OPENING_KNOWLEDGE_EVENTS],
  });

  return scene;
}
