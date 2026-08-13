// runner-store · useDayRunner(v1 React hook) 翻译为 Pinia setup store。
// 用 setup 语法(对齐模板 settings.ts): ref ≈ useState, 函数 ≈ useCallback。
// 业务逻辑全部复用 src/jiutiao/game/* 纯 TS 模块(零改动)。
//
// 注: defineStore / ref / computed 都是 webpack auto-import 注入的全局,不手动 import。
//   当前用本地 initialEngine(mock 起步)。阶段2末尾改为从 MVU stat_data 初始化 + 双向回写。

import {
  startDay, allocate as allocateFn, setChoice as setChoiceFn, clearChoice as clearChoiceFn,
  beginDay as beginDayFn, beginNight as beginNightFn, fillEmpty as fillEmptyFn, currentSlot,
  markRunning, completeCurrent,
} from '../../game/action-grid/machine';
import { runCurrentSlot, settleNight, advanceToNextDay, applyForcedSeizes, applyForcedInserts } from '../../game/engine/day-runner';
import { eventCtxOf, buildCustomParadigm } from '../../game/engine/machine';
import { resolveEvent } from '../../game/events/machine';
import type { RunnerState } from '../../game/engine/day-runner';
import { dailyDesireDemand, availableThugs, weeklyRecruitQuota, combatPower, presentCountFrom, appendMoneyLog } from '../../game/economy/machine';
import { weaponMult, baseMartialPerThug, prestigeMultiplier, UPGRADES_BY_ID, canUpgrade, applyUpgrade, pendingMysteries, scoutRateBonus, avIncomeMultiplier } from '../../game/upgrade/machine';
import {
  REGIONS_BY_ID, canDefeat, defeatRegion, regionState, effectiveThreshold,
  settleScout, settleBribe, settleOffensiveHarass, SCOUT_COST, BRIBE_COST, isRevengeComplete, fortifiedPower,
} from '../../game/turf/machine';
import {
  canShootAv, buildAvPrompt, consumeShoot, defaultAvState, initAvOnUnlock,
  avSalesIncome, upgradeAvQuota, upgradeAvDuration,
} from '../../game/av/machine';
import type { AvDefinition } from '../../game/av/machine';
import type { UpgradeDef } from '../../game/upgrade/types';
import { gainCorruption, attitudeForStage } from '../../game/corruption/machine';
import { DEBUG_BUILD } from './version';
import type { NightSettleResult } from '../../game/engine/settlement';
import {
  demoEventOptions, demoSummaryTemplates, demoExtractBounds, demoForcedPool, createMockAi,
} from '../../game/engine/mock-ai';
import { demoLorebook } from '../../game/worldbook/demo';
import { createTavernAi } from './tavern-ai';
import { nextPendingSummary, upsertSummary, pendingBigRange, pendingBigMerge, applyBigMerge, appendProse, proseEntryId } from '../../game/memory/machine';
import { DEVELOPMENT_LABELS } from '../../game/intrusion/machine';
import type { DevelopmentLevel } from '../../game/intrusion/machine';
import { routeEndingPerformance, buildEndingExpandRequest } from '../../game/endings/performance';
import { projectGameState } from '../../game/engine/projection';
import type { EndingKind } from '../../game/endings/performance';
import { endingTendency, isSalvationOpen } from '../../game/endings/machine';
import { getMemoryConfig } from './memory-settings';
import type { ForcedEvent } from '../../game/events/machine';
import type { DayState, ActionSlot, SlotChoice, SlotPeriod } from '../../game/action-grid/types';
import type { EngineState, SettleOptions, SettleResult, AiPort } from '../../game/engine/types';

const DEFAULT_FORCED_LEAVE_CHOICE: SlotChoice = { optionId: 'serve_vaginal', label: '供奉（白日供奉）' };
const TOTAL_SLOTS = DEBUG_BUILD ? 12 : 8; // DEBUG档:开局12格(与 initialEngine.totalSlots 一致)

function initialEngine(): EngineState {
  // DEBUG 测试档:高配开局(免从头肝·验证中后期内容)。堕落度仍从0起——用设置页 DEBUG 工具条按需加,
  // 避免开档瞬间级联解锁一堆???把演出全跳过。
  const thugTotal = DEBUG_BUILD ? 300 : 30, garrison = 0;
  const loyalty = DEBUG_BUILD ? 70 : 50;
  const morning = dailyDesireDemand(availableThugs(thugTotal, garrison)); // 日1晨间累积(30打手→30)
  return {
    triggeredSpecials: {}, unlocked: {},
    corruption: 0, cognition: '死撑', claimedGates: {},
    money: DEBUG_BUILD ? 500000 : 8000, thugTotal, garrison, loyalty, loyaltyMartial: Math.round(loyalty / 2), loyaltyInfamy: Math.round(loyalty / 2),
    // 批G2:初始套=0(教程警示玩家第一天必须采购·DEBUG高配档除外)
    condomStock: DEBUG_BUILD ? 3000 : 0, desire: morning, desireCapacity: DEBUG_BUILD ? 400 : 60, desireAddedThisMorning: morning,
    // DEBUG: 吞吐随打手规模同步抬高(300人日增需求300,每格60×5夜格才平衡;保持6会结构性卡死)
    perSlotThroughput: DEBUG_BUILD ? 60 : 6,
    infamy: 0, martialPrestige: DEBUG_BUILD ? 150 : 0,
    ...(DEBUG_BUILD ? { totalSlots: 12 } : {}),
    recruitQuota: weeklyRecruitQuota(0), recruitQuotaMax: weeklyRecruitQuota(0), presentCount: presentCountFrom(thugTotal, loyalty, 0.5), isDangerousPeriod: false,
    servedThisNight: 0,
  };
}

export const useRunnerStore = defineStore('runner', () => {
  // ─── state(ref ≈ useState) ───
  const day = ref<DayState>(startDay(1, TOTAL_SLOTS));
  const engine = ref<EngineState>(initialEngine());
  const fastForward = ref(false);
  // 批K2: 批量快进(默认关)——快进开着时是否链式连算;关=快进只影响单格渲染模式,仍一格一格推进
  const chainFast = ref(false);
  function setChainFast(v: boolean) { chainFast.value = v; }
  // 批K2: 前一天日程快照(供新一天"一键复制前一天安排")。只存玩家可派的选项(optionId+label+params),
  // 不含 locked/inserted 格(强占/临时格由新一天事件系统自行插入,复制会冲突)。
  const prevSchedule = ref<{ day: SlotChoice[]; night: SlotChoice[] } | null>(null);
  const busy = ref(false);
  const lastSettle = ref<SettleResult | null>(null);
  const lastServe = ref<{ condomUsed: number; condomShort: boolean; served: number; desireRelieved: number } | null>(null);
  const lastRecruit = ref<{ recruited: number; cost: number; reason?: 'no_quota' | 'no_money' } | null>(null);
  const lastBuyCondom = ref<{ bought: number; cost: number; reason?: 'no_money' } | null>(null);
  const lastReward = ref<{ gained: number; reason?: 'no_money' } | null>(null);
  const lastProtection = ref<{ income: number } | null>(null);
  const lastAttrition = ref<number>(0); // 昨日打手自然流失数(进次日时设)
  const lastWalk = ref<{ count: number; gained: boolean; capped: boolean } | null>(null); // 散步体质计数
  const lastOrgy = ref<{ wasted: number } | null>(null); // 庭院群交挥霍
  const lastMystery = ref<string[]>([]); // 本轮自动解锁的???通知
  // 通知历史(最近两天·可展开查看)。不进存档,纯会话UI。
  type Notice = { t: string; tone: string };
  const notifyLog = ref<{ day: number; label: string; notices: Notice[] }[]>([]);
  const lastAvIncome = ref<{ income: number; theme: string } | null>(null);
  const lastNight = ref<NightSettleResult | null>(null);
  const forcedLeaveToday = ref(false);
  const forcedSeize = ref<ForcedEvent | null>(null);
  const reliefCleared = ref(false);
  const hardFail = ref(false);
  const hardFailReason = ref<'martial' | 'money' | null>(null);
  const failWarnings = ref<string[]>([]); // 第1次坏审核预警(留1回合缓冲)
  const error = ref<string | null>(null);
  // #4 生成稳定性
  const lastEmpty = ref(false);        // 上次生成空回/截断(正文过短)
  const lastWarn = ref<string | null>(null); // 空回/截断的提示文案
  // 生成中文案(有代入感/幽默,每次随机一条)
  const genHint = ref('事件演化中…');
  const GEN_HINTS = [
    '事件演化中…', '大小姐正在努力…', '时间推移中…', '九条会账房结算中…',
    '罗刹之血在躁动…', '正在拨动命运的算盘…', '凛的体面正在接受考验…', '夜色与欲望发酵中…',
  ];
  // 执行前快照(供重 roll: 恢复后重跑同一格)
  let preRunSnapshot: { day: DayState; engine: EngineState } | null = null;

  // AI 端口: 默认接酒馆 generate(套预设/JB,出真实正文);
  // 检测不到酒馆 generate 全局(本地开发/异常)时回落 mock。
  // useMock() 可手动切回 mock 调试。
  const hasTavernGenerate = typeof (globalThis as any).generate === 'function';
  let ai: AiPort = hasTavernGenerate
    ? createTavernAi({ lorebook: demoLorebook })
    : createMockAi();
  const aiMode = ref<'tavern' | 'mock'>(hasTavernGenerate ? 'tavern' : 'mock');

  function useMock() { ai = createMockAi(); aiMode.value = 'mock'; }
  function useTavern() { ai = createTavernAi({ lorebook: demoLorebook }); aiMode.value = 'tavern'; }

  // ─── 地盘(turf)·Phase1：当前武力 + 攻打/贿赂(纯数值判定·点一下出结果) ───
  const combatPowerNow = computed(() =>
    combatPower(
      availableThugs(engine.value.thugTotal, engine.value.garrison), engine.value.presentCount, engine.value.thugTotal,
      baseMartialPerThug(engine.value.upgrades), weaponMult(engine.value.upgrades),
    ));
  // 常驻(派驻)武力:守地盘用。=派驻打手×每人基础武力×武器乘区。
  const garrisonPowerNow = computed(() =>
    Math.round((engine.value.garrison ?? 0) * baseMartialPerThug(engine.value.upgrades) * weaponMult(engine.value.upgrades)));
  // 有效常驻武力(批B6-5):常驻×(1+据点加固×10%)。防守判定实际用这个值。
  const garrisonEffectiveNow = computed(() => fortifiedPower(garrisonPowerNow.value, engine.value.turfFortifyBonus ?? 0));
  const fortifyLevelsNow = computed(() => engine.value.turfFortifyBonus ?? 0);
  const lastTurf = ref<{ ok: boolean; msg: string } | null>(null);
  type MapKind = 'scout' | 'bribe' | 'attack' | 'harass';
  // 地图选择模式(攻打/刺探/贿赂/骚扰事件格执行中):非空时主区展开地图选目标
  const pendingMap = ref<{ kind: MapKind } | null>(null);

  function attackRegion(id: string) {
    const def = REGIONS_BY_ID[id]; if (!def) return;
    const chk = canDefeat(def, combatPowerNow.value, engine.value.regions);
    if (!chk.ok) { lastTurf.value = { ok: false, msg: `攻打「${def.name}」失败：${chk.reason}` }; return; }
    // 一次性复仇·极道威望(随门槛递增·威望增长系数加成);解锁后区域每日产出由 settleDaily 接入
    const reward = Math.round(Math.max(5, Math.round(effectiveThreshold(def, regionState(engine.value.regions, id)) / 10)) * prestigeMultiplier(engine.value.upgrades));
    engine.value = {
      ...engine.value,
      regions: defeatRegion(engine.value.regions, id),
      martialPrestige: engine.value.martialPrestige + reward,
      martialGainToday: (engine.value.martialGainToday ?? 0) + reward,
    };
    const bossLine = def.isCenter ? `击败中枢Boss「${def.bossName}」` : `攻占「${def.name}」`;
    lastTurf.value = { ok: true, msg: `${bossLine}！极道威望 +${reward}，每日产出已接入。` };
  }

  // ─── 驻防(派打手守地盘·抵御敌人骚扰/进攻;占用打手→降攻打武力) ───
  function setGarrison(n: number) {
    const clamped = Math.max(0, Math.min(engine.value.thugTotal, Math.round(n)));
    engine.value = { ...engine.value, garrison: clamped };
  }

  // ─── 攻打/刺探/贿赂/骚扰(事件格→地图选择流程) ───
  /** 当前格是地图选择型？App 据此走 beginMapSelect 而非 runCurrent。 */
  function currentMapKind(): MapKind | null {
    const cur = currentSlot(day.value);
    const opt = cur?.choice ? demoEventOptions[cur.choice.optionId] : undefined;
    return (opt?.mapSelect as MapKind) ?? null;
  }
  /** 进入地图选择模式(地图选择格被执行) */
  function beginMapSelect(kind: MapKind) { pendingMap.value = { kind }; lastTurf.value = null; }
  function cancelMapSelect() { pendingMap.value = null; }

  /** 完成当前格(无AI·写总结文 + 推进 cursor + 必要时夜结) */
  function completeMapSlot(text: string) {
    const dayRunning = markRunning(day.value);
    const done = completeCurrent(dayRunning, text);
    day.value = done;
    if (done.phase === 'night_settled') { const ns = settleNight(engine.value); engine.value = ns.state; lastNight.value = ns; }
    pendingMap.value = null;
    logNotices(`第${day.value.dayNumber}天 地盘`);
  }

  /** 地图选择落子(攻打/刺探/贿赂/骚扰目标关) */
  function resolveMapSlot(id: string) {
    const kind = pendingMap.value?.kind; if (!kind) return;
    const def = REGIONS_BY_ID[id]; if (!def) return;
    // 清掉上一格残留的逐格提示,避免地盘格重复记录
    lastServe.value = null; lastRecruit.value = null; lastBuyCondom.value = null; lastReward.value = null; lastProtection.value = null; lastAvIncome.value = null; lastSettle.value = null;
    if (kind === 'attack') {
      const chk = canDefeat(def, combatPowerNow.value, engine.value.regions);
      if (!chk.ok) { lastTurf.value = { ok: false, msg: `攻打「${def.name}」失败：${chk.reason}` }; return; }
      const reward = Math.round(Math.max(5, Math.round(effectiveThreshold(def, regionState(engine.value.regions, id)) / 10)) * prestigeMultiplier(engine.value.upgrades));
      engine.value = {
        ...engine.value,
        regions: defeatRegion(engine.value.regions, id),
        martialPrestige: engine.value.martialPrestige + reward,
        martialGainToday: (engine.value.martialGainToday ?? 0) + reward,
      };
      const bossLine = def.isCenter ? `击败中枢Boss「${def.bossName}」` : `攻占「${def.name}」`;
      lastTurf.value = { ok: true, msg: `${bossLine}！极道威望 +${reward}。` };
      completeMapSlot(`一场据点战，${bossLine}。九条会的旗插了上去，极道威望 +${reward}。`);
      return;
    }
    if (kind === 'harass') {
      const r = settleOffensiveHarass(engine.value.regions, id, Math.random(), Math.random());
      if (!r.ok) { lastTurf.value = { ok: false, msg: r.reason === 'already' ? '该关已占据。' : '该关不可骚扰。' }; return; }
      const lost = Math.min(r.thugLost, engine.value.thugTotal);
      engine.value = { ...engine.value, thugTotal: engine.value.thugTotal - lost, regions: r.regions };
      lastTurf.value = { ok: true, msg: `骚扰「${def.name}」：门槛 -${r.cut}` + (lost > 0 ? `，折损 ${lost} 名打手。` : '，全身而退。') };
      completeMapSlot(`打手们去搅了「${def.name}」一场，砸场子放狠话，守备松了门槛降 ${r.cut}` + (lost > 0 ? `；混战中折了 ${lost} 人。` : '；这回没伤着人。'));
      return;
    }
    if (kind === 'scout') {
      const r = settleScout({ money: engine.value.money, regions: engine.value.regions }, id, Math.random(), scoutRateBonus(engine.value.upgrades));
      if (r.reason === 'no_money') {
        lastTurf.value = { ok: false, msg: `资金不足(需¥${SCOUT_COST})，刺探无果。` };
        completeMapSlot('打手前去刺探，却因银根吃紧无功而返。'); return;
      }
      engine.value = { ...engine.value, money: r.money, regions: r.regions, moneyLog: appendMoneyLog(engine.value.moneyLog, day.value.dayNumber, `刺探「${def.name}」`, -r.paid) };
      if (r.hit) {
        lastTurf.value = { ok: true, msg: `刺探「${def.name}」成功！已获情报，可对其贿赂降门槛（花费¥${r.paid}）。` };
        completeMapSlot(`刺探「${def.name}」得手，摸清了守备虚实——贿赂调查的门路打开了。`);
      } else {
        lastTurf.value = { ok: false, msg: `刺探「${def.name}」一无所获（花费¥${r.paid}）。` };
        completeMapSlot(`刺探「${def.name}」扑了空，只折了些打点钱。`);
      }
    } else {
      // 贿赂:固定花门路钱(资金不足则拒)
      if (engine.value.money < BRIBE_COST) { lastTurf.value = { ok: false, msg: `资金不足(需¥${BRIBE_COST})，无法贿赂。` }; return; }
      const r = settleBribe(engine.value.regions, id);
      if (!r.ok) {
        lastTurf.value = { ok: false, msg: r.reason === 'no_intel' ? '该关尚无情报，无法贿赂。' : '该关已占据。' };
        return; // 不消耗格,让玩家重选
      }
      engine.value = { ...engine.value, regions: r.regions, money: engine.value.money - BRIBE_COST, moneyLog: appendMoneyLog(engine.value.moneyLog, day.value.dayNumber, `贿赂「${def.name}」`, -BRIBE_COST) };
      lastTurf.value = { ok: true, msg: `贿赂调查「${def.name}」，击败门槛 -${r.cut}（花费¥${BRIBE_COST}）。` };
      completeMapSlot(`银钱开路，「${def.name}」的守备被买通松动，击败门槛降了 ${r.cut}。`);
    }
  }

  // ─── 升级系统 ───
  const lastUpgrade = ref<{ ok: boolean; msg: string } | null>(null);
  function buyUpgrade(id: string) {
    const def: UpgradeDef | undefined = UPGRADES_BY_ID[id]; if (!def) return;
    const chk = canUpgrade(def, engine.value as any);
    if (!chk.ok) { lastUpgrade.value = { ok: false, msg: `「${def.name}」无法升级：${chk.reason}` }; return; }
    engine.value = applyUpgrade(engine.value as any, def);
    engine.value = { ...engine.value, moneyLog: appendMoneyLog(engine.value.moneyLog, day.value.dayNumber, `升级·${def.name}`, -def.cost) };
    // 建成摄影室解锁 AV → 初始化周拍摄次数(否则面板显示"次数用完"),并引入淫名机制
    if (def.effect.kind === 'unlock' && def.effect.unlockKey === 'av') {
      engine.value = { ...engine.value, ...(initAvOnUnlock(engine.value) as any) };
    }
    // AV 专项升级(一钮一效果):摄制班底4钮=各+1周产能;电池存储5钮=各+24h时长
    if (['av_crew1', 'av_crew2', 'av_crew3', 'av_crew4'].includes(id)) {
      engine.value = { ...engine.value, av: upgradeAvQuota(engine.value.av ?? defaultAvState(), 1) };
    } else if (['av_bat1', 'av_bat2', 'av_bat3', 'av_bat4', 'av_bat5'].includes(id)) {
      engine.value = { ...engine.value, av: upgradeAvDuration(engine.value.av ?? defaultAvState(), 1) };
    } else if (id === 'sex_stamina') {
      // 性爱持续时间增强:供奉吞吐略降(×0.7)、AV单部时长上限+24h
      engine.value = {
        ...engine.value,
        perSlotThroughput: Math.max(1, Math.round((engine.value.perSlotThroughput ?? 6) * 0.7)),
        av: upgradeAvDuration(engine.value.av ?? defaultAvState(), 1),
      };
    }
    // 荒唐升级:购买增堕落度(走认知防线推进+奖励闸门·升级系统=前期堕落度主来源)
    let corrMsg = '';
    if (def.corruptionOnBuy && def.corruptionOnBuy > 0) {
      const cr = gainCorruption(
        { corruption: engine.value.corruption, cognition: engine.value.cognition, claimedGates: engine.value.claimedGates },
        def.corruptionOnBuy,
      );
      engine.value = { ...engine.value, corruption: cr.corruption, cognition: cr.cognition, claimedGates: cr.claimedGates };
      for (const g of cr.firedGates) {
        engine.value = { ...engine.value, money: engine.value.money + (g.reward.money ?? 0), thugTotal: engine.value.thugTotal + (g.reward.thugs ?? 0) };
      }
      corrMsg = ` · 堕落度 +${def.corruptionOnBuy}` + (cr.cognitionAdvancedTo ? ` → ${cr.cognitionAdvancedTo}` : '');
    }
    // ???/荒唐升级:淫名代价(解禁/购买时结算)
    if (def.infamyOnBuy && def.infamyOnBuy > 0) {
      engine.value = { ...engine.value, infamy: engine.value.infamy + def.infamyOnBuy };
      corrMsg += ` · 淫名 +${def.infamyOnBuy}`;
    }
    const lvl = engine.value.upgrades?.[id] ?? 1;
    lastUpgrade.value = def.mystery
      ? { ok: true, msg: `❤「${def.name}」已解禁${corrMsg}。` }
      : { ok: true, msg: `「${def.name}」已升至 Lv.${lvl}（花费¥${def.cost}）${corrMsg}。` };
    autoUnlockMysteries();
  }

  /**
   * ???(mystery)揭晓检查:条件满足→只把"???"翻开显示内容并通知,【不自动生效】。
   * 解禁必须由玩家在升级页免费手动点(走 buyUpgrade·cost=0),堕落/淫名在点击时才结算——防雪崩,节奏交还玩家。
   */
  function autoUnlockMysteries() {
    const revealed = engine.value.mysteryRevealed ?? {};
    const fresh = pendingMysteries(engine.value as any).filter(d => !revealed[d.id]);
    if (!fresh.length) return;
    engine.value = {
      ...engine.value,
      mysteryRevealed: { ...revealed, ...Object.fromEntries(fresh.map(d => [d.id, true])) },
    };
    const msgs = fresh.map(d => `❤ ???揭晓：「${d.name}」——升级页可解禁(免费·解禁时才结算代价)`);
    lastMystery.value = [...lastMystery.value, ...msgs];
    const dnum = day.value.dayNumber;
    notifyLog.value = [...notifyLog.value, { day: dnum, label: `第${dnum}天 ❤揭晓`, notices: msgs.map(t => ({ t, tone: 'rose' })) }].filter(x => x.day >= dnum - 1).slice(-60);
  }

  /** DEBUG 工具条(仅 DEBUG_BUILD·设置页):直接改变量跳到中后期测试点。堕落走 gainCorruption(触发认知/闸门/???级联)。 */
  function debugAdjust(kind: string) {
    if (!DEBUG_BUILD) return;
    const e = engine.value;
    switch (kind) {
      case 'corr+10': {
        const cr = gainCorruption({ corruption: e.corruption, cognition: e.cognition, claimedGates: e.claimedGates }, 10);
        engine.value = { ...e, corruption: cr.corruption, cognition: cr.cognition, claimedGates: cr.claimedGates };
        break;
      }
      case 'money+5w': engine.value = { ...e, money: e.money + 50000 }; break;
      case 'thug+50': engine.value = { ...e, thugTotal: e.thugTotal + 50 }; break;
      case 'condom+500': engine.value = { ...e, condomStock: e.condomStock + 500 }; break;
      case 'loyalty+10': engine.value = { ...e, loyalty: Math.min(100, e.loyalty + 10) }; break;
      case 'loyalty-10': engine.value = { ...e, loyalty: Math.max(0, e.loyalty - 10) }; break;
      case 'infamy+20': engine.value = { ...e, infamy: e.infamy + 20 }; break;
      case 'av+5': { const av = e.av ?? defaultAvState(); engine.value = { ...e, av: { ...av, shotCount: av.shotCount + 5 } }; break; }
      case 'slots15': engine.value = { ...e, totalSlots: 15 }; break;
      case 'desire0': engine.value = { ...e, desire: 0 }; break;
      case 'tp60': engine.value = { ...e, perSlotThroughput: 60 }; break;
    }
    autoUnlockMysteries();
    persistNow();
  }

  // ─── AV 系统(拍摄→排入行动格,执行时注入定制范式) ───
  const lastAv = ref<{ ok: boolean; msg: string } | null>(null);
  /** 把一次AV定制排入今日某空白白天格(执行该格时注入 inlinePrompt + consumeShoot) */
  function queueAvShoot(def: AvDefinition): boolean {
    const chk = canShootAv(engine.value, def);
    if (!chk.ok) { lastAv.value = { ok: false, msg: chk.reason ?? '无法拍摄' }; return false; }
    // 找今日第一个未安排的白天格
    const idx = day.value.daySlots.findIndex(s => !s.choice && !s.locked);
    if (idx < 0) { lastAv.value = { ok: false, msg: '今日白天没有空闲行动格，先分配/清出一格再排片。' }; return false; }
    const prompt = buildAvPrompt(def);
    day.value = setChoiceFn(day.value, 'day', idx, {
      optionId: 'av_custom', label: `拍AV·${def.theme}`,
      params: { avInlinePrompt: prompt, avDef: JSON.parse(JSON.stringify(def)) },
    });
    lastAv.value = { ok: true, msg: `已排入第 ${idx + 1} 个白天格：${def.theme}/${def.setting}（${def.durationHours}h）。执行该格即开拍。` };
    return true;
  }

  // ─── getters(computed) ───
  const currentSlotRef = computed(() => currentSlot(day.value));
  const canRunCurrent = computed(() => {
    const cur = currentSlotRef.value;
    return !!cur && !!cur.choice;
  });
  const runnerState = computed<RunnerState>(() => ({ day: day.value, engine: engine.value }));

  function settleOptions(): SettleOptions {
    return {
      eventOptions: demoEventOptions,
      ai,
      summaryTemplates: demoSummaryTemplates,
      extractBounds: demoExtractBounds,
      forcedPool: demoForcedPool,
      fastForward: fastForward.value,
      rng: Math.random,
    };
  }

  // ─── actions(函数 ≈ useCallback) ───
  function setFastForward(v: boolean) { fastForward.value = v; }

  function allocate(dayCount: number, nightCount: number): boolean {
    const r = allocateFn(day.value, { dayCount, nightCount });
    if (!r.ok) { error.value = r.error!; return false; }
    const seized = applyForcedSeizes(r.state!, engine.value, demoForcedPool);
    error.value = null;
    day.value = seized.day;
    forcedSeize.value = seized.fired;
    return true;
  }

  function setChoice(period: SlotPeriod, index: number, choice: SlotChoice) {
    try { day.value = setChoiceFn(day.value, period, index, choice); error.value = null; }
    catch (e) { error.value = (e as Error).message; }
  }

  // 批K2: 记录一天里玩家自主安排的选项(排除强占/临时格),纯选项引用,新一天可复制。
  function captureSchedule(d: DayState) {
    const pick = (slots: ActionSlot[]): SlotChoice[] =>
      slots.filter(s => s.choice && !s.locked && !s.inserted)
        .map(s => JSON.parse(JSON.stringify(s.choice)) as SlotChoice);
    const dayPicks = pick(d.daySlots);
    const nightPicks = pick(d.nightSlots);
    prevSchedule.value = (dayPicks.length || nightPicks.length)
      ? { day: dayPicks, night: nightPicks } : null;
  }

  /** 批K2: 一键把前一天日程套用到当前(allocating 阶段)。只填空格/可派格,locked 与越界丢弃。
   *  返回本次实际套用的格数;无快照或不在分配阶段返回 0。 */
  function applyPrevSchedule(): number {
    const snap = prevSchedule.value;
    if (!snap || day.value.phase !== 'allocating') return 0;
    let applied = 0;
    const fill = (period: SlotPeriod, picks: SlotChoice[]) => {
      const slots = period === 'day' ? day.value.daySlots : day.value.nightSlots;
      for (let i = 0; i < picks.length && i < slots.length; i++) {
        const s = slots[i];
        if (s.locked || s.status === 'running' || s.status === 'done') continue;
        try { day.value = setChoiceFn(day.value, period, i, picks[i]); applied++; }
        catch { /* 该选项在新一天不合法(条件不满足)→跳过 */ }
      }
    };
    fill('day', snap.day);
    fill('night', snap.night);
    if (applied) error.value = null;
    return applied;
  }

  function clearChoice(period: SlotPeriod, index: number) {
    try { day.value = clearChoiceFn(day.value, period, index); error.value = null; }
    catch (e) { error.value = (e as Error).message; }
  }

  function beginDay(): boolean {
    try { day.value = beginDayFn(day.value); error.value = null; return true; }
    catch (e) { error.value = (e as Error).message; return false; }
  }

  function beginNight(): boolean {
    try {
      day.value = beginNightFn(day.value); error.value = null;
      // 推进到夜晚后,白天最后一格的快照已失效 → 清掉,避免"重生成上一格"误回退白天格
      lastSettle.value = null; lastServe.value = null; lastRecruit.value = null; lastBuyCondom.value = null; preRunSnapshot = null;
      lastExec.value = null; // 批I2: 跨时段"最近执行格"失效(与重roll快照同规则·批Q后只影响整格重roll)
      // 批F2: 进入夜间时段先扫一次夜间强制事件(av_first等)。
      // 覆盖"玩家没排任何夜间格"的场景——nightCount=0时 beginNight 直接 settled,
      // 逐格扫描(runCurrentSlot内)永不会跑,这里兜底插入专属临时格并把时段拉回 running。
      {
        const fi = applyForcedInserts(day.value, engine.value, demoForcedPool, 'night', Math.random);
        if (fi.fired) {
          engine.value = fi.engine;
          let d = fi.day;
          if (d.phase === 'night_settled') {
            // 0夜间格被插入1格 → 时段改回执行中,cursor指向插入格
            const idx = d.nightSlots.findIndex(s => s.inserted && s.status === 'planned');
            d = { ...d, phase: 'night_running', cursor: { period: 'night', index: Math.max(0, idx) } };
          }
          day.value = d;
        }
      }
      return true;
    } catch (e) { error.value = (e as Error).message; return false; }
  }

  function fillEmpty(period: SlotPeriod, choice: SlotChoice) {
    day.value = fillEmptyFn(day.value, period, choice); error.value = null;
  }

  // 空回/截断判定: 正文过短(< 20 字)视为空回;以 <jiutiao_text> 未闭合等截断特征兜底由 extract 处理
  const MIN_TEXT_LEN = 20;
  // AI 生成超时(ms): 防 generateRaw 卡死导致前端/酒馆一起卡
  const GEN_TIMEOUT_MS = 120_000;

  function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
      p,
      new Promise<T>((_, reject) => setTimeout(() => reject(new Error('AI 生成超时(可能被审核拦截或网络问题),请重试')), ms)),
    ]);
  }

  // ─── 后台总结 worker(批B6·纪律性总结:生成无条件,注入由设置决定) ───
  // 每格正文生成后/跨天时触发,静默逐条补齐小总结;失败留待下次,不影响游玩。
  let summarizing = false;
  async function drainSummaries() {
    const port = ai;
    if (summarizing || !port.summarize) return;
    summarizing = true;
    try {
      for (let i = 0; i < 10; i++) { // 每轮上限10条(防意外循环;更多欠账下次继续)
        const pending = nextPendingSummary(engine.value.proseArchive, engine.value.eventSummaries);
        if (!pending) break;
        const text = (await port.summarize({ kind: 'event', text: pending.text.slice(-1400), meta: { day: pending.day, label: pending.label } }))?.trim(); // 批F2:档案已存完整正文,总结输入截尾控token
        if (!text) break; // 空回=失败,留待下次
        engine.value = {
          ...engine.value,
          eventSummaries: upsertSummary(engine.value.eventSummaries, { id: pending.id, day: pending.day, label: pending.label, text }, day.value.dayNumber),
        };
      }
    } catch { /* 静默:下次slot完成/跨天再试 */ }
    finally { summarizing = false; }
  }

  // 大总结(跨整窗边界后台静默触发·完成才注入·未完成置空) + 超阈值滚动合并("大大总结")
  let bigRunning = false;
  async function runBigSummary() {
    const port = ai;
    const cfg = getMemoryConfig();
    if (bigRunning || !port.summarize || !cfg.bigEnabled) return;
    bigRunning = true;
    try {
      const nowDay = day.value.dayNumber;
      const range = pendingBigRange(nowDay, engine.value.bigSummaryTo ?? 0, cfg.windowDays);
      if (range) {
        const items = (engine.value.eventSummaries ?? []).filter(s => s.day >= range.fromDay && s.day <= range.toDay);
        if (items.length === 0) {
          // 该窗无小总结(远期已清理/纯空窗)→ 推进游标防卡死
          engine.value = { ...engine.value, bigSummaryTo: range.toDay };
        } else {
          const joined = items.map(s => `第${s.day}天·${s.label}:${s.text}`).join('\n');
          const text = (await port.summarize({ kind: 'period', text: joined, meta: range }))?.trim();
          if (text) {
            engine.value = {
              ...engine.value,
              bigSummaries: [...(engine.value.bigSummaries ?? []), { fromDay: range.fromDay, toDay: range.toDay, text }],
              bigSummaryTo: range.toDay,
            };
          }
        }
      }
      // 滚动合并: 大总结超阈值 → 最老N条合并为一条(机制统一的"大大总结")
      const m = pendingBigMerge(engine.value.bigSummaries);
      if (m) {
        const joined = m.map(b => `第${b.fromDay}-${b.toDay}天:${b.text}`).join('\n');
        const text = (await port.summarize({ kind: 'merge', text: joined }))?.trim();
        if (text) {
          engine.value = {
            ...engine.value,
            bigSummaries: applyBigMerge(engine.value.bigSummaries ?? [], { fromDay: m[0].fromDay, toDay: m[m.length - 1].toDay, text }),
          };
        }
      }
    } catch { /* 静默:下次跨天再试 */ }
    finally { bigRunning = false; }
  }

  // 真正执行一格(供 runCurrent 首次 + rerunLast 复用)。snapshot 是执行前状态。
  async function execCurrentFrom(snapshot: { day: DayState; engine: EngineState }) {
    busy.value = true; error.value = null; lastEmpty.value = false; lastWarn.value = null;
    lastTurf.value = null; // 清掉地盘格残留提示,避免普通格重复记录
    lastMystery.value = []; lastWalk.value = null; lastOrgy.value = null;
    genHint.value = GEN_HINTS[Math.floor(Math.random() * GEN_HINTS.length)];
    // 执行前记录当前格(AV拍摄消费判定用)
    const ranSlot = currentSlot(snapshot.day);
    try {
      const r = await withTimeout(runCurrentSlot({ day: snapshot.day, engine: snapshot.engine }, settleOptions()), GEN_TIMEOUT_MS);
      let nextEngine = r.state.engine;
      // AV 定制格执行后:消费一次拍摄(扣周次数/累加 shotCount/存档案) + 高额销售进账
      let avIncome: { income: number; theme: string } | null = null;
      if (ranSlot?.choice?.optionId === 'av_custom' && ranSlot.choice.params?.avDef) {
        const avDef = ranSlot.choice.params.avDef as AvDefinition;
        const av = nextEngine.av ?? defaultAvState();
        const income = avSalesIncome(avDef, nextEngine.infamy, avIncomeMultiplier(nextEngine.upgrades));
        nextEngine = { ...nextEngine, av: consumeShoot(av, avDef), money: nextEngine.money + income, moneyLog: appendMoneyLog(nextEngine.moneyLog, day.value.dayNumber, `AV销售·${avDef.theme}`, income) };
        avIncome = { income, theme: avDef.theme };
      }
      let nightInfo: NightSettleResult | null = null;
      if (r.state.day.phase === 'night_settled') {
        const ns = settleNight(nextEngine);
        nextEngine = ns.state;
        nightInfo = ns;
      }
      // 空回/截断检测(只对调 AI 的格;快进/纯模板不算)
      const text = (r.settle.resultText ?? '').trim();
      const wasAi = r.settle.events.renderMode !== 'fast_summary';
      if (wasAi && text.length < MIN_TEXT_LEN) {
        lastEmpty.value = true;
        // 批L: 指向真实存在的入口——点该格进 SlotDetail,失败面板里有「↻ 重新生成本格正文」。
        //   (旧文案指的"重新生成"按钮在批I4-6 就已被撤掉,空回时页面上根本没有那个按钮。)
        lastWarn.value = '本次生成为空或被截断(多半被上游审核拦下)。点开该格,用面板里的「↻ 重新生成本格正文」重试。';
      }
      // (批B6)生成前串行简报已退役:前情=三层记忆纯函数注入(零延迟);小总结改为事后后台生成(见 drainSummaries)
      day.value = r.state.day;
      engine.value = nextEngine;
      lastSettle.value = r.settle;
      lastServe.value = r.serve ?? null;
      lastRecruit.value = r.recruit ?? null;
      lastBuyCondom.value = r.buyCondom ?? null;
      lastReward.value = r.reward ?? null;
      lastProtection.value = r.protection ?? null;
      lastWalk.value = r.walk ?? null;
      lastOrgy.value = r.orgy ?? null;
      lastAvIncome.value = avIncome;
      lastNight.value = nightInfo;
      autoUnlockMysteries();
      if (ranSlot) { lastExec.value = { period: ranSlot.period, index: ranSlot.index }; } // 批I2: 续写宿主定位
      const sl = ranSlot ? `${ranSlot.period === 'day' ? '昼' : '夜'}#${ranSlot.index + 1}` : '';
      const extra: Notice[] = nightInfo ? [{ t: `夜结：供奉${nightInfo.servedToday}人·结余${nightInfo.desireLeftover}` + (nightInfo.overflowImminent ? ' ⚠次日白日供奉' : ''), tone: nightInfo.overflowImminent ? 'warn' : 'dim' }] : [];
      logNotices(`第${day.value.dayNumber}天 ${sl}`, extra);
      void drainSummaries(); // 批B6:事后小总结(后台静默,不阻塞下一格)
    } catch (e) {
      error.value = (e as Error).message;
    } finally {
      busy.value = false;
    }
  }

  async function runCurrent() {
    if (busy.value) return;
    // 执行前快照(供重 roll)
    preRunSnapshot = { day: day.value, engine: engine.value };
    await execCurrentFrom(preRunSnapshot);
  }

  // ─── 批I2: 同格续写 + 按段重roll(批Q: 泛化到任意格) ───
  // lastExec=最近成功执行的格。批Q后它【只】决定「重roll整格」可不可用——那个功能依赖
  // preRunSnapshot(执行前快照),历史格没有快照所以泛化不了。续写/重roll最后一段不再受它约束。
  //
  // 批Q: 原先还有个 lastSegStart(全局单值,记最后一段续写的起点)已删除 —— 它有两个毛病:
  //   ① 全局单值,泛化到任意格后会串格;
  //   ② 不进存档,刷新酒馆后归零 → "重roll最后一段"静默退化成"重roll整格",玩家的续写段被整段吞掉。
  // 现改为从 slot.segStarts 派生(本来就是按格存、且随存档持久化的),两个毛病一起没了。
  const lastExec = ref<{ period: SlotPeriod; index: number } | null>(null);

  /** 该格最后一段(续写段)在整格文本中的起点;返回 0 表示只有首段、尚无续写段。 */
  function lastSegStartOf(slot: ActionSlot | null): number {
    const starts = slot?.segStarts?.length ? slot.segStarts : [0];
    return starts.length > 1 ? starts[starts.length - 1] : 0;
  }

  function slotOf(refp: { period: SlotPeriod; index: number }) {
    const list = refp.period === 'day' ? day.value.daySlots : day.value.nightSlots;
    return list[refp.index] ?? null;
  }
  /** 写回某格正文(不可变更新·可带段偏移) + 同步原文档案(重标 needsSummary → 后台用最终版全文重做小总结) */
  function writeSlotText(refp: { period: SlotPeriod; index: number }, text: string, segStarts?: number[]) {
    const key = refp.period === 'day' ? 'daySlots' : 'nightSlots';
    const list = (day.value as any)[key].map((s: any, i: number) =>
      i === refp.index ? { ...s, resultText: text, ...(segStarts ? { segStarts } : {}) } : s);
    day.value = { ...day.value, [key]: list };
    const slot = slotOf(refp);
    const pid = proseEntryId(day.value.dayNumber, refp.period, refp.index);
    const arch = engine.value.proseArchive ?? [];
    const idx = arch.findIndex(p => p.id === pid);
    if (idx >= 0) {
      const next = arch.map((p, i) => i === idx ? { ...p, text, needsSummary: true } : p);
      engine.value = { ...engine.value, proseArchive: next };
    } else if (slot?.choice) {
      engine.value = {
        ...engine.value,
        proseArchive: appendProse(arch, {
          id: pid, day: day.value.dayNumber, period: refp.period, slot: refp.index,
          label: slot.choice.label, text, needsSummary: true,
        }, day.value.dayNumber),
      };
    }
  }

  /**
   * 续写【指定格】: 已有正文作上文,AI只输出新增段,不收尾,可无限续。note=玩家续写要求(批I4-5)。
   *
   * 批Q(用户点名泛化): 原 continueLast 只认 lastExec=最近执行格,玩家往前推进一格后,
   * 刚才那个场面(首次AV/临盆分娩这类看完想接着扩的)就再也续不了了。现改为任意格可续。
   * 注: day.value 只持有当天的格,所以 dayNumber 恒正确;engine 用当前值(晚几格的状态,可接受)。
   */
  async function continueSlot(period: SlotPeriod, index: number, note?: string) {
    if (busy.value) return;
    const refp = { period, index };
    const slot = slotOf(refp);
    if (!slot?.choice || slot.status !== 'done' || !(slot.resultText ?? '').trim()) return;
    busy.value = true; error.value = null; lastEmpty.value = false; lastWarn.value = null;
    genHint.value = GEN_HINTS[Math.floor(Math.random() * GEN_HINTS.length)];
    try {
      const opt = demoEventOptions[slot.choice.optionId];
      if (!opt) throw new Error('未知事件选项: ' + slot.choice.optionId);
      const resolution = resolveEvent(opt, eventCtxOf(engine.value), false);
      if (typeof slot.choice.params?.avInlinePrompt === 'string') {
        resolution.paradigm = { ...resolution.paradigm, inlinePrompt: slot.choice.params.avInlinePrompt as string };
      }
      if (slot.choice.optionId === 'custom_event') {
        resolution.paradigm = { ...resolution.paradigm, inlinePrompt: buildCustomParadigm(
          typeof slot.choice.params?.customPrompt === 'string' ? slot.choice.params.customPrompt : '') };
      }
      const prevText = (slot.resultText ?? '').trimEnd();
      const ex = await withTimeout(ai.expand({
        resolution, attitude: attitudeForStage(engine.value.cognition),
        choice: slot.choice, state: engine.value, dayNumber: day.value.dayNumber,
        continuation: { prevTail: prevText.slice(-2200), note: note?.trim() || undefined },
      }), GEN_TIMEOUT_MS);
      const seg = (ex.text ?? '').trim();
      if (seg.length < MIN_TEXT_LEN) {
        lastEmpty.value = true;
        lastWarn.value = '续写内容为空或过短(可能被外部审核拦截/截断)。可再点一次续写重试。';
      } else {
        // 批I4-6: 段偏移追加(新段起点=旧文长+分隔'\n\n'),UI按段渲染独立卡片
        const starts = [...((slot.segStarts?.length ? slot.segStarts : [0])), prevText.length + 2];
        writeSlotText(refp, prevText + '\n\n' + seg, starts);
        void drainSummaries(); // 批I2: 总结兼容——writeSlotText 已重标 needsSummary,后台用最终版全文重做
      }
    } catch (e) {
      error.value = (e as Error).message;
    } finally {
      busy.value = false;
    }
  }

  /** 续写最近执行格(批Q 后 = continueSlot 的薄包装,保留旧调用点/旧存档兼容) */
  async function continueLast(note?: string) {
    if (!lastExec.value) return;
    await continueSlot(lastExec.value.period, lastExec.value.index, note);
  }

  /**
   * 批L: 重新生成【任意已结算格】的正文 —— 只补正文,不重跑任何数值结算。
   *
   * 起因(社区多人实证·ssrf/Naoya666/molin + 用户口头反馈"身体擅自发情截断后卡关"):
   * AI 空回/被截断时,格子照样落 status='done' 但 resultText='',于是
   *   · 普通格 → SlotDetail 落进选项列表分支(玩家看到"已展开查看却还是选择事项",刷新也没用);
   *   · locked 格(突发事件/避孕套三连/首次AV/白日供奉日) → 落进"不可改派"提示;
   * 而唯一的重生成入口(续写/重roll)被 showProse 包着,正文为空时根本不渲染 = 彻底没出口。
   *
   * 本函数是那个缺失的出口。相比 rerunLast(按执行前快照重跑整格)的关键差别:
   * 数值早在首次结算时就已入账,这里【绝不能】再结算一次,所以只调 expand 写回正文。
   * 因此它对任意历史格都安全可用,不限于"最近执行的那一格"。
   */
  async function regenerateSlotText(period: SlotPeriod, index: number, note?: string) {
    if (busy.value) return;
    const refp = { period, index };
    const slot = slotOf(refp);
    if (!slot?.choice || slot.status !== 'done') return;
    busy.value = true; error.value = null; lastEmpty.value = false; lastWarn.value = null;
    genHint.value = GEN_HINTS[Math.floor(Math.random() * GEN_HINTS.length)];
    try {
      const opt = demoEventOptions[slot.choice.optionId];
      if (!opt) throw new Error('未知事件选项: ' + slot.choice.optionId);
      const resolution = resolveEvent(opt, eventCtxOf(engine.value), false);
      // 首次里程碑格: 账本已在首次结算时标记,此刻重解析只会拿到常规范式 → 用 wasFirst 强行拨回首次范式
      if (slot.wasFirst && opt.first) {
        resolution.paradigm = opt.first.paradigm;
        resolution.isFirstMilestone = true;
        resolution.renderMode = 'ai_full';
      }
      if (typeof slot.choice.params?.avInlinePrompt === 'string') {
        resolution.paradigm = { ...resolution.paradigm, inlinePrompt: slot.choice.params.avInlinePrompt as string };
      }
      if (slot.choice.optionId === 'custom_event') {
        resolution.paradigm = { ...resolution.paradigm, inlinePrompt: buildCustomParadigm(
          typeof slot.choice.params?.customPrompt === 'string' ? slot.choice.params.customPrompt : '') };
      }
      const n = note?.trim();
      const choice = n
        ? { ...slot.choice, params: { ...(slot.choice.params ?? {}), userNote: n } }
        : slot.choice;
      const ex = await withTimeout(ai.expand({
        resolution, attitude: attitudeForStage(engine.value.cognition),
        choice, state: engine.value, dayNumber: day.value.dayNumber,
      }), GEN_TIMEOUT_MS);
      const t = (ex.text ?? '').trim();
      if (t.length < MIN_TEXT_LEN) {
        lastEmpty.value = true;
        lastWarn.value = '重新生成仍为空或过短。多半是被上游审核拦下或输出被截断——'
          + '可再点一次重试;反复失败就去设置页确认预设里的破甲条目已启用,或把「前文记忆」注入档位调低。';
      } else {
        writeSlotText(refp, t, [0]); // 段结构重置为单段(重生成=换了一份全新正文)
        void drainSummaries();
      }
    } catch (e) {
      error.value = (e as Error).message;
    } finally {
      busy.value = false;
    }
  }

  /**
   * 重roll【指定格】最后一段续写(截掉最后一段→重新续写·可带续写要求)。
   * 批Q: 泛化到任意格,段起点改从 slot.segStarts 派生(见 lastSegStartOf 注释)。
   * 尚无续写段时的退化路径分两种:
   *   · 该格就是最近执行格 → 有执行前快照,可整格重roll(连数值一起重算);
   *   · 历史格 → 没有快照,只能重出正文(数值早已入账,绝不能重算)。
   */
  async function rerollLastSegment(period: SlotPeriod, index: number, note?: string) {
    if (busy.value) return;
    const refp = { period, index };
    const slot = slotOf(refp);
    if (!slot?.choice || slot.status !== 'done') return;
    const segStart = lastSegStartOf(slot);
    if (segStart <= 0) { // 批N: 要求一并带上
      const isLast = lastExec.value?.period === period && lastExec.value?.index === index;
      if (isLast && preRunSnapshot) await rerunLast(note);
      else await regenerateSlotText(period, index, note);
      return;
    }
    const base = (slot.resultText ?? '').slice(0, segStart).trimEnd();
    const starts = (slot.segStarts?.length ? slot.segStarts : [0]).slice(0, -1);
    writeSlotText(refp, base, starts.length ? starts : [0]);
    await continueSlot(period, index, note);
  }

  /** 批I4-7: 玩家直接编辑正文(当天已结算格)。保存后重标needsSummary,段结构重置为单段。 */
  function editSlotText(period: SlotPeriod, index: number, text: string): boolean {
    const slot = slotOf({ period, index });
    if (!slot || slot.status !== 'done') return false;
    const t = text.trim();
    if (!t) return false;
    writeSlotText({ period, index }, t, [0]);

    void drainSummaries();
    return true;
  }

  /** 下一格是否会被快进略写(不调AI)。预判用纯函数,与 settleSlot 同一 resolveEvent。 */
  function nextSlotIsFast(): boolean {
    const cur = currentSlot(day.value);
    if (!cur?.choice) return false; // 批K: 未选选项的格(dual事件等)需玩家先选,不快进
    const opt = demoEventOptions[cur.choice.optionId];
    if (!opt) return false;
    // 批N(社区实证·用户"玉竹林天": "批量跳过连中间穿插的骚扰和攻打都自己跳过了"):
    // 攻打/骚扰/刺探/贿赂是地图选择格,正常路径由 App.exec 转 beginMapSelect 让玩家选目标。
    // 但那个检查只做了链条第一格,链内直接调 runCurrent → 这些格被快进模板静默结算,
    // 玩家从没机会选目标、地盘也毫无变化(resolveMapSlot 压根没跑)= 纯白扔一个行动格。
    if (opt.mapSelect) return false;
    try {
      return resolveEvent(opt, eventCtxOf(engine.value), fastForward.value).renderMode === 'fast_summary';
    } catch { return false; }
  }

  /** 批I1-6(用户需求): 快进开着时一键连算——连续结算所有不需要AI正文的格,
   *  直到撞上第一个必出正文的格(首次里程碑/AV定制等 neverFast)为止,该格停下待玩家执行。 */
  async function runCurrentChain() {
    if (busy.value) return;
    // 批K2: 批量快进未勾选→正常单格推进(快进仍只影响渲染模式)
    if (!fastForward.value || !chainFast.value || !nextSlotIsFast()) { await runCurrent(); return; }
    let guard = 0;
    while (guard++ < 24 && fastForward.value && chainFast.value && nextSlotIsFast()) {
      await runCurrent();
      if (error.value) return; // 失败即停,错误已上屏
    }
    // 循环停在: 时段结算完(无当前格) 或 下一格需要AI正文(留给玩家点执行)
  }

  /** 重新生成当前(刚执行完的)格: 恢复执行前快照,重跑一次。
   *  批N: 可带 note——正文区那个输入框填的要求此前对"重roll整格"完全无效
   *  (它只读选格时填的 params.userNote),玩家反复反馈"要求被吞"。现在并进快照再重跑。 */
  async function rerunLast(note?: string) {
    if (busy.value || !preRunSnapshot) return;
    let snap = preRunSnapshot;
    const n = note?.trim();
    const cur = n ? currentSlot(snap.day) : null;
    if (n && cur?.choice) {
      const key = cur.period === 'day' ? 'daySlots' : 'nightSlots';
      const list = (snap.day as any)[key].map((s: ActionSlot, i: number) =>
        i === cur.index && s.choice
          ? { ...s, choice: { ...s.choice, params: { ...(s.choice.params ?? {}), userNote: n } } }
          : s);
      snap = { ...snap, day: { ...snap.day, [key]: list } };
    }
    await execCurrentFrom(snap);
  }

  function nextDay() {
    const settledDayNo = day.value.dayNumber; // 结算的是哪一天(批G3: day0=教学日免审)
    // 批K2: 结算前抓当天玩家可派选项(非 locked/inserted),供新一天"一键复制"
    captureSchedule(day.value);
    const r = advanceToNextDay(
      engine.value, day.value.dayNumber, engine.value.totalSlots ?? TOTAL_SLOTS,
      DEFAULT_FORCED_LEAVE_CHOICE,
      // 批H8·保底接线修复: "请假日"=白天0格 或 白日供奉霸全日(此前后者不计入,
      // 连续白日供奉永远攒不满滑动窗口保底→软卡死无出口,保底形同虚设)
      day.value.dayCount === 0 || !!day.value.forcedLeave,
    );
    engine.value = r.engine;
    day.value = r.day;
    forcedLeaveToday.value = r.forcedLeave;
    reliefCleared.value = r.reliefCleared;
    hardFail.value = r.daily.hardFail;
    hardFailReason.value = r.daily.hardFailReason ?? null;
    failWarnings.value = r.daily.failWarnings ?? [];
    lastAttrition.value = r.daily.thugsLost ?? 0;
    forcedSeize.value = null;
    // 教学日免审(批G3): Day0 是手把手教学(只教操作),零威望/低资金不该消耗硬失败审核计数,
    // 否则玩家第1天不打架就被警告/第2天硬失败——审核从第1天正式开始。
    if (settledDayNo === 0) {
      engine.value = { ...engine.value, martialZeroStreak: 0, moneyZeroStreak: 0 };
      hardFail.value = false; hardFailReason.value = null; failWarnings.value = [];
    }
    // 每日自动存档(批C2.5): 成功推进新一天→"当天开始"入自动槽;硬失败不覆盖(自动档停在失败日早晨)
    if (!r.daily.hardFail || settledDayNo === 0) autoDailySave();
    // 日终通知入历史(流失/硬失败/预警)
    {
      const ex: Notice[] = [];
      if (r.daily.thugsLost > 0) ex.push({ t: `打手流失 -${r.daily.thugsLost}（忠诚低·被挖角/出走）`, tone: 'warn' });
      if ((r.daily.prestigeDecay ?? 0) > 0) ex.push({ t: `威望自然衰减 -${r.daily.prestigeDecay}（江湖善忘）`, tone: 'dim' });
      const dfn = r.daily.defense;
      if (dfn && dfn.raids > 0) ex.push({
        t: dfn.lost.length ? `昨日被进攻${dfn.raids}次，丢失地盘：${dfn.lost.join('、')}` : `昨日被进攻${dfn.raids}次，没有地盘丢失`,
        tone: dfn.lost.length ? 'err' : 'ok',
      });
      (r.daily.failWarnings ?? []).forEach(w => ex.push({ t: w, tone: 'warn' }));
      if (r.daily.hardFail) ex.push({ t: '☠ 硬失败：' + (r.daily.hardFailReason === 'money' ? '资金断流' : '威望枯竭'), tone: 'err' });
      if (r.forcedLeave) ex.push({ t: '⚠ 欲望溢出 → 次日白日供奉（霸全）', tone: 'warn' });
      const d = day.value.dayNumber;
      if (ex.length) notifyLog.value = [...notifyLog.value, { day: d, label: `第${d}天 日终`, notices: ex }].filter(x => x.day >= d - 1).slice(-60);
    }
    autoUnlockMysteries();
    lastSettle.value = null; lastServe.value = null; lastRecruit.value = null; lastBuyCondom.value = null; lastReward.value = null; lastProtection.value = null; lastAvIncome.value = null; lastWalk.value = null; lastOrgy.value = null; lastNight.value = null; error.value = null;
    lastExec.value = null; // 批I2: 跨天失效
    // 批B6:跨天触发后台大总结检查(跨整窗边界才真正总结)+补齐欠账小总结
    void drainSummaries();
    void runBigSummary();
  }

  function loadState(state: RunnerState, ff: boolean) {
    day.value = state.day; engine.value = state.engine; fastForward.value = ff;
    lastSettle.value = null; lastServe.value = null; lastRecruit.value = null; lastBuyCondom.value = null; lastReward.value = null; lastProtection.value = null; lastAvIncome.value = null; lastWalk.value = null; lastOrgy.value = null; lastNight.value = null;
    forcedLeaveToday.value = false; forcedSeize.value = null;
    reliefCleared.value = false; hardFail.value = false; hardFailReason.value = null; failWarnings.value = []; error.value = null;
    lastExec.value = null; // 批I2: 读档/重置后失效
  }

  // ─── 持久化(chat 作用域·一聊天一份存档·刷新酒馆/重开聊天不丢进度) ───
  // 用酒馆"聊天变量"存一份存档 blob(engine+day+已生成正文随 day.slots.resultText 一起)。
  // 任意状态变化→防抖写回; 启动时若有存档→读回, 否则落初始并写一次。
  const SAVE_KEY = '九条会存档';
  const hasTavernVars = typeof getVariables === 'function' && typeof insertOrAssignVariables === 'function';
  let _loadingSave = false;
  let _saveTimer: ReturnType<typeof setTimeout> | null = null;
  function snapshot() {
    return JSON.parse(JSON.stringify({ v: 1, engine: engine.value, day: day.value, fastForward: fastForward.value, chainFast: chainFast.value, prevSchedule: prevSchedule.value }));
  }
  function persistNow() {
    if (_loadingSave || !hasTavernVars) return;
    try {
      insertOrAssignVariables({
        [SAVE_KEY]: snapshot(),
        // 状态投影(批C4·MVU收尾=单向投影): 九域中文键只读镜像,变量管理器/酒馆助手脚本/用户EJS 可读
        九条会状态: projectGameState(engine.value, day.value.dayNumber),
      }, { type: 'chat' });
    }
    catch (e) { console.warn('[pellucid] 存档失败', e); }
  }
  function schedulePersist() { if (_saveTimer) clearTimeout(_saveTimer); _saveTimer = setTimeout(persistNow, 400); }
  function loadSave(): boolean {
    if (!hasTavernVars) return false;
    try {
      const vars = getVariables({ type: 'chat' }) || {};
      const s = (vars as any)[SAVE_KEY];
      if (s && s.engine && s.day) {
        _loadingSave = true;
        engine.value = s.engine; day.value = s.day;
        if (typeof s.fastForward === 'boolean') fastForward.value = s.fastForward;
        if (typeof s.chainFast === 'boolean') chainFast.value = s.chainFast;
        if (s.prevSchedule) prevSchedule.value = s.prevSchedule;
        _loadingSave = false;
        return true;
      }
    } catch (e) { console.warn('[pellucid] 读档失败', e); }
    return false;
  }
  /** 重开新游戏(清存档→初始状态并立即写档) */
  function resetGame() {
    _loadingSave = true;
    day.value = startDay(1, TOTAL_SLOTS); engine.value = initialEngine(); fastForward.value = false;
    lastSettle.value = null; lastServe.value = null; lastRecruit.value = null; lastBuyCondom.value = null; lastReward.value = null; lastProtection.value = null; lastAvIncome.value = null; lastWalk.value = null; lastOrgy.value = null; lastNight.value = null;
    forcedLeaveToday.value = false; forcedSeize.value = null; reliefCleared.value = false;
    hardFail.value = false; hardFailReason.value = null; failWarnings.value = []; error.value = null;
    notifyLog.value = []; dismissedEnding.value = null;
    _loadingSave = false; persistNow();
  }

  // ─── 存档系统(批E1·SLG式多槽) ───
  // 4个手动槽(存档页自由选择存/读) + 1个自动槽(每次成功推进新一天写"当天开始"·硬失败当次不覆盖,
  // 保证自动档永远停在"失败那天的早晨")。坏结局 overlay: 自动档快捷回退 + 打开存档界面自选。
  // chat 变量持久化(随聊天);无酒馆变量环境(本地dev)用内存兜底。旧单槽`九条会手动存档`自动迁移为槽1。
  const MANUAL_KEYS = ['九条会手动存档1', '九条会手动存档2', '九条会手动存档3', '九条会手动存档4'];
  const LEGACY_MANUAL_KEY = '九条会手动存档';
  const AUTO_KEY = '九条会自动存档';
  const _memSlots: Record<string, any> = {}; // 无 tavern vars 环境的内存兜底
  function writeSlot(key: string, snap: unknown) {
    _memSlots[key] = snap;
    if (!hasTavernVars) return;
    try { insertOrAssignVariables({ [key]: snap }, { type: 'chat' }); }
    catch (e) { console.warn('[pellucid] 存档槽写入失败', key, e); }
  }
  function readSlot(key: string): any {
    if (hasTavernVars) {
      try { const v = ((getVariables({ type: 'chat' }) || {}) as any)[key]; if (v) return v; } catch { /* fallthrough */ }
    }
    return _memSlots[key] ?? null;
  }
  /** 槽位元信息(chat变量非响应式→ref镜像,写入/启动时同步) */
  type SlotMeta = { day: number; savedAt: string; summary: string } | null;
  const manualSlotInfos = ref<SlotMeta[]>([null, null, null, null]);
  const autoSlotInfo = ref<SlotMeta>(null);
  function slotMetaOf(snap: any): SlotMeta {
    if (!snap?.day) return null;
    return snap.meta ?? { day: snap.day.dayNumber ?? 0, savedAt: '', summary: '' };
  }
  function buildMeta(): { day: number; savedAt: string; summary: string } {
    const e = engine.value;
    return {
      day: day.value.dayNumber,
      savedAt: new Date().toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
      summary: `堕落${e.corruption}·¥${e.money.toLocaleString()}·打手${e.thugTotal}·${e.cognition}`,
    };
  }
  function refreshSlotInfo() {
    // 旧单槽迁移: 槽1为空且旧槽有档 → 复制入槽1(旧键弃置不再读写)
    const legacy = readSlot(LEGACY_MANUAL_KEY);
    if (legacy && !readSlot(MANUAL_KEYS[0])) writeSlot(MANUAL_KEYS[0], legacy);
    manualSlotInfos.value = MANUAL_KEYS.map(k => slotMetaOf(readSlot(k)));
    autoSlotInfo.value = slotMetaOf(readSlot(AUTO_KEY));
  }
  /** 存入手动槽 i(0-3) */
  function saveToSlot(i: number) {
    if (i < 0 || i > 3) return;
    writeSlot(MANUAL_KEYS[i], { ...snapshot(), meta: buildMeta() });
    manualSlotInfos.value = MANUAL_KEYS.map(k => slotMetaOf(readSlot(k)));
  }
  /** 每日自动存档: nextDay 成功(非硬失败)后调用,写"当天开始"快照 */
  function autoDailySave() {
    writeSlot(AUTO_KEY, { ...snapshot(), meta: buildMeta() });
    autoSlotInfo.value = slotMetaOf(readSlot(AUTO_KEY));
  }
  /** 从快照恢复(通用): 状态回填+瞬态清理+结局清除+覆写主存档 */
  function restoreFrom(snap: any): boolean {
    if (!snap?.engine || !snap?.day) return false;
    _loadingSave = true;
    engine.value = JSON.parse(JSON.stringify(snap.engine));
    day.value = JSON.parse(JSON.stringify(snap.day));
    if (typeof snap.fastForward === 'boolean') fastForward.value = snap.fastForward;
    lastSettle.value = null; lastServe.value = null; lastRecruit.value = null; lastBuyCondom.value = null; lastReward.value = null; lastProtection.value = null; lastAvIncome.value = null; lastWalk.value = null; lastOrgy.value = null; lastNight.value = null;
    forcedLeaveToday.value = false; forcedSeize.value = null; reliefCleared.value = false;
    hardFail.value = false; hardFailReason.value = null; failWarnings.value = []; error.value = null;
    dismissedEnding.value = null; _endingProseFor = null; endingProse.value = null; endingProseBusy.value = false;
    _loadingSave = false; persistNow();
    return true;
  }
  /** 读取手动槽 i(0-3) */
  function loadFromSlot(i: number): boolean { return restoreFrom(readSlot(MANUAL_KEYS[i] ?? '')); }
  /** 读取自动档 */
  function loadAutoSave(): boolean { return restoreFrom(readSlot(AUTO_KEY)); }

  // ─── 留档(正文回忆·批E2) ───
  // 玩家收藏满意的正文段落随时回看;近期原文档案(proseArchive 3天窗)也在留档页可查/补救收藏。
  // 持久化: chat 变量`九条会留档`(随聊天·上限100条,超出丢最老)。
  const FAV_KEY = '九条会留档';
  const FAV_CAP = 100;
  type FavEntry = { id: string; day: number; label: string; text: string; savedAt: string; pinned?: boolean };
  const favorites = ref<FavEntry[]>([]);
  function loadFavorites() {
    const v = readSlot(FAV_KEY);
    favorites.value = Array.isArray(v) ? v : [];
  }
  function persistFavorites() { writeSlot(FAV_KEY, JSON.parse(JSON.stringify(favorites.value))); }
  /** 收藏一段正文(去重: 同 id 不重复收) */
  function addFavorite(entry: { id: string; day: number; label: string; text: string }): boolean {
    if (!entry.text?.trim()) return false;
    if (favorites.value.some(f => f.id === entry.id)) return false;
    const fav: FavEntry = { ...entry, savedAt: new Date().toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) };
    favorites.value = [...favorites.value, fav].slice(-FAV_CAP);
    persistFavorites();
    return true;
  }
  function removeFavorite(id: string) {
    favorites.value = favorites.value.filter(f => f.id !== id);
    persistFavorites();
  }
  /** 重命名收藏标题(批F2) */
  function renameFavorite(id: string, label: string) {
    const t = label.trim();
    if (!t) return;
    favorites.value = favorites.value.map(f => f.id === id ? { ...f, label: t } : f);
    persistFavorites();
  }
  /** 置顶/取消置顶收藏(批F2·置顶项列表页排最前) */
  function togglePinFavorite(id: string) {
    favorites.value = favorites.value.map(f => f.id === id ? { ...f, pinned: !f.pinned } : f);
    persistFavorites();
  }
  // ─── 新手教程标记(批G2·每聊天=每局一次) ───
  const TUT_KEY = '九条会教程已读';
  const tutorialSeen = ref<boolean>(!!readSlot(TUT_KEY));
  function markTutorialSeen() { tutorialSeen.value = true; writeSlot(TUT_KEY, true); }
  /** 批K: 跳过教学关时补发初始套(Day0的buy_condoms格未执行→condomStock=0→开局无套) */
  function skipTutorialGiveCondoms() {
    if (engine.value.condomStock === 0) engine.value = { ...engine.value, condomStock: 20 };
  }
  /** 实操教学关(批G3·Day0): 3格微型的一天,收益真实入账,结算后进入第1天正式游戏 */
  function startTutorialDay0() {
    day.value = startDay(0, 3);
  }

  /** 收藏当前选中/已结算格的完整正文 */
  function favoriteSlot(slot: { period: string; index: number; choice?: { label: string } | null; resultText?: string | null }): boolean {
    const text = (slot.resultText ?? '').trim();
    if (!text) return false;
    return addFavorite({
      id: `${day.value.dayNumber}-${slot.period}-${slot.index}`,
      day: day.value.dayNumber,
      label: slot.choice?.label ?? '事件',
      text,
    });
  }
  /** 坏结局快捷回退=自动档(失败日早晨) */
  function rollbackFromEnding(): boolean { return loadAutoSave(); }
  const autoSaveDay = computed(() => autoSlotInfo.value?.day ?? null);
  const canRollback = computed(() => autoSlotInfo.value != null);

  // ─── 通知:当前格提示(只此一格) + 历史日志(最近两天) ───
  function buildSlotNotices(): Notice[] {
    const out: Notice[] = [];
    if (lastEmpty.value && lastWarn.value) out.push({ t: '⚠ ' + lastWarn.value, tone: 'warn' });
    if (lastServe.value) out.push({ t: `供奉 ${lastServe.value.served}人 · 欲望-${lastServe.value.desireRelieved} · 套-${lastServe.value.condomUsed}` + (lastServe.value.condomShort ? '（库存不足!）' : ''), tone: lastServe.value.condomShort ? 'err' : 'rose' });
    if (lastSettle.value?.events.isFirstSpecial) out.push({ t: `◆ 首次特殊 堕落+${lastSettle.value.events.corruptionGain}` + (lastSettle.value.events.cognitionAdvancedTo ? ` → ${lastSettle.value.events.cognitionAdvancedTo}` : ''), tone: 'rose' });
    if (lastSettle.value?.events.firedGateIds.length) out.push({ t: '◆ ' + lastSettle.value.events.firedGateIds.map(g => '堕落度（' + g.replace(/\D/g, '') + '）').join('、') + ' 奖励', tone: 'gold' });
    // A4 日常侵蚀反馈(批C1): 隐瞒成败玩家可见 + 身体开发度推进
    {
      const a4 = lastSettle.value?.events.a4;
      if (a4) {
        if (a4.martialGained > 0) out.push({ t: `🤫 无人声张——白日宣淫被打手们内部消化,极道威望 +${a4.martialGained}`, tone: 'ok' });
        if (a4.martialTransferred > 0) out.push({ t: `👁 被外人撞见了！风声传了出去——极道威望 -${a4.martialTransferred} 转为淫名` + (a4.loyaltyDelta > 0 ? `,共担秘密·忠诚 +${a4.loyaltyDelta}` : ''), tone: 'warn' });
        if (a4.developedPart) out.push({ t: `🌡 ${a4.developedPart}开发度 → ${DEVELOPMENT_LABELS[(a4.developedTo ?? 0) as DevelopmentLevel] ?? a4.developedTo}`, tone: 'rose' });
      }
    }
    if (lastRecruit.value && lastRecruit.value.recruited > 0) out.push({ t: `+${lastRecruit.value.recruited}打手 (¥${lastRecruit.value.cost})`, tone: 'ok' });
    if (lastBuyCondom.value && lastBuyCondom.value.bought > 0) out.push({ t: `+${lastBuyCondom.value.bought}避孕套`, tone: 'ok' });
    if (lastReward.value && lastReward.value.gained > 0) out.push({ t: `犒赏打手 · 极道忠诚 +${lastReward.value.gained}`, tone: 'gold' });
    if (lastProtection.value && lastProtection.value.income > 0) out.push({ t: `收保护费 +¥${lastProtection.value.income.toLocaleString()}`, tone: 'ok' });
    if (lastAvIncome.value && lastAvIncome.value.income > 0) out.push({ t: `AV销售 +¥${lastAvIncome.value.income.toLocaleString()}（${lastAvIncome.value.theme}）`, tone: 'gold' });
    if (lastTurf.value) out.push({ t: lastTurf.value.msg, tone: lastTurf.value.ok ? 'ok' : 'warn' });
    if (lastWalk.value) out.push(lastWalk.value.capped
      ? { t: '散步·体质已达上限(15格),不再积累', tone: 'dim' }
      : { t: lastWalk.value.gained ? '❀ 体质大成·行动格 +1！' : `散步·体质计数 ${lastWalk.value.count}/10`, tone: lastWalk.value.gained ? 'gold' : 'dim' });
    if (lastOrgy.value) out.push({ t: `❤ 庭院群交·打手们挥霍光了避孕套（-${lastOrgy.value.wasted}·库存归零）`, tone: 'rose' });
    lastMystery.value.forEach(t => out.push({ t, tone: 'rose' }));
    return out;
  }
  function logNotices(label: string, extra: Notice[] = []) {
    const notices = [...extra, ...buildSlotNotices()];
    if (!notices.length) return;
    const d = day.value.dayNumber;
    notifyLog.value = [...notifyLog.value, { day: d, label, notices }].filter(x => x.day >= d - 1).slice(-60);
  }

  // 结局倾向(过程可感知·endings/machine 首次接入生产·RinPanel/状态显示用)
  const tendencyNow = computed(() => endingTendency({
    cognition: engine.value.cognition, corruption: engine.value.corruption, pregnant: engine.value.pregnant,
  }));
  const salvationOpenNow = computed(() => isSalvationOpen({
    cognition: engine.value.cognition, corruption: engine.value.corruption, pregnant: engine.value.pregnant,
  }));

  // ─── 结局/胜利判定 ───
  const dismissedEnding = ref<string | null>(null);
  const ending = computed(() => {
    if (isRevengeComplete(engine.value.regions)) return {
      kind: 'revenge', title: '复 仇 完 成',
      text: '弥生道会长——杀父仇人——已死在九条会脚下。凛踏过尸山，九条家的旗插遍了整片城区。当年覆灭的家业，如今由她一手夺了回来。复仇，达成了。',
    };
    if (engine.value.cognition === '母猪化') return {
      kind: 'fall', title: '母 猪 化',
      text: '凛的认知防线彻底崩溃。她不再是那个死撑体面的大小姐——只剩下迎合、依赖与渴求。九条家的肉便器，名副其实。她甚至已经分不清这是堕落，还是归宿。',
    };
    if (hardFail.value) return {
      kind: 'fail', title: '九 条 会 覆 灭',
      text: hardFailReason.value === 'money'
        ? '账上彻底断了现金流，打手作鸟兽散，债主与仇家闻风而至。九条会的招牌，又一次倒在了凛手里。'
        : '再没打出过任何战果、也拉不到生意，九条会的名号无人再惧。东山再起的最后一点底气，也耗尽了。',
    };
    return null;
  });
  function dismissEnding() { dismissedEnding.value = ending.value?.kind ?? null; }
  const showEnding = computed(() => !!ending.value && dismissedEnding.value !== ending.value!.kind);

  // ─── 结局AI演出(批C2·七条孤儿范式接通) ───
  // 结局触发→后台按堕落/怀孕路由范式(salvation/breeding/birth_show/ancestor_breeding/defeat)调 ai.expand,
  // 生成演出正文替换 overlay 静态文本;失败/生成中=静态文本兜底(不阻塞 overlay 显示)。
  const endingProse = ref<string | null>(null);       // 演出正文(生成完成后非null)
  const endingProseBusy = ref(false);
  const endingProseLabel = ref('');
  let _endingProseFor: string | null = null;          // 已生成/正在生成的结局kind(防重复)
  watch(ending, async (e) => {
    if (!e || _endingProseFor === e.kind) return;
    _endingProseFor = e.kind;
    endingProse.value = null;
    const perf = routeEndingPerformance(e.kind as EndingKind, engine.value);
    endingProseLabel.value = perf.label;
    endingProseBusy.value = true;
    try {
      const req = buildEndingExpandRequest(e.kind as EndingKind, engine.value, day.value.dayNumber);
      const ex = await withTimeout(ai.expand(req), GEN_TIMEOUT_MS);
      const text = (ex.text ?? '').trim();
      if (text.length >= MIN_TEXT_LEN) endingProse.value = text;
    } catch { /* 演出生成失败→overlay 保持静态文本 */ }
    finally { endingProseBusy.value = false; }
  });

  // 启动: 有存档→读回; 无→落初始并写一次。之后任意状态变化自动防抖存。
  const _hadSave = loadSave();
  if (!_hadSave) persistNow();
  refreshSlotInfo(); // 存档槽天数信息(批E1·驱动存档页/回退按钮文案)
  loadFavorites();   // 留档收藏(批E2)
  autoUnlockMysteries(); // 读档后补结:堕落度已到但???尚未解锁的补齐(如旧档升级)
  watch([day, engine, fastForward, chainFast], schedulePersist, { deep: true });

  return {
    day, engine, fastForward, busy, lastSettle, lastServe, lastRecruit, lastNight,
    lastReward, lastProtection, lastAvIncome, lastAttrition, notifyLog,
    lastWalk, lastOrgy, lastMystery, debugAdjust,
    forcedLeaveToday, forcedSeize, reliefCleared, hardFail, hardFailReason, failWarnings, error,
    lastEmpty, lastWarn, genHint, lastBuyCondom,
    currentSlot: currentSlotRef, canRunCurrent, runnerState,
    aiMode, hasSave: _hadSave, hasTavernVars,
    combatPowerNow, garrisonPowerNow, garrisonEffectiveNow, fortifyLevelsNow, lastTurf, attackRegion, setGarrison,
    pendingMap, currentMapKind, beginMapSelect, cancelMapSelect, resolveMapSlot,
    lastUpgrade, buyUpgrade, lastAv, queueAvShoot,
    ending, showEnding, dismissEnding,
    endingProse, endingProseBusy, endingProseLabel, canRollback, rollbackFromEnding,
    manualSlotInfos, autoSlotInfo, autoSaveDay, saveToSlot, loadFromSlot, loadAutoSave,
    favorites, addFavorite, removeFavorite, favoriteSlot, renameFavorite, togglePinFavorite,
    tutorialSeen, markTutorialSeen, startTutorialDay0, skipTutorialGiveCondoms,
    chainFast, setChainFast, prevSchedule, applyPrevSchedule,
    tendencyNow, salvationOpenNow,
    setFastForward, allocate, setChoice, clearChoice, fillEmpty,
    beginDay, beginNight, runCurrent, runCurrentChain, rerunLast, nextDay, loadState,
    continueLast, continueSlot, rerollLastSegment, regenerateSlotText, editSlotText, lastExec,
    useMock, useTavern, saveNow: persistNow, resetGame,
  };
});
