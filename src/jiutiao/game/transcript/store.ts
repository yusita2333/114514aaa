// 正文留档 · 存储层（Dexie/IndexedDB·独立DB,与存档/底座隔离）
// 默认全自动留档,玩家可删。按时间顺序翻阅(日记式)。

import Dexie, { type Table } from 'dexie';
import type { TranscriptEntry } from './types';

const DB_NAME = 'JiutiaoTranscriptDB';

class TranscriptDatabase extends Dexie {
  transcripts!: Table<TranscriptEntry>;
  constructor() {
    super(DB_NAME);
    this.version(1).stores({
      transcripts: 'id, day, createdAt', // 主键id;day/createdAt建索引便于翻阅排序
    });
  }
}

let dbInstance: TranscriptDatabase | null = null;
export function getTranscriptDb(): TranscriptDatabase {
  if (!dbInstance) dbInstance = new TranscriptDatabase();
  return dbInstance;
}

/** 仅测试用:重置单例 */
export function _resetTranscriptDbForTest() {
  dbInstance = null;
}

/** 留档输入(id/createdAt 由本函数生成) */
export type TranscriptInput = Omit<TranscriptEntry, 'id' | 'createdAt'>;

/** 自动留档一条正文。空正文跳过(不留)。返回 id 或 null(跳过)。 */
export async function archiveTranscript(input: TranscriptInput, now: number): Promise<string | null> {
  if (!input.text || !input.text.trim()) return null;
  const entry: TranscriptEntry = { id: crypto.randomUUID(), createdAt: now, ...input };
  await getTranscriptDb().transcripts.put(entry);
  return entry.id;
}

/** 列出全部留档,按时间顺序(日记式:早→晚) */
export async function listTranscripts(): Promise<TranscriptEntry[]> {
  const all = await getTranscriptDb().transcripts.toArray();
  return all.sort((a, b) => a.createdAt - b.createdAt);
}

/** 读单条 */
export async function getTranscript(id: string): Promise<TranscriptEntry | undefined> {
  return getTranscriptDb().transcripts.get(id);
}

/** 删一条(玩家可删) */
export async function deleteTranscript(id: string): Promise<void> {
  await getTranscriptDb().transcripts.delete(id);
}

/** 清空全部留档 */
export async function clearTranscripts(): Promise<void> {
  await getTranscriptDb().transcripts.clear();
}
