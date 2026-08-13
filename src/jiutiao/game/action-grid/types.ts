// 行动格系统 · 类型定义
// 纯逻辑层，无 UI / 无 AI 依赖。运行时序见 设计文档 经济模型_v1.md §13。

/** 一天内的阶段（早7点开始） */
export type DayPhase =
  | 'allocating'   // 分配中：玩家分配白天/夜晚格数 + 安排各格内容
  | 'day_running'  // 白天执行中：逐格推进
  | 'day_settled'  // 白天结算完
  | 'night_running'// 夜晚执行中：逐格推进
  | 'night_settled'// 夜晚结算完（之后做每日审查→次日）
  ;

/** 行动格归属的时段 */
export type SlotPeriod = 'day' | 'night';

/** 单个行动格的执行状态 */
export type SlotStatus =
  | 'empty'      // 空：尚未安排选项（不可提交）
  | 'planned'    // 已安排选项，待执行
  | 'running'    // 进行中（已调 AI / mock，等结果）
  | 'done'       // 已完成（有结果文本）
  ;

/**
 * 行动格里玩家选择的"选项" = 一个事件引用。
 * 这里只存"选了什么"，具体范式筛选/扩写在 events 模块做。
 * optionId 指向某个可选行动（如 'recruit' / 'buy_condoms' / 'serve' / 'attack_stronghold'）。
 */
export interface SlotChoice {
  optionId: string;
  label: string;       // 显示名（可含 NSFW 文本，UI 固有）
  /** 选项携带的参数（如供奉哪批打手、攻打哪个据点），范式筛选用 */
  params?: Record<string, unknown>;
}

/** 单个行动格 */
export interface ActionSlot {
  index: number;          // 该时段内的序号 0..n-1
  period: SlotPeriod;
  status: SlotStatus;
  choice: SlotChoice | null;
  /** 执行后生成的反馈正文（AI1 扩写结果；mock 阶段为占位） */
  resultText?: string;
  /** 批I4-6: 各段(首段+续写段)在 resultText 中的起始偏移。缺省=[0](单段·旧档兼容)。UI按段渲染独立卡片 */
  segStarts?: number[];
  /** 是否被事件系统强占（强占/霸全事件锁定，玩家不可改派） */
  locked?: boolean;
  /** 强占来源事件名（locked 时有值），供 UI 显示"⚠本格被XX事件占用" */
  lockedBy?: string;
  /** 是否为事件专属临时格（insertEventSlot 插入，不计入当日预算 dayCount/nightCount） */
  inserted?: boolean;
  /**
   * 批L: 本格结算时是否走的"首次里程碑"范式。
   * 供【重新生成本格正文】还原成同一范式——里程碑账本在首次结算时已被标记，
   * 事后重解析只会拿到常规范式，重生成出来的会是弱一档的场景。
   */
  wasFirst?: boolean;
}

/** 一天的完整行动格状态 */
export interface DayState {
  dayNumber: number;
  phase: DayPhase;
  totalSlots: number;     // 当日总格数（来自 schema 时间.每日总行动格）
  dayCount: number;       // 分配给白天的格数
  nightCount: number;     // 分配给夜晚的格数
  daySlots: ActionSlot[];
  nightSlots: ActionSlot[];
  /** 当前正在执行的格（period+index）；null=未在执行 */
  cursor: { period: SlotPeriod; index: number } | null;
  /** 是否强制请假轮奸日（霸全）：供奉吞吐×1.5，全格被锁 */
  forcedLeave?: boolean;
}

/** 分配请求 */
export interface Allocation {
  dayCount: number;
  nightCount: number;
}
