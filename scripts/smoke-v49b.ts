// v49b 冒烟:地下室一刑具一升级 / 旧档兼容 / AV三tag门槛(纯机制断言)
import { demoEventOptions } from '../src/jiutiao/game/engine/mock-ai';
import { demoLorebook } from '../src/jiutiao/game/worldbook/demo';
import { deriveEventUnlocked } from '../src/jiutiao/game/engine/unlocked';
import { buildMenu } from '../src/jiutiao/game/events/machine';
import { UPGRADES_BY_ID, NODE_META } from '../src/jiutiao/game/upgrade/skilltree';
import { canShootAv, buildAvPrompt } from '../src/jiutiao/game/av/machine';
import type { AvDefinition } from '../src/jiutiao/game/av/machine';

const A: string[] = []; const ok = (c: boolean, m: string) => A.push((c ? 'PASS ' : 'FAIL ') + m);

async function main() {
  // 1) 新装置范式key解析
  const wbKeys = new Set<string>();
  for (const e of demoLorebook.entries) for (const k of e.keys) wbKeys.add(k);
  for (const k of ['wb_violent_cane', 'wb_violent_cane_first', 'wb_violent_latex', 'wb_violent_ginger', 'wb_violent_wax'])
    ok(wbKeys.has(k), 'wbkey ' + k);

  // 2) 装置门槛:一刑具一升级(gear键 AND 堕落闸门)
  const mkEng = (up: Record<string, number>, c: number) => ({ corruption: c, upgrades: up, unlocked: { basement: true }, regions: {}, pregnant: false } as never);
  const ctxOf = (up: Record<string, number>, c: number) => ({ corruption: c, cognition: '死撑' as const, infamy: 0, thugs: 30, triggeredLedger: {}, unlocked: deriveEventUnlocked(mkEng(up, c)) });
  const nightMenu = (up: Record<string, number>, c: number) => buildMenu(Object.values(demoEventOptions), ctxOf(up, c), 'night').map(e => e.option.id);
  ok(!nightMenu({}, 99).includes('serve_violent_hang'), 'no-gear-no-hang(堕99也不行)');
  ok(nightMenu({ gear_hang: 1 }, 55).includes('serve_violent_hang'), 'gear_hang+masochism→hang可选');
  ok(!nightMenu({ gear_hang: 1 }, 30).includes('serve_violent_hang'), 'gear_hang但堕30→仍锁(双闸门)');
  ok(nightMenu({ gear_cane: 1 }, 55).includes('serve_violent_cane'), 'gear_cane→杖笞可选');
  ok(nightMenu({ gear_ginger: 1 }, 75).includes('serve_violent_ginger'), 'gear_ginger+deep→姜罚可选');
  ok(!nightMenu({ gear_ginger: 1 }, 55).includes('serve_violent_ginger'), '姜罚需deep(堕70):55不行');
  // 3) 旧档兼容:老 dungeon_gear → 四旧刑具全解锁
  const legacy = nightMenu({ dungeon_gear: 1 }, 99);
  ok(['serve_violent_hang', 'serve_violent_horse', 'serve_violent_donkey', 'serve_violent_water'].every(id => legacy.includes(id)), 'legacy-dungeon_gear→四旧装置全可选');

  // 4) AV三tag门槛
  const base: AvDefinition = { theme: '本格性爱', setting: '学校', plays: ['小穴'], durationHours: 8 };
  const eng = (up: Record<string, number>) => ({ unlocked: { av: true, studio_unlocked: true }, upgrades: up, av: { weeklyQuota: 2, weeklyQuotaMax: 2, durationCap: 48, shotCount: 0, customs: [] } } as never);
  ok(!canShootAv(eng({}), { ...base, setting: '电车车厢' }).ok, '棚内场景无布景棚→拒');
  ok(canShootAv(eng({ av_stage: 1 }), { ...base, setting: '电车车厢' }).ok, '布景棚→电车场景可拍');
  ok(!canShootAv(eng({}), { ...base, outfit: '女仆装' }).ok, '衣装无衣装库→拒');
  ok(canShootAv(eng({ av_outfits: 1 }), { ...base, outfit: '女仆装' }).ok, '衣装库→女仆装可拍');
  ok(!canShootAv(eng({}), { ...base, cast: '海量(数十人)' }).ok, '海量无多机位→拒');
  ok(canShootAv(eng({}), { ...base, cast: '小队(5-6)' }).ok, '小队不需多机位');
  ok(canShootAv(eng({ av_cams: 1 }), { ...base, cast: '海量(数十人)' }).ok, '多机位→海量可拍');
  const p = buildAvPrompt({ ...base, outfit: '婚纱', cast: '小队(5-6)' });
  ok(p.includes('婚纱') && p.includes('小队'), 'prompt含衣装与规模');

  // 5) 新升级节点都有NODE_META
  for (const id of ['gear_hang', 'gear_horse', 'gear_donkey', 'gear_water', 'gear_cane', 'gear_latex', 'gear_ginger', 'gear_wax', 'av_stage', 'av_outfits', 'av_cams'])
    ok(!!NODE_META[id] && !!UPGRADES_BY_ID[id], 'meta+def ' + id);

  console.log(A.join('\n'));
  console.log(A.every(x => x.startsWith('PASS')) ? 'ALL PASS' : 'HAS FAIL');
}
main();
