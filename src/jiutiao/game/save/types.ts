// 游戏存档 · 类型定义
// 独立于底座酒馆DB，专为九条会游戏状态设计。存档=RunnerState快照+元数据。

import type { RunnerState } from '../engine/day-runner';

/** 存档摘要（列表展示用，不必加载完整状态即可看） */
export interface SaveSummary {
  dayNumber: number;
  phase: string;
  corruption: number;
  cognition: string;
  money: number;
  thugTotal: number;
}

/** 一个存档 */
export interface GameSave {
  id: string;
  /** 槽位：数字槽 或 'auto'(自动存档) */
  slot: number | 'auto';
  name: string;
  createdAt: number;
  updatedAt: number;
  /** 游戏状态快照（DayState+EngineState，均为可序列化纯数据） */
  state: RunnerState;
  fastForward: boolean;
  /** 摘要（冗余存，免加载即可展示） */
  summary: SaveSummary;
  /** 存档格式版本（便于将来迁移） */
  schemaVersion: number;
}

export const SAVE_SCHEMA_VERSION = 1;
