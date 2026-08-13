import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import {
  archiveTranscript, listTranscripts, getTranscript, deleteTranscript, clearTranscripts,
  _resetTranscriptDbForTest,
} from './store';
import type { TranscriptInput } from './store';

const input = (over: Partial<TranscriptInput> = {}): TranscriptInput => ({
  day: 1, period: 'night', slot: 0, eventId: 'serve', eventLabel: '供奉',
  presentCount: 18, cognition: '死撑', corruption: 0, renderMode: 'ai_normal',
  isNsfw: true, text: '正文内容', ...over,
});

beforeEach(async () => {
  _resetTranscriptDbForTest();
  await clearTranscripts();
});

describe('正文留档存储', () => {
  it('留档+读取往返', async () => {
    const id = await archiveTranscript(input({ text: '凛被供奉了' }), 1000);
    expect(id).toBeTruthy();
    const got = await getTranscript(id!);
    expect(got!.text).toBe('凛被供奉了');
    expect(got!.eventLabel).toBe('供奉');
  });

  it('空正文跳过不留', async () => {
    expect(await archiveTranscript(input({ text: '' }), 1000)).toBeNull();
    expect(await archiveTranscript(input({ text: '   ' }), 1000)).toBeNull();
    expect(await listTranscripts()).toHaveLength(0);
  });

  it('列表按时间顺序(早→晚)', async () => {
    await archiveTranscript(input({ text: 'A' }), 3000);
    await archiveTranscript(input({ text: 'B' }), 1000);
    await archiveTranscript(input({ text: 'C' }), 2000);
    const list = await listTranscripts();
    expect(list.map(t => t.text)).toEqual(['B', 'C', 'A']);
  });

  it('删除单条不误伤其它', async () => {
    const id1 = await archiveTranscript(input({ text: '1' }), 1000);
    await archiveTranscript(input({ text: '2' }), 2000);
    await deleteTranscript(id1!);
    const list = await listTranscripts();
    expect(list.map(t => t.text)).toEqual(['2']);
  });

  it('清空全部', async () => {
    await archiveTranscript(input(), 1000);
    await archiveTranscript(input(), 2000);
    await clearTranscripts();
    expect(await listTranscripts()).toHaveLength(0);
  });
});
