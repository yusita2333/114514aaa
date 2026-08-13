// AV 系统 · 核心逻辑（纯函数）
// 设计正典§9 + 内容_v2 第七部分:
//   - 第一次AV = 强制演出事件(wb_av_first 范式·一次性·解锁淫名机制)
//   - 后续AV玩家定制: 选题材/情景/玩法/时长 → 拼 inlinePrompt 注入 buildGamePrompt
//   - 每周编辑次数限制(初始2,可升级)
//   - 选项置顶(EventOption.pinned=true)
//   - 触发条件: 摄影室升级解锁(studio_unlocked)
//
// 核心数据结构: AvDefinition(题材/场景/玩法/时长)→ buildAvPrompt 组装成 inlinePrompt

import { AV_UNLOCK_KEY } from '../prestige/machine';
import { avPlayCap } from '../upgrade/machine';
import type { EngineState } from '../engine/types';
import type { ParadigmRef } from '../events/types';

// ───────────────────────────────────────────────
// AV 定制要素(对齐设计·v2.md L716-723)
// 每类用枚举字符串,UI 选项菜单按这些枚举构建。
// ───────────────────────────────────────────────

export type AvTheme =
  | '玩具调教' | '高潮挑战' | '男M' | '女M' | '本格性爱'
  | '目隐NTR' | '目前NTR' | '人数挑战' | '时长挑战'
  | '淫语调教' | '公开处刑' | '灌精挑战' | '阿黑颜定格' | '寸止折磨'
  | '道具贯穿' | '失禁奇观' | '强制发情' | '训练成果展示';

export type AvSetting =
  | '学校' | '职场' | '医院' | '伦理乱伦'
  | '奇幻角色扮演' | '二次元角色扮演' | '偶像'
  | '神社巫女' | '婚礼新娘' | '公共厕所' | '监禁地下室'
  | '温泉旅馆' | '拍卖会' | '直播间' | '异种族交配' | '庆功宴酒席'
  // 布景棚(av_stage 升级)新增棚内场景
  | '电车车厢' | '和室' | '教堂圣坛' | '雨夜街头(棚内)';

/**
 * 场景→所需布景升级(一钮一tag)。null=初始免费(宅内现成:地下室/公厕项圈/宴席)。
 */
export const SETTING_REQ: Record<AvSetting, string | null> = {
  '监禁地下室': null, '公共厕所': null, '庆功宴酒席': null,
  '学校': 'av_set_school', '职场': 'av_set_office', '医院': 'av_set_clinic', '伦理乱伦': 'av_set_family',
  '奇幻角色扮演': 'av_set_fantasy', '二次元角色扮演': 'av_set_cosplay', '偶像': 'av_set_idol',
  '神社巫女': 'av_set_shrine', '婚礼新娘': 'av_set_bridal', '温泉旅馆': 'av_set_onsen',
  '拍卖会': 'av_set_auction', '直播间': 'av_set_stream', '异种族交配': 'av_set_alien',
  '电车车厢': 'av_set_train', '和室': 'av_set_washitsu', '教堂圣坛': 'av_set_church', '雨夜街头(棚内)': 'av_set_rain',
};

/** 情趣衣装(一件一钮·语料服装节有质感/暴露方式现成描写) */
export type AvOutfit =
  | '女仆装' | '日式校服' | '体操服' | '修女服' | 'OL制服'
  | '旗袍' | '和服' | '泳装' | '婚纱' | '紧身胶衣';

/** 衣装→所需衣装升级(一钮一tag) */
export const OUTFIT_REQ: Record<AvOutfit, string> = {
  '女仆装': 'av_out_maid', '日式校服': 'av_out_seifuku', '体操服': 'av_out_gym', '修女服': 'av_out_nun',
  'OL制服': 'av_out_ol', '旗袍': 'av_out_qipao', '和服': 'av_out_kimono', '泳装': 'av_out_swim',
  '婚纱': 'av_out_wedding', '紧身胶衣': 'av_out_latex',
};

/** 人数档(默认低两档;大部队需三机位,海量需环形机位) */
export type AvCast = '少人数(2-3)' | '小队(5-6)' | '大部队(十余人)' | '海量(数十人)';
export const CAST_REQ: Partial<Record<AvCast, string>> = {
  '大部队(十余人)': 'av_cam3',
  '海量(数十人)': 'av_cam8',
};

export type AvPlay =
  | '口' | '手' | '足' | '小穴' | '臀'
  | '深喉' | '颜射' | '中出' | '潮吹' | '双插' | '乳交'
  | '捆绑' | '道具' | '露出' | '灌肠扩张' | '坐脸' | '多P拓扑' | '群交围操';

/** AV 玩家定制定义(由 UI 收集) */
export interface AvDefinition {
  theme: AvTheme;
  setting: AvSetting;
  plays: AvPlay[];      // 至少一项
  durationHours: number; // 1..上限(可升级)
  /** 角色扮演填空(场景=角色扮演时·NPC关系) */
  setupNote?: string;
  /** 玩家自由输入(额外意见,直接拼入范式·允许玩家自定义编辑AV内容) */
  custom?: string;
  /** 情趣衣装(可选·需 av_outfits 升级) */
  outfit?: AvOutfit;
  /** 出演人数档(可选·高档需 av_cams 升级;不选=按题材默认) */
  cast?: AvCast;
}

/** AV 系统的 EngineState 字段(嵌入 EngineState 的 av 子对象) */
export interface AvState {
  weeklyQuota: number;         // 本周剩余编辑次数
  weeklyQuotaMax: number;      // 上限(初始2·可升级)
  durationCap: number;         // 时长上限(小时·初始48·可升级)
  shotCount: number;           // 总拍摄次数(数值奇观)
  customs: AvDefinition[];     // 历史定制档案(去重展示·UI画廊用)
}

/** AV 初始状态(开始游戏时·解锁前不可用) */
export function defaultAvState(): AvState {
  return { weeklyQuota: 0, weeklyQuotaMax: 2, durationCap: 48, shotCount: 0, customs: [] };
}

// ───────────────────────────────────────────────
// 解锁判定 · 钩到现有 prestige/intrusion
// ───────────────────────────────────────────────

/** AV 是否解锁(摄影室建好·钩到 prestige.AV_UNLOCK_KEY 同一标签) */
export function isAvSystemUnlocked(engine: EngineState): boolean {
  return engine.unlocked[AV_UNLOCK_KEY] === true || engine.unlocked.studio_unlocked === true;
}

/** 是否可以新拍 AV(解锁 + 本周还有次数 + 时长在上限内) */
export function canShootAv(engine: EngineState, def: AvDefinition): { ok: boolean; reason?: string } {
  if (!isAvSystemUnlocked(engine)) return { ok: false, reason: 'AV 系统未解锁(需先建摄影室或拍首部AV)' };
  const av = engine.av ?? defaultAvState();
  if (av.weeklyQuota <= 0) return { ok: false, reason: '本周编辑次数已用完' };
  if (def.durationHours <= 0) return { ok: false, reason: '时长必须 > 0' };
  if (def.durationHours > av.durationCap) return { ok: false, reason: `时长超出上限 ${av.durationCap}h` };
  if (def.plays.length === 0) return { ok: false, reason: '至少选一项玩法' };
  const cap = avPlayCap(engine.upgrades);
  if (def.plays.length > cap) return { ok: false, reason: `同时玩法tag上限 ${cap}（升级可提升）` };
  // 一钮一tag门槛:场景/衣装/人数档各查对应升级
  const sReq = SETTING_REQ[def.setting];
  if (sReq && !(engine.upgrades?.[sReq])) return { ok: false, reason: `该场景需「布景」升级` };
  if (def.outfit && !(engine.upgrades?.[OUTFIT_REQ[def.outfit]])) return { ok: false, reason: `该衣装需对应「衣装」升级` };
  const cReq = def.cast ? CAST_REQ[def.cast] : undefined;
  if (cReq && !(engine.upgrades?.[cReq])) return { ok: false, reason: '该规模需「机位」升级' };
  return { ok: true };
}

// ───────────────────────────────────────────────
// inlinePrompt 组装 · 把定制要素拼成 AI 可读的范式正文
// 设计: 题材定基调、场景定情景外壳与服装、玩法定身体部位侧重、时长定侧面烘托强度
// ───────────────────────────────────────────────

/** 题材→基调 词条(给 AI 的方向锚) */
const THEME_TONE: Record<AvTheme, string> = {
  '玩具调教': '密集器具刺激·凛被强制接受多种玩具(跳蛋/按摩棒/电极)·身体反应被无情放大',
  '高潮挑战': '强制连续高潮·凛被推到失神边缘后又被推下一波·身体不允许平复',
  '男M': '反向(凛短暂掌控)·然后被反扑·短控制后的报复',
  '女M': '受虐受辱核心·痛→快感转译重笔墨·身体明明该痛却分泌',
  '本格性爱': '不靠玩具/暴力/角色扮演,纯粹大量长时间多人轮奸·拓扑配置完整',
  '目隐NTR': '凛被蒙眼·不知道谁在用·全凭触觉气味辨别·恐惧叠加敏感',
  '目前NTR': '凛清醒看着每一个上来的男人·屈辱具象化',
  '人数挑战': '极限多人·规模奇观·拓扑写满·换组节奏不停',
  '时长挑战': '超长时长·环境光流转·背景音日常作息·肉体碰撞从未停一秒',
  '淫语调教': '强制念下流台词·凛颤抖的声音承认自己是肉便器·羞耻让脸烧红身体却先湿',
  '公开处刑': '数十双贪婪充血的眼睛在镜头后·凛知道全程被无数人观看·被注视感本身成为持续刺激·皮肤起栗乳尖立起',
  '灌精挑战': '以"灌满"为奇观核心·一次次内射堆积·凛小腹微微鼓胀与穴口溢出的痕迹·身体被填满到本能收缩',
  '阿黑颜定格': '全程推向极致失神·表情凝固在阿黑颜·双眼失焦舌头无力吐出口水牵丝·意识溶解只剩身体的自动反射',
  '寸止折磨': '反复被推到边缘又被掐断·不许高潮·凛身体绷紧到发抖·腰胯不受控地追逐迎合·哀求从抗拒变成乞求',
  '道具贯穿': '超规格器具的填入与开发·身体被强制撑开适应·凛的反应从抗拒的僵直转为软化吞含',
  '失禁奇观': '以潮吹/失禁为卖点·凛被逼到身体彻底失控·喷溅与水痕作为可视化的快感量化·她羞耻地想合拢双腿却被分开',
  '强制发情': '媚药/熏香铺垫·凛的身体先于意识背叛她·明明抗拒却自己扭动·体温升高呼吸变乱·理智与肉体撕裂',
  '训练成果展示': '"开发度汇报"框架·把凛被调教的成果当作品展演·她被要求主动表演已学会的反应·屈辱地证明自己被改造了多少',
};

/** 场景→情景外壳词条 */
const SETTING_SHELL: Record<AvSetting, string> = {
  '学校': '校园情景剧·制服/教室/讲台·学校的"清纯"外壳与里面发生的事强反差',
  '职场': 'OL 制服·办公室桌椅会议室·"职场精英"形象与肉便器现实的倒错',
  '医院': '诊疗室/检查台·"病人"角色·医疗器械被滥用',
  '伦理乱伦': '家庭角色(继兄/继父/叔伯)·禁忌叙事·"家人"称呼下的轮奸',
  '奇幻角色扮演': '精灵/魔物/异世界·种族锚定(可借口"娇小"·罗刹瞳是天然奇幻角色)',
  '二次元角色扮演': 'cosplay 二次元角色·服装高度还原·凛被迫扮演她不喜欢的角色',
  '偶像': '偶像演唱会舞台/后台·"粉丝见面会"变质·偶像光环下的轮奸',
  '神社巫女': '巫女装/神乐铃/祭坛·"净化仪式"外壳·神圣装束被玷污的反差·凛跪在供台上身体的颤抖',
  '婚礼新娘': '纯白婚纱/头纱·"最幸福的一天"被彻底倒错·礼服被一层层掀开·凛在众人见证下被夺走的反差感',
  '公共厕所': '印着"公厕"字眼的项圈·凛被当作大宅公用器物·任人排队取用·身体被物件化使用的麻木与本能反应',
  '监禁地下室': '昏暗密闭/锁链氛围·与世隔绝的时间感·凛失去昼夜概念·只剩身体被使用的循环',
  '温泉旅馆': '和服/汤浴/榻榻米·暧昧潮湿的氛围·薄汗与热气贴在凛泛红的肌肤上·浴衣半褪的画面',
  '拍卖会': '凛作为"展品"被竞价·被翻看检视身体·价高者优先取用·被当作商品估价的屈辱与身体的瑟缩',
  '直播间': '镜头/弹幕/打赏氛围·"实时观看"框架·凛知道有无数观众在线·打赏越多施加的刺激越强',
  '异种族交配': '借奇幻外壳的体型/数量奇观·种族设定锚定"娇小"差·凛身体被迫适应的开发过程(罗刹瞳禁损伤词)',
  '庆功宴酒席': '极道宴席/酒桌之间·她作为"余兴节目"在席间被传递取用·觥筹交错的背景音与凛被使用的画面交错',
  // 布景棚场景(av_stage)
  '电车车厢': '棚内1:1电车布景·吊环座椅报站音效·"通勤中被围住"的痴汉剧码·车厢晃动配合顶撞节奏',
  '和室': '榻榻米/障子门/灯笼暖光·跪坐礼仪与被押倒的反差·障子纸上的影子成为镜头语言',
  '教堂圣坛': '彩窗圣坛烛台布景·忏悔与"洗礼"的亵渎剧码·圣洁布光下的白纱与体液',
  '雨夜街头(棚内)': '洒水管造雨/霓虹灯牌·湿透衣物贴出身体轮廓·"淋雨被拾走"的开场剧码',
};

/** 衣装→词条(av_outfits·质感/暴露方式·取材语料服装节) */
const OUTFIT_LABEL: Record<AvOutfit, string> = {
  '女仆装': '黑白围裙短裙·裙撑一掀即翻·"侍奉"人设与被侍奉现实的倒错',
  '日式校服': '水手服百褶裙·裙摆卷起塞进腰间·清纯符号被玷污的经典反差',
  '体操服': '贴身弹力布勒出身形·下装一拉到底·体育课情景剧',
  '修女服': '黑袍白领圈·层层布料下的雪白·神圣装束被一寸寸剥开',
  'OL制服': '衬衫铅笔裙丝袜·丝袜只撕裆部一块·干练形象崩坏',
  '旗袍': '高开衩贴身盘扣·开衩被撕到腰际·盘扣一颗颗崩开的仪式感',
  '和服': '层层腰带襦袢·解带如拆礼·衣带散落榻榻米的画面',
  '泳装': '连体/比基尼·布料一拨即入·水痕与体液分不清',
  '婚纱': '纯白头纱束胸裙撑·"最幸福的一天"倒错·礼服层层掀开在众人见证下',
  '紧身胶衣': '乳胶真空包裹反着冷光·裆部拉链只拉开一段·黑壳里剥出滚烫白肉',
};

/** 人数档→词条 */
const CAST_LABEL: Record<AvCast, string> = {
  '少人数(2-3)': '2-3人·镜头能拍全每个动作·节奏细腻',
  '小队(5-6)': '5-6人·双穴口手同时分配·换人不停机',
  '大部队(十余人)': '十余人·多机位才拍得全·围成一圈的规模压迫',
  '海量(数十人)': '数十人·规模奇观·镜头只能拍局部,全景交给画外音与"排到门外"的暗示',
};

/** 玩法部位→词条 */
const PLAY_LABEL: Record<AvPlay, string> = {
  '口': '口腔(深喉/喉射/坐脸/舔蛋)',
  '手': '手活(双手并用/夹击)',
  '足': '足交(脚趾/足弓)',
  '小穴': '阴道(各体位/双插/打桩)',
  '臀': '肛门(扩张/双插/灌满)',
  '深喉': '顶到喉咙深处·画外音清晰的深喉水声与干呕·凛喉部本能收缩·眼角生理性泛起水光',
  '颜射': '镜头特写凛的脸·被尽数射在脸上·她无力闭眼承受·液体顺脸颊滑落的画面定格',
  '中出': '内射与灌满的核心·镜头特写穴口·拔出后溢出的痕迹·凛身体本能地收缩想留住',
  '潮吹': '被逼到喷溅失控·水痕作为快感的可视量化·凛羞耻地想合拢双腿却被分开·身体不受控地痉挛',
  '双插': '两穴同时被填满·身体被撑到极限的适应·只见被夹在中间剧烈摇晃的躯体·反应从绷紧转为瘫软',
  '乳交': '娇小身躯的胸部被迫服务·夹挤的画面·乳尖随动作摩擦立起·凛低头看着的羞耻表情',
  '捆绑': '绳缚束缚·身体被固定无法挣动·勒出的纹路衬出肌肤·只能承受的无力感与放大的每一处触觉(罗刹瞳禁损伤词)',
  '道具': '跳蛋/按摩棒/电极等器具·密集刺激被无情放大·身体反应被逼到表面',
  '露出': '在半公开/被注视下进行·被看见感叠加刺激·凛想遮掩却被强制展开·皮肤起栗的本能反应',
  '灌肠扩张': '后穴的清洗与逐级扩张准备·器具的填入·身体从抗拒的僵直到被迫适应的软化过程',
  '坐脸': '凛被迫以面部服务·画外音的闷哼与水声·只见上方扭动的腰胯与下方挣扎的双手',
  '多P拓扑': '多人同时使用的拓扑配置写满·换组节奏不停·局部轮替·换人间隙凛的双穴仍一张一合自动寻找',
  '群交围操': '数人环绕同时取用·镜头无法拍到全貌·凛娇小躯体被淹没其中·只能从局部摇晃与画外音脑补全景',
};

/**
 * 组装 AV 定制的 inlinePrompt(注入 buildGamePrompt 的范式槽).
 * 输出= "继承 wb_av_first 三阶段结构 + 限知视角 + 本次定制要素"
 */
export function buildAvPrompt(def: AvDefinition): string {
  const tone = THEME_TONE[def.theme];
  const shell = SETTING_SHELL[def.setting];
  const playList = def.plays.map(p => PLAY_LABEL[p]).join(' / ');
  const note = def.setupNote ? `角色扮演填空: ${def.setupNote}` : '';
  const custom = def.custom?.trim() ? `玩家自定意见(优先满足): ${def.custom.trim()}` : '';
  const outfit = def.outfit ? `- 衣装: ${def.outfit} → ${OUTFIT_LABEL[def.outfit]}(服装的质感/暴露方式全程参与叙事)` : '';
  const cast = def.cast ? `- 出演规模: ${def.cast} → ${CAST_LABEL[def.cast]}` : '';

  // 时长侧面烘托等级
  const durTier = def.durationHours < 8 ? '中等(8小时内)' :
                  def.durationHours < 24 ? '长(8-24小时·分Part)' :
                  '超长(24h+·环境光流转/背景音日常作息全开/地板垃圾堆积)';

  return `[AV 玩家定制·动态范式]
本次AV定制要素(三阶段结构继承 wb_av_first·限知视角继承):
- 题材基调: ${def.theme} → ${tone}
- 场景外壳: ${def.setting} → ${shell}
- 玩法部位: ${playList}(笔墨侧重以上部位的开发/反应/感官)
- 时长烘托: ${def.durationHours}小时 → ${durTier}
${outfit ? outfit + '\n' : ''}${cast ? cast + '\n' : ''}${note ? note + '\n' : ''}${custom ? custom + '\n' : ''}
按 wb_av_first 三阶段写: ①屈辱情景剧前戏(服装+念台词) ②无尽轮奸+限知视角(局部画面+画外音脑补) ③超长时长侧面烘托(快感痕迹+环境光+背景音+地板垃圾).
铁律: 罗刹瞳禁损伤词;不沉痛;笔墨重心永远是凛的身体反应,不是男性数量/动作展示.`;
}

/** 完整组装成 ParadigmRef(用于注入 EventResolution.paradigm 替代世界书查找) */
export function buildAvParadigm(def: AvDefinition): ParadigmRef {
  return {
    worldbookKey: 'wb_av_custom',           // 元数据用·实际不查
    inlinePrompt: buildAvPrompt(def),       // 真正注入的范式正文
  };
}

// ───────────────────────────────────────────────
// 状态更新 · 拍摄消费 / 周刷新 / 升级
// ───────────────────────────────────────────────

/**
 * 一部AV的销售收入(高收益·受周次数限制平衡)。
 * = 基础 + 时长×单位 + 玩法数×加成 + 淫名×系数(名气越大越好卖)。
 * 设计: 单部收益高(用户定),但每周拍摄次数有限(weeklyQuota,升级解锁)。
 */
export function avSalesIncome(def: AvDefinition, infamy: number, incomeMult = 1): number {
  const base = 5000;
  const byDuration = def.durationHours * 150;
  const byPlays = def.plays.length * 1200;
  const byInfamy = Math.min(8000, infamy * 60); // 名气加成封顶
  return Math.round((base + byDuration + byPlays + byInfamy) * incomeMult); // 观众来信(avIncomeMult)加成
}

/** 消费一次拍摄: 写入 customs / 扣 weeklyQuota / 累加 shotCount */
export function consumeShoot(av: AvState, def: AvDefinition): AvState {
  return {
    ...av,
    weeklyQuota: Math.max(0, av.weeklyQuota - 1),
    shotCount: av.shotCount + 1,
    customs: [...av.customs, def],
  };
}

/** 每周刷新: weeklyQuota 重置为 weeklyQuotaMax(由 settleDaily 在第 N 天调用) */
export function refreshWeeklyQuota(av: AvState): AvState {
  return { ...av, weeklyQuota: av.weeklyQuotaMax };
}

/** 升级: 提升 weeklyQuotaMax(每级 +1) */
export function upgradeAvQuota(av: AvState, levels = 1): AvState {
  return { ...av, weeklyQuotaMax: av.weeklyQuotaMax + Math.max(0, levels) };
}

/** 升级: 提升 durationCap(每级 +24h·封顶 168h=7天) */
export function upgradeAvDuration(av: AvState, levels = 1): AvState {
  return { ...av, durationCap: Math.min(168, av.durationCap + Math.max(0, levels) * 24) };
}

/**
 * AV 首次解锁: 返回 EngineState 补丁(用于 FirstMilestone.onApply / ForcedEvent.onApply)。
 * 写入: unlocked.av + unlocked.studio_unlocked + av.weeklyQuota=max(开局就能拍下一部)
 */
export function initAvOnUnlock(engine: EngineState): Record<string, unknown> {
  const av = engine.av ?? defaultAvState();
  return {
    unlocked: { ...engine.unlocked, [AV_UNLOCK_KEY]: true, studio_unlocked: true },
    av: { ...av, weeklyQuota: av.weeklyQuotaMax },
  };
}
