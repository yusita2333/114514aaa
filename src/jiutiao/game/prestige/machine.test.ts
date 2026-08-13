import { describe, it, expect } from 'vitest';
import {
  isAvUnlocked, AV_UNLOCK_KEY, gainMartialPrestige, gainInfamy, auditMartial,
} from './machine';

describe('AV 解锁判定(淫名闸门)', () => {
  it('未解锁→false', () => {
    expect(isAvUnlocked({})).toBe(false);
    expect(isAvUnlocked({ other: true })).toBe(false);
  });
  it('解锁→true', () => {
    expect(isAvUnlocked({ [AV_UNLOCK_KEY]: true })).toBe(true);
  });
});

describe('威望进账', () => {
  it('极道威望:累计值与今日流量同步增长', () => {
    const r = gainMartialPrestige({ martialPrestige: 10, martialGainToday: 0 }, 5);
    expect(r.martialPrestige).toBe(15);
    expect(r.martialGainToday).toBe(5);
  });
  it('淫名累加', () => {
    expect(gainInfamy(10, 5)).toBe(15);
  });
});

describe('硬失败审核(极道威望连续2次0)', () => {
  it('今日有进账→streak归零不失败', () => {
    expect(auditMartial(5, 1)).toEqual({ martialZeroStreak: 0, hardFail: false });
  });
  it('今日0进账→streak+1', () => {
    expect(auditMartial(0, 0)).toEqual({ martialZeroStreak: 1, hardFail: false });
  });
  it('连续第2次0进账→硬失败', () => {
    expect(auditMartial(0, 1)).toEqual({ martialZeroStreak: 2, hardFail: true });
  });
});
