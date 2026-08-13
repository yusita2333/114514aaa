// 经济/时段结算（纯函数）。把 economy 公式接进游戏循环，让数值真正闭环。
// 三层结算：单格供奉 → 夜晚收尾 → 每日收尾。settleSlot 之外的"硬经营数值"在此结算。

import {
  condomCost, condomStatus, desireRelief, desireOverflow, purchaseCap, CONST,
  availableThugs, combatPower, weeklyRecruitQuota, totalPrestige, auditMoney, thugAttrition, decayPrestige, appendMoneyLog,
} from '../economy/machine';
import { isAvUnlocked, auditMartial } from '../prestige/machine';
import { weaponMult, baseMartialPerThug, loyaltyDecayReduction, condomDailyFrom } from '../upgrade/machine';
import { dailyYields, threatLevelFrom, totalShops, settleTurfThreat, fortifiedPower } from '../turf/machine';

// 地盘攻守玩法(威望主来源)已接入(v33+ 攻打/骚扰/刺探/贿赂在行动格·占领有每日威望产出),
//   玩家可结构性赚极道威望(攻打关卡 + 占领据点日产)→ 解除暂挂,启用威望轨硬失败。
const 威望轨硬失败已启用 = true;
import { advanceCycle } from '../cycle/machine';
import type { EngineState } from './types';

/** 单个供奉格结算：扣避孕套 + 记录被供奉人数。仅"供奉类"行动触发(serve/oral/anal等)。 */
export interface ServeSettleResult {
  state: EngineState;
  condomUsed: number;
  condomShort: boolean;   // 库存不足以覆盖本场(触发内射风险链)
  served: number;         // 本场供奉人数
  desireRelieved: number; // 本场当场清偿的欲望量(实时降欲)
}

/**
 * 供奉格结算(实时·每格执行时调用)。presentCount = 本场在场人数。
 *  - 扣避孕套；不足则标记 condomShort（内射/怀孕判定链由 endings 处理）。
 *  - **当场清偿欲望**：欲望 -= 本场供奉人数 × 供奉降欲量，clamp≥0（玩家盯着状态栏看它掉）。
 *  - 被供奉的人计入 servedThisNight（统计/显示用）。
 * @param throughputMultiplier 吞吐倍率（强制请假轮奸日=1.5，多服务人数同步放大扣套与降欲）
 * @param reliefMultiplier 最终降欲倍率（口交等无套供奉=0.5；在所有吞吐/人数/升级加成算完后，对最终降欲值一次性乘）
 */
export function settleServe(state: EngineState, throughputMultiplier = 1, consumeCondom = true, reliefMultiplier = 1): ServeSettleResult {
  // 服务人数 = min(在场打手数, 供奉格吞吐上限×倍率)。在场少则取在场,在场多则被吞吐封顶。
  const cap = Math.round((state.perSlotThroughput ?? 6) * throughputMultiplier);
  const served = Math.max(0, Math.min(state.presentCount, cap));
  // 口交等非插入供奉不耗避孕套(consumeCondom=false)
  const need = consumeCondom ? condomCost(served, state.isDangerousPeriod) : 0;
  const used = Math.min(need, state.condomStock);
  const condomShort = consumeCondom && need > state.condomStock;
  // 最终降欲 = 全部加成算完后的 desireRelief(served) 再乘 reliefMultiplier(口交×0.5)
  const relieved = Math.round(desireRelief(served) * reliefMultiplier);
  return {
    state: {
      ...state,
      condomStock: Math.max(0, state.condomStock - used),
      servedThisNight: state.servedThisNight + served,
      desire: Math.max(0, state.desire - relieved),
    },
    condomUsed: used,
    condomShort,
    served,
    desireRelieved: relieved,
  };
}

/** 采购避孕套即时结算：当场加库存、扣钱(玩家执行格立刻看到避孕套数变化,而非日终)。 */
export interface BuyCondomResult {
  state: EngineState;
  bought: number;
  cost: number;
  reason?: 'no_money'; // 买到0的原因
}
export function settleBuyCondoms(state: EngineState): BuyCondomResult {
  const shops = totalShops(state.regions);
  const cap = purchaseCap(shops, state.stability ?? 100, state.purchaseUpgradeMult ?? 1);
  const unit = CONST.避孕套单价;
  const affordable = Math.floor(state.money / unit);
  const bought = Math.min(cap, Math.max(0, affordable));
  if (bought <= 0) {
    return { state, bought: 0, cost: 0, reason: 'no_money' };
  }
  const cost = bought * unit;
  return {
    state: { ...state, condomStock: state.condomStock + bought, money: state.money - cost },
    bought, cost,
  };
}

/**
 * 夜晚收尾(报告·只读不改欲望)。
 * 晨间累积模型下,欲望增减都已实时发生(晨间 advanceToNextDay 累积 / 供奉格 settleServe 降欲),
 * 夜结不再改欲望。本函数只汇报当天结余,供 UI 显示与"是否将触发请假轮奸"的预警。
 * 真正的请假轮奸判定在 advanceToNextDay(对结余欲望、在加次日晨间累积前判定)。
 */
export interface NightSettleResult {
  state: EngineState;
  servedToday: number;        // 今日累计供奉人数
  desireLeftover: number;     // 当前结余欲望(供奉后)
  overflowImminent: boolean;  // 结余≥承载上限 → 次日将触发请假轮奸(预警)
}

export function settleNight(state: EngineState): NightSettleResult {
  return {
    state, // 不改动(欲望已实时结算)
    servedToday: state.servedThisNight,
    desireLeftover: state.desire,
    overflowImminent: desireOverflow(state.desire, state.desireCapacity),
  };
}

/** 每日收尾结算（一天结束→次日）。 */
export interface DailySettleResult {
  state: EngineState;
  recruitRefreshed: boolean;
  combatPower: number;
  hardFail: boolean;        // 硬失败信号（双轨再生力任一连续2次坏审核：威望进账连续2次为0 / 资金余额连续2次≤0）
  hardFailReason?: 'martial' | 'money'; // 触发硬失败的轨道
  /** 第1次坏审核的预警(设计补遗_A：给玩家1回合缓冲+明确为什么快输了)。空=无预警。 */
  failWarnings: string[];
  yields: { condom: number; money: number; martial: number }; // 据点每日产出
  thugsLost: number;        // 今日打手自然流失数(忠诚越低流失越多)
  prestigeDecay: number;    // 今日威望自然衰减总量(极道+淫名)
  defense: { raids: number; lost: string[] }; // 昨日地盘反击:被攻次数+丢失地盘名
}

/**
 * 每日收尾。威望从 state 读（极道威望+淫名，淫名仅 AV 解锁后计入）。
 * @param dayNumber 当前天数（用于每周招募额度刷新：每7天）
 */
export function settleDaily(state: EngineState, dayNumber: number): DailySettleResult {
  let next = { ...state };
  // 据点产出（faucet：已解锁区域每日给避孕套/资金/极道威望）
  const y = dailyYields(next.regions);
  next.condomStock = next.condomStock + y.condom + condomDailyFrom(next.upgrades); // 据点产出 + 送货上门(后期便利升级)
  next.money = next.money + y.money;
  if (y.money > 0) next.moneyLog = appendMoneyLog(next.moneyLog, dayNumber, '据点日产', y.money);
  // 地盘反击(敌人来攻已占地盘·敌强度>有效常驻武力则随机丢一块地盘)。
  // 常驻武力=派驻打手×每人基础武力×武器乘区;有效武力=常驻×(1+加固×10%)(批B6-5·加固接真)。
  const garrisonPower = (next.garrison ?? 0) * baseMartialPerThug(next.upgrades) * weaponMult(next.upgrades);
  const fortifyLv = next.turfFortifyBonus ?? 0;
  const threat = settleTurfThreat(next.regions, garrisonPower, Math.random, fortifyLv);
  next.regions = threat.regions;
  next.defenseLog = [...(next.defenseLog ?? []), {
    day: dayNumber, raids: threat.raids, lost: threat.lost,
    garrisonPower: Math.round(garrisonPower), fortifyLevels: fortifyLv,
    effectivePower: fortifiedPower(garrisonPower, fortifyLv),
    records: threat.records, // 战报明细:敌强度 vs 我方有效武力(玩家据此调驻守人数/买加固)
  }].slice(-14);
  if (y.martial > 0) {
    next.martialPrestige = next.martialPrestige + y.martial;
    next.martialGainToday = (next.martialGainToday ?? 0) + y.martial; // 据点产出也算极道威望进账(防硬失败误杀有地盘玩家)
  }
  // 每周刷新招募额度（第1天及每隔7天）。招募难易由总威望决定。
  const recruitRefreshed = dayNumber % 7 === 1;
  if (recruitRefreshed) {
    const prestige = totalPrestige(next.martialPrestige, next.infamy, isAvUnlocked(next.unlocked));
    next.recruitQuota = weeklyRecruitQuota(prestige);
    next.recruitQuotaMax = next.recruitQuota; // 记录本周额度总量(UI显示总/剩余)
    // 同步刷新 AV 周编辑次数(若已解锁)
    if (isAvUnlocked(next.unlocked) && next.av) {
      next.av = { ...next.av, weeklyQuota: next.av.weeklyQuotaMax };
    }
  }
  // 忠诚度每日自然衰减(不维护就滑落) — 减免来自"荒唐升级"(张贴照片链等)。在流失判定前先衰减。
  const loyDecay = Math.max(0, CONST.忠诚日衰减 - loyaltyDecayReduction(next.upgrades));
  if ((next.loyalty ?? 0) > 0) next.loyalty = Math.max(0, next.loyalty - loyDecay);
  // 打手自然流失(忠诚越低走得越多·被挖角/不满待遇/看不到前景)
  const thugsLost = thugAttrition(next.thugTotal, next.loyalty, Math.random());
  if (thugsLost > 0) next.thugTotal = Math.max(0, next.thugTotal - thugsLost);
  const power = combatPower(
    availableThugs(next.thugTotal, next.garrison), next.presentCount, next.thugTotal,
    baseMartialPerThug(next.upgrades), weaponMult(next.upgrades),
  );
  // 硬失败·双轨再生力审核(设计补遗_A)。各轨连续2次坏审核→硬失败;第1次坏审核弹警告(留1回合缓冲)。
  //  威望轨: 极道威望进账连续2次为0(纯摆烂/A面崩盘者)。审核后重置今日流量。
  //  资金轨: 资金余额连续2次≤0(存量·用户定·非进账流,不误杀"亏一天赚一天"玩家)。
  const mAudit = auditMartial(next.martialGainToday ?? 0, next.martialZeroStreak ?? 0);
  next.martialZeroStreak = mAudit.martialZeroStreak;
  next.martialGainToday = 0;
  const moneyAudit = auditMoney(next.money, next.moneyZeroStreak ?? 0);
  next.moneyZeroStreak = moneyAudit.zeroStreak;
  // 威望每日自然衰减(数值叙事:江湖善忘/名气消退)。在审核后衰减"存量",不影响今日进账流量审核。
  const martialBefore = next.martialPrestige;
  next.martialPrestige = decayPrestige(next.martialPrestige);
  const infamyBefore = next.infamy;
  next.infamy = decayPrestige(next.infamy);
  const prestigeDecay = (martialBefore - next.martialPrestige) + (infamyBefore - next.infamy);
  // 威望轨暂挂期间不计入硬失败(也不弹威望警告),避免地盘未接入时误杀。
  const martialFail = 威望轨硬失败已启用 && mAudit.hardFail;
  const hardFail = martialFail || moneyAudit.hardFail;
  const hardFailReason: DailySettleResult['hardFailReason'] =
    martialFail ? 'martial' : (moneyAudit.hardFail ? 'money' : undefined);
  const failWarnings: string[] = [];
  if (威望轨硬失败已启用 && !hardFail && mAudit.martialZeroStreak === 1) {
    failWarnings.push('⚠ 威望停滞：这一阵没打出任何战果、也没拉到生意。再这样下去，九条会的招牌就榨不出人和钱了——明日务必去打据点/火并/收生意赚极道威望，否则东山再起的能力将彻底失去。');
  }
  if (!hardFail && moneyAudit.zeroStreak === 1) {
    failWarnings.push('⚠ 资金见底：账上余额已归零或为负。明日再不开源转正，九条会就要断了现金流——去打钱/收保护费/卖货补上。');
  }
  // 避孕套消耗折线图:今日消耗入历史(保留最近14天)·重置今日累计
  next.condomHistory = [...(next.condomHistory ?? []), next.condomUsedToday ?? 0].slice(-14);
  next.condomUsedToday = 0;
  // 由稳定度派生威胁等级（驱动 forced events 骚扰强占）
  next.threatLevel = threatLevelFrom(next.stability ?? 100, next.turfFortifyBonus ?? 0);
  // 经期推进(每日一步,翻转危险期→次日套消耗×1.5/受孕率↑)
  const cyc = advanceCycle(next.cycleDay ?? 0);
  next.cycleDay = cyc.cycleDay;
  next.isDangerousPeriod = cyc.isDangerousPeriod;
  return { state: next, recruitRefreshed, combatPower: power, hardFail, hardFailReason, failWarnings, yields: y, thugsLost, prestigeDecay, defense: { raids: threat.raids, lost: threat.lost } };
}

/** 便捷：避孕套库存状态标签（UI 用） */
export function condomLabel(state: EngineState): '充足' | '告急' | '废除' {
  return condomStatus(state.condomStock);
}
