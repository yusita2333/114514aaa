// 统一事件模型 · 类型定义（v3 蓝图 §0 最高统一模型）
// 核心：每个"事件选项"= SFW范式 + NSFW范式 + 侵蚀闸门 + 首次侵蚀特殊事件。
// 扩张(解锁)长出选项，堕落(侵蚀闸门)让选项从SFW翻面成NSFW，翻面的"第一次"=特殊事件。

import type { CognitionStage } from '../corruption/machine';

/** 范式引用（指向世界书范式条目；前端只存key+元数据，正文在世界书） */
export interface ParadigmRef {
  worldbookKey: string;
  /** 动态范式（AV玩家定制等运行时拼装）：直接带正文/要素，不查世界书 */
  inlinePrompt?: string;
}

/**
 * 侵蚀闸门：决定"SFW何时翻面成NSFW"。可组合多个数值条件（全满足才翻面）。
 * 用户定：占位统一堕落度≥50；但部分事件多数值共同决定，故留可组合接口。
 */
export interface ErosionGate {
  corruptionAtLeast?: number;        // 堕落度≥（占位50）
  cognitionAtLeast?: CognitionStage; // 认知防线达到某档
  infamyAtLeast?: number;            // 淫名≥（如身体贿赂走淫名路径）
  thugsAtLeast?: number;             // 打手数≥（如强占进阶供奉）
  /** 扩展接口：任意自定义条件（多数值组合），返回 true 表示该条件满足 */
  custom?: (ctx: EventContext) => boolean;
}

/** 事件选项形态 */
export type EventShape =
  | 'dual'        // 双面型：有SFW也有NSFW（多数。如出门吃饭↔餐厅轮奸）
  | 'born_nsfw'   // 天生NSFW型：只有NSFW（供奉/请假轮奸/AV）
  | 'born_sfw';   // 天生SFW型：只有SFW（纯经营动作）

/** 首次里程碑特殊事件（SFW→NSFW首次 或 天生NSFW的第一次） */
export interface FirstMilestone {
  /** 账本键（已触发标签）。全局唯一 */
  ledgerKey: string;
  paradigm: ParadigmRef;     // 首次用的特殊事件范式
  corruptionWeight: number;  // 首次加的堕落度
  /** 优先级（多个同条件特殊事件依次触发时，数字小先触发）。默认0 */
  priority?: number;
  /**
   * 首次触发后的副作用补丁(可选·与 ForcedEvent.onApply 同形)。
   * 用途: 首次AV → initAvOnUnlock 设 unlocked.av + 初始化 weeklyQuota;
   *       任何"触发即推进系统状态"的首次事件副作用。
   * 仅当 settleSlot 实际命中首次里程碑时执行一次。
   */
  onApply?: (engine: import('../engine/types').EngineState) => Record<string, unknown>;
}

/**
 * 多阶段事件的一个阶段（如学校 NSFW 按堕落度 25/50/75 分三档）。
 * 防跳阶段:永远先触发"最低的未触发阶段"首次,不能跳(详见 resolveEvent 多阶段分支)。
 */
export interface EventStage {
  corruptionAtLeast: number; // 进入此阶段的堕落度门槛
  /** 可选:该阶段以解锁键判定激活(unlocked[unlockKey]===true),用于升级项顶替事件范式 */
  unlockKey?: string;
  ledgerKey: string;         // 此阶段首次的账本键（全局唯一）
  corruptionWeight: number;  // 此阶段首次加的堕落度
  firstParadigm: ParadigmRef;// 此阶段首次范式（ai_full 重点扩写）
  paradigm: ParadigmRef;     // 此阶段常规范式（ai_normal 重复体验）
}

/** 一个事件选项（统一模型核心条目） */
export interface EventOption {
  id: string;
  label: string;                 // 显示名（不含♥，♥由UI按是否NSFW态加）
  period: 'day' | 'night' | 'any';
  shape: EventShape;
  /** 批I1: 永不被快进略写(如AV定制格——玩家花额度定制的演出,快进吞正文=白定制) */
  neverFast?: boolean;
  /** 扩张解锁：满足才出现在菜单（占据规模/宅邸升级/设施）。空=初始可用 */
  unlockRequires?: string[];
  /** SFW范式（dual/born_sfw 有） */
  sfw?: ParadigmRef;
  /** NSFW范式（dual/born_nsfw 有），即"侵蚀态" */
  nsfw?: ParadigmRef;
  /** 侵蚀闸门（dual 有）：SFW→NSFW的翻面条件 */
  erosionGate?: ErosionGate;
  /** 首次里程碑特殊事件（翻面首次 / 天生NSFW首次） */
  first?: FirstMilestone;
  /**
   * 多阶段(按堕落度分档·防跳阶段)。存在时覆盖单一 first/erosionGate 路径:
   * 低于最低阶段门槛=SFW;否则强制先演最低未触发阶段的首次,逐阶解锁。
   * 用于学校25/50/75、常识背离逐档、买套分级等。
   */
  stages?: EventStage[];
  /** 翻面后不可逆：达闸门并触发首次后，SFW版从菜单消失（如贿赂→只剩贿赂♥） */
  irreversibleAfterErosion?: boolean;
  /** 置顶（AV玩家定制选项排菜单最前） */
  pinned?: boolean;
  /**
   * 地图选择型(刺探/贿赂)。执行此格时不走 AI 扩写,而是在主区展开地盘地图选目标:
   *   'scout' = 刺探:选任一未占据关→1/4概率获情报+扣钱;
   *   'bribe' = 贿赂:只可选已获情报的关→降其击败门槛。
   * 由 App/runner-store 拦截执行,settleScout/settleBribe 结算。
   */
  mapSelect?: 'scout' | 'bribe' | 'attack' | 'harass';
  /** 永不出现在玩家可选菜单(只由系统/其它界面置入,如 av_custom 由影业面板下单 / forced_leave 强制霸全) */
  hiddenInMenu?: boolean;
  /** 一次性:其 first.ledgerKey 已触发后从菜单消失(如首次AV·避免重复浪费格) */
  oncePerGame?: boolean;
  /** 供奉类（执行后扣避孕套等，对接 settlement.serveOptionIds） */
  isServe?: boolean;
  /** 供奉但不消耗避孕套（如口交侍奉·非阴道/肛门插入，无需套） */
  noCondom?: boolean;
  /** 极道威望奖励（每次结算给；来源=火并/据点战/复仇胜利） */
  martialReward?: number;
  /** 淫名奖励（每次结算给，仅 AV 解锁后生效；来源=AV/轮奸规模/肉体名气） */
  infamyReward?: number;
  /** 桶4:本事件是否引入"需后续回调的具体实体/独特事实"→需AI一句延续摘要(记忆层)。认知防线跨档另由代码自动触发。 */
  needsContinuity?: boolean;
  /**
   * A4 日常侵蚀标记(可选)。当本事件是"A 面公开场合发生 NSFW、有被外人看到的风险"时设置。
   * settleSlot 结算 NSFW 态后调 applyA4(隐瞒成败→威望路由)。
   * 典型: 收保护费NSFW/学校NSFW/扩张日常(餐厅/商场等公众场景)/买套等"在外面"的 NSFW 事件。
   * 纯 B 面事件(夜晚供奉/暴力供奉/请假轮奸)不设(大宅内无外人,无隐瞒问题)。
   */
  a4?: {
    /** 本次事件给的极道威望基数(隐瞒成功全得;失败部分变质淫名) */
    martialBase: number;
    /** 失败 transfer 比率(0..1·默认0.4) */
    transferRatio?: number;
    /** 失败忠诚加成(默认2) */
    loyaltyOnFail?: number;
    /** 本事件推进的身体部位(可选·随结算 advanceBodyDevelopment) */
    developsPart?: '口腔' | '小穴' | '肛门' | '子宫生育';
  };
  /**
   * 身体开发度推进(批C1·独立于 a4)。纯 B 面 NSFW 事件(夜晚供奉等)无隐瞒问题不设 a4,
   * 但反复被使用照样开发身体——每次 NSFW 态结算按 chance 概率推进对应部位 1 级。
   * 概率推进(非必然)让四部位面板有渐进成长感,也把"开发速度"变成可调平参数。
   */
  develops?: {
    part: '口腔' | '小穴' | '肛门' | '子宫生育';
    /** 每次结算的推进概率 0..1 */
    chance: number;
  };
}

/** 事件解析输入上下文（从游戏状态提取） */
export interface EventContext {
  corruption: number;
  cognition: CognitionStage;
  infamy: number;
  thugs: number;
  triggeredLedger: Record<string, boolean>;  // 已触发特殊事件账本
  unlocked: Record<string, boolean>;          // 已解锁集（扩张）
}

/**
 * 强制事件扫描上下文 = EventContext + 强制事件关心的额外信号。
 * 额外字段可选：地盘系统等未做时缺省，条件函数自行兜底。
 */
export interface ForcedContext extends EventContext {
  condomStock?: number;   // 避孕套库存（归零链触发）
  threatLevel?: number;   // 地盘威胁等级（骚扰/火并防守触发；0=无。地盘系统未做先占位）
  /** 身体开发度(批C1·A4 白天突发侵蚀扫描用: 部位过阈值→daily_erosion 可触发) */
  bodyDevelopment?: Record<string, number>;
  /** 当前时段(批C1·daily_erosion 只在白天触发) */
  period?: 'day' | 'night';
  /** 当前天数(批C1·同日只触发一次 daily_erosion) */
  dayNumber?: number;
  /** 上次 daily_erosion 触发的天数(engine.erosionLastDay) */
  erosionLastDay?: number;
  /** 本次扫描的随机数 0..1(rng 注入·概率性触发用) */
  roll?: number;
}

/** 渲染方式（v3 §3 四档） */
export type RenderMode =
  | 'ai_full'      // 首次里程碑特殊事件：重点扩写
  | 'ai_normal'    // 常规NSFW（非首次/天生NSFW日常态）：正常生成色情内容
  | 'ai_brief'     // 纯SFW日常流水：略写/模板
  | 'fast_summary';// 快进：不调AI，CG+总结

/** 当前态（SFW还是NSFW） */
export type EventFace = 'sfw' | 'nsfw';

/** 事件解析结果 */
export interface EventResolution {
  option: EventOption;
  face: EventFace;             // 当前用SFW还是NSFW态
  isFirstMilestone: boolean;   // 是否首次里程碑（true→加堕落+记账本）
  corruptionGain: number;
  paradigm: ParadigmRef;       // 实际要注入AI的范式
  renderMode: RenderMode;
  isNsfw: boolean;             // 是否NSFW（UI加♥）
  /** 首次里程碑要写的账本键（单一first=first.ledgerKey;多阶段=该阶段ledgerKey）。settleSlot 据此记账+加堕落 */
  milestoneLedgerKey?: string;
}
