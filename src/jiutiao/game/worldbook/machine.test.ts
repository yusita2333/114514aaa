import { describe, it, expect } from 'vitest';
import { getConstantEntries, renderConstantBlock, getParadigmByKey, hasParadigm } from './machine';
import { demoLorebook } from './demo';

describe('世界书接入', () => {
  it('getConstantEntries 只取常驻,按order升序', () => {
    const cs = getConstantEntries(demoLorebook);
    expect(cs.every(e => e.constant)).toBe(true);
    expect(cs.map(e => e.id)).toEqual(['c_aesthetic', 'c_narrative', 'c_rin_origin', 'c_thug_attitude', 'c_taboo']);
    // 范式条目(非常驻)不在内
    expect(cs.some(e => e.id === 'p_serve')).toBe(false);
  });

  it('renderConstantBlock 拼成文本(3-5b 真实内容)', () => {
    const block = renderConstantBlock(demoLorebook);
    // 真实内容:C1含"体验内核",C5含"打手态度·B面灵魂"
    expect(block).toContain('体验内核');
    expect(block).toContain('打手态度');
    // 范式条目(非常驻)不进常驻块
    expect(block).not.toContain('3-5d补全'); // 范式占位文本不应出现在常驻块
  });

  it('getParadigmByKey 按key直取(不scan)', () => {
    // 3-5b 世界书 key 已拆分:wb_serve_oral / wb_serve_vaginal 等
    expect(getParadigmByKey(demoLorebook, 'wb_serve_oral')).not.toBeNull();
    expect(getParadigmByKey(demoLorebook, 'wb_bribe_first')).toContain('首次身体贿赂');
    expect(getParadigmByKey(demoLorebook, 'wb_不存在')).toBeNull();
  });

  it('hasParadigm 判定存在', () => {
    expect(hasParadigm(demoLorebook, 'wb_serve_oral')).toBe(true); // 3-5b 键名
    expect(hasParadigm(demoLorebook, 'wb_nope')).toBe(false);
  });
});
