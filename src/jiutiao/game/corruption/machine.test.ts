import { describe, it, expect } from 'vitest';
import {
  stageForCorruption, advanceCognition, gainCorruption, attitudeForStage,
  COGNITION_THRESHOLDS, REWARD_GATES,
} from './machine';

describe('认知防线阈值推进 (每25一档)', () => {
  it('堕落度映射到正确档位', () => {
    expect(stageForCorruption(0)).toBe('死撑');
    expect(stageForCorruption(24)).toBe('死撑');
    expect(stageForCorruption(25)).toBe('动摇');
    expect(stageForCorruption(50)).toBe('崩溃');
    expect(stageForCorruption(75)).toBe('母猪化');
    expect(stageForCorruption(999)).toBe('母猪化');
  });
  it('单向不回退', () => {
    expect(advanceCognition('崩溃', 25)).toBe('崩溃');
    expect(advanceCognition('死撑', 50)).toBe('崩溃');
  });
});

describe('四档态度层 (双判定·3-5a直连stage)', () => {
  it('四档直连:attitudeForStage 返回 stage 本身', () => {
    expect(attitudeForStage('死撑')).toBe('死撑');
    expect(attitudeForStage('动摇')).toBe('动摇');
    expect(attitudeForStage('崩溃')).toBe('崩溃');
    expect(attitudeForStage('母猪化')).toBe('母猪化');
  });
});

describe('堕落度增加与连带结算', () => {
  it('加堕落度推进认知防线', () => {
    const r = gainCorruption({ corruption: 20, cognition: '死撑', claimedGates: {} }, 8); // 28≥25
    expect(r.corruption).toBe(28);
    expect(r.cognition).toBe('动摇');
    expect(r.cognitionAdvancedTo).toBe('动摇');
  });
  it('未跨阈值不推进', () => {
    const r = gainCorruption({ corruption: 10, cognition: '死撑', claimedGates: {} }, 5); // 15<25
    expect(r.cognition).toBe('死撑');
    expect(r.cognitionAdvancedTo).toBeNull();
  });
  it('达阈值触发奖励闸门(一次性)', () => {
    const r = gainCorruption({ corruption: 8, cognition: '死撑', claimedGates: {} }, 3); // 11≥10
    expect(r.firedGates.map(g => g.gateId)).toContain('gate_10');
    expect(r.claimedGates['gate_10']).toBe(true);
  });
  it('已领闸门不重复触发', () => {
    const r = gainCorruption({ corruption: 12, cognition: '死撑', claimedGates: { gate_10: true } }, 1);
    expect(r.firedGates.map(g => g.gateId)).not.toContain('gate_10');
  });
  it('一次大增可同时跨多个闸门', () => {
    const r = gainCorruption({ corruption: 0, cognition: '死撑', claimedGates: {} }, 26); // 26≥10且≥25
    const ids = r.firedGates.map(g => g.gateId);
    expect(ids).toContain('gate_10');
    expect(ids).toContain('gate_25');
    expect(r.cognition).toBe('动摇'); // 26≥25
  });
});

describe('表配置自洽', () => {
  it('认知阈值递增', () => {
    for (let i = 1; i < COGNITION_THRESHOLDS.length; i++) {
      expect(COGNITION_THRESHOLDS[i].atCorruption).toBeGreaterThan(COGNITION_THRESHOLDS[i-1].atCorruption);
    }
  });
  it('奖励闸门阈值递增', () => {
    for (let i = 1; i < REWARD_GATES.length; i++) {
      expect(REWARD_GATES[i].atCorruption).toBeGreaterThan(REWARD_GATES[i-1].atCorruption);
    }
  });
});
