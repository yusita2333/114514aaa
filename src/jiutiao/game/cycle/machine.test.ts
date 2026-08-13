import { describe, it, expect } from 'vitest';
import { isDangerDay, advanceCycle, CYCLE } from './machine';

describe('经期周期', () => {
  it('危险期窗口[start,end)', () => {
    expect(isDangerDay(CYCLE.dangerStart)).toBe(true);
    expect(isDangerDay(CYCLE.dangerEnd - 1)).toBe(true);
    expect(isDangerDay(CYCLE.dangerEnd)).toBe(false);
    expect(isDangerDay(0)).toBe(false);
  });
  it('推进一天+翻转危险期', () => {
    const r = advanceCycle(CYCLE.dangerStart - 1); // 推进到 dangerStart
    expect(r.cycleDay).toBe(CYCLE.dangerStart);
    expect(r.isDangerousPeriod).toBe(true);
  });
  it('周期回绕', () => {
    const r = advanceCycle(CYCLE.length - 1);
    expect(r.cycleDay).toBe(0);
    expect(r.isDangerousPeriod).toBe(false);
  });
});
