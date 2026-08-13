// 升级系统 · 类型定义（数据驱动·可扩展）
// 三类升级：打手升级(群体战力/NSFW) / 设施升级(经营数值) / 扩张解锁(NSFW区域与系统)。
// 升级=独立子菜单(不占行动格,v3 §0.1)，群体整体，每级固定价。
// 扩展原则：新升级项=往 catalog append 一条数据,引擎只认本结构,无需改代码(设计正典 §5)。

export type UpgradeCategory =
  | 'thug'       // 打手升级：作用全体打手(战力/NSFW)
  | 'facility'   // 设施升级：经营数值(吞吐/欲望上限/行动格/采购/据点加固)
  | 'expansion'; // 扩张解锁：解锁NSFW区域与系统(地盘扩张/地下室/摄影室/AV/庭院…)

/** 升级效果种类（决定 applyUpgrade 如何作用） */
export type UpgradeEffectKind =
  | 'combat'        // 战力加成（派生，不写字段；由 combatBonus 汇总）
  | 'throughput'    // 每格供奉吞吐（吞吐扩容，受堕落度门槛）
  | 'desireCap'     // 欲望承载上限（拖延强制请假）
  | 'actionSlots'   // 每日总行动格
  | 'purchaseMult'  // 避孕套采购扩容倍率
  | 'turfFortify'   // 据点加固（地盘稳定/防守）
  | 'unlock'        // 通用解锁：买后置 unlocked[unlockKey]=true（地下室/摄影室/庭院/任何区域系统）
  | 'occupyScale'   // 地盘扩张：抬升占据规模档（门控扩张日常选项）
  | 'baseMartial'   // 每人基础武力值 +（派生·与在场乘区/武器乘区相乘）
  | 'avPlayCap'     // AV 同时可选玩法tag上限 +（派生·防一次性拉满收益）
  | 'prestigeMult'  // 威望增长系数 +（派生·结算时威望进账×(1+此值)）
  | 'loyaltyDecayReduce' // 减少忠诚每日自然衰减（派生·"荒唐升级"如张贴照片链）
  | 'condomDaily'   // 避孕套每日送货上门量（派生·后期便利·省去主动采购）
  | 'scoutRate'     // 刺探成功率加成（派生·布置暗探）
  | 'avIncomeMult'; // AV销售收入乘区加成（派生·观众来信）

export interface UpgradeEffect {
  kind: UpgradeEffectKind;
  /** 每级效果量：combat=战力比例 / throughput=每级+人 / desireCap=每级+上限 / occupyScale=每级+档 等 */
  perLevel?: number;
  /** kind==='unlock' 时设置的解锁键（写入 EngineState.unlocked），如 'basement'/'av'/'courtyard' */
  unlockKey?: string;
}

/** 前置依赖（数据驱动·可组合）：全满足才出现在菜单/可买。体现"扩张/解锁带来新升级任务"。 */
export interface UpgradeRequire {
  upgradeId?: string;   // 需某升级项
  minLevel?: number;    // …达到的最低等级（默认1）
  occupyAtLeast?: number; // 需占据规模档≥（档位序号）
}

/** 一个升级项定义（数据驱动，数值便于调平） */
export interface UpgradeDef {
  id: string;
  category: UpgradeCategory;
  name: string;
  desc: string;              // 效果/NSFW联想说明（卡琳式：升级项本身=色情联想）
  cost: number;              // 每级固定价（资金）
  maxLevel: number;
  /** 升到第 i+1 级（从 i 级买下一级）所需最低堕落度；index=当前等级。用于吞吐扩容堕落解档。 */
  corruptionGate?: number[];
  /** 前置依赖：满足才出现在菜单（地盘扩张→解锁更多项 / AV设备需先建摄影室）。空=初始可用。 */
  requires?: UpgradeRequire[];
  effect: UpgradeEffect;
  /**
   * 购买时一次性增加的堕落度（"荒唐升级"核心：花钱换收益，但把凛推向更堕落）。
   * 由 store.buyUpgrade 走 gainCorruption 结算（认知防线推进+奖励闸门）。升级系统=前期堕落度主来源。
   */
  corruptionOnBuy?: number;
  /** 解锁/购买时一次性增加的淫名（如椅子淫乱化=家中会客也坐淫具·名声外泄） */
  infamyOnBuy?: number;
  /**
   * ？？？事件（绯红边框+♥·与金边普通升级区分）。
   * 未解锁时显示"？？？"，悬停可见前置与堕落度要求；条件满足后【自动解锁·不花钱】。
   * 带来的多是"色情数值叙事的负面加成"（+堕落/+淫名/范式顶替=惩罚）。
   */
  mystery?: boolean;
  /**
   * 解锁所需堕落度。mystery=自动解禁门槛;非 mystery=【粉金混合节点】的购买门槛
   * (既要堕落度又要花钱·"堕落解锁的技艺"如性技修炼/买套档位)。UI 对非 mystery 项据此画粉金边。
   */
  corruptionRequired?: number;
  /** mystery 解锁额外条件：行动格数已达硬上限(15)。庭院群交用。 */
  requiresSlotsMax?: boolean;
  /** mystery 解锁额外条件：累计已拍 AV ≥ N 部。观众来信用。 */
  requiresAvShots?: number;
  /** mystery 解锁额外条件：忠诚度低于 N。深夜的脚步声用。 */
  requiresLoyaltyBelow?: number;
  /** 前置：第 N 阶段地盘 Boss 已击败(批F1·扩张升级挂攻打进度)。金边/粉金/mystery 通用。 */
  requiresBossStage?: number;
  /** mystery 解锁额外条件：某派生解锁键为真(如 masochism 受虐癖)。陪练·固技用。 */
  requiresUnlockedKey?: string;
}
