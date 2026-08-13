// v50 冒烟:???手动解禁 / 采购???化五档 / 道场重排 / 地下室全粉金 / 摄影房一钮一tag / 页面整合(纯机制断言)
import { demoEventOptions } from '../src/jiutiao/game/engine/mock-ai';
import { demoLorebook } from '../src/jiutiao/game/worldbook/demo';
import { resolveEvent } from '../src/jiutiao/game/events/machine';
import { deriveEventUnlocked } from '../src/jiutiao/game/engine/unlocked';
import { NODE_META, nodesOfPage, SKILL_PAGES, UPGRADES_BY_ID } from '../src/jiutiao/game/upgrade/skilltree';
import { canUpgrade, applyUpgrade, pendingMysteries, combatBonus, avPlayCap } from '../src/jiutiao/game/upgrade/machine';
import { canShootAv } from '../src/jiutiao/game/av/machine';
import type { AvDefinition } from '../src/jiutiao/game/av/machine';

const A: string[] = []; const ok = (c: boolean, m: string) => A.push((c ? 'PASS ' : 'FAIL ') + m);

async function main() {
  // 1) 范式key全解析(含 wb_buy_toy)
  const wbKeys = new Set<string>();
  for (const e of demoLorebook.entries) for (const k of e.keys) wbKeys.add(k);
  const missing: string[] = [];
  for (const o of Object.values(demoEventOptions)) {
    const refs: (string | undefined)[] = [];
    if (o.sfw) refs.push(o.sfw.worldbookKey);
    if (o.nsfw && o.id !== 'av_custom') refs.push(o.nsfw.worldbookKey);
    if (o.first) refs.push(o.first.paradigm.worldbookKey);
    for (const s of (o.stages ?? [])) { refs.push(s.firstParadigm.worldbookKey); refs.push(s.paradigm.worldbookKey); }
    for (const k of refs) if (k && !wbKeys.has(k)) missing.push(o.id + ':' + k);
  }
  ok(missing.length === 0, 'paradigm-keys ' + (missing.length ? JSON.stringify(missing) : ''));

  // 2) ???手动解禁:条件未满足→不可点;满足→可免费点(不自动);applyUpgrade 不扣钱
  const mDiet = UPGRADES_BY_ID['m_diet'];
  ok(!canUpgrade(mDiet, { money: 0, corruption: 10, upgrades: { life_diet: 1 } }).ok, 'mystery-locked-below-threshold');
  ok(canUpgrade(mDiet, { money: 0, corruption: 45, upgrades: { life_diet: 1 } }).ok, 'mystery-unlockable-when-ready(免费·没钱也行)');
  const after = applyUpgrade({ money: 123, corruption: 45, upgrades: { life_diet: 1 }, unlocked: {} } as never, mDiet);
  ok((after as { money: number }).money === 123 && (after as { unlocked: Record<string, boolean> }).unlocked.toy_diet === true, 'mystery-free-and-applies-key');
  ok(pendingMysteries({ money: 0, corruption: 45, upgrades: { life_diet: 1 } } as never).some(d => d.id === 'm_diet'), 'pendingMysteries-for-reveal');

  // 3) 采购五档:素买→戴玩具(buy_toy)→被带着(buy_escort)→轿车(buy_convoy_x)→送货(condom_courier)
  const ctx = (u: Record<string, boolean>, c = 0) => ({ corruption: c, cognition: '死撑' as const, infamy: 0, thugs: 30, triggeredLedger: { buy_first: true } as Record<string, boolean>, unlocked: u });
  const bc = demoEventOptions.buy_condoms;
  ok(resolveEvent(bc, ctx({}, 99), false).paradigm.worldbookKey === 'wb_buy_condom', 'buy-base-without-keys');
  ok(resolveEvent(bc, ctx({ buy_toy: true }, 25), false).paradigm.worldbookKey === 'wb_buy_toy', 'buy-toy-tier');
  ok(resolveEvent(bc, { ...ctx({ buy_toy: true, buy_escort: true }, 40), triggeredLedger: { buy_first: true, buy_toy_first: true, buy_l2_first: true } }, false).paradigm.worldbookKey === 'wb_buy_condom_l2', 'buy-escort-tier');
  ok(resolveEvent(bc, { ...ctx({ buy_toy: true, buy_escort: true, buy_convoy_x: true }, 55), triggeredLedger: { buy_first: true, buy_toy_first: true, buy_l2_first: true, buy_l3_first: true } }, false).paradigm.worldbookKey === 'wb_buy_condom_l3', 'buy-convoy-tier');
  const u4 = deriveEventUnlocked({ corruption: 60, upgrades: { condom_delivery: 1 }, unlocked: { buy_toy: true, buy_escort: true, buy_convoy_x: true } } as never);
  ok(resolveEvent(bc, { ...ctx(u4, 60), triggeredLedger: { buy_first: true, buy_toy_first: true, buy_l2_first: true, buy_l3_first: true, buy_l4_first: true } }, false).paradigm.worldbookKey === 'wb_buy_condom_l4', 'buy-courier-terminal');

  // 4) 旧多级按钮/旧页全部移除
  for (const gone of ['weapon', 'martial', 'stamina', 'physique', 'gear', 'room_dailytoy', 'av_quota', 'av_duration', 'av_play', 'av_stage', 'av_outfits', 'av_cams', 'buy_convoy'])
    ok(!UPGRADES_BY_ID[gone], 'removed:' + gone);
  ok(!SKILL_PAGES.some(p => p.id === 'dailytoy'), 'dailytoy-page-removed');
  ok(Object.values(UPGRADES_BY_ID).every(d => d.maxLevel === 1 || ['condom_delivery'].includes(d.id)), 'one-button-one-effect(除送货渠道)');

  // 5) 淫乱化并入凛页
  const rinIds = nodesOfPage('rin').map(n => n.id);
  ok(['poster1', 'poster4', 'm_diet', 'm_toilet', 'm_chair'].every(id => rinIds.includes(id)), 'dailytoy-content-on-rin');

  // 6) 地下室全粉金(每个非???节点都有堕落门槛)
  const dg = nodesOfPage('dungeon');
  ok(dg.every(d => d.mystery || d.corruptionRequired != null), 'dungeon-all-hybrid');
  ok(UPGRADES_BY_ID['gear_ginger'].name.includes('粘膜灼烧'), 'ginger-renamed');

  // 7) 道场重排:新单钮存在+combat总量合理+前置正确
  ok(['wpn1', 'wpn2', 'wpn3', 'brawl', 'vigor', 'body_mod', 'm_pearl'].every(id => !!UPGRADES_BY_ID[id]), 'dojo-new-nodes');
  const cb = combatBonus({ wpn1: 1, wpn2: 1, wpn3: 1, brawl: 1, vigor: 1, body_mod: 1 });
  ok(Math.abs(cb - 0.95) < 1e-9, 'combat-total-0.95 got:' + cb);
  ok(UPGRADES_BY_ID['dojo_spar'].requires?.some(r => r.upgradeId === 'brawl') === true, 'spar-requires-brawl');
  ok(UPGRADES_BY_ID['m_cheer1'].requires?.some(r => r.upgradeId === 'brawl') === true, 'cheer-requires-brawl');
  ok(UPGRADES_BY_ID['sex_stamina'].corruptionRequired != null && UPGRADES_BY_ID['lust_beast'].corruptionRequired != null, 'stamina/beast-hybrid');

  // 8) 摄影房一钮一tag: per-tag 校验
  const base: AvDefinition = { theme: '本格性爱', setting: '监禁地下室', plays: ['小穴'], durationHours: 8 };
  const eng = (up: Record<string, number>) => ({ unlocked: { av: true, studio_unlocked: true }, upgrades: up, av: { weeklyQuota: 2, weeklyQuotaMax: 2, durationCap: 48, shotCount: 0, customs: [] } } as never);
  ok(canShootAv(eng({}), base).ok, 'free-setting-ok(监禁地下室)');
  ok(!canShootAv(eng({}), { ...base, setting: '学校' }).ok, 'school-needs-set-btn');
  ok(canShootAv(eng({ av_set_school: 1 }), { ...base, setting: '学校' }).ok, 'school-with-btn-ok');
  ok(!canShootAv(eng({}), { ...base, outfit: '女仆装' }).ok, 'maid-needs-btn');
  ok(canShootAv(eng({ av_out_maid: 1 }), { ...base, outfit: '女仆装' }).ok, 'maid-with-btn-ok');
  ok(!canShootAv(eng({ av_cam3: 1 }), { ...base, cast: '海量(数十人)' }).ok, 'mass-needs-cam8');
  ok(canShootAv(eng({ av_cam8: 1 }), { ...base, cast: '海量(数十人)' }).ok, 'mass-with-cam8-ok');
  ok(avPlayCap({ av_toy1: 1, av_toy2: 1, av_toy3: 1 }) - avPlayCap({}) === 3, 'toys-add-3-playcap');

  // 9) dailytoy 事件键派生(任一淫乱化解禁即开)
  ok(deriveEventUnlocked({ corruption: 0, upgrades: {}, unlocked: { chair_lewd: true } } as never).dailytoy === true, 'dailytoy-derived');

  // 10) META双向完整 + 树拓扑(前置在上·横距≤2)
  const orphan = Object.keys(NODE_META).filter(id => !UPGRADES_BY_ID[id]);
  const nometa = Object.values(UPGRADES_BY_ID).filter(d => !NODE_META[d.id]).map(d => d.id);
  ok(orphan.length === 0 && nometa.length === 0, 'meta-bijective ' + JSON.stringify([orphan, nometa]));
  const bad: string[] = [];
  for (const d of Object.values(UPGRADES_BY_ID)) {
    const m = NODE_META[d.id]; if (!m) continue;
    for (const rq of (d.requires ?? [])) {
      if (!rq.upgradeId) continue;
      const pm = NODE_META[rq.upgradeId]; if (!pm || pm.page !== m.page) continue;
      if (!(m.row > pm.row)) bad.push(rq.upgradeId + '->' + d.id);
      if (Math.abs(m.col - pm.col) > 2) bad.push('FAR:' + rq.upgradeId + '->' + d.id);
    }
  }
  ok(bad.length === 0, 'tree-topology ' + (bad.length ? JSON.stringify(bad) : ''));

  console.log(A.join('\n'));
  console.log(A.every(x => x.startsWith('PASS')) ? 'ALL PASS' : 'HAS FAIL');
}
main();
