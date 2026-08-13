// body-counts · 大小姐部位计数(批I1·用户反馈"插入内射高潮变量不更新"——原UI为占位符,从未接线)
// ============================================================
// 设计: 代码驱动的确定性计数,零AI零token(与"硬数值由系统算"哲学一致)。
//  - 按事件类别映射到部位: 插入类 += 本场处理人数; 内射 = 无套/套不足覆盖的人数(用户确认口径);
//    口交场合默认无套 → 口内射/颜射按人数对半分。
//  - 高潮 = 每场按认知防线阶段给定值(死撑0/动摇1/崩溃2/母猪化3),计入主部位的高潮计数。
//  - 计数键 = `${部位}.${标签}`,与 RinPanel 展示矩阵一一对应:
//    口腔: 口交/口内射/颜射 · 小穴: 插入/内射/高潮 · 肛门: 插入/内射/高潮 · 子宫: 宫颈侵入/中出/子宫高潮
// 未列入映射的事件不计数(SFW/经营类)。范式语料重构(批I3)时如引入新事件,在此表补一行即可。

export type BodyCounts = Record<string, number>;

/** 事件→计数类别 */
type CountCategory = 'oral' | 'vaginal' | 'anal' | 'womb' | 'mixed';

/** 事件计数映射表(只列会发生身体接触的事件;供奉暴力系默认经小穴) */
const EVENT_CATEGORY: Record<string, CountCategory> = {
  // 口交线
  serve_oral: 'oral',
  // 插入供奉线(小穴)
  serve_vaginal: 'vaginal', serve_bath: 'vaginal', serve_pregnant: 'vaginal',
  forced_leave: 'vaginal', garden_orgy: 'vaginal', ancestor: 'vaginal',
  daily_toy: 'vaginal', daily_erosion: 'vaginal',
  serve_violent: 'vaginal', serve_violent_hang: 'vaginal', serve_violent_horse: 'vaginal',
  serve_violent_donkey: 'vaginal', serve_violent_water: 'vaginal', serve_violent_cane: 'vaginal',
  serve_violent_latex: 'vaginal', serve_violent_ginger: 'vaginal', serve_violent_wax: 'vaginal',
  // 肛交
  serve_anal: 'anal',
  // 生育线(子宫计数联动)
  condom_zero_3: 'womb', birth_rape: 'womb',
  // AV(混合: 小穴为主+口腔参半)
  av_first: 'mixed', av_custom: 'mixed', av_shoot: 'mixed', av_first_forced: 'mixed',
  // ─── 批J·映射补漏(用户反馈"次数从没更新")——以下高频事件此前未映射,做多少次都不计数 ───
  // dual/翻面事件放心映射: SFW面结算时 isNsfw=false→served=0→不计数,只有NSFW面才累加。
  rest: 'vaginal',            // 轮奸起居(睡奸·夜间最常用)
  serve_advance: 'vaginal',   // 强占进阶·大规模轮奸
  garden_rock: 'vaginal', garbage: 'vaginal', walk_toy: 'vaginal',
  protection: 'vaginal', protection_a4: 'vaginal', bribe: 'vaginal',
  condom_zero: 'vaginal', condom_zero_1: 'vaginal', condom_zero_2: 'mixed', // E2口戴套=口+穴
  school: 'vaginal', school_25: 'vaginal', school_50: 'vaginal', school_75: 'vaginal',
  // 外出翻面线(全部轮奸主轴经小穴)
  dine: 'vaginal', mall: 'vaginal', beach: 'vaginal', hiking: 'vaginal', camping: 'vaginal',
  festival: 'vaginal', concert: 'vaginal', amusement: 'vaginal', street: 'vaginal',
};

/** 每场高潮数 · 按认知防线阶段(身体越陷落越藏不住) */
const ORGASM_BY_COGNITION: Record<string, number> = { 死撑: 0, 动摇: 1, 崩溃: 2, 母猪化: 3 };

export interface CountEvent {
  optionId: string;
  /** 本场处理人数(供奉=结算served;其它=在场数) */
  served: number;
  /** 本场实际用掉的避孕套数(算无套内射人数用) */
  condomUsed: number;
  /** 套不足(内射链) */
  condomShort: boolean;
  /** 本事件本就无套(口交类) */
  noCondom: boolean;
  cognition: string;
}

/** 应用一场事件的计数(纯函数,返回新记录;未映射事件原样返回)。 */
export function applyBodyCounts(counts: BodyCounts | undefined, ev: CountEvent): BodyCounts {
  const cat = EVENT_CATEGORY[ev.optionId];
  const base: BodyCounts = { ...(counts ?? {}) };
  if (!cat || ev.served <= 0) return base;
  const add = (key: string, n: number) => { if (n > 0) base[key] = (base[key] ?? 0) + n; };
  const n = ev.served;
  // 无套人数: 本就无套=全员;套不足=超出覆盖的人数(1人1套口径);否则0
  const uncovered = ev.noCondom ? n : (ev.condomShort ? Math.max(0, n - ev.condomUsed) : 0);
  const orgasm = ORGASM_BY_COGNITION[ev.cognition] ?? 1;

  switch (cat) {
    case 'oral':
      add('口腔.口交', n);
      add('口腔.口内射', Math.ceil(n / 2));
      add('口腔.颜射', Math.floor(n / 2));
      break;
    case 'vaginal':
      add('小穴.插入', n);
      add('小穴.内射', uncovered);
      add('小穴.高潮', orgasm);
      break;
    case 'anal':
      add('肛门.插入', n);
      add('肛门.内射', uncovered);
      add('肛门.高潮', orgasm);
      break;
    case 'womb': // 生育线: 无套定义事件,深部直达
      add('小穴.插入', n);
      add('小穴.内射', n);
      add('子宫.宫颈侵入', n);
      add('子宫.中出', n);
      add('子宫.子宫高潮', Math.max(1, orgasm));
      break;
    case 'mixed': // AV: 小穴为主+口腔参半
      add('小穴.插入', n);
      add('小穴.内射', uncovered);
      add('小穴.高潮', orgasm);
      add('口腔.口交', Math.ceil(n / 2));
      add('口腔.颜射', Math.floor(n / 2));
      break;
  }
  return base;
}
