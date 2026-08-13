// 升级技能树 · 分页 + 节点布局元数据（数据驱动·留巨量内容接口）
// 叙事: 九条会沉寂多年,宅邸功能不全,凛赚钱后逐间修缮重启。
//   「九条宅」为主页,房间修缮节点解锁其它子页(道场/摄影房/地下室/纪念室/庭院/日常淫具化…)。
//   新游戏只解锁两页: 九条宅 + 凛自己。其它升级体系各自成独立小技能树分页。
// 本文件只管"页与节点的呈现/前后置布局";具体效果仍由 upgrade/machine 的 UpgradeDef 决定。

import { UPGRADES, UPGRADES_BY_ID } from './machine';
import type { UpgradeDef } from './types';

/** 技能树子页 */
export interface SkillPage {
  id: string;
  name: string;
  /** 叙事说明(页头) */
  narrative: string;
  /** 解锁键(engine.unlocked[unlockKey]===true 才解锁本页)。空=永远解锁(主页/凛)。 */
  unlockKey?: string;
  /** 由主页哪个修缮节点解锁(给锁定页提示用) */
  unlockedByNode?: string;
}

export const SKILL_PAGES: SkillPage[] = [
  { id: 'house', name: '九条宅', narrative: '荒废多年的九条本邸。凛赚来的每一分钱，先用来修缮这里——每修好一处，就重启一片可能。' },
  { id: 'rin', name: '凛 · 自己', narrative: '大小姐的起居与身体。定制饮食、深度睡眠、扩建浴场……每一件生活的改善，都在不知不觉间给"另一种改造"腾出位置——绯红的???会自己亮起来。性技修炼是"堕落解锁的技艺"(粉金)，既要花钱又要堕落到位。' },
  { id: 'biz', name: '势力经营', narrative: '九条会的门面与耳目：采购、威望、会规、暗探。正经的帮派治理——但每条会规的背面，都藏着一条只约束大小姐的荒唐规矩。' },
  { id: 'dojo', name: '道场', narrative: '练武堂。打手的武力与肉体在此被反复操练、改造。', unlockKey: 'dojo_page', unlockedByNode: 'room_dojo' },
  { id: 'studio', name: '摄影房', narrative: '暗网AV摄影棚。设备、产能、玩法编排都在这里升级。', unlockKey: 'av', unlockedByNode: 'studio' },
  { id: 'dungeon', name: '地下室', narrative: '拘禁与刑具之所。暴力供奉、受虐癖线在此推进——这里没有"正经"升级，每一件刑具都是粉金的。', unlockKey: 'basement', unlockedByNode: 'basement' },
  { id: 'expansion', name: '地盘扩张', narrative: '修缮宅邸、收购地皮——解锁的是正正经经的日常去处。但每个去处下面都吊着一个绯红的???，堕落到了，它会自己翻面。' },
];

/** 节点布局(列col/行row)。每页一套局部坐标。 */
export interface NodeMeta { page: string; col: number; row: number; }
export const NODE_META: Record<string, NodeMeta> = {
  // 九条宅(修缮=解锁子页)。布局约定(全文件统一): col=横向x, row=纵向深度y(根在上,前置链竖直向下)
  room_dojo:     { page: 'house', col: 0, row: 0 },
  studio:        { page: 'house', col: 1, row: 0 },
  basement:      { page: 'house', col: 2, row: 0 },
  annex_estate:  { page: 'house', col: 3, row: 0 },
  m_garden_rock: { page: 'house', col: 4, row: 1 }, // 批C1:假山野战???(庭院启用下挂)
  annex_shrine:  { page: 'house', col: 3, row: 1 },
  m_ancestor:    { page: 'house', col: 3, row: 2 },
  // 凛·自己(含并入的日常淫乱化:张贴链/假阳具饮食/如厕/椅子):
  // c0饮食链 c1睡眠+张贴 c2床 c3浴场 c4淫乱化根 c5散步链 c6性技链 c7欲望+衣物链
  life_diet:   { page: 'rin', col: 0, row: 0 },
  m_diet:      { page: 'rin', col: 0, row: 1 },
  m_garbage:   { page: 'rin', col: 0, row: 2 }, // 批C1:扫除的去向???(假阳具饮食下挂)
  life_sleep:  { page: 'rin', col: 1, row: 0 },
  life_bed:    { page: 'rin', col: 2, row: 0 },
  m_sleep:      { page: 'rin', col: 1, row: 1 },
  life_bath:   { page: 'rin', col: 3, row: 0 },
  m_bath:      { page: 'rin', col: 4, row: 0 },
  m_bath_serve: { page: 'rin', col: 4, row: 1 },
  life_walk:   { page: 'rin', col: 5, row: 0 },
  m_walk_toy:   { page: 'rin', col: 5, row: 1 },
  m_walk_dog:   { page: 'rin', col: 5, row: 2 },
  m_walk_orgy:  { page: 'rin', col: 5, row: 3 },
  m_toilet:    { page: 'rin', col: 3, row: 2 },
  m_chair:     { page: 'rin', col: 4, row: 2 },
  poster1:   { page: 'rin', col: 1, row: 2 },
  poster2:   { page: 'rin', col: 1, row: 3 },
  poster3:   { page: 'rin', col: 1, row: 4 },
  poster4:   { page: 'rin', col: 1, row: 5 },
  // 性技链(吞吐·批F1修复): 独立第6列与散步健体并列。此前误排 col0 压在饮食???链下,
  // 视觉上像"扫除的去向(堕45)"的后置——实际乳交只需堕15+手技,布局误导已纠正。
  skill_hand:   { page: 'rin', col: 6, row: 0 },
  skill_breast: { page: 'rin', col: 6, row: 1 },
  skill_foot:   { page: 'rin', col: 6, row: 2 },
  skill_double: { page: 'rin', col: 6, row: 3 },
  skill_orgy:   { page: 'rin', col: 6, row: 4 },
  desire_train:  { page: 'rin', col: 2, row: 2 },
  desire_liquor: { page: 'rin', col: 2, row: 3 },
  m_cloth_outer: { page: 'rin', col: 2, row: 4 },
  m_cloth_shoes: { page: 'rin', col: 2, row: 5 },
  m_cloth_inner: { page: 'rin', col: 2, row: 6 },
  m_scent:       { page: 'rin', col: 2, row: 7 },
  // 势力经营:采购纵链(金2+???3渐进覆盖)/威望/制度
  buy_drugstore:  { page: 'biz', col: 0, row: 0 },
  buy_wholesale:  { page: 'biz', col: 0, row: 1 },
  m_buy_toy:      { page: 'biz', col: 0, row: 2 },
  m_buy_escort:   { page: 'biz', col: 0, row: 3 },
  m_buy_convoy:   { page: 'biz', col: 0, row: 4 },
  prestige_crest:  { page: 'biz', col: 1, row: 0 },
  prestige_feast:  { page: 'biz', col: 1, row: 1 },
  m_feast_hostess: { page: 'biz', col: 1, row: 2 },
  rule_code:    { page: 'biz', col: 3, row: 0 },
  rule_spy:     { page: 'biz', col: 2, row: 1 },
  rule_patrol:  { page: 'biz', col: 3, row: 1 },
  m_rule_greet: { page: 'biz', col: 4, row: 1 },
  m_rule_meal:  { page: 'biz', col: 4, row: 2 },
  // 道场:c0兵器三段 c1格斗→实战→陪练 c2慰安 c3精力→体型→粉金二连 c4入珠 c5体能链
  wpn1:        { page: 'dojo', col: 0, row: 0 },
  wpn2:        { page: 'dojo', col: 0, row: 1 },
  wpn3:        { page: 'dojo', col: 0, row: 2 },
  brawl:       { page: 'dojo', col: 1, row: 0 },
  dojo_spar:   { page: 'dojo', col: 1, row: 1 },
  m_spar1:     { page: 'dojo', col: 1, row: 2 },
  m_spar2:     { page: 'dojo', col: 1, row: 3 },
  m_cheer1:    { page: 'dojo', col: 2, row: 1 },
  m_cheer2:    { page: 'dojo', col: 2, row: 2 },
  m_cheer3:    { page: 'dojo', col: 2, row: 3 },
  vigor:       { page: 'dojo', col: 3, row: 0 },
  body_mod:    { page: 'dojo', col: 3, row: 1 },
  sex_stamina: { page: 'dojo', col: 3, row: 2 },
  lust_beast:  { page: 'dojo', col: 3, row: 3 },
  m_pearl:     { page: 'dojo', col: 4, row: 2 },
  phys_train:  { page: 'dojo', col: 5, row: 0 },
  phys_train2: { page: 'dojo', col: 5, row: 1 },
  phys_train3: { page: 'dojo', col: 5, row: 2 },
  // 摄影房(一钮一效果/一钮一tag):c0器材+机位 c1班底 c2电池 c3用品 c4来信;c5-6衣装;c7-10布景
  av_gear:     { page: 'studio', col: 0, row: 0 },
  av_cam3:     { page: 'studio', col: 0, row: 1 },
  av_cam8:     { page: 'studio', col: 0, row: 2 },
  av_crew1:    { page: 'studio', col: 1, row: 0 },
  av_crew2:    { page: 'studio', col: 1, row: 1 },
  av_crew3:    { page: 'studio', col: 1, row: 2 },
  av_crew4:    { page: 'studio', col: 1, row: 3 },
  av_bat1:     { page: 'studio', col: 2, row: 0 },
  av_bat2:     { page: 'studio', col: 2, row: 1 },
  av_bat3:     { page: 'studio', col: 2, row: 2 },
  av_bat4:     { page: 'studio', col: 2, row: 3 },
  av_bat5:     { page: 'studio', col: 2, row: 4 },
  av_toy1:     { page: 'studio', col: 3, row: 0 },
  av_toy2:     { page: 'studio', col: 3, row: 1 },
  av_toy3:     { page: 'studio', col: 3, row: 2 },
  m_av_letters:{ page: 'studio', col: 4, row: 0 },
  av_out_maid:    { page: 'studio', col: 5, row: 0 },
  av_out_seifuku: { page: 'studio', col: 6, row: 0 },
  av_out_gym:     { page: 'studio', col: 5, row: 1 },
  av_out_nun:     { page: 'studio', col: 6, row: 1 },
  av_out_ol:      { page: 'studio', col: 5, row: 2 },
  av_out_qipao:   { page: 'studio', col: 6, row: 2 },
  av_out_kimono:  { page: 'studio', col: 5, row: 3 },
  av_out_swim:    { page: 'studio', col: 6, row: 3 },
  av_out_wedding: { page: 'studio', col: 5, row: 4 },
  av_out_latex:   { page: 'studio', col: 6, row: 4 },
  av_set_school:   { page: 'studio', col: 7, row: 0 },
  av_set_office:   { page: 'studio', col: 8, row: 0 },
  av_set_clinic:   { page: 'studio', col: 9, row: 0 },
  av_set_family:   { page: 'studio', col: 10, row: 0 },
  av_set_fantasy:  { page: 'studio', col: 7, row: 1 },
  av_set_cosplay:  { page: 'studio', col: 8, row: 1 },
  av_set_idol:     { page: 'studio', col: 9, row: 1 },
  av_set_shrine:   { page: 'studio', col: 10, row: 1 },
  av_set_bridal:   { page: 'studio', col: 7, row: 2 },
  av_set_church:   { page: 'studio', col: 8, row: 2 },
  av_set_onsen:    { page: 'studio', col: 9, row: 2 },
  av_set_auction:  { page: 'studio', col: 10, row: 2 },
  av_set_stream:   { page: 'studio', col: 7, row: 3 },
  av_set_alien:    { page: 'studio', col: 8, row: 3 },
  av_set_train:    { page: 'studio', col: 9, row: 3 },
  av_set_washitsu: { page: 'studio', col: 10, row: 3 },
  av_set_rain:     { page: 'studio', col: 7, row: 4 },
  // 地下室(一刑具一升级·r0=四旧刑具,r1=四新刑具(粉金),r2=隔音→???)
  gear_hang:         { page: 'dungeon', col: 0, row: 0 },
  gear_horse:        { page: 'dungeon', col: 1, row: 0 },
  gear_donkey:       { page: 'dungeon', col: 2, row: 0 },
  gear_water:        { page: 'dungeon', col: 3, row: 0 },
  gear_cane:         { page: 'dungeon', col: 0, row: 1 },
  gear_latex:        { page: 'dungeon', col: 1, row: 1 },
  gear_ginger:       { page: 'dungeon', col: 2, row: 1 },
  gear_wax:          { page: 'dungeon', col: 3, row: 1 },
  dungeon_soundproof:{ page: 'dungeon', col: 4, row: 0 },
  m_dungeon_night:   { page: 'dungeon', col: 4, row: 1 },
  // 地盘扩张(对外收购树:街区=根居中;左下私山子树,右下城区→半城;连线只向下、横距≤2列)
  annex_street:    { page: 'expansion', col: 2, row: 0 },
  annex_hill:      { page: 'expansion', col: 0, row: 1 },
  m_dine:          { page: 'expansion', col: 2, row: 1 },
  m_mall:          { page: 'expansion', col: 3, row: 1 },
  annex_district:  { page: 'expansion', col: 4, row: 1 },
  annex_hill_trail:{ page: 'expansion', col: 0, row: 2 },
  annex_hill_camp: { page: 'expansion', col: 1, row: 2 },
  m_amusement:     { page: 'expansion', col: 3, row: 2 },
  m_beach:         { page: 'expansion', col: 4, row: 2 },
  m_festival:      { page: 'expansion', col: 5, row: 2 },
  annex_halfcity:  { page: 'expansion', col: 6, row: 2 },
  m_hiking:        { page: 'expansion', col: 0, row: 3 },
  m_camping:       { page: 'expansion', col: 1, row: 3 },
  m_concert:       { page: 'expansion', col: 6, row: 3 },
  condom_delivery: { page: 'expansion', col: 7, row: 3 },
};

/** 页是否解锁 */
export function pageUnlocked(page: SkillPage, unlocked: Record<string, boolean> | undefined): boolean {
  if (!page.unlockKey) return true;
  return unlocked?.[page.unlockKey] === true;
}

/** 某页的全部节点(按 NODE_META) */
export function nodesOfPage(pageId: string): UpgradeDef[] {
  return UPGRADES.filter(u => NODE_META[u.id]?.page === pageId);
}

/** 节点的页内前置(同页·来自 requires[].upgradeId)。用于连线。 */
export function nodePrereqIds(def: UpgradeDef): string[] {
  const page = NODE_META[def.id]?.page;
  return (def.requires ?? [])
    .map(r => r.upgradeId)
    .filter((id): id is string => !!id && NODE_META[id]?.page === page);
}

export { UPGRADES_BY_ID };
