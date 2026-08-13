// AV 系统 · 单测
// 覆盖: 解锁判定 / canShootAv 守卫 / inlinePrompt 组装 / 消费/刷新/升级

import { describe, expect, it } from 'vitest';
import {
  defaultAvState, isAvSystemUnlocked, canShootAv,
  buildAvPrompt, buildAvParadigm,
  consumeShoot, refreshWeeklyQuota, upgradeAvQuota, upgradeAvDuration,
  initAvOnUnlock,
  type AvDefinition,
} from './machine';
import type { EngineState } from '../engine/types';

function eng(p: Partial<EngineState> = {}): EngineState {
  return {
    day: 1, period: 'day',
    money: 8000, thugTotal: 30, garrison: 0, loyalty: 60,
    condomStock: 480, desire: 0, desireCapacity: 60, perSlotThroughput: 6,
    martialPrestige: 0, infamy: 0, martialGainToday: 0, martialZeroStreak: 0,
    corruption: 0, cognition: '死撑',
    triggeredSpecials: {}, unlocked: {}, presentCount: 0,
    narrativeLog: [], continuityNotes: [],
    upgrades: {}, regions: {}, stability: 50, threatLevel: 0,
    cycleDay: 0, isDangerousPeriod: false,
    servedThisNight: 0, recruitQuota: 0, recruitedThisWeek: 0,
    leaveHistory: [], ...p,
  } as EngineState;
}

const def: AvDefinition = {
  theme: '本格性爱', setting: '学校', plays: ['口', '小穴'],
  durationHours: 24,
};

describe('AV 解锁判定', () => {
  it('未解锁→false', () => {
    expect(isAvSystemUnlocked(eng())).toBe(false);
  });

  it('AV_UNLOCK_KEY 或 studio_unlocked 任一存在 → true', () => {
    expect(isAvSystemUnlocked(eng({ unlocked: { av: true } }))).toBe(true);
    expect(isAvSystemUnlocked(eng({ unlocked: { studio_unlocked: true } }))).toBe(true);
  });
});

describe('canShootAv 守卫', () => {
  it('未解锁→拒绝', () => {
    expect(canShootAv(eng(), def).ok).toBe(false);
  });

  it('解锁但 weeklyQuota=0 → 拒绝', () => {
    const e = eng({ unlocked: { av: true }, av: { ...defaultAvState(), weeklyQuota: 0 } });
    const r = canShootAv(e, def);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('编辑次数已用完');
  });

  it('时长超上限→拒绝', () => {
    const e = eng({ unlocked: { av: true }, av: { ...defaultAvState(), weeklyQuota: 2 } });
    const r = canShootAv(e, { ...def, durationHours: 999 });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('时长超出上限');
  });

  it('plays 为空→拒绝', () => {
    const e = eng({ unlocked: { av: true }, av: { ...defaultAvState(), weeklyQuota: 2 } });
    const r = canShootAv(e, { ...def, plays: [] });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('至少选一项玩法');
  });

  it('正常路径→允许', () => {
    const e = eng({ unlocked: { av: true }, av: { ...defaultAvState(), weeklyQuota: 2 } });
    expect(canShootAv(e, def).ok).toBe(true);
  });
});

describe('buildAvPrompt 组装', () => {
  it('包含题材/场景/玩法/时长基本要素', () => {
    const p = buildAvPrompt(def);
    expect(p).toContain('本格性爱');
    expect(p).toContain('学校');
    expect(p).toContain('阴道');     // PLAY_LABEL['小穴']='阴道(...)'
    expect(p).toContain('口腔');     // PLAY_LABEL['口']='口腔(...)'
    expect(p).toContain('24小时');
    expect(p).toContain('wb_av_first'); // 继承首部 AV 三阶段
  });

  it('时长分档: <8h 中等 / <24h 长(分Part) / >=24h 超长', () => {
    expect(buildAvPrompt({ ...def, durationHours: 4 })).toContain('中等');
    expect(buildAvPrompt({ ...def, durationHours: 12 })).toContain('长(8-24小时');
    expect(buildAvPrompt({ ...def, durationHours: 48 })).toContain('超长');
  });

  it('setupNote 存在时插入到 prompt', () => {
    const p = buildAvPrompt({ ...def, setupNote: '凛扮演护士被多名病人轮' });
    expect(p).toContain('凛扮演护士被多名病人轮');
  });

  it('buildAvParadigm 返回带 inlinePrompt 的 ParadigmRef', () => {
    const ref = buildAvParadigm(def);
    expect(ref.worldbookKey).toBe('wb_av_custom');
    expect(ref.inlinePrompt).toContain('本格性爱');
  });
});

describe('AV 状态更新', () => {
  it('consumeShoot: 扣次数 / 计数+1 / 写入 customs', () => {
    const av = { ...defaultAvState(), weeklyQuota: 2 };
    const next = consumeShoot(av, def);
    expect(next.weeklyQuota).toBe(1);
    expect(next.shotCount).toBe(1);
    expect(next.customs).toHaveLength(1);
    expect(next.customs[0]).toEqual(def);
  });

  it('refreshWeeklyQuota: 重置到 weeklyQuotaMax', () => {
    const av = { ...defaultAvState(), weeklyQuota: 0, weeklyQuotaMax: 3 };
    expect(refreshWeeklyQuota(av).weeklyQuota).toBe(3);
  });

  it('upgradeAvQuota: 每级 +1', () => {
    const av = defaultAvState(); // max=2
    expect(upgradeAvQuota(av, 1).weeklyQuotaMax).toBe(3);
    expect(upgradeAvQuota(av, 3).weeklyQuotaMax).toBe(5);
  });

  it('upgradeAvDuration: 每级 +24h·封顶 168', () => {
    const av = defaultAvState(); // cap=48
    expect(upgradeAvDuration(av, 1).durationCap).toBe(72);
    expect(upgradeAvDuration(av, 10).durationCap).toBe(168); // 封顶
  });

  it('initAvOnUnlock: 解锁标签 + weeklyQuota=max', () => {
    const patch = initAvOnUnlock(eng());
    expect((patch.unlocked as Record<string, boolean>).av).toBe(true);
    expect((patch.unlocked as Record<string, boolean>).studio_unlocked).toBe(true);
    expect((patch.av as { weeklyQuota: number }).weeklyQuota).toBe(2);
  });
});
