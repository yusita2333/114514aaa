// v49 冒烟:分档双闸门 / 叙事人数与结算同源 / prompt注入 / 树拓扑(纯机制断言)
import { demoEventOptions, demoSummaryTemplates, createMockAi } from '../src/jiutiao/game/engine/mock-ai';
import { demoLorebook } from '../src/jiutiao/game/worldbook/demo';
import { resolveEvent } from '../src/jiutiao/game/events/machine';
import { settleSlot } from '../src/jiutiao/game/engine/machine';
import { deriveEventUnlocked } from '../src/jiutiao/game/engine/unlocked';
import { NODE_META, nodesOfPage } from '../src/jiutiao/game/upgrade/skilltree';
import { UPGRADES_BY_ID } from '../src/jiutiao/game/upgrade/machine';
import { buildGamePrompt } from '../src/jiutiao/game/engine/prompt';

const A: string[] = []; const ok = (c: boolean, m: string) => A.push((c ? 'PASS ' : 'FAIL ') + m);

async function main() {
  // 1) 每个事件引用的 worldbookKey 都能在 lorebook 里解析
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
  ok(missing.length === 0, 'paradigm-keys-resolve ' + (missing.length ? JSON.stringify(missing) : ''));

  // 2) buy_condoms 分档:阶段激活 = 升级键 AND 堕落度(双闸门)
  const ctx = (u: Record<string, boolean>, c = 0) => ({ corruption: c, cognition: '死撑' as const, infamy: 0, thugs: 30, triggeredLedger: {} as Record<string, boolean>, unlocked: u });
  const bc = demoEventOptions.buy_condoms;
  ok(resolveEvent(bc, ctx({}, 0), false).paradigm.worldbookKey === 'wb_buy_condom_first', 'tier1-first-at-start');
  const done1 = { buy_first: true };
  ok(resolveEvent(bc, { ...ctx({}, 99), triggeredLedger: done1 }, false).paradigm.worldbookKey === 'wb_buy_condom', 'no-upgrade-key-stays-tier1');
  ok(resolveEvent(bc, { ...ctx({ buy_wholesale: true }, 25), triggeredLedger: done1 }, false).paradigm.worldbookKey === 'wb_buy_condom_l2', 'key+corruption-advances-tier2');
  ok(resolveEvent(bc, { ...ctx({ buy_wholesale: true }, 15), triggeredLedger: done1 }, false).paradigm.worldbookKey === 'wb_buy_condom', 'low-corruption-stays-tier1');
  const done4 = { buy_first: true, buy_l2_first: true, buy_l3_first: true, buy_l4_first: true };
  ok(resolveEvent(bc, { ...ctx({ buy_wholesale: true, buy_convoy: true, condom_courier: true }, 60), triggeredLedger: done4 }, false).paradigm.worldbookKey === 'wb_buy_condom_l4', 'all-keys-tier4-terminal');

  // 3) 采购升级(purchaseMult效果不写unlocked) → deriveEventUnlocked 派生事件键
  const u = deriveEventUnlocked({ corruption: 0, upgrades: { buy_wholesale: 1, condom_delivery: 1 }, unlocked: {} } as never);
  ok(u.buy_wholesale === true && u.condom_courier === true && !u.buy_convoy, 'derive-purchase-keys');

  // 4) 叙事人数与结算同源:快进模板 {n} = min(在场,吞吐×倍率),不再用在场人数
  const eng = { triggeredSpecials: { serve_vaginal_first: true }, unlocked: {}, corruption: 30, cognition: '死撑', claimedGates: {}, money: 0, thugTotal: 300, garrison: 0, loyalty: 70, loyaltyMartial: 35, loyaltyInfamy: 35, condomStock: 100, desire: 100, desireCapacity: 400, desireAddedThisMorning: 0, perSlotThroughput: 6, infamy: 0, martialPrestige: 0, recruitQuota: 0, recruitQuotaMax: 0, presentCount: 200, isDangerousPeriod: false, servedThisNight: 0 };
  const r1 = await settleSlot(eng as never, { optionId: 'serve_vaginal' }, { eventOptions: demoEventOptions, fastForward: true, ai: createMockAi(), summaryTemplates: demoSummaryTemplates });
  ok(r1.resultText.includes('6人') && !r1.resultText.includes('200'), 'summary-n-equals-throughput got:' + r1.resultText);
  const r2 = await settleSlot({ ...eng, perSlotThroughput: 60 } as never, { optionId: 'serve_vaginal' }, { eventOptions: demoEventOptions, fastForward: true, ai: createMockAi(), summaryTemplates: demoSummaryTemplates, serveMult: 1.5 });
  ok(r2.resultText.includes('90人'), 'summary-n-applies-mult got:' + r2.resultText);

  // 5) prompt 注入:结算人数行 + 群像匿名/禁单人化铁律行存在
  const res = resolveEvent(demoEventOptions.serve_vaginal, { ...ctx({}, 30), triggeredLedger: { serve_vaginal_first: true } }, false);
  const msgs = buildGamePrompt({ resolution: res, attitude: '死撑', choice: { optionId: 'serve_vaginal' }, state: eng as never, serveCount: 6 } as never, { lorebook: demoLorebook, preset: { settings: {} } as never });
  const up = msgs[1].content;
  ok(up.includes('处理 6 名打手'), 'prompt-has-settled-count');
  ok(up.includes('绝不给打手起名字') && up.includes('多人铁律'), 'prompt-has-crowd-rule');

  // 6) 布局归位:宅邸节点在 house 页
  ok(nodesOfPage('house').some(n => n.id === 'annex_estate') && nodesOfPage('house').some(n => n.id === 'm_ancestor'), 'estate-nodes-on-house-page');
  ok(!nodesOfPage('expansion').some(n => ['annex_estate', 'annex_shrine', 'm_ancestor'].includes(n.id)), 'expansion-page-clean');
  const orphan = Object.keys(NODE_META).filter(id => !UPGRADES_BY_ID[id]);
  const nometa = Object.values(UPGRADES_BY_ID).filter(d => !NODE_META[d.id]).map(d => d.id);
  ok(orphan.length === 0 && nometa.length === 0, 'meta-bijective ' + JSON.stringify([orphan, nometa]));

  // 7) 树拓扑:同页前置连线一律向下(row 递增)且横向距离≤2列(消灭横穿全屏的线)
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
  ok(bad.length === 0, 'tree-topology-downward ' + (bad.length ? JSON.stringify(bad) : ''));

  console.log(A.join('\n'));
  console.log(A.every(x => x.startsWith('PASS')) ? 'ALL PASS' : 'HAS FAIL');
}
main();
