# 新 UI（极道手账 · 木纹②）工程说明

> 新对话/后期改动必读。本文件解释新前端 UI 的**架构、组件职责、数据来源、占位项**，便于调整。
> 视觉定稿见 `docs/ui-mockups/变体B-木纹方案2.html`（HTML 空壳原型，是本实现的视觉真相源）。

## 1. 视觉系统（design tokens）

集中在 `src/jiutiao/界面/状态栏/global.css` 的 `:root`：

- **配色**：黑金为主（背景/边框/按钮）+ 红装饰 + 白文字。变量 `--gold/--gold-hi/--gold-dim/--red/--red-hi/--text/--text-dim/--line/--ink/--panel`。
- **字体**（zeoseven CDN，@import 在 global.css 顶部）：
  - 标题/水墨：云峰飞云体 `--brush`（YFFYT，446）
  - 正文/正体：京华老宋体 `--serif`（KingHwaOldSong，309）
- **木纹**：`--wood-h`（横向，顶栏）/`--wood-v`（纵向，左栏）= 方案② 粗犷大纹，无打光。
- **滚动条**：全局细化暗金（融合式）。

改配色/字体/木纹只动 global.css 的 `:root` 与对应 wood 变量。切换 UI 风格（设置里"更换风格"）= 换一套 tokens。

## 2. 布局与组件树

`App.vue` = 外壳，CSS Grid 三列两行（顶栏跨列）：

```
┌──────────── Masthead（顶栏·跨列）──────────────┐
│ NavRail │      Stage（主舞台）       │ RinPanel │
│ (左栏)  │  当前只渲染「行动」视图     │ (右栏凛) │
└─────────┴───────────────────────────┴──────────┘
```

| 组件 | 文件 | 职责 | 数据来源 |
|------|------|------|---------|
| **App.vue** | `界面/状态栏/App.vue` | 外壳布局 + 导航视图切换 + 「行动」视图编排（分配/逐格执行/反馈/遮罩） | runner-store |
| **Masthead.vue** | `components/Masthead.vue` | logo + 顶部状态条（资金/威望/打手/欲望/避孕套/堕落度 + 悬停浮窗 + 点击钉住） | engine |
| **NavRail.vue** | `components/NavRail.vue` | 左侧木纹导航按钮 + 存读档/设置/退出 | v-model:view |
| **DaySlider.vue** | `components/DaySlider.vue` | 日夜分配滑动长条（整格吸附·拖拽） | emit allocate(day,night) |
| **SlotStrip.vue** | `components/SlotStrip.vue` | 8格事件横条(对齐滑条分格)：每格=事件预览(序号/状态/标签)，点选 emit select | day |
| **SlotDetail.vue** | `components/SlotDetail.vue` | 选中格的子页：事件选择列表 / 进行中 / 已结算正文(首字水墨+段落 pre-wrap) | App 传 slot |
| **RinPanel.vue** | `components/RinPanel.vue` | 立绘人像 + 可折叠秘密状态（身体开发四部位/特殊性癖/生育经期） | engine |
| **TurfPanel.vue** | `components/TurfPanel.vue` | 地盘地图(#13 大改)：4阶段×(10小关+1中枢Boss)≈44关地图 + 点块弹窗攻打 + 刺探/贿赂选择模式 | engine.regions + turf模块 + combatPowerNow |
| **UpgradePanel.vue** | `components/UpgradePanel.vue` | 升级视图(#16)：打手/设施/扩张三类 catalog 可视化升级(canUpgrade/applyUpgrade) | engine + upgrade模块 |
| **AvPanel.vue** | `components/AvPanel.vue` | 影业/AV视图(#17)：题材/场景/玩法/时长定制→排入行动格执行注入范式 | engine.av + av模块 |

**#13 地盘玩法·4阶段44关地图**(后端 turf 模块大改完成·v33):
- ✅地图(v33): REGIONS 重构为 4 阶段，每阶段 10 小关(无名据点)+1 中枢Boss关 ≈ 44 关。TurfPanel 分阶段选项卡 + 地图块(点亮=占据/红=未纳入/锁=未解锁) + 点块弹窗看详情+攻打。阶段锁：阶段1开局激活；占满本阶段10小关→解锁中枢Boss；击败Boss→解锁下一阶段10小关。中枢门槛 > 本阶段所有小关，亦 > 下阶段小关起点(第1阶段中枢比第2阶段小关更难)。
- ✅刺探/贿赂事件格流程(v33): scout/bribe = `mapSelect` 选项。执行刺探格→主区展开地图选目标→约1/4概率获情报+扣¥800；贿赂选项平时隐藏(`bribe_available`)，有情报后出现，执行→地图只可选已刺探关→按门槛比例降击败门槛。RegionState 加 `intel` 字段。
- ⬜攻打仍为直接数值判定(点弹窗攻打·不占白天格)。骚扰/进攻 settleHarass/settleRaid 已就绪未接循环。
- ⬜复仇/扩张推进后解除「威望轨硬失败暂挂」(settlement.ts 威望轨硬失败已启用→true) + 接 #14 威望自动衰减。

**「行动」视图交互(v26 重构·减少上下滚动)**: 上=工具行+(分配阶段)日夜滑条+SlotStrip横条；中=SlotDetail(仅此区滚动)；下=固定底边栏(左 status-strip 显示变量变化/警告/空回，右 操作按钮)。选中格默认跟随 cursor；执行正文后自动跳下一格(`selected` 复位)。格数增加只是横条变长，不增上下滚动。
旧 `SlotCard.vue` 已弃用(被 Strip+Detail 取代)，保留文件备查。

导航 `view`：`行动/地盘/升级/影业/设置` 均为完整可玩视图(v33)；`大小姐/留档` 仍占位。刺探/贿赂格在「行动」视图执行时，主区(av-detail)临时切换为 TurfPanel 选择模式(`r.pendingMap`)，落子后复位。

## 3. 数据映射 / 占位清单

✅=已接真数据　🟡=占位（对应后端待办，玩法/变量完善后接）

**顶部状态条**
- 资金 ✅ `engine.money`；流水明细 🟡（task #12 资源流水账本未做，先用最近一格的已知 delta 拼）
- 威望双色条 ✅ `martialPrestige`(极道) / `infamy`(淫名) 算占比
- 打手·在场 ✅ `thugTotal` / `presentCount`；招募额度 ✅ `recruitQuota`
- 群体欲望 ✅ `desire/desireCapacity`；今晨累积 ✅ `desireAddedThisMorning`
- 避孕套 ✅ `condomStock`；昨日/今日消耗 + 折线图 🟡（消耗未逐日追踪，task 待建）
- 堕落度 ✅ `corruption`/`cognition`；下阶段距离+奖励 ✅（读 COGNITION_THRESHOLDS + REWARD_GATES 计算）

**右栏秘密状态**
- 身体开发度·四部位 ✅ `engine.bodyDevelopment`（口腔/小穴/肛门/子宫生育，各 0-4 级）
- 每部位次数（插入/内射等）🟡（未分部位计数）
- 特殊性癖·三项觉醒度 🟡（受虐癖/暴露癖/便器意识，未建变量）
- 内心独白 🟡（按 cognition 给一句占位文案）
- 怀孕 ✅ `engine.pregnant`；经期 ✅ `isDangerousPeriod`

占位项都在组件里用 `// TODO(数据)` 标注，接后端时按本表替换。

## 4. 与旧实现的关系

- 旧 `App.vue`（功能版·朴素样式）整体被本版替换；业务调用（runner-store 的 allocate/runCurrent/rerunLast/nextDay 等）原样复用，只换表现层。
- `components/StatusBar.vue`（旧顶栏）废弃不再引用，保留文件备查。
- 发版流程不变（见 `../../jiutiao/README.md`），pack 后务必解码验证卡内 sha。

## 5. 改动指引（后期）

- 调色/字体/木纹 → global.css `:root`
- 加/改顶部数值 → Masthead.vue 的 `stats` 计算 + 对应浮窗
- 接某个占位数据 → 按 §3 表找到 🟡 项，组件内 `// TODO(数据)` 处替换
- 新增导航页（地盘/升级…）→ NavRail 的 items + App.vue 的视图分支换成真实面板组件
