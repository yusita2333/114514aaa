import { describe, it, expect } from 'vitest';
import {
  REGIONS, REGIONS_BY_ID, HOME_REGION_ID, STAGE_COUNT, SMALLS_PER_STAGE,
  regionState, isRegionUnlocked, effectiveThreshold, canDefeat, defeatRegion,
  reduceThreshold, dailyYields, totalShops, threatLevelFrom,
  settleHarass, settleRaid,
  centerIdOfStage, smallsOfStage, centerOfStage, isStageActive, isStageSmallsCleared,
  isStageBossDefeated, stageSmallProgress, highestActiveStage, regionDisplay,
  settleScout, settleBribe, hasIntel, anyIntel, markIntel, SCOUT_COST,
} from './machine';
import type { RegionState } from './types';
import type { TurfState } from './machine';

// 占满某阶段全部小关(测试夹具)
function clearSmalls(regions: Record<string, RegionState> | undefined, stage: number): Record<string, RegionState> {
  let r = regions ?? {};
  for (const d of smallsOfStage(stage)) r = defeatRegion(r, d.id);
  return r;
}
// 占满小关 + 击败中心Boss
function clearStage(regions: Record<string, RegionState> | undefined, stage: number): Record<string, RegionState> {
  return defeatRegion(clearSmalls(regions, stage), centerIdOfStage(stage));
}

describe('catalog · 4阶段44关', () => {
  it('区域id唯一', () => {
    expect(new Set(REGIONS.map(r => r.id)).size).toBe(REGIONS.length);
  });
  it('总数=home + 4×(10小关+1中心)', () => {
    expect(REGIONS.length).toBe(1 + STAGE_COUNT * (SMALLS_PER_STAGE + 1));
  });
  it('每阶段10小关+1中心', () => {
    for (let s = 1; s <= STAGE_COUNT; s++) {
      expect(smallsOfStage(s).length).toBe(SMALLS_PER_STAGE);
      expect(centerOfStage(s)!.isCenter).toBe(true);
    }
  });
  it('中心关门槛高于本阶段所有小关,也高于下阶段小关起点', () => {
    for (let s = 1; s <= STAGE_COUNT; s++) {
      const center = centerOfStage(s)!.defeatThreshold;
      const maxSmall = Math.max(...smallsOfStage(s).map(d => d.defeatThreshold));
      expect(center).toBeGreaterThan(maxSmall);
      if (s < STAGE_COUNT) {
        const nextMinSmall = Math.min(...smallsOfStage(s + 1).map(d => d.defeatThreshold));
        expect(center).toBeGreaterThan(nextMinSmall); // 第N阶段中枢 > 第N+1阶段小关起点
      }
    }
  });
});

describe('区域解锁状态', () => {
  it('老宅默认已解锁,其它默认未解锁', () => {
    expect(isRegionUnlocked(undefined, HOME_REGION_ID)).toBe(true);
    expect(isRegionUnlocked(undefined, 's1_1')).toBe(false);
  });
  it('regionState缺省', () => {
    expect(regionState(undefined, 's1_1')).toEqual({ defeated: false, thresholdReduced: 0, garrison: 0 });
  });
});

describe('阶段激活/解锁', () => {
  it('阶段1开局激活,阶段2+需上一阶段Boss击败', () => {
    expect(isStageActive(undefined, 1)).toBe(true);
    expect(isStageActive(undefined, 2)).toBe(false);
    const s1done = clearStage(undefined, 1);
    expect(isStageBossDefeated(s1done, 1)).toBe(true);
    expect(isStageActive(s1done, 2)).toBe(true);
  });
  it('占满全部小关→中心关解锁(isStageSmallsCleared)', () => {
    expect(isStageSmallsCleared(undefined, 1)).toBe(false);
    const cleared = clearSmalls(undefined, 1);
    expect(isStageSmallsCleared(cleared, 1)).toBe(true);
    expect(stageSmallProgress(cleared, 1)).toEqual({ done: 10, total: 10 });
  });
  it('highestActiveStage 跟随通关推进', () => {
    expect(highestActiveStage(undefined)).toBe(1);
    expect(highestActiveStage(clearStage(undefined, 1))).toBe(2);
  });
});

describe('canDefeat 击败判定(阶段逻辑)', () => {
  it('阶段1小关:武力≥门槛即可打', () => {
    const s = REGIONS_BY_ID['s1_1']; // 门槛30
    expect(canDefeat(s, 30, undefined).ok).toBe(true);
    expect(canDefeat(s, 29, undefined).ok).toBe(false);
  });
  it('阶段2小关:阶段未激活→拒;激活后可打', () => {
    expect(canDefeat(REGIONS_BY_ID['s2_1'], 9999, undefined).ok).toBe(false);
    const s1done = clearStage(undefined, 1);
    expect(canDefeat(REGIONS_BY_ID['s2_1'], REGIONS_BY_ID['s2_1'].defeatThreshold, s1done).ok).toBe(true);
  });
  it('中心关:小关未占满→拒;占满后可打', () => {
    const center = centerOfStage(1)!;
    expect(canDefeat(center, 9999, undefined).ok).toBe(false); // 小关未满
    const cleared = clearSmalls(undefined, 1);
    expect(canDefeat(center, center.defeatThreshold, cleared).ok).toBe(true);
  });
  it('已占据→拒', () => {
    const r = defeatRegion(undefined, 's1_1');
    expect(canDefeat(REGIONS_BY_ID['s1_1'], 9999, r).ok).toBe(false);
  });
  it('削减门槛后武力不足也能打', () => {
    const reduced = reduceThreshold(undefined, 's1_3', 999);
    expect(canDefeat(REGIONS_BY_ID['s1_3'], 0, reduced).ok).toBe(true);
  });
});

describe('有效门槛/削减', () => {
  it('=基础-已削减,下限0', () => {
    const def = REGIONS_BY_ID['s1_10']; // 门槛100
    expect(effectiveThreshold(def, { defeated: false, thresholdReduced: 0, garrison: 0 })).toBe(100);
    expect(effectiveThreshold(def, { defeated: false, thresholdReduced: 30, garrison: 0 })).toBe(70);
    expect(effectiveThreshold(def, { defeated: false, thresholdReduced: 999, garrison: 0 })).toBe(0);
  });
  it('reduceThreshold累加', () => {
    let r = reduceThreshold(undefined, 's1_1', 20);
    r = reduceThreshold(r, 's1_1', 15);
    expect(r['s1_1'].thresholdReduced).toBe(35);
  });
});

describe('情报/刺探/贿赂', () => {
  it('markIntel/hasIntel/anyIntel', () => {
    expect(anyIntel(undefined)).toBe(false);
    const r = markIntel(undefined, 's1_2');
    expect(hasIntel(r, 's1_2')).toBe(true);
    expect(anyIntel(r)).toBe(true);
  });
  it('刺探:资金不足→无果不扣钱', () => {
    const r = settleScout({ money: SCOUT_COST - 1, regions: {} }, 's1_1', 0);
    expect(r.reason).toBe('no_money');
    expect(r.money).toBe(SCOUT_COST - 1);
    expect(r.hit).toBe(false);
  });
  it('刺探:命中(rng<0.25)→扣钱+获情报', () => {
    const r = settleScout({ money: 5000, regions: {} }, 's1_1', 0.1);
    expect(r.hit).toBe(true);
    expect(r.money).toBe(5000 - SCOUT_COST);
    expect(hasIntel(r.regions, 's1_1')).toBe(true);
  });
  it('刺探:未命中(rng≥0.25)→扣钱无情报', () => {
    const r = settleScout({ money: 5000, regions: {} }, 's1_1', 0.5);
    expect(r.hit).toBe(false);
    expect(r.money).toBe(5000 - SCOUT_COST);
    expect(hasIntel(r.regions, 's1_1')).toBe(false);
  });
  it('贿赂:需情报;有情报→降门槛', () => {
    expect(settleBribe(undefined, 's1_1').ok).toBe(false); // 无情报
    const withIntel = markIntel(undefined, 's1_10'); // 门槛100
    const r = settleBribe(withIntel, 's1_10');
    expect(r.ok).toBe(true);
    expect(r.cut).toBeGreaterThan(0);
    expect(effectiveThreshold(REGIONS_BY_ID['s1_10'], regionState(r.regions, 's1_10'))).toBe(100 - r.cut);
  });
});

describe('regionDisplay 地图态', () => {
  it('occupied/attackable/weak/locked', () => {
    expect(regionDisplay(undefined, REGIONS_BY_ID['s1_1'], 9999)).toBe('attackable');
    expect(regionDisplay(undefined, REGIONS_BY_ID['s1_1'], 0)).toBe('weak');
    expect(regionDisplay(undefined, REGIONS_BY_ID['s2_1'], 9999)).toBe('locked'); // 阶段2未激活
    expect(regionDisplay(undefined, centerOfStage(1)!, 9999)).toBe('locked');     // 小关未满
    const r = defeatRegion(undefined, 's1_1');
    expect(regionDisplay(r, REGIONS_BY_ID['s1_1'], 0)).toBe('occupied');
  });
});

describe('据点产出与店铺', () => {
  it('只算已解锁区域,老宅默认计入', () => {
    const y0 = dailyYields(undefined);
    expect(y0.condom).toBe(120);
    expect(y0.money).toBe(500);
    const after = defeatRegion(undefined, 's1_1');
    const y1 = dailyYields(after);
    expect(y1.condom).toBe(120 + REGIONS_BY_ID['s1_1'].yields.condom!);
    expect(y1.martial).toBe(REGIONS_BY_ID['s1_1'].yields.martial!);
  });
  it('店铺数=已解锁区域累加', () => {
    expect(totalShops(undefined)).toBe(3);
    expect(totalShops(defeatRegion(undefined, 's1_1'))).toBe(3 + (REGIONS_BY_ID['s1_1'].shops ?? 0));
  });
});

describe('threatLevelFrom 威胁派生', () => {
  it('稳定高→无威胁,中→骚扰,低→进攻风险', () => {
    expect(threatLevelFrom(80)).toBe(0);
    expect(threatLevelFrom(50)).toBe(1);
    expect(threatLevelFrom(20)).toBe(2);
  });
  it('据点加固抬升等效稳定', () => {
    expect(threatLevelFrom(35, 2)).toBe(1);
  });
});

describe('骚扰结算(高频不减员)', () => {
  const ts = (over: Partial<TurfState> = {}): TurfState => ({ money: 8000, regions: {}, ...over });
  it('击退→抢资金,稳定不降', () => {
    const r = settleHarass(ts(), 60, 100, 80);
    expect(r.repelled).toBe(true);
    expect(r.loot).toBe(400);
    expect(r.money).toBe(8400);
    expect(r.stability).toBe(60);
  });
  it('未击退→稳定下降,无收益', () => {
    const r = settleHarass(ts(), 60, 50, 80);
    expect(r.repelled).toBe(false);
    expect(r.stability).toBe(52);
    expect(r.money).toBe(8000);
  });
  it('据点加固减缓稳定下降', () => {
    const r = settleHarass(ts({ turfFortifyBonus: 3 }), 60, 50, 80);
    expect(r.stability).toBe(60 - 5);
  });
});

describe('进攻结算(低概率减员丢地盘)', () => {
  const ts = (over: Partial<TurfState> = {}): TurfState =>
    ({ money: 8000, regions: { s1_1: { defeated: true, thresholdReduced: 0, garrison: 0 } }, ...over });
  it('守住→减员少,保住区域', () => {
    const r = settleRaid(ts(), 60, 200, 100, 's1_1');
    expect(r.defended).toBe(true);
    expect(r.regionLost).toBeNull();
    expect(r.regions['s1_1'].defeated).toBe(true);
  });
  it('失败→减员多+丢区域', () => {
    const r = settleRaid(ts(), 60, 50, 100, 's1_1');
    expect(r.defended).toBe(false);
    expect(r.thugLost).toBe(15);
    expect(r.regionLost).toBe('s1_1');
    expect(r.regions['s1_1'].defeated).toBe(false);
    expect(r.stability).toBe(45);
  });
});
