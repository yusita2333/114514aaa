// 状态投影(批C4·MVU收尾=单向投影) · 引擎状态 → 酒馆聊天变量只读镜像
// ============================================================
// 架构决策(2026-07-20·用户确认): 双向回写否决——本卡 generateRaw 白名单不产生楼层,
//   MVU 更新管线无锚点、stat_data 无 AI 侧消费者,双真相源纯增熵。
// 单向投影价值: ①变量管理器里人类可读的游戏状态(存档blob是给机器看的) ②给酒馆助手脚本/
//   用户EJS/第三方工具一个稳定中文键契约 ③批D若做酒馆侧展示条目,这就是数据源。
// 键名对齐 schema.ts 九域命名(三件套设计资产延续)。只读:任何外部写入都会被下次投影覆盖。
// 紧凑原则: 不含大数组/正文/记忆层(那些在存档blob里),只投玩法状态。

import { DEVELOPMENT_LABELS } from '../intrusion/machine';
import type { DevelopmentLevel } from '../intrusion/machine';
import { endingTendency, isSalvationOpen } from '../endings/machine';
import { totalPrestige } from '../economy/machine';
import { isAvUnlocked } from '../prestige/machine';
import { occupiedRegionIds, isRevengeComplete, fortifiedPower } from '../turf/machine';
import { baseMartialPerThug, weaponMult } from '../upgrade/machine';
import type { EngineState } from './types';

/** 部位投影: 等级数字+中文标签 */
function partProj(state: EngineState, part: '口腔' | '小穴' | '肛门' | '子宫生育') {
  const lv = (state.bodyDevelopment?.[part] ?? 1) as DevelopmentLevel;
  return { 等级: lv, 状态: DEVELOPMENT_LABELS[lv] ?? String(lv) };
}

/**
 * 引擎状态 → 九域只读镜像(schema.ts 键名对齐)。
 * 写入聊天变量 `九条会状态`,随 persistNow 防抖更新。
 */
export function projectGameState(state: EngineState, dayNumber: number): Record<string, unknown> {
  const avOn = isAvUnlocked(state.unlocked);
  const endingS = { cognition: state.cognition, corruption: state.corruption, pregnant: state.pregnant };
  const garrisonPower = Math.round((state.garrison ?? 0) * baseMartialPerThug(state.upgrades) * weaponMult(state.upgrades));
  return {
    _说明: '九条会游戏状态只读镜像(引擎自动覆盖写入,外部修改无效)。完整存档见变量`九条会存档`。',
    时间: {
      天数: dayNumber,
      行动格总数: state.totalSlots ?? 8,
      每格供奉吞吐: state.perSlotThroughput ?? 6,
    },
    当前处境: {
      经期: state.isDangerousPeriod ? '危险期' : '安全期',
      次日强制请假: !!state.pendingForcedLeave,
      威胁等级: state.threatLevel ?? 0,
    },
    九条凛: {
      堕落度: state.corruption,
      认知防线: state.cognition,
      身体开发度: {
        口腔: partProj(state, '口腔'),
        小穴: partProj(state, '小穴'),
        肛门: partProj(state, '肛门'),
        子宫生育: partProj(state, '子宫生育'),
      },
      怀孕: !!state.pregnant,
      身体计数: state.bodyCounts ?? {},
    },
    九条会: {
      打手总数: state.thugTotal,
      驻防打手: state.garrison ?? 0,
      在场打手: state.presentCount,
      忠诚度: state.loyalty,
      威望: {
        极道威望: state.martialPrestige,
        淫名: state.infamy,
        淫名已计入: avOn,
        合计: totalPrestige(state.martialPrestige, state.infamy, avOn),
      },
      招募: { 本周额度剩余: state.recruitQuota ?? 0, 本周额度总量: state.recruitQuotaMax ?? 0 },
    },
    大宅环境: {
      资金: state.money,
      避孕套库存: state.condomStock,
      群体欲望: { 当前: state.desire, 承载上限: state.desireCapacity },
      暗网AV: { 已解锁: avOn, 已拍部数: state.av?.shotCount ?? 0, 本周可拍: state.av?.weeklyQuota ?? 0 },
    },
    地盘: {
      已占据区域数: occupiedRegionIds(state.regions).length,
      驻防武力: garrisonPower,
      据点加固等级: state.turfFortifyBonus ?? 0,
      有效防守武力: fortifiedPower(garrisonPower, state.turfFortifyBonus ?? 0),
    },
    复仇: {
      是否完成: isRevengeComplete(state.regions),
    },
    解锁与结局: {
      已触发特殊事件: state.triggeredSpecials ?? {},
      已领取奖励闸门: state.claimedGates ?? [],
      _结局倾向: endingTendency(endingS),
      _金盆洗手可达: isSalvationOpen(endingS),
    },
  };
}
