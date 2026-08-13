// extract · 从 AI 原始返回中提取纯正文 / 延续摘要 / 数值 JSON
// ============================================================
// AI 按酒馆预设输出时会夹带思维链(前)+ 尾部格式块(如数学题)。我们强制 AI 用
// <jiutiao_text>...</jiutiao_text> 包正文,这里只提取标签内内容,自动剥离思维链/尾部。

/**
 * 提取游戏正文。优先 <jiutiao_text> 标签;无标签时尽力剥离常见思维链/尾部块兜底。
 * 批H7(用户反馈:正文里漏出</jiutiao_text>/前情|): 三处加固——
 *  ① 有开无闭(输出被截断)→ 取开标签之后全部;
 *  ② 无论走哪条路径,最终输出统一清洗残留 jiutiao_text/continuity 标签;
 *  ③ 剥离模型回显的注入头行(以"前情|"/"【前情"起头的整行)。
 */
export function extractGameText(raw: string): string {
  if (!raw) return '';
  let text: string;
  // 1. 优先取 <jiutiao_text>...</jiutiao_text>(大小写不敏感,跨行)
  const m = raw.match(/<jiutiao_text>([\s\S]*?)<\/jiutiao_text>/i);
  if (m) {
    text = m[1];
  } else {
    const openIdx = raw.search(/<jiutiao_text>/i);
    const mt = raw.match(/<maintext>([\s\S]*?)<\/maintext>/i);
    if (openIdx >= 0) {
      // 1b. 截断兜底: 有开标签没闭标签(生成被截断)→ 取开标签之后的全部
      text = raw.slice(openIdx).replace(/<jiutiao_text>/i, '');
    } else if (mt) {
      // 1c. 批L: 兼容 <maintext>——历史 prompt 曾同时下发两种标签指令,旧聊天/习惯性输出仍会用它
      text = mt[1];
    } else {
      // 2. 兜底: 没按标签输出时,剥离常见思维链/尾部 XML 块,尽量留正文
      let t = raw;
      // 去思维链常见标签块
      t = t.replace(/<(thinking|think|thought|reasoning|cot|分析|思考)[\s\S]*?<\/\1>/gi, '');
      // 去尾部格式块(预设常用大写标签如 <Q>/<REALIEZ>/<WF> 等·保守只去成对标签)
      t = t.replace(/<([A-Z][A-Z_]{1,20})>[\s\S]*?<\/\1>/g, '');
      text = t;
    }
  }
  // 3. 终清洗(所有路径统一): 残留 continuity 段(含未闭合)/游离 jiutiao_text 标签/注入头回声行
  let t = text;
  t = t.replace(/<continuity>[\s\S]*?(?:<\/continuity>|$)/gi, '');
  t = t.replace(/<\/?jiutiao_text>/gi, '');
  t = t.replace(/<\/?maintext>/gi, '');
  t = t.replace(/^[ \t]*(?:【?前情)[|·:：】][^\n]*$/gm, ''); // 只删以"前情|"/"【前情】"等起头的整行,不动正文里提及"前情"的句子
  return t.trim();
}

/**
 * 剥离思维链/推理块,留纯文本。用于副AI产出的连贯性简报(无 jiutiao_text 包裹)。
 * 只去成对的思考标签块,不动正常中文分点内容。
 */
export function stripThinking(raw: string): string {
  if (!raw) return '';
  let t = raw;
  t = t.replace(/<(thinking|think|thought|reasoning|cot|分析|思考)[\s\S]*?<\/\1>/gi, '');
  // 去 markdown 代码围栏(模型偶尔把简报包进 ```)
  t = t.replace(/```[a-z]*\n?/gi, '');
  return t.trim();
}

/** 提取 <continuity> 延续摘要;无则 undefined。 */
export function extractContinuity(raw: string): string | undefined {
  const m = raw.match(/<continuity>([\s\S]*?)<\/continuity>/i);
  const t = m ? m[1].trim() : '';
  return t || undefined;
}

/** 提取 <vars>{...}</vars> 或裸 JSON;失败返回 {}。 */
export function extractVarsJson(raw: string): Record<string, unknown> {
  const m = raw.match(/<vars>([\s\S]*?)<\/vars>/i);
  const body = m ? m[1] : raw;
  // 尝试从 body 里抓第一个 {...}
  const jsonMatch = body.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return {};
  try {
    const obj = JSON.parse(jsonMatch[0]);
    return obj && typeof obj === 'object' ? obj : {};
  } catch {
    return {};
  }
}
