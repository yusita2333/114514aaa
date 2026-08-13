import { describe, it, expect, vi } from 'vitest';
import { extractMaintext, extractVarsJson, extractContinuity, createRealAi } from './real-ai';
import type { ApiRouter } from '../../sillytavern/api-router';

describe('响应解析', () => {
  it('提取 maintext 标签', () => {
    expect(extractMaintext('<maintext>正文内容</maintext>')).toBe('正文内容');
    expect(extractMaintext('前<maintext>\n多行\n正文\n</maintext>后')).toBe('多行\n正文');
  });
  it('无标签返回全文', () => {
    expect(extractMaintext('裸文本')).toBe('裸文本');
  });
  it('提取 continuity 延续摘要;maintext剥掉continuity段', () => {
    const raw = '<maintext>正文</maintext><continuity>对弥生道首次屈辱</continuity>';
    expect(extractMaintext(raw)).toBe('正文');
    expect(extractContinuity(raw)).toBe('对弥生道首次屈辱');
    expect(extractContinuity('<maintext>仅正文</maintext>')).toBeUndefined();
  });
  it('提取 vars JSON', () => {
    expect(extractVarsJson('<vars>{"presentCount": 36}</vars>')).toEqual({ presentCount: 36 });
  });
  it('vars JSON 非法返回空', () => {
    expect(extractVarsJson('<vars>不是json</vars>')).toEqual({});
    expect(extractVarsJson('完全没标签也没json')).toEqual({});
  });
});

describe('createRealAi 走 router', () => {
  function mockRes(content: string): Response {
    return { ok: true, json: async () => ({ choices: [{ message: { content } }] }) } as unknown as Response;
  }

  it('expand 走 story 任务,抓 maintext', async () => {
    const call = vi.fn(async (_task: string) => ({ targetUsed: 'primary' as const, response: mockRes('<maintext>扩写</maintext>') }));
    const router = { call, targetFor: () => 'primary' as const } as unknown as ApiRouter;
    const ai = createRealAi({
      router,
      buildExpandMessages: () => [{ role: 'user', content: 'x' }],
      buildExtractMessages: () => [{ role: 'user', content: 'y' }],
    });
    const ex = await ai.expand({ resolution: {} as any, attitude: '堕落前' as any, choice: { optionId: 'oral' }, state: {} as any });
    expect(ex.text).toBe('扩写');
    expect(call).toHaveBeenCalledWith('story', expect.anything());
  });

  it('extract 走 vars 任务,抓 JSON', async () => {
    const call = vi.fn(async (_task: string) => ({ targetUsed: 'secondary' as const, response: mockRes('<vars>{"presentCount":42}</vars>') }));
    const router = { call, targetFor: () => 'secondary' as const } as unknown as ApiRouter;
    const ai = createRealAi({
      router,
      buildExpandMessages: () => [{ role: 'user', content: 'x' }],
      buildExtractMessages: () => [{ role: 'user', content: 'y' }],
    });
    const vars = await ai.extract({ narrative: '正文', choice: { optionId: 'serve' }, state: {} as any });
    expect(vars).toEqual({ presentCount: 42 });
    expect(call).toHaveBeenCalledWith('vars', expect.anything());
  });
});
