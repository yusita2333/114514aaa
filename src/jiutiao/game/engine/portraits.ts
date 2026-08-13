// 立绘系统(批E2·现阶段三张+完整接口) · 时段+事件 → 立绘/背景/插图
// ============================================================
// 现阶段: 三张白底换装立绘(昼正装/昼休闲/夜睡衣),按时段+事件类型切换。
// 未来形态(用户展望·登记发布后迭代池): 大量换装立绘+场景背景图+NSFW专门插图+回看画廊(宿主=大小姐页)。
//   接口已按此预留: resolvePortrait 返回 {outfit, background, illustration} 三元组(后两者现恒null),
//   OUTFIT_BY_EVENT 数据驱动注册表可无限加装,新增服装=加一行+一张图。
// 部署: 图片在前端仓库 assets/portraits/,随 git push 走 jsdelivr CDN。
//   用 @master 引用(静态艺术资产与代码版本无耦合;更新最多延迟数小时)——URL集中在 PORTRAIT_BASE,将来可换。

import type { SlotPeriod } from '../action-grid/types';

export type OutfitKey = 'formal' | 'casual' | 'sleep';

const PORTRAIT_BASE = 'https://cdn.jsdelivr.net/gh/wuminggla/pellucid-grove@master/assets/portraits/';

export const OUTFIT_META: Record<OutfitKey, { file: string; label: string }> = {
  formal: { file: 'rin-formal.png', label: '正装' },
  casual: { file: 'rin-casual.png', label: '休闲' },
  sleep: { file: 'rin-sleep.png', label: '睡衣' },
};

/**
 * 白天事件 → 服装(数据驱动·未列出的白天事件默认正装)。
 * 用户定稿: 正装=白天极道相关行动;休闲=白天采购/闲逛外出(餐厅/野营等);睡衣=夜晚通用。
 */
export const OUTFIT_BY_EVENT: Record<string, OutfitKey> = {
  // 采购/外出闲逛 → 休闲
  buy_condoms: 'casual',
  dine: 'casual',
  street: 'casual',
  school: 'casual',
  mall: 'casual',
  amusement: 'casual',
  beach: 'casual',
  festival: 'casual',
  concert: 'casual',
  hiking: 'casual',
  camping: 'casual',
  garden_walk: 'casual',
  garden_rock: 'casual',
  garden_orgy: 'casual',
  ancestor: 'casual',
  rest: 'casual',
  // 极道行动(明示,便于阅读;缺省本就是正装)
  recruit: 'formal', attack: 'formal', harass: 'formal', scout: 'formal', bribe: 'formal',
  protection: 'formal', reward: 'formal', av_first: 'formal', av_custom: 'formal',
};

/** 立绘解析结果(background/illustration = 未来换装/背景/插图系统的接口位,现恒null) */
export interface PortraitResolution {
  outfit: OutfitKey;
  url: string;
  label: string;
  background: string | null;    // 场景背景图(发布后迭代)
  illustration: string | null;  // NSFW专门插图(发布后迭代)
}

/**
 * 解析当前立绘: 夜晚→睡衣;白天按当前格事件查表(缺省正装);无当前格按时段。
 * @param period 当前时段('day'|'night')
 * @param optionId 当前执行/选中格的事件id(可空)
 */
export function resolvePortrait(period: SlotPeriod | 'day' | 'night', optionId?: string | null): PortraitResolution {
  let outfit: OutfitKey;
  if (period === 'night') outfit = 'sleep';
  else outfit = (optionId && OUTFIT_BY_EVENT[optionId]) || 'formal';
  const meta = OUTFIT_META[outfit];
  return {
    outfit,
    url: PORTRAIT_BASE + meta.file,
    label: meta.label,
    background: null,
    illustration: null,
  };
}
