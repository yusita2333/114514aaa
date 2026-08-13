// 升级系统 · 核心逻辑（纯函数·数据驱动）
// catalog 是单一真相源；引擎(canUpgrade/applyUpgrade/combatBonus)只认 UpgradeDef 结构。
// C1：升级引擎 + 打手升级(战力)。设施/扩张项在 C2 append。

import type { UpgradeDef, UpgradeRequire } from './types';
import { isStageBossDefeated } from '../turf/machine';

// ───────────────────────────────────────
// catalog · 打手升级（群体·作用全体打手）
// 卡琳典狱长式数值叙事：花钱给操自己的人升级，升级项本身=色情联想。
// 兵器/格斗=纯战力(大)；精力/体型/器具=纯NSFW联想+统一小战力(用户定)。
// ───────────────────────────────────────
// 道场:全部单按钮·一钮一效果(无多级)。兵器三段递进;格斗训练=实战演习/慰安加油的树根;
// 精力强化→体型改造前置链,体型改造下挂 性爱持续/性欲野兽(粉金)+打手入珠(???)。调教器具已并入摄影房成人用品柜。
export const THUG_UPGRADES: UpgradeDef[] = [
  { id: 'wpn1', category: 'thug', name: '兵器装备·铁管与木刀', desc: '街斗家伙什配齐——不再赤手空拳(武器乘区+15%)', cost: 2500, maxLevel: 1, effect: { kind: 'combat', perLevel: 0.15 } },
  { id: 'wpn2', category: 'thug', name: '兵器装备·制式刀具', desc: '统一打造的长短刀，佩在腰间就是威慑(武器乘区+15%)', cost: 3500, maxLevel: 1, requires: [{ upgradeId: 'wpn1', minLevel: 1 }], effect: { kind: 'combat', perLevel: 0.15 } },
  { id: 'wpn3', category: 'thug', name: '兵器装备·走私枪械', desc: '黑市渠道的硬货，压箱底的最后底牌(武器乘区+20%)', cost: 5000, maxLevel: 1, requires: [{ upgradeId: 'wpn2', minLevel: 1 }], effect: { kind: 'combat', perLevel: 0.20 } },
  { id: 'brawl', category: 'thug', name: '格斗训练', desc: '肉搏战阵天天磨，以一当十(武器乘区+20%·实战演习/慰安加油的前置)', cost: 3000, maxLevel: 1, effect: { kind: 'combat', perLevel: 0.20 } },
  { id: 'vigor', category: 'thug', name: '精力强化', desc: '伟哥与壮阳药膳，夜夜不歇(武器乘区+10%·凛要承受更久)', cost: 3000, maxLevel: 1, effect: { kind: 'combat', perLevel: 0.10 }, corruptionOnBuy: 1 },
  { id: 'body_mod', category: 'thug', name: '体型改造', desc: '增肌壮根的改造疗程，体格差碾压(武器乘区+15%)', cost: 4000, maxLevel: 1, requires: [{ upgradeId: 'vigor', minLevel: 1 }], effect: { kind: 'combat', perLevel: 0.15 }, corruptionOnBuy: 2 },
  // 体型改造下挂:???打手入珠(纯叙事+堕落·留身体开发接口)
  { id: 'm_pearl', category: 'thug', name: '打手入珠', desc: '打手们排队做了入珠——从此凛每一次供奉都被珠粒剐蹭研磨着内壁，快感被强制放大到无法忽视', cost: 0, maxLevel: 1, mystery: true, corruptionRequired: 60, requires: [{ upgradeId: 'body_mod', minLevel: 1 }], effect: { kind: 'unlock', unlockKey: 'thug_pearl' }, corruptionOnBuy: 4 },
];

// ───────────────────────────────────────
// catalog · 设施升级（经营数值·作用大宅与凛）
// ───────────────────────────────────────
export const FACILITY_UPGRADES: UpgradeDef[] = [
  // ══ 性技修炼链(粉金混合·堕落+花钱双门槛·用肉穴以外部位同时侍奉→每格吞吐↑) ══
  { id: 'skill_hand', category: 'facility', name: '快速榨精（手技）', desc: '双手并用的手技修炼——一手一根，学会"读"射精的时机，一晚送走更多人(吞吐+6)', cost: 3000, maxLevel: 1, corruptionRequired: 0, effect: { kind: 'throughput', perLevel: 6 }, corruptionOnBuy: 3 },
  { id: 'skill_breast', category: 'facility', name: '乳交侍奉', desc: '娇小的胸口被迫学会夹持——胸前加双手，三路并行(吞吐+6)', cost: 3500, maxLevel: 1, corruptionRequired: 15, requires: [{ upgradeId: 'skill_hand', minLevel: 1 }], effect: { kind: 'throughput', perLevel: 6 }, corruptionOnBuy: 3 },
  { id: 'skill_foot', category: 'facility', name: '足交侍奉', desc: '坐姿双足各伺候一人、双手再各一人——"坐着不动"也是四路(吞吐+6)', cost: 4500, maxLevel: 1, corruptionRequired: 35, requires: [{ upgradeId: 'skill_breast', minLevel: 1 }], effect: { kind: 'throughput', perLevel: 6 }, corruptionOnBuy: 3 },
  { id: 'skill_double', category: 'facility', name: '双重口交', desc: '一张嘴一次含住两根，喉咙与舌头分不出先后——口腔的吞吐翻倍(吞吐+6)', cost: 6000, maxLevel: 1, corruptionRequired: 60, requires: [{ upgradeId: 'skill_foot', minLevel: 1 }], effect: { kind: 'throughput', perLevel: 6 }, corruptionOnBuy: 3 },
  { id: 'skill_orgy', category: 'facility', name: '极限群交', desc: '每一场性交都在挑战同时侍奉人数的极限，每一寸肌肤都成为被精液涂抹的目标(吞吐+6)', cost: 8000, maxLevel: 1, corruptionRequired: 80, requires: [{ upgradeId: 'skill_double', minLevel: 1 }], effect: { kind: 'throughput', perLevel: 6 }, corruptionOnBuy: 4 },

  // ══ 欲望承载上限链(金:给打手别的发泄口→更耐积压;???:凛的贴身物成了发泄口·恋物/雄臭) ══
  { id: 'desire_train', category: 'facility', name: '操练加倍', desc: '道场加练，多余精力泄在训练场(欲望上限+20)', cost: 3000, maxLevel: 1, effect: { kind: 'desireCap', perLevel: 20 } },
  { id: 'desire_liquor', category: 'facility', name: '酒水管够', desc: '夜里备足烈酒，灌醉一半人(欲望上限+20)', cost: 3500, maxLevel: 1, requires: [{ upgradeId: 'desire_train', minLevel: 1 }], effect: { kind: 'desireCap', perLevel: 20 } },
  { id: 'm_cloth_outer', category: 'facility', name: '大小姐的外衣', desc: '换下的外衣不再送洗，被打手们分走"珍藏"——有了发泄口，欲望更能忍一忍(上限+30)', cost: 0, maxLevel: 1, mystery: true, corruptionRequired: 25, effect: { kind: 'desireCap', perLevel: 30 }, corruptionOnBuy: 3, infamyOnBuy: 2 },
  { id: 'm_cloth_shoes', category: 'facility', name: '大小姐的鞋袜', desc: '脱下的鞋与穿过的袜成了抢手货，捂在脸上贪婪地嗅、裹着肉棒自渎(上限+30)', cost: 0, maxLevel: 1, mystery: true, corruptionRequired: 35, requires: [{ upgradeId: 'm_cloth_outer', minLevel: 1 }], effect: { kind: 'desireCap', perLevel: 30 }, corruptionOnBuy: 2, infamyOnBuy: 2 },
  { id: 'm_cloth_inner', category: 'facility', name: '大小姐的内衣', desc: '贴身穿过的内衣内裤被公开传看争抢，沾着体味的最值钱——她的隐私成了打手的战利品(上限+40)', cost: 0, maxLevel: 1, mystery: true, corruptionRequired: 45, requires: [{ upgradeId: 'm_cloth_shoes', minLevel: 1 }], effect: { kind: 'desireCap', perLevel: 40 }, corruptionOnBuy: 3, infamyOnBuy: 3 },
  { id: 'm_scent', category: 'facility', name: '气味标记', desc: '凛的枕头坐垫"轮借"给表现好的打手，还回来时全沤透了浓烈的雄臭汗味——她只能睡在、坐在别的男人的味道里，怎么洗都散不掉(上限+50)', cost: 0, maxLevel: 1, mystery: true, corruptionRequired: 60, requires: [{ upgradeId: 'm_cloth_inner', minLevel: 1 }], effect: { kind: 'desireCap', perLevel: 50 }, corruptionOnBuy: 3, infamyOnBuy: 2 },

  // ══ 采购扩容(金链止于批发;其后三个???渐进覆盖买套范式:戴玩具→被带着买→轿车代购) ══
  { id: 'buy_drugstore', category: 'facility', name: '熟识的药妆店', desc: '固定的采购点，凛亲自抱箱去买(采购上限+)', cost: 3000, maxLevel: 1, effect: { kind: 'purchaseMult', perLevel: 0.5 } },
  { id: 'buy_wholesale', category: 'facility', name: '批发的门路', desc: '量大跨多店扫荡(采购上限+)', cost: 3500, maxLevel: 1, requires: [{ upgradeId: 'buy_drugstore', minLevel: 1 }], effect: { kind: 'purchaseMult', perLevel: 1.0 } },
  { id: 'm_buy_toy', category: 'facility', name: '戴着玩具去采购', desc: '出门采购前，打手会往凛体内塞一枚遥控跳蛋——排队结账时遥控器在他们手里(范式顶替:采购从此戴玩具进行)', cost: 0, maxLevel: 1, mystery: true, corruptionRequired: 20, requires: [{ upgradeId: 'buy_wholesale', minLevel: 1 }], effect: { kind: 'unlock', unlockKey: 'buy_toy' }, corruptionOnBuy: 4 },
  { id: 'm_buy_escort', category: 'facility', name: '被打手带着去采购', desc: '跨店扫荡由打手开车"护送"——两店之间的车程里凛被按在后座使用，到店还要强撑着和店员交流(范式顶替)', cost: 0, maxLevel: 1, mystery: true, corruptionRequired: 35, requires: [{ upgradeId: 'm_buy_toy', minLevel: 1 }], effect: { kind: 'unlock', unlockKey: 'buy_escort' }, corruptionOnBuy: 3, infamyOnBuy: 2 },
  { id: 'm_buy_convoy', category: 'facility', name: '加长轿车代购', desc: '量大到凛亲自买不现实——她躺在加长轿车后座被双插着押运，打手代劳下车搬箱(范式顶替·终态)', cost: 0, maxLevel: 1, mystery: true, corruptionRequired: 50, requires: [{ upgradeId: 'm_buy_escort', minLevel: 1 }], effect: { kind: 'unlock', unlockKey: 'buy_convoy_x' }, corruptionOnBuy: 4, infamyOnBuy: 2 },

  // ══ 威望增长系数链(金:家格重振;???:女主人假装若无其事的另一面) ══
  { id: 'prestige_crest', category: 'facility', name: '重亮九条家纹', desc: '门楣翻新、家纹重描，街面上九条会的名字重新有分量(威望进账+25%)', cost: 4000, maxLevel: 1, effect: { kind: 'prestigeMult', perLevel: 0.25 } },
  { id: 'prestige_feast', category: 'facility', name: '设宴结交', desc: '定期宴请同道，人脉即威望(威望进账+25%)', cost: 4500, maxLevel: 1, requires: [{ upgradeId: 'prestige_crest', minLevel: 1 }], effect: { kind: 'prestigeMult', perLevel: 0.25 } },
  { id: 'm_feast_hostess', category: 'facility', name: '宴席上的女主人', desc: '设宴时凛以女主人身份斟酒陪席——桌布下有手探进她腿间，宾客毫不知情，她必须若无其事地维持谈笑，绝不能让任何人看出破绽(威望进账+25%)', cost: 0, maxLevel: 1, mystery: true, corruptionRequired: 40, requires: [{ upgradeId: 'prestige_feast', minLevel: 1 }], effect: { kind: 'prestigeMult', perLevel: 0.25 }, corruptionOnBuy: 3, infamyOnBuy: 3 },

  // ══ 据点·制度与耳目链(金:帮派治理表面;???:约束凛的荒谬淫规·解构尊严=娱乐化) ══
  { id: 'rule_code', category: 'facility', name: '立下会规', desc: '白纸黑字的帮规，赏罚分明，据点不容懈怠(据点加固+1：防守时常驻武力+10%)', cost: 3000, maxLevel: 1, effect: { kind: 'turfFortify', perLevel: 1 } },
  { id: 'rule_spy', category: 'facility', name: '布置暗探', desc: '街面眼线网，敌人动向早一步知道(刺探成功率+10%)', cost: 3500, maxLevel: 1, requires: [{ upgradeId: 'rule_code', minLevel: 1 }], effect: { kind: 'scoutRate', perLevel: 0.10 } },
  { id: 'rule_patrol', category: 'facility', name: '巡查制度', desc: '干部轮班巡查各据点，怠惰无所遁形(据点加固+2：防守时常驻武力再+20%)', cost: 4000, maxLevel: 1, requires: [{ upgradeId: 'rule_code', minLevel: 1 }], effect: { kind: 'turfFortify', perLevel: 2 } },
  { id: 'm_rule_greet', category: 'facility', name: '会规·问好的规矩', desc: '会规添了荒唐一条:打手见到大小姐可以直接掏出肉棒，她必须向那根肉棒问好——再往后，是转过身、用小穴对着它问好，由龟头在穴口浅浅一顶算作还礼，仿佛小穴才是她真正的正面', cost: 0, maxLevel: 1, mystery: true, corruptionRequired: 35, requires: [{ upgradeId: 'rule_code', minLevel: 1 }], effect: { kind: 'unlock', unlockKey: 'rule_greet' }, corruptionOnBuy: 4, infamyOnBuy: 2 },
  { id: 'm_rule_meal', category: 'facility', name: '会规·进食的规矩', desc: '又一条荒唐会规:大小姐的嘴只配吃流食，真正的"餐盘"是她的小穴——打手们把食物塞进去，再就着她的体温取食，最日常的吃饭成了最羞耻的仪式', cost: 0, maxLevel: 1, mystery: true, corruptionRequired: 50, requires: [{ upgradeId: 'rule_code', minLevel: 1 }], effect: { kind: 'unlock', unlockKey: 'rule_meal' }, corruptionOnBuy: 5 },
];

// ───────────────────────────────────────
// catalog · 扩张解锁（解锁NSFW区域与系统·数据驱动可无限扩展）
// 用 unlock/occupyScale 通用效果 + requires 前置，体现"扩张/解锁带来新升级任务"。
// ───────────────────────────────────────
export const EXPANSION_UPGRADES: UpgradeDef[] = [
  { id: 'basement', category: 'expansion', name: '改建地下室', desc: '刑具与拘禁设施，解锁暴力供奉(受虐癖线)', cost: 5000, maxLevel: 1, effect: { kind: 'unlock', unlockKey: 'basement' }, corruptionOnBuy: 5 },
  { id: 'studio', category: 'expansion', name: '暗网摄影室', desc: '解锁AV拍摄系统(达摩克里斯之剑·首拍强制演出)', cost: 8000, maxLevel: 1, effect: { kind: 'unlock', unlockKey: 'av' }, corruptionOnBuy: 3 },
  // AV设备升级：前置=先建摄影室，体现解锁带来新升级任务
  // ══ 摄影房(主题=成人用品与快感玩法)。铁律:一钮一效果、一钮一tag,无多级按钮。 ══
  { id: 'av_gear', category: 'expansion', name: '高清摄影机·换代', desc: '画面越清晰，大小姐的每一寸反应越无所遁形(解锁进阶拍摄)', cost: 4000, maxLevel: 1, requires: [{ upgradeId: 'studio', minLevel: 1 }], effect: { kind: 'unlock', unlockKey: 'av_advanced' } },
  // 摄制班底(4钮·各+1周产能)
  { id: 'av_crew1', category: 'expansion', name: '摄制班底·灯光组', desc: '两盏影视灯加反光板，画面不再靠顶灯将就(+1周产能)', cost: 4000, maxLevel: 1, requires: [{ upgradeId: 'studio', minLevel: 1 }], effect: { kind: 'unlock' } },
  { id: 'av_crew2', category: 'expansion', name: '摄制班底·场记与剪辑', desc: '专人记场次、连夜剪片，出片速度翻番(+1周产能)', cost: 5500, maxLevel: 1, requires: [{ upgradeId: 'av_crew1', minLevel: 1 }], effect: { kind: 'unlock' } },
  { id: 'av_crew3', category: 'expansion', name: '摄制班底·收音与外联', desc: '指向麦收尽每一声,外联打点渠道铺货(+1周产能)', cost: 7000, maxLevel: 1, requires: [{ upgradeId: 'av_crew2', minLevel: 1 }], effect: { kind: 'unlock' } },
  { id: 'av_crew4', category: 'expansion', name: '摄制班底·完整摄制组', desc: '导演/摄影/灯光/场务全配齐的正规班子(+1周产能)', cost: 9000, maxLevel: 1, requires: [{ upgradeId: 'av_crew3', minLevel: 1 }], effect: { kind: 'unlock' } },
  // 电池与存储(5钮·各+24h时长上限)
  { id: 'av_bat1', category: 'expansion', name: '备用电池组', desc: '一箱充满电的备用电池(时长上限+24h)', cost: 2000, maxLevel: 1, requires: [{ upgradeId: 'studio', minLevel: 1 }], effect: { kind: 'unlock' } },
  { id: 'av_bat2', category: 'expansion', name: '大容量存储卡', desc: '素材再多也装得下(时长上限+24h)', cost: 2500, maxLevel: 1, requires: [{ upgradeId: 'av_bat1', minLevel: 1 }], effect: { kind: 'unlock' } },
  { id: 'av_bat3', category: 'expansion', name: '外接电源车', desc: '拖进院里的发电车，机器永不断电(时长上限+24h)', cost: 3000, maxLevel: 1, requires: [{ upgradeId: 'av_bat2', minLevel: 1 }], effect: { kind: 'unlock' } },
  { id: 'av_bat4', category: 'expansion', name: '摄制双班倒', desc: '班底两班轮换，机器转人不停(时长上限+24h)', cost: 3500, maxLevel: 1, requires: [{ upgradeId: 'av_bat3', minLevel: 1 }], effect: { kind: 'unlock' } },
  { id: 'av_bat5', category: 'expansion', name: '不间断拍摄体制', desc: '换电池不停机的热替换体制——只要她还醒着就能一直拍(时长上限+24h)', cost: 4500, maxLevel: 1, requires: [{ upgradeId: 'av_bat4', minLevel: 1 }], effect: { kind: 'unlock' } },
  // 成人用品(3钮·各+1玩法tag上限)
  { id: 'av_toy1', category: 'expansion', name: '成人用品·按摩棒与跳蛋', desc: '基础电动玩具一套(单部可编排玩法tag+1)', cost: 4000, maxLevel: 1, requires: [{ upgradeId: 'studio', minLevel: 1 }], effect: { kind: 'avPlayCap', perLevel: 1 }, corruptionOnBuy: 1 },
  { id: 'av_toy2', category: 'expansion', name: '成人用品·拉珠与扩张环', desc: '开发向器具一套(玩法tag+1)', cost: 5000, maxLevel: 1, requires: [{ upgradeId: 'av_toy1', minLevel: 1 }], effect: { kind: 'avPlayCap', perLevel: 1 }, corruptionOnBuy: 1 },
  { id: 'av_toy3', category: 'expansion', name: '成人用品·电玩与吊具', desc: '电击贴片与悬吊架(玩法tag+1)', cost: 6000, maxLevel: 1, requires: [{ upgradeId: 'av_toy2', minLevel: 1 }], effect: { kind: 'avPlayCap', perLevel: 1 }, corruptionOnBuy: 2 },
  // 机位(2钮·解锁人数档)
  { id: 'av_cam3', category: 'expansion', name: '三机位拍摄', desc: '三台机器同时开——十余人的大场面也拍得全(解锁「大部队」人数档)', cost: 4000, maxLevel: 1, requires: [{ upgradeId: 'av_gear', minLevel: 1 }], effect: { kind: 'unlock', unlockKey: 'av_cam3' } },
  { id: 'av_cam8', category: 'expansion', name: '环形机位', desc: '环绕布机无死角——数十人的规模奇观尽收画面(解锁「海量」人数档)', cost: 6000, maxLevel: 1, requires: [{ upgradeId: 'av_cam3', minLevel: 1 }], effect: { kind: 'unlock', unlockKey: 'av_cam8' } },
];

// ───────────────────────────────────────
// catalog · 摄影房单件tag(一钮一tag:衣装10件+布景17座)。初始免费场景仅:监禁地下室/公共厕所/庆功宴酒席。
// ───────────────────────────────────────
export const AV_TAG_UPGRADES: UpgradeDef[] = [
  // 衣装(av_out_*·一件=一个衣装tag)
  { id: 'av_out_maid', category: 'expansion', name: '衣装·女仆装', desc: '黑白围裙短裙,裙撑一掀即翻(解锁衣装tag)', cost: 1200, maxLevel: 1, requires: [{ upgradeId: 'studio', minLevel: 1 }], effect: { kind: 'unlock' } },
  { id: 'av_out_seifuku', category: 'expansion', name: '衣装·日式校服', desc: '水手服百褶裙,清纯符号(解锁衣装tag)', cost: 1200, maxLevel: 1, requires: [{ upgradeId: 'studio', minLevel: 1 }], effect: { kind: 'unlock' } },
  { id: 'av_out_gym', category: 'expansion', name: '衣装·体操服', desc: '贴身弹力布勒出身形(解锁衣装tag)', cost: 1000, maxLevel: 1, requires: [{ upgradeId: 'studio', minLevel: 1 }], effect: { kind: 'unlock' } },
  { id: 'av_out_nun', category: 'expansion', name: '衣装·修女服', desc: '黑袍白领圈,神圣装束(解锁衣装tag)', cost: 1500, maxLevel: 1, requires: [{ upgradeId: 'studio', minLevel: 1 }], effect: { kind: 'unlock' } },
  { id: 'av_out_ol', category: 'expansion', name: '衣装·OL制服', desc: '衬衫铅笔裙丝袜,干练形象(解锁衣装tag)', cost: 1200, maxLevel: 1, requires: [{ upgradeId: 'studio', minLevel: 1 }], effect: { kind: 'unlock' } },
  { id: 'av_out_qipao', category: 'expansion', name: '衣装·旗袍', desc: '高开衩贴身盘扣(解锁衣装tag)', cost: 1500, maxLevel: 1, requires: [{ upgradeId: 'studio', minLevel: 1 }], effect: { kind: 'unlock' } },
  { id: 'av_out_kimono', category: 'expansion', name: '衣装·和服', desc: '层层腰带襦袢,解带如拆礼(解锁衣装tag)', cost: 1800, maxLevel: 1, requires: [{ upgradeId: 'studio', minLevel: 1 }], effect: { kind: 'unlock' } },
  { id: 'av_out_swim', category: 'expansion', name: '衣装·泳装', desc: '布料一拨即入(解锁衣装tag)', cost: 1000, maxLevel: 1, requires: [{ upgradeId: 'studio', minLevel: 1 }], effect: { kind: 'unlock' } },
  { id: 'av_out_wedding', category: 'expansion', name: '衣装·婚纱', desc: '纯白头纱裙撑,"最幸福的一天"(解锁衣装tag)', cost: 2000, maxLevel: 1, requires: [{ upgradeId: 'studio', minLevel: 1 }], effect: { kind: 'unlock' } },
  { id: 'av_out_latex', category: 'expansion', name: '衣装·紧身胶衣', desc: '乳胶真空包裹反着冷光(解锁衣装tag)', cost: 1800, maxLevel: 1, corruptionRequired: 45, requires: [{ upgradeId: 'studio', minLevel: 1 }], effect: { kind: 'unlock' }, corruptionOnBuy: 1 },
  // 布景(av_set_*·一座=一个场景tag)
  { id: 'av_set_school', category: 'expansion', name: '布景·学校教室', desc: '课桌讲台黑板(解锁场景tag)', cost: 1500, maxLevel: 1, requires: [{ upgradeId: 'studio', minLevel: 1 }], effect: { kind: 'unlock' } },
  { id: 'av_set_office', category: 'expansion', name: '布景·办公室', desc: '工位会议桌落地窗(解锁场景tag)', cost: 1500, maxLevel: 1, requires: [{ upgradeId: 'studio', minLevel: 1 }], effect: { kind: 'unlock' } },
  { id: 'av_set_clinic', category: 'expansion', name: '布景·诊疗室', desc: '诊察台器械帘(解锁场景tag)', cost: 1500, maxLevel: 1, requires: [{ upgradeId: 'studio', minLevel: 1 }], effect: { kind: 'unlock' } },
  { id: 'av_set_family', category: 'expansion', name: '布景·家庭和居', desc: '寻常人家客厅卧室(伦理剧场景tag)', cost: 1800, maxLevel: 1, requires: [{ upgradeId: 'studio', minLevel: 1 }], effect: { kind: 'unlock' } },
  { id: 'av_set_fantasy', category: 'expansion', name: '布景·奇幻异界', desc: '魔物巢穴与异界祭坛(解锁场景tag)', cost: 2000, maxLevel: 1, requires: [{ upgradeId: 'studio', minLevel: 1 }], effect: { kind: 'unlock' } },
  { id: 'av_set_cosplay', category: 'expansion', name: '布景·二次元棚', desc: '还原名场景的cos摄影棚(解锁场景tag)', cost: 1800, maxLevel: 1, requires: [{ upgradeId: 'studio', minLevel: 1 }], effect: { kind: 'unlock' } },
  { id: 'av_set_idol', category: 'expansion', name: '布景·偶像舞台', desc: '灯牌应援棒小舞台(解锁场景tag)', cost: 2200, maxLevel: 1, requires: [{ upgradeId: 'studio', minLevel: 1 }], effect: { kind: 'unlock' } },
  { id: 'av_set_shrine', category: 'expansion', name: '布景·神社祭坛', desc: '鸟居注连绳神乐铃(解锁场景tag)', cost: 2000, maxLevel: 1, requires: [{ upgradeId: 'studio', minLevel: 1 }], effect: { kind: 'unlock' } },
  { id: 'av_set_bridal', category: 'expansion', name: '布景·婚礼会场', desc: '花门红毯宾客席(解锁场景tag)', cost: 2200, maxLevel: 1, requires: [{ upgradeId: 'studio', minLevel: 1 }], effect: { kind: 'unlock' } },
  { id: 'av_set_church', category: 'expansion', name: '布景·教堂圣坛', desc: '彩窗烛台忏悔室(解锁场景tag)', cost: 2200, maxLevel: 1, requires: [{ upgradeId: 'studio', minLevel: 1 }], effect: { kind: 'unlock' } },
  { id: 'av_set_onsen', category: 'expansion', name: '布景·温泉汤屋', desc: '桧木汤池竹篱雾气(解锁场景tag)', cost: 2000, maxLevel: 1, requires: [{ upgradeId: 'studio', minLevel: 1 }], effect: { kind: 'unlock' } },
  { id: 'av_set_auction', category: 'expansion', name: '布景·拍卖台', desc: '竞价牌聚光灯展台(解锁场景tag)', cost: 2200, maxLevel: 1, requires: [{ upgradeId: 'studio', minLevel: 1 }], effect: { kind: 'unlock' } },
  { id: 'av_set_stream', category: 'expansion', name: '布景·直播间', desc: '环形灯弹幕大屏(解锁场景tag)', cost: 1800, maxLevel: 1, requires: [{ upgradeId: 'studio', minLevel: 1 }], effect: { kind: 'unlock' } },
  { id: 'av_set_alien', category: 'expansion', name: '布景·异种巢穴', desc: '触手藤蔓黏液质感的怪物巢(解锁场景tag)', cost: 2500, maxLevel: 1, requires: [{ upgradeId: 'studio', minLevel: 1 }], effect: { kind: 'unlock' } },
  { id: 'av_set_train', category: 'expansion', name: '布景·电车车厢', desc: '1:1车厢吊环报站音效(解锁场景tag)', cost: 2000, maxLevel: 1, requires: [{ upgradeId: 'studio', minLevel: 1 }], effect: { kind: 'unlock' } },
  { id: 'av_set_washitsu', category: 'expansion', name: '布景·和室', desc: '榻榻米障子门灯笼(解锁场景tag)', cost: 1500, maxLevel: 1, requires: [{ upgradeId: 'studio', minLevel: 1 }], effect: { kind: 'unlock' } },
  { id: 'av_set_rain', category: 'expansion', name: '布景·雨夜街头', desc: '洒水造雨霓虹灯牌(解锁场景tag)', cost: 2000, maxLevel: 1, requires: [{ upgradeId: 'studio', minLevel: 1 }], effect: { kind: 'unlock' } },
];

// ───────────────────────────────────────
// catalog · 九条宅技能树（叙事:九条会沉寂多年,宅邸功能不全,凛赚钱后逐间修缮重启)
// 主页「九条宅」的房间修缮节点 → 解锁对应子页(道场/摄影房/地下室/纪念室/庭院/日常淫具化…)
// 巨量内容待世界书完善后填充,这里先搭框架 + 示例分支,留接口。
// ───────────────────────────────────────
export const HOUSE_UPGRADES: UpgradeDef[] = [
  // —— 九条宅(主页·房间修缮=解锁子页) ——
  { id: 'room_dojo', category: 'expansion', name: '重启道场', desc: '清理荒废的练武堂，打手得以操练——解锁「道场」升级页', cost: 3000, maxLevel: 1, effect: { kind: 'unlock', unlockKey: 'dojo_page' } },

  // —— 道场示例分支(前置:重启道场) ——
  { id: 'phys_train', category: 'thug', name: '打手体能训练', desc: '提高打手每人基础武力值(+0.2/级·与在场/武器乘区相乘)', cost: 2500, maxLevel: 1, requires: [{ upgradeId: 'room_dojo', minLevel: 1 }], effect: { kind: 'baseMartial', perLevel: 0.2 } },
  { id: 'phys_train2', category: 'thug', name: '打手体能训练·二段', desc: '更高强度的操练，基础武力 +0.2', cost: 3500, maxLevel: 1, requires: [{ upgradeId: 'phys_train', minLevel: 1 }], effect: { kind: 'baseMartial', perLevel: 0.2 } },
  { id: 'phys_train3', category: 'thug', name: '打手体能训练·三段', desc: '榨干潜能，基础武力 +0.2', cost: 4500, maxLevel: 1, requires: [{ upgradeId: 'phys_train2', minLevel: 1 }], effect: { kind: 'baseMartial', perLevel: 0.2 } },
  // 粉金二连(挂体型改造下):花钱+堕落双门槛的"改造深化"
  { id: 'sex_stamina', category: 'thug', name: '性爱持续时间增强', desc: '药物疗程让打手更持久：供奉吞吐×0.7(处理变慢)，但AV单部时长上限+24h', cost: 3500, maxLevel: 1, corruptionRequired: 35, requires: [{ upgradeId: 'body_mod', minLevel: 1 }], effect: { kind: 'unlock', unlockKey: 'sex_stamina' }, corruptionOnBuy: 2 },
  { id: 'lust_beast', category: 'thug', name: '性欲野兽', desc: '打手欲求彻底暴走：供奉的淫乱忠诚加成×2(肉体收买加倍见效)，但群体欲望增长×1.5', cost: 5000, maxLevel: 1, corruptionRequired: 45, requires: [{ upgradeId: 'sex_stamina', minLevel: 1 }], effect: { kind: 'unlock', unlockKey: 'lust_beast' }, corruptionOnBuy: 3 },

  // —— 道场·实战与陪练(前置:格斗训练) ——
  { id: 'dojo_spar', category: 'thug', name: '实战演习', desc: '道场加开对练日，招式在实战中磨快(基础武力+0.2)', cost: 4000, maxLevel: 1, requires: [{ upgradeId: 'brawl', minLevel: 1 }], effect: { kind: 'baseMartial', perLevel: 0.2 } },
  { id: 'm_spar1', category: 'thug', name: '大小姐陪练·揩油', desc: '对练日的"活靶子"换成了凛——以指导受身、纠正姿势为名，手在她身上四处揩油、抚摸、调戏，打手为多摸两下拼命钻研技术(基础武力+0.2)', cost: 0, maxLevel: 1, mystery: true, corruptionRequired: 45, requires: [{ upgradeId: 'dojo_spar', minLevel: 1 }], effect: { kind: 'baseMartial', perLevel: 0.2 }, corruptionOnBuy: 3 },
  { id: 'm_spar2', category: 'thug', name: '大小姐陪练·固技', desc: '揩油进阶成实战:用摔跤的固定技把凛压制在垫上动弹不得，就着压制的姿势轮流贯穿——她的挣扎本身成了练技的一部分(基础武力+0.3·受虐癖开发后)', cost: 0, maxLevel: 1, mystery: true, corruptionRequired: 60, requires: [{ upgradeId: 'm_spar1', minLevel: 1 }], effect: { kind: 'baseMartial', perLevel: 0.3 }, corruptionOnBuy: 4 },
  { id: 'm_cheer1', category: 'thug', name: '慰安加油·啦啦队', desc: '凛被塞进暴露又滑稽的啦啦队服，在场边为操练的打手加油鼓劲——羞耻的姿势与口号让全场士气高涨(基础武力+0.1)', cost: 0, maxLevel: 1, mystery: true, corruptionRequired: 35, requires: [{ upgradeId: 'brawl', minLevel: 1 }], effect: { kind: 'baseMartial', perLevel: 0.1 }, corruptionOnBuy: 3, infamyOnBuy: 2 },
  { id: 'm_cheer2', category: 'thug', name: '慰安加油·裸体', desc: '啦啦队服也免了，凛赤身裸体地摆动作喊加油，晃动的身体成了打手操练时的活奖励(基础武力+0.1)', cost: 0, maxLevel: 1, mystery: true, corruptionRequired: 50, requires: [{ upgradeId: 'm_cheer1', minLevel: 1 }], effect: { kind: 'baseMartial', perLevel: 0.1 }, corruptionOnBuy: 3 },
  { id: 'm_cheer3', category: 'thug', name: '慰安加油·被轮着加油', desc: '凛一边被拉到场边轮流贯穿，一边还得断续地喊出加油口号——声音抖得不成调，越是这样打手越卖力(基础武力+0.2)', cost: 0, maxLevel: 1, mystery: true, corruptionRequired: 65, requires: [{ upgradeId: 'm_cheer2', minLevel: 1 }], effect: { kind: 'baseMartial', perLevel: 0.2 }, corruptionOnBuy: 4 },

  // —— 摄影房·观众来信(前置:摄影室·需已拍≥5部) ——
  { id: 'm_av_letters', category: 'expansion', name: '观众来信', desc: '销量爆了之后，打手们把"粉丝反馈"挑出来当着凛的面朗读——哪个镜头最受欢迎、观众点播什么新玩法，她被迫知道自己被多少人看过、被如何议论(AV单部收入+20%)', cost: 0, maxLevel: 1, mystery: true, corruptionRequired: 50, requiresAvShots: 5, requires: [{ upgradeId: 'studio', minLevel: 1 }], effect: { kind: 'avIncomeMult', perLevel: 0.20 }, corruptionOnBuy: 2, infamyOnBuy: 3 },

  // —— 地下室(前置:地下室)。主题=刑具与虐待(ryona·受虐癖线)。
  // 一个刑具一个升级:买什么解锁暴力供奉里对应装置(升级键+masochism堕落闸门双条件)。互不前置,玩家自选调教路线。
  // 地下室升级全为粉金(花钱+堕落双门槛),无纯金——刑具本身就是色情的
  { id: 'gear_hang', category: 'expansion', name: '吊颈滑轮组', desc: '天花板滑轮与绞索——解锁暴力供奉「吊颈轮奸」装置', cost: 3500, maxLevel: 1, corruptionRequired: 35, requires: [{ upgradeId: 'basement', minLevel: 1 }], effect: { kind: 'unlock', unlockKey: 'gear_hang' }, corruptionOnBuy: 2 },
  { id: 'gear_horse', category: 'expansion', name: '三角木马', desc: '打磨出棱线的三角横梁——解锁暴力供奉「三角木马」装置', cost: 4000, maxLevel: 1, corruptionRequired: 40, requires: [{ upgradeId: 'basement', minLevel: 1 }], effect: { kind: 'unlock', unlockKey: 'gear_horse' }, corruptionOnBuy: 2 },
  { id: 'gear_donkey', category: 'expansion', name: '通电木驴', desc: '接了电极的木驴鞍座——解锁暴力供奉「通电木驴」装置', cost: 4500, maxLevel: 1, corruptionRequired: 50, requires: [{ upgradeId: 'basement', minLevel: 1 }], effect: { kind: 'unlock', unlockKey: 'gear_donkey' }, corruptionOnBuy: 2 },
  { id: 'gear_water', category: 'expansion', name: '水刑台', desc: '倾斜的绑台与水桶——解锁暴力供奉「水刑轮奸」装置', cost: 4000, maxLevel: 1, corruptionRequired: 50, requires: [{ upgradeId: 'basement', minLevel: 1 }], effect: { kind: 'unlock', unlockKey: 'gear_water' }, corruptionOnBuy: 2 },
  // 新刑具(粉金·语料:杖刑五阶段/胶衣+眼罩+嘴塞/姜罚+液体刺激/炙香+低温蜡烛)
  { id: 'gear_cane', category: 'expansion', name: '笞刑架', desc: '悬吊展露与跪趴锁定的专用刑架，竹片、皮拍、老藤、橡胶棍挂满一墙——解锁「杖笞调教」装置', cost: 5000, maxLevel: 1, corruptionRequired: 50, requires: [{ upgradeId: 'basement', minLevel: 1 }], effect: { kind: 'unlock', unlockKey: 'gear_cane' }, corruptionOnBuy: 3 },
  { id: 'gear_latex', category: 'expansion', name: '拘束衣柜', desc: '乳胶胶衣、眼罩与嘴塞——真空包裹与感官剥夺，解锁「胶衣调教」装置', cost: 4500, maxLevel: 1, corruptionRequired: 45, requires: [{ upgradeId: 'basement', minLevel: 1 }], effect: { kind: 'unlock', unlockKey: 'gear_latex' }, corruptionOnBuy: 3 },
  { id: 'gear_ginger', category: 'expansion', name: '粘膜灼烧药剂', desc: '辣椒油与鲜磨姜汁——涂进小穴和后穴粘膜的化学灼烧调教，解锁「粘膜灼烧」装置', cost: 4000, maxLevel: 1, corruptionRequired: 55, requires: [{ upgradeId: 'basement', minLevel: 1 }], effect: { kind: 'unlock', unlockKey: 'gear_ginger' }, corruptionOnBuy: 3 },
  { id: 'gear_wax', category: 'expansion', name: '炙香与蜡烛', desc: '缓燃的炙香与低温蜡——皮肉上的温度刑，解锁「温度调教」装置', cost: 4500, maxLevel: 1, corruptionRequired: 60, requires: [{ upgradeId: 'basement', minLevel: 1 }], effect: { kind: 'unlock', unlockKey: 'gear_wax' }, corruptionOnBuy: 3 },
  { id: 'dungeon_soundproof', category: 'expansion', name: '地下室隔音工程', desc: '地下室彻底隔音——"施工"名义正当，用途不言自明(启用与常态化的前置)', cost: 3500, maxLevel: 1, corruptionRequired: 40, requires: [{ upgradeId: 'basement', minLevel: 1 }], effect: { kind: 'unlock', unlockKey: 'soundproof' }, corruptionOnBuy: 2 },
  { id: 'm_dungeon_night', category: 'expansion', name: '深夜的脚步声', desc: '忠诚低落时，总有打手不打招呼就把凛带下隔音的地下室——没人听得见，那道隔音工程反而成了他们肆意的底气(受虐癖开发+)', cost: 0, maxLevel: 1, mystery: true, corruptionRequired: 50, requiresLoyaltyBelow: 40, requires: [{ upgradeId: 'dungeon_soundproof', minLevel: 1 }], effect: { kind: 'unlock', unlockKey: 'dungeon_night' }, corruptionOnBuy: 4 },
];

// ───────────────────────────────────────
// catalog · 地盘扩张树（SFW先行叙事·用户定稿v45）
// 解锁地盘升级只带来【SFW日常事件】;每个SFW事件下面挂一个???(mystery),
// 堕落度一到自动解锁→该事件翻面成NSFW(行动格里SFW范式被顶替)。
// 私山=一个前置升级,子树里爬山/野营各自解锁(一对多)。九条宅本就是凛的家,不需要"买",只有修缮/重启。
// ───────────────────────────────────────
export const ANNEX_UPGRADES: UpgradeDef[] = [
  // —— 宅邸(修缮·非收购·显示在「九条宅」页) ——
  { id: 'annex_estate', category: 'expansion', name: '重新启用庭院', desc: '把荒废的庭院假山修整出来——散步与放风有了去处', cost: 1500, maxLevel: 1, effect: { kind: 'unlock', unlockKey: 'courtyard' } },
  { id: 'annex_shrine', category: 'expansion', name: '修缮祖堂纪念室', desc: '先代牌位重见天日→解锁「参拜先祖」', cost: 2500, maxLevel: 1, requires: [{ upgradeId: 'annex_estate', minLevel: 1 }], effect: { kind: 'unlock', unlockKey: 'shrine' } },
  // —— 对外扩张(收购地皮→SFW日常·显示在「地盘扩张」页) ——
  { id: 'annex_street', category: 'expansion', name: '收购邻近街区', desc: '吞并周边商铺→解锁「出门吃饭」「去商场」(需击败第1阶段Boss)', cost: 3000, maxLevel: 1, requiresBossStage: 1, effect: { kind: 'unlock', unlockKey: 'occupy_street' } },
  { id: 'annex_hill', category: 'expansion', name: '盘踞一山（私山）', desc: '买下整座山头作九条会私产(子树里逐处开发·需击败第1阶段Boss)', cost: 5000, maxLevel: 1, requiresBossStage: 1, requires: [{ upgradeId: 'annex_street', minLevel: 1 }], effect: { kind: 'unlock', unlockKey: 'private_hill' } },
  { id: 'annex_hill_trail', category: 'expansion', name: '私山·后山小径', desc: '小山包踏出一条能走的土路(无游客的自家野山)→解锁「爬山」', cost: 2000, maxLevel: 1, requires: [{ upgradeId: 'annex_hill', minLevel: 1 }], effect: { kind: 'unlock', unlockKey: 'occupy_hill' } },
  { id: 'annex_hill_camp', category: 'expansion', name: '私山·营地开发', desc: '林间空地平整出营区→解锁「森林野营」', cost: 2500, maxLevel: 1, requires: [{ upgradeId: 'annex_hill', minLevel: 1 }], effect: { kind: 'unlock', unlockKey: 'hill_camp' } },
  { id: 'annex_district', category: 'expansion', name: '吞并整片城区', desc: '游乐园/海滩/祭典场纳入势力→解锁对应日常(需击败第2阶段Boss)', cost: 6000, maxLevel: 1, requiresBossStage: 2, requires: [{ upgradeId: 'annex_street', minLevel: 1 }], effect: { kind: 'unlock', unlockKey: 'occupy_district' } },
  { id: 'annex_halfcity', category: 'expansion', name: '坐拥小半座城', desc: '地下霸主级·包下公开场馆→解锁「看演唱会」(需击败第3阶段Boss)', cost: 12000, maxLevel: 1, requiresBossStage: 3, requires: [{ upgradeId: 'annex_district', minLevel: 1 }], effect: { kind: 'unlock', unlockKey: 'occupy_halfcity' } },
  // 经营便利·后期贵:避孕套送货上门(便利=堕落加速·省采购格)
  { id: 'condom_delivery', category: 'expansion', name: '避孕套·黑市送货渠道', desc: '打手代买送货上门，每日自动进货一批(省去主动采购)', cost: 20000, maxLevel: 3, requires: [{ upgradeId: 'annex_halfcity', minLevel: 1 }], effect: { kind: 'condomDaily', perLevel: 250 }, corruptionOnBuy: 4 },
];

// ───────────────────────────────────────
// catalog · ???事件(mystery·地盘扩张SFW事件的翻面开关)
// 绯红边+♥;未解锁显"???",悬停见前置+堕落要求;条件满足自动解锁(不花钱);
// 解锁效果 = 对应日常事件的NSFW面开启(unlocked['nsfw_<事件>']=true → erosionGate.custom 查它)。
// 附带少量堕落(目睹自己的日常被改造)。
// ───────────────────────────────────────
export const MYSTERY_TURF_UPGRADES: UpgradeDef[] = [
  { id: 'm_dine', category: 'expansion', name: '包场的余兴', desc: '餐厅"包场"的真正用途——「出门吃饭」翻面为白日宣淫', cost: 0, maxLevel: 1, mystery: true, corruptionRequired: 30, requires: [{ upgradeId: 'annex_street', minLevel: 1 }], effect: { kind: 'unlock', unlockKey: 'nsfw_dine' }, corruptionOnBuy: 3 },
  { id: 'm_mall', category: 'expansion', name: '试衣间的常客', desc: '商场巡视变成试衣间轮用——「去商场」翻面', cost: 0, maxLevel: 1, mystery: true, corruptionRequired: 35, requires: [{ upgradeId: 'annex_street', minLevel: 1 }], effect: { kind: 'unlock', unlockKey: 'nsfw_mall' }, corruptionOnBuy: 2 },
  { id: 'm_hiking', category: 'expansion', name: '后山的规矩', desc: '"陪大小姐爬山"不再是爬山——走两步就被按在岩石上,「爬山」翻面', cost: 0, maxLevel: 1, mystery: true, corruptionRequired: 30, requires: [{ upgradeId: 'annex_hill_trail', minLevel: 1 }], effect: { kind: 'unlock', unlockKey: 'nsfw_hiking' }, corruptionOnBuy: 3 },
  { id: 'm_camping', category: 'expansion', name: '营地的篝火', desc: '夜里的营地不熄火——「森林野营」翻面', cost: 0, maxLevel: 1, mystery: true, corruptionRequired: 35, requires: [{ upgradeId: 'annex_hill_camp', minLevel: 1 }], effect: { kind: 'unlock', unlockKey: 'nsfw_camping' }, corruptionOnBuy: 2 },
  { id: 'm_amusement', category: 'expansion', name: '厢门关上之后', desc: '摩天轮与鬼屋的封闭厢体都是移动密室——「去游乐园」翻面', cost: 0, maxLevel: 1, mystery: true, corruptionRequired: 40, requires: [{ upgradeId: 'annex_district', minLevel: 1 }], effect: { kind: 'unlock', unlockKey: 'nsfw_amusement' }, corruptionOnBuy: 2 },
  { id: 'm_beach', category: 'expansion', name: '圈起来的沙滩', desc: '打手仗势在沙滩围出禁区,游客被逼得绕道——「去海滩」翻面', cost: 0, maxLevel: 1, mystery: true, corruptionRequired: 40, requires: [{ upgradeId: 'annex_district', minLevel: 1 }], effect: { kind: 'unlock', unlockKey: 'nsfw_beach' }, corruptionOnBuy: 2 },
  { id: 'm_festival', category: 'expansion', name: '人墙里的祭典', desc: '打手在人潮里围成移动的真空,浴衣下不许穿——「逛祭典」翻面', cost: 0, maxLevel: 1, mystery: true, corruptionRequired: 40, requires: [{ upgradeId: 'annex_district', minLevel: 1 }], effect: { kind: 'unlock', unlockKey: 'nsfw_festival' }, corruptionOnBuy: 2 },
  { id: 'm_concert', category: 'expansion', name: '一墙之隔', desc: 'VIP包间外万人狂欢,包间内……——「看演唱会」翻面', cost: 0, maxLevel: 1, mystery: true, corruptionRequired: 45, requires: [{ upgradeId: 'annex_halfcity', minLevel: 1 }], effect: { kind: 'unlock', unlockKey: 'nsfw_concert' }, corruptionOnBuy: 3 },
  { id: 'm_ancestor', category: 'expansion', name: '牌位前的供品', desc: '先祖面前的另一种供奉——「参拜先祖」翻面', cost: 0, maxLevel: 1, mystery: true, corruptionRequired: 60, requires: [{ upgradeId: 'annex_shrine', minLevel: 1 }], effect: { kind: 'unlock', unlockKey: 'nsfw_ancestor' }, corruptionOnBuy: 3 },
  // 批C1 场所清尾: 庭院假山/扫除垃圾堆 并入 ??? 解禁制(与其余场所统一·street 保持堕落30自动翻面供早期内容)
  { id: 'm_garden_rock', category: 'expansion', name: '假山的用途', desc: '庭院深处的假山挡住所有视线——「散步」路过时翻面为野战', cost: 0, maxLevel: 1, mystery: true, corruptionRequired: 45, requires: [{ upgradeId: 'annex_estate', minLevel: 1 }], effect: { kind: 'unlock', unlockKey: 'nsfw_garden_rock' }, corruptionOnBuy: 2 },
  { id: 'm_garbage', category: 'facility', name: '扫除的去向', desc: '让手下扫除的"垃圾"堆到了哪里——「让手下扫除」翻面', cost: 0, maxLevel: 1, mystery: true, corruptionRequired: 45, requires: [{ upgradeId: 'm_diet', minLevel: 1 }], effect: { kind: 'unlock', unlockKey: 'nsfw_garbage' }, corruptionOnBuy: 2 },
];

// ───────────────────────────────────────
// catalog · 凛·个人升级(生活化叙事·用户定稿v45)
// 直白的"行动格扩容"拆成生活化选项(名字简述各异,效果同为+1格);
// 升级之间互相嵌合:生活化升级作为???NSFW后置的前置(定制饮食→假阳具饮食;深度睡眠+购买大床→抱枕睡奸;
// 扩建浴场+鸳鸯浴→浴场侍奉)。日常淫乱化(原淫具化)拆分成单独按钮,摘要即叙事,搬到凛面板。
// ───────────────────────────────────────
export const RIN_UPGRADES: UpgradeDef[] = [
  // —— 生活化行动格扩容(效果相同·描述各异) ——
  { id: 'life_diet', category: 'facility', name: '定制饮食', desc: '专属营养师调理三餐，精力更充沛(+1行动格)', cost: 3000, maxLevel: 1, effect: { kind: 'actionSlots', perLevel: 1 } },
  { id: 'life_sleep', category: 'facility', name: '深度睡眠', desc: '遮光窗帘与安神香，睡得更沉(+1行动格)', cost: 3000, maxLevel: 1, effect: { kind: 'actionSlots', perLevel: 1 } },
  { id: 'life_bath', category: 'facility', name: '扩建浴场', desc: '把老浴室扩成大浴场，洗去一身疲惫(+1行动格)', cost: 4000, maxLevel: 1, effect: { kind: 'actionSlots', perLevel: 1 } },
  { id: 'life_bed', category: 'facility', name: '购买大床', desc: '特注的大床，翻身都带着奢侈(+1行动格)', cost: 3500, maxLevel: 1, effect: { kind: 'actionSlots', perLevel: 1 } },
  // 散步健体:解锁「庭院散步」白天事件(每10次散步→+1行动格·硬上限15)。前置:庭院已修缮。
  { id: 'life_walk', category: 'facility', name: '散步健体', desc: '解锁「庭院散步」白天行动:每散步10次，体质提升+1行动格(上限15格)', cost: 2000, maxLevel: 1, requires: [{ upgradeId: 'annex_estate', minLevel: 1 }], effect: { kind: 'unlock', unlockKey: 'garden_walk' } },

  // —— ???日常淫乱化(mystery·自动解锁·摘要即叙事·多数不进行动格,少数改范式) ——
  // 假阳具饮食:定制饮食的后置。纯叙事+堕落。
  { id: 'm_diet', category: 'facility', name: '假阳具饮食', desc: '餐具悄悄换成了那种形状——大小姐进食时只能含着它吞咽，一日三餐都成了口腔调教', cost: 0, maxLevel: 1, mystery: true, corruptionRequired: 40, requires: [{ upgradeId: 'life_diet', minLevel: 1 }], effect: { kind: 'unlock', unlockKey: 'toy_diet' }, corruptionOnBuy: 4 },
  // 抱枕睡奸:深度睡眠+购买大床共同后置 → 解锁夜间「休息(♥)」NSFW面。
  { id: 'm_sleep', category: 'facility', name: '抱枕睡奸', desc: '大床的另一个用途——熟睡的大小姐成了打手们轮流环抱的抱枕，睡眠中被缓慢使用', cost: 0, maxLevel: 1, mystery: true, corruptionRequired: 20, requires: [{ upgradeId: 'life_sleep', minLevel: 1 }, { upgradeId: 'life_bed', minLevel: 1 }], effect: { kind: 'unlock', unlockKey: 'sleep_rape' }, corruptionOnBuy: 4 },
  // 鸳鸯浴:???(与扩建浴场并排),两者共同作为"浴场侍奉"前置。
  { id: 'm_bath', category: 'facility', name: '鸳鸯浴', desc: '洗澡时总有复数打手"陪同"——粗糙的手接管清洗，摸到有感觉了就用浴室常备的套侵犯，射满意了再继续洗瘫软的她', cost: 0, maxLevel: 1, mystery: true, corruptionRequired: 30, effect: { kind: 'unlock', unlockKey: 'couple_bath' }, corruptionOnBuy: 4 },
  { id: 'm_bath_serve', category: 'facility', name: '浴场侍奉', desc: '大浴场与鸳鸯浴凑齐了——大小姐的沐浴彻底变成浴场里的公共侍奉', cost: 0, maxLevel: 1, mystery: true, corruptionRequired: 45, requires: [{ upgradeId: 'life_bath', minLevel: 1 }, { upgradeId: 'm_bath', minLevel: 1 }], effect: { kind: 'unlock', unlockKey: 'bath_serve' }, corruptionOnBuy: 4 },
  // 如厕淫乱化(新编·纯叙事+堕落)
  { id: 'm_toilet', category: 'facility', name: '如厕淫乱化', desc: '上厕所必有两名打手"服侍"：小便时被从背后抱起打开双腿插入，射精前不许下来；大便时塞着尿道塞与打手面对面相拥而坐边被插边如厕', cost: 0, maxLevel: 1, mystery: true, corruptionRequired: 50, effect: { kind: 'unlock', unlockKey: 'toilet_lewd' }, corruptionOnBuy: 5 },
  // 椅子淫乱化(+淫名:家中会客也坐淫具,名声外泄)
  { id: 'm_chair', category: 'facility', name: '椅子淫乱化', desc: '宅内所有座位都竖着假阳具，禁止内裤——看书学习吃饭会客都必须坐上去，会客时只能用衣物遮掩', cost: 0, maxLevel: 1, mystery: true, corruptionRequired: 45, effect: { kind: 'unlock', unlockKey: 'chair_lewd' }, corruptionOnBuy: 4, infamyOnBuy: 3 },

  // —— ???散步链(范式顶替=惩罚·遛母狗→群交) ——
  { id: 'm_walk_toy', category: 'facility', name: '庭院玩具散步', desc: '散步被要求戴着性玩具进行——普通散步已不复存在(范式顶替)', cost: 0, maxLevel: 1, mystery: true, corruptionRequired: 30, requires: [{ upgradeId: 'life_walk', minLevel: 1 }], effect: { kind: 'unlock', unlockKey: 'walk_toy' }, corruptionOnBuy: 4 },
  { id: 'm_walk_dog', category: 'facility', name: '庭院遛母狗', desc: '散步的最终形态——项圈与四肢着地，玩具散步也成了过去式(范式顶替)', cost: 0, maxLevel: 1, mystery: true, corruptionRequired: 45, requires: [{ upgradeId: 'm_walk_toy', minLevel: 1 }], effect: { kind: 'unlock', unlockKey: 'walk_dog' }, corruptionOnBuy: 4 },
  { id: 'm_walk_orgy', category: 'facility', name: '庭院群交', desc: '体质练成之日，庭院成了刑场——每次庭院群交打手们都会挥霍光库存避孕套(与遛母狗并行)', cost: 0, maxLevel: 1, mystery: true, corruptionRequired: 55, requiresSlotsMax: true, requires: [{ upgradeId: 'm_walk_dog', minLevel: 1 }], effect: { kind: 'unlock', unlockKey: 'walk_orgy' }, corruptionOnBuy: 5 },
];

// ───────────────────────────────────────
// catalog · 荒唐升级（卡琳典狱长式·花钱换收益但增堕落·升级本身=色情联想·前期堕落度主来源）
// ───────────────────────────────────────
export const DEBAUCH_UPGRADES: UpgradeDef[] = [
  // 信息张贴链(用户范例):每级减忠诚自然衰减,但每级增堕落
  { id: 'poster1', category: 'facility', name: '宅内张贴大小姐个人信息', desc: '打手随时能看到主人信息→忠诚更稳(自然衰减-1)', cost: 1500, maxLevel: 1, effect: { kind: 'loyaltyDecayReduce', perLevel: 1 }, corruptionOnBuy: 2 },
  { id: 'poster2', category: 'facility', name: '张贴大小姐艳照', desc: '曝光升级→忠诚更稳(衰减再-1)', cost: 2500, maxLevel: 1, requires: [{ upgradeId: 'poster1', minLevel: 1 }], effect: { kind: 'loyaltyDecayReduce', perLevel: 1 }, corruptionOnBuy: 2 },
  { id: 'poster3', category: 'facility', name: '张贴大小姐小穴特写', desc: '玷污→忠诚更稳(衰减再-1)', cost: 4000, maxLevel: 1, requires: [{ upgradeId: 'poster2', minLevel: 1 }], effect: { kind: 'loyaltyDecayReduce', perLevel: 1 }, corruptionOnBuy: 3 },
  { id: 'poster4', category: 'facility', name: '张贴流着精液的小穴照', desc: '终极物化→忠诚更稳(衰减再-1)', cost: 6000, maxLevel: 1, requires: [{ upgradeId: 'poster3', minLevel: 1 }], effect: { kind: 'loyaltyDecayReduce', perLevel: 1 }, corruptionOnBuy: 3 },
];

/** 全部升级项（合并） */
export const UPGRADES: UpgradeDef[] = [...THUG_UPGRADES, ...FACILITY_UPGRADES, ...EXPANSION_UPGRADES, ...AV_TAG_UPGRADES, ...HOUSE_UPGRADES, ...ANNEX_UPGRADES, ...MYSTERY_TURF_UPGRADES, ...RIN_UPGRADES, ...DEBAUCH_UPGRADES];

/** 按 id 索引 */
export const UPGRADES_BY_ID: Record<string, UpgradeDef> =
  Object.fromEntries(UPGRADES.map(u => [u.id, u]));

// ───────────────────────────────────────
// 状态切片与查询
// ───────────────────────────────────────

/** 升级引擎读写的状态切片（EngineState 结构兼容）。含 applyUpgrade 效果作用的目标字段。 */
export interface UpgradeState {
  money: number;
  corruption: number;
  upgrades?: Record<string, number>;
  // —— 效果目标字段（applyUpgrade 按 effect.kind 写入）——
  occupyScale?: number;          // 占据规模档序号（地盘扩张；扩张项 requires 用）
  perSlotThroughput?: number;    // 每格供奉吞吐（吞吐扩容）
  desireCapacity?: number;       // 欲望承载上限
  totalSlots?: number;           // 每日总行动格（行动格扩容）
  purchaseUpgradeMult?: number;  // 采购扩容倍率
  turfFortifyBonus?: number;     // 据点加固加成
  unlocked?: Record<string, boolean>; // 解锁集（地下室/摄影室/庭院…）
}

/** 行动格基数（行动格扩容在此之上加） */
export const BASE_ACTION_SLOTS = 8;
/** 行动格硬上限（超过不再产生收益·散步计数与升级共用此顶） */
export const MAX_ACTION_SLOTS = 15;
/** 庭院散步:计数满多少次 → +1 行动格 */
export const WALK_PER_SLOT = 10;

/** 某升级项当前等级 */
export function getLevel(upgrades: Record<string, number> | undefined, id: string): number {
  return upgrades?.[id] ?? 0;
}

/** 前置依赖是否全满足 */
export function requiresMet(reqs: UpgradeRequire[] | undefined, state: UpgradeState): boolean {
  if (!reqs || reqs.length === 0) return true;
  return reqs.every(r => {
    if (r.upgradeId != null && getLevel(state.upgrades, r.upgradeId) < (r.minLevel ?? 1)) return false;
    if (r.occupyAtLeast != null && (state.occupyScale ?? 0) < r.occupyAtLeast) return false;
    return true;
  });
}

export interface UpgradeCheck {
  ok: boolean;
  reason?: string;
}

/**
 * ???(mystery)是否达成自动解锁条件:前置升级齐 + 堕落度到 + (可选)行动格已达硬上限。
 * 满足即由 store 自动解锁(不花钱)。未满足时 UI 显示"???"与要求。
 */
export function mysteryReady(def: UpgradeDef, state: UpgradeState & { totalSlots?: number; loyalty?: number; av?: { shotCount?: number } }): boolean {
  if (!def.mystery) return false;
  if (getLevel(state.upgrades, def.id) >= def.maxLevel) return false;
  if (!requiresMet(def.requires, state)) return false;
  if (!bossStageMet(def, state)) return false;
  if (def.corruptionRequired != null && state.corruption < def.corruptionRequired) return false;
  if (def.requiresSlotsMax && (state.totalSlots ?? BASE_ACTION_SLOTS) < MAX_ACTION_SLOTS) return false;
  if (def.requiresAvShots != null && (state.av?.shotCount ?? 0) < def.requiresAvShots) return false;
  if (def.requiresLoyaltyBelow != null && (state.loyalty ?? 100) >= def.requiresLoyaltyBelow) return false;
  if (def.requiresUnlockedKey && (state as UpgradeState & { unlocked?: Record<string, boolean> }).unlocked?.[def.requiresUnlockedKey] !== true) return false;
  return true;
}

/** 当前所有"已达成条件待自动解锁"的???项 */
export function pendingMysteries(state: UpgradeState & { totalSlots?: number }): UpgradeDef[] {
  return UPGRADES.filter(d => d.mystery && mysteryReady(d, state));
}

/** 能否升级该项：???=揭晓后玩家免费手动解禁(不自动·防雪崩)→前置→满级→堕落门槛(粉金/分级)→资金，依次判定 */
/** Boss 前置判定(批F1): requiresBossStage 且该阶段 Boss 未击败 → 不可购/不可解禁 */
function bossStageMet(def: UpgradeDef, state: UpgradeState): boolean {
  if (def.requiresBossStage == null) return true;
  const regions = (state as UpgradeState & { regions?: Record<string, import('../turf/types').RegionState> }).regions;
  return isStageBossDefeated(regions, def.requiresBossStage);
}

export function canUpgrade(def: UpgradeDef, state: UpgradeState): UpgradeCheck {
  if (!bossStageMet(def, state)) return { ok: false, reason: `需先击败第${def.requiresBossStage}阶段的地盘Boss` };
  if (def.mystery) {
    if (getLevel(state.upgrades, def.id) >= def.maxLevel) return { ok: false, reason: '已解禁' };
    return mysteryReady(def, state)
      ? { ok: true }                                  // 揭晓且未解禁→可免费手动解禁(cost=0)
      : { ok: false, reason: '条件未满足(悬停查看)' };
  }
  if (!requiresMet(def.requires, state)) return { ok: false, reason: '前置未满足' };
  const lvl = getLevel(state.upgrades, def.id);
  if (lvl >= def.maxLevel) return { ok: false, reason: '已满级' };
  // 粉金混合节点:花钱+堕落度双门槛("堕落解锁的技艺")
  if (def.corruptionRequired != null && state.corruption < def.corruptionRequired) return { ok: false, reason: `需堕落度≥${def.corruptionRequired}` };
  const gate = def.corruptionGate?.[lvl]; // 升到 lvl+1（index=lvl）所需堕落度
  if (gate != null && state.corruption < gate) return { ok: false, reason: `需堕落度≥${gate}` };
  if (state.money < def.cost) return { ok: false, reason: '资金不足' };
  return { ok: true };
}

/**
 * 应用升级（扣钱+升级+效果作用）。调用方应先 canUpgrade。
 * combat 为派生(不写字段,由 combatBonus 汇总)；其余效果作用到对应状态字段(增量)。
 */
export function applyUpgrade<S extends UpgradeState>(state: S, def: UpgradeDef): S {
  const lvl = getLevel(state.upgrades, def.id);
  const e = def.effect;
  const d = e.perLevel ?? 0;
  const patch: Partial<UpgradeState> = {
    money: state.money - def.cost,
    upgrades: { ...(state.upgrades ?? {}), [def.id]: lvl + 1 },
  };
  switch (e.kind) {
    case 'combat': break;      // 派生(武器乘区)，不写字段
    case 'baseMartial': break; // 派生(每人基础武力)，不写字段
    case 'avPlayCap': break;   // 派生(AV玩法tag上限)，不写字段
    case 'prestigeMult': break;// 派生(威望增长系数)，不写字段
    case 'loyaltyDecayReduce': break; // 派生(减忠诚衰减)
    case 'condomDaily': break;        // 派生(避孕套送货上门)
    case 'scoutRate': break;          // 派生(刺探成功率)
    case 'avIncomeMult': break;       // 派生(AV收入乘区)
    case 'throughput':   patch.perSlotThroughput = (state.perSlotThroughput ?? 6) + d; break;
    case 'desireCap':    patch.desireCapacity = (state.desireCapacity ?? 60) + d; break;
    case 'actionSlots':  patch.totalSlots = Math.min(MAX_ACTION_SLOTS, (state.totalSlots ?? BASE_ACTION_SLOTS) + d); break;
    case 'purchaseMult': patch.purchaseUpgradeMult = (state.purchaseUpgradeMult ?? 1) + d; break;
    case 'turfFortify':  patch.turfFortifyBonus = (state.turfFortifyBonus ?? 0) + d; break;
    case 'occupyScale':  patch.occupyScale = (state.occupyScale ?? 0) + d; break;
    case 'unlock':
      if (e.unlockKey) patch.unlocked = { ...(state.unlocked ?? {}), [e.unlockKey]: true };
      break;
  }
  return { ...state, ...patch } as S;
}

/** 武器乘区加成（派生：Σ 各 combat 项等级×每级比例）。武力乘 (1+此值)。 */
export function combatBonus(upgrades: Record<string, number> | undefined): number {
  let bonus = 0;
  for (const def of UPGRADES) {
    if (def.effect.kind === 'combat') bonus += getLevel(upgrades, def.id) * (def.effect.perLevel ?? 0);
  }
  return bonus;
}
/** 武器乘区 = 1 + combatBonus（武力的一个独立乘区） */
export function weaponMult(upgrades: Record<string, number> | undefined): number {
  return 1 + combatBonus(upgrades);
}
/** 每人基础武力值 = 1 + Σ baseMartial 项（派生·与在场乘区相乘） */
export function baseMartialPerThug(upgrades: Record<string, number> | undefined): number {
  let bonus = 0;
  for (const def of UPGRADES) {
    if (def.effect.kind === 'baseMartial') bonus += getLevel(upgrades, def.id) * (def.effect.perLevel ?? 0);
  }
  return 1 + bonus;
}
/** AV 同时可选玩法tag上限 = 基础 + Σ avPlayCap 项 */
export const BASE_AV_PLAY_CAP = 2;
export function avPlayCap(upgrades: Record<string, number> | undefined): number {
  let bonus = 0;
  for (const def of UPGRADES) {
    if (def.effect.kind === 'avPlayCap') bonus += getLevel(upgrades, def.id) * (def.effect.perLevel ?? 0);
  }
  return BASE_AV_PLAY_CAP + bonus;
}
/** 威望增长系数 = 1 + Σ prestigeMult 项（威望进账乘此值） */
export function prestigeMultiplier(upgrades: Record<string, number> | undefined): number {
  let bonus = 0;
  for (const def of UPGRADES) {
    if (def.effect.kind === 'prestigeMult') bonus += getLevel(upgrades, def.id) * (def.effect.perLevel ?? 0);
  }
  return 1 + bonus;
}
/** 欲望增长乘区（性欲野兽解锁后 ×1.5） */
export function desireGrowthMult(unlocked: Record<string, boolean> | undefined): number {
  return unlocked?.lust_beast ? 1.5 : 1;
}
/** 刺探成功率加成（Σ scoutRate 项·布置暗探） */
export function scoutRateBonus(upgrades: Record<string, number> | undefined): number {
  let r = 0;
  for (const def of UPGRADES) {
    if (def.effect.kind === 'scoutRate') r += getLevel(upgrades, def.id) * (def.effect.perLevel ?? 0);
  }
  return r;
}
/** AV 销售收入乘区 = 1 + Σ avIncomeMult 项（观众来信等） */
export function avIncomeMultiplier(upgrades: Record<string, number> | undefined): number {
  let r = 0;
  for (const def of UPGRADES) {
    if (def.effect.kind === 'avIncomeMult') r += getLevel(upgrades, def.id) * (def.effect.perLevel ?? 0);
  }
  return 1 + r;
}
/** 忠诚每日衰减的减免总量（Σ loyaltyDecayReduce 项·"荒唐升级"如张贴照片链） */
export function loyaltyDecayReduction(upgrades: Record<string, number> | undefined): number {
  let r = 0;
  for (const def of UPGRADES) {
    if (def.effect.kind === 'loyaltyDecayReduce') r += getLevel(upgrades, def.id) * (def.effect.perLevel ?? 0);
  }
  return r;
}
/** 避孕套每日送货上门量（Σ condomDaily 项·后期便利·省主动采购） */
export function condomDailyFrom(upgrades: Record<string, number> | undefined): number {
  let c = 0;
  for (const def of UPGRADES) {
    if (def.effect.kind === 'condomDaily') c += getLevel(upgrades, def.id) * (def.effect.perLevel ?? 0);
  }
  return c;
}
