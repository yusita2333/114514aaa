import { describe, it, expect } from 'vitest';
import {
  THUG_UPGRADES, FACILITY_UPGRADES, EXPANSION_UPGRADES, UPGRADES, UPGRADES_BY_ID,
  getLevel, canUpgrade, applyUpgrade, combatBonus, requiresMet,
} from './machine';
import type { UpgradeDef } from './types';
import type { UpgradeState } from './machine';

const weapon = UPGRADES_BY_ID['weapon'];

function st(over: Partial<UpgradeState> = {}): UpgradeState {
  return { money: 8000, corruption: 0, upgrades: {}, ...over };
}

describe('catalog', () => {
  it('打手升级5项,id唯一', () => {
    expect(THUG_UPGRADES).toHaveLength(5);
    expect(new Set(THUG_UPGRADES.map(u => u.id)).size).toBe(5);
  });
});

describe('getLevel', () => {
  it('未升级=0,已升级读账本', () => {
    expect(getLevel(undefined, 'weapon')).toBe(0);
    expect(getLevel({ weapon: 3 }, 'weapon')).toBe(3);
  });
});

describe('canUpgrade', () => {
  it('资金够+未满级→可升', () => {
    expect(canUpgrade(weapon, st()).ok).toBe(true);
  });
  it('资金不足→拒', () => {
    expect(canUpgrade(weapon, st({ money: 100 })).ok).toBe(false);
  });
  it('满级→拒', () => {
    expect(canUpgrade(weapon, st({ upgrades: { weapon: 5 } })).ok).toBe(false);
  });
  it('堕落门槛未达→拒', () => {
    const gated: UpgradeDef = { ...weapon, corruptionGate: [0, 0, 25] }; // 升到3级(index2)需堕落25
    expect(canUpgrade(gated, st({ upgrades: { weapon: 2 }, corruption: 10 })).ok).toBe(false);
    expect(canUpgrade(gated, st({ upgrades: { weapon: 2 }, corruption: 25 })).ok).toBe(true);
  });
  it('前置未满足→拒', () => {
    const dep: UpgradeDef = { ...weapon, id: 'dep', requires: [{ upgradeId: 'weapon', minLevel: 2 }] };
    expect(canUpgrade(dep, st({ upgrades: { weapon: 1 } })).ok).toBe(false);
    expect(canUpgrade(dep, st({ upgrades: { weapon: 2 } })).ok).toBe(true);
  });
});

describe('requiresMet', () => {
  it('占据规模前置', () => {
    const r = [{ occupyAtLeast: 3 }];
    expect(requiresMet(r, st({ occupyScale: 2 }))).toBe(false);
    expect(requiresMet(r, st({ occupyScale: 3 }))).toBe(true);
  });
  it('空前置=满足', () => {
    expect(requiresMet(undefined, st())).toBe(true);
  });
});

describe('applyUpgrade', () => {
  it('扣钱+等级+1', () => {
    const r = applyUpgrade(st({ money: 8000 }), weapon);
    expect(r.money).toBe(8000 - 2500);
    expect(r.upgrades!['weapon']).toBe(1);
  });
  it('多次升级累加,不污染原state', () => {
    const s0 = st({ money: 8000 });
    const s1 = applyUpgrade(s0, weapon);
    const s2 = applyUpgrade(s1, weapon);
    expect(s2.upgrades!['weapon']).toBe(2);
    expect(s0.upgrades!['weapon']).toBeUndefined(); // 原state未变
  });
});

describe('combatBonus', () => {
  it('纯战力项0.10/级,NSFW项0.03/级,汇总', () => {
    expect(combatBonus({ weapon: 2 })).toBeCloseTo(0.20);
    expect(combatBonus({ weapon: 1, stamina: 1 })).toBeCloseTo(0.13); // 0.10+0.03
    expect(combatBonus(undefined)).toBe(0);
  });
});

describe('设施升级·效果作用到字段', () => {
  it('吞吐扩容:perSlotThroughput +6/级', () => {
    const r = applyUpgrade(st({ perSlotThroughput: 6 }), UPGRADES_BY_ID['throughput']);
    expect(r.perSlotThroughput).toBe(12);
    expect(r.upgrades!['throughput']).toBe(1);
  });
  it('吞吐扩容堕落解档:堕落不足拒,达标可买', () => {
    const t = UPGRADES_BY_ID['throughput']; // gate [0,15,35,60]
    expect(canUpgrade(t, st({ upgrades: { throughput: 1 }, corruption: 10 })).ok).toBe(false); // 买2级需15
    expect(canUpgrade(t, st({ upgrades: { throughput: 1 }, corruption: 15 })).ok).toBe(true);
  });
  it('欲望承载上限 +20/级', () => {
    expect(applyUpgrade(st({ desireCapacity: 60 }), UPGRADES_BY_ID['desire_cap']).desireCapacity).toBe(80);
  });
  it('行动格扩容 +1/级(基数8)', () => {
    expect(applyUpgrade(st(), UPGRADES_BY_ID['action_slots']).totalSlots).toBe(9);
  });
  it('采购扩容倍率 +0.5/级(基数1)', () => {
    expect(applyUpgrade(st(), UPGRADES_BY_ID['purchase']).purchaseUpgradeMult).toBe(1.5);
  });
});

describe('扩张解锁·unlock/occupyScale/requires', () => {
  it('地盘扩张:occupyScale +1/级', () => {
    expect(applyUpgrade(st(), UPGRADES_BY_ID['expand_turf']).occupyScale).toBe(1);
  });
  it('地下室/摄影室:置 unlocked 标记', () => {
    expect(applyUpgrade(st(), UPGRADES_BY_ID['basement']).unlocked!['basement']).toBe(true);
    expect(applyUpgrade(st(), UPGRADES_BY_ID['studio']).unlocked!['av']).toBe(true);
  });
  it('庭院前置=占据规模≥2', () => {
    const c = UPGRADES_BY_ID['courtyard'];
    expect(canUpgrade(c, st({ occupyScale: 1 })).ok).toBe(false);
    expect(canUpgrade(c, st({ occupyScale: 2 })).ok).toBe(true);
  });
  it('AV设备前置=先建摄影室(升级→升级链)', () => {
    const g = UPGRADES_BY_ID['av_gear'];
    expect(canUpgrade(g, st()).ok).toBe(false);                          // 没建摄影室
    expect(canUpgrade(g, st({ upgrades: { studio: 1 } })).ok).toBe(true); // 建了→解锁
  });
});

describe('catalog 完整性', () => {
  it('三类合计15项,全局id唯一', () => {
    expect(THUG_UPGRADES).toHaveLength(5);
    expect(FACILITY_UPGRADES).toHaveLength(5);
    expect(EXPANSION_UPGRADES).toHaveLength(5);
    expect(UPGRADES).toHaveLength(15);
    expect(new Set(UPGRADES.map(u => u.id)).size).toBe(15);
  });
});
