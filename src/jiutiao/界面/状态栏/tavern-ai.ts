// tavern-ai · 接酒馆 generateRaw 的 AiPort 实现
// ============================================================
//
// 设计(对齐用户产品要求 + #3/#2 根治):
//  - 用 generateRaw + ordered_prompts 白名单制: 只发 [预设JB/文风块 + 我们的游戏范式],
//    **不放 chat_history** → AI 不会续写酒馆楼层历史(根治 #3"续写前文")。
//  - 预设的 JB/越狱/文风从 getPreset('in_use') 读出塞进 ordered_prompts(保留过审基调+文风)。
//  - 采样参数 custom_api: 'same_as_preset' 继承预设温度/top_p/max_tokens。
//  - 强制 AI 用 <jiutiao_text>...</jiutiao_text> 包正文 → 剥离思维链/尾部数学题(根治 #2)。
//  - 输出零正则污染: 拿 generateRaw 原始返回串,不调 formatAsTavernRegexedString。
//  - 信息流零内容: generateRaw 默认不产生楼层消息。
//
// 已知坑(子代理调查): generateRaw 仍可能注入"按深度的世界书条目"。我们的卡世界书条目
//   都是 constant 蓝灯(范式按 key 直取,非绿灯扫描),且玩家第三方世界书不归我们管。
//   若实测有世界书漏入干扰,再考虑 overrides 屏蔽。

import { buildGameInject, buildExtractInject } from './prompt-inject';
import { LONG_FORM_EVENTS, LONG_FORM_TRUNCATE_RATIO } from '../../game/engine/prompt';
import { extractGameText, extractContinuity, extractVarsJson, stripThinking } from './extract';
import { renderTieredMemory } from '../../game/memory/machine';
import { getMemoryConfig } from './memory-settings';
import { getExtractApiForCall } from './api-settings';
import type { AiPort, ExpandRequest, ExtractRequest, ExpandResult, SummarizeRequest } from '../../game/engine/types';
import type { Lorebook } from '../../sillytavern/types';

// ─── 酒馆 generateRaw / getPreset 最小类型声明 ───
interface RolePrompt { role: 'system' | 'assistant' | 'user'; content: string; }
type PlaceholderPrompt = string;
interface CustomApiConfig {
  apiurl?: string; key?: string; model?: string; source?: string;
  temperature?: 'same_as_preset' | 'unset' | number;
  top_p?: 'same_as_preset' | 'unset' | number;
  max_tokens?: 'same_as_preset' | 'unset' | number;
}
interface GenerateRawConfig {
  user_input?: string;
  ordered_prompts?: (PlaceholderPrompt | RolePrompt)[];
  should_stream?: boolean;
  should_silence?: boolean;
  custom_api?: CustomApiConfig;
}
declare function generateRaw(config: GenerateRawConfig): Promise<string>;

interface PresetPrompt { id: string; name: string; enabled: boolean; role: 'system' | 'user' | 'assistant'; content?: string; }
interface Preset { prompts: PresetPrompt[]; }
declare function getPreset(name: 'in_use' | string): Preset;

// ─── 第三方预设块开关(批B-3;批B6 用户实测确认不影响人称→默认改回开启) ───
// 抽酒馆当前预设的 main/nsfw/jailbreak 块注入(借第三方预设文风)。不想借时在设置页关闭。
// 偏好存 localStorage(跨聊天全局)。
const PRESET_TOGGLE_KEY = 'pellucid_include_tavern_preset';
let includeTavernPreset = true;
try { includeTavernPreset = localStorage.getItem(PRESET_TOGGLE_KEY) !== '0'; } catch { /* 无localStorage环境默认开 */ }
export function getIncludeTavernPreset(): boolean { return includeTavernPreset; }
export function setIncludeTavernPreset(v: boolean) {
  includeTavernPreset = v;
  try { localStorage.setItem(PRESET_TOGGLE_KEY, v ? '1' : '0'); } catch { /* 忽略 */ }
}

/**
 * 从当前预设抽出所有【已启用且有正文】的条目,转成 RolePrompt[]。
 *
 * 批L(社区实证·用户"元素潮汐"): 此前只抓 id∈{main,nsfw,jailbreak} 的系统提示词 +
 * 名字含"文风/风格/style"的普通条目。而现代破限预设的破甲/越狱几乎全写在普通条目里
 * (名字叫 破甲/越狱/JB/预填充/正文规则…),一个都命中不了 → 破甲根本没进 prompt,
 * 玩到第3天前情里堆了露骨原文就被上游一律打回。该用户实测"把破甲手动加进 main 块就好了"
 * 即此根因的直接证据。
 *
 * 现改为全量放行,由玩家在酒馆预设界面自行开关条目决定注入什么。
 * 唯一排除项 = 占位符条目(chat_history/char_description 等),它们本就无 content,
 * 且 chat_history 一旦放行会把楼层历史带进来(违背"不续写楼层"的根本设计)。
 */
function presetSystemBlocks(): RolePrompt[] {
  try {
    const preset = getPreset('in_use');
    if (!preset?.prompts) return [];
    return preset.prompts
      .filter(p => p.enabled && typeof p.content === 'string' && p.content.trim())
      .map(p => ({ role: p.role, content: p.content as string }));
  } catch {
    return []; // 取预设失败(无预设/异常)→ 空,只发我们的范式
  }
}

// ─── 批I2: 玩家全局世界书扫描(自定义事件格开关·默认关) ───
// 通过酒馆助手 API 读玩家当前启用的全局世界书,用绿灯关键词匹配玩家自定义文本,
// 命中条目附进注入(条数/字数双上限防token失控;蓝灯常驻不收)。API 缺失/异常 → 静默跳过。
declare function getLorebookSettings(): { selected_global_lorebooks?: string[] };
declare function getLorebookEntries(lorebook: string): Promise<Array<{
  enabled?: boolean; type?: string; keys?: string[]; content?: string; comment?: string;
}>>;
const USER_WB_MAX_ENTRIES = 6;
const USER_WB_MAX_CHARS = 4000;
async function scanUserLorebooks(queryText: string): Promise<string> {
  try {
    if (!queryText.trim()) return '';
    const books = (getLorebookSettings()?.selected_global_lorebooks ?? []).slice(0, 4);
    if (!books.length) return '';
    const q = queryText.toLowerCase();
    const hits: string[] = [];
    let chars = 0;
    for (const book of books) {
      let entries;
      try { entries = await getLorebookEntries(book); } catch { continue; }
      for (const e of entries ?? []) {
        if (hits.length >= USER_WB_MAX_ENTRIES || chars >= USER_WB_MAX_CHARS) break;
        if (!e?.enabled || !e.content) continue;
        if (e.type === 'constant') continue; // 蓝灯常驻不收(会无差别塞满)
        const keys = (e.keys ?? []).filter(k => typeof k === 'string' && k.trim());
        if (!keys.length) continue;
        if (!keys.some(k => q.includes(k.toLowerCase()))) continue;
        const body = e.content.slice(0, 1200);
        hits.push(`- ${e.comment || keys[0]}: ${body}`);
        chars += body.length;
      }
    }
    if (!hits.length) return '';
    return '【玩家全局世界书·命中条目(自定义事件的辅助设定;与本卡设定冲突时以本卡为准)】\n' + hits.join('\n');
  } catch { return ''; }
}

const SAMPLING: CustomApiConfig = {
  temperature: 'same_as_preset',
  top_p: 'same_as_preset',
  max_tokens: 'same_as_preset',
};

// ─── prompt 审计(批B-1) ───
// 记录最近几次实际发出的 ordered_prompts 全量与 AI 原始返回,
// DEBUG 工具条一键导出——怀疑"注入是否生效"时直接看实证。
export interface PromptAuditRecord {
  when: string;
  kind: 'expand' | 'summary' | 'extract';
  label: string;
  prompts: { role: string; content: string }[];
  rawResponse?: string;
}
const AUDIT_KEEP = 6;
const auditLog: PromptAuditRecord[] = [];
function auditPush(rec: PromptAuditRecord) {
  auditLog.push(rec);
  if (auditLog.length > AUDIT_KEEP) auditLog.splice(0, auditLog.length - AUDIT_KEEP);
}
/** 导出审计日志为可读文本 */
export function dumpPromptAudit(): string {
  if (auditLog.length === 0) return '(暂无记录:先执行一个行动格)';
  return auditLog.map(r =>
    `====== [${r.kind}] ${r.label} - ${r.when} ======\n`
    + r.prompts.map((p, i) => `--- prompt[${i}] role=${p.role} ---\n${p.content}`).join('\n\n')
    + (r.rawResponse != null ? `\n\n--- AI raw ---\n${r.rawResponse}` : '')
  ).join('\n\n\n');
}

// ─── 后台总结调参(批B6·事后小总结取代生成前串行简报 → 正文生成不再排队等总结) ───
const SUMMARIZE_TIMEOUT_MS = 60_000; // 后台总结超时(失败留待下次重试,不影响游玩)
// 批L: extract 独立超时。此前它无超时,只被 runner-store 那层 120s 总预算罩着——
// expand 跑了110s时 extract 必然把整格拖爆,连已生成的正文一起丢。现独立限时并可失败降级。
const EXTRACT_TIMEOUT_MS = 45_000;

// ─── 总结提示词(批B6·给弱模型的目的性说明,用户定稿的过滤规则) ───
// 小总结: 单事件正文 → 前情条目
function eventSummaryPrompt(text: string, meta?: SummarizeRequest['meta']): string {
  return (
    '你是文字游戏《九条会》的"前情记录员"。下面是刚生成的一段事件正文,把它压缩成给后续正文AI看的"前情条目"。\n'
    + '【为什么要总结】后续每段正文由独立AI生成,它看不到这段原文,只看你的条目。条目的用途只有三个:\n'
    + '1. 让后文知道"什么已经写过了"(用过的桥段/开场/意象),避免重复;\n'
    + '2. 让后文知道主角九条凛此刻的状态与态度(身体状态/情绪/认知变化/所在场所);\n'
    + '3. 让后文知道环境与局面的变化(场所变化/新出现且以后还会出现的人物物件/关系变化)。\n'
    + '【不要记】\n'
    + '- 不改变凛的状态、也不改变周围环境的一次性小事:记了等于没记,后文按常态写即可,这种条目直接省略;\n'
    + '- 过程流水账(先做了A再做了B):只记结果与留下的状态;\n'
    + '- 精确数值(资金/打手数/避孕套数等):游戏系统的变量已经记录,不占总结。涉及规模变动只记规模级别(如"打手已是数百人规模"),让后文表现出对应规模感即可。\n'
    + '【输出】2-4条要点,每条一句话,总字数不超过120字。直接输出要点,不要解释,不要思维链。\n'
    + `【事件】第${meta?.day ?? '?'}天·${meta?.label ?? ''}\n【正文】\n${text}`
  );
}
// 大总结: 一个时间窗的小总结 → 时期概要
function periodSummaryPrompt(text: string, meta?: SummarizeRequest['meta']): string {
  return (
    `你是文字游戏《九条会》的"前情记录员"。下面是第${meta?.fromDay ?? '?'}-${meta?.toDay ?? '?'}天的逐事件前情条目,把这一时期压缩成一段"时期概要",给后续正文AI看。\n`
    + '【要记】这一时期结束时与开始时相比的阶段性变化:\n'
    + '- 九条凛的状态/态度/认知的净变化;\n'
    + '- 势力与场所的净变化(只记规模级别,不记精确数);\n'
    + '- 已经从"新鲜事"变成"日常常态"的事(标注"已成常态",后文按常态处理,不再当新鲜事写);\n'
    + '- 仍需长期记住的独特事实(人物/物件/约定)。\n'
    + '【不要记】已被后续发展覆盖的中间状态;一次性细节;精确数值。\n'
    + '【输出】3-6条要点,总字数不超过200字。直接输出,不要解释。\n'
    + `【前情条目】\n${text}`
  );
}
// 滚动合并: 多段时期概要 → 更长跨度概要("大大总结")
function mergeSummaryPrompt(text: string): string {
  return (
    '你是文字游戏《九条会》的"前情记录员"。把下面多段"时期概要"合并成一段更长跨度的概要。\n'
    + '保留: 九条凛的关键转变节点、当前已成常态的事、仍然有效的独特事实。丢弃: 中间过程、已被覆盖的旧状态。\n'
    + '【输出】4-8条要点,总字数不超过250字。直接输出,不要解释。\n'
    + `【时期概要】\n${text}`
  );
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('brief-timeout')), ms)),
  ]);
}

export interface TavernAiOpts {
  /** 游戏世界书(含范式条目真实内容)。注入用,非酒馆世界书。 */
  lorebook: Lorebook;
  /** 副 API(抓数值)的独立端点配置。不传则与主 API 同端点。 */
  extractApi?: CustomApiConfig;
}

/** 构造接酒馆 generateRaw 的 AiPort。 */
export function createTavernAi(opts: TavernAiOpts): AiPort {
  // 前情来自三层记忆(EngineState 持久化·批B6): 大总结+窗口小总结+最近原文,注入量由设置决定。
  // 不发原始楼层历史(根治 #3)。生成前不再串行等副AI简报——小总结改为事后后台生成(runner-store worker)。

  return {
    async expand(req: ExpandRequest): Promise<ExpandResult> {
      // 批P: 长篇事件(首部AV等)单独放宽输出上限——病根是"输出预算 < 所需长度",不是文案问题
      const lf = LONG_FORM_EVENTS[req.resolution.option.id];
      const sampling: CustomApiConfig = lf ? { ...SAMPLING, max_tokens: lf.maxTokens } : SAMPLING;

      // 组装 ordered_prompts(首轮与"截断自动续写"轮共用,只是 req.continuation 不同)
      const buildOrdered = async (r: ExpandRequest): Promise<(PlaceholderPrompt | RolePrompt)[]> => {
        // 三层记忆注入(纯函数渲染,无AI调用,零延迟)
        const nowDay = r.dayNumber
          ?? Math.max(0, ...(r.state.proseArchive ?? []).map(p => p.day)); // 兜底:档案里最新一天
        const memoryText = renderTieredMemory(r.state, nowDay, getMemoryConfig());
        // 批I4-2: 双消息制——system=全部卡侧说明;user=玩家真实输入(无输入自动占位,恒非空=Gemini系
        // "contents is required"兼容,取代 H6 的"整包发user"权宜(卡侧说明曾稀释真实用户输入)。
        const inj = buildGameInject(r, opts.lorebook, memoryText);
        let sysContent = inj.system;
        // 批I2: 自定义格开启"读取我的世界书"时,扫描玩家全局世界书附进 system(设定类内容)
        if (r.choice.params?.useUserLorebook === true) {
          const queryText = [r.choice.params?.customPrompt, r.choice.params?.userNote]
            .filter((s): s is string => typeof s === 'string').join(' ');
          const wb = await scanUserLorebooks(queryText);
          if (wb) sysContent += '\n\n' + wb;
        }
        return [
          ...(includeTavernPreset ? presetSystemBlocks() : []), // 酒馆预设(默认开·设置页可关)
          { role: 'system', content: sysContent },         // 卡侧全部: 框架+指令+时段+时间锚+前情+main/JB+世界书+范式+态度+状态+输出格式
          { role: 'user', content: inj.user },             // 玩家真实输入(补充要求/自定义/续写)或占位
          // 不放 'chat_history' → 不发楼层历史
        ];
      };

      const ordered = await buildOrdered(req);
      let raw: string;
      try {
        raw = await generateRaw({ ordered_prompts: ordered, should_stream: false, custom_api: sampling });
      } catch (e) {
        // 抬高的 max_tokens 可能超出该端点/模型的单次输出上限而被拒 → 回落预设采样重试一次,
        // 绝不能让"想写长一点"反而把这一格彻底打死。
        if (!lf) throw e;
        raw = await generateRaw({ ordered_prompts: ordered, should_stream: false, custom_api: SAMPLING });
      }
      auditPush({
        when: new Date().toISOString(), kind: 'expand', label: req.resolution.option.label,
        prompts: ordered.filter((p): p is RolePrompt => typeof p !== 'string'),
        rawResponse: raw,
      });
      let text = extractGameText(raw);

      // 批P: 长篇事件截断兜底——正常一次写完就零额外开销,只有真被截断才自动补一段。
      // 判定: 有开标签却没闭标签(典型截断特征) 或 正文不足要求字数的 60%。
      // 只对首轮生效(req.continuation 为空),避免玩家手动续写时被二次追加。
      if (lf && !req.continuation && text) {
        const hasOpen = /<(jiutiao_text|maintext)>/i.test(raw);
        const hasClose = /<\/(jiutiao_text|maintext)>/i.test(raw);
        const tooShort = text.length < Math.floor(lf.minChars * LONG_FORM_TRUNCATE_RATIO);
        if ((hasOpen && !hasClose) || tooShort) {
          try {
            const ordered2 = await buildOrdered({
              ...req,
              continuation: {
                prevTail: text.slice(-2200),
                note: '上一段因为输出长度上限被中断了。请从中断处【无缝接续】把本事件剩余的节拍演完,'
                  + '保持与前文同样的细节密度(不要因为是补写就草草收束),不要重述已经写过的内容。',
              },
            });
            const raw2 = await generateRaw({ ordered_prompts: ordered2, should_stream: false, custom_api: sampling });
            auditPush({
              when: new Date().toISOString(), kind: 'expand',
              label: req.resolution.option.label + '·截断自动续写',
              prompts: ordered2.filter((p): p is RolePrompt => typeof p !== 'string'),
              rawResponse: raw2,
            });
            const seg = extractGameText(raw2).trim();
            if (seg.length >= 20) text = text.trimEnd() + '\n\n' + seg;
          } catch { /* 兜底续写失败不影响已生成的正文,玩家仍可手动点续写 */ }
        }
      }
      // 正文入档由 day-runner 维护(EngineState.proseArchive·批B6),此处不持有状态
      return { text, continuity: extractContinuity(raw) };
    },

    /** 后台总结(批B6·纪律性小总结/大总结/滚动合并)。走副API端点,静默,失败抛错由 worker 留待下次。 */
    async summarize(req: SummarizeRequest): Promise<string> {
      const prompt = req.kind === 'event' ? eventSummaryPrompt(req.text, req.meta)
        : req.kind === 'period' ? periodSummaryPrompt(req.text, req.meta)
        : mergeSummaryPrompt(req.text);
      const sumPrompts = [{ role: 'user' as const, content: prompt }]; // 批H6: user角色·Gemini系兼容
      const raw = await withTimeout(generateRaw({
        ordered_prompts: sumPrompts,
        should_stream: false,
        should_silence: true,                            // 后台静默,不产生楼层消息
        // 批H9: 副API未配→沿用正文 expand 的 same_as_preset 锚(走主连接/插头,已验证可用);
        //   原先传只含 max_tokens 的空 custom_api,酒馆无法定位连接端点→弹"Chat Completion API · model is required"。
        custom_api: (() => { const ex = getExtractApiForCall() ?? opts.extractApi; return ex ? { ...ex, max_tokens: 'unset' as const } : { ...SAMPLING, max_tokens: 'unset' as const }; })(),
      }), SUMMARIZE_TIMEOUT_MS);
      auditPush({
        when: new Date().toISOString(), kind: 'summary',
        label: req.kind === 'event' ? `小总结·${req.meta?.label ?? ''}` : req.kind === 'period' ? `大总结·${req.meta?.fromDay}-${req.meta?.toDay}天` : '大总结合并',
        prompts: sumPrompts, rawResponse: raw,
      });
      return stripThinking(raw);
    },

    async extract(req: ExtractRequest): Promise<Record<string, unknown>> {
      const inject = buildExtractInject(req);
      const exPrompts = [{ role: 'user' as const, content: inject }]; // 批H6: user角色·Gemini系兼容
      const raw = await withTimeout(generateRaw({
        ordered_prompts: exPrompts,
        should_stream: false,
        should_silence: true,                            // 后台静默
        // 批H9: 副API未配→沿用正文 expand 的 same_as_preset 锚(走主连接/插头,已验证可用);
        //   原先传只含 max_tokens 的空 custom_api,酒馆无法定位连接端点→弹"Chat Completion API · model is required"。
        custom_api: (() => { const ex = getExtractApiForCall() ?? opts.extractApi; return ex ? { ...ex, max_tokens: 'unset' as const } : { ...SAMPLING, max_tokens: 'unset' as const }; })(),
      }), EXTRACT_TIMEOUT_MS);
      auditPush({ when: new Date().toISOString(), kind: 'extract', label: '数值抽取', prompts: exPrompts, rawResponse: raw });
      return extractVarsJson(raw);
    },
  };
}
