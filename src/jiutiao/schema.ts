// 九条会 MVU 变量结构 schema.ts —— 初版 v1（前端版）
// 注意：本文件是角色卡工程 schema.ts 的前端副本。
//   酒馆MVU环境 z/_ 全局可用；前端工程需显式 import（下方两行）。
//   两处保持变量结构一致；改结构时两边同步（角色卡工程为源）。
import { z } from 'zod';
import _ from 'lodash';

// 命名约定：
//   普通名     = AI 可见可更新（叙事性状态）
//   _ 前缀     = AI 可见但不应更新（系统派生值，由脚本/前端算）
//   $ 前缀     = AI 不可见（前端/脚本内部用，如地盘据点详情）
// 数值统一 z.coerce.number()，clamp 仅设宽松上限防离谱（防胡诌细则在更新规则层）。

// ─────────────────────────────────────────
// 复用枚举（阶段制，EJS 需精确匹配，故用 z.enum）
// ─────────────────────────────────────────
const 五级开发度 = z.enum(['抗拒', '被迫接受', '无意识迎合', '轻度上瘾', '重度依赖']);
const 认知防线档 = z.enum(['死撑', '动摇', '崩溃', '母猪化']);
const 势力阶段档 = z.enum(['苟延残喘', '站稳脚跟', '一方势力', '极道豪强', '复仇终焉']);
const 淫窟规模档 = z.enum(['数十人', '近百人', '数百人', '上千人', '近万人']); // 保留备用，当前用打手总数连续值替代
const 占据规模档 = z.enum(['老宅一隅', '整座九条邸', '邻近街区', '盘踞一山', '坐拥整片城区', '小半座城']); // 6级空间扩张，驱动常识背离事件
const 时段档 = z.enum(['分配', '白天', '夜晚']);
const 经期档 = z.enum(['安全期', '危险期']); // 简化（不医学化）：危险期=受孕率↑/在场易刷高/套消耗倍率↑

// clamp 辅助：宽松上限，仅挡离谱值
const 计数 = (max = 9999999) => z.coerce.number().prefault(0).transform(v => _.clamp(Math.round(v), 0, max));
const 百分 = () => z.coerce.number().prefault(0).transform(v => _.clamp(v, 0, 100));

export const Schema = z.object({

  // ═══ 域1：时间与行动格 ═══
  时间: z.object({
    天数: z.coerce.number().prefault(1).transform(v => _.clamp(Math.round(v), 1, 99999)),
    周数: z.coerce.number().prefault(1).transform(v => _.clamp(Math.round(v), 1, 9999)),
    时段: 时段档.prefault('分配'),
    每日总行动格: z.coerce.number().prefault(8).transform(v => _.clamp(Math.round(v), 1, 24)),
    每格供奉吞吐: z.coerce.number().prefault(6).transform(v => _.clamp(Math.round(v), 1, 99)), // 可升级:6→12→18→24→30,设施升级+堕落度解锁
    白天分配格: 计数(24),
    白天已用: 计数(24),
    夜晚分配格: 计数(24),
    夜晚已用: 计数(24),
    当前行动格序号: 计数(24),
  }).prefault({}),

  // ═══ 域2：当前处境（场景）═══
  当前处境: z.object({
    地点: z.string().prefault('九条邸'),
    当前状态: z.string().prefault('日常'),
    单场在场打手人数: 计数(99999), // 当前场景施暴人数 → 避孕套消耗 + 奇观峰值来源
  }).prefault({}),

  // ═══ 域3：九条凛（主角身心状态）═══
  九条凛: z.object({
    堕落度: z.coerce.number().prefault(0).transform(v => _.clamp(Math.round(v), 0, 999999)), // 唯一来源=首次特殊事件累计；阈值硬推进认知防线+开奖励闸门
    认知防线: 认知防线档.prefault('死撑'), // 由 堕落度 阈值硬推进(系统/前端结算)，单向不可逆
    // 常规部位开发度（4项）
    身体开发度: z.object({
      小穴: 五级开发度.prefault('被迫接受'),
      肛门: 五级开发度.prefault('被迫接受'),
      口腔: 五级开发度.prefault('被迫接受'),
      子宫生育: 五级开发度.prefault('抗拒'),
    }).prefault({}),
    // 特殊性癖觉醒度（3项·独立，用户细化）
    特殊性癖觉醒度: z.object({
      排泄物接受度: 五级开发度.prefault('抗拒'),
      露出羞耻: 五级开发度.prefault('被迫接受'),
      受虐癖: 五级开发度.prefault('抗拒'),
    }).prefault({}),
    // 肉体状态（累计计数）
    肉体状态: z.object({
      小穴插入次数: 计数(), 小穴内射次数: 计数(), 小穴高潮次数: 计数(),
      肛门插入次数: 计数(), 肛门内射次数: 计数(), 肛门高潮次数: 计数(),
      口腔插入次数: 计数(), 口腔吞精次数: 计数(),
      子宫插入次数: 计数(), 子宫内射次数: 计数(), 子宫高潮次数: 计数(),
    }).prefault({}),
    怀孕周数: z.coerce.number().prefault(0).transform(v => _.clamp(Math.round(v), 0, 45)),
    生育记录: z.record(z.string().describe('记录键如"记录01"'), z.object({
      时间: z.string().prefault('未知'),
      结果: z.string().prefault('未知'),
    })).prefault({}),
    // 经期（系统周期推进）：仅安全期/危险期
    经期: 经期档.prefault('安全期'),
  }).prefault({}),

  // ═══ 域4：九条会（势力·经营核心）═══
  九条会: z.object({
    势力阶段: 势力阶段档.prefault('苟延残喘'),
    资金: z.coerce.number().prefault(8000).transform(v => _.clamp(Math.round(v), 0, 99999999)),
    // 威望双分量（总和招人，占比定风味）
    威望: z.object({
      极道威望: z.coerce.number().prefault(10).transform(v => _.clamp(Math.round(v), 0, 999999)),
      淫名: z.coerce.number().prefault(5).transform(v => _.clamp(Math.round(v), 0, 999999)),
    }).prefault({}),
    // 打手
    打手总数: z.coerce.number().prefault(30).transform(v => _.clamp(Math.round(v), 0, 999999)),
    驻守占用打手: 计数(999999),
    _可用打手: 计数(999999),      // 派生=总数-驻守
    _武力: z.coerce.number().prefault(0).transform(v => _.clamp(v, 0, 99999999)), // 派生=可用×忠诚系数
    打手忠诚度: z.coerce.number().prefault(60).transform(v => _.clamp(v, 0, 100)),
    打手欲望值: z.coerce.number().prefault(0).transform(v => _.clamp(Math.round(v), 0, 999999)),
    _欲望承载上限: z.coerce.number().prefault(60).transform(v => _.clamp(Math.round(v), 1, 999999)), // 欲望≥此值→强制请假轮奸；可由设施升级提高（拖延强制请假）
    连续未供奉记录: z.record(z.string().describe('打手批次标识'), 计数(999)).prefault({}), // 算翻倍
    // 招募（每周刷新额度，威望决定）
    招募: z.object({
      本周额度: 计数(99999),
      本周已用: 计数(99999),
    }).prefault({}),
    // 群体升级（作用于全体打手·两类词条：纯战力 / NSFW带战斗加成）partialRecord：初始可全空
    打手升级: z.partialRecord(
      z.enum(['兵器装备', '格斗训练', '精力强化', '体型改造', '调教器具']),
      计数(99) // 各项等级
    ).prefault({}),
  }).prefault({}),

  // ═══ 域5：大宅环境与资源 ═══
  大宅环境: z.object({
    避孕套库存: z.coerce.number().prefault(480).transform(v => _.clamp(Math.round(v), 0, 9999999)), // 个，2箱起
    _避孕套单次采购上限: 计数(9999999), // 派生=基础×店铺数×稳定×采购扩容升级
    占据规模: 占据规模档.prefault('老宅一隅'), // 6级空间扩张，驱动常识背离事件解锁
    暗网AV: z.object({
      总销量: z.coerce.number().prefault(0).transform(v => _.clamp(Math.round(v), 0, 999999999)),
      单部最高销量: z.coerce.number().prefault(0).transform(v => _.clamp(Math.round(v), 0, 999999999)), // 奇观峰值
    }).prefault({}),
    // 设施/经营升级（作用于大宅与凛，区别于打手群体升级）partialRecord：初始可全空
    设施升级: z.partialRecord(
      z.enum(['行动格扩容', '欲望承载上限', '采购扩容', '据点加固', '地下室设施']),
      计数(99) // 各项等级
    ).prefault({}),
  }).prefault({}),

  // ═══ 域6：地盘（AI 只读摘要；据点详情归前端 store）═══
  地盘: z.object({
    控制据点数: 计数(9999),
    控制店铺数: z.coerce.number().prefault(3).transform(v => _.clamp(Math.round(v), 0, 9999)),
    地盘稳定系数: z.coerce.number().prefault(100).transform(v => _.clamp(v, 0, 100)), // 0-100，敌方骚扰↓
    最近威胁: z.string().prefault('暂无'), // 骚扰/进攻事件摘要，供AI叙事
    已解锁区域: z.record(z.string().describe('区域名'), z.boolean()).prefault({}), // 解锁=击败该区域boss(复仇目标)
  }).prefault({}),

  // ═══ 域7：复仇进度（主线·区域boss把守地盘解锁）═══
  // 每个复仇目标=一片地盘区域的boss。击败=玩家武力+门槛已削减≥击败门槛(贿赂/调查降门槛)。击败→解锁该区域。
  复仇: z.object({
    当前阶段目标: z.string().prefault('街区的三流小势力'),
    目标进度: z.record(z.string().describe('目标/区域boss名'), z.object({
      击败门槛: z.coerce.number().prefault(100).transform(v => _.clamp(Math.round(v), 0, 9999999)),
      门槛已削减: 计数(9999999), // 贿赂/调查累积削减量
      是否击败: z.boolean().prefault(false),
      关联区域: z.string().prefault(''), // 击败后解锁的地盘区域名
    })).prefault({}),
    旁系清算: z.boolean().prefault(false), // 旁系长辈=后期一次性清算事件，非阶段目标
  }).prefault({}),

  // ═══ 域8：奇观数值（浓缩型峰值）═══
  奇观: z.object({
    单场最高在场人数: z.coerce.number().prefault(0).transform(v => _.clamp(Math.round(v), 0, 9999999)),
    单场最长连续时长小时: z.coerce.number().prefault(0).transform(v => _.clamp(v, 0, 99999)),
    单洞最大插入直径cm: z.coerce.number().prefault(0).transform(v => _.clamp(v, 0, 999)),
  }).prefault({}),

  // ═══ 域9：解锁与结局 ═══
  解锁与结局: z.object({
    已解锁服装: z.record(z.string().describe('服装名'), z.boolean()).prefault({}),
    已解锁性玩具: z.record(z.string().describe('玩具名'), z.boolean()).prefault({}),
    已解锁地点: z.record(z.string().describe('地点名'), z.boolean()).prefault({}),
    已解锁常识背离场景: z.record(z.string().describe('场景名'), z.boolean()).prefault({}),
    已触发特殊事件: z.record(z.string().describe('特殊事件名'), z.boolean()).prefault({}), // 首发账本：记录哪些特殊事件已首次发生(防重复加堕落度)+已触发的奖励闸门
    已领取奖励闸门: z.record(z.string().describe('奖励闸门名'), z.boolean()).prefault({}), // 堕落度阈值奖励(给钱给打手)一次性，防重复领
    学籍状态: z.string().prefault('在籍'), // 乙接口：解脱结局门槛
    _结局倾向: z.string().prefault('未定'), // 派生：由认知防线+开发度+复仇进度算，供过程可感知
  }).prefault({}),

});

export type Schema = z.output<typeof Schema>;
