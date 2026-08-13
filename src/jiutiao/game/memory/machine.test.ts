import { describe, it, expect } from 'vitest';
import {
  appendLog, appendContinuity, renderLogEntry, renderRecentLog, renderStoryThread,
  buildMemoryContext, needsContinuitySummary, RECENT_LOG_WINDOW,
} from './machine';
import type { LogEntry, ContinuityNote } from './machine';

const entry = (over: Partial<LogEntry> = {}): LogEntry => ({
  day: 1, period: 'night', slot: 0, eventId: 'serve', label: '供奉',
  presentCount: 18, renderMode: 'ai_normal', ...over,
});

describe('结构化日志', () => {
  it('appendLog 追加不改原', () => {
    const a: LogEntry[] = [];
    const b = appendLog(a, entry());
    expect(b).toHaveLength(1);
    expect(a).toHaveLength(0);
  });
  it('renderLogEntry 格式', () => {
    expect(renderLogEntry(entry({ day: 12, period: 'night', slot: 2, label: '供奉', presentCount: 80 })))
      .toBe('第12天夜#2 · 供奉 · 在场80人');
    expect(renderLogEntry(entry({ tags: ['首次'] }))).toContain('[首次]');
  });
  it('renderRecentLog 滑动窗口只取最近N条', () => {
    const log = Array.from({ length: 20 }, (_, i) => entry({ slot: i }));
    const text = renderRecentLog(log, RECENT_LOG_WINDOW);
    expect(text.split('\n')).toHaveLength(RECENT_LOG_WINDOW); // 12
    expect(text).toContain('#19'); // 最后一条在
    expect(text).not.toContain('#7'); // 窗口外不在(20-12=8起)
  });
  it('空日志→空串', () => {
    expect(renderRecentLog(undefined)).toBe('');
  });
});

describe('延续摘要(故事脉络)', () => {
  it('appendContinuity + renderStoryThread', () => {
    let notes: ContinuityNote[] = [];
    notes = appendContinuity(notes, { day: 8, kind: 'entity', text: '对弥生道外围首次身体贿赂屈辱' });
    notes = appendContinuity(notes, { day: 15, kind: 'turning', text: '认知防线→崩溃' });
    const text = renderStoryThread(notes);
    expect(text).toBe('第8天:对弥生道外围首次身体贿赂屈辱\n第15天:认知防线→崩溃');
  });
});

describe('buildMemoryContext', () => {
  it('从状态切片组合', () => {
    const mc = buildMemoryContext({
      narrativeLog: [entry({ day: 22, slot: 0, label: '供奉', presentCount: 80 })],
      continuityNotes: [{ day: 8, kind: 'entity', text: '首次身体贿赂' }],
    });
    expect(mc.recentLog).toContain('第22天夜#0');
    expect(mc.storyThread).toContain('首次身体贿赂');
  });
});

describe('needsContinuitySummary', () => {
  it('事件标记 || 认知跨档', () => {
    expect(needsContinuitySummary(true, false)).toBe(true);
    expect(needsContinuitySummary(false, true)).toBe(true);
    expect(needsContinuitySummary(false, false)).toBe(false);
    expect(needsContinuitySummary(undefined, false)).toBe(false);
  });
});
