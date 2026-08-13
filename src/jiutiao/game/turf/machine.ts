// 地盘系统 · 核心逻辑（纯函数·数据驱动）
// REGIONS 是单一真相源；引擎只认 RegionDef 结构。新区域=append 一条数据。
// C1：区域模型 + 复仇boss击败判定 + 降门槛 + 解锁 + threatLevel派生 + 据点产出。

import type { RegionDef, RegionState, RegionYields } from './types';

// ───────────────────────────────────────
// catalog · 地盘区域（=复仇目标网络。从松到紧·三流小势力起步）
// 数值为占位待调平。requiresRegion 串成解锁链。
// ───────────────────────────────────────
/** 阶段总数 */
export const STAGE_COUNT = 4;
/** 每阶段小关数(不含中心关) */
export const SMALLS_PER_STAGE = 10;

/** 每阶段配置(数据驱动·便于调平)。小关门槛在 [小关门槛低,高] 线性铺开,中心关单列。 */
interface StageConfig {
  stage: number;
  region: string;         // 该阶段地图区名
  boss: string;           // 中心关 boss 名(实义复仇目标)
  smallThr: [number, number];  // 小关门槛范围(线性)
  centerThr: number;           // 中心关门槛(高于本阶段所有小关,亦高于下阶段小关起点)
  smallMoney: [number, number];
  smallCondom: number;
  smallMartial: number;
  smallGarrison: [number, number];
  center: { money: number; condom: number; martial: number; garrison: number; shops: number };
}

const STAGE_CONFIGS: StageConfig[] = [
  { stage: 1, region: '弥生町外缘', boss: '三流势力·钉宫组组长',
    smallThr: [30, 100], centerThr: 150,
    smallMoney: [320, 560], smallCondom: 0, smallMartial: 1, smallGarrison: [2, 6],
    center: { money: 1400, condom: 120, martial: 8, garrison: 8, shops: 3 } },
  { stage: 2, region: '旧港区', boss: '弥生道外围头目·苇原',
    smallThr: [120, 320], centerThr: 400,
    smallMoney: [620, 920], smallCondom: 0, smallMartial: 2, smallGarrison: [8, 16],
    center: { money: 2600, condom: 180, martial: 14, garrison: 22, shops: 3 } },
  { stage: 3, region: '中央街', boss: '弥生道核心干部·黑濑',
    smallThr: [350, 650], centerThr: 800,
    smallMoney: [1000, 1500], smallCondom: 0, smallMartial: 3, smallGarrison: [18, 30],
    center: { money: 4500, condom: 260, martial: 22, garrison: 45, shops: 4 } },
  { stage: 4, region: '弥生道本部', boss: '弥生道会长·九条家杀父仇人',
    smallThr: [700, 1200], centerThr: 1600,
    smallMoney: [1700, 2400], smallCondom: 0, smallMartial: 5, smallGarrison: [34, 50],
    center: { money: 7000, condom: 350, martial: 36, garrison: 80, shops: 5 } },
];

/** 小关 flavor 名(无名据点·按序号取) */
const SMALL_FLAVOR = ['巷口据点', '废仓库', '地下赌场', '小酒馆', '码头仓栈', '废车场', '夜市摊区', '当铺', '网咖据点', '废工厂'];

/** 阶段中心关 id */
export function centerIdOfStage(stage: number): string { return `s${stage}_c`; }
/** 阶段第 n 个小关 id(n:1..10) */
function smallId(stage: number, n: number): string { return `s${stage}_${n}`; }

function lerp(lo: number, hi: number, t: number): number { return Math.round(lo + (hi - lo) * t); }

/** 生成一个阶段的 11 关(10 小关 + 1 中心关) */
function buildStage(cfg: StageConfig): RegionDef[] {
  const out: RegionDef[] = [];
  for (let n = 1; n <= SMALLS_PER_STAGE; n++) {
    const t = (n - 1) / (SMALLS_PER_STAGE - 1);
    out.push({
      id: smallId(cfg.stage, n), stage: cfg.stage,
      name: `${cfg.region}·${SMALL_FLAVOR[n - 1]}`,
      bossName: '无名据点头目',
      defeatThreshold: lerp(cfg.smallThr[0], cfg.smallThr[1], t),
      yields: { money: lerp(cfg.smallMoney[0], cfg.smallMoney[1], t), condom: cfg.smallCondom, martial: cfg.smallMartial },
      garrisonNeed: lerp(cfg.smallGarrison[0], cfg.smallGarrison[1], t),
      shops: n % 4 === 0 ? 2 : 1,
    });
  }
  out.push({
    id: centerIdOfStage(cfg.stage), stage: cfg.stage, isCenter: true,
    name: `${cfg.region}·中枢`, bossName: cfg.boss,
    defeatThreshold: cfg.centerThr,
    yields: { money: cfg.center.money, condom: cfg.center.condom, martial: cfg.center.martial },
    garrisonNeed: cfg.center.garrison, shops: cfg.center.shops,
  });
  return out;
}

export const REGIONS: RegionDef[] = [
  // 初始据点(stage0·无boss·默认已解锁·提供起步产出与店铺)
  { id: 'home', stage: 0, name: '九条老宅一隅', bossName: '—', defeatThreshold: 0, yields: { condom: 0, money: 500 }, garrisonNeed: 0, shops: 3 },
  ...STAGE_CONFIGS.flatMap(buildStage),
];

export const REGIONS_BY_ID: Record<string, RegionDef> =
  Object.fromEntries(REGIONS.map(r => [r.id, r]));

/** 初始据点(无boss,开局即解锁) */
export const HOME_REGION_ID = 'home';

// ───────────────────────────────────────
// 状态切片与查询
// ───────────────────────────────────────

/** 地盘引擎读写的状态切片（EngineState 结构兼容） */
export interface TurfState {
  money: number;
  regions?: Record<string, RegionState>;
  turfFortifyBonus?: number; // 据点加固(升级)：抬升稳定/防守
}

const DEFAULT_REGION: RegionState = { defeated: false, thresholdReduced: 0, garrison: 0 };

/** 读区域运行时状态(缺省) */
export function regionState(regions: Record<string, RegionState> | undefined, id: string): RegionState {
  if (id === HOME_REGION_ID) return regions?.[id] ?? { ...DEFAULT_REGION, defeated: true }; // 老宅默认已解锁
  return regions?.[id] ?? DEFAULT_REGION;
}

/** 区域是否已解锁(boss已击败 / 老宅) */
export function isRegionUnlocked(regions: Record<string, RegionState> | undefined, id: string): boolean {
  return regionState(regions, id).defeated;
}

/** 最终boss区域id(复仇终点=第4阶段中心关) */
export const FINAL_REGION_ID = centerIdOfStage(STAGE_COUNT);

// ───────────────────────────────────────
// 阶段查询(地图分阶段解锁的核心)
// ───────────────────────────────────────

/** 某阶段的全部关(10小关+1中心) */
export function regionsOfStage(stage: number): RegionDef[] {
  return REGIONS.filter(r => r.stage === stage);
}
/** 某阶段的小关(不含中心) */
export function smallsOfStage(stage: number): RegionDef[] {
  return REGIONS.filter(r => r.stage === stage && !r.isCenter);
}
/** 某阶段中心关 def */
export function centerOfStage(stage: number): RegionDef | undefined {
  return REGIONS.find(r => r.stage === stage && r.isCenter);
}
/** 某阶段中心关 boss 是否已击败 */
export function isStageBossDefeated(regions: Record<string, RegionState> | undefined, stage: number): boolean {
  return isRegionUnlocked(regions, centerIdOfStage(stage));
}
/** 某阶段是否激活(可查看/可攻打小关)。1阶段开局激活;之后阶段需上一阶段boss已击败。 */
export function isStageActive(regions: Record<string, RegionState> | undefined, stage: number): boolean {
  if (stage <= 1) return true;
  return isStageBossDefeated(regions, stage - 1);
}
/** 某阶段已占据的小关数 / 总数 */
export function stageSmallProgress(regions: Record<string, RegionState> | undefined, stage: number): { done: number; total: number } {
  const smalls = smallsOfStage(stage);
  const done = smalls.filter(d => isRegionUnlocked(regions, d.id)).length;
  return { done, total: smalls.length };
}
/** 某阶段全部小关是否已占满(=中心关解锁条件) */
export function isStageSmallsCleared(regions: Record<string, RegionState> | undefined, stage: number): boolean {
  const p = stageSmallProgress(regions, stage);
  return p.total > 0 && p.done === p.total;
}
/** 当前最高激活阶段(默认地图定位用) */
export function highestActiveStage(regions: Record<string, RegionState> | undefined): number {
  let s = 1;
  for (let i = 1; i <= STAGE_COUNT; i++) if (isStageActive(regions, i)) s = i;
  return s;
}

/** 区域在地图上的展示态：occupied(点亮)/attackable(红·可打)/weak(红·门槛不足)/locked(锁) */
export type RegionDisplay = 'occupied' | 'attackable' | 'weak' | 'locked';
export function regionDisplay(
  regions: Record<string, RegionState> | undefined, def: RegionDef, power: number,
): RegionDisplay {
  const st = regionState(regions, def.id);
  if (st.defeated) return 'occupied';
  if (!isStageActive(regions, def.stage)) return 'locked';
  // 中心关需占满本阶段小关才解锁
  if (def.isCenter && !isStageSmallsCleared(regions, def.stage)) return 'locked';
  return power >= effectiveThreshold(def, st) ? 'attackable' : 'weak';
}

/** 复仇是否完成(最终boss区域已击败) */
export function isRevengeComplete(regions: Record<string, RegionState> | undefined): boolean {
  return isRegionUnlocked(regions, FINAL_REGION_ID);
}

/** 有效击败门槛 = 基础门槛 - 已削减(贿赂/调查),下限0 */
export function effectiveThreshold(def: RegionDef, st: RegionState): number {
  return Math.max(0, def.defeatThreshold - st.thresholdReduced);
}

export interface DefeatCheck {
  ok: boolean;
  reason?: string;
}

/** 能否击败区域boss：阶段已激活 + (中心关需小关占满) + 未击败 + 武力≥有效门槛 */
export function canDefeat(def: RegionDef, power: number, regions: Record<string, RegionState> | undefined): DefeatCheck {
  const st = regionState(regions, def.id);
  if (st.defeated) return { ok: false, reason: '已占据' };
  if (!isStageActive(regions, def.stage)) return { ok: false, reason: '阶段未解锁(先击败上一阶段Boss)' };
  if (def.isCenter && !isStageSmallsCleared(regions, def.stage)) return { ok: false, reason: '需先占满本阶段全部小关' };
  if (power < effectiveThreshold(def, st)) return { ok: false, reason: `武力不足(需${effectiveThreshold(def, st)})` };
  return { ok: true };
}

/** 击败区域boss → 解锁该区域(纯函数,返回新 regions)。调用方应先 canDefeat。 */
export function defeatRegion(
  regions: Record<string, RegionState> | undefined, id: string,
): Record<string, RegionState> {
  const st = regionState(regions, id);
  return { ...(regions ?? {}), [id]: { ...st, defeated: true } };
}

/** 贿赂/调查削减击败门槛(纯函数)。amount 累加到 thresholdReduced。 */
export function reduceThreshold(
  regions: Record<string, RegionState> | undefined, id: string, amount: number,
): Record<string, RegionState> {
  const st = regionState(regions, id);
  return { ...(regions ?? {}), [id]: { ...st, thresholdReduced: st.thresholdReduced + Math.max(0, amount) } };
}

// ───────────────────────────────────────
// 情报 / 刺探 / 贿赂(事件格流程)
// ───────────────────────────────────────

/** 刺探成本与命中率(用户定:约四分之一概率) */
export const SCOUT_COST = 800;
export const SCOUT_HIT_RATE = 0.25;
/** 贿赂降门槛量(按目标关门槛比例,封顶) */
export const BRIBE_CUT_RATIO = 0.4;
export const BRIBE_CUT_MAX = 400;
/** 贿赂固定花费(门路钱·用户定:贿赂固定消耗金钱) */
export const BRIBE_COST = 1200;

/** 某关是否已刺探到情报 */
export function hasIntel(regions: Record<string, RegionState> | undefined, id: string): boolean {
  return regionState(regions, id).intel === true;
}
/** 是否存在任一已获情报且未占据的关(=贿赂选项是否解锁) */
export function anyIntel(regions: Record<string, RegionState> | undefined): boolean {
  return REGIONS.some(d => { const st = regionState(regions, d.id); return st.intel === true && !st.defeated; });
}
/** 标记某关已获情报 */
export function markIntel(
  regions: Record<string, RegionState> | undefined, id: string,
): Record<string, RegionState> {
  const st = regionState(regions, id);
  return { ...(regions ?? {}), [id]: { ...st, intel: true } };
}

/** 刺探结算结果 */
export interface ScoutResult {
  regions: Record<string, RegionState>;
  money: number;
  hit: boolean;         // 是否拿到情报
  paid: number;         // 实际花费
  reason?: 'no_money';  // 资金不足→无果
}
/**
 * 刺探某关(事件格→地图选目标)。扣 SCOUT_COST,约 1/4 概率拿到情报。
 * 拿到→该关 intel=true(解锁贿赂资格)。资金不足→无果不扣钱。
 * @param rng 0..1 随机
 */
export function settleScout(
  state: TurfState, id: string, rng: number, scoutBonus = 0,
): ScoutResult {
  if (state.money < SCOUT_COST) {
    return { regions: state.regions ?? {}, money: state.money, hit: false, paid: 0, reason: 'no_money' };
  }
  const money = state.money - SCOUT_COST;
  const hit = rng < (SCOUT_HIT_RATE + scoutBonus); // 布置暗探(scoutRate)提升命中
  const regions = hit ? markIntel(state.regions, id) : (state.regions ?? {});
  return { regions, money, hit, paid: SCOUT_COST };
}

/** 贿赂结算结果 */
export interface BribeResult {
  regions: Record<string, RegionState>;
  cut: number;          // 实际削减门槛量
  ok: boolean;
  reason?: 'no_intel' | 'already';
}
/**
 * 贿赂某关(事件格→地图,仅已刺探关可选)。按门槛比例降低击败门槛。
 * 需该关已有情报且未占据。
 */
export function settleBribe(
  regions: Record<string, RegionState> | undefined, id: string,
): BribeResult {
  const def = REGIONS_BY_ID[id];
  const st = regionState(regions, id);
  if (st.defeated) return { regions: regions ?? {}, cut: 0, ok: false, reason: 'already' };
  if (!st.intel) return { regions: regions ?? {}, cut: 0, ok: false, reason: 'no_intel' };
  const base = def ? def.defeatThreshold : 0;
  const cut = Math.min(BRIBE_CUT_MAX, Math.round(base * BRIBE_CUT_RATIO));
  return { regions: reduceThreshold(regions, id, cut), cut, ok: true };
}

/** 骚扰结果(进攻型·消耗打手换降门槛) */
export interface OffensiveHarassResult {
  regions: Record<string, RegionState>;
  thugLost: number;   // 概率减员(2-3起·随阶段↑)
  cut: number;        // 随机降门槛量
  ok: boolean;
  reason?: 'already' | 'locked';
}
/**
 * 骚扰敌据点(事件格→地图选未占据关)。与贿赂类似但代价是【概率减员】而非固定金钱,成果(降门槛)亦随机。
 * 减员: 约 65% 概率发生,数量 = 阶段+1 (+0~1)，初期(阶段1)2~3，随阶段上升。
 * 降门槛: 按目标门槛 10%~45% 随机削减(封顶 BRIBE_CUT_MAX)。
 */
export function settleOffensiveHarass(
  regions: Record<string, RegionState> | undefined, id: string, rng1: number, rng2: number,
): OffensiveHarassResult {
  const def = REGIONS_BY_ID[id];
  const st = regionState(regions, id);
  if (!def) return { regions: regions ?? {}, thugLost: 0, cut: 0, ok: false, reason: 'locked' };
  if (st.defeated) return { regions: regions ?? {}, thugLost: 0, cut: 0, ok: false, reason: 'already' };
  const thugLost = rng1 < 0.65 ? (def.stage + 1 + (rng2 < 0.5 ? 0 : 1)) : 0;
  const cut = Math.min(BRIBE_CUT_MAX, Math.round(def.defeatThreshold * (0.1 + rng2 * 0.35)));
  return { regions: reduceThreshold(regions, id, cut), thugLost, cut, ok: true };
}

/**
 * 派生 turf 解锁键(给 EventOption.unlockRequires 用)。
 * 设计目的: 让扩张日常事件(餐厅/游乐园等)的 unlockRequires 能匹配上 region 击败状态。
 * 规则: 每个已击败的 region id → `occupy_<id>=true`,其它区域用语义化别名:
 *   home/street/ward/hill/city → occupy_home/street/district/hill/halfcity
 * 这层映射避免 EventOption 直接耦合 turf 内部 id,以后 catalog 改 id 只需调本函数。
 */
export function deriveTurfUnlocked(regions: Record<string, RegionState> | undefined): Record<string, boolean> {
  const out: Record<string, boolean> = { occupy_home: true };
  // 阶段 boss 击败 → 占据规模别名(扩张日常按复仇进度解锁的一路来源)
  const stageAlias = ['', 'occupy_street', 'occupy_district', 'occupy_hill', 'occupy_halfcity'];
  for (let s = 1; s <= STAGE_COUNT; s++) {
    if (isStageBossDefeated(regions, s)) out[stageAlias[s]] = true;
  }
  // 贿赂资格:存在任一已获情报且未占据的关
  if (anyIntel(regions)) out.bribe_available = true;
  return out;
}

/** 占据规模(升级 expand_turf 驱动)→ 扩张日常别名。与复仇进度别名取并集(任一解锁即可)。 */
export function occupyScaleAliases(occupyScale: number | undefined): Record<string, boolean> {
  const n = occupyScale ?? 0;
  const out: Record<string, boolean> = {};
  if (n >= 1) out.occupy_street = true;
  if (n >= 2) out.occupy_district = true;
  if (n >= 3) out.occupy_hill = true;
  if (n >= 4) out.occupy_halfcity = true;
  return out;
}

// ───────────────────────────────────────
// 据点产出 & 稳定度派生
// ───────────────────────────────────────

/** 已解锁区域的每日总产出(faucet)。 */
export function dailyYields(regions: Record<string, RegionState> | undefined): Required<RegionYields> {
  const total = { condom: 0, money: 0, martial: 0 };
  for (const def of REGIONS) {
    if (!isRegionUnlocked(regions, def.id)) continue;
    total.condom += def.yields.condom ?? 0;
    total.money += def.yields.money ?? 0;
    total.martial += def.yields.martial ?? 0;
  }
  return total;
}

/** 已解锁区域的店铺总数(决定采购上限) */
export function totalShops(regions: Record<string, RegionState> | undefined): number {
  let shops = 0;
  for (const def of REGIONS) {
    if (isRegionUnlocked(regions, def.id)) shops += def.shops ?? 0;
  }
  return shops;
}

/**
 * 由稳定度派生威胁等级(驱动 forced events 的骚扰强占)。
 * 稳定度越低威胁越高；据点加固(turfFortifyBonus)抬升等效稳定。
 * 返回 0(无威胁)/1(骚扰)/2(进攻风险)。
 */
export function threatLevelFrom(stability: number, fortifyBonus = 0): number {
  const eff = stability + fortifyBonus * 5; // 每级加固≈+5稳定
  if (eff >= 70) return 0;
  if (eff >= 40) return 1;
  return 2;
}

// ───────────────────────────────────────
// 骚扰 / 进攻 结算（变量蓝图：骚扰高频不减员/进攻低概率减员丢地盘）
// ───────────────────────────────────────

/** 骚扰结算结果 */
export interface HarassResult {
  stability: number;   // 新稳定度
  money: number;       // 新资金
  repelled: boolean;   // 是否击退
  loot: number;        // 击退抢得资金
}

/**
 * 骚扰事件结算（高频·一般不减员）。判定驻守战力 vs 骚扰强度：
 *  - 击退(驻守战力≥强度)→ 抢得资金,稳定度不降。
 *  - 未击退→ 稳定度下降,无收益。
 * @param garrisonPower 驻守战力(可用打手×忠诚等,调用方算好传入)
 * @param harassPower 骚扰强度
 */
export function settleHarass(
  state: TurfState, stability: number, garrisonPower: number, harassPower: number,
): HarassResult {
  const repelled = garrisonPower >= harassPower;
  const fortify = state.turfFortifyBonus ?? 0;
  if (repelled) {
    const loot = Math.round(harassPower * 5); // 抢得资金∝骚扰规模
    return { stability, money: state.money + loot, repelled: true, loot };
  }
  const drop = Math.max(0, 8 - fortify); // 加固减缓稳定下降
  return { stability: Math.max(0, stability - drop), money: state.money, repelled: false, loot: 0 };
}

// ───────────────────────────────────────
// 地盘威胁循环（敌人反扑·每日扫描·骚扰高频/进攻低频丢地盘）
// ───────────────────────────────────────

/** 已占据的非老宅区域 id 列表 */
export function occupiedRegionIds(regions: Record<string, RegionState> | undefined): string[] {
  return REGIONS.filter(d => d.id !== HOME_REGION_ID && isRegionUnlocked(regions, d.id)).map(d => d.id);
}

/** 单次敌人反击的战报明细(玩家据此规划驻守人数) */
export interface RaidRecord {
  stage: number;          // 敌人来自第几阶段图
  strength: number;       // 敌方进攻强度
  repelled: boolean;      // 是否被常驻武力击退
  lostRegion?: string;    // 未击退时丢失的地盘名
}

export interface TurfThreatResult {
  regions: Record<string, RegionState>;
  raids: number;      // 昨日敌人反击次数
  lost: string[];     // 丢失的地盘名(可多块)
  records: RaidRecord[]; // 逐次战报(敌强度 vs 我方常驻武力·为何丢地盘)
}

/**
 * 各阶段地盘的防守难度 [每天最多反击次数, 每次进攻强度上限]。
 * 设计依据(认真调平): 防守是"限制玩家在新图冒进"的门槛——刚进图S时数值捉襟见肘、守不住图S的地盘,
 * 逼玩家经营提数值才能一边防守一边推进。数值参考各图中枢门槛(玩家攻破该图时的武力水平)设"略高于刚进该图的常驻武力":
 *  - 图1中枢门槛150·开局30打手·派驻10即可守 → 强度上限10(主要是教会玩家机制,不真难倒)。
 *  - 图2中枢门槛400·刚破图1时常驻武力约40 → 强度上限45(略高→守不住需经营)。
 *  - 图3中枢门槛800 → 120；图4中枢门槛1600 → 280。
 * ⭐关键: 按"地盘所属stage"分别结算,图S的地盘只被图S难度攻击。图2的高难度绝不波及图1的地盘——
 *    避免玩家打不过新图导致后方图1也被抢光的恶性循环。图1永远是安全后方(常驻武力够图1难度即可)。
 */
// [每天最多反击次数, 进攻强度下限, 进攻强度上限]。
// 强度下限≈上限的三成:图2起不再从0开始(避免1/4概率roll出白送的极低难度),
// 但下限也不设太高——保证"最弱的一次进攻也需一定常驻武力才守住",又不至于让刚进新图者每次必丢。
// 图1保留下限0(教学·允许有轻松的时候)。
const STAGE_DEFENSE: Record<number, [number, number, number]> = {
  1: [2, 0, 10],
  2: [2, 15, 50],
  3: [3, 40, 130],
  4: [3, 100, 300],
};

/**
 * 地盘反击每日结算（推进一天时调）。**按地盘所属 stage 分别结算**：
 *  - 每个"已占领了地盘的图"独立随机反击(次数/强度取该图 STAGE_DEFENSE)。
 *  - 每次: 敌强度 ≤ 常驻武力 → 守住；> 常驻武力 → 丢该图的一块地盘(splice·不重复)。
 *  - 图S 的进攻绝不波及图≠S 的地盘 → 图1后方永远只被图1难度攻击,不会被新图难度连坐。
 * 不减员、不改钱(简化)。常驻武力由调用方按派驻打手算好传入(守所有图共用)。
 */
/** 据点加固:每级=驻防武力+10%(乘算·不随后期贬值)。批B6-5 接入真实防守判定。 */
export const FORTIFY_PCT_PER_LEVEL = 0.10;
export function fortifiedPower(garrisonPower: number, fortifyLevels: number): number {
  return Math.round(garrisonPower * (1 + FORTIFY_PCT_PER_LEVEL * Math.max(0, fortifyLevels)));
}

export function settleTurfThreat(
  regions: Record<string, RegionState> | undefined,
  garrisonPower: number,
  rng: () => number,
  fortifyLevels = 0,
): TurfThreatResult {
  const effectivePower = fortifiedPower(garrisonPower, fortifyLevels);
  const occupied = occupiedRegionIds(regions);
  if (occupied.length === 0) return { regions: regions ?? {}, raids: 0, lost: [], records: [] };

  let regs = { ...(regions ?? {}) };
  let totalRaids = 0;
  const lost: string[] = [];
  const records: RaidRecord[] = [];
  for (let s = 1; s <= STAGE_COUNT; s++) {
    const stageOcc = occupied.filter(id => REGIONS_BY_ID[id]?.stage === s);
    if (stageOcc.length === 0) continue;
    const [maxRaids, minStrength, maxStrength] = STAGE_DEFENSE[s] ?? [2, 0, 10];
    const raids = Math.floor(rng() * (maxRaids + 1)); // 0..maxRaids
    totalRaids += raids;
    const occ = [...stageOcc];
    for (let i = 0; i < raids; i++) {
      const strength = minStrength + Math.round(rng() * (maxStrength - minStrength)); // [下限,上限]
      const breached = strength > effectivePower; // 敌强度 > 有效常驻武力(驻防×加固%) = 防线被突破
      if (breached && occ.length > 0) {
        const idx = Math.floor(rng() * occ.length) % occ.length;
        const id = occ.splice(idx, 1)[0];
        regs[id] = { ...regionState(regs, id), defeated: false };
        const name = REGIONS_BY_ID[id]?.name ?? id;
        lost.push(name);
        records.push({ stage: s, strength, repelled: false, lostRegion: name });
      } else {
        // repelled=真击退(武力足够); 被突破但该图当晚已无地盘可丢时 repelled=false 且无 lostRegion
        records.push({ stage: s, strength, repelled: !breached });
      }
    }
  }
  return { regions: regs, raids: totalRaids, lost, records };
}

/** 进攻结算结果 */
export interface RaidResult {
  thugLost: number;       // 减员
  stability: number;      // 新稳定度
  regionLost: string | null; // 丢失的区域(null=守住)
  regions: Record<string, RegionState>;
  defended: boolean;
}

/**
 * 进攻事件结算（低概率·减员·失败丢地盘）。判定驻守战力 vs 进攻强度：
 *  - 守住(战力≥强度)→ 减员较少,保住区域。
 *  - 失败→ 减员较多 + 丢失目标区域(变回未解锁)。
 * @param targetRegionId 被进攻的区域(失败则丢失)
 */
export function settleRaid(
  state: TurfState, stability: number, garrisonPower: number, raidPower: number, targetRegionId: string,
): RaidResult {
  const defended = garrisonPower >= raidPower;
  const fortify = state.turfFortifyBonus ?? 0;
  if (defended) {
    const thugLost = Math.max(0, Math.round(raidPower * 0.05) - fortify);
    return { thugLost, stability, regionLost: null, regions: state.regions ?? {}, defended: true };
  }
  const thugLost = Math.round(raidPower * 0.15);
  // 丢失区域：defeated 回 false（需重新打）
  const st = regionState(state.regions, targetRegionId);
  const regions = { ...(state.regions ?? {}), [targetRegionId]: { ...st, defeated: false } };
  return { thugLost, stability: Math.max(0, stability - 15), regionLost: targetRegionId, regions, defended: false };
}

