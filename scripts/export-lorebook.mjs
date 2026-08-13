// 世界书展示导出(批H1) · demoLorebook → 卡工程 state.json 展示条目
// 用途: 玩家翻卡世界书能看到真实内容(社区评估习惯);游戏管线不读它(纯展示·单向导出无双真相源)。
// 用法: node scripts/export-lorebook.mjs   (在 jiutiao-frontend 根运行·写 ../jiutiao/世界书展示/*.txt + state.json)
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
const require = createRequire(import.meta.url);
const jiti = require('../node_modules/.pnpm/jiti@2.7.0/node_modules/jiti/lib/jiti.cjs')(import.meta.url, { interopDefault: true });
const { demoLorebook } = jiti('../src/jiutiao/game/worldbook/demo.ts');

const CARD_DIR = path.resolve('../jiutiao');
const OUT_DIR = path.join(CARD_DIR, '世界书展示');
fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

// 键名→人类可读标题(wb_前缀条目转中文标题;常驻条目用自身key)
function titleOf(e) {
  const k = e.keys[0] ?? e.id;
  if (!k.startsWith('wb_')) return k;
  // 取正文第一行的题头(范式都以"xxx·yyy。"开头)
  const firstLine = (e.content ?? '').split('\n')[0].replace(/[。．].*$/, '').trim();
  return firstLine.slice(0, 40) || k;
}

const state = JSON.parse(fs.readFileSync(path.join(CARD_DIR, 'tavern-cards-state.json'), 'utf8'));
const manifest = {};
let uid = 200, idx = 0;
for (const e of demoLorebook.entries) {
  const title = titleOf(e);
  const safe = title.replace(/[\/:*?"<>|]/g, '_').slice(0, 50);
  const base = String(idx).padStart(3, '0') + '-' + safe;
  fs.writeFileSync(path.join(OUT_DIR, base + '.txt'), e.content ?? '');
  manifest[base] = {
    abstract: '',
    uid: uid++,
    // 展示条目: 全部禁用(enabled=false)——玩家可翻阅内容,酒馆永不注入(游戏走generateRaw白名单本就不读,双保险)
    enabled: false,
    strategy: { type: 'selective', keys: e.keys },
    position: { type: 'before_character_definition', order: 100 + idx },
    display_index: idx,
    keywords: e.keys,
    path: '世界书展示\\' + base + '.txt',
  };
  idx++;
}
state.entryManifest = { 展示: manifest };
fs.writeFileSync(path.join(CARD_DIR, 'tavern-cards-state.json'), JSON.stringify(state, null, 2));
console.log(`exported ${idx} entries → 世界书展示/ + entryManifest.展示`);
