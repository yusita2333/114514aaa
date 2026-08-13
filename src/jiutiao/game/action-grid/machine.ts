// 行动格系统 · 状态机核心（纯函数，无副作用，便于单测）
// 设计：每个操作返回新的 DayState，不修改入参。错误用抛异常/返回校验结果区分。

import type {
  DayState, DayPhase, SlotPeriod, ActionSlot, SlotChoice, Allocation,
} from './types';

// ───────────────────────────────────────
// 构造
// ───────────────────────────────────────

/** 开始新的一天（早7点）：进入分配阶段 */
export function startDay(dayNumber: number, totalSlots: number): DayState {
  return {
    dayNumber,
    phase: 'allocating',
    totalSlots,
    dayCount: 0,
    nightCount: 0,
    daySlots: [],
    nightSlots: [],
    cursor: null,
  };
}

/**
 * 构造"强制请假轮奸日"（v3 §6.4·霸全）。夜晚欲望溢出后次日不进玩家分配：
 * - 白天/夜晚各占一半格（floor/ceil），每格=供奉，locked（玩家不可改派）。
 *   请假在家全天被轮奸，白天与夜晚都有供奉更符合逻辑（旧版白天0格不合理）。
 * - 有白天格则进 day_running 从白天第0格起逐格供奉；白天结束→进入夜晚续供奉。
 */
export function buildForcedLeaveDay(
  dayNumber: number, totalSlots: number, serveChoice: SlotChoice,
  eventName = '白日供奉',
): DayState {
  const dayCount = Math.floor(totalSlots / 2);
  const nightCount = totalSlots - dayCount;
  const lockedServeSlots = (period: SlotPeriod, count: number): ActionSlot[] =>
    Array.from({ length: count }, (_, i) => ({
      index: i,
      period,
      status: 'planned' as const,
      choice: serveChoice,
      locked: true,
      lockedBy: eventName,
    }));
  const hasDay = dayCount > 0;
  return {
    dayNumber,
    phase: hasDay ? 'day_running' : 'day_settled',
    totalSlots,
    dayCount,
    nightCount,
    daySlots: lockedServeSlots('day', dayCount),
    nightSlots: lockedServeSlots('night', nightCount),
    cursor: hasDay ? { period: 'day', index: 0 } : null,
    forcedLeave: true,
  };
}

// ───────────────────────────────────────
// 分配（allocating 阶段）
// ───────────────────────────────────────

export interface AllocResult {
  ok: boolean;
  error?: string;
  state?: DayState;
}

/**
 * 分配白天/夜晚格数。X+Y 必须 == totalSlots。
 * 请假 = dayCount:0（全给夜晚），是合法的极端分配。
 */
export function allocate(state: DayState, alloc: Allocation): AllocResult {
  if (state.phase !== 'allocating') {
    return { ok: false, error: `当前阶段 ${state.phase} 不可分配` };
  }
  const { dayCount, nightCount } = alloc;
  if (!Number.isInteger(dayCount) || !Number.isInteger(nightCount) || dayCount < 0 || nightCount < 0) {
    return { ok: false, error: '格数必须是非负整数' };
  }
  if (dayCount + nightCount !== state.totalSlots) {
    return { ok: false, error: `白天(${dayCount})+夜晚(${nightCount}) 必须等于总格数 ${state.totalSlots}` };
  }
  // 重新分配时保留已安排的选项(按时段+序号对应),避免拉动滑块把选过的事件格清空。
  // 缩减格数时超出范围的选项自然丢弃;时段仍为 allocating,选项只是 planned 未执行。
  const keepSlots = (period: SlotPeriod, count: number, prev: ActionSlot[]): ActionSlot[] =>
    Array.from({ length: count }, (_, i) => {
      const old = prev[i];
      if (old?.choice) return { index: i, period, status: 'planned' as const, choice: old.choice };
      return { index: i, period, status: 'empty' as const, choice: null };
    });
  return {
    ok: true,
    state: {
      ...state,
      dayCount,
      nightCount,
      daySlots: keepSlots('day', dayCount, state.daySlots),
      nightSlots: keepSlots('night', nightCount, state.nightSlots),
    },
  };
}

// ───────────────────────────────────────
// 安排选项（仍在 allocating，或对应时段尚未执行该格）
// ───────────────────────────────────────

function slotsOf(state: DayState, period: SlotPeriod): ActionSlot[] {
  return period === 'day' ? state.daySlots : state.nightSlots;
}

function withSlots(state: DayState, period: SlotPeriod, slots: ActionSlot[]): DayState {
  return period === 'day' ? { ...state, daySlots: slots } : { ...state, nightSlots: slots };
}

/** 给某格安排选项（empty→planned）。locked 格不可改派。 */
export function setChoice(
  state: DayState, period: SlotPeriod, index: number, choice: SlotChoice,
): DayState {
  const slots = slotsOf(state, period);
  const slot = slots[index];
  if (!slot) throw new Error(`格不存在: ${period}#${index}`);
  if (slot.locked) throw new Error(`该格被事件「${slot.lockedBy}」强占，不可改派`);
  if (slot.status === 'running' || slot.status === 'done') {
    throw new Error(`该格已执行(${slot.status})，不可改派`);
  }
  const next = slots.map((s, i) =>
    i === index ? { ...s, choice, status: 'planned' as const } : s);
  return withSlots(state, period, next);
}

/** 清空某格选项（planned→empty）。 */
export function clearChoice(state: DayState, period: SlotPeriod, index: number): DayState {
  const slots = slotsOf(state, period);
  const slot = slots[index];
  if (!slot) throw new Error(`格不存在: ${period}#${index}`);
  if (slot.locked) throw new Error(`该格被事件强占，不可清空`);
  if (slot.status === 'running' || slot.status === 'done') {
    throw new Error(`该格已执行，不可清空`);
  }
  const next = slots.map((s, i) =>
    i === index ? { ...s, choice: null, status: 'empty' as const } : s);
  return withSlots(state, period, next);
}

/** 事件系统强占某格（强占/霸全）：锁定且写入来源事件名。 */
export function lockSlot(
  state: DayState, period: SlotPeriod, index: number, eventName: string, choice: SlotChoice,
): DayState {
  const slots = slotsOf(state, period);
  if (!slots[index]) throw new Error(`格不存在: ${period}#${index}`);
  const next = slots.map((s, i) =>
    i === index ? { ...s, choice, status: 'planned' as const, locked: true, lockedBy: eventName } : s);
  return withSlots(state, period, next);
}

/**
 * 插入事件专属临时格（v3 §10）。用于强制事件无空格可强占时（如避孕套归零）。
 * - 不占当日预算：dayCount/nightCount/totalSlots 不变（临时格是预算外的额外格）。
 * - 插入位置：若该时段正在执行（cursor 指向本时段），插在当前 cursor 之后→下一格即执行；
 *   否则追加到末尾。插入后重排 index 保持连续，使 cursor/结算逻辑一致。
 * - 临时格 locked+inserted+planned，玩家不可改派。
 */
export function insertEventSlot(
  state: DayState, period: SlotPeriod, eventName: string, choice: SlotChoice,
): DayState {
  const slots = slotsOf(state, period);
  const at = (state.cursor && state.cursor.period === period)
    ? state.cursor.index + 1
    : slots.length;
  const newSlot: ActionSlot = {
    index: at, period, status: 'planned', choice,
    locked: true, lockedBy: eventName, inserted: true,
  };
  const merged = [...slots.slice(0, at), newSlot, ...slots.slice(at)];
  const renumbered = merged.map((s, i) => ({ ...s, index: i }));
  return withSlots(state, period, renumbered);
}

// ───────────────────────────────────────
// 提交校验（空格不能提交）
// ───────────────────────────────────────

export interface SubmitCheck {
  ok: boolean;
  error?: string;
  emptyIndexes?: number[];
}

/**
 * 校验某时段能否提交执行。规则（设计稿）：
 * - 该时段所有格必须非 empty（"空选项不能提交"）。
 * - 用户可"只排第一格"就提交——但当前实现要求每个已分配的格都要有内容。
 *   注：设计稿"可只排第一格"指逐格推进时可边走边排；MVP 先要求全排满，
 *   后续若要支持"边排边走"，再放宽为"至少第一格非空"。
 */
export function checkSubmit(state: DayState, period: SlotPeriod): SubmitCheck {
  const slots = slotsOf(state, period);
  if (slots.length === 0) {
    return { ok: true }; // 该时段0格（如请假时白天0格），直接通过
  }
  const emptyIndexes = slots.filter(s => s.status === 'empty').map(s => s.index);
  if (emptyIndexes.length > 0) {
    return { ok: false, error: `有空格未安排：${emptyIndexes.join(',')}`, emptyIndexes };
  }
  return { ok: true };
}

// ───────────────────────────────────────
// 阶段流转与逐格推进
// ───────────────────────────────────────

/** 从分配阶段进入白天执行（边走边排：不强制全填，执行时逐格校验当前格有无选项） */
export function beginDay(state: DayState): DayState {
  if (state.phase !== 'allocating') throw new Error(`阶段错误: ${state.phase}`);
  // 白天0格则直接跳到白天结算（请假场景）
  if (state.dayCount === 0) {
    return { ...state, phase: 'day_settled', cursor: null };
  }
  return { ...state, phase: 'day_running', cursor: { period: 'day', index: 0 } };
}

/** 标记当前 cursor 格为进行中（调AI/mock前） */
export function markRunning(state: DayState): DayState {
  if (!state.cursor) throw new Error('无当前执行格');
  const { period, index } = state.cursor;
  const slots = slotsOf(state, period);
  const next = slots.map((s, i) => i === index ? { ...s, status: 'running' as const } : s);
  return withSlots(state, period, next);
}

/** 完成当前 cursor 格（写入结果文本），推进 cursor 到下一格；本时段完则进入结算 */
export function completeCurrent(state: DayState, resultText: string, wasFirst?: boolean): DayState {
  if (!state.cursor) throw new Error('无当前执行格');
  const { period, index } = state.cursor;
  const slots = slotsOf(state, period);
  const nextSlots = slots.map((s, i) =>
    i === index ? { ...s, status: 'done' as const, resultText, ...(wasFirst ? { wasFirst: true } : {}) } : s);
  let s2 = withSlots(state, period, nextSlots);

  const isLast = index >= slots.length - 1;
  if (!isLast) {
    return { ...s2, cursor: { period, index: index + 1 } };
  }
  // 本时段最后一格完成 → 结算
  if (period === 'day') {
    return { ...s2, phase: 'day_settled', cursor: null };
  }
  return { ...s2, phase: 'night_settled', cursor: null };
}

/** 白天结算后进入夜晚执行（边走边排：不强制全填） */
export function beginNight(state: DayState): DayState {
  if (state.phase !== 'day_settled') throw new Error(`阶段错误: ${state.phase}`);
  if (state.nightCount === 0) {
    return { ...state, phase: 'night_settled', cursor: null };
  }
  return { ...state, phase: 'night_running', cursor: { period: 'night', index: 0 } };
}

/** 当前执行格（便捷读取） */
export function currentSlot(state: DayState): ActionSlot | null {
  if (!state.cursor) return null;
  return slotsOf(state, state.cursor.period)[state.cursor.index] ?? null;
}

/** 一键填充某时段所有空格为指定选项（如夜晚全供奉，省去逐格填）。locked/已执行格跳过。 */
export function fillEmpty(
  state: DayState, period: SlotPeriod, choice: SlotChoice,
): DayState {
  const slots = slotsOf(state, period);
  const next = slots.map(s =>
    (s.status === 'empty' && !s.locked)
      ? { ...s, choice, status: 'planned' as const }
      : s);
  return withSlots(state, period, next);
}
