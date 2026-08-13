// 游戏存档 · 存储层（Dexie/IndexedDB）
// 独立数据库 JiutiaoDB，与底座 SillyTavernWebDB 隔离。
// 数据安全铁律：读档不破坏现有存档；删除前要确认；存档失败抛错不静默。

import Dexie, { type Table } from 'dexie';
import type { RunnerState } from '../engine/day-runner';
import type { GameSave, SaveSummary } from './types';
import { SAVE_SCHEMA_VERSION } from './types';

const DB_NAME = 'JiutiaoDB';

class JiutiaoDatabase extends Dexie {
  saves!: Table<GameSave>;
  constructor() {
    super(DB_NAME);
    this.version(1).stores({
      // 主键 id；slot/updatedAt 建索引便于查自动存档与排序
      saves: 'id, slot, updatedAt',
    });
  }
}

let dbInstance: JiutiaoDatabase | null = null;
export function getSaveDb(): JiutiaoDatabase {
  if (!dbInstance) dbInstance = new JiutiaoDatabase();
  return dbInstance;
}

/** 仅测试用：重置单例（配合 fake-indexeddb） */
export function _resetSaveDbForTest() {
  dbInstance = null;
}

/** 从 RunnerState 构造存档摘要 */
export function buildSummary(state: RunnerState): SaveSummary {
  return {
    dayNumber: state.day.dayNumber,
    phase: state.day.phase,
    corruption: state.engine.corruption,
    cognition: state.engine.cognition,
    money: state.engine.money,
    thugTotal: state.engine.thugTotal,
  };
}

/** 深拷贝快照（防止存档后引用被后续修改污染） */
function snapshot<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

export interface SaveInput {
  id?: string;            // 不传=新建；传=覆盖该存档
  slot: number | 'auto';
  name: string;
  state: RunnerState;
  fastForward: boolean;
  now: number;            // 时间戳由调用方传入（避免内部依赖时钟，便于测试）
}

/** 写入/覆盖一个存档。返回存档 id。 */
export async function putSave(input: SaveInput): Promise<string> {
  const db = getSaveDb();
  const id = input.id ?? crypto.randomUUID();
  const existing = input.id ? await db.saves.get(input.id) : undefined;
  const save: GameSave = {
    id,
    slot: input.slot,
    name: input.name,
    createdAt: existing?.createdAt ?? input.now,
    updatedAt: input.now,
    state: snapshot(input.state),
    fastForward: input.fastForward,
    summary: buildSummary(input.state),
    schemaVersion: SAVE_SCHEMA_VERSION,
  };
  await db.saves.put(save);
  return id;
}

/** 自动存档：固定占用 slot='auto' 的单一存档（覆盖式）。 */
export async function autosave(state: RunnerState, fastForward: boolean, now: number): Promise<void> {
  const db = getSaveDb();
  const existing = await db.saves.where('slot').equals('auto').first();
  await putSave({
    id: existing?.id, slot: 'auto', name: '自动存档', state, fastForward, now,
  });
}

/** 列出所有存档（按更新时间倒序：最新在前） */
export async function listSaves(): Promise<GameSave[]> {
  const all = await getSaveDb().saves.toArray();
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

/** 读取单个存档 */
export async function getSave(id: string): Promise<GameSave | undefined> {
  return getSaveDb().saves.get(id);
}

/** 删除存档（调用方负责二次确认） */
export async function deleteSave(id: string): Promise<void> {
  await getSaveDb().saves.delete(id);
}
