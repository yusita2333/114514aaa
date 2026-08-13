// A4 日常侵蚀机制 · 单测
// 验证 prestige transfer / bodyDevelopment 推进 / 隐瞒概率公式 / 主入口路由。

import { describe, expect, it } from 'vitest';
import {
  advanceBodyDevelopment, getDevelopment,
  isA4TriggerReady, A4_TRIGGER_THRESHOLDS,
  concealProbability, rollConcealment,
  applyA4,
} from './machine';
import type { EngineState } from '../engine/types';

function eng(p: Partial<EngineState> = {}): EngineState {
  return {
    day: 1, period: 'day',
    money: 8000, thugTotal: 30, garrison: 0, loyalty: 60,
    condomStock: 480, desire: 0, desireCapacity: 60, perSlotThroughput: 6,
    martialPrestige: 100, infamy: 0, martialGainToday: 0, martialZeroStreak: 0,
    corruption: 0, cognition: '死撑',
    triggeredSpecials: {}, unlocked: {}, presentCount: 0,
    narrativeLog: [], continuityNotes: [],
    upgrades: {}, regions: {}, stability: 50, threatLevel: 0,
    cycleDay: 0, isDangerousPeriod: false,
    servedThisNight: 0, recruitQuota: 0, recruitedThisWeek: 0,
    leaveHistory: [], ...p,
  } as EngineState;
}

describe('bodyDevelopment · 推进与读取', () => {
  it('默认值=1(被迫接受·与 schema 一致)', () => {
    expect(getDevelopment(eng(), '口腔')).toBe(1);
    expect(getDevelopment(eng(), '子宫生育')).toBe(1);
  });

  it('advanceBodyDevelopment 单调上升,封顶 4', () => {
    let s = eng();
    let r = advanceBodyDevelopment(s, '口腔', 1);
    expect(r.advanced).toBe(true);
    expect(r.newLevel).toBe(2);
    s = r.state;
    r = advanceBodyDevelopment(s, '口腔', 5); // delta 超出
    expect(r.newLevel).toBe(4); // 封顶
    s = r.state;
    r = advanceBodyDevelopment(s, '口腔', 1); // 已封顶
    expect(r.advanced).toBe(false);
    expect(r.newLevel).toBe(4);
  });

  it('isA4TriggerReady 按阈值表判定', () => {
    const s = eng({ bodyDevelopment: { 口腔: 2, 肛门: 2 } });
    expect(isA4TriggerReady(s, '口腔')).toBe(true);   // ≥ 2 (阈值2)
    expect(isA4TriggerReady(s, '肛门')).toBe(false);  // 2 < 阈值3
  });

  it('阈值表存在所有四主穴', () => {
    expect(A4_TRIGGER_THRESHOLDS.口腔).toBeGreaterThan(0);
    expect(A4_TRIGGER_THRESHOLDS.小穴).toBeGreaterThan(0);
    expect(A4_TRIGGER_THRESHOLDS.肛门).toBeGreaterThan(0);
    expect(A4_TRIGGER_THRESHOLDS.子宫生育).toBeGreaterThan(0);
  });
});

describe('concealProbability · 武力提升隐瞒成功率', () => {
  it('零武力=0.5基础', () => {
    expect(concealProbability(0)).toBe(0.5);
  });

  it('200武力=0.7', () => {
    expect(concealProbability(200)).toBeCloseTo(0.7, 5);
  });

  it('1000+武力=封顶0.95', () => {
    expect(concealProbability(1000)).toBeCloseTo(0.95, 5);
    expect(concealProbability(5000)).toBe(0.95);
  });
});

describe('rollConcealment · 随机源注入便于测试', () => {
  it('roll 低于概率→隐瞒成功', () => {
    expect(rollConcealment({ martialPrestige: 200, roll: 0.5 })).toBe(true);   // 0.5 < 0.7
  });

  it('roll 高于概率→隐瞒失败', () => {
    expect(rollConcealment({ martialPrestige: 200, roll: 0.8 })).toBe(false);  // 0.8 > 0.7
  });
});

describe('applyA4 · 隐瞒路由', () => {
  it('成功→极道威望进账(martialPrestige+martialGainToday)', () => {
    const s = eng({ martialPrestige: 100, infamy: 0 });
    const r = applyA4(s, {
      martialBase: 10,
      conceal: { martialPrestige: 1000, roll: 0 }, // 必成功
    });
    expect(r.concealed).toBe(true);
    expect(r.martialGained).toBe(10);
    expect(r.martialTransferred).toBe(0);
    expect(r.state.martialPrestige).toBe(110);
    expect(r.state.martialGainToday).toBe(10);
    expect(r.state.infamy).toBe(0);
    expect(r.state.loyalty).toBe(60); // 不变
  });

  it('失败→部分极道 transfer 淫名 + 忠诚 +', () => {
    const s = eng({ martialPrestige: 100, infamy: 5, loyalty: 60 });
    const r = applyA4(s, {
      martialBase: 10,
      transferRatio: 0.4,        // 4 块极道→淫名
      loyaltyOnFail: 2,
      conceal: { martialPrestige: 0, roll: 1 }, // 必失败
    });
    expect(r.concealed).toBe(false);
    expect(r.martialGained).toBe(0);
    expect(r.martialTransferred).toBe(4);
    expect(r.state.martialPrestige).toBe(96);  // 100 - 4
    expect(r.state.infamy).toBe(9);            // 5 + 4
    expect(r.state.loyalty).toBe(62);          // 60 + 2
    expect(r.state.martialGainToday).toBe(0); // 不影响今日流量(转移影响累计)
  });

  it('失败 + 武力为零(无极道可转)→ transferred=0,但 loyalty 仍加', () => {
    const s = eng({ martialPrestige: 0, infamy: 5, loyalty: 60 });
    const r = applyA4(s, {
      martialBase: 10,
      conceal: { martialPrestige: 0, roll: 1 },
    });
    expect(r.concealed).toBe(false);
    expect(r.martialTransferred).toBe(0); // 没得转
    expect(r.state.infamy).toBe(5);       // 不变
    expect(r.state.loyalty).toBe(62);     // 仍 +2(默认 loyaltyOnFail)
  });

  it('loyalty 封顶 100', () => {
    const s = eng({ loyalty: 99 });
    const r = applyA4(s, {
      martialBase: 10,
      loyaltyOnFail: 5,
      conceal: { martialPrestige: 0, roll: 1 },
    });
    expect(r.state.loyalty).toBe(100);
  });
});
