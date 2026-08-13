// 派生 unlocked 字典 · 单测
// 验证 turf 阶段Boss击败 / occupyScale → occupy_* 解锁键,扩张日常 unlockRequires 能查到。

import { describe, expect, it } from 'vitest';
import { deriveEventUnlocked } from './unlocked';
import { centerIdOfStage } from '../turf/machine';
import type { EngineState } from './types';
import type { RegionState } from '../turf/types';

const boss = (): RegionState => ({ defeated: true, thresholdReduced: 0, garrison: 0 });

function eng(p: Partial<EngineState> = {}): EngineState {
  return {
    money: 8000, thugTotal: 30, garrison: 0, loyalty: 60,
    condomStock: 480, desire: 0, desireCapacity: 60, perSlotThroughput: 6,
    martialPrestige: 0, infamy: 0, martialGainToday: 0, martialZeroStreak: 0,
    corruption: 0, cognition: '死撑', claimedGates: {},
    triggeredSpecials: {}, unlocked: {}, presentCount: 0,
    narrativeLog: [], continuityNotes: [],
    upgrades: {}, regions: {}, stability: 50, threatLevel: 0,
    cycleDay: 0, isDangerousPeriod: false,
    servedThisNight: 0, recruitQuota: 0,
    leaveHistory: [], ...p,
  } as EngineState;
}

describe('deriveEventUnlocked · turf↔unlocked 桥接', () => {
  it('击败阶段1 Boss → occupy_street=true(扩张日常 unlockRequires 可匹配)', () => {
    const e = eng({ regions: { [centerIdOfStage(1)]: boss() } });
    const u = deriveEventUnlocked(e);
    expect(u.occupy_street).toBe(true);
    expect(u.occupy_home).toBe(true);
    expect(u.occupy_district).toBeFalsy(); // 阶段2 Boss 未击败
  });

  it('击败阶段2 Boss → occupy_district=true', () => {
    const e = eng({ regions: { [centerIdOfStage(1)]: boss(), [centerIdOfStage(2)]: boss() } });
    expect(deriveEventUnlocked(e).occupy_district).toBe(true);
  });

  it('击败阶段4 Boss(最终) → occupy_halfcity=true', () => {
    const regions: Record<string, RegionState> = {};
    for (let s = 1; s <= 4; s++) regions[centerIdOfStage(s)] = boss();
    const u = deriveEventUnlocked(eng({ regions }));
    expect(u.occupy_halfcity).toBe(true);
    expect(u.occupy_hill).toBe(true);
  });

  it('occupyScale(升级 expand_turf)→ occupy_* 别名(与复仇进度取并集)', () => {
    const u = deriveEventUnlocked(eng({ occupyScale: 2 }));
    expect(u.occupy_street).toBe(true);
    expect(u.occupy_district).toBe(true);
    expect(u.occupy_hill).toBeFalsy(); // 需档≥3
  });

  it('有情报且未占据的关 → bribe_available=true', () => {
    const e = eng({ regions: { s1_2: { defeated: false, thresholdReduced: 0, garrison: 0, intel: true } } });
    expect(deriveEventUnlocked(e).bribe_available).toBe(true);
  });

  it('engine.unlocked 与派生合并(升级解锁 + 地盘解锁同时存在)', () => {
    const e = eng({
      unlocked: { courtyard_unlocked: true, dungeon_unlocked: true },
      regions: { [centerIdOfStage(1)]: boss() },
    });
    const u = deriveEventUnlocked(e);
    expect(u.courtyard_unlocked).toBe(true);
    expect(u.dungeon_unlocked).toBe(true);
    expect(u.occupy_street).toBe(true);
  });

  it('未击败任何 boss + occupyScale=0 → 仅老宅 + 升级解锁项', () => {
    const e = eng({ unlocked: { courtyard_unlocked: true } });
    const u = deriveEventUnlocked(e);
    expect(u.occupy_home).toBe(true);
    expect(u.occupy_street).toBeFalsy();
    expect(u.courtyard_unlocked).toBe(true);
  });
});
