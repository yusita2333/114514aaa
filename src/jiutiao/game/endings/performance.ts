// 结局 AI 演出(批C2) · 结局种类 → 世界书范式路由 + 伪 ExpandRequest 构造
// 七条孤儿范式接通: 终Boss胜利按堕落分流 salvation/breeding;母猪化按怀孕分流 birth_show/ancestor_breeding;硬失败=defeat。
// 演出正文由 runner-store 在结局触发后调 ai.expand 后台生成,失败降级为静态文本(overlay 本就有)。

import type { EngineState, ExpandRequest } from '../engine/types';
import type { EventOption, EventResolution } from '../events/types';
import { attitudeForStage } from '../corruption/machine';

export type EndingKind = 'revenge' | 'fall' | 'fail';

export interface EndingPerformance {
  worldbookKey: string;
  label: string;
}

/**
 * 结局演出路由(设计正典§10 + demo.ts 范式注释里的既定规则):
 *  - revenge(复仇完成): 堕落<50=金盆洗手分手炮 salvation / ≥50=播种庆功宴 breeding
 *  - fall(母猪化): 已怀孕=分娩表演 birth_show / 未怀孕=灵堂播种宣誓 ancestor_breeding
 *  - fail(硬失败): 九条会覆灭=战败被敌轮奸 defeat
 */
export function routeEndingPerformance(kind: EndingKind, engine: EngineState): EndingPerformance {
  switch (kind) {
    case 'revenge':
      return engine.corruption < 50
        ? { worldbookKey: 'wb_victory_salvation', label: '复仇完成·金盆洗手' }
        : { worldbookKey: 'wb_victory_breeding', label: '复仇完成·播种庆功宴' };
    case 'fall':
      return engine.pregnant
        ? { worldbookKey: 'wb_birth_show', label: '母猪化·分娩表演' }
        : { worldbookKey: 'wb_ancestor_breeding', label: '母猪化·灵堂播种' };
    case 'fail':
    default:
      return { worldbookKey: 'wb_defeat', label: '九条会覆灭' };
  }
}

/** 构造结局演出的 ExpandRequest(伪事件·ai_full 重点扩写·不进结算流水线) */
export function buildEndingExpandRequest(kind: EndingKind, engine: EngineState, dayNumber: number): ExpandRequest {
  const perf = routeEndingPerformance(kind, engine);
  const option: EventOption = {
    id: `ending_${kind}`, label: perf.label, period: 'any', shape: 'born_nsfw',
    nsfw: { worldbookKey: perf.worldbookKey },
    hiddenInMenu: true,
  };
  const resolution: EventResolution = {
    option, face: 'nsfw', isFirstMilestone: false, corruptionGain: 0,
    paradigm: { worldbookKey: perf.worldbookKey },
    renderMode: 'ai_full', isNsfw: true,
  };
  return {
    resolution,
    attitude: attitudeForStage(engine.cognition),
    choice: { optionId: option.id },
    state: engine,
    dayNumber,
  };
}
