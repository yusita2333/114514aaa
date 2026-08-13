import { describe, it, expect } from 'vitest';
import { Schema } from '../schema';

describe('schema 冒烟', () => {
  it('空对象能 parse 出完整默认值', () => {
    const d = Schema.parse({});
    expect(d.九条会.打手总数).toBe(30);
    expect(d.九条凛.认知防线).toBe('死撑');
    expect(d.九条凛.堕落度).toBe(0);
    expect(d.大宅环境.避孕套库存).toBe(480);
    expect(d.时间.每日总行动格).toBe(8);
  });
  it('幂等：parse(parse(x)) === parse(x)', () => {
    const once = Schema.parse({});
    const twice = Schema.parse(once);
    expect(twice).toEqual(once);
  });
});
