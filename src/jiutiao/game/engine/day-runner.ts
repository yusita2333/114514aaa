// 一天编排器（day-runner）：连接 action-grid 状态机 与 engine.settleSlot。
// 职责：执行"当前 cursor 格" = markRunning → settleSlot(引擎结算) → completeCurrent(写正文+推进)。
// 把行动格的 DayState 与引擎的 EngineState 两份状态一起推进。纯逻辑(AI经AiPort)，可测。

import {
  markRunning, completeCurrent, currentSlot, startDay, buildForcedLeaveDay, insertEventSlot, lockSlot,
} from '../action-grid/machine';
import { settleSlot, PROSE_MIN_LEN } from './machine';
import { settleServe, settleBuyCondoms, settleDaily } from './settlement';
import { applyBodyCounts } from './body-counts';
import {
  CONST, slidingWindowRelief, settleRecruit, dailyDesireDemand, desireOverflow, availableThugs,
  gainLoyalty, settleRewardThugs, settleProtectionFee, presentCountFrom, appendMoneyLog,
} from '../economy/machine';
import { totalShops } from '../turf/machine';
import { desireGrowthMult, BASE_ACTION_SLOTS, MAX_ACTION_SLOTS, WALK_PER_SLOT } from '../upgrade/machine';
import { scanForced } from '../events/machine';
import { appendLog, appendContinuity, appendProse, upsertSummary, proseEntryId } from '../memory/machine';
import { recruitFlavorLine } from './recruit-copy';
import { deriveEventUnlocked } from './unlocked';
import type { LogEntry } from '../memory/machine';
import type { ForcedEvent } from '../events/machine';
import type { ForcedContext } from '../events/types';
import type { DailySettleResult } from './settlement';
import type { DayState, SlotPeriod, SlotChoice } from '../action-grid/types';
import type { EngineState, SettleOptions, SettleResult } from './types';

/** 从 EngineState 构造强制事件扫描上下文 */
export function forcedContextOf(engine: EngineState): ForcedContext {
  return {
    corruption: engine.corruption,
    cognition: engine.cognition,
    infamy: engine.infamy,
    thugs: engine.thugTotal,
    triggeredLedger: engine.triggeredSpecials,
    unlocked: deriveEventUnlocked(engine),
    condomStock: engine.condomStock,
    threatLevel: engine.threatLevel ?? 0,
    bodyDevelopment: engine.bodyDevelopment,
    erosionLastDay: engine.erosionLastDay,
  };
}

/**
 * 扫描并应用"临时格"强制事件（insert_slot，如避孕套归零）。
 * 在某时段执行中调用：命中则在 cursor 后插入事件专属临时格，并标记 once 账本。
 * 返回新 day/engine + 触发的事件（null=未触发）。
 */
export function applyForcedInserts(
  day: DayState, engine: EngineState, pool: ForcedEvent[] | undefined, period: SlotPeriod,
  rng: () => number = Math.random,
): { day: DayState; engine: EngineState; fired: ForcedEvent | null } {
  if (!pool || pool.length === 0) return { day, engine, fired: null };
  const inserts = pool.filter(e => e.intensity === 'insert_slot');
  // 批C1: 扫描上下文补充 时段/天数/随机数(daily_erosion 白天概率触发+同日去重)
  const scanCtx: ForcedContext = {
    ...forcedContextOf(engine), period, dayNumber: day.dayNumber, roll: rng(),
  };
  const ev = scanForced(inserts, scanCtx);
  if (!ev) return { day, engine, fired: null };
  const day2 = insertEventSlot(day, period, ev.label, { optionId: ev.optionId, label: ev.label });
  const ctx = scanCtx;
  // 应用 once 标签 + onApply 副作用补丁（如 E3 真播种 → pregnant=true）
  let engine2: EngineState = engine;
  if (ev.once && ev.ledgerKey) {
    engine2 = { ...engine2, triggeredSpecials: { ...engine2.triggeredSpecials, [ev.ledgerKey]: true } };
  }
  if (ev.onApply) {
    engine2 = { ...engine2, ...ev.onApply(ctx) } as EngineState;
  }
  return { day: day2, engine: engine2, fired: ev };
}

/**
 * 扫描并应用"强占"强制事件（seize_slot，如地盘骚扰/火并防守）。
 * 分配后调用：命中则锁定一格（白天优先，无白天格则夜晚），玩家不可改派。
 * 返回新 day + 触发的事件（null=未触发）。强占类一般非一次性（骚扰高频）。
 */
export function applyForcedSeizes(
  day: DayState, engine: EngineState, pool: ForcedEvent[] | undefined,
): { day: DayState; fired: ForcedEvent | null } {
  if (!pool || pool.length === 0) return { day, fired: null };
  const seizes = pool.filter(e => e.intensity === 'seize_slot');
  const ev = scanForced(seizes, forcedContextOf(engine));
  if (!ev) return { day, fired: null };
  const period: SlotPeriod = day.dayCount > 0 ? 'day' : 'night';
  const slots = period === 'day' ? day.daySlots : day.nightSlots;
  if (slots.length === 0) return { day, fired: null }; // 该时段无格可强占
  const day2 = lockSlot(day, period, 0, ev.label, { optionId: ev.optionId, label: ev.label });
  return { day: day2, fired: ev };
}

/** 一天 + 引擎 的合并状态（前端持有的总状态切片） */
export interface RunnerState {
  day: DayState;
  engine: EngineState;
}

export interface RunSlotResult {
  state: RunnerState;
  settle: SettleResult;
  /** 供奉类格子的结算（非供奉格为 null）：避孕套 + 当场降欲 */
  serve?: { condomUsed: number; condomShort: boolean; served: number; desireRelieved: number } | null;
  /** 招募格的即时结算（非招募格为 null）：当场招到的人数/花费 */
  recruit?: { recruited: number; cost: number; reason?: 'no_quota' | 'no_money' } | null;
  /** 采购避孕套格的即时结算（非采购格为 null）：当场买到的套数/花费 */
  buyCondom?: { bought: number; cost: number; reason?: 'no_money' } | null;
  /** 犒赏打手格的即时结算（非犒赏格为 null）：忠诚加成/花费 */
  reward?: { gained: number; reason?: 'no_money' } | null;
  /** 庭院散步的体质计数结算（非散步格为 null）：当前计数/是否+1格/是否已到上限 */
  walk?: { count: number; gained: boolean; capped: boolean } | null;
  /** 庭院群交结算（非该格为 null）：挥霍掉的避孕套数(库存清零) */
  orgy?: { wasted: number } | null;
  /** 收保护费格的即时结算（非保护费格为 null）：到账金钱 */
  protection?: { income: number } | null;
  /** 本格触发的临时格强制事件（如避孕套归零），null=无 */
  forcedInsert?: ForcedEvent | null;
  /** 本格的结构化日志条目（供正文留档/UI 复用） */
  logEntry: LogEntry;
}

/**
 * 执行当前 cursor 指向的行动格：
 *  1. markRunning：行动格标记进行中（UI 显示"进行中"）。
 *  2. settleSlot：引擎跑流水线（选范式/AI或快进/抓数值/防胡诌/堕落），返回正文+新EngineState。
 *  3. completeCurrent：把正文写回该格，推进 cursor（本时段完则结算）。
 * 返回合并后的新状态 + 本格结算详情（events 供 UI 提示堕落/奖励闸门）。
 */
export async function runCurrentSlot(
  state: RunnerState,
  opts: SettleOptions,
): Promise<RunSlotResult> {
  const slot = currentSlot(state.day);
  if (!slot) throw new Error('无当前执行格');
  if (!slot.choice) throw new Error(`当前格未安排选项: ${slot.period}#${slot.index}`);

  const dayRunning = markRunning(state.day);

  // 供奉吞吐倍率(请假轮奸日×1.5)——传给 settleSlot,让叙事人数与下方 settleServe 结算同源
  const serveMult = state.day.forcedLeave ? CONST.请假轮奸吞吐倍率 : 1;
  // 招募文案变体(批C1): 按 极道威望vs淫名 占比选风味线,注入 AI 路径的文案方向(prompt.ts flavorHint);
  // 快进路径在结算后用 recruitSummaryText 覆盖模板。
  const recruitFlavor = slot.choice.optionId === 'recruit'
    ? recruitFlavorLine(state.engine.martialPrestige, state.engine.infamy, opts.rng ?? Math.random)
    : undefined;
  const settle = await settleSlot(state.engine, {
    optionId: slot.choice.optionId,
    params: recruitFlavor ? { ...slot.choice.params, flavorHint: recruitFlavor } : slot.choice.params,
  }, { ...opts, serveMult, dayNumber: state.day.dayNumber });

  // 供奉类格子：执行后扣避孕套 + 当场降欲 + 计入被供奉人数（由 EventOption.isServe 判定）
  let engine = settle.state;
  let serve: RunSlotResult['serve'] = null;
  const serveOpt = opts.eventOptions[slot.choice.optionId];
  if (serveOpt?.isServe) {
    const mult = serveMult;
    // 口交等非插入供奉(noCondom)不耗避孕套 → 最终降欲×0.5(零套成本收益减半)
    // 批H8: 白日供奉降欲从设计初期即已落实(本格 isServe→settleServe 当场降欲+1.5吞吐),
    // H7 临时加的 1.1 倍率按用户指示删除。软卡死出口=滑动窗口保底(见 runner-store 请假窗口接线修复)。
    const sr = settleServe(engine, mult, !serveOpt.noCondom, serveOpt.noCondom ? CONST.无套供奉降欲倍率 : 1);
    engine = sr.state;
    serve = { condomUsed: sr.condomUsed, condomShort: sr.condomShort, served: sr.served, desireRelieved: sr.desireRelieved };
    // 供奉 → 淫乱忠诚 +（打手被肉体收买）。性欲野兽升级:肉体收买加倍见效(×2)
    const lg = CONST.供奉忠诚加成 * (engine.unlocked?.lust_beast ? 2 : 1);
    engine = { ...engine, loyalty: gainLoyalty(engine.loyalty, lg), loyaltyInfamy: (engine.loyaltyInfamy ?? 0) + lg };
    // 折线图:今日避孕套消耗累加
    if (sr.condomUsed > 0) engine = { ...engine, condomUsedToday: (engine.condomUsedToday ?? 0) + sr.condomUsed };
  }

  const dayNo0 = state.day.dayNumber;
  // 招募格：即时结算（当场招人、扣钱、扣额度，玩家立刻看到打手数变化，而非日终）
  let recruit: RunSlotResult['recruit'] = null;
  if (slot.choice.optionId === 'recruit') {
    const rr = settleRecruit(engine.thugTotal, engine.money, engine.recruitQuota, opts.rng);
    engine = { ...engine, thugTotal: rr.thugTotal, money: rr.money, recruitQuota: rr.recruitQuota };
    if (rr.cost > 0) engine = { ...engine, moneyLog: appendMoneyLog(engine.moneyLog, dayNo0, `招募${rr.recruited}打手`, -rr.cost) };
    recruit = { recruited: rr.recruited, cost: rr.cost, reason: rr.reason };
    // 快进路径: 通用模板换成 风味线+结果 的完整文案(批C1·10变体)
    if (settle.events.renderMode === 'fast_summary' && recruitFlavor) {
      settle.resultText = `${recruitFlavor}\n${rr.recruited > 0 ? `本次招入 ${rr.recruited} 名打手,花费 ¥${rr.cost}。` : '本次没有招到人(额度已尽或资金不足)。'}`;
    }
  }

  // 采购避孕套格：即时结算（当场加库存、扣钱）
  let buyCondom: RunSlotResult['buyCondom'] = null;
  if (slot.choice.optionId === 'buy_condoms') {
    const br = settleBuyCondoms(engine);
    engine = br.state;
    if (br.cost > 0) engine = { ...engine, moneyLog: appendMoneyLog(engine.moneyLog, dayNo0, `采购${br.bought}避孕套`, -br.cost) };
    buyCondom = { bought: br.bought, cost: br.cost, reason: br.reason };
  }

  // 犒赏打手格：即时结算（发钱 → 极道忠诚 +）
  let reward: RunSlotResult['reward'] = null;
  if (slot.choice.optionId === 'reward_thugs') {
    const before = engine.money;
    const rr = settleRewardThugs(engine.money, engine.loyalty, engine.loyaltyMartial ?? 0);
    engine = { ...engine, money: rr.money, loyalty: rr.loyalty, loyaltyMartial: rr.martialPart };
    if (before - rr.money > 0) engine = { ...engine, moneyLog: appendMoneyLog(engine.moneyLog, dayNo0, '犒赏打手', -(before - rr.money)) };
    reward = { gained: rr.gained, reason: rr.reason };
  }

  // 收保护费格：即时结算（按店铺数到账金钱）
  let protection: RunSlotResult['protection'] = null;
  if (slot.choice.optionId === 'protection') {
    const income = settleProtectionFee(totalShops(engine.regions), engine.stability ?? 100);
    engine = { ...engine, money: engine.money + income, moneyLog: appendMoneyLog(engine.moneyLog, dayNo0, '收保护费', income) };
    protection = { income };
  }

  // 庭院散步格(含玩具散步/遛母狗顶替态)：体质计数+1;满10→行动格+1(硬上限15后不再产生收益)
  let walk: RunSlotResult['walk'] = null;
  if (slot.choice.optionId === 'garden_walk') {
    const total = engine.totalSlots ?? BASE_ACTION_SLOTS;
    if (total >= MAX_ACTION_SLOTS) {
      walk = { count: engine.walkCount ?? 0, gained: false, capped: true };
    } else {
      let c = (engine.walkCount ?? 0) + 1;
      let t = total, gained = false;
      if (c >= WALK_PER_SLOT) { c = 0; t = Math.min(MAX_ACTION_SLOTS, t + 1); gained = true; }
      engine = { ...engine, walkCount: c, totalSlots: t };
      walk = { count: c, gained, capped: false };
    }
  }

  // 庭院群交格：打手们挥霍光库存避孕套(清零→可触发避孕套归零强制链)
  let orgy: RunSlotResult['orgy'] = null;
  if (slot.choice.optionId === 'garden_orgy') {
    orgy = { wasted: engine.condomStock };
    engine = { ...engine, condomStock: 0, condomUsedToday: (engine.condomUsedToday ?? 0) + engine.condomStock };
  }

  // 强制临时格扫描（如避孕套归零）：在完成当前格【前】插入，使其成为下一格立即执行。
  let dayForInsert = dayRunning;
  let forcedInsert: ForcedEvent | null = null;
  {
    const fi = applyForcedInserts(dayForInsert, engine, opts.forcedPool, slot.period, opts.rng ?? Math.random);
    dayForInsert = fi.day; engine = fi.engine; forcedInsert = fi.fired;
    // daily_erosion 触发→记天数(同日去重)
    if (fi.fired?.id === 'daily_erosion') engine = { ...engine, erosionLastDay: state.day.dayNumber };
  }

  // 记忆层:每格写结构化日志(代码·覆盖所有格) + 代码可知的延续摘要(认知跨档/首次)
  const dayNo = state.day.dayNumber;
  // 分层记忆(批B6):正文尾部入原文档案。AI正文→待后台小总结;快进总结词自身即总结→直落小总结。
  {
    const text = (settle.resultText ?? '').trim();
    const isFast = settle.events.renderMode === 'fast_summary';
    const pid = proseEntryId(dayNo, slot.period, slot.index);
    if (text.length >= PROSE_MIN_LEN) {
      engine = {
        ...engine,
        proseArchive: appendProse(engine.proseArchive, {
          id: pid, day: dayNo, period: slot.period, slot: slot.index,
          label: slot.choice.label, text, needsSummary: !isFast, // 批F2: 档案存完整正文(留档页回看/补救收藏用),注入时才截断
        }, dayNo),
        ...(isFast ? {
          eventSummaries: upsertSummary(engine.eventSummaries, { id: pid, day: dayNo, label: slot.choice.label, text }, dayNo),
        } : {}),
      };
    } else if (isFast && text) {
      // 批H7(用户反馈:快进事件无记录→时间线割裂): 快进一句话结算(<20字)此前完全不进记忆,
      // 快进两周=记忆两周空白,下段AI正文当场无缝续写旧正文。现无条件按"第N天·事件:结果"
      // 进小总结层作时间线刻度(不入 proseArchive,避免一句话占用[最近原文]的位置)。
      engine = {
        ...engine,
        eventSummaries: upsertSummary(engine.eventSummaries, { id: pid, day: dayNo, label: slot.choice.label, text }, dayNo),
      };
    }
  }
  const logEntry = {
    day: dayNo, period: slot.period, slot: slot.index,
    eventId: slot.choice.optionId, label: slot.choice.label,
    presentCount: engine.presentCount,
    corruptionDelta: settle.events.corruptionGain || undefined,
    renderMode: settle.events.renderMode,
    tags: settle.events.isFirstSpecial ? ['首次'] : undefined,
  };
  engine = { ...engine, narrativeLog: appendLog(engine.narrativeLog, logEntry) };
  // 部位计数(批I1·代码驱动): 供奉类用结算served+套数;其它NSFW映射事件用在场数。
  {
    const servedN = serve?.served ?? (settle.events.isNsfw ? engine.presentCount : 0);
    engine = {
      ...engine,
      bodyCounts: applyBodyCounts(engine.bodyCounts, {
        optionId: slot.choice.optionId,
        served: servedN,
        condomUsed: serve?.condomUsed ?? 0,
        condomShort: serve?.condomShort ?? false,
        noCondom: serveOpt?.noCondom === true,
        cognition: engine.cognition,
      }),
    };
  }

  // 临盆产后钩子(批H7·用户反馈:选临盆后依然怀孕): 妊娠系统此前只有"进"(E3真播种 pregnant=true)
  // 没有"出"。临盆事件执行完 → 怀孕解除+产次+1+里程碑笔记(孕期供奉/临盆选项随 pregnant_line 自然锁回)。
  if (slot.choice.optionId === 'birth_rape' && engine.pregnant) {
    engine = {
      ...engine, pregnant: false, birthCount: (engine.birthCount ?? 0) + 1,
      continuityNotes: appendContinuity(engine.continuityNotes, {
        day: dayNo, kind: 'turning', text: `临盆分娩完成(第${(engine.birthCount ?? 0) + 1}胎)·怀孕状态解除`,
      }),
    };
  }

  // 认知防线跨档:代码 turning 笔记(总记,影响后续基调)
  if (settle.events.cognitionAdvancedTo) {
    engine = { ...engine, continuityNotes: appendContinuity(engine.continuityNotes, {
      day: dayNo, kind: 'turning', text: `认知防线→${settle.events.cognitionAdvancedTo}`,
    }) };
  }
  // 桶4延续摘要:AI 吐了一句(needsContinuity事件)→entity 笔记(富);否则首次特殊→代码 milestone 笔记(兜底)
  if (settle.events.continuity) {
    engine = { ...engine, continuityNotes: appendContinuity(engine.continuityNotes, {
      day: dayNo, kind: 'entity', text: settle.events.continuity,
    }) };
  } else if (settle.events.isFirstSpecial) {
    engine = { ...engine, continuityNotes: appendContinuity(engine.continuityNotes, {
      day: dayNo, kind: 'milestone', text: `首次·${slot.choice.label}`,
    }) };
  }

  // 批L: 记下"本格走的是首次里程碑范式",供事后【重新生成本格正文】还原同一范式
  const dayDone = completeCurrent(dayForInsert, settle.resultText, settle.events.isFirstSpecial);

  // 在场打手数刷新(每格结算后·忠诚越高越易刷高)。白天在场≤总-派驻(派驻的白天不在场);夜晚派驻回来,不限。
  const _nextPeriod = dayDone.cursor?.period;
  const _presentCap = _nextPeriod === 'night' ? engine.thugTotal : availableThugs(engine.thugTotal, engine.garrison);
  engine = { ...engine, presentCount: presentCountFrom(engine.thugTotal, engine.loyalty, (opts.rng ?? Math.random)(), _presentCap) };

  return {
    state: { day: dayDone, engine },
    settle, serve, recruit, buyCondom, reward, protection, walk, orgy, forcedInsert, logEntry,
  };
}

/** 进入次日的结果 */
export interface NextDayResult {
  engine: EngineState;
  day: DayState;
  daily: DailySettleResult;
  forcedLeave: boolean;   // 次日是否被强制请假轮奸霸全
  reliefCleared: boolean; // 本次是否触发滑动窗口保底清空欲望
}

/**
 * 推进到次日（纯函数，便于单测）。
 *  1. settleDaily：每日收尾（招募刷新/武力/硬失败）。
 *  2. 记录今日请假状态进滑动窗口，评估保底：近期请假够多且欲望未到天文数字→清空欲望（软卡死出口）。
 *  3. 若 engine.pendingForcedLeave（昨晚欲望溢出）→ 构造强制请假轮奸日（霸全），并清除标记。
 *     否则 → 正常 startDay 进玩家分配。
 * @param wasLeaveDay 刚结束的这天是否为请假日（白天0格）。计入滑动窗口。
 */
export function advanceToNextDay(
  engine: EngineState,
  currentDayNumber: number,
  totalSlots: number,
  serveChoice: SlotChoice,
  wasLeaveDay = false,
): NextDayResult {
  const daily = settleDaily(engine, currentDayNumber);
  // 滑动窗口保底：记录今日请假→评估是否清空欲望
  const history = [...(daily.state.leaveHistory ?? []), wasLeaveDay].slice(-CONST.保底窗口长);
  const relief = slidingWindowRelief(history, daily.state.desire);
  let next: EngineState = { ...daily.state, leaveHistory: history, desire: relief.desire };

  // —— 请假轮奸判定：对"结余欲望"(当天供奉后剩下的)判定，在加次日晨间累积【之前】。 ——
  //    晨间累积不参与判定，避免打手数 > 欲望槽时永远触发(用户明确约束)。
  //    pendingForcedLeave 是个别事件可能置的旁路信号，一并消费。
  const overflow = desireOverflow(next.desire, next.desireCapacity) || !!next.pendingForcedLeave;

  // —— 次日晨间欲望累积(按可用打手数·性欲野兽×1.5) + 重置今日供奉计数 ——
  const influx = Math.round(dailyDesireDemand(availableThugs(next.thugTotal, next.garrison)) * desireGrowthMult(next.unlocked));
  next = {
    ...next,
    desire: next.desire + influx,
    desireAddedThisMorning: influx,
    servedThisNight: 0,
    pendingForcedLeave: false, // 判定已消费
    presentCount: presentCountFrom(next.thugTotal, next.loyalty, Math.random(), availableThugs(next.thugTotal, next.garrison)), // 次日晨(白天)在场≤总-派驻
  };

  const newDayNumber = currentDayNumber + 1;
  if (overflow) {
    return {
      engine: next,
      day: buildForcedLeaveDay(newDayNumber, totalSlots, serveChoice),
      daily, forcedLeave: true, reliefCleared: relief.cleared,
    };
  }
  return {
    engine: next,
    day: startDay(newDayNumber, totalSlots),
    daily, forcedLeave: false, reliefCleared: relief.cleared,
  };
}

export { settleNight, settleDaily } from './settlement';
