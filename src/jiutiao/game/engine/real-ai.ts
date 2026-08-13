// 真实 AiPort 实现 · 接底座 api-router（双AI）
// AI1(expand) 走 task='story'(主API)；AI2(extract) 走 task='vars'(次API,未启用则回落主API)。
// M5 先做非流式(一次性取完整响应);流式渲染在 UI 层(M7)另接。

import type { AiPort, ExpandRequest, ExtractRequest, ExpandResult } from './types';
import type { ApiRouter } from '../../sillytavern/api-router';

/** 从 OpenAI 兼容响应里取出完整文本（非流式） */
async function readWholeText(res: Response): Promise<string> {
  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? '';
}

/** 提取 <maintext>…</maintext>，没有标签则返回全文(去掉continuity部分) */
export function extractMaintext(raw: string): string {
  const m = raw.match(/<maintext>([\s\S]*?)<\/maintext>/);
  if (m) return m[1].trim();
  // 无maintext标签:返回全文但剥掉continuity标签段
  return raw.replace(/<continuity>[\s\S]*?<\/continuity>/, '').trim();
}

/** 提取 <continuity>…</continuity> 延续摘要;无则 undefined */
export function extractContinuity(raw: string): string | undefined {
  const m = raw.match(/<continuity>([\s\S]*?)<\/continuity>/);
  const t = m ? m[1].trim() : '';
  return t || undefined;
}

/** 提取 <vars>{…}</vars> JSON；失败返回 {} */
export function extractVarsJson(raw: string): Record<string, unknown> {
  const m = raw.match(/<vars>([\s\S]*?)<\/vars>/);
  const body = m ? m[1] : raw;
  try {
    const obj = JSON.parse(body.trim());
    return obj && typeof obj === 'object' ? obj : {};
  } catch {
    return {};
  }
}

export interface RealAiDeps {
  router: ApiRouter;
  /** 组 AI1 prompt：通常绑定 buildGamePrompt(注入世界书/预设/记忆)。 */
  buildExpandMessages: (req: ExpandRequest) => Array<{ role: string; content: string }>;
  /** 组 AI2 prompt：要求按 JSON 抓叙事数值。 */
  buildExtractMessages: (req: ExtractRequest) => Array<{ role: string; content: string }>;
  /** AI1 采样参数(从预设取);透传给 router。 */
  sampling?: Record<string, unknown>;
}

/** 构造真实 AiPort。注入 router + prompt 构造器，便于替换/测试。 */
export function createRealAi(deps: RealAiDeps): AiPort {
  return {
    async expand(req: ExpandRequest): Promise<ExpandResult> {
      const messages = deps.buildExpandMessages(req);
      const { response } = await deps.router.call('story', { messages, ...(deps.sampling ?? {}) });
      if (!response.ok) throw new Error(`AI1(story) HTTP ${response.status}`);
      const raw = await readWholeText(response);
      return { text: extractMaintext(raw), continuity: extractContinuity(raw) };
    },
    async extract(req: ExtractRequest): Promise<Record<string, unknown>> {
      const messages = deps.buildExtractMessages(req);
      const { response } = await deps.router.call('vars', { messages });
      if (!response.ok) throw new Error(`AI2(vars) HTTP ${response.status}`);
      const raw = await readWholeText(response);
      return extractVarsJson(raw);
    },
  };
}
