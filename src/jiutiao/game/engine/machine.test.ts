import { describe, it, expect, vi } from 'vitest';
import { settleSlot, sanitizeExtract, fastSummaryText } from './machine';
import type { EngineState, AiPort, SettleOptions } from './types';
import type { EventOption } from '../events/types';

// 统一事件模型 fixture：oral=天生NSFW+首次里程碑(权重10)；serve=天生NSFW无里程碑(日常态)
const eventOptions: Record<string, EventOption> = {
  serve: { id: 'serve', label: '供奉', period: 'night', shape: 'born_nsfw', nsfw: { worldbookKey: 'wb_serve' } },
  oral: {
    id: 'oral', label: '口交', period: 'night', shape: 'born_nsfw',
    nsfw: { worldbookKey: 'wb_oral' },
    first: { ledgerKey: 'oral_first', paradigm: { worldbookKey: 'wb_oral_first' }, corruptionWeight: 10 },
  },
  attack: { id: 'attack', label: '攻打据点', period: 'day', shape: 'born_sfw', sfw: { worldbookKey: 'wb_attack' }, martialReward: 5 },
  av_shoot: { id: 'av_shoot', label: '拍AV', period: 'day', shape: 'born_nsfw', nsfw: { worldbookKey: 'wb_av' }, infamyReward: 8 },
};

function baseState(): EngineState {
  return {
    triggeredSpecials: {}, unlocked: {},
    corruption: 0, cognition: '死撑', claimedGates: {},
    money: 8000, thugTotal: 30, garrison: 0, loyalty: 60,
    condomStock: 480, desire: 0, desireCapacity: 60, perSlotThroughput: 6,
    infamy: 0, martialPrestige: 0,
    recruitQuota: 0, presentCount: 18, isDangerousPeriod: false, servedThisNight: 0,
  };
}

function mockAi(prose = 'AI扩写的正文', extract: Record<string, unknown> = {}, continuity?: string): AiPort {
  return {
    expand: vi.fn(async () => ({ text: prose, continuity })),
    extract: vi.fn(async () => extract),
  };
}

function opts(ai: AiPort, over: Partial<SettleOptions> = {}): SettleOptions {
  return {
    eventOptions, fastForward: false, ai,
    summaryTemplates: { serve: '大小姐给{n}人侍奉了', oral: '大小姐给{n}人口交了' },
    extractBounds: { presentCount: [0, 2000] },
    ...over,
  };
}

describe('sanitizeExtract 防胡诌', () => {
  it('保留范围内数值', () => {
    const r = sanitizeExtract({ presentCount: 36 }, { presentCount: [0, 2000] });
    expect(r.clean.presentCount).toBe(36);
    expect(r.rejected).toEqual([]);
  });
  it('拒掉越界离谱值', () => {
    const r = sanitizeExtract({ presentCount: 999999 }, { presentCount: [0, 2000] });
    expect(r.clean.presentCount).toBeUndefined();
    expect(r.rejected).toContain('presentCount');
  });
  it('拒掉非数值', () => {
    const r = sanitizeExtract({ presentCount: 'abc' as unknown as number });
    expect(r.rejected).toContain('presentCount');
  });
  it('无bounds时只过滤非数值,不卡范围(宽松)', () => {
    const r = sanitizeExtract({ x: 50000 });
    expect(r.clean.x).toBe(50000);
  });
});

describe('fastSummaryText 快进总结词填充', () => {
  it('占位替换', () => {
    expect(fastSummaryText('大小姐被{n}人插入了', { n: 36 })).toBe('大小姐被36人插入了');
    expect(fastSummaryText('大小姐给{n}人侍奉了', { n: 18 })).toBe('大小姐给18人侍奉了');
  });
  it('缺失占位保留{key}', () => {
    expect(fastSummaryText('在场{n}人,{missing}', { n: 5 })).toBe('在场5人,{missing}');
  });
});

describe('settleSlot 首次特殊事件', () => {
  it('调AI全扩写+加堕落度+写账本+发奖励闸门', async () => {
    const ai = mockAi('凛第一次为打手口交...', { presentCount: 20 });
    const r = await settleSlot(baseState(), { optionId: 'oral' }, opts(ai));
    expect(r.events.renderMode).toBe('ai_full');
    expect(r.events.isFirstSpecial).toBe(true);
    expect(r.events.corruptionGain).toBe(10);
    expect(r.state.corruption).toBe(10);
    // 堕落度10→触发 gate_10(给钱5000+打手20)
    expect(r.events.firedGateIds).toContain('gate_10');
    expect(r.state.money).toBe(8000 + 5000);
    expect(r.state.thugTotal).toBe(30 + 20);
    // 账本已记
    expect(r.state.triggeredSpecials['oral_first']).toBe(true);
    // extract 数值已应用
    expect(r.state.presentCount).toBe(20);
    expect(ai.expand).toHaveBeenCalledOnce();
    expect(ai.extract).toHaveBeenCalledOnce();
  });

  it('第二次同事件→退化略写,不再加堕落', async () => {
    const ai = mockAi('又一次口交', { presentCount: 18 });
    const s1 = await settleSlot(baseState(), { optionId: 'oral' }, opts(ai));
    const s2 = await settleSlot(s1.state, { optionId: 'oral' }, opts(ai));
    expect(s2.events.isFirstSpecial).toBe(false);
    expect(s2.events.renderMode).toBe('ai_normal'); // NSFW非首次=正常生成(不略写)
    expect(s2.state.corruption).toBe(10); // 没再加
    expect(s2.events.firedGateIds).toEqual([]);
  });
});

describe('settleSlot 快进模式', () => {
  it('日常+快进:不调AI,出总结词,无堕落', async () => {
    const ai = mockAi();
    const r = await settleSlot(baseState(), { optionId: 'serve' }, opts(ai, { fastForward: true }));
    expect(r.events.renderMode).toBe('fast_summary');
    expect(r.resultText).toBe('大小姐给18人侍奉了'); // presentCount=18
    expect(ai.expand).not.toHaveBeenCalled();
    expect(ai.extract).not.toHaveBeenCalled();
  });

  it('首次特殊+快进:仍调AI(里程碑不跳过)', async () => {
    const ai = mockAi('第一次口交的完整描写', { presentCount: 18 });
    const r = await settleSlot(baseState(), { optionId: 'oral' }, opts(ai, { fastForward: true }));
    expect(r.events.renderMode).toBe('ai_full'); // 首次特殊压过快进
    expect(ai.expand).toHaveBeenCalledOnce();
    expect(r.state.corruption).toBe(10);
  });
});

describe('settleSlot 威望进账', () => {
  it('martialReward→极道威望进账(events+累计+今日流量)', async () => {
    const ai = mockAi('攻打据点的描写');
    const r = await settleSlot(baseState(), { optionId: 'attack' }, opts(ai));
    expect(r.events.martialGain).toBe(5);
    expect(r.state.martialPrestige).toBe(5);
    expect(r.state.martialGainToday).toBe(5);
  });
  it('infamyReward受AV门控:未解锁不进账', async () => {
    const ai = mockAi();
    const r = await settleSlot(baseState(), { optionId: 'av_shoot' }, opts(ai));
    expect(r.events.infamyGain).toBe(0);
    expect(r.state.infamy).toBe(0);
  });
  it('AV解锁后infamyReward进账', async () => {
    const ai = mockAi();
    const r = await settleSlot({ ...baseState(), unlocked: { av: true } }, { optionId: 'av_shoot' }, opts(ai));
    expect(r.events.infamyGain).toBe(8);
    expect(r.state.infamy).toBe(8);
  });
});

describe('settleSlot 延续摘要透传', () => {
  it('AI吐的continuity进events;无则undefined', async () => {
    const withC = mockAi('正文', { presentCount: 18 }, '对弥生道首次屈辱');
    const r1 = await settleSlot(baseState(), { optionId: 'serve' }, opts(withC));
    expect(r1.events.continuity).toBe('对弥生道首次屈辱');
    const noC = mockAi('正文', { presentCount: 18 });
    const r2 = await settleSlot(baseState(), { optionId: 'serve' }, opts(noC));
    expect(r2.events.continuity).toBeUndefined();
  });
});

describe('settleSlot 防胡诌集成', () => {
  it('AI抓的离谱在场人数被拒,不污染state', async () => {
    const ai = mockAi('正文', { presentCount: 999999 });
    const r = await settleSlot(baseState(), { optionId: 'serve' }, opts(ai));
    expect(r.events.rejectedFields).toContain('presentCount');
    expect(r.state.presentCount).toBe(18); // 保留旧值,没被离谱值覆盖
  });
});

describe('settleSlot A4 日常侵蚀接入', () => {
  const a4Event: EventOption = {
    id: 'protection_a4', label: '收保护费', period: 'day', shape: 'born_nsfw',
    nsfw: { worldbookKey: 'wb_protect_nsfw' },
    a4: { martialBase: 3, transferRatio: 0.4, loyaltyOnFail: 2, developsPart: '小穴' },
  };

  it('NSFW 态 + a4 标记 + 隐瞒成功 → 极道威望进账 + 推进部位', async () => {
    const ai = mockAi();
    const opt: SettleOptions = {
      ...opts(ai), eventOptions: { protection_a4: a4Event },
      rng: () => 0,  // roll=0 → 必成功
    };
    const r = await settleSlot(baseState(), { optionId: 'protection_a4' }, opt);
    expect(r.events.a4?.concealed).toBe(true);
    expect(r.events.a4?.martialGained).toBe(3);
    expect(r.state.martialPrestige).toBe(3);
    expect(r.state.martialGainToday).toBe(3);
    expect(r.state.bodyDevelopment?.小穴).toBe(2); // 默认1→推进2
    expect(r.events.a4?.developedPart).toBe('小穴');
    expect(r.events.a4?.developedTo).toBe(2);
  });

  it('NSFW 态 + a4 标记 + 隐瞒失败 → 极道 transfer 淫名 + 忠诚 +', async () => {
    const ai = mockAi();
    const opt: SettleOptions = {
      ...opts(ai), eventOptions: { protection_a4: a4Event },
      rng: () => 1,  // roll=1 → 必失败
    };
    const r = await settleSlot({ ...baseState(), martialPrestige: 100, loyalty: 60 }, { optionId: 'protection_a4' }, opt);
    expect(r.events.a4?.concealed).toBe(false);
    expect(r.events.a4?.martialTransferred).toBe(1); // round(3 * 0.4) = 1
    expect(r.state.martialPrestige).toBe(99);
    expect(r.state.infamy).toBe(1);
    expect(r.state.loyalty).toBe(62);
    expect(r.events.a4?.loyaltyDelta).toBe(2);
  });

  it('未标 a4 的事件 → events.a4 undefined,不触发判定', async () => {
    const ai = mockAi();
    const r = await settleSlot(baseState(), { optionId: 'serve' }, opts(ai));
    expect(r.events.a4).toBeUndefined();
  });

  it('rng 缺省 → 默认 0.5(中性)', async () => {
    const ai = mockAi();
    // martialPrestige=0 → concealProbability=0.5,roll=0.5 → 0.5 < 0.5 false → 失败
    const opt: SettleOptions = { ...opts(ai), eventOptions: { protection_a4: a4Event } };
    const r = await settleSlot(baseState(), { optionId: 'protection_a4' }, opt);
    expect(r.events.a4?.concealed).toBe(false);
  });
});
