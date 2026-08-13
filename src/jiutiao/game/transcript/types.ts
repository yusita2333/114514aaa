// 正文留档 · 类型（桶3去处·记忆层设计 §6）
// AI 补出的全文正文(maintext)存这,给玩家翻阅画廊/日记。独立IndexedDB,与游戏存档分开,不进AI记忆。

export interface TranscriptEntry {
  id: string;
  createdAt: number;
  // —— 元数据(便于画廊筛选/上下文)——
  day: number;
  period: 'day' | 'night';
  slot: number;
  eventId: string;
  eventLabel: string;
  presentCount?: number;
  cognition: string;   // 当时认知防线
  corruption: number;  // 当时堕落度
  renderMode: string;
  isNsfw: boolean;
  // —— 正文 ——
  text: string;        // AI maintext(或快进总结词)
}
