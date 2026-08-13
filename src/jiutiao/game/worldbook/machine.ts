// 世界书接入（纯函数）· 复用底座 Lorebook 作内容仓库
// 用法对齐 prompt组装管线设计 §2：
//  - 常驻条目(constant=蓝灯)：美学/叙事/角色/打手态度——永远注入(桶1承载)。
//  - 范式条目：按 worldbookKey 代码直取(NOT 关键词 scan,防胡诌)。

import type { Lorebook, LorebookEntry } from '../../sillytavern/types';

/** 取所有常驻条目(constant)，按 order 升序。 */
export function getConstantEntries(lorebook: Lorebook): LorebookEntry[] {
  return lorebook.entries
    .filter(e => e.constant)
    .sort((a, b) => a.order - b.order);
}

/** 常驻条目拼成一段文本(注入 prompt 用)。 */
export function renderConstantBlock(lorebook: Lorebook): string {
  return getConstantEntries(lorebook).map(e => e.content).join('\n\n');
}

/**
 * 按 worldbookKey 直取范式正文（代码驱动，不走关键词 scan）。
 * 匹配 entry.keys 含该 key;找不到返回 null(调用方回落到元数据提示)。
 */
export function getParadigmByKey(lorebook: Lorebook, key: string): string | null {
  const hit = lorebook.entries.find(e => e.keys.includes(key));
  return hit ? hit.content : null;
}

/** 是否存在某 key 的范式条目 */
export function hasParadigm(lorebook: Lorebook, key: string): boolean {
  return lorebook.entries.some(e => e.keys.includes(key));
}
