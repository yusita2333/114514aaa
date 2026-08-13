import { describe, it, expect } from 'vitest';
import { isSalvationOpen, endingTendency, resolveEnding } from './machine';
import type { EndingState } from './machine';

const s = (over: Partial<EndingState> = {}): EndingState => ({ cognition: '死撑', corruption: 0, ...over });

describe('金盆洗手(解脱)可达性', () => {
  it('堕落<50且认知未崩溃→开', () => {
    expect(isSalvationOpen(s({ cognition: '动摇', corruption: 40 }))).toBe(true);
  });
  it('堕落≥50→关', () => {
    expect(isSalvationOpen(s({ cognition: '动摇', corruption: 50 }))).toBe(false);
  });
  it('进崩溃档→关', () => {
    expect(isSalvationOpen(s({ cognition: '崩溃', corruption: 10 }))).toBe(false);
  });
});

describe('结局倾向', () => {
  it('死撑/动摇→解脱', () => {
    expect(endingTendency(s({ cognition: '死撑' }))).toBe('解脱');
    expect(endingTendency(s({ cognition: '动摇' }))).toBe('解脱');
  });
  it('崩溃→畸形团体', () => {
    expect(endingTendency(s({ cognition: '崩溃' }))).toBe('畸形团体');
  });
  it('母猪化/怀孕→堕落生育', () => {
    expect(endingTendency(s({ cognition: '母猪化' }))).toBe('堕落生育');
    expect(endingTendency(s({ cognition: '死撑', pregnant: true }))).toBe('堕落生育');
  });
});

describe('结局结算', () => {
  it('复仇未完成且未孕→进行中(null)', () => {
    expect(resolveEnding(s({ cognition: '崩溃' }), { revengeComplete: false })).toBeNull();
  });
  it('怀孕→提前锁堕落生育(无需复仇完成)', () => {
    expect(resolveEnding(s({ pregnant: true }), { revengeComplete: false })).toBe('堕落生育');
  });
  it('复仇完成→按倾向出结局', () => {
    expect(resolveEnding(s({ cognition: '死撑' }), { revengeComplete: true })).toBe('解脱');
    expect(resolveEnding(s({ cognition: '崩溃' }), { revengeComplete: true })).toBe('畸形团体');
    expect(resolveEnding(s({ cognition: '母猪化' }), { revengeComplete: true })).toBe('堕落生育');
  });
});
