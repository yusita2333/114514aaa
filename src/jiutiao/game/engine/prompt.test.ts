import { describe, it, expect } from 'vitest';
import { buildGamePrompt, presetSampling } from './prompt';
import { demoLorebook, demoPreset } from '../worldbook/demo';
import type { ExpandRequest } from './types';
import type { EventResolution } from '../events/types';

function resolution(over: Partial<EventResolution> = {}): EventResolution {
  return {
    option: { id: 'serve_oral', label: '口交侍奉', period: 'night', shape: 'born_nsfw', nsfw: { worldbookKey: 'wb_serve_oral' } },
    face: 'nsfw', isFirstMilestone: false, corruptionGain: 0,
    paradigm: { worldbookKey: 'wb_serve_oral' }, renderMode: 'ai_normal', isNsfw: true,
    ...over,
  };
}

function req(over: Partial<ExpandRequest> = {}): ExpandRequest {
  return {
    resolution: resolution(),
    attitude: '死撑',
    choice: { optionId: 'serve' },
    state: {
      triggeredSpecials: {}, unlocked: {}, corruption: 0, cognition: '死撑', claimedGates: {},
      money: 8000, thugTotal: 30, garrison: 0, loyalty: 60, condomStock: 480, desire: 0,
      desireCapacity: 60, perSlotThroughput: 6, infamy: 0, martialPrestige: 0,
      recruitQuota: 0, presentCount: 18, isDangerousPeriod: false, servedThisNight: 0,
    },
    ...over,
  };
}

describe('buildGamePrompt', () => {
  it('system 注入预设main/JB + 常驻世界书', () => {
    const [sys] = buildGamePrompt(req(), { lorebook: demoLorebook, preset: demoPreset });
    expect(sys.role).toBe('system');
    expect(sys.content).toContain('叙事AI');      // 预设main
    expect(sys.content).toContain('直接、露骨');    // 真实JB内容(3-5b)
    expect(sys.content).toContain('体验内核');     // 真实C1美学纲领(3-5b)
    expect(sys.content).toContain('打手态度');     // 真实C5打手态度(3-5b)
  });

  it('user 按key注入范式正文 + 态度 + 场景 + 规格', () => {
    const [, user] = buildGamePrompt(req(), { lorebook: demoLorebook, preset: demoPreset });
    expect(user.content).toContain('口交侍奉'); // getParadigmByKey(wb_serve_oral) 真实范式内容(3-5d)
    expect(user.content).toContain('死撑档');     // 态度层(四档·3-5a)
    expect(user.content).toContain('在场约 18 人'); // 场景
    expect(user.content).toContain('正常生成');   // ai_normal 规格
  });

  it('世界书无此范式key→回落元数据提示', () => {
    const r = req({ resolution: resolution({ paradigm: { worldbookKey: 'wb_missing' } }) });
    const [, user] = buildGamePrompt(r, { lorebook: demoLorebook, preset: demoPreset });
    expect(user.content).toContain('世界书未写');
  });

  it('inlinePrompt(AV定制)直接用,不查世界书', () => {
    const r = req({ resolution: resolution({ paradigm: { worldbookKey: 'wb_x', inlinePrompt: '定制AV内容XYZ' } }) });
    const [, user] = buildGamePrompt(r, { lorebook: demoLorebook, preset: demoPreset });
    expect(user.content).toContain('定制AV内容XYZ');
  });

  it('记忆层注入故事脉络+近期发生', () => {
    const [sys] = buildGamePrompt(req(), {
      lorebook: demoLorebook, preset: demoPreset,
      memory: { storyThread: '第8天:首次身体贿赂屈辱', recentLog: '第22天夜·供奉·80人' },
    });
    expect(sys.content).toContain('故事脉络');
    expect(sys.content).toContain('首次身体贿赂屈辱');
    expect(sys.content).toContain('近期发生');
  });

  it('needsContinuity→要求输出<continuity>', () => {
    const [, u1] = buildGamePrompt(req(), { lorebook: demoLorebook, preset: demoPreset, needsContinuity: true });
    expect(u1.content).toContain('<continuity>');
    const [, u2] = buildGamePrompt(req(), { lorebook: demoLorebook, preset: demoPreset });
    expect(u2.content).not.toContain('<continuity>');
  });
});

describe('presetSampling', () => {
  it('从预设取采样参数', () => {
    expect(presetSampling(demoPreset)).toEqual({ temperature: 0.9, max_tokens: 2048, top_p: 1 });
  });
});
