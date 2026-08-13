// 记忆层（纯函数）· 记忆层设计 阶段1 落地
// 三线:结构化日志(桶2·代码写·滑动窗口) + 延续摘要(桶4·里程碑+AI一句) + 里程碑账本(已有triggeredSpecials)。
// 本模块管前两线的数据与渲染。AI <continuity> piggyback 解析见 3-3b;此处先支持代码可知的里程碑/认知跨档笔记。

import type { RenderMode } from '../events/types';

/** 结构化日志条目(每格结算代码写,不依赖AI) */
export interface LogEntry {
  day: number;
  period: 'day' | 'night';
  slot: number;
  eventId: string;
  label: string;
  presentCount?: number;
  corruptionDelta?: number;
  renderMode: RenderMode;
  tags?: string[];
}

/** 延续摘要(桶4·永久里程碑线) */
export interface ContinuityNote {
  day: number;
  kind: 'milestone' | 'entity' | 'turning';
  text: string;
}

/** 注入 prompt 的记忆上下文 */
export interface MemoryContext {
  storyThread: string; // 故事脉络(延续摘要·永久)
  recentLog: string;   // 近期发生(日志滑动窗口)
}

/** 近期日志注入窗口大小(条) */
export const RECENT_LOG_WINDOW = 12;

const PERIOD_CN: Record<'day' | 'night', string> = { day: '昼', night: '夜' };

export function appendLog(log: LogEntry[] | undefined, entry: LogEntry): LogEntry[] {
  return [...(log ?? []), entry];
}

export function appendContinuity(notes: ContinuityNote[] | undefined, note: ContinuityNote): ContinuityNote[] {
  return [...(notes ?? []), note];
}

/** 渲染单条日志:`第N天夜#2 · 供奉 · 在场80人` */
export function renderLogEntry(e: LogEntry): string {
  const head = `第${e.day}天${PERIOD_CN[e.period]}#${e.slot} · ${e.label}`;
  const ppl = e.presentCount != null ? ` · 在场${e.presentCount}人` : '';
  const tags = e.tags && e.tags.length ? ` [${e.tags.join('/')}]` : '';
  return head + ppl + tags;
}

/** 近期发生:日志滑动窗口最近N条 */
export function renderRecentLog(log: LogEntry[] | undefined, n = RECENT_LOG_WINDOW): string {
  if (!log || log.length === 0) return '';
  return log.slice(-n).map(renderLogEntry).join('\n');
}

/** 故事脉络:全部延续摘要(永久·天然紧凑) */
export function renderStoryThread(notes: ContinuityNote[] | undefined): string {
  if (!notes || notes.length === 0) return '';
  return notes.map(n => `第${n.day}天:${n.text}`).join('\n');
}

/** 从状态切片构造记忆上下文(供 buildGamePrompt 注入) */
export function buildMemoryContext(state: { narrativeLog?: LogEntry[]; continuityNotes?: ContinuityNote[] }): MemoryContext {
  return {
    storyThread: renderStoryThread(state.continuityNotes),
    recentLog: renderRecentLog(state.narrativeLog),
  };
}

/** 本格是否需要 AI 延续摘要(桶4判定):事件标记 || 认知防线跨档 */
export function needsContinuitySummary(needsFlag: boolean | undefined, cognitionAdvanced: boolean): boolean {
  return !!needsFlag || cognitionAdvanced;
}

// ════════════════════════════════════════════════════════════
// 分层记忆体系(批B6·用户设计) · 原文档案/小总结/大总结 三层
// ════════════════════════════════════════════════════════════
//
// 纪律性总结: 每格正文生成后,后台【无条件】生成小总结,数据常态保留(60天上限,覆盖最大窗口档)。
//   注入设置(原文档位/窗口/大总结开关)只决定"注入哪些",不决定"生成哪些"——用户改设置立即生效。
// 三层注入: [远期概要·大总结] + [近期事件总结·小总结滑动窗] + [前文原文·最近K事件]。
// 窗口每日滑动(第11天注入2-11天),永不突然断档。大总结按整窗后台静默触发,未完成不注入。

/** 原文档案条目(批F2: 存完整正文——留档页回看/补救收藏是完整版;prompt注入与小总结时才按 PROSE_CHARS 截断) */
export interface ProseEntry {
  id: string;          // 唯一键: `${day}-${period}-${slot}`
  day: number;
  period: 'day' | 'night';
  slot: number;
  label: string;       // 事件标签
  text: string;        // 正文尾部截断(PROSE_CHARS)
  needsSummary: boolean; // true=待后台小总结(fast_summary总结词自身即总结,不需要)
}

/** 小总结条目(每事件一条·副AI事后生成 或 快进总结词直落) */
export interface EventSummary {
  id: string;          // 与 ProseEntry.id 对应
  day: number;
  label: string;
  text: string;
}

/** 大总结条目(整窗压缩·后台静默生成) */
export interface BigSummary {
  fromDay: number;
  toDay: number;
  text: string;
}

/** 注入配置(UI localStorage 持有,注入时传入) */
export interface MemoryInjectConfig {
  /** 原文保留档位: 注入多少前文原文 */
  proseMode: 'none' | 'ev1' | 'ev3' | 'day1' | 'day3';
  /** 小总结注入窗口(天) */
  windowDays: 10 | 15 | 20 | 30 | 60;
  /** 是否注入大总结 */
  bigEnabled: boolean;
}
export const DEFAULT_MEMORY_CONFIG: MemoryInjectConfig = { proseMode: 'ev1', windowDays: 15, bigEnabled: true };

/**
 * 小总结注入条数硬上限(批L·524根因)。
 * 原先窗口只按天过滤、无条数上限:一天8-15格 × 窗口天数 = 数百条 × ~120字,
 * system 注入随游玩时长线性膨胀到几万字 → 网关超时(524)/上游截断。
 * 现取窗口内【最近 N 条】,更老的交给大总结层承载。
 */
export const WINDOW_SUMMARY_MAX = 150;

/** 数据保留参数(生成层·与注入设置无关) */
export const PROSE_RETAIN_DAYS = 3;      // 原文档案保留最近3天(最大原文档位)
export const SUMMARY_RETAIN_DAYS = 60;   // 小总结保留60天(最大窗口档,改设置立即生效的底气)
export const BIG_MERGE_THRESHOLD = 12;   // 大总结超过12条 → 滚动合并("大大总结",默认窗=120天量级)
export const BIG_MERGE_COUNT = 6;        // 每次合并最老6条

export function proseEntryId(day: number, period: 'day' | 'night', slot: number): string {
  return `${day}-${period}-${slot}`;
}

/** 追加原文档案(按天保留窗清理) */
export function appendProse(archive: ProseEntry[] | undefined, entry: ProseEntry, nowDay: number): ProseEntry[] {
  const keepFrom = nowDay - PROSE_RETAIN_DAYS + 1;
  return [...(archive ?? []), entry].filter(e => e.day >= keepFrom);
}

/** 写入/覆盖一条小总结(按天保留窗清理) */
export function upsertSummary(list: EventSummary[] | undefined, s: EventSummary, nowDay: number): EventSummary[] {
  const keepFrom = nowDay - SUMMARY_RETAIN_DAYS + 1;
  const rest = (list ?? []).filter(x => x.id !== s.id);
  return [...rest, s].filter(x => x.day >= keepFrom).sort((a, b) => a.day - b.day || (a.id < b.id ? -1 : 1));
}

/** 挑选下一条待小总结的原文(最老优先·后台worker每次处理一条,失败自动留待下次) */
export function nextPendingSummary(archive: ProseEntry[] | undefined, summaries: EventSummary[] | undefined): ProseEntry | null {
  const done = new Set((summaries ?? []).map(s => s.id));
  for (const e of archive ?? []) {
    if (e.needsSummary && !done.has(e.id)) return e;
  }
  return null;
}

/**
 * 大总结触发判定: 跨过整窗边界时返回待总结区间,否则 null。
 * lastBigTo=已完成大总结的最后一天(0=从未)。窗口=windowDays。
 * 例 窗=10: 第11天起应有[1,10];第21天起应有[11,20]。一次只补一窗(多窗欠账逐日追平)。
 */
export function pendingBigRange(nowDay: number, lastBigTo: number, windowDays: number): { fromDay: number; toDay: number } | null {
  const target = lastBigTo + windowDays;
  return nowDay > target ? { fromDay: lastBigTo + 1, toDay: target } : null;
}

/** 大总结滚动合并判定: 超阈值返回待合并的最老N条,否则 null */
export function pendingBigMerge(bigs: BigSummary[] | undefined): BigSummary[] | null {
  const list = bigs ?? [];
  return list.length > BIG_MERGE_THRESHOLD ? list.slice(0, BIG_MERGE_COUNT) : null;
}

/** 应用合并结果: 最老N条替换为一条 */
export function applyBigMerge(bigs: BigSummary[], merged: BigSummary): BigSummary[] {
  return [merged, ...bigs.slice(BIG_MERGE_COUNT)];
}

/** 按档位选取注入的原文条目(从档案尾部取) */
export function selectProse(archive: ProseEntry[] | undefined, mode: MemoryInjectConfig['proseMode'], nowDay: number): ProseEntry[] {
  const list = archive ?? [];
  switch (mode) {
    case 'none': return [];
    case 'ev1': return list.slice(-1);
    case 'ev3': return list.slice(-3);
    case 'day1': return list.filter(e => e.day >= nowDay - 1);   // 昨天+今天
    case 'day3': return list.filter(e => e.day >= nowDay - 3);
    default: return list.slice(-1);
  }
}

/** 滑动窗口内的小总结(排除已作为原文注入的条目,避免双份) */
export function selectWindowSummaries(
  summaries: EventSummary[] | undefined, nowDay: number, windowDays: number, excludeIds: Set<string>,
): EventSummary[] {
  const from = nowDay - windowDays + 1;
  const inWindow = (summaries ?? []).filter(s => s.day >= from && !excludeIds.has(s.id));
  // 批L: 条数硬上限——窗口内条目过多时只取最近 WINDOW_SUMMARY_MAX 条(数组尾部=最新)
  return inWindow.length > WINDOW_SUMMARY_MAX ? inWindow.slice(-WINDOW_SUMMARY_MAX) : inWindow;
}

/** 三层记忆渲染 → 注入文本(空层省略)。 */
export function renderTieredMemory(
  state: {
    proseArchive?: ProseEntry[]; eventSummaries?: EventSummary[];
    bigSummaries?: BigSummary[]; continuityNotes?: ContinuityNote[];
  },
  nowDay: number,
  cfg: MemoryInjectConfig,
): string {
  const parts: string[] = [];
  // 里程碑线(既有·天然有界·永久)
  const thread = renderStoryThread(state.continuityNotes);
  if (thread) parts.push(`[故事里程碑]\n${thread}`);
  // 远期概要(大总结·未生成完不注入=置空)
  if (cfg.bigEnabled && state.bigSummaries?.length) {
    parts.push('[远期概要]\n' + state.bigSummaries.map(b => `第${b.fromDay}-${b.toDay}天:${b.text}`).join('\n'));
  }
  // 近期事件总结(小总结滑动窗)
  const prose = selectProse(state.proseArchive, cfg.proseMode, nowDay);
  const excl = new Set(prose.map(p => p.id));
  const wins = selectWindowSummaries(state.eventSummaries, nowDay, cfg.windowDays, excl);
  if (wins.length) {
    parts.push('[近期事件总结]\n' + wins.map(s => `第${s.day}天·${s.label}:${s.text}`).join('\n'));
  }
  // 前文原文(最近K事件·细节保真层)。批F2: 档案存完整正文,注入时才截尾部(控token)
  const INJECT_PROSE_CHARS = 700;
  if (prose.length) {
    parts.push('[前文原文·最近事件(新正文必须衔接其结尾状态)]\n'
      + prose.map(p => `【第${p.day}天${PERIOD_CN[p.period]}#${p.slot} ${p.label}】\n${p.text.slice(-INJECT_PROSE_CHARS)}`).join('\n\n'));
  }
  return parts.join('\n\n');
}
