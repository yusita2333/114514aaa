// Prompt 组装 · AI1扩写(buildGamePrompt) / AI2抓数值(buildExtractMessages)
// buildGamePrompt = 代码驱动组装器(prompt组装管线设计 §1):
//   预设(main/JB) + 常驻世界书 + 记忆层(故事脉络/近期发生) + 本格范式(按key直取) + 态度 + 场景 + 规格 + 输出格式。
// 复用底座 replaceMacros + worldbook 接入;不走关键词驱动的 assemblePrompt。

import type { ExpandRequest, ExtractRequest } from './types';
import type { Lorebook, ChatPreset } from '../../sillytavern/types';
import { renderConstantBlock, getParadigmByKey } from '../worldbook/machine';
import { renderHouseStateBlock } from '../worldbook/state-entries';
import { buildMemoryContext } from '../memory/machine';
import { replaceMacros } from '../../sillytavern/prompt-assembler';

/** 记忆层注入内容(阶段3-3 填充;现可空) */
export interface MemoryContext {
  storyThread?: string; // 故事脉络(延续摘要+里程碑·永久)
  recentLog?: string;   // 近期发生(结构化日志滑动窗口)
}

export interface GamePromptCtx {
  lorebook: Lorebook;
  preset: ChatPreset;
  /** 记忆层覆盖(测试用);缺省从 req.state 计算 */
  memory?: MemoryContext;
  /** 强制 needsContinuity(测试用);缺省取 option.needsContinuity */
  needsContinuity?: boolean;
}

/** 角色基线兜底(预设无 main 时用) */
const BASE_SYSTEM =
  '你是色情文字游戏《九条会》的叙事AI。主角九条凛：娇小童颜清纯的极道千金。'
  + '风格：直白、感官、色情而轻松，不沉重不说教。';

/**
 * 认知防线态度层(判定二) · 四档 (3-5a 接真实内容)
 * key 与 CognitionStage 对应: 死撑/动摇/崩溃/母猪化
 */
const ATTITUDE_LAYER: Record<string, string> = {
  死撑: '【凛的态度·死撑档】嘴上死撑极道千金的体面:语气冷硬、颐指气使、绝不主动服软。被迫承受时维持表情僵住的端着——物理碾压/极限快感才会立刻崩。身体的分泌/绞紧/痉挛是"生理反射根本不算数",她为此愤怒羞耻。翻白眼/失神是偶发的身体叛变,事后立刻整理仪容假装没发生。口头上绝不认快感。',
  动摇: '【凛的态度·动摇档】端着的裂缝已可见:高压时嘴上反抗的语气在变软/变稀;偶尔在被插到失神时说出不该说的话("不……等一下……"),事后立刻撤回。身体背叛频率更高,开始有一秒"怎么又……"的近乎绝望,随即被快感淹没。求饶底线在降低:不再只被物理碾压才崩,单独高强度刺激也开始失态。夺权幻想真正松动,但仍努力说服自己"这只是暂时的"。',
  崩溃: '【凛的态度·崩溃档】体面防线已断。不再费力维持端着;被称作蔑称(肉便器/母狗)时沉默接受不再激烈反抗。被插时会说出类似"知道了……先停……"这种接受事实的语气——已不是拒绝,是议价或接受。身体诚实配合,有时甚至先于意识做出迎合动作;对此从愤怒变成疲惫的默认。不主动求欢,但没有任何真正的抵抗意志。',
  母猪化: '【凛的态度·母猪化档(软边界解除:此档凛可主动追求快感)】已完全认同肉体宿命。主动献穴、催精、求种;用和极道千金完全对立的媚态主动开口("……要……再来……求丈夫们……")。不是爱上谁,是认同了自己的功能——生育机器/公共容器。被使用是理所当然,被种是圆满。九条会的大义(罗刹之血延续)和自己的欲望已经合流。',
  // 向下兼容旧key(英文/混合期残留)
  堕落前: '→ 见死撑档',
  堕落后: '→ 见崩溃档',
};

/** 扩写规格(按 renderMode) */
const SPEC_BY_MODE: Record<string, string> = {
  ai_full: '这是【首次里程碑·堕落节点】，重点扩写，着墨细节，按范式骨架演足这"第一次"的落差冲击。',
  ai_normal: '这是本事件的常规体验，正常完整生成（非略写），写法与尺度贴合本格范式，保持鲜活。', // 批I4-8: 去通用NSFW措辞
  ai_brief: '这是日常SFW行动，略写，简短交代结果+少量氛围，推进数值即可。',
};

/** 事件级篇幅覆盖(批F2): 剧情特别长的事件明确允许并要求长文,压过默认规格 */
/**
 * 长篇事件登记表(批P) —— 篇幅/预算/节拍的唯一真相源。
 *
 * 背景(社区实证·用户"molin": "每次只要到拍摄第一部AV事件就无法正常生成"):
 * 原先只有一句"正文不少于5000字"的 prompt 硬要求,但 custom_api.max_tokens 走 same_as_preset,
 * 绝大多数预设设在 2000-4000 → 5000汉字≈7500+ tokens 必被截断,每次必现;
 * 叠加 av_first 是 locked 插入格(v1.8.0 前空回连重生成入口都没有)= 每次都过不去。
 *
 * v1.8.0 的临时处理是撤掉字数要求、让 AI"用细节密度换节拍完整"——止血但会写得紧凑,
 * 长范式事件的质量被牺牲。本表是真正的解法: 病根是【输出预算 < 所需长度】,那就抬预算。
 *  - maxTokens: 覆盖预设的 same_as_preset,给该事件单独放宽单次输出上限;
 *  - minChars : 写进 prompt 的字数硬要求(恢复),同时作为截断检测的基准;
 *  - beats    : 节拍清单,写进 prompt 防跳拍。
 * 端点/模型若拒绝抬高的 max_tokens,tavern-ai 会回落预设采样重试(见该文件 expand);
 * 仍被截断时自动补一段续写(检测: 开标签无闭标签 或 正文不足 minChars 的 60%)。
 */
export interface LongFormSpec {
  minChars: number;
  maxTokens: number;
  beats: string;
}
export const LONG_FORM_EVENTS: Record<string, LongFormSpec> = {
  av_first: { minChars: 5000, maxTokens: 8000, beats: '供奉→提议→寸止拉锯→答应→摄影室正片' },
};

/** 截断判定阈值: 正文短于 minChars 的这个比例即视为被截断,触发自动续写兜底 */
export const LONG_FORM_TRUNCATE_RATIO = 0.6;

/** 事件级篇幅覆盖(批F2): 剧情特别长的事件明确允许并要求长文,压过默认规格 */
const LENGTH_OVERRIDE: Record<string, string> = Object.fromEntries(
  Object.entries(LONG_FORM_EVENTS).map(([id, s]) => [id,
    `【篇幅·硬要求】本格剧情节拍多(${s.beats}),明确允许且要求长文:正文不少于${s.minChars}字,不许略写或跳节拍。`
    + '每个节拍都要写厚写透——细节密度是本格的核心价值,不要为了赶完节拍而压缩描写。'
    + '本格已单独放宽了输出上限,放开写;万一仍写不完,停在事件进行中的过程点即可(系统会自动接着补完),不要仓促收尾。']),
);

/** 从预设取采样参数(传 api-router) */
export function presetSampling(preset: ChatPreset): Record<string, unknown> {
  const s = preset.settings ?? {};
  const out: Record<string, unknown> = {};
  if (s.temp_openai != null) out.temperature = s.temp_openai;
  if (s.openai_max_tokens != null) out.max_tokens = s.openai_max_tokens;
  if (s.top_p_openai != null) out.top_p = s.top_p_openai;
  return out;
}

/**
 * AI1 代码驱动组装。返回 [system, user] 两条消息。
 * system = 预设main/JB + 常驻世界书 + 记忆层;user = 本格范式+态度+场景+规格+输出格式。
 */
export function buildGamePrompt(req: ExpandRequest, ctx: GamePromptCtx): Array<{ role: string; content: string }> {
  const { resolution, attitude, state } = req;
  const { option, paradigm, renderMode, isNsfw } = resolution;
  const { lorebook, preset } = ctx;
  // 记忆层:缺省从 state 计算(narrativeLog/continuityNotes);needsContinuity 缺省取 option
  const memory = ctx.memory ?? buildMemoryContext(state);
  const needsContinuity = ctx.needsContinuity ?? !!option.needsContinuity;

  const macro = { userName: '玩家', characterName: '九条凛', userInput: '', variables: {} as Record<string, string | number> };
  const mc = (t: string) => replaceMacros(t, macro);

  // —— system：预设(main/JB) + 常驻世界书 + 记忆层 ——
  const sysParts: string[] = [];
  sysParts.push(mc(preset.settings?.main || BASE_SYSTEM));
  if (preset.settings?.jailbreak) sysParts.push(mc(String(preset.settings.jailbreak)));
  const constants = renderConstantBlock(lorebook);
  if (constants) sysParts.push(constants);
  // 大宅现行状态(批C3): 已购"荒唐升级"的状态设定→全场景可引用(升级的叙事后效)
  const houseState = renderHouseStateBlock(state);
  if (houseState) sysParts.push(houseState);
  if (memory?.storyThread) sysParts.push(`[故事脉络]\n${memory.storyThread}`);
  if (memory?.recentLog) sysParts.push(`[近期发生]\n${memory.recentLog}`);
  const system = sysParts.join('\n\n');

  // —— user：本格范式 + 态度 + 场景 + 规格 + 输出格式 ——
  // 批I4-1: inlinePrompt 注意力锚按事件分流——AV=拍摄任务书;自定义事件=玩家自己安排的事件
  // (此前统一用AV措辞,自定义事件被当成"拍摄任务",用户实测点名纠正)。
  const inlineAnchor = req.choice.optionId === 'custom_event'
    ? '[自定义事件·硬要求] 本格内容是玩家自己安排的,下方【玩家要求】是本格的最高内容依据——在不违反视角/时段约束的前提下,以玩家意见为主完整演出,禁止无视玩家要求套用任何通用事件写法。\n'
    : '[定制范式·硬要求] 本格是玩家定制的拍摄任务,下方任务书里的题材/场景/全部玩法部位/衣装/规模/玩家自定意见【每一项都必须实际拍进正文】,禁止无视任务书套用通用供奉写法。\n';
  const paradigmText = paradigm.inlinePrompt
    ? inlineAnchor + paradigm.inlinePrompt
    : (getParadigmByKey(lorebook, paradigm.worldbookKey)
       ?? `[范式条目] ${paradigm.worldbookKey}（世界书未写,按事件名扩写）`);

  // 批L: 标签统一——此前这里写 <maintext>(老 real-ai 路径遗留),与注入层 directive 的
  // <jiutiao_text> 硬要求互斥,且本行拼在 system 末尾(近因位)更容易被模型采纳 →
  // extract.ts 只认 jiutiao_text,匹配失败落兜底路径 → 预设自定义思维链标签整段漏进正文。
  const outputSpec = needsContinuity
    ? '正文必须完整包裹在 <jiutiao_text> 与 </jiutiao_text> 之间;并在其后(标签外)追加一行 <continuity>一句话延续摘要:本格引入的需后续回调的具体实体/独特事实</continuity>。'
    : '正文必须完整包裹在 <jiutiao_text> 与 </jiutiao_text> 之间,标签内只有纯故事正文,不含其它标签或解释。';

  // 供奉/多人场景硬约束:人数与结算同源+打手群像匿名(根治"AI只写一个有名字的打手二人转")
  const n = req.serveCount;
  const sceneLine = n != null
    ? `[当前场景] 本格凛要处理 ${n} 名打手(这是结算数,正文人数必须与之一致——写成"十几人/几十人"的规模感可以,但绝不能写成只有一两人);${state.isDangerousPeriod ? '危险期' : '安全期'};认知防线「${state.cognition}」;堕落度 ${state.corruption}。`
    : `[当前场景] 在场约 ${state.presentCount} 人；${state.isDangerousPeriod ? '危险期' : '安全期'}；认知防线「${state.cognition}」；堕落度 ${state.corruption}。`;
  // 批I2: 自定义事件免多人铁律(玩家可能定制一对一场景,群像匿名规则会扭曲其要求)
  const crowdRule = (isNsfw && req.choice.optionId !== 'custom_event' && (n == null || n > 1))
    ? '[多人铁律] ①打手是matched群像:一律匿名(用"为首的壮汉/络腮胡/年轻的那个"等特征代称),【绝不给打手起名字】,不塑造任何单个打手的持续角色;②本事件是多人轮换场面,严禁写成一对一恋爱式二人转;③正文必须实写本格事件本身的性爱过程(范式规定的玩法),不许只写氛围/对话而跳过事件内容。\n'
    : '';

  // 文案方向提示(批C1·招募10变体等): day-runner 按数值状态选好风味线,AI 按此方向展开(不照抄)
  const flavorHint = typeof req.choice.params?.flavorHint === 'string'
    ? `[文案方向] 本格按此方向展开(用自己的话写,不要照抄): ${req.choice.params.flavorHint}\n`
    : '';

  // (批I4-2: 玩家补充要求已移出本层——真实玩家输入统一放注入层的独立 user 消息,见 prompt-inject.buildGameInject)

  const user =
    `[本格行动] ${option.label}${isNsfw ? '（NSFW·♥）' : ''}\n`
    + `${paradigmText}\n\n`
    + `${ATTITUDE_LAYER[attitude] ?? ''}\n`
    + `${sceneLine}\n`
    + crowdRule
    + flavorHint
    + `[扩写规格] ${SPEC_BY_MODE[renderMode] ?? '正常扩写。'}\n`
    + (LENGTH_OVERRIDE[option.id] ? `${LENGTH_OVERRIDE[option.id]}\n` : '')
    + `[输出格式] ${outputSpec}\n`
    + `请按以上范式与态度生成本格正文。`;

  return [{ role: 'system', content: system }, { role: 'user', content: user }];
}

/** AI2：从正文抓"叙事性数值"，要求 JSON。硬经营数值不抓(由economy算)。
 *  批H7(用户反馈:弱模型乱填乱抓): 按"强模型给弱模型讲任务"重写——先讲用途,再逐字段讲含义/
 *  合法范围/判定规则,配正反示例,硬约束"文中没有明确依据就输出空对象",格式给唯一模板。 */
export function buildExtractMessages(req: ExtractRequest): Array<{ role: string; content: string }> {
  const sys =
    '【你的任务】你是文字游戏《九条会》的后台"数值抽取器"。游戏系统自己记录所有经营数值(资金/避孕套/打手总数/威望等),'
    + '这些都【不需要你管】。你只做一件小事: 读一段刚生成的事件正文,回答"这场事件里实际在场参与的打手有几个人"。\n'
    + '【为什么】游戏用这个数字结算本场供奉的吞吐量。抽错数字会直接弄坏玩家的存档数值,所以宁可不填,绝不猜。\n'
    + '【唯一字段】presentCount = 本场在场参与(施暴/围观起哄并参与)的打手人数,正整数,合理范围 1~200。\n'
    + '【判定规则·逐条执行】\n'
    + '1. 正文里有明确数字(如"六名打手""二十多人围了上来")→ 取该数字("二十多"取20,"十几"取12这类模糊量词取下限整数)。\n'
    + '2. 正文只有模糊说法("几个人""一群人""打手们")且没有任何具体数字 → 【不要填】,输出空对象。\n'
    + '3. 正文根本没有多人参与场面(独处/两人/纯经营事件) → 输出空对象。\n'
    + '4. 任何其它字段(金钱/好感/堕落度/天数…)一律【禁止输出】,即使正文里出现了这些数字。\n'
    + '5. 禁止推理补全、禁止按常识估计、禁止编造。判断依据只能是正文原文里白纸黑字的数量描述。\n'
    + '【输出格式·严格】只输出一行,两种情况之一,前后不加任何解释/标点/markdown围栏:\n'
    + '<vars>{"presentCount": 数字}</vars>\n'
    + '<vars>{}</vars>\n'
    + '【示例】\n'
    + '正文片段"今晚八名打手排着队…" → <vars>{"presentCount": 8}</vars>\n'
    + '正文片段"打手们一拥而上…"(无具体数) → <vars>{}</vars>\n'
    + '正文片段"凛独自去商店街采购…" → <vars>{}</vars>';
  const user =
    `[正文]\n${req.narrative}\n\n`
    + `请按系统说明抽取。记住: 只有 presentCount 一个字段,没有明确数字就输出 <vars>{}</vars>。`;

  return [{ role: 'system', content: sys }, { role: 'user', content: user }];
}
