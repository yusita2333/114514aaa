import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  putSave, autosave, listSaves, getSave, deleteSave, buildSummary, getSaveDb, _resetSaveDbForTest,
} from './store';
import type { RunnerState } from '../engine/day-runner';
import { startDay } from '../action-grid/machine';
import type { EngineState } from '../engine/types';

function engine(over: Partial<EngineState> = {}): EngineState {
  return {
    triggeredSpecials: {}, unlocked: {},
    corruption: 5, cognition: '死撑', claimedGates: {},
    money: 8000, thugTotal: 30, garrison: 0, loyalty: 60,
    condomStock: 480, desire: 0, desireCapacity: 60, perSlotThroughput: 6,
    recruitQuota: 0, presentCount: 18, isDangerousPeriod: false, servedThisNight: 0,
    ...over,
  };
}

function runner(day = 3): RunnerState {
  return { day: startDay(day, 8), engine: engine({ corruption: 12 }) };
}

beforeEach(async () => {
  // 每个测试用例清库
  await getSaveDb().saves.clear();
  _resetSaveDbForTest();
});

describe('存档往返', () => {
  it('写入后能读回,且数据完整', async () => {
    const id = await putSave({ slot: 1, name: '测试档', state: runner(3), fastForward: true, now: 1000 });
    const loaded = await getSave(id);
    expect(loaded).toBeDefined();
    expect(loaded!.name).toBe('测试档');
    expect(loaded!.slot).toBe(1);
    expect(loaded!.fastForward).toBe(true);
    expect(loaded!.state.day.dayNumber).toBe(3);
    expect(loaded!.state.engine.corruption).toBe(12);
    expect(loaded!.summary.corruption).toBe(12);
  });

  it('快照是深拷贝:存档后改原对象不影响存档', async () => {
    const r = runner(3);
    const id = await putSave({ slot: 1, name: 'x', state: r, fastForward: false, now: 1 });
    r.engine.corruption = 999; // 改原对象
    const loaded = await getSave(id);
    expect(loaded!.state.engine.corruption).toBe(12); // 存档不受影响
  });

  it('覆盖存档保留 createdAt,更新 updatedAt', async () => {
    const id = await putSave({ slot: 1, name: 'v1', state: runner(1), fastForward: false, now: 100 });
    await putSave({ id, slot: 1, name: 'v2', state: runner(2), fastForward: false, now: 200 });
    const loaded = await getSave(id);
    expect(loaded!.createdAt).toBe(100); // 保留
    expect(loaded!.updatedAt).toBe(200); // 更新
    expect(loaded!.name).toBe('v2');
    expect(loaded!.state.day.dayNumber).toBe(2);
  });
});

describe('自动存档', () => {
  it('autosave 复用同一 auto 槽(不累积)', async () => {
    await autosave(runner(1), false, 100);
    await autosave(runner(2), false, 200);
    const all = await listSaves();
    const autos = all.filter(s => s.slot === 'auto');
    expect(autos).toHaveLength(1); // 只有一个auto档
    expect(autos[0].state.day.dayNumber).toBe(2); // 最新
  });
});

describe('列表与删除', () => {
  it('按更新时间倒序', async () => {
    await putSave({ slot: 1, name: 'a', state: runner(1), fastForward: false, now: 100 });
    await putSave({ slot: 2, name: 'b', state: runner(1), fastForward: false, now: 300 });
    await putSave({ slot: 3, name: 'c', state: runner(1), fastForward: false, now: 200 });
    const all = await listSaves();
    expect(all.map(s => s.name)).toEqual(['b', 'c', 'a']);
  });

  it('删除后读不到,其它存档不受影响', async () => {
    const id1 = await putSave({ slot: 1, name: 'keep', state: runner(1), fastForward: false, now: 1 });
    const id2 = await putSave({ slot: 2, name: 'del', state: runner(1), fastForward: false, now: 2 });
    await deleteSave(id2);
    expect(await getSave(id2)).toBeUndefined();
    expect(await getSave(id1)).toBeDefined(); // 铁律:删一个不碰别的
  });
});

describe('buildSummary', () => {
  it('提取摘要字段', () => {
    const s = buildSummary(runner(5));
    expect(s.dayNumber).toBe(5);
    expect(s.corruption).toBe(12);
    expect(s.cognition).toBe('死撑');
  });
});
