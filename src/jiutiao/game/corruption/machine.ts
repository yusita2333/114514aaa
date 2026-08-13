// 堕落系统 · 核心逻辑（纯函数）
// 职责：堕落度累计 → 认知防线硬推进(阈值) → 奖励闸门触发。
// 设计依据：findings 核心定位锚 1 —— 堕落=首次特殊事件累计，阈值硬推进认知防线，反向开奖励闸门(堕落易)。

/** 认知防线四档（与 schema 一致，顺序即推进方向，单向不可逆） */
export type CognitionStage = '死撑' | '动摇' | '崩溃' | '母猪化';
export const COGNITION_ORDER: CognitionStage[] = ['死撑', '动摇', '崩溃', '母猪化'];

/**
 * 认知防线阈值表：堕落度 ≥ 阈值 即推进到该档（取满足的最高档）。
 * 用户定稿：认知防线直接和堕落度挂钩，每 25 一档。堕落度是认知防线的数值化细化，
 * 使特殊事件闸门可挂 15/35 等非整档点，不至于全堆在 25/50/75。
 */
export const COGNITION_THRESHOLDS: { stage: CognitionStage; atCorruption: number }[] = [
  { stage: '死撑', atCorruption: 0 },
  { stage: '动摇', atCorruption: 25 },
  { stage: '崩溃', atCorruption: 50 },
  { stage: '母猪化', atCorruption: 75 },
];

/**
 * 认知防线态度 key（双判定模型·四档对齐 ATTITUDE_LAYER·3-5a）。
 * 直接返回 stage 本身，与 prompt.ts ATTITUDE_LAYER 的 key 完全对应。
 */
export type CognitionAttitude = CognitionStage;
export function attitudeForStage(stage: CognitionStage): CognitionAttitude {
  return stage; // 死撑/动摇/崩溃/母猪化 直连四档态度层
}

/**
 * 奖励闸门表：堕落度达阈值触发一次性奖励（给钱/打手，鼓励早放纵=堕落易）。
 * 起调值，可调。gateId 用于账本防重复领。
 */
export interface RewardGate {
  gateId: string;
  atCorruption: number;
  reward: { money?: number; thugs?: number; unlock?: string };
  desc: string;
}
export const REWARD_GATES: RewardGate[] = [
  { gateId: 'gate_10', atCorruption: 10, reward: { money: 5000, thugs: 20 }, desc: '初尝堕落甜头：金主注资+一批打手投奔' },
  { gateId: 'gate_25', atCorruption: 25, reward: { money: 20000, thugs: 50 }, desc: '淫名渐起：资源涌入' },
  { gateId: 'gate_50', atCorruption: 50, reward: { money: 80000, thugs: 150 }, desc: '黑道女王崛起：人潮与金钱碾压而来' },
];

/** 根据堕落度算出当前应处的认知防线档（取满足阈值的最高档） */
export function stageForCorruption(corruption: number): CognitionStage {
  let result: CognitionStage = '死撑';
  for (const t of COGNITION_THRESHOLDS) {
    if (corruption >= t.atCorruption) result = t.stage;
  }
  return result;
}

/** 认知防线单向推进：返回 max(当前, 按堕落度应得)，绝不回退 */
export function advanceCognition(current: CognitionStage, corruption: number): CognitionStage {
  const target = stageForCorruption(corruption);
  const ci = COGNITION_ORDER.indexOf(current);
  const ti = COGNITION_ORDER.indexOf(target);
  return ti > ci ? target : current;
}

export interface CorruptionInput {
  corruption: number;
  cognition: CognitionStage;
  claimedGates: Record<string, boolean>;
}

export interface CorruptionResult {
  corruption: number;
  cognition: CognitionStage;
  /** 本次新跨越的认知防线档（用于触发"堕落进程事件"叙事），null=未推进 */
  cognitionAdvancedTo: CognitionStage | null;
  /** 本次新触发的奖励闸门（上层据此发钱/打手 + 写账本） */
  firedGates: RewardGate[];
  /** 更新后的奖励闸门账本 */
  claimedGates: Record<string, boolean>;
}

/**
 * 增加堕落度并结算连带效果（认知推进 + 奖励闸门）。纯函数。
 * @param gain 本次堕落度增量（来自首次特殊事件的 corruptionGain）
 */
export function gainCorruption(input: CorruptionInput, gain: number): CorruptionResult {
  const corruption = Math.max(0, Math.round(input.corruption + gain));
  const newCognition = advanceCognition(input.cognition, corruption);
  const advanced = newCognition !== input.cognition ? newCognition : null;

  // 检查新触发的奖励闸门（达阈值且未领过）
  const firedGates: RewardGate[] = [];
  const claimedGates = { ...input.claimedGates };
  for (const g of REWARD_GATES) {
    if (corruption >= g.atCorruption && !claimedGates[g.gateId]) {
      firedGates.push(g);
      claimedGates[g.gateId] = true;
    }
  }

  return { corruption, cognition: newCognition, cognitionAdvancedTo: advanced, firedGates, claimedGates };
}
