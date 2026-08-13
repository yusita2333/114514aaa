import { describe, it, expect } from 'vitest';
import {
  nightCoverage, slotsNeededFor, unservedCount,
  condomCost, purchaseCap, condomStatus,
  desireGain, desireOverflow, combatPower, availableThugs,
  weeklyRecruitQuota, totalPrestige, siegeWinChance, CONST,
  leaveCount, slidingWindowRelief,
} from './machine';

describe('供奉吞吐与覆盖', () => {
  it('覆盖=格数×吞吐', () => {
    expect(nightCoverage(6, 6)).toBe(36);   // 初始吞吐6
    expect(nightCoverage(6, 18)).toBe(108); // 升级到18=旧甜区
    expect(nightCoverage(6, 30)).toBe(180); // 满级
  });
  it('所需格数=ceil(打手/吞吐)', () => {
    expect(slotsNeededFor(100, 6)).toBe(17);  // 初始吞吐下100人要17格(远超8)→初期就吃紧
    expect(slotsNeededFor(100, 18)).toBe(6);  // 吞吐18才回到"6格覆盖百人"
    expect(slotsNeededFor(108, 18)).toBe(6);
  });
  it('未供奉缺口', () => {
    expect(unservedCount(150, 108)).toBe(42);
    expect(unservedCount(30, 36)).toBe(0);
  });
});

describe('吞吐升级对甜区的动态影响(修正1验证)', () => {
  it('初始吞吐6:30打手需5格,留3白天格→初期可控但有压力', () => {
    expect(slotsNeededFor(30, 6)).toBe(5); // 8格里5夜晚覆盖30,剩3白天
  });
  it('吞吐升满30:同样夜晚格覆盖人数翻5倍', () => {
    expect(nightCoverage(6, 6)).toBe(36);
    expect(nightCoverage(6, 30)).toBe(180); // 升级=处理力暴涨,堕落易
  });
});

describe('避孕套', () => {
  it('消耗=人数×3,危险期×1.5', () => {
    expect(condomCost(100, false)).toBe(300);
    expect(condomCost(100, true)).toBe(450);
  });
  it('采购上限=基础×店铺×稳定×升级', () => {
    expect(purchaseCap(3, 100)).toBe(360 * 3); // 满稳定3店=1080
    expect(purchaseCap(3, 50)).toBe(Math.floor(360 * 3 * 0.5));
    expect(purchaseCap(3, 100, 2)).toBe(360 * 3 * 2); // 采购扩容升级翻倍
  });
  it('库存状态', () => {
    expect(condomStatus(480)).toBe('充足');
    expect(condomStatus(8)).toBe('告急');
    expect(condomStatus(0)).toBe('废除');
  });
});

describe('欲望滚雪球', () => {
  it('普通未供奉×2', () => {
    expect(desireGain(10, 0)).toBe(20); // 10人×2
  });
  it('连续3晚未供奉者贡献翻倍', () => {
    // 10未供奉,其中4个已连续≥3晚 → (6×2)+(4×2×2)=12+16=28
    expect(desireGain(10, 4)).toBe(28);
  });
  it('溢出判定', () => {
    expect(desireOverflow(60, 60)).toBe(true);
    expect(desireOverflow(59, 60)).toBe(false);
  });
});

describe('请假滑动窗口保底', () => {
  it('leaveCount数窗口内请假天数', () => {
    const h = [true, false, true, true];
    expect(leaveCount(h, 10)).toBe(3);
    expect(leaveCount(h, 2)).toBe(2); // 最后2天[true,true]
  });
  it('短窗:10天≥7请假+欲望<1000→清空', () => {
    const h = Array.from({ length: 10 }, (_, i) => i < 7); // 7请假
    const r = slidingWindowRelief(h, 500);
    expect(r.cleared).toBe(true);
    expect(r.desire).toBe(0);
  });
  it('欲望≥1000时短窗不清(需长窗)', () => {
    const h = Array.from({ length: 10 }, () => true); // 10请假但只在短窗
    const r = slidingWindowRelief(h, 1500);
    expect(r.cleared).toBe(false); // 短窗欲望超阈值,长窗请假数不足(需15)
    expect(r.desire).toBe(1500);
  });
  it('长窗:20天≥15请假+欲望<10000→清空', () => {
    const h = Array.from({ length: 20 }, (_, i) => i < 15);
    expect(slidingWindowRelief(h, 5000).cleared).toBe(true);
  });
  it('请假不够→不清', () => {
    const h = Array.from({ length: 10 }, (_, i) => i < 3);
    expect(slidingWindowRelief(h, 100).cleared).toBe(false);
  });
});

describe('武力与招募', () => {
  it('可用打手=总-驻守', () => {
    expect(availableThugs(100, 30)).toBe(70);
  });
  it('武力=可用×忠诚系数', () => {
    expect(combatPower(100, 100)).toBe(100); // 满忠诚
    expect(combatPower(100, 60)).toBe(60);   // 忠诚60→武力打6折
  });
  it('打手升级战力加成×(1+bonus)', () => {
    expect(combatPower(100, 100, 0.2)).toBe(120); // +20%
    expect(combatPower(100, 60, 0.5)).toBe(90);   // 60×1.5
  });
  it('总威望:AV未解锁=极道威望;解锁后才+淫名', () => {
    expect(totalPrestige(10, 5)).toBe(10);       // AV未解锁,淫名不计
    expect(totalPrestige(10, 5, true)).toBe(15); // 解锁后极道+淫名
  });
  it('每周招募额度随威望', () => {
    expect(weeklyRecruitQuota(0)).toBe(10);    // 保底(招募周额度基础)
    expect(weeklyRecruitQuota(100)).toBe(60);  // 10+100×0.5
  });
});

describe('据点战胜率', () => {
  it('武力优势提高胜率', () => {
    const strong = siegeWinChance(200, 50, 0, 0);
    const weak = siegeWinChance(50, 200, 0, 0);
    expect(strong).toBeGreaterThan(weak);
    expect(strong).toBeGreaterThan(0.5);
    expect(weak).toBeLessThan(0.5);
  });
  it('胜率夹在2%~98%', () => {
    expect(siegeWinChance(99999, 1, 9999, 1)).toBeLessThanOrEqual(0.98);
    expect(siegeWinChance(1, 99999, -9999, 0)).toBeGreaterThanOrEqual(0.02);
  });
  it('情报与威望加成', () => {
    const noIntel = siegeWinChance(100, 100, 0, 0);
    const fullIntel = siegeWinChance(100, 100, 0, 1);
    expect(fullIntel).toBeGreaterThan(noIntel);
  });
});
