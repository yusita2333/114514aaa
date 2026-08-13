import { describe, it, expect } from 'vitest';
import {
  isUnlocked, gateOpen, resolveEvent, markMilestone, buildMenu, scanForced,
} from './machine';
import type { EventOption, EventContext, ForcedEvent } from './types';

function ctx(over: Partial<EventContext> = {}): EventContext {
  return {
    corruption: 0, cognition: '死撑', infamy: 0, thugs: 30,
    triggeredLedger: {}, unlocked: {},
    ...over,
  };
}

// 双面型：出门吃饭 ↔ 餐厅轮奸
const dineOption: EventOption = {
  id: 'dine', label: '出门吃饭', period: 'day', shape: 'dual',
  unlockRequires: ['occupy_street'],
  sfw: { worldbookKey: 'wb_dine_sfw' },
  nsfw: { worldbookKey: 'wb_dine_nsfw' },
  erosionGate: { corruptionAtLeast: 50 },
  first: { ledgerKey: 'dine_first_erosion', paradigm: { worldbookKey: 'wb_dine_first' }, corruptionWeight: 5 },
};

// 天生NSFW：供奉
const serveOption: EventOption = {
  id: 'serve', label: '供奉', period: 'night', shape: 'born_nsfw', isServe: true,
  nsfw: { worldbookKey: 'wb_serve' },
  first: { ledgerKey: 'serve_first', paradigm: { worldbookKey: 'wb_serve_first' }, corruptionWeight: 3 },
};

describe('解锁判定', () => {
  it('未解锁不可用', () => {
    expect(isUnlocked(dineOption, ctx())).toBe(false);
    expect(isUnlocked(dineOption, ctx({ unlocked: { occupy_street: true } }))).toBe(true);
  });
});

describe('侵蚀闸门(可组合多数值)', () => {
  it('堕落度阈值', () => {
    expect(gateOpen({ corruptionAtLeast: 50 }, ctx({ corruption: 49 }))).toBe(false);
    expect(gateOpen({ corruptionAtLeast: 50 }, ctx({ corruption: 50 }))).toBe(true);
  });
  it('多条件全满足才开', () => {
    const gate = { corruptionAtLeast: 50, infamyAtLeast: 20 };
    expect(gateOpen(gate, ctx({ corruption: 50, infamy: 10 }))).toBe(false);
    expect(gateOpen(gate, ctx({ corruption: 50, infamy: 20 }))).toBe(true);
  });
  it('认知防线档条件', () => {
    expect(gateOpen({ cognitionAtLeast: '崩溃' }, ctx({ cognition: '动摇' }))).toBe(false);
    expect(gateOpen({ cognitionAtLeast: '崩溃' }, ctx({ cognition: '崩溃' }))).toBe(true);
  });
  it('custom扩展接口', () => {
    const gate = { custom: (c: EventContext) => c.thugs >= 100 };
    expect(gateOpen(gate, ctx({ thugs: 50 }))).toBe(false);
    expect(gateOpen(gate, ctx({ thugs: 100 }))).toBe(true);
  });
});

describe('双面型事件解析(侵蚀演化三态)', () => {
  it('闸门未开→SFW态,ai_brief,不加堕落', () => {
    const r = resolveEvent(dineOption, ctx({ corruption: 10 }), false);
    expect(r.face).toBe('sfw');
    expect(r.isNsfw).toBe(false);
    expect(r.isFirstMilestone).toBe(false);
    expect(r.corruptionGain).toBe(0);
    expect(r.renderMode).toBe('ai_brief');
    expect(r.paradigm.worldbookKey).toBe('wb_dine_sfw');
  });
  it('闸门开+首次未触发→首次侵蚀特殊事件,ai_full,加堕落', () => {
    const r = resolveEvent(dineOption, ctx({ corruption: 50 }), false);
    expect(r.face).toBe('nsfw');
    expect(r.isFirstMilestone).toBe(true);
    expect(r.corruptionGain).toBe(5);
    expect(r.renderMode).toBe('ai_full');
    expect(r.paradigm.worldbookKey).toBe('wb_dine_first');
  });
  it('闸门开+首次已触发→NSFW常规态,ai_normal,不加堕落', () => {
    const c = ctx({ corruption: 50, triggeredLedger: { dine_first_erosion: true } });
    const r = resolveEvent(dineOption, c, false);
    expect(r.face).toBe('nsfw');
    expect(r.isFirstMilestone).toBe(false);
    expect(r.corruptionGain).toBe(0);
    expect(r.renderMode).toBe('ai_normal'); // NSFW非首次正常生成(非略写)
    expect(r.paradigm.worldbookKey).toBe('wb_dine_nsfw');
  });
  it('快进:首次仍ai_full,非首次NSFW→fast_summary', () => {
    const first = resolveEvent(dineOption, ctx({ corruption: 50 }), true);
    expect(first.renderMode).toBe('ai_full'); // 里程碑压过快进
    const repeat = resolveEvent(dineOption, ctx({ corruption: 50, triggeredLedger: { dine_first_erosion: true } }), true);
    expect(repeat.renderMode).toBe('fast_summary');
  });
});

describe('天生NSFW事件(供奉)', () => {
  it('首次→ai_full加堕落', () => {
    const r = resolveEvent(serveOption, ctx(), false);
    expect(r.face).toBe('nsfw');
    expect(r.isFirstMilestone).toBe(true);
    expect(r.corruptionGain).toBe(3);
  });
  it('非首次→ai_normal', () => {
    const r = resolveEvent(serveOption, ctx({ triggeredLedger: { serve_first: true } }), false);
    expect(r.isFirstMilestone).toBe(false);
    expect(r.renderMode).toBe('ai_normal');
    expect(r.paradigm.worldbookKey).toBe('wb_serve');
  });
});

describe('菜单(♥标记+置顶)', () => {
  it('未解锁不出现,SFW态无♥', () => {
    const menu = buildMenu([dineOption], ctx({ corruption: 10 }), 'day');
    expect(menu).toHaveLength(0); // 未解锁
    const menu2 = buildMenu([dineOption], ctx({ corruption: 10, unlocked: { occupy_street: true } }), 'day');
    expect(menu2[0].label).toBe('出门吃饭'); // SFW无♥
  });
  it('NSFW态加♥', () => {
    const c = ctx({ corruption: 50, unlocked: { occupy_street: true }, triggeredLedger: { dine_first_erosion: true } });
    const menu = buildMenu([dineOption], c, 'day');
    expect(menu[0].label).toBe('出门吃饭（♥）');
  });
  it('置顶项排最前', () => {
    const av: EventOption = { id: 'av', label: '拍AV', period: 'day', shape: 'born_nsfw', nsfw: { worldbookKey: 'wb_av' }, pinned: true };
    const menu = buildMenu([dineOption, av], ctx({ unlocked: { occupy_street: true } }), 'day');
    expect(menu[0].option.id).toBe('av'); // 置顶
  });
  it('时段过滤', () => {
    const menu = buildMenu([serveOption], ctx(), 'day'); // serve是night
    expect(menu).toHaveLength(0);
  });
});

describe('强制事件候选池(避孕套三连:同条件优先级+标签)', () => {
  const pool: ForcedEvent[] = [
    { id: 'condom_zero_1', ledgerKey: 'cz1', priority: 1, once: true, condition: c => c.corruption >= 0 && true },
    { id: 'condom_zero_2', ledgerKey: 'cz2', priority: 2, once: true, condition: () => true },
    { id: 'condom_zero_3', ledgerKey: 'cz3', priority: 3, once: true, condition: () => true },
  ];
  it('三次归零依次触发', () => {
    let c = ctx();
    const first = scanForced(pool, c)!;
    expect(first.id).toBe('condom_zero_1'); // 优先级最高且未触发
    c = ctx({ triggeredLedger: { cz1: true } });
    const second = scanForced(pool, c)!;
    expect(second.id).toBe('condom_zero_2');
    c = ctx({ triggeredLedger: { cz1: true, cz2: true } });
    const third = scanForced(pool, c)!;
    expect(third.id).toBe('condom_zero_3');
  });
  it('条件不满足返回null', () => {
    const p: ForcedEvent[] = [{ id: 'x', priority: 1, condition: c => c.corruption >= 100 }];
    expect(scanForced(p, ctx({ corruption: 10 }))).toBeNull();
  });
});

describe('多阶段事件(防跳阶段)', () => {
  // 学校:25/50/75三档
  const school: EventOption = {
    id: 'school', label: '去学校上课', period: 'day', shape: 'dual',
    sfw: { worldbookKey: 'wb_school_sfw' },
    needsContinuity: true,
    stages: [
      { corruptionAtLeast: 25, ledgerKey: 'school_25', corruptionWeight: 5, firstParadigm: { worldbookKey: 'wb_school25_first' }, paradigm: { worldbookKey: 'wb_school25' } },
      { corruptionAtLeast: 50, ledgerKey: 'school_50', corruptionWeight: 5, firstParadigm: { worldbookKey: 'wb_school50_first' }, paradigm: { worldbookKey: 'wb_school50' } },
      { corruptionAtLeast: 75, ledgerKey: 'school_75', corruptionWeight: 5, firstParadigm: { worldbookKey: 'wb_school75_first' }, paradigm: { worldbookKey: 'wb_school75' } },
    ],
  };

  it('低于最低门槛→SFW', () => {
    const r = resolveEvent(school, ctx({ corruption: 10 }), false);
    expect(r.face).toBe('sfw');
    expect(r.paradigm.worldbookKey).toBe('wb_school_sfw');
  });

  it('堕落≥25且25未触发→25首次(ai_full+加堕落+记账本)', () => {
    const r = resolveEvent(school, ctx({ corruption: 25 }), false);
    expect(r.isFirstMilestone).toBe(true);
    expect(r.renderMode).toBe('ai_full');
    expect(r.corruptionGain).toBe(5);
    expect(r.paradigm.worldbookKey).toBe('wb_school25_first');
    expect(r.milestoneLedgerKey).toBe('school_25');
  });

  it('防跳阶段:堕落=50但25未触发→强制先演25首次(不是50)', () => {
    const r = resolveEvent(school, ctx({ corruption: 50 }), false);
    expect(r.milestoneLedgerKey).toBe('school_25'); // 强制最低未触发
    expect(r.paradigm.worldbookKey).toBe('wb_school25_first');
  });

  it('25已触发+堕落50→进50首次', () => {
    const r = resolveEvent(school, ctx({ corruption: 50, triggeredLedger: { school_25: true } }), false);
    expect(r.isFirstMilestone).toBe(true);
    expect(r.milestoneLedgerKey).toBe('school_50');
    expect(r.paradigm.worldbookKey).toBe('wb_school50_first');
  });

  it('门槛之间重复体验:25已触发+堕落40(<50)→25常规ai_normal', () => {
    const r = resolveEvent(school, ctx({ corruption: 40, triggeredLedger: { school_25: true } }), false);
    expect(r.isFirstMilestone).toBe(false);
    expect(r.renderMode).toBe('ai_normal');
    expect(r.paradigm.worldbookKey).toBe('wb_school25');
    expect(r.corruptionGain).toBe(0);
  });

  it('快进:阶段首次仍ai_full;常规→fast_summary', () => {
    const first = resolveEvent(school, ctx({ corruption: 25 }), true);
    expect(first.renderMode).toBe('ai_full');
    const repeat = resolveEvent(school, ctx({ corruption: 40, triggeredLedger: { school_25: true } }), true);
    expect(repeat.renderMode).toBe('fast_summary');
  });
});

describe('markMilestone', () => {
  it('打标签不改原对象', () => {
    const ledger = {};
    const next = markMilestone(ledger, 'k1');
    expect(next.k1).toBe(true);
    expect(ledger).toEqual({});
  });
});
