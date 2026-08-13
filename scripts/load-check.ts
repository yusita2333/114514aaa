// 模块加载期异常复现:按依赖顺序装载全部 game 模块 + store(捕获 top-level throw)
async function tryLoad(name: string, fn: () => Promise<unknown>) {
  try { await fn(); console.log('OK  ' + name); }
  catch (e) { console.log('BOOM ' + name + ' :: ' + (e as Error)?.stack?.split('\n').slice(0, 4).join(' | ')); }
}
async function main() {
  await tryLoad('upgrade/machine', () => import('../src/jiutiao/game/upgrade/machine'));
  await tryLoad('upgrade/skilltree', () => import('../src/jiutiao/game/upgrade/skilltree'));
  await tryLoad('av/machine', () => import('../src/jiutiao/game/av/machine'));
  await tryLoad('engine/mock-ai', () => import('../src/jiutiao/game/engine/mock-ai'));
  await tryLoad('engine/unlocked', () => import('../src/jiutiao/game/engine/unlocked'));
  await tryLoad('engine/day-runner', () => import('../src/jiutiao/game/engine/day-runner'));
  await tryLoad('engine/settlement', () => import('../src/jiutiao/game/engine/settlement'));
  await tryLoad('worldbook/demo', () => import('../src/jiutiao/game/worldbook/demo'));
  await tryLoad('runner-store', () => import('../src/jiutiao/界面/状态栏/runner-store'));
}
main();
