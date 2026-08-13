// memory-settings · 前文记忆注入设置(批B6)
// 全局偏好存 localStorage(跨聊天生效)。生成层是纪律性的(小总结无条件后台生成),
// 这里的设置只决定注入哪些——所以改设置立即生效,无需等待。

import { DEFAULT_MEMORY_CONFIG } from '../../game/memory/machine';
import type { MemoryInjectConfig } from '../../game/memory/machine';

const KEY = 'pellucid_memory_config';

const PROSE_MODES: MemoryInjectConfig['proseMode'][] = ['none', 'ev1', 'ev3', 'day1', 'day3'];
const WINDOWS: MemoryInjectConfig['windowDays'][] = [10, 15, 20, 30, 60];

export function getMemoryConfig(): MemoryInjectConfig {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_MEMORY_CONFIG };
    const p = JSON.parse(raw) as Partial<MemoryInjectConfig>;
    return {
      proseMode: PROSE_MODES.includes(p.proseMode as MemoryInjectConfig['proseMode']) ? p.proseMode as MemoryInjectConfig['proseMode'] : DEFAULT_MEMORY_CONFIG.proseMode,
      windowDays: WINDOWS.includes(p.windowDays as MemoryInjectConfig['windowDays']) ? p.windowDays as MemoryInjectConfig['windowDays'] : DEFAULT_MEMORY_CONFIG.windowDays,
      bigEnabled: typeof p.bigEnabled === 'boolean' ? p.bigEnabled : DEFAULT_MEMORY_CONFIG.bigEnabled,
    };
  } catch {
    return { ...DEFAULT_MEMORY_CONFIG };
  }
}

export function setMemoryConfig(cfg: MemoryInjectConfig) {
  try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch { /* 无localStorage环境忽略 */ }
}

/** UI 文案(设置页选项+token提示) */
export const PROSE_MODE_LABELS: Record<MemoryInjectConfig['proseMode'], { label: string; hint: string }> = {
  none: { label: '立刻总结', hint: '不注入原文,全靠总结。token最省,细节最少。' },
  ev1: { label: '间隔一个事件(推荐)', hint: '保留最近1格原文辅助生成,细节与token平衡。' },
  ev3: { label: '间隔三个事件', hint: '保留最近3格原文,更多细节,token增多。' },
  day1: { label: '间隔一天', hint: '保留最近两日原文,token明显增多。' },
  day3: { label: '间隔三天', hint: '保留最近三日原文,token开销最大,慎用。' },
};
