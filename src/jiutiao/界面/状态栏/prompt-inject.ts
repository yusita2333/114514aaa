// prompt-inject · 生成注入酒馆 generate 的游戏 prompt 文本
// ============================================================
//
// 与 game/engine/prompt.ts(buildGamePrompt)的关系(批B-2 重构后):
//  - buildGamePrompt 组装 [system, user]:system=我们的 main+JB(demoPreset)+常驻世界书+记忆层,
//    user=范式+态度+场景+规格+输出格式。
//  - 本文件在其外再包: 任务框架(AI在游戏流水线中的角色) + 强指令(视角/衔接/反复读/时段) + 连贯性简报。
//  - 酒馆第三方预设块不再默认注入(视角污染源·见 tavern-ai.ts 开关)。采样参数仍 same_as_preset。

import { buildGamePrompt, buildExtractMessages } from '../../game/engine/prompt';
import { demoPreset } from '../../game/worldbook/demo';
import { getMalePov, buildMalePovDirective } from './pov-settings';
import type { ExpandRequest, ExtractRequest } from '../../game/engine/types';
import type { Lorebook, ChatPreset } from '../../sillytavern/types';

// 批B-2: 注入我们自己的 main+JB(demoPreset·3-5b 为九条会专门写的行为规范:
//   直白露骨基调/感官四维/按范式补血肉不复读模板)。
//   此前这里传 EMPTY_PRESET 导致 main/JB 被整体旁路,只剩一句话兜底——
//   行为规范根本没进 prompt,是"凹人设/复读语料"症状的主根因之一。
const GAME_PRESET: ChatPreset = demoPreset;

/**
 * 生成主 AI(正文)的注入(批I4: 拆双消息)。
 * system=全部卡侧内容(任务框架+强指令+时段+时间锚+三层前情+main/JB+世界书+范式+态度+状态+输出格式);
 * user=只放玩家真实输入(补充要求/自定义内容/续写指令),无输入时简短占位(恒非空·Gemini系兼容)。
 * @param memoryText 三层记忆渲染文本(远期概要+窗口小总结+最近原文·renderTieredMemory 产出)。空=开局无前情。
 */
export function buildGameInject(req: ExpandRequest, lorebook: Lorebook, memoryText = ''): { system: string; user: string } {
  // memory 传空对象关掉 buildGamePrompt 的旧记忆轨(storyThread/recentLog)——
  // 里程碑线已并入三层前情(renderTieredMemory 的[故事里程碑]),日志流水(桶2变量信息)退出注入(系统变量已记录,不占prompt)。
  const msgs = buildGamePrompt(req, { lorebook, preset: GAME_PRESET, memory: {} });
  const sys = (msgs[0]?.content ?? '').trim();
  const user = (msgs[1]?.content ?? '').trim();

  // 任务框架(批B-2·给AI解释"你当前的处境与任务"·弱模型缺这层框架更易漂):
  const frame =
    '【你的任务框架】\n'
    + '《九条会》是一个经营+堕落的成人文字游戏:玩家扮演九条会会长,把每天的行动安排进格子,系统逐格结算。\n'
    + '你在这条流水线里只负责一件事:把【本格行动】指定的这一个事件,按范式约束演成一段给玩家看的正文。\n'
    + '数值(资金/人数/堕落度等)全部由游戏系统计算,你不用管结算,只管把这一格演好。\n'
    + '你写的正文会直接显示在游戏界面里,前后格的正文由多次独立生成拼成一天——所以必须服从下方的衔接与时段约束。';

  // 强指令(置顶):
  //  #3 命中范式不跑偏 + 衔接连续状态不重置(堵不如疏:不发原始楼层,改发副AI简报)
  //  #2 思维链/尾部块放标签外
  //  批B-2 新增: 视角硬约束(根治"主视角变你") + 反复读(根治弱模型照抄范式词表)
  const directive =
    '【最高指令·游戏事件生成】\n'
    + '你在为一个文字游戏生成【本格事件】的正文。遵守:\n'
    + '1. 命中范式:严格演下方【本格行动】指定的事件,严禁写成与之无关的其它场景(如把"口交侍奉"写成"便利店采购")。\n'
    + (getMalePov()
      ? buildMalePovDirective()
      : '2. 【叙事视角·硬约束】正文用第三人称,镜头始终跟随九条凛,以"凛/她"称呼主角。玩家角色=九条会会长,正文中只能以"会长"指代,且仅在事件需要时出场。【严禁】用"你"称呼任何角色、严禁第二人称叙事、严禁把玩家写成正文的"你"。\n')
    + '3. 衔接而非重置:必须承接下方【前情】的当前局面自然往下写——优先衔接【前文原文】的结尾状态,其次参考【近期事件总结】。若前情显示凛已在某场景(如已在供奉现场),就从那个状态继续推进,严禁把场景退回更早的起点(如再写"她刚从外面回家/刚被叫来/刚进门")。无前情时(开局首格)才从本事件自身起笔。\n'
    + '4. 只认前情:不要续写酒馆聊天楼层里的其它历史对话,本次只依据【前情】+【本格行动】。\n'
    + '5. 【反复读·硬约束】下方范式里的词表/例句/拟声/称呼锚点是【选词方向和写作约束】,不是让你抄写的文本:\n'
    + '   · 严禁把范式中的例句/词表原样或近原样搬进正文,严禁成段罗列范式词汇;\n'
    + '   · 每格用词要换血:同一个动作/部位/反应,换不同的写法,照抄只会让玩家审美疲劳;\n'
    + '   · 【前情】里已写过的开场/桥段/句式/意象,本格不要再重复,换新的写法。\n'
    + '   · 【前情不是语料·铁条】【前情】里的原文/总结只是让你知道"已经发生了什么"的背景事实,'
    + '【严禁】把前情中的任何句子/描写/桥段照抄或轻改后搬进本格正文——本格必须是全新写作,复读前文=最严重的失败。\n'
    + '6. 【绝不跨时间段·硬约束】本格只演当前这一小段时间内发生的事,严禁擅自推进到别的时段、严禁给一整天收尾:\n'
    + '   · 若本格是【夜晚】事件: 绝对不许写到天亮/早晨/第二天/起床/晨光——后面可能还有别的夜晚行动格,写到天亮逻辑就崩。结尾停在本格事件刚结束的深夜。\n'
    + '   · 若本格是【白天】事件: 绝对不许写到天黑/入夜/夜晚/华灯初上。结尾停在本格事件刚结束的白天。\n'
    + '   · 正文是这一天里的一个片段,不是一天的总结。禁止出现"这一天结束了""一夜过去""翌日"之类的跨时段收尾。\n'
    + '7. 【留续写接口·NSFW】若本格是NSFW事件: 不要擅自给事件写"结尾",结尾停在事件仍在进行的过程点——'
    + '不写完备收场(事后清理/众人散去/回顾感想式终结段)。玩家可能选择在本格继续扩写,收得太死会断掉续写空间。\n'
    + '【输出格式·强制】正文必须完整包裹在 <jiutiao_text> 与 </jiutiao_text> 之间。思维链/分析/预设要求的尾部格式块放在标签【之外】——标签内只有给玩家看的纯故事正文,不含任何标签/注释/格式块。';

  const briefBlock = memoryText.trim()
    ? `【前情·必须严格遵守(代替前文,分层:远期概要→近期总结→最近原文,越靠后越具体)】\n${memoryText.trim()}`
    : '';

  // 时间锚点(批H7·用户反馈:快进多日后AI无缝续写旧正文,时间一秒没过)。
  // 显式告诉AI"现在是第几天/距最近一段完整正文过了几天",跨天时强制体现时间流逝。
  const nowDay = req.dayNumber;
  let timeAnchor = '';
  if (nowDay != null) {
    const proseDays = (req.state.proseArchive ?? []).filter(p => p.needsSummary !== false || p.text.length >= 100).map(p => p.day);
    const lastProseDay = proseDays.length ? Math.max(...proseDays) : null;
    const gap = lastProseDay != null ? nowDay - lastProseDay : 0;
    timeAnchor = `【时间锚点】今天是游戏第 ${nowDay} 天。`
      + (gap >= 1
        ? `距离【前文原文】里最近的一段完整正文(第 ${lastProseDay} 天)已经过去了 ${gap} 天,期间发生的事以[近期事件总结]里的条目为准(多为快进带过的日常经营)。`
          + '本格正文【必须体现这段时间已经流逝】:通过日常的积累感/环境或身体的细微变化/对前些天事件的回望等自然手法带出,'
          + '严禁写得像紧接着上一段正文的下一秒。'
        : '')
      + '注意:天数只用于你把握时间感,正文中不要直接报数字("第X天"之类的系统口吻禁止出现)。';
  }

  // 本格时段(具体化"绝不跨时段"规则·让 AI 明确知道现在是白天还是夜晚)
  const period = req.resolution.option.period;
  const periodNote = period === 'night'
    ? '【本格时段·硬约束】现在是【夜晚】。正文绝对不许写到天亮/早晨/起床/第二天,结尾必须停在本格事件刚结束的深夜(后面可能还有别的夜晚格)。'
    : period === 'day'
    ? '【本格时段·硬约束】现在是【白天】。正文绝对不许写到天黑/入夜/夜晚,结尾必须停在本格事件刚结束的白天。'
    : '';

  // ═══ 批I4-2/3(用户确诊·全 inject 曾合并成一条 user 消息=卡侧说明稀释真实用户输入) ═══
  // 拆两条: system=全部卡侧内容(框架/指令/时段/时间锚/前情/main/JB/世界书/范式/态度/场景/规格/输出格式);
  //         user=只放玩家真实输入(补充要求/自定义内容/续写指令),无输入时自动填简短占位(恒非空,兼容Gemini系)。
  const systemText = [frame, directive, periodNote, timeAnchor, briefBlock, sys, user].filter(Boolean).join('\n\n');

  const userParts: string[] = [];
  // 续写指令(玩家主动点的续写=玩家意图·批I2机制/批I4移入user层)
  if (req.continuation?.prevTail) {
    userParts.push(
      '【续写指令】我(玩家)选择继续扩写本格正文。已写正文的结尾片段如下,从其结尾处自然接续往下写:\n'
      + '· 不重复/不改写已有内容,不重启场景,直接续着写;保持同一视角/时段/人物状态与情绪走向;\n'
      + '· 【绝对不要收尾】——结尾仍停在事件进行中的过程点,我可能还要继续;\n'
      + '· 只输出【新增的续写段】,不要重抄任何已有正文。\n'
      + `【已写正文·结尾片段】\n${req.continuation.prevTail}`);
    if (req.continuation.note?.trim()) {
      userParts.push(`【我的续写要求】${req.continuation.note.trim()}`);
    }
  }
  // 自定义事件的玩家原文(范式壳在system·原始要求在user层强调=真实用户输入)
  if (req.choice.optionId === 'custom_event' && typeof req.choice.params?.customPrompt === 'string' && req.choice.params.customPrompt.trim()) {
    userParts.push(`【我的自定义事件要求】${req.choice.params.customPrompt.trim()}`);
  }
  // 玩家补充要求(批I2·选格旁自由输入)
  if (typeof req.choice.params?.userNote === 'string' && req.choice.params.userNote.trim()) {
    userParts.push(`【我的补充要求】${req.choice.params.userNote.trim()}\n(在不违反系统层视角/时段约束的前提下,把这些要求实际写进本格正文。)`);
  }
  // 占位(批I4-3): 无任何玩家输入时的简短任务行
  if (!userParts.length) {
    const dayStr = req.dayNumber != null ? `第${req.dayNumber}天·` : '';
    const periodStr = period === 'night' ? '夜晚' : period === 'day' ? '白天' : '';
    userParts.push(`本格执行事件『${req.resolution.option.label}』(${dayStr}${periodStr})。无玩家附加要求,请按系统层说明生成本格正文。`);
  }

  return { system: systemText, user: userParts.join('\n\n') };
}

// (批B6) 生成前串行的"连贯性导演简报"已退役:前情改为三层记忆纯函数渲染(零延迟注入),
//   压缩工作移到事后后台小总结(tavern-ai.summarize + runner-store worker)。

/** 生成副 AI(抓数值)的注入文本。 */
export function buildExtractInject(req: ExtractRequest): string {
  const msgs = buildExtractMessages(req);
  const sys = (msgs[0]?.content ?? '').trim();
  const user = (msgs[1]?.content ?? '').trim();
  return [sys, user].filter(Boolean).join('\n\n');
}
