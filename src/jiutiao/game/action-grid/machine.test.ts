import { describe, it, expect } from 'vitest';
import {
  startDay, allocate, setChoice, clearChoice, lockSlot,
  checkSubmit, beginDay, markRunning, completeCurrent, beginNight, currentSlot, fillEmpty,
  insertEventSlot, buildForcedLeaveDay,
} from './machine';
import type { SlotChoice } from './types';

const serve: SlotChoice = { optionId: 'serve', label: '供奉打手' };
const recruit: SlotChoice = { optionId: 'recruit', label: '招募打手' };

function freshAllocated(day = 4, night = 4) {
  const s0 = startDay(1, day + night);
  const r = allocate(s0, { dayCount: day, nightCount: night });
  if (!r.ok || !r.state) throw new Error(r.error);
  return r.state;
}

describe('分配 allocate', () => {
  it('X+Y必须等于总格数', () => {
    const s = startDay(1, 8);
    expect(allocate(s, { dayCount: 4, nightCount: 4 }).ok).toBe(true);
    expect(allocate(s, { dayCount: 4, nightCount: 3 }).ok).toBe(false);
    expect(allocate(s, { dayCount: -1, nightCount: 9 }).ok).toBe(false);
  });
  it('请假=白天0格全给夜晚，合法', () => {
    const s = startDay(1, 8);
    const r = allocate(s, { dayCount: 0, nightCount: 8 });
    expect(r.ok).toBe(true);
    expect(r.state!.nightSlots.length).toBe(8);
    expect(r.state!.daySlots.length).toBe(0);
  });
});

describe('安排选项与校验', () => {
  it('空格不能提交', () => {
    const s = freshAllocated(2, 2);
    expect(checkSubmit(s, 'day').ok).toBe(false);
    expect(checkSubmit(s, 'day').emptyIndexes).toEqual([0, 1]);
  });
  it('排满后可提交', () => {
    let s = freshAllocated(2, 2);
    s = setChoice(s, 'day', 0, recruit);
    s = setChoice(s, 'day', 1, recruit);
    expect(checkSubmit(s, 'day').ok).toBe(true);
  });
  it('清空选项回到empty', () => {
    let s = freshAllocated(2, 2);
    s = setChoice(s, 'day', 0, recruit);
    s = clearChoice(s, 'day', 0);
    expect(s.daySlots[0].status).toBe('empty');
  });
});

describe('强占锁定', () => {
  it('locked格不可改派/清空', () => {
    let s = freshAllocated(2, 2);
    s = lockSlot(s, 'day', 0, '日常侵蚀', { optionId: 'forced_molest', label: '日常侵蚀NSFW' });
    expect(s.daySlots[0].locked).toBe(true);
    expect(s.daySlots[0].lockedBy).toBe('日常侵蚀');
    expect(() => setChoice(s, 'day', 0, recruit)).toThrow();
    expect(() => clearChoice(s, 'day', 0)).toThrow();
  });
});

describe('完整一天流转', () => {
  it('分配→白天逐格→白天结算→夜晚逐格→夜晚结算', () => {
    let s = freshAllocated(2, 2);
    // 白天排满
    s = setChoice(s, 'day', 0, recruit);
    s = setChoice(s, 'day', 1, recruit);
    s = beginDay(s);
    expect(s.phase).toBe('day_running');
    expect(currentSlot(s)!.index).toBe(0);
    // 第一格
    s = markRunning(s);
    expect(currentSlot(s)!.status).toBe('running');
    s = completeCurrent(s, '招募了几个打手');
    expect(s.daySlots[0].status).toBe('done');
    expect(s.cursor!.index).toBe(1);
    // 第二格→白天结算
    s = markRunning(s);
    s = completeCurrent(s, '又招了几个');
    expect(s.phase).toBe('day_settled');
    expect(s.cursor).toBeNull();
    // 夜晚
    s = setChoice(s, 'night', 0, serve);
    s = setChoice(s, 'night', 1, serve);
    s = beginNight(s);
    expect(s.phase).toBe('night_running');
    s = markRunning(s); s = completeCurrent(s, '供奉一批');
    s = markRunning(s); s = completeCurrent(s, '供奉二批');
    expect(s.phase).toBe('night_settled');
  });

  it('请假场景：白天0格直接跳到白天结算', () => {
    const r = allocate(startDay(1, 8), { dayCount: 0, nightCount: 8 });
    let s = beginDay(r.state!);
    expect(s.phase).toBe('day_settled'); // 白天0格直接结算
    for (let i = 0; i < 8; i++) s = setChoice(s, 'night', i, serve);
    s = beginNight(s);
    expect(s.phase).toBe('night_running');
  });

  it('边走边排：只排一格也能 beginDay(不再强制全填)', () => {
    let s = freshAllocated(2, 2);
    s = setChoice(s, 'day', 0, recruit); // 只排一格
    s = beginDay(s); // 不抛错
    expect(s.phase).toBe('day_running');
    expect(s.cursor!.index).toBe(0);
  });
});

describe('insertEventSlot 事件专属临时格', () => {
  const zeroEvent: SlotChoice = { optionId: 'condom_zero', label: '避孕套归零·裸体买套' };

  it('执行中插入→插在cursor后,成为下一格,不改预算计数', () => {
    let s = freshAllocated(0, 2);
    s = setChoice(s, 'night', 0, serve);
    s = setChoice(s, 'night', 1, serve);
    s = beginDay(s);             // 白天0格→day_settled
    s = beginNight(s);            // cursor=night#0
    s = markRunning(s);
    // 第0格供奉后避孕套归零→插入临时格
    s = insertEventSlot(s, 'night', '归零', zeroEvent);
    // 预算不变
    expect(s.nightCount).toBe(2);
    expect(s.totalSlots).toBe(2);
    // 临时格插在#1(cursor#0之后)
    expect(s.nightSlots.length).toBe(3);
    expect(s.nightSlots[1].inserted).toBe(true);
    expect(s.nightSlots[1].locked).toBe(true);
    expect(s.nightSlots[1].choice!.optionId).toBe('condom_zero');
    // index 连续重排
    expect(s.nightSlots.map(x => x.index)).toEqual([0, 1, 2]);
    // 完成当前格→cursor推进到临时格,而非原#1
    s = completeCurrent(s, '供奉一批后套没了');
    expect(s.cursor!.index).toBe(1);
    expect(currentSlot(s)!.choice!.optionId).toBe('condom_zero');
  });

  it('临时格使本时段延后结算(多跑一格才settle)', () => {
    let s = freshAllocated(0, 1);
    s = setChoice(s, 'night', 0, serve);
    s = beginDay(s);             // 白天0格→day_settled
    s = beginNight(s);
    s = markRunning(s);
    s = insertEventSlot(s, 'night', '归零', zeroEvent); // 现在2格
    s = completeCurrent(s, '第0格done'); // 推进到临时格,不结算
    expect(s.phase).toBe('night_running');
    expect(s.cursor!.index).toBe(1);
    s = markRunning(s);
    s = completeCurrent(s, '临时格done'); // 最后一格→结算
    expect(s.phase).toBe('night_settled');
  });

  it('未在该时段执行时→追加到末尾', () => {
    let s = freshAllocated(2, 2); // allocating, cursor=null
    s = insertEventSlot(s, 'day', '骚扰', { optionId: 'harass', label: '地盘骚扰' });
    expect(s.daySlots.length).toBe(3);
    expect(s.daySlots[2].inserted).toBe(true);
    expect(s.dayCount).toBe(2); // 预算不变
  });
});

describe('buildForcedLeaveDay 强制请假轮奸日', () => {
  it('白天/夜晚各半供奉+locked,从白天第0格起逐格供奉', () => {
    const d = buildForcedLeaveDay(5, 8, serve);
    expect(d.dayNumber).toBe(5);
    expect(d.phase).toBe('day_running'); // 有白天格→从白天起
    expect(d.dayCount).toBe(4);
    expect(d.nightCount).toBe(4);
    expect(d.forcedLeave).toBe(true);
    expect(d.daySlots.length).toBe(4);
    expect(d.nightSlots.length).toBe(4);
    expect(d.cursor).toEqual({ period: 'day', index: 0 });
    const allLockedServe = [...d.daySlots, ...d.nightSlots]
      .every(s => s.locked && s.choice!.optionId === 'serve');
    expect(allLockedServe).toBe(true);
    // 玩家不可改派
    expect(() => setChoice(d, 'day', 0, recruit)).toThrow();
    expect(() => setChoice(d, 'night', 0, recruit)).toThrow();
  });
  it('奇数总格:floor给白天,ceil给夜晚', () => {
    const d = buildForcedLeaveDay(5, 7, serve);
    expect(d.dayCount).toBe(3);
    expect(d.nightCount).toBe(4);
  });
});

describe('fillEmpty 一键填充', () => {
  it('填充所有空格,已排/锁定格不动', () => {
    let s = freshAllocated(0, 4);
    s = setChoice(s, 'night', 0, recruit); // 第0格已排招募
    s = lockSlot(s, 'night', 1, '强占', serve); // 第1格锁定
    s = fillEmpty(s, 'night', serve); // 填充剩余
    expect(s.nightSlots[0].choice!.optionId).toBe('recruit'); // 已排不变
    expect(s.nightSlots[1].locked).toBe(true); // 锁定不变
    expect(s.nightSlots[2].choice!.optionId).toBe('serve'); // 空格被填
    expect(s.nightSlots[3].choice!.optionId).toBe('serve');
  });
});
