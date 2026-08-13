// Mock AI + 事件注册表 —— 无真实API时跑通游戏循环（开发/演示用）。
// 3-5c: EventOption 注册表扩展为真实事件定义(worldbookKey对齐设计稿)。

import type { AiPort } from './types';
import type { EventOption } from '../events/types';
import type { ForcedEvent } from '../events/machine';
import { initAvOnUnlock } from '../av/machine';

/** 真实事件注册表(统一模型) · 3-5c */
export const demoEventOptions: Record<string, EventOption> = {

  // ═══════════════════════════════════════════════════
  // 白天经营事件
  // ═══════════════════════════════════════════════════

  recruit: {
    id: 'recruit', label: '招募打手', period: 'day', shape: 'born_sfw',
    sfw: { worldbookKey: 'wb_recruit_sfw' },
  },

  // 攻打(地图选择型):执行→主区展开地盘地图→选可攻打关→武力判定占据
  attack: {
    id: 'attack', label: '攻打据点', period: 'day', shape: 'born_sfw',
    sfw: { worldbookKey: 'wb_attack' }, mapSelect: 'attack',
  },

  // 骚扰(地图选择型):执行→地图选未占据关→概率减员(2-3起·随阶段↑)换取随机降门槛
  harass: {
    id: 'harass', label: '骚扰敌据点', period: 'day', shape: 'born_sfw',
    sfw: { worldbookKey: 'wb_attack' }, mapSelect: 'harass',
  },

  // 犒赏打手(发钱→极道忠诚)
  reward_thugs: {
    id: 'reward_thugs', label: '犒赏打手', period: 'day', shape: 'born_sfw',
    sfw: { worldbookKey: 'wb_reward_thugs' },
  },

  defend_turf: {
    id: 'defend_turf', label: '地盘防卫·驱逐', period: 'day', shape: 'born_sfw',
    sfw: { worldbookKey: 'wb_defend_turf' },
    // 批F1(用户确认): 死事件——无数值结算,真实防守=日终自动(驻防武力vs敌强度)。
    // 移出菜单防浪费行动格;保留定义防旧存档中已安排的格崩溃。
    hiddenInMenu: true,
  },

  // 刺探(地图选择型):执行→主区展开地盘地图→选目标关→1/4概率获情报+扣钱
  scout: {
    id: 'scout', label: '刺探敌情', period: 'day', shape: 'born_sfw',
    sfw: { worldbookKey: 'wb_scout_sfw' },
    mapSelect: 'scout',
  },

  // 贿赂(地图选择型·平时隐藏,有情报才出现):执行→地图只可选已刺探关→降其击败门槛
  bribe: {
    id: 'bribe', label: '贿赂调查', period: 'day', shape: 'born_sfw',
    unlockRequires: ['bribe_available'],
    sfw: { worldbookKey: 'wb_bribe_sfw' },
    mapSelect: 'bribe',
  },

  // 双面型:收保护费(SFW威风↔NSFW人前淫乱)
  protection: {
    id: 'protection', label: '收保护费', period: 'day', shape: 'dual',
    sfw: { worldbookKey: 'wb_protect_sfw' },
    nsfw: { worldbookKey: 'wb_protect_nsfw' },
    erosionGate: { corruptionAtLeast: 25 },
    first: { ledgerKey: 'protect_first', paradigm: { worldbookKey: 'wb_protect_first' }, corruptionWeight: 1 },
    // A4 日常侵蚀: 在外人(店主)面前 NSFW=有曝光风险
    a4: { martialBase: 3, transferRatio: 0.4, loyaltyOnFail: 2, developsPart: '小穴' },
  },

  // 天生NSFW:买避孕套(四档分级·按人数/堕落度选档·stages)
  // 采购避孕套:五档逐级顶替(???解禁键+堕落度双闸门·同散步链·防跳阶段=设计保留)。
  // 素买(基础)→戴玩具(???)→被打手带着买(???)→加长轿车代购(???)→黑市送货(扩张页送货渠道)
  buy_condoms: {
    id: 'buy_condoms', label: '采购避孕套', period: 'day', shape: 'born_nsfw',
    nsfw: { worldbookKey: 'wb_buy_condom' },
    stages: [
      { corruptionAtLeast: 0, ledgerKey: 'buy_first',
        corruptionWeight: 1, firstParadigm: { worldbookKey: 'wb_buy_condom_first' }, paradigm: { worldbookKey: 'wb_buy_condom' } },
      { corruptionAtLeast: 20, unlockKey: 'buy_toy', ledgerKey: 'buy_toy_first',
        corruptionWeight: 1, firstParadigm: { worldbookKey: 'wb_buy_toy' }, paradigm: { worldbookKey: 'wb_buy_toy' } },
      { corruptionAtLeast: 35, unlockKey: 'buy_escort', ledgerKey: 'buy_l2_first',
        corruptionWeight: 1, firstParadigm: { worldbookKey: 'wb_buy_condom_l2' }, paradigm: { worldbookKey: 'wb_buy_condom_l2' } },
      { corruptionAtLeast: 50, unlockKey: 'buy_convoy_x', ledgerKey: 'buy_l3_first',
        corruptionWeight: 1, firstParadigm: { worldbookKey: 'wb_buy_condom_l3' }, paradigm: { worldbookKey: 'wb_buy_condom_l3' } },
      { corruptionAtLeast: 55, unlockKey: 'condom_courier', ledgerKey: 'buy_l4_first',
        corruptionWeight: 2, firstParadigm: { worldbookKey: 'wb_buy_condom_l4' }, paradigm: { worldbookKey: 'wb_buy_condom_l4' } },
    ],
    // A4: 公共便利店采购,有曝光风险
    a4: { martialBase: 2, transferRatio: 0.5, developsPart: '小穴' },
  },

  // 双面型:去学校上课(SFW日常↔NSFW三阶段·防跳阶段)
  school: {
    id: 'school', label: '去学校上课', period: 'day', shape: 'dual',
    sfw: { worldbookKey: 'wb_school_sfw' },
    needsContinuity: true,
    stages: [
      { corruptionAtLeast: 25, ledgerKey: 'school_25', corruptionWeight: 1,
        firstParadigm: { worldbookKey: 'wb_school25_first' }, paradigm: { worldbookKey: 'wb_school25' } },
      { corruptionAtLeast: 50, ledgerKey: 'school_50', corruptionWeight: 1,
        firstParadigm: { worldbookKey: 'wb_school50_first' }, paradigm: { worldbookKey: 'wb_school50' } },
      { corruptionAtLeast: 75, ledgerKey: 'school_75', corruptionWeight: 1,
        firstParadigm: { worldbookKey: 'wb_school75_first' }, paradigm: { worldbookKey: 'wb_school75' } },
    ],
    // A4: 校园=公共场所,有同学/讲师曝光风险
    a4: { martialBase: 4, transferRatio: 0.5, developsPart: '小穴' },
  },

  // 双面型:出门吃饭→餐厅
  dine: {
    id: 'dine', label: '出门吃饭', period: 'day', shape: 'dual',
    unlockRequires: ['occupy_street'],
    sfw: { worldbookKey: 'wb_dine_sfw' },
    nsfw: { worldbookKey: 'wb_dine' },
    erosionGate: { custom: ctx => ctx.unlocked.nsfw_dine === true },
    first: { ledgerKey: 'dine_first', paradigm: { worldbookKey: 'wb_dine_first' }, corruptionWeight: 1 },
    infamyReward: 1,
    // A4: 餐厅=公共场所(虽然包场,仍可能曝光)
    a4: { martialBase: 3, transferRatio: 0.4, developsPart: '小穴' },
  },

  // ═══════════════════════════════════════════════════
  // 扩张日常·SFW↔NSFW侵蚀反转(白日宣淫·占据规模解锁)
  // 统一结构: 双面型 dual / +忠诚高比率 / needsContinuity 记已玩场所 /
  //         首次=堕落度+ / SFW根=该活动正常版 / NSFW=该场所白日宣淫
  // ═══════════════════════════════════════════════════

  amusement: {
    id: 'amusement', label: '去游乐园', period: 'day', shape: 'dual',
    unlockRequires: ['occupy_district'],
    sfw: { worldbookKey: 'wb_amusement_sfw' },
    nsfw: { worldbookKey: 'wb_amusement' },
    erosionGate: { custom: ctx => ctx.unlocked.nsfw_amusement === true },
    first: { ledgerKey: 'amusement_first', paradigm: { worldbookKey: 'wb_amusement_first' }, corruptionWeight: 1 },
    needsContinuity: true,
  },

  beach: {
    id: 'beach', label: '去海滩', period: 'day', shape: 'dual',
    unlockRequires: ['occupy_district'],
    sfw: { worldbookKey: 'wb_beach_sfw' },
    nsfw: { worldbookKey: 'wb_beach' },
    erosionGate: { custom: ctx => ctx.unlocked.nsfw_beach === true },
    first: { ledgerKey: 'beach_first', paradigm: { worldbookKey: 'wb_beach_first' }, corruptionWeight: 1 },
    needsContinuity: true,
  },

  mall: {
    id: 'mall', label: '去商场', period: 'day', shape: 'dual',
    unlockRequires: ['occupy_street'],
    sfw: { worldbookKey: 'wb_mall_sfw' },
    nsfw: { worldbookKey: 'wb_mall' },
    erosionGate: { custom: ctx => ctx.unlocked.nsfw_mall === true },
    first: { ledgerKey: 'mall_first', paradigm: { worldbookKey: 'wb_mall_first' }, corruptionWeight: 1 },
    needsContinuity: true,
  },

  camping: {
    id: 'camping', label: '森林野营', period: 'day', shape: 'dual',
    unlockRequires: ['hill_camp'],
    sfw: { worldbookKey: 'wb_camping_sfw' },
    nsfw: { worldbookKey: 'wb_camping' },
    erosionGate: { custom: ctx => ctx.unlocked.nsfw_camping === true },
    first: { ledgerKey: 'camping_first', paradigm: { worldbookKey: 'wb_camping_first' }, corruptionWeight: 1 },
    needsContinuity: true,
  },

  hiking: {
    id: 'hiking', label: '爬山', period: 'day', shape: 'dual',
    unlockRequires: ['occupy_hill'],
    sfw: { worldbookKey: 'wb_hiking_sfw' },
    nsfw: { worldbookKey: 'wb_hiking' },
    erosionGate: { custom: ctx => ctx.unlocked.nsfw_hiking === true },
    first: { ledgerKey: 'hiking_first', paradigm: { worldbookKey: 'wb_hiking_first' }, corruptionWeight: 1 },
    needsContinuity: true,
  },

  street: {
    id: 'street', label: '街道散步', period: 'day', shape: 'dual',
    sfw: { worldbookKey: 'wb_street_sfw' },
    nsfw: { worldbookKey: 'wb_street' },
    erosionGate: { corruptionAtLeast: 30 },
    first: { ledgerKey: 'street_first', paradigm: { worldbookKey: 'wb_street_first' }, corruptionWeight: 1 },
    needsContinuity: true,
  },

  festival: {
    id: 'festival', label: '逛祭典', period: 'day', shape: 'dual',
    unlockRequires: ['occupy_district'],
    sfw: { worldbookKey: 'wb_festival_sfw' },
    nsfw: { worldbookKey: 'wb_festival' },
    erosionGate: { custom: ctx => ctx.unlocked.nsfw_festival === true },
    first: { ledgerKey: 'festival_first', paradigm: { worldbookKey: 'wb_festival_first' }, corruptionWeight: 1 },
    needsContinuity: true,
  },

  concert: {
    id: 'concert', label: '看演唱会', period: 'day', shape: 'dual',
    unlockRequires: ['occupy_halfcity'],
    sfw: { worldbookKey: 'wb_concert_sfw' },
    nsfw: { worldbookKey: 'wb_concert' },
    erosionGate: { custom: ctx => ctx.unlocked.nsfw_concert === true },
    first: { ledgerKey: 'concert_first', paradigm: { worldbookKey: 'wb_concert_first' }, corruptionWeight: 1 },
    needsContinuity: true,
  },

  // 庭院散步(散步健体解锁·体质计数:每10次+1行动格·上限15)。
  // 多阶段=???链的范式顶替:普通散步→玩具散步(顶替)→遛母狗(顶替·终态)。阶段以升级解锁键激活。
  garden_walk: {
    id: 'garden_walk', label: '庭院散步', period: 'day', shape: 'dual',
    unlockRequires: ['garden_walk'],
    sfw: { worldbookKey: 'wb_garden_walk_sfw' },
    stages: [
      { corruptionAtLeast: 0, unlockKey: 'walk_toy', ledgerKey: 'walk_toy_first',
        corruptionWeight: 2, firstParadigm: { worldbookKey: 'wb_walk_toy_first' }, paradigm: { worldbookKey: 'wb_walk_toy' } },
      { corruptionAtLeast: 1, unlockKey: 'walk_dog', ledgerKey: 'garden_dog_first',
        corruptionWeight: 2, firstParadigm: { worldbookKey: 'wb_garden_dog_first' }, paradigm: { worldbookKey: 'wb_garden_dog' } },
    ],
    needsContinuity: true,
  },

  // 庭院群交(???解锁·与遛母狗并行·效果=打手挥霍光库存避孕套)
  garden_orgy: {
    id: 'garden_orgy', label: '庭院群交', period: 'day', shape: 'born_nsfw',
    unlockRequires: ['walk_orgy'],
    nsfw: { worldbookKey: 'wb_garden_orgy' },
    first: { ledgerKey: 'garden_orgy_first', paradigm: { worldbookKey: 'wb_garden_orgy' }, corruptionWeight: 2 },
    needsContinuity: true,
  },

  garden_rock: {
    id: 'garden_rock', label: '假山野战', period: 'day', shape: 'dual',
    unlockRequires: ['courtyard'],
    sfw: { worldbookKey: 'wb_garden_sfw' },
    nsfw: { worldbookKey: 'wb_garden_rock' },
    erosionGate: { custom: ctx => ctx.unlocked.nsfw_garden_rock === true }, // 批C1:并入???解禁制(m_garden_rock)
    first: { ledgerKey: 'garden_rock_first', paradigm: { worldbookKey: 'wb_garden_rock_first' }, corruptionWeight: 1 },
    needsContinuity: true,
  },

  ancestor: {
    id: 'ancestor', label: '参拜先祖', period: 'day', shape: 'dual',
    unlockRequires: ['shrine'],
    sfw: { worldbookKey: 'wb_ancestor_sfw' },
    nsfw: { worldbookKey: 'wb_ancestor' },
    erosionGate: { custom: ctx => ctx.unlocked.nsfw_ancestor === true },
    first: { ledgerKey: 'ancestor_first', paradigm: { worldbookKey: 'wb_ancestor_first' }, corruptionWeight: 3 },
    needsContinuity: true,
  },

  // 双面型:宅内日常起居。叙事主体在凛面板的???日常淫乱化按钮(假阳具饮食/如厕/椅子);
  // 行动格里保留这个入口,任一淫乱化???解锁后翻面。
  daily_toy: {
    id: 'daily_toy', label: '日常起居', period: 'any', shape: 'dual',
    unlockRequires: ['dailytoy'],
    sfw: { worldbookKey: 'wb_dailytoy_sfw' },
    nsfw: { worldbookKey: 'wb_dailytoy' },
    erosionGate: { custom: ctx => ctx.unlocked.toy_diet === true || ctx.unlocked.toilet_lewd === true || ctx.unlocked.chair_lewd === true },
    first: { ledgerKey: 'dailytoy_first', paradigm: { worldbookKey: 'wb_dailytoy_first' }, corruptionWeight: 2 },
    needsContinuity: true,
  },

  // 双面型:让手下扫除→垃圾堆淫乱(宅邸沦陷)
  garbage: {
    id: 'garbage', label: '让手下扫除', period: 'any', shape: 'dual',
    unlockRequires: ['dailytoy'],
    sfw: { worldbookKey: 'wb_garbage_sfw' },
    nsfw: { worldbookKey: 'wb_garbage' },
    erosionGate: { custom: ctx => ctx.unlocked.nsfw_garbage === true }, // 批C1:并入???解禁制(m_garbage)
    first: { ledgerKey: 'garbage_first', paradigm: { worldbookKey: 'wb_garbage_first' }, corruptionWeight: 2 },
    needsContinuity: true,
  },

  // ─── AV 系统 ────────────────────────────────────
  // 首次AV(批F2重做): 解锁摄影室当天的【夜间】强制演出——从供奉现场自然生长(打手提议→寸止逼答应→抬去摄影室)。
  // 触发=夜间专属插入格(insert_slot·不占预算·演完即消,玩家没排夜间格也能触发)。
  av_first: {
    id: 'av_first', label: '拍摄第一部AV', period: 'night', shape: 'born_nsfw',
    unlockRequires: ['studio_unlocked'],
    nsfw: { worldbookKey: 'wb_av_first' },
    first: {
      ledgerKey: 'av_first', paradigm: { worldbookKey: 'wb_av_first' }, corruptionWeight: 3,
      // 副作用: 解锁淫名机制 + 初始化 AV state
      onApply: (engine) => initAvOnUnlock(engine),
    },
    infamyReward: 5,  // 首次AV直接给5淫名(钩到淫名引入)
    needsContinuity: true,
    pinned: true,
    hiddenInMenu: true, // 由强制事件(建成摄影室当天夜间)自动演出,不进玩家菜单
  },

  // 玩家定制AV: 仅由影业面板下单(queueAvShoot)置入行动格·受周次数限·注入定制范式
  // hiddenInMenu=不进玩家菜单(防绕过周限/范式直接选)。收益:高金钱(AV销售)+淫名。
  av_custom: {
    id: 'av_custom', label: '拍 AV', period: 'day', shape: 'born_nsfw',
    neverFast: true, // 批I1: 玩家花额度定制的演出,快进吞正文=白定制(用户反馈"AV注入不上"主因)
    unlockRequires: ['av'],
    nsfw: { worldbookKey: 'wb_av_custom' },
    infamyReward: 3,
    pinned: true,
    hiddenInMenu: true,
  },

  // ═══════════════════════════════════════════════════
  // 夜晚供奉事件(isServe=true·抵供奉吞吐)
  // ═══════════════════════════════════════════════════

  // 批I2: 完全自定义事件格——玩家自己写内容要求,AI按其生成(inlinePrompt 通道·复用AV定制机制)。
  // 无 first/isServe/计数映射 → 不加堕落/不结算供奉欲望/不进部位计数,纯演出格。
  custom_event: {
    id: 'custom_event', label: '✎ 自定义事件', period: 'any', shape: 'born_nsfw',
    neverFast: true, // 玩家亲手写的要求,永远出正文
    nsfw: { worldbookKey: 'wb_custom_event' }, // 占位·实际由 params.customPrompt 动态覆盖
  },

  serve_oral: {
    id: 'serve_oral', label: '口交侍奉', period: 'night', shape: 'born_nsfw', isServe: true, noCondom: true,
    nsfw: { worldbookKey: 'wb_serve_oral' },
    first: { ledgerKey: 'serve_oral_first', paradigm: { worldbookKey: 'wb_serve_oral_first' }, corruptionWeight: 2 },
    develops: { part: '口腔', chance: 0.35 }, // 批C1:反复口交开发口腔(概率推进·四部位面板成长)
  },

  serve_vaginal: {
    id: 'serve_vaginal', label: '供奉', period: 'night', shape: 'born_nsfw', isServe: true,
    nsfw: { worldbookKey: 'wb_serve_vaginal' },
    first: { ledgerKey: 'serve_vaginal_first', paradigm: { worldbookKey: 'wb_serve_vaginal_first' }, corruptionWeight: 2 },
    develops: { part: '小穴', chance: 0.35 },
  },

  serve_anal: {
    id: 'serve_anal', label: '肛交开发', period: 'night', shape: 'born_nsfw', isServe: true,
    unlockRequires: ['anal_unlocked'],
    nsfw: { worldbookKey: 'wb_serve_anal' },
    first: { ledgerKey: 'serve_anal_first', paradigm: { worldbookKey: 'wb_serve_anal_first' }, corruptionWeight: 3 },
    develops: { part: '肛门', chance: 0.35 },
  },

  // 浴场供奉(批C3·淫窟子页消费链: m_bath_serve??? 解禁 bath_serve 键→本事件入夜晚菜单)
  serve_bath: {
    id: 'serve_bath', label: '浴场供奉', period: 'night', shape: 'born_nsfw', isServe: true,
    unlockRequires: ['bath_serve'],
    nsfw: { worldbookKey: 'wb_bath_serve' },
    first: { ledgerKey: 'serve_bath_first', paradigm: { worldbookKey: 'wb_bath_serve_first' }, corruptionWeight: 2 },
    develops: { part: '小穴', chance: 0.35 },
    needsContinuity: true,
  },

  // 暴力供奉(地下室·受虐癖线)。建成地下室即可;细分刑具按受虐癖/深堕落逐档解锁。
  serve_violent: {
    id: 'serve_violent', label: '暴力供奉', period: 'night', shape: 'born_nsfw', isServe: true,
    unlockRequires: ['basement'],
    nsfw: { worldbookKey: 'wb_violent_serve_common' },
    first: { ledgerKey: 'serve_violent_first', paradigm: { worldbookKey: 'wb_violent_serve_common' }, corruptionWeight: 3 },
    needsContinuity: true,
  },

  // ── 暴力供奉装置(地下室主题=刑具与虐待)。装置可选 = 对应刑具升级已购(gear_*键) AND 堕落闸门。一刑具一升级,玩家自选调教路线。 ──
  // 吊颈轮奸(入门刑具·受虐癖萌芽)
  serve_violent_hang: {
    id: 'serve_violent_hang', label: '暴力供奉·吊颈', period: 'night', shape: 'born_nsfw', isServe: true,
    unlockRequires: ['gear_hang', 'masochism'],
    nsfw: { worldbookKey: 'wb_violent_hang' },
    first: { ledgerKey: 'violent_hang_first', paradigm: { worldbookKey: 'wb_violent_hang_first' }, corruptionWeight: 3 },
    needsContinuity: true,
  },
  // 三角木马(重力刑具)
  serve_violent_horse: {
    id: 'serve_violent_horse', label: '暴力供奉·三角木马', period: 'night', shape: 'born_nsfw', isServe: true,
    unlockRequires: ['gear_horse', 'masochism'],
    nsfw: { worldbookKey: 'wb_violent_horse' },
    first: { ledgerKey: 'violent_horse_first', paradigm: { worldbookKey: 'wb_violent_horse' }, corruptionWeight: 3 },
    needsContinuity: true,
  },
  // 通电木驴(深堕落)
  serve_violent_donkey: {
    id: 'serve_violent_donkey', label: '暴力供奉·通电木驴', period: 'night', shape: 'born_nsfw', isServe: true,
    unlockRequires: ['gear_donkey', 'deep_corruption'],
    nsfw: { worldbookKey: 'wb_violent_donkey' },
    first: { ledgerKey: 'violent_donkey_first', paradigm: { worldbookKey: 'wb_violent_donkey' }, corruptionWeight: 4 },
    needsContinuity: true,
  },
  // 水刑轮奸(情色窒息·深堕落)
  serve_violent_water: {
    id: 'serve_violent_water', label: '暴力供奉·水刑', period: 'night', shape: 'born_nsfw', isServe: true,
    unlockRequires: ['gear_water', 'deep_corruption'],
    nsfw: { worldbookKey: 'wb_violent_water' },
    first: { ledgerKey: 'violent_water_first', paradigm: { worldbookKey: 'wb_violent_water' }, corruptionWeight: 4 },
    needsContinuity: true,
  },
  // 杖笞调教(笞刑架·语料:杖刑五阶段+刑架姿势)
  serve_violent_cane: {
    id: 'serve_violent_cane', label: '暴力供奉·杖笞', period: 'night', shape: 'born_nsfw', isServe: true,
    unlockRequires: ['gear_cane', 'masochism'],
    nsfw: { worldbookKey: 'wb_violent_cane' },
    first: { ledgerKey: 'violent_cane_first', paradigm: { worldbookKey: 'wb_violent_cane_first' }, corruptionWeight: 3 },
    needsContinuity: true,
  },
  // 胶衣调教(拘束衣柜·语料:紧身胶衣+眼罩+嘴塞)
  serve_violent_latex: {
    id: 'serve_violent_latex', label: '暴力供奉·胶衣', period: 'night', shape: 'born_nsfw', isServe: true,
    unlockRequires: ['gear_latex', 'masochism'],
    nsfw: { worldbookKey: 'wb_violent_latex' },
    first: { ledgerKey: 'violent_latex_first', paradigm: { worldbookKey: 'wb_violent_latex' }, corruptionWeight: 3 },
    needsContinuity: true,
  },
  // 粘膜灼烧调教(灼烧药剂·语料:姜罚刑+液体刺激刑)
  serve_violent_ginger: {
    id: 'serve_violent_ginger', label: '暴力供奉·粘膜灼烧', period: 'night', shape: 'born_nsfw', isServe: true,
    unlockRequires: ['gear_ginger', 'deep_corruption'],
    nsfw: { worldbookKey: 'wb_violent_ginger' },
    first: { ledgerKey: 'violent_ginger_first', paradigm: { worldbookKey: 'wb_violent_ginger' }, corruptionWeight: 4 },
    needsContinuity: true,
  },
  // 温度调教(炙香与蜡烛·语料:炙香+低温蜡烛)
  serve_violent_wax: {
    id: 'serve_violent_wax', label: '暴力供奉·滴蜡', period: 'night', shape: 'born_nsfw', isServe: true,
    unlockRequires: ['gear_wax', 'deep_corruption'],
    nsfw: { worldbookKey: 'wb_violent_wax' },
    first: { ledgerKey: 'violent_wax_first', paradigm: { worldbookKey: 'wb_violent_wax' }, corruptionWeight: 4 },
    needsContinuity: true,
  },

  // 进阶供奉(深堕落·多人极限轮奸)
  serve_advance: {
    id: 'serve_advance', label: '进阶供奉(多人轮奸)', period: 'night', shape: 'born_nsfw', isServe: true,
    unlockRequires: ['deep_corruption'],
    nsfw: { worldbookKey: 'wb_serve_advance' },
    first: { ledgerKey: 'serve_advance_first', paradigm: { worldbookKey: 'wb_serve_advance' }, corruptionWeight: 3 },
    needsContinuity: true,
  },

  // 生育线·孕期供奉(真播种后·孕肚被使用成常态)
  serve_pregnant: {
    id: 'serve_pregnant', label: '孕期供奉', period: 'night', shape: 'born_nsfw', isServe: true,
    unlockRequires: ['pregnant_line'],
    nsfw: { worldbookKey: 'wb_pregnant' },
    needsContinuity: true,
  },
  // 生育线·临盆轮奸(分娩中持续侵犯·里程碑)
  birth_rape: {
    id: 'birth_rape', label: '临盆轮奸', period: 'night', shape: 'born_nsfw',
    unlockRequires: ['pregnant_line'],
    nsfw: { worldbookKey: 'wb_birth_rape' },
    first: { ledgerKey: 'birth_rape_first', paradigm: { worldbookKey: 'wb_birth_rape' }, corruptionWeight: 4 },
    needsContinuity: true,
  },

  // 双面型:休息(SFW睡觉↔NSFW抱枕睡奸/轮奸起居)。翻面=???「抱枕睡奸」(深度睡眠+购买大床共同后置)自动解锁。
  rest: {
    id: 'rest', label: '休息', period: 'night', shape: 'dual',
    sfw: { worldbookKey: 'wb_rest_sfw' },
    nsfw: { worldbookKey: 'wb_rape_living' },
    erosionGate: { custom: ctx => ctx.unlocked.sleep_rape === true },
    first: { ledgerKey: 'rape_living_first', paradigm: { worldbookKey: 'wb_rape_living_first' }, corruptionWeight: 2 },
  },

  // ═══════════════════════════════════════════════════
  // 强制/临时格事件(非玩家主动选)
  // ═══════════════════════════════════════════════════

  // 避孕套归零三连(避孕套库存=0 时由 forcedPool 依次强制触发·绝不可玩家主动选)
  condom_zero: {
    id: 'condom_zero', label: '避孕套归零·补救', period: 'any', shape: 'born_nsfw', hiddenInMenu: true,
    nsfw: { worldbookKey: 'wb_condom_zero_1' },
    first: { ledgerKey: 'condom_zero_1', paradigm: { worldbookKey: 'wb_condom_zero_1' }, corruptionWeight: 1 },
  },

  /** 生育线 E2: 循环利用废套(口戴套) */
  condom_zero_2: {
    id: 'condom_zero_2', label: '避孕套归零·循环利用', period: 'any', shape: 'born_nsfw', hiddenInMenu: true,
    nsfw: { worldbookKey: 'wb_condom_zero_2' },
    first: { ledgerKey: 'condom_zero_2', paradigm: { worldbookKey: 'wb_condom_zero_2' }, corruptionWeight: 2 },
    needsContinuity: true,
  },

  /** 生育线 E3: 真播种 = 终极里程碑(触发受孕状态机) */
  condom_zero_3: {
    id: 'condom_zero_3', label: '避孕套归零·真播种', period: 'any', shape: 'born_nsfw', hiddenInMenu: true,
    nsfw: { worldbookKey: 'wb_condom_zero_3' },
    first: { ledgerKey: 'condom_zero_3', paradigm: { worldbookKey: 'wb_condom_zero_3' }, corruptionWeight: 4 },
    needsContinuity: true,
    develops: { part: '子宫生育', chance: 1 }, // 批C1:真播种必推进子宫线
  },

  forced_leave: {
    id: 'forced_leave', label: '白日供奉', period: 'day', shape: 'born_nsfw', isServe: true,
    nsfw: { worldbookKey: 'wb_forced_leave' },
    first: { ledgerKey: 'forced_leave_first', paradigm: { worldbookKey: 'wb_forced_leave_first' }, corruptionWeight: 3 },
    needsContinuity: true,
    hiddenInMenu: true, // 只由欲望溢出强制霸全触发,绝不出现在玩家可选菜单
  },

  // ═══ A4 白天突发侵蚀(批C1·设计正典§4"开发度过阈值→白天自动NSFW事件") ═══
  daily_erosion: {
    id: 'daily_erosion', label: '身体擅自发情', period: 'day', shape: 'born_nsfw',
    neverFast: true, // 批K: 突发事件不被快进吞掉(玩家需看到并有机会处理)
    nsfw: { worldbookKey: 'wb_daily_erosion' },
    first: { ledgerKey: 'daily_erosion_first', paradigm: { worldbookKey: 'wb_daily_erosion_first' }, corruptionWeight: 2 },
    // 白天在外/在宅被开发过的身体擅自求欢=A面NSFW,曝光风险高(隐瞒失败转淫名较多)
    a4: { martialBase: 4, transferRatio: 0.5, loyaltyOnFail: 2 },
    needsContinuity: true,
    hiddenInMenu: true, // 只由开发度阈值扫描强制插格,不出现在玩家菜单
  },
};

/** 强制事件池 */
export const demoForcedPool: ForcedEvent[] = [
  // ─── 首次AV强制演出(批F2: 建成摄影室当天【夜间】·从供奉现场自然生长·一次性) ───
  // period 限定=只在夜间时段扫描命中→插入夜间专属临时格(不占预算,演完即消)。
  // 玩家白天买摄影室→当晚无论有没有排夜间格,进入夜间时段后本事件都会插格演出。
  {
    id: 'av_first_forced', ledgerKey: 'av_first_inserted', priority: 0, once: true,
    intensity: 'insert_slot', optionId: 'av_first', label: '拍摄第一部AV',
    condition: c => c.period === 'night' && c.unlocked?.av === true && c.triggeredLedger?.av_first !== true,
  },
  // ─── 生育线三连(避孕套归零·once+ledgerKey 依次触发) ──────────
  {
    id: 'condom_zero', ledgerKey: 'condom_zero_1', priority: 1, once: true,
    intensity: 'insert_slot', optionId: 'condom_zero', label: '避孕套归零·裸体买套',
    condition: c => c.triggeredLedger?.buy_first === true && (c.condomStock ?? 1) <= 0, // 批G2:首次采购(约定确立)后归零才触发,防开局套0误触
  },
  {
    id: 'condom_zero_2', ledgerKey: 'condom_zero_2', priority: 2, once: true,
    intensity: 'insert_slot', optionId: 'condom_zero_2', label: '避孕套归零·口戴废套',
    condition: c => c.triggeredLedger?.buy_first === true && (c.condomStock ?? 1) <= 0, // 批G2:首次采购(约定确立)后归零才触发,防开局套0误触
  },
  {
    id: 'condom_zero_3', ledgerKey: 'condom_zero_3', priority: 3, once: true,
    intensity: 'insert_slot', optionId: 'condom_zero_3', label: '避孕套归零·真播种',
    condition: c => c.triggeredLedger?.buy_first === true && (c.condomStock ?? 1) <= 0, // 批G2:首次采购(约定确立)后归零才触发,防开局套0误触
    // E3 触发副作用: 设置怀孕状态(钩到 endings.pregnant)
    onApply: () => ({ pregnant: true }),
  },
  // ─── A4 白天突发侵蚀(批C1·非一次性·白天概率触发) ───
  // 条件: 白天 && 任一部位开发度过 A4 阈值(口/穴≥2·肛≥3·子宫≥4) && 今日未触发过 && 概率命中。
  // 概率随过阈部位数上升(1个=12%/2个=20%/3+=28%),身体越被开发白天越压不住。
  {
    id: 'daily_erosion', priority: 5, once: false,
    intensity: 'insert_slot', optionId: 'daily_erosion', label: '身体擅自发情(突发)',
    condition: c => {
      if (c.period !== 'day') return false;
      if (c.dayNumber != null && c.erosionLastDay === c.dayNumber) return false; // 同日只一次
      const dev = c.bodyDevelopment ?? {};
      const thresholds: Record<string, number> = { 口腔: 2, 小穴: 2, 肛门: 3, 子宫生育: 4 };
      const ready = Object.entries(thresholds).filter(([p, t]) => (dev[p] ?? 1) >= t).length;
      if (ready === 0) return false;
      const prob = ready >= 3 ? 0.28 : ready === 2 ? 0.20 : 0.12;
      return (c.roll ?? 1) < prob;
    },
  },
  // 注:旧的"地盘骚扰强占行动格"已移除。地盘反击改为推进一天时结算(settleTurfThreat),
  //    不占行动格,只按 派驻常驻武力 vs 敌进攻强度 判定是否丢地盘,历史在地盘界面查看。
];

/** 快进总结词 */
export const demoSummaryTemplates: Record<string, string> = {
  serve_oral: '大小姐为{n}人进行了口交侍奉',
  serve_vaginal: '大小姐供奉了{n}人',
  serve_anal: '大小姐被{n}人开发了后穴',
  serve_bath: '大小姐在浴场侍奉了{n}人',
  serve_violent: '暴力供奉已完成',
  serve_violent_hang: '（已结算·吊颈轮奸）',
  serve_violent_horse: '（已结算·三角木马）',
  serve_violent_donkey: '（已结算·通电木驴）',
  serve_violent_water: '（已结算·水刑轮奸）',
  serve_violent_cane: '（已结算·杖笞调教）',
  serve_violent_latex: '（已结算·胶衣调教）',
  serve_violent_ginger: '（已结算·粘膜灼烧调教）',
  serve_violent_wax: '（已结算·温度调教）',
  serve_advance: '大小姐被{n}人极限轮奸',
  serve_pregnant: '大小姐挺着孕肚被{n}人使用',
  birth_rape: '（已结算·临盆轮奸）',
  rest: '凛回房歇下，养精蓄锐。',
  recruit: '招募事宜处理完毕。',
  scout: '刺探已完成。',
  buy_condoms: '采购了一批避孕套。',
  attack: '据点战事已了结。',
  harass: '骚扰行动已结束。',
  bribe: '贿赂之事已办妥。',
  reward_thugs: '犒赏了麾下打手，人心稍定。',
  protection: '保护费已收讫。',
  school: '大小姐处理了学校事务。',
  dine: '外出用餐完毕。',
  daily_toy: '大小姐的日常起居处理完毕。',
  garbage: '宅子打扫了一番。',
  garden_walk: '大小姐在庭院散步锻炼了一阵。',
  garden_orgy: '（庭院群交·避孕套被挥霍一空）',
  forced_leave: '（已结算白日供奉）',
  condom_zero_2: '大小姐在打手的指使下，循环利用了几个用过的避孕套。',
  condom_zero_3: '——避孕套用完了。打手们对视而笑。',
};

/** extract 防胡诌范围 */
export const demoExtractBounds: Record<string, [number, number]> = {
  presentCount: [0, 2000],
};

/** 供奉类 optionId */
export const demoServeOptionIds = Object.values(demoEventOptions).filter(o => o.isServe).map(o => o.id);

/** 假 AI */
export function createMockAi(): AiPort {
  return {
    async expand(req) {
      const { resolution, attitude, state } = req;
      const tag = resolution.renderMode === 'ai_full' ? '【首次·重点扩写】'
        : resolution.renderMode === 'ai_normal' ? '【NSFW常规】'
        : '【略写】';
      const wb = resolution.paradigm.inlinePrompt ? '定制范式' : resolution.paradigm.worldbookKey;
      const text = `${tag}（mock 正文·态度:${attitude}）凛执行了「${resolution.option.label}」。`
        + `在场约 ${state.presentCount} 人。这里将来是 AI1 按范式 ${wb} 扩写的正文。`;
      const continuity = resolution.option.needsContinuity
        ? `（mock延续摘要）「${resolution.option.label}」发生了需后续回调的独特事实。`
        : undefined;
      return { text, continuity };
    },
    async extract(req) {
      return { presentCount: req.state.presentCount || 18 };
    },
    // 后台总结(批B6)·mock 用截断实现,保证无API环境总结链也能跑通
    async summarize(req) {
      const head = req.kind === 'event' ? '(mock小总结)' : req.kind === 'period' ? '(mock大总结)' : '(mock合并)';
      return `${head}${req.text.slice(0, 60).replace(/\n/g, ' ')}……`;
    },
  };
}
