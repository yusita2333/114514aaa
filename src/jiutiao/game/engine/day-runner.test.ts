import { describe, it, expect, vi } from 'vitest';
import { runCurrentSlot, advanceToNextDay, applyForcedSeizes } from './day-runner';
import type { RunnerState } from './day-runner';
import { startDay, allocate, setChoice, beginDay, beginNight, buildForcedLeaveDay } from '../action-grid/machine';
import type { SlotChoice } from '../action-grid/types';
import {
  demoEventOptions, demoSummaryTemplates, demoExtractBounds, demoForcedPool, createMockAi,
} from './mock-ai';
import type { EngineState, AiPort, SettleOptions } from './types';
import type { EventOption } from '../events/types';

// 统一事件模型 fixture：oral=天生NSFW+首次里程碑(权重10)；serve_vaginal=天生NSFW无里程碑(日常态)
const eventOptions: Record<string, EventOption> = {
  serve_vaginal: { id: 'serve_vaginal', label: '供奉', period: 'night', shape: 'born_nsfw', isServe: true, nsfw: { worldbookKey: 'wb_serve_vaginal' } },
  oral: {
    id: 'oral', label: '口交', period: 'night', shape: 'born_nsfw', isServe: true,
    nsfw: { worldbookKey: 'wb_oral' },
    first: { ledgerKey: 'oral_first', paradigm: { worldbookKey: 'wb_oral_first' }, corruptionWeight: 10 },
  },
};

function engineState(): EngineState {
  return {
    triggeredSpecials: {}, unlocked: {},
    corruption: 0, cognition: '死撑', claimedGates: {},
    money: 8000, thugTotal: 30, garrison: 0, loyalty: 60,
    condomStock: 480, desire: 0, desireCapacity: 60, perSlotThroughput: 6,
    infamy: 0, martialPrestige: 0,
    recruitQuota: 0, presentCount: 18, isDangerousPeriod: false, servedThisNight: 0,
  };
}

function mockAi(): AiPort {
  return { expand: vi.fn(async () => ({ text: 'AI正文' })), extract: vi.fn(async () => ({ presentCount: 20 })) };
}

function opts(ai: AiPort, fastForward = false): SettleOptions {
  return { eventOptions, fastForward, ai, summaryTemplates: { serve_vaginal: '大小姐给{n}人侍奉了' }, extractBounds: { presentCount: [0, 2000] } };
}

function freshRunner(): RunnerState {
  let day = startDay(1, 4);
  day = allocate(day, { dayCount: 2, nightCount: 2 }).state!;
  day = setChoice(day, 'day', 0, { optionId: 'oral', label: '口交' });
  day = setChoice(day, 'day', 1, { optionId: 'serve_vaginal', label: '供奉' });
  day = beginDay(day);
  return { day, engine: engineState() };
}

describe('runCurrentSlot 连接两个状态机', () => {
  it('执行首格(首次特殊):行动格写正文+引擎加堕落,cursor推进', async () => {
    const ai = mockAi();
    const r = await runCurrentSlot(freshRunner(), opts(ai));
    // 行动格侧
    expect(r.state.day.daySlots[0].status).toBe('done');
    expect(r.state.day.daySlots[0].resultText).toBe('AI正文');
    expect(r.state.day.cursor!.index).toBe(1); // 推进到第二格
    // 引擎侧
    expect(r.state.engine.corruption).toBe(10); // 首次口交加堕落度
    expect(r.state.engine.triggeredSpecials['oral_first']).toBe(true);
    expect(r.settle.events.firedGateIds).toContain('gate_10'); // 堕落10触发奖励
    expect(r.state.engine.presentCount).toBe(20); // extract应用
  });

  it('记忆层:执行一格写结构化日志;首次特殊写延续摘要', async () => {
    const ai = mockAi();
    const r = await runCurrentSlot(freshRunner(), opts(ai)); // 首格oral=首次特殊
    const log = r.state.engine.narrativeLog!;
    expect(log).toHaveLength(1);
    expect(log[0].eventId).toBe('oral');
    expect(log[0].tags).toContain('首次');
    expect(r.state.engine.continuityNotes!.some(n => n.text.includes('首次·口交'))).toBe(true);
  });

  it('记忆层:AI吐continuity→写entity笔记(优先于首次兜底)', async () => {
    const aiC: AiPort = { expand: vi.fn(async () => ({ text: 'AI正文', continuity: '头目阿组首次点名' })), extract: vi.fn(async () => ({})) };
    const r = await runCurrentSlot(freshRunner(), opts(aiC)); // 首格oral
    const notes = r.state.engine.continuityNotes!;
    expect(notes.some(n => n.kind === 'entity' && n.text === '头目阿组首次点名')).toBe(true);
    expect(notes.some(n => n.text.includes('首次·口交'))).toBe(false); // entity优先,不再加兜底milestone
  });

  it('连续执行两格到白天结算', async () => {
    const ai = mockAi();
    let r = await runCurrentSlot(freshRunner(), opts(ai));
    r = await runCurrentSlot(r.state, opts(ai)); // 第二格(serve日常)
    expect(r.state.day.phase).toBe('day_settled');
    expect(r.state.day.cursor).toBeNull();
    expect(r.state.day.daySlots[1].status).toBe('done');
  });

  it('快进模式:日常格不调AI出总结词', async () => {
    const ai = mockAi();
    // 把首格也设成日常以便测快进
    let day = startDay(1, 2);
    day = allocate(day, { dayCount: 0, nightCount: 2 }).state!;
    day = setChoice(day, 'night', 0, { optionId: 'serve_vaginal', label: '供奉' });
    day = setChoice(day, 'night', 1, { optionId: 'serve_vaginal', label: '供奉' });
    day = beginDay(day); // 白天0格直接 day_settled
    // 手动进夜晚
    const { beginNight } = await import('../action-grid/machine');
    day = beginNight(day);
    const r = await runCurrentSlot({ day, engine: engineState() }, opts(ai, true));
    expect(r.settle.events.renderMode).toBe('fast_summary');
    expect(r.state.day.nightSlots[0].resultText).toBe('大小姐给18人侍奉了');
    expect(ai.expand).not.toHaveBeenCalled();
  });
});

describe('强制临时格(避孕套归零)', () => {
  it('供奉后库存归零→插入condom_zero临时格,不占预算,标记once账本', async () => {
    // 库存54,一场18人供奉(18×3=54)正好扣到0
    const eng: EngineState = { ...engineState(), condomStock: 54, presentCount: 18 };
    let day = startDay(1, 1);
    day = allocate(day, { dayCount: 0, nightCount: 1 }).state!;
    day = setChoice(day, 'night', 0, { optionId: 'serve_vaginal', label: '供奉' });
    day = beginDay(day);     // 白天0格→day_settled
    day = beginNight(day);   // cursor=night#0
    const o: SettleOptions = {
      eventOptions: demoEventOptions, fastForward: false, ai: createMockAi(),
      summaryTemplates: demoSummaryTemplates, extractBounds: demoExtractBounds,
      forcedPool: demoForcedPool,
    };
    const r = await runCurrentSlot({ day, engine: eng }, o);
    expect(r.state.engine.condomStock).toBe(0);
    expect(r.forcedInsert!.id).toBe('condom_zero');
    // 临时格已插入夜晚(预算外)
    const inserted = r.state.day.nightSlots.find(s => s.inserted);
    expect(inserted!.choice!.optionId).toBe('condom_zero');
    expect(r.state.day.nightCount).toBe(1);            // 预算不变
    expect(r.state.engine.triggeredSpecials['condom_zero_1']).toBe(true); // once账本
  });

  it('库存未归零→不触发临时格', async () => {
    const eng: EngineState = { ...engineState(), condomStock: 480, presentCount: 18 };
    let day = startDay(1, 1);
    day = allocate(day, { dayCount: 0, nightCount: 1 }).state!;
    day = setChoice(day, 'night', 0, { optionId: 'serve_vaginal', label: '供奉' });
    day = beginDay(day);
    day = beginNight(day);
    const o: SettleOptions = {
      eventOptions: demoEventOptions, fastForward: false, ai: createMockAi(),
      summaryTemplates: demoSummaryTemplates, extractBounds: demoExtractBounds,
      forcedPool: demoForcedPool,
    };
    const r = await runCurrentSlot({ day, engine: eng }, o);
    expect(r.forcedInsert).toBeNull();
    expect(r.state.day.nightSlots.some(s => s.inserted)).toBe(false);
  });

  it('归零三连·E3真播种(生育线)→ ForcedEvent.onApply 设置 pregnant=true', async () => {
    // E1+E2 已触发(账本标记),本轮归零应触发 E3,onApply 副作用→pregnant=true
    const eng: EngineState = {
      ...engineState(),
      condomStock: 54, presentCount: 18,
      triggeredSpecials: { condom_zero_1: true, condom_zero_2: true },
    };
    let day = startDay(1, 1);
    day = allocate(day, { dayCount: 0, nightCount: 1 }).state!;
    day = setChoice(day, 'night', 0, { optionId: 'serve_vaginal', label: '供奉' });
    day = beginDay(day);
    day = beginNight(day);
    const o: SettleOptions = {
      eventOptions: demoEventOptions, fastForward: false, ai: createMockAi(),
      summaryTemplates: demoSummaryTemplates, extractBounds: demoExtractBounds,
      forcedPool: demoForcedPool,
    };
    const r = await runCurrentSlot({ day, engine: eng }, o);
    expect(r.forcedInsert!.id).toBe('condom_zero_3');
    expect(r.state.engine.triggeredSpecials['condom_zero_3']).toBe(true);
    expect(r.state.engine.pregnant).toBe(true); // 副作用钩通
  });
});

describe('强制请假轮奸日·吞吐×1.5', () => {
  it('请假日供奉格服务人数×1.5(扣套同步)', async () => {
    let day = buildForcedLeaveDay(2, 1, { optionId: 'serve_vaginal', label: '供奉' });
    day = beginNight(day); // day_settled → night_running
    const eng: EngineState = { ...engineState(), presentCount: 18, condomStock: 480 };
    const o: SettleOptions = {
      eventOptions: demoEventOptions, fastForward: false, ai: createMockAi(),
      summaryTemplates: demoSummaryTemplates, extractBounds: demoExtractBounds,
    };
    const r = await runCurrentSlot({ day, engine: eng }, o);
    expect(r.serve!.condomUsed).toBe(81);            // round(18×1.5)×3
    expect(r.state.engine.servedThisNight).toBe(27); // 18×1.5
  });
});

describe('强占(地盘骚扰)', () => {
  function allocated() {
    let d = startDay(1, 8);
    d = allocate(d, { dayCount: 4, nightCount: 4 }).state!;
    return d;
  }

  it('威胁≥1→骚扰强占白天第一格,玩家不可改派', () => {
    const eng: EngineState = { ...engineState(), threatLevel: 1 };
    const r = applyForcedSeizes(allocated(), eng, demoForcedPool);
    expect(r.fired!.id).toBe('harass');
    expect(r.day.daySlots[0].locked).toBe(true);
    expect(r.day.daySlots[0].choice!.optionId).toBe('defend_turf');
    expect(r.day.daySlots[0].lockedBy).toBe('地盘骚扰');
  });

  it('无威胁→不强占', () => {
    const eng: EngineState = { ...engineState(), threatLevel: 0 };
    const r = applyForcedSeizes(allocated(), eng, demoForcedPool);
    expect(r.fired).toBeNull();
    expect(r.day.daySlots[0].locked).toBeFalsy();
  });

  it('白天0格(请假)→强占夜晚第一格', () => {
    let d = startDay(1, 8);
    d = allocate(d, { dayCount: 0, nightCount: 8 }).state!;
    const eng: EngineState = { ...engineState(), threatLevel: 1 };
    const r = applyForcedSeizes(d, eng, demoForcedPool);
    expect(r.fired!.id).toBe('harass');
    expect(r.day.nightSlots[0].locked).toBe(true);
  });
});

describe('advanceToNextDay 进入次日', () => {
  const serveChoice: SlotChoice = { optionId: 'serve', label: '供奉' };

  it('正常→startDay进玩家分配', () => {
    const r = advanceToNextDay(engineState(), 1, 8, serveChoice);
    expect(r.forcedLeave).toBe(false);
    expect(r.day.dayNumber).toBe(2);
    expect(r.day.phase).toBe('allocating');
  });

  it('pendingForcedLeave→构造强制请假轮奸日+清除标记', () => {
    const r = advanceToNextDay(engineState(), 3, 8, serveChoice);
    expect(r.forcedLeave).toBe(false); // 默认无溢出

    const r2 = advanceToNextDay(
      { ...engineState(), pendingForcedLeave: true }, 3, 8, serveChoice,
    );
    expect(r2.forcedLeave).toBe(true);
    expect(r2.day.dayNumber).toBe(4);
    expect(r2.day.phase).toBe('day_running');      // 白天4格→从白天起逐格供奉
    expect(r2.day.dayCount).toBe(4);
    expect(r2.day.nightCount).toBe(4);
    expect([...r2.day.daySlots, ...r2.day.nightSlots].every(s => s.locked)).toBe(true);
    expect(r2.engine.pendingForcedLeave).toBe(false); // 标记已清除
  });

  it('记录今日请假进滑动窗口', () => {
    const r = advanceToNextDay(engineState(), 1, 8, serveChoice, true);
    expect(r.engine.leaveHistory).toEqual([true]);
    expect(r.reliefCleared).toBe(false);
  });

  it('滑动窗口保底触发→清空欲望', () => {
    // 已有9天请假 + 今天请假 = 短窗10天10请假; 欲望500<1000 → 清空
    const eng: EngineState = { ...engineState(), desire: 500, leaveHistory: Array.from({ length: 9 }, () => true) };
    const r = advanceToNextDay(eng, 5, 8, serveChoice, true);
    expect(r.reliefCleared).toBe(true);
    expect(r.engine.desire).toBe(0);
  });
});
