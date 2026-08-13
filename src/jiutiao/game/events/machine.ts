// 统一事件模型 · 核心逻辑（纯函数）
// resolveEvent: 给定事件选项+上下文 → 决定用SFW还是NSFW态、是否首次里程碑、renderMode。
// 候选池: 优先级+已触发标签机制（覆盖避孕套三连等同条件依次触发）。

import { COGNITION_ORDER } from '../corruption/machine';
import type { CognitionStage } from '../corruption/machine';
import type {
  EventOption, EventStage, ErosionGate, EventContext, ForcedContext, EventResolution, RenderMode, ParadigmRef,
} from './types';

/**
 * 多阶段解析(防跳阶段)。返回当前该用哪个阶段、是否首次、范式。
 *  - 低于最低阶段门槛 → SFW(stage=null)。
 *  - 否则取"最低的未触发阶段":若堕落度≥其门槛 → 该阶段首次(强制,不能跳);
 *    否则用"最高已触发阶段"的常规范式(在门槛间重复体验)。
 */
function resolveStages(stages: EventStage[], ctx: EventContext): {
  stage: EventStage | null; isFirst: boolean;
} {
  const sorted = [...stages].sort((a, b) => a.corruptionAtLeast - b.corruptionAtLeast);
  // 阶段激活判定:堕落度门槛 AND(若有)解锁键——双闸门(如买套档位=采购升级+堕落度)
  const active = (s: EventStage) =>
    ctx.corruption >= s.corruptionAtLeast && (s.unlockKey ? ctx.unlocked[s.unlockKey] === true : true);
  // 最低未触发且已激活的阶段 → 强制演其首次
  const pending = sorted.find(s => ctx.triggeredLedger[s.ledgerKey] !== true && active(s));
  if (pending) return { stage: pending, isFirst: true };
  // 最高"已激活"阶段(重复体验·后开的顶替先开的);无则 SFW。
  // 注意用 active 而非 triggeredLedger:范式顶替=一旦解锁,旧阶段不再可选。
  const activeStages = sorted.filter(s => ctx.triggeredLedger[s.ledgerKey] === true && active(s));
  const highest = activeStages.length ? activeStages[activeStages.length - 1] : null;
  return { stage: highest, isFirst: false };
}

// ───────────────────────────────────────
// 解锁 & 侵蚀闸门判定
// ───────────────────────────────────────

/** 认知防线档位序号比较 */
function cognitionGte(cur: CognitionStage, need: CognitionStage): boolean {
  return COGNITION_ORDER.indexOf(cur) >= COGNITION_ORDER.indexOf(need);
}

/** 选项是否已解锁（扩张：出现在菜单的条件） */
export function isUnlocked(opt: EventOption, ctx: EventContext): boolean {
  if (!opt.unlockRequires || opt.unlockRequires.length === 0) return true;
  return opt.unlockRequires.every(r => ctx.unlocked[r] === true);
}

/** 侵蚀闸门是否满足（全部条件满足才翻面成NSFW）。可组合多数值。 */
export function gateOpen(gate: ErosionGate | undefined, ctx: EventContext): boolean {
  if (!gate) return false;
  if (gate.corruptionAtLeast != null && ctx.corruption < gate.corruptionAtLeast) return false;
  if (gate.cognitionAtLeast != null && !cognitionGte(ctx.cognition, gate.cognitionAtLeast)) return false;
  if (gate.infamyAtLeast != null && ctx.infamy < gate.infamyAtLeast) return false;
  if (gate.thugsAtLeast != null && ctx.thugs < gate.thugsAtLeast) return false;
  if (gate.custom && !gate.custom(ctx)) return false;
  return true;
}

// ───────────────────────────────────────
// 事件解析：决定 face / 首次 / renderMode
// ───────────────────────────────────────

function pickRenderMode(isFirst: boolean, isNsfw: boolean, fastForward: boolean): RenderMode {
  if (isFirst) return 'ai_full';        // 首次里程碑永远完整扩写(压过快进)
  if (fastForward) return 'fast_summary';
  return isNsfw ? 'ai_normal' : 'ai_brief'; // NSFW非首次正常生成；SFW日常略写
}

/**
 * 解析一个事件选项当前该怎么演。
 * 规则（v3 §0/§2/§3）：
 *  - born_sfw：永远 SFW。
 *  - born_nsfw：永远 NSFW；其 first 里程碑（第一次做）未触发则首次特殊。
 *  - dual：看侵蚀闸门——
 *     未开 → SFW态（ai_brief）。
 *     开 + first 未触发 → 首次侵蚀特殊事件（ai_full，加堕落，记账本）。
 *     开 + first 已触发 → NSFW态（ai_normal）。
 */
export function resolveEvent(
  opt: EventOption, ctx: EventContext, fastForward: boolean,
): EventResolution {
  // 批I1: neverFast 事件(AV定制等)无视快进,永远完整生成
  const ff = fastForward && !opt.neverFast;
  fastForward = ff;

  // —— 多阶段事件(防跳阶段):存在 stages 时覆盖单一 first/erosionGate ——
  if (opt.stages && opt.stages.length) {
    const { stage, isFirst } = resolveStages(opt.stages, ctx);
    if (!stage) {
      // 低于最低阶段门槛 → SFW 态
      const sfwParadigm = opt.sfw ?? { worldbookKey: `${opt.id}_sfw` };
      return {
        option: opt, face: 'sfw', isFirstMilestone: false, corruptionGain: 0,
        paradigm: sfwParadigm, renderMode: pickRenderMode(false, false, fastForward), isNsfw: false,
      };
    }
    const paradigm = isFirst ? stage.firstParadigm : stage.paradigm;
    return {
      option: opt, face: 'nsfw', isFirstMilestone: isFirst,
      corruptionGain: isFirst ? stage.corruptionWeight : 0,
      paradigm, renderMode: pickRenderMode(isFirst, true, fastForward), isNsfw: true,
      milestoneLedgerKey: isFirst ? stage.ledgerKey : undefined,
    };
  }

  const firstTriggered = opt.first ? ctx.triggeredLedger[opt.first.ledgerKey] === true : true;

  // 决定 face
  let face: 'sfw' | 'nsfw';
  if (opt.shape === 'born_sfw') face = 'sfw';
  else if (opt.shape === 'born_nsfw') face = 'nsfw';
  else face = gateOpen(opt.erosionGate, ctx) ? 'nsfw' : 'sfw';

  // 首次里程碑判定：NSFW态 + 有first + 未触发
  const isFirstMilestone = face === 'nsfw' && !!opt.first && !firstTriggered;

  // 选范式
  let paradigm: ParadigmRef;
  if (isFirstMilestone) paradigm = opt.first!.paradigm;
  else if (face === 'nsfw') paradigm = opt.nsfw ?? opt.first!.paradigm;
  else paradigm = opt.sfw ?? { worldbookKey: `${opt.id}_sfw` };

  const isNsfw = face === 'nsfw';
  const corruptionGain = isFirstMilestone ? opt.first!.corruptionWeight : 0;
  const renderMode = pickRenderMode(isFirstMilestone, isNsfw, fastForward);

  return {
    option: opt, face, isFirstMilestone, corruptionGain, paradigm, renderMode, isNsfw,
    milestoneLedgerKey: isFirstMilestone ? opt.first!.ledgerKey : undefined,
  };
}

/** 消费首次里程碑后，返回更新后的账本（纯函数） */
export function markMilestone(ledger: Record<string, boolean>, ledgerKey: string): Record<string, boolean> {
  return { ...ledger, [ledgerKey]: true };
}

// ───────────────────────────────────────
// 菜单：列出某时段当前可选的事件选项（+♥标记+置顶排序）
// ───────────────────────────────────────

export interface MenuEntry {
  option: EventOption;
  isNsfw: boolean;      // 当前态是否NSFW（UI加♥）
  label: string;        // 含♥的显示名
}

/**
 * 列出某时段菜单。规则：
 *  - 仅已解锁。
 *  - 双面型若已不可逆侵蚀(闸门开+首次已触发+irreversibleAfterErosion)，SFW版语义已消失，只显示NSFW(♥)。
 *  - 置顶项排最前。
 */
export function buildMenu(
  options: EventOption[], ctx: EventContext, period: 'day' | 'night',
): MenuEntry[] {
  const entries: MenuEntry[] = [];
  for (const opt of options) {
    if (opt.period !== 'any' && opt.period !== period) continue;
    if (opt.hiddenInMenu) continue; // 只由系统/其它界面置入,不进玩家菜单
    if (opt.oncePerGame && opt.first && ctx.triggeredLedger[opt.first.ledgerKey] === true) continue; // 一次性已触发
    if (!isUnlocked(opt, ctx)) continue;
    const res = resolveEvent(opt, ctx, false);
    entries.push({
      option: opt,
      isNsfw: res.isNsfw,
      label: res.isNsfw ? `${opt.label}（♥）` : opt.label,
    });
  }
  // 置顶优先，其余保持注册顺序
  return entries.sort((a, b) => Number(b.option.pinned ?? false) - Number(a.option.pinned ?? false));
}

// ───────────────────────────────────────
// 强制/特殊事件候选池（优先级 + 已触发标签）
// ───────────────────────────────────────

/** 强制事件插入强度 */
export type ForcedIntensity =
  | 'seize_slot'   // 强占：锁定一个已有行动格（玩家不可改派）。骚扰/火并防守。
  | 'insert_slot'; // 临时格：插入预算外的事件专属格。避孕套归零等无空格时。

/** 强制事件条目（强占/霸全/临时格，由系统扫描触发，非玩家主动选） */
export interface ForcedEvent {
  id: string;
  ledgerKey?: string;          // 一次性事件的账本键（触发后打标签，不再触发）
  priority: number;            // 数字小先触发
  intensity: ForcedIntensity;  // 插入强度（强占/临时格）
  optionId: string;            // 强占/插入的格要跑哪个事件选项
  label: string;               // 该格显示名（含来源事件）
  /** 触发条件 */
  condition: (ctx: ForcedContext) => boolean;
  /** 是否一次性（触发后标记，永不再触发） */
  once?: boolean;
  /**
   * 触发时的副作用补丁（可选）。返回 EngineState 的局部覆盖。
   * 用途：E3 真播种触发 → 设置 pregnant=true；其它任何"触发即推进游戏状态"的强制事件。
   * 仅当被 applyForcedInserts/applyForcedSeizes 实际命中并应用时执行一次。
   */
  onApply?: (ctx: ForcedContext) => Record<string, unknown>;
}

/**
 * 扫描强制事件候选池，返回本回合应触发的最高优先级事件（或 null）。
 * 机制（v3 §4）：过滤(已触发标签 + 条件不满足) → 按优先级取最高。
 * 覆盖避孕套三连：三条目同条件(库存=0)，靠优先级+once标签依次触发。
 */
export function scanForced(pool: ForcedEvent[], ctx: ForcedContext): ForcedEvent | null {
  const candidates = pool.filter(e => {
    if (e.once && e.ledgerKey && ctx.triggeredLedger[e.ledgerKey]) return false; // 已触发跳过
    return e.condition(ctx);
  });
  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => a.priority - b.priority)[0];
}
