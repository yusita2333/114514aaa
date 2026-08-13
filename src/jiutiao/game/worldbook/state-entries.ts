// 大宅现行状态(批C3·v48 backlog) · 已购升级 → AI 全场景可引用的状态设定
// ============================================================
// 问题: "荒唐升级"(问好规矩/进食规矩/气味标记等)买了以后只有升级面板 desc 一句话,
//   AI 生成任何场景时都不知道这些状态存在——升级没有叙事后效。
// 方案: 注册表把已生效的升级映射为紧凑的状态设定文本,buildGamePrompt 在 system 注入
//   [大宅现行状态] 块。AI 写任何场景都能自然带出这些"已成日常"的规矩与氛围。
// 原则: 文本极紧凑(每条2-3行·常驻注入烧token);同链多档只取最高档;
//   写"现状是什么+哪类场景引用",不写完整演出(演出归各事件范式)。

import { deriveEventUnlocked } from '../engine/unlocked';
import type { EngineState } from '../engine/types';

export interface HouseStateEntry {
  id: string;
  /** 命中条件(unlocked 派生键 或 升级等级)。tier: 同组取声明顺序里最后一个命中的(高档覆盖低档) */
  match: (unlocked: Record<string, boolean | undefined>, upgrades: Record<string, number | undefined>) => boolean;
  /** 同组互斥(取组内最后一个命中=最高档) */
  group?: string;
  text: string;
}

export const HOUSE_STATE_ENTRIES: HouseStateEntry[] = [
  // ─── 会规(rule_code 荒唐链) ───
  {
    id: 'rule_greet',
    match: (u) => u.rule_greet === true,
    text: '【会规·问好的规矩】打手见到凛可以直接掏出肉棒,她必须向那根肉棒问好——更放肆的会要求她转身用小穴对着它问好,由龟头在穴口浅浅一顶算还礼。宅内任何路遇/开场都可能自然发生这套问候,凛已被迫习惯,但每次仍屈辱。',
  },
  {
    id: 'rule_meal',
    match: (u) => u.rule_meal === true,
    text: '【会规·进食的规矩】凛的嘴只被允许吃流食,固体食物由打手塞进她的小穴再"就着体温取食"。凡涉及吃饭/餐食的场景,这套仪式就是她的日常正餐——最寻常的进食已是羞耻仪式。',
  },
  // ─── 气味标记(m_scent·数值效果无unlock键→按升级等级) ───
  {
    id: 'scent_mark',
    match: (_u, up) => (up.m_scent ?? 0) >= 1,
    text: '【气味标记】凛的枕头、坐垫轮借给表现好的打手,还回来时沤透浓烈雄臭汗味,怎么洗都散不掉。她睡在、坐在别的男人的味道里——写嗅觉细节时,凛的房间与身上常带这层挥不去的雄臭。',
  },
  // ─── 深夜脚步(地下室·忠诚低) ───
  {
    id: 'dungeon_night',
    match: (u) => u.dungeon_night === true,
    text: '【深夜的脚步声】忠诚低落的时期,总有打手不打招呼就把凛带下隔音地下室——没人听得见,隔音工程成了他们肆意的底气。夜间场景可用"走廊尽头的脚步声"作背景压迫感,凛对深夜的声响会条件反射地绷紧。',
  },
  // ─── 陪练(道场·两档取高) ───
  {
    id: 'spar_grope', group: 'spar',
    match: (_u, up) => (up.m_spar1 ?? 0) >= 1,
    text: '【大小姐陪练】道场对练日的"活靶子"是凛——以指导受身、纠正姿势为名,打手的手在她身上四处揩油调戏。道场/操练场景里这是公开的日常。',
  },
  {
    id: 'spar_hold', group: 'spar',
    match: (_u, up) => (up.m_spar2 ?? 0) >= 1,
    text: '【大小姐陪练·固技】道场对练已进阶成实战:打手用摔跤固定技把凛压制在垫上动弹不得,就着压制姿势轮流贯穿,她的挣扎本身是练技的一部分。道场/操练场景里这是公开的日常,打手为练固技排队。',
  },
  // ─── 慰安加油(道场·三档取高) ───
  {
    id: 'cheer1', group: 'cheer',
    match: (_u, up) => (up.m_cheer1 ?? 0) >= 1,
    text: '【慰安加油】操练时凛被塞进暴露又滑稽的啦啦队服在场边加油鼓劲,羞耻的姿势与口号让全场士气高涨。操练/道场场景带上这道风景。',
  },
  {
    id: 'cheer2', group: 'cheer',
    match: (_u, up) => (up.m_cheer2 ?? 0) >= 1,
    text: '【慰安加油·裸体】啦啦队服也免了——操练时凛赤身裸体摆动作喊加油,晃动的身体是打手操练的活奖励。操练/道场场景带上这道风景。',
  },
  {
    id: 'cheer3', group: 'cheer',
    match: (_u, up) => (up.m_cheer3 ?? 0) >= 1,
    text: '【慰安加油·被轮着加油】操练时凛在场边被轮流贯穿,同时还得断续喊出加油口号,声音抖得不成调——越是这样打手越卖力。操练/道场场景里这是固定环节。',
  },
  // ─── 浴场(两档取高) ───
  {
    id: 'couple_bath', group: 'bath',
    match: (u) => u.couple_bath === true,
    text: '【鸳鸯浴】凛洗澡时总有复数打手"陪同":粗糙的手接管清洗,摸到有感觉了就用浴室常备的套侵犯,射满意了再继续洗瘫软的她。涉及沐浴/睡前的场景,这就是她的洗澡方式。',
  },
  {
    id: 'bath_serve', group: 'bath',
    match: (u) => u.bath_serve === true,
    text: '【浴场侍奉】大浴场建成后,凛的沐浴彻底变成浴场里的公共侍奉——热水蒸汽里被轮流使用是她每天的"洗澡"。涉及沐浴的场景按此现状写。',
  },
];

/**
 * 渲染[大宅现行状态]块。空=无已生效状态(不注入)。
 * 同 group 多档命中只取声明顺序最后一个(高档覆盖低档)。
 */
export function renderHouseStateBlock(state: EngineState): string {
  const unlocked = deriveEventUnlocked(state);
  const upgrades = state.upgrades ?? {};
  const byGroup = new Map<string, HouseStateEntry>();
  const solo: HouseStateEntry[] = [];
  for (const e of HOUSE_STATE_ENTRIES) {
    if (!e.match(unlocked, upgrades)) continue;
    if (e.group) byGroup.set(e.group, e); // 后声明覆盖前=取最高档
    else solo.push(e);
  }
  const active = [...solo, ...byGroup.values()];
  if (active.length === 0) return '';
  return '[大宅现行状态·已成日常的会规与氛围(写任何场景都应自然反映,不必每条都演,但不得与之矛盾)]\n'
    + active.map(e => e.text).join('\n');
}
