// 威望系统 · 核心逻辑（纯函数）
// 威望 = 极道威望 + 淫名（淫名仅 AV 解锁后引入）。
// 极道威望靠打架/火并/复仇；淫名靠拍AV/轮奸规模/肉体名气。占比决定游戏风味。
// 本模块管：AV 解锁判定（淫名闸门）。威望增益与硬失败审核见 C2。

/** AV 解锁标记键（存于 EngineState.unlocked）。解锁后淫名机制才引入。 */
export const AV_UNLOCK_KEY = 'av';

/** AV（暗网摄影室）是否已解锁。决定淫名是否计入总威望。 */
export function isAvUnlocked(unlocked: Record<string, boolean>): boolean {
  return unlocked[AV_UNLOCK_KEY] === true;
}

/**
 * 极道威望进账（来源：打架/火并/复仇胜利）。
 * 同时累加 martialGainToday（当日流量，供每日硬失败审核），martialPrestige 为累计值。
 */
export function gainMartialPrestige(
  s: { martialPrestige: number; martialGainToday: number }, amount: number,
): { martialPrestige: number; martialGainToday: number } {
  const amt = Math.max(0, amount);
  return {
    martialPrestige: s.martialPrestige + amt,
    martialGainToday: s.martialGainToday + amt,
  };
}

/** 淫名进账（来源：拍AV/轮奸规模/肉体名气）。调用方须确保 AV 已解锁（淫名机制 AV 后才引入）。 */
export function gainInfamy(infamy: number, amount: number): number {
  return infamy + Math.max(0, amount);
}

/**
 * 极道威望 → 淫名 转移(A4 日常侵蚀·隐瞒失败的代价)。
 * 设计正典 §4: "隐瞒失败→部分极道威望转淫名(+加忠诚)"=A 面玩家发生 NSFW 事件被外人发现的代价。
 * 关键性质: martialGainToday 不被扣(此次进账已发生在前;转移影响累计盘)——
 *   含义=今天打的人头按规则正常累计,但因事被外人看到,部分声誉变质成淫名传出。
 * AV 未解锁时仍可调用(淫名机制 AV 后才计入"总威望",但变量本身始终在累)。
 * 返回实际转移量(不超过当前 martialPrestige)。
 */
export function transferMartialToInfamy(
  s: { martialPrestige: number; infamy: number }, amount: number,
): { martialPrestige: number; infamy: number; transferred: number } {
  const want = Math.max(0, amount);
  const actual = Math.min(want, s.martialPrestige); // 不为负
  return {
    martialPrestige: s.martialPrestige - actual,
    infamy: s.infamy + actual,
    transferred: actual,
  };
}

/**
 * 每日硬失败审核（v3/findings 定稿）：极道威望分量连续2次每日审核进账为0 → 硬失败。
 * 只惩罚不靠实力也不靠人海打据点的纯摆烂者；靠人海推据点打赢即涨极道威望→不触发。
 * @param martialGainToday 今日极道威望进账（流量）
 * @param martialZeroStreak 既往连续零进账次数
 */
export function auditMartial(
  martialGainToday: number, martialZeroStreak: number,
): { martialZeroStreak: number; hardFail: boolean } {
  const streak = martialGainToday > 0 ? 0 : martialZeroStreak + 1;
  return { martialZeroStreak: streak, hardFail: streak >= 2 };
}
