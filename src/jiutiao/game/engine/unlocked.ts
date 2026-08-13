// 派生 EventContext.unlocked 字典 · 单一真相聚合点
// 设计目的: EventOption.unlockRequires 查的是扁平 unlocked 字典,但实际解锁信号分散——
//   - upgrade 系统写 engine.unlocked['dungeon_unlocked'/'studio_unlocked'/...] (升级解锁)
//   - turf 系统写 engine.regions[].defeated=true (击败 boss 解锁地盘)
// 这里把两路派生信号合并成单一字典,3处构造 EventContext 都调本函数。
// 改这里 = 一次性同步所有解析路径,不会出现"菜单显示了但 settleSlot 又判定未解锁"等漂移。

import { deriveTurfUnlocked, occupyScaleAliases } from '../turf/machine';
import type { EngineState } from './types';

/**
 * 合并 engine.unlocked + turf 派生 = 完整 EventOption 可见的 unlocked 字典。
 * 新增派生源(如经济/经期某状态解锁某事件)时,在这里加一行合并即可。
 */
export function deriveEventUnlocked(engine: EngineState): Record<string, boolean> {
  const c = engine.corruption ?? 0;
  const up = engine.upgrades ?? {};
  return {
    ...(engine.unlocked ?? {}),
    ...deriveTurfUnlocked(engine.regions),
    ...occupyScaleAliases(engine.occupyScale),
    // —— 采购范式档位键:buy_toy/buy_escort/buy_convoy_x 由???解禁直接写 unlocked;送货终态在此派生 ——
    condom_courier: (up.condom_delivery ?? 0) >= 1, // 黑市送货渠道 → 终态送货上门
    // —— 日常起居/扫除事件闸门:任一日常淫乱化???解禁即开(原"日常淫乱化改造"按钮已删,老档unlocked.dailytoy仍有效) ——
    dailytoy: engine.unlocked?.dailytoy === true || engine.unlocked?.toy_diet === true || engine.unlocked?.toilet_lewd === true || engine.unlocked?.chair_lewd === true,
    // —— 地下室刑具键(一刑具一升级):unlocked 或 upgrades 任一有效即解锁(兜底购买路径差异);
    //    旧存档兼容:老"刑具扩充"(dungeon_gear)一钮解锁四旧装置 ——
    gear_hang: engine.unlocked?.gear_hang === true || (up.gear_hang ?? 0) >= 1 || engine.unlocked?.dungeon_gear === true || (up.dungeon_gear ?? 0) >= 1,
    gear_horse: engine.unlocked?.gear_horse === true || (up.gear_horse ?? 0) >= 1 || engine.unlocked?.dungeon_gear === true || (up.dungeon_gear ?? 0) >= 1,
    gear_donkey: engine.unlocked?.gear_donkey === true || (up.gear_donkey ?? 0) >= 1 || engine.unlocked?.dungeon_gear === true || (up.dungeon_gear ?? 0) >= 1,
    gear_water: engine.unlocked?.gear_water === true || (up.gear_water ?? 0) >= 1 || engine.unlocked?.dungeon_gear === true || (up.dungeon_gear ?? 0) >= 1,
    gear_cane: engine.unlocked?.gear_cane === true || (up.gear_cane ?? 0) >= 1,
    gear_latex: engine.unlocked?.gear_latex === true || (up.gear_latex ?? 0) >= 1,
    gear_ginger: engine.unlocked?.gear_ginger === true || (up.gear_ginger ?? 0) >= 1,
    gear_wax: engine.unlocked?.gear_wax === true || (up.gear_wax ?? 0) >= 1,
    // —— 堕落度派生闸门(身体开发/性癖随堕落解锁;占位阈值,留接口接真·身体开发度/受虐癖变量) ——
    anal_unlocked: c >= 35,       // 后穴开发(肛交)
    masochism: c >= 50,           // 受虐癖觉醒(暴力供奉细分主动选)
    deep_corruption: c >= 70,     // 深度堕落(进阶供奉/多人轮奸)
    // —— 生育线(避孕套归零真播种后) ——
    pregnant_line: engine.pregnant === true,
  };
}
