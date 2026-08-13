// 结局系统（纯函数）· 阶段指导与结局_v1 + 设计正典 §10
// 三结局状态驱动;_结局倾向过程可感知;金盆洗手(解脱)不过50堕落。
// 软卡死(连续请假)=记忆/请假机制;硬失败(极道威望连2次0)=settleDaily.hardFail。本模块管"通关型"结局判定。

import type { CognitionStage } from '../corruption/machine';

export type Ending = '解脱' | '畸形团体' | '堕落生育';
export type EndingTendency = Ending | '未定';

/** 结局判定读的状态切片 */
export interface EndingState {
  cognition: CognitionStage;
  corruption: number;
  pregnant?: boolean;
}

/** 金盆洗手(解脱)堕落上限:进崩溃档/堕落≥此值则关闭(用户定不过50) */
export const SALVATION_CORRUPTION_CAP = 50;

/** 金盆洗手是否仍可达(认知防线未进崩溃 且 堕落<50) */
export function isSalvationOpen(s: EndingState): boolean {
  return s.corruption < SALVATION_CORRUPTION_CAP && (s.cognition === '死撑' || s.cognition === '动摇');
}

/**
 * 结局倾向(过程可感知·状态栏实时显示玩家在滑向哪)。
 * 母猪化/怀孕→堕落生育;崩溃→畸形团体;死撑/动摇→解脱。
 */
export function endingTendency(s: EndingState): EndingTendency {
  if (s.pregnant || s.cognition === '母猪化') return '堕落生育';
  if (s.cognition === '崩溃') return '畸形团体';
  if (s.cognition === '死撑' || s.cognition === '动摇') return '解脱';
  return '未定';
}

/**
 * 结局结算(是否已到结局)。
 *  - 怀孕判定通过 → 提前锁定堕落生育(可在复仇完成前)。
 *  - 否则需复仇完成才结算 → 按当前倾向定结局。
 *  - 未达 → null(游戏进行中)。
 * @param revengeComplete 最终boss是否击败(turf.isRevengeComplete)
 */
export function resolveEnding(s: EndingState, opts: { revengeComplete: boolean }): Ending | null {
  if (s.pregnant) return '堕落生育';
  if (!opts.revengeComplete) return null;
  const t = endingTendency(s);
  return t === '未定' ? '畸形团体' : t; // 复仇完成必出结局;倾向兜底畸形团体
}
