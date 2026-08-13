// 经期系统（纯函数）· 设计正典 §批注(去医学化只分安全期/危险期)
// 危险期:受孕率↑(生育线用) + 套消耗倍率↑(condomCost 已按 isDangerousPeriod ×1.5) + 在场人数易刷高(prompt场景提示)。
// 周期推进每日一步,翻转 isDangerousPeriod。数值占位待调平。

/** 周期常数(占位):周期长度 + 危险期窗口[start,end) */
export const CYCLE = {
  length: 14,
  dangerStart: 6,
  dangerEnd: 10, // 第6-9天=危险期(4天/14天)
} as const;

/** 危险期受孕率倍率(生育线怀孕判定用) */
export const DANGER_CONCEPTION_MULT = 3;

/** 某周期日是否危险期 */
export function isDangerDay(cycleDay: number): boolean {
  const d = ((cycleDay % CYCLE.length) + CYCLE.length) % CYCLE.length;
  return d >= CYCLE.dangerStart && d < CYCLE.dangerEnd;
}

/** 推进一天:返回新周期日 + 是否危险期 */
export function advanceCycle(cycleDay: number): { cycleDay: number; isDangerousPeriod: boolean } {
  const next = (((cycleDay ?? 0) + 1) % CYCLE.length);
  return { cycleDay: next, isDangerousPeriod: isDangerDay(next) };
}
