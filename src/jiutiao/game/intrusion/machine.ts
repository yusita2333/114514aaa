// A4 日常侵蚀系统 · 核心逻辑（纯函数）
// 设计意图(设计正典§4): 身体开发度阈值→白天自动 NSFW 事件→隐瞒成败→威望路由
//   - 隐瞒成功 → +极道威望(B 面快感被掩盖,A 面声誉不变)
//   - 隐瞒失败 → 部分极道威望 transfer 淫名 + 加忠诚(外人看到,声誉变质成淫名传出)
//
// 设计姿态: A4 不是独立事件,是机制 hook——挂在 settleSlot 收尾,任何 A 面 NSFW 事件结算后调用。
// 这样既不污染事件目录(EventOption 数不爆),又让"日常侵蚀"在所有 A 面 NSFW 场景统一生效。
//
// 接入点(待实现): EventOption 加可选 a4 字段标记本事件参与 A4 → settleSlot 后调 applyA4。

import { transferMartialToInfamy, gainMartialPrestige } from '../prestige/machine';
import type { EngineState } from '../engine/types';

/** 身体部位(A4 关心的主四穴·与 schema 中文 key 对齐) */
export type BodyPart = '口腔' | '小穴' | '肛门' | '子宫生育';

/** 五级开发度(0-4·对应 schema 中文枚举抗拒/被迫接受/无意识迎合/轻度上瘾/重度依赖) */
export type DevelopmentLevel = 0 | 1 | 2 | 3 | 4;

/** 部位开发度等级与中文标签的映射(供 UI 与 AI 文案用) */
export const DEVELOPMENT_LABELS: Record<DevelopmentLevel, string> = {
  0: '抗拒',
  1: '被迫接受',
  2: '无意识迎合',
  3: '轻度上瘾',
  4: '重度依赖',
};

/** 读某部位开发度(缺省=1·与 schema 默认值"被迫接受"一致) */
export function getDevelopment(state: EngineState, part: BodyPart): DevelopmentLevel {
  return (state.bodyDevelopment?.[part] ?? 1) as DevelopmentLevel;
}

/**
 * 推进某部位开发度(单调上升·封顶 4)。返回是否实际推进了(=触发阈值检查的信号)。
 * 来源: 任何 NSFW 事件后,引擎根据事件参与的部位调用本函数。
 */
export function advanceBodyDevelopment(
  state: EngineState, part: BodyPart, delta = 1,
): { state: EngineState; advanced: boolean; newLevel: DevelopmentLevel } {
  const cur = getDevelopment(state, part);
  const next = Math.min(4, cur + Math.max(0, delta)) as DevelopmentLevel;
  if (next === cur) return { state, advanced: false, newLevel: cur };
  return {
    state: { ...state, bodyDevelopment: { ...(state.bodyDevelopment ?? {}), [part]: next } },
    advanced: true, newLevel: next,
  };
}

// ───────────────────────────────────────────────
// A4 触发阈值表(数据驱动·待调平)
// 设计正典§4 没指定具体阈值,这里给保守起调,后续按测试反馈调。
// 含义: 部位开发度达到此等级时,该部位的 A 面 NSFW 触发概率显著上升(由代码扫描+随机)。
// ───────────────────────────────────────────────
export const A4_TRIGGER_THRESHOLDS: Record<BodyPart, DevelopmentLevel> = {
  口腔: 2,   // 无意识迎合 → A 面口交事件易触发
  小穴: 2,
  肛门: 3,   // 肛门更隐蔽,需轻度上瘾
  子宫生育: 4, // 子宫=生育线,母猪化才有意义
};

/** 给定部位,当前开发度是否过了 A4 触发阈值 */
export function isA4TriggerReady(state: EngineState, part: BodyPart): boolean {
  return getDevelopment(state, part) >= A4_TRIGGER_THRESHOLDS[part];
}

// ───────────────────────────────────────────────
// 隐瞒判定 · 不依赖运行时随机数注入(可测)
// ───────────────────────────────────────────────

/** 隐瞒判定输入: 基础成功率 + 武力调整 + 玩家提供的 roll(0..1,由调用方注入随机源,便于测试) */
export interface ConcealRollInput {
  martialPrestige: number;   // 武力越高,隐瞒越容易(打手/势力压人)
  roll: number;              // 0..1 随机数(调用方决定来源·测试可注入定值)
}

/**
 * 隐瞒成功率公式: 基础 0.5 + martialPrestige × 0.001(每 1000 武力 +1.0,封顶 0.95)
 *   - 低武力(0): 50%
 *   - 中武力(200): 70%
 *   - 高武力(450+): 95%(封顶)
 * 想调平就改本函数,不动调用方。
 */
export function concealProbability(martialPrestige: number): number {
  const raw = 0.5 + Math.max(0, martialPrestige) * 0.001;
  return Math.min(0.95, raw);
}

/** 隐瞒判定 = roll < concealProbability(成功=true·失败=false) */
export function rollConcealment(input: ConcealRollInput): boolean {
  return input.roll < concealProbability(input.martialPrestige);
}

// ───────────────────────────────────────────────
// A4 主入口: 应用结果(威望路由 + 忠诚加成)
// ───────────────────────────────────────────────

/** A4 应用结果 */
export interface A4Result {
  state: EngineState;
  concealed: boolean;          // 是否隐瞒成功
  martialGained: number;       // 极道威望进账(成功时)
  martialTransferred: number;  // 转移到淫名的量(失败时)
  loyaltyDelta: number;        // 忠诚变化(失败时+,打手共担"秘密"凝聚力)
}

/** A4 触发参数 */
export interface A4Input {
  /** 本次事件应给的极道威望基数(隐瞒成功=全得;失败=部分变质为淫名) */
  martialBase: number;
  /** 失败时 transfer 比率(0..1·默认 0.4=四成极道变淫名) */
  transferRatio?: number;
  /** 失败时忠诚加成(共担秘密·默认 +2) */
  loyaltyOnFail?: number;
  /** 隐瞒判定输入(roll 来源由调用方注入) */
  conceal: ConcealRollInput;
}

/**
 * 应用 A4 一次结算: 掷隐瞒 → 路由威望 → 副作用上 state。
 * 调用时机: settleSlot 流水线收尾,当 EventOption.a4 标记本事件为"A 面 NSFW 风险"时。
 * 纯函数·随机性由 conceal.roll 注入,测试可定值。
 */
export function applyA4(state: EngineState, input: A4Input): A4Result {
  const concealed = rollConcealment(input.conceal);
  if (concealed) {
    // 隐瞒成功 → 极道威望进账(martialPrestige + martialGainToday 同步)
    const next = gainMartialPrestige({
      martialPrestige: state.martialPrestige,
      martialGainToday: state.martialGainToday ?? 0,
    }, input.martialBase);
    return {
      state: { ...state, ...next },
      concealed: true,
      martialGained: input.martialBase,
      martialTransferred: 0,
      loyaltyDelta: 0,
    };
  }
  // 隐瞒失败 → 极道威望转淫名 + 忠诚 +
  const ratio = input.transferRatio ?? 0.4;
  const transferAmt = Math.round(input.martialBase * ratio);
  const transfer = transferMartialToInfamy(state, transferAmt);
  const loyaltyOnFail = input.loyaltyOnFail ?? 2;
  return {
    state: {
      ...state,
      martialPrestige: transfer.martialPrestige,
      infamy: transfer.infamy,
      loyalty: Math.min(100, state.loyalty + loyaltyOnFail),
    },
    concealed: false,
    martialGained: 0,
    martialTransferred: transfer.transferred,
    loyaltyDelta: loyaltyOnFail,
  };
}
