<!--
  App · 新 UI 外壳（极道手账）
  布局: CSS Grid 三列两行（顶栏跨列）= Masthead / NavRail / Stage / RinPanel。
  「行动」视图(本批重构·减少上下滚动):
    上: 工具行 +(分配阶段)日夜滑条 + 8格事件横条(SlotStrip)
    中: 选中格子页(SlotDetail·事件选择 / 正文)，仅此区滚动
    下: 固定底边栏 = 左状态提示栏(变量变化/警告/空回) + 右操作按钮
  生成正文后自动跳到下一格(selected 复位为 null → 跟随 cursor)。
  业务调用复用 runner-store。详见 docs/UI改版工程说明.md。
-->
<template>
  <div class="app pellucid-root" @click="closePins">
    <Masthead ref="mast" :engine="r.engine" :day="r.day" />
    <NavRail v-model:view="view" @action="onNav" />

    <main class="stage">
      <!-- ===== 行动视图 ===== -->
      <section v-if="view === '行动'" class="action-view">
        <div class="av-top">
          <div class="tool-row">
            <span class="phase-label">{{ phaseLabel }}</span>
            <span class="ai-mode" :class="r.aiMode">{{ r.aiMode === 'tavern' ? '◆ 酒馆AI' : '○ mock' }}</span>
            <div class="toggles">
              <button class="tg" :class="{ on: r.fastForward }" @click="r.setFastForward(!r.fastForward)"
                title="快进：非特殊事件不调用 AI，直接出 CG + 总结词并更新数值。想刷数值/看结果就开；想读叙事就关。首次里程碑事件仍正常扩写。">⏩ 快进</button>
              <button v-if="r.fastForward" class="tg" :class="{ on: r.chainFast }" @click="r.setChainFast(!r.chainFast)"
                title="批量跳过：开启后快进会连续把可快进的格一次算完；关闭则快进只影响单格渲染，仍一格一格推进（每格停下让你确认）。">⏭ 批量跳过</button>
              <button class="tg" :class="{ on: autoAdvance }" @click="autoAdvance = !autoAdvance"
                title="自动跳转下一事件：生成正文后自动选中并展开下一格，连续推进。关闭则停留在刚生成的格子看正文，由你手动点选下一格再执行。">⤵ 自动跳转下一事件</button>
            </div>
          </div>

          <Transition name="collapse">
            <div v-if="phase === 'allocating'" class="alloc-tools">
              <DaySlider :total="r.day.totalSlots" @change="onAllocate" />
              <button v-if="r.prevSchedule" class="copy-prev" @click="onCopyPrev"
                title="把前一天你安排的行动照搬到今天：只填当前空格，与今日强占/临时事件格不冲突，越界或不合法的选项自动跳过。">
                📋 复制前一天日程
              </button>
              <span v-if="copyPrevHint" class="copy-prev-hint">{{ copyPrevHint }}</span>
            </div>
          </Transition>

          <SlotStrip v-if="hasSlots" :day="r.day" :selectedKey="selKey" @select="onSelect" />
        </div>

        <div class="av-detail">
          <TurfPanel v-if="r.pendingMap" :selectMode="r.pendingMap.kind" @cancel="r.cancelMapSelect()" />
          <SlotDetail v-else-if="hasSlots" :slot="selSlot" :period="selPeriod" :options="selOptions"
            @pick="onPick" @clear="onClear" />
          <div v-else class="av-empty">拖动上方滑条分配今日白天 / 夜晚行动格</div>
        </div>

        <!-- 通知历史(最近两天·可展开) -->
        <Transition name="collapse">
          <div v-if="showHistory" class="notify-history">
            <div class="nh-head"><span>通知历史 · 最近两天</span><button class="nh-close" @click="showHistory = false">收起 ▴</button></div>
            <div v-if="!r.notifyLog.length" class="nh-empty">暂无记录。</div>
            <div v-for="(g, gi) in historyView" :key="gi" class="nh-grp">
              <div class="nh-label">{{ g.label }}</div>
              <div class="nh-items">
                <span v-for="(s, i) in g.notices" :key="i" class="st-item" :class="s.tone">{{ s.t }}</span>
              </div>
            </div>
          </div>
        </Transition>

        <div class="av-bottom">
          <div class="status-strip">
            <template v-if="statusItems.length">
              <span v-for="(s, i) in statusItems" :key="i" class="st-item" :class="s.tone">{{ s.t }}</span>
            </template>
            <span v-else class="st-empty">— 状态提示 · 仅显示当前格 · 点右侧「历史」看最近两天 —</span>
          </div>
          <button class="hist-btn" @click="showHistory = !showHistory" :title="'查看最近两天的全部通知/警告'">历史 {{ showHistory ? '▴' : '▾' }}<span v-if="r.notifyLog.length" class="hb-n">{{ r.notifyLog.length }}</span></button>
          <div class="actions">
            <!-- 批I4-6: 重生成/续写/重roll 已集中并入 SlotDetail 正文区(点选刚执行的格即见),底部栏不再分散放置 -->
            <button v-if="phase === 'allocating' && hasSlots" class="primary-btn" @click="startDay">确定分配 · 开始 ▶</button>
            <template v-if="phase === 'day_running' || phase === 'night_running'">
              <button class="primary-btn" :disabled="r.busy || !r.canRunCurrent" @click="exec">{{ r.busy ? '生成中…' : '执行当前格 ▶' }}</button>
            </template>
            <button v-if="phase === 'day_settled'" class="primary-btn" @click="toNight">进入夜晚 ▶</button>
            <button v-if="phase === 'night_settled'" class="primary-btn" @click="toNextDay">结束今天 · 次日 ▶</button>
          </div>
        </div>
      </section>

      <!-- ===== 地盘 ===== -->
      <TurfPanel v-else-if="view === '地盘'" />

      <!-- ===== 升级 ===== -->
      <UpgradePanel v-else-if="view === '升级'" />

      <!-- ===== 影业 / AV ===== -->
      <AvPanel v-else-if="view === '影业'" />

      <SavePanel v-else-if="view === '存档'" />

      <ArchivePanel v-else-if="view === '留档'" />

      <!-- ===== 设置 · 存档管理 ===== -->
      <div v-else-if="view === '设置'" class="settings">
        <div class="set-box">
          <h3>存档 · 管理</h3>
          <p class="lead">进度<b>自动保存</b>到【当前聊天】里，刷新酒馆 / 退出重进聊天都不丢。</p>
          <div class="srow"><b>多存档 · 并行</b>：每个聊天 = 一份独立存档。在酒馆「管理聊天」里给本角色多开几个聊天，就是多个并行存档，互不影响、可随时切换。</div>
          <div class="srow"><b>开新游戏</b>：给本角色【新建聊天】= 全新一局（空存档，从头开始）。或点下方「重开本局」清空当前这个聊天的进度。</div>
          <div class="srow"><b>删除存档</b>：删掉某个聊天 = 删掉它的存档；删除角色卡会连同它的聊天一起清掉。存档是「聊天作用域」，不留全局残留。</div>
          <div class="srow"><b>性能</b>：存档存在聊天的元数据里，<b>不进入发给 AI 的上下文</b>，不烧 token、不会让酒馆变卡。体积只含当前一天 + 精简记忆日志，增长很慢。</div>
          <div class="srow" style="color:var(--green)">✓ 进度自动保存；<b>存档栏位</b>（4手动+1每日自动）在左栏「存档」页管理，坏结局时可从任意栏位读回。</div>
          <div class="set-btns">
            <button class="primary-btn" @click="view = '存档'">打开存档界面</button>
            <button class="ghost-btn" @click="reopenTutorial">重看新手教程（指引页）</button>
            <button class="danger-btn" @click="confirmReset">重开本局（清空当前进度）</button>
          </div>
        </div>
        <div class="set-box">
          <h3>AI 生成 · 选项</h3>
          <label class="srow toggle-row">
            <input type="checkbox" v-model="includePreset" @change="onPresetToggle" />
            <span><b>附加酒馆预设</b>（默认开）：把你酒馆当前预设里<b>所有已启用的条目</b>（含破甲/越狱/文风等）一并发给 AI。要注入什么请<b>直接在酒馆预设界面开关条目</b>——这里不再做二次筛选。生成总被打回时，先确认预设里的破甲条目是开着的。</span>
          </label>
          <div class="srow">
            <b>生成出问题时的自查</b>：正文空白 / 被截断 / 混进思维链时，导出最近几次实际发给 AI 的完整
            prompt 与原始返回，一眼分清是<b>被上游拦了</b>、<b>输出被截断</b>还是<b>卡本身出 bug</b>。
            反馈问题时把它一并贴出来最省事。
            <div class="set-btns">
              <button class="ghost-btn" @click="copyPromptAudit">复制最近的 prompt 与 AI 原始返回</button>
            </div>
          </div>
          <label class="srow toggle-row">
            <input type="checkbox" v-model="malePovOn" @change="onPovToggle" />
            <span><b>男性视角模式</b>（默认关）：开启后，正文以「九条会打手小头目」的男性视角展开——主人公名字取你在酒馆里的用户名（{{ povName }}），他亲身在场、可与大小姐直接互动。关闭则为默认视角（第三人称跟随凛）。改动下一格生成起生效。</span>
          </label>
        </div>
        <div class="set-box">
          <h3>前文记忆 · 注入设置</h3>
          <p class="lead">每格正文生成后，后台都会<b>无条件</b>为其生成总结（纪律性总结）。下面的设置只决定<b>发给 AI 多少前文</b>——改动立即生效。</p>
          <div class="srow">
            <b>前文原文保留</b>：注入多少最近的正文原文（细节保真层）。<b style="color:var(--gold-hi)">间隔越长注入的前文越多，token 消耗与算力负担越大。</b>
            <div class="mem-opts">
              <label v-for="(m, k) in PROSE_MODE_LABELS" :key="k" class="mem-opt" :class="{ on: memCfg.proseMode === k }" :title="m.hint">
                <input type="radio" :value="k" v-model="memCfg.proseMode" @change="onMemChange" />{{ m.label }}
              </label>
            </div>
            <div class="mem-hint">{{ PROSE_MODE_LABELS[memCfg.proseMode].hint }}</div>
          </div>
          <div class="srow">
            <b>近期总结窗口</b>：原文之外，注入最近几天的逐事件总结（窗口每日滑动，永不突然断档）。
            <div class="mem-opts">
              <label v-for="w in [10, 15, 20, 30, 60]" :key="w" class="mem-opt" :class="{ on: memCfg.windowDays === w }">
                <input type="radio" :value="w" v-model.number="memCfg.windowDays" @change="onMemChange" />{{ w }}天
              </label>
            </div>
          </div>
          <label class="srow toggle-row">
            <input type="checkbox" v-model="memCfg.bigEnabled" @change="onMemChange" />
            <span><b>远期概要（大总结）</b>（默认开）：窗口之外的更早内容，跨过整窗时在后台<b>静默</b>压缩成时期概要注入。生成期间不打扰游玩；累积过多时自动滚动合并。</span>
          </label>
        </div>
        <div class="set-box">
          <h3>副 AI · 独立端点（可选）</h3>
          <p class="lead">副 AI 负责后台任务：<b>前情小总结 / 大总结 / 数值抽取</b>——轻量结构化工作，适合换便宜快的模型省主 API 额度。不配置则与主 API 同端点。<b>正文生成始终走主 API，不受影响。</b></p>
          <label class="srow toggle-row">
            <input type="checkbox" v-model="exApi.enabled" @change="onExApiChange" />
            <span><b>启用副 AI 独立端点</b></span>
          </label>
          <div v-if="exApi.enabled" class="api-form">
            <label>端点 URL（OpenAI 兼容，如 https://api.xxx.com/v1）
              <input type="text" v-model.trim="exApi.apiurl" @change="onExApiChange" placeholder="https://…/v1" /></label>
            <label>API Key（⚠ 明文存于本机浏览器，勿在共用设备使用）
              <input type="password" v-model.trim="exApi.key" @change="onExApiChange" placeholder="sk-…" /></label>
            <label>模型
              <div class="model-row">
                <!-- 抓到列表→下拉选择;未抓取/手动模式→文本输入。两种方式都可用 -->
                <select v-if="modelList.length && !modelManual" v-model="exApi.model" @change="onExApiChange">
                  <option value="" disabled>— 选择模型 —</option>
                  <option v-for="m in modelList" :key="m" :value="m">{{ m }}</option>
                </select>
                <input v-else type="text" v-model.trim="exApi.model" @change="onExApiChange" placeholder="模型名（如 gpt-4o-mini / deepseek-chat）" />
                <button class="fetch-btn" @click="onFetchModels" :disabled="modelFetching">{{ modelFetching ? '获取中…' : '获取模型列表' }}</button>
                <button v-if="modelList.length" class="fetch-btn ghost" @click="modelManual = !modelManual">{{ modelManual ? '从列表选' : '手动输入' }}</button>
              </div>
              <div v-if="modelFetchErr" class="model-err">✗ {{ modelFetchErr }}</div>
              <div v-else-if="modelList.length" class="mem-hint">已获取 {{ modelList.length }} 个模型。</div>
            </label>
            <div class="mem-hint">改动即时生效（下一次后台总结/抽取起走新端点）。</div>
          </div>
        </div>
        <!-- DEBUG 工具条(仅测试构建·跳中后期测试点) -->
        <div v-if="DEBUG_BUILD" class="set-box debug-box">
          <h3>DEBUG · 测试工具（{{ BUILD_VERSION }}）</h3>
          <p class="lead">测试档：开局高配（¥50万/300打手/12格/威望150）。下面的按钮直接改变量，堕落度会正常触发认知推进、奖励闸门与???级联解禁。</p>
          <div class="dbg-now">堕落度 {{ r.engine.corruption }} · 资金 ¥{{ r.engine.money.toLocaleString() }} · 打手 {{ r.engine.thugTotal }} · 忠诚 {{ r.engine.loyalty }} · 淫名 {{ r.engine.infamy }} · AV已拍 {{ r.engine.av?.shotCount ?? 0 }} · 行动格 {{ r.engine.totalSlots ?? 8 }}</div>
          <div class="set-btns dbg-btns">
            <button @click="r.debugAdjust('corr+10')">堕落度 +10</button>
            <button @click="r.debugAdjust('money+5w')">资金 +5万</button>
            <button @click="r.debugAdjust('thug+50')">打手 +50</button>
            <button @click="r.debugAdjust('condom+500')">避孕套 +500</button>
            <button @click="r.debugAdjust('loyalty+10')">忠诚 +10</button>
            <button @click="r.debugAdjust('loyalty-10')">忠诚 −10</button>
            <button @click="r.debugAdjust('infamy+20')">淫名 +20</button>
            <button @click="r.debugAdjust('av+5')">AV拍摄数 +5</button>
            <button @click="r.debugAdjust('slots15')">行动格拉满(15)</button>
            <button @click="r.debugAdjust('desire0')">群体欲望清零</button>
            <button @click="r.debugAdjust('tp60')">吞吐拉满(60/格)</button>
          </div>
          <div class="set-btns dbg-btns">
            <button @click="copyPromptAudit" title="导出最近几次实际发给AI的完整prompt(含预设块/简报/注入/AI原始返回),验证注入是否生效">📋 复制最近完整prompt</button>
          </div>
        </div>
      </div>

      <!-- 大小姐页: 定位=立绘系统完全体宿主(发布后迭代)。批H4: 手机上=RinPanel 的全屏家(桌面右栏常驻,此页为占位) -->
      <div v-else-if="view === '大小姐'" class="placeholder rin-page">
        <RinPanel class="rin-inline" :engine="r.engine" />
        <div class="ph-s desk-only">桌面端右栏已常驻显示大小姐状态；此页预留给「立绘画廊」（发布后迭代）。</div>
      </div>

      <!-- ===== 其它页签：占位 ===== -->
      <div v-else class="placeholder">
        <div class="ph-t">{{ view }}</div>
        <div class="ph-s">此面板待玩法接入（见 UI改版工程说明.md §2）</div>
      </div>
    </main>

    <RinPanel class="rin-side" :engine="r.engine" />

    <Transition name="fade">
      <div v-if="saveToast" class="save-toast">{{ saveToast }}</div>
    </Transition>

    <!-- 结局/胜利 -->
    <Transition name="fade">
      <div v-if="r.showEnding && r.ending" class="ending-overlay" :class="r.ending.kind">
        <div class="ending-box">
          <div class="ed-kicker">{{ r.ending.kind === 'revenge' ? '— 终 — ' : r.ending.kind === 'fall' ? '— 堕 — ' : '— 终 — ' }}</div>
          <div class="ed-title">{{ r.ending.title }}</div>
          <!-- 结局AI演出(批C2): 演出正文生成完→替换静态文本;生成中→静态文本+提示;失败→静态文本 -->
          <div v-if="r.endingProse" class="ed-text ed-prose">{{ r.endingProse }}</div>
          <div v-else class="ed-text">{{ r.ending.text }}</div>
          <div v-if="r.endingProseBusy" class="ed-gen">✦ {{ r.endingProseLabel }} · 终幕演出生成中……（完成后自动展开，也可先行操作）</div>
          <div class="ed-btns">
            <!-- 坏结局回退(批E1): 自动档快捷回退(失败日早晨) + 打开存档界面自选栏位 -->
            <button v-if="r.ending.kind !== 'revenge' && r.autoSaveDay != null" class="primary-btn" @click="onRollback">回到第{{ r.autoSaveDay }}天开始（自动存档）</button>
            <button v-if="r.ending.kind !== 'revenge'" class="ghost-btn" @click="openSavesFromEnding">打开存档界面…</button>
            <button :class="r.ending.kind === 'revenge' ? 'primary-btn' : 'ghost-btn'" @click="confirmReset">重开本局</button>
            <button class="ghost-btn" @click="r.dismissEnding()">{{ r.ending.kind === 'fail' ? '关闭' : '继续游玩' }}</button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- 新手引导(批G3): 序章overlay(牌匾→开场白→目标)→实操教学关(Day0·手把手);guide=设置页重看速查页 -->
    <TutorialOverlay v-if="showTutorial" :mode="tutMode" @close="closeTutorial" @startStage="startTutStage" />
    <TutorialStage v-if="tutStage" @done="finishTutStage" />

    <!-- 批G4#2: 教学关有自己的生成遮罩,主遮罩不同时弹(否则两层"生成中"文字叠加=重影bug) -->
    <div v-if="r.busy && !tutStage" class="gen-overlay">
      <div class="gen-box"><div class="gen-spinner"></div><div class="gen-text">{{ r.genHint }}</div>
        <div class="gen-sub">{{ r.aiMode === 'tavern' ? '调用酒馆 API（可能需数秒到数十秒）' : 'mock 模拟' }}</div></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, inject, watch } from 'vue';
import { useRunnerStore } from './runner-store';
import { dumpPromptAudit, getIncludeTavernPreset, setIncludeTavernPreset } from './tavern-ai';
import { getMemoryConfig, setMemoryConfig, PROSE_MODE_LABELS } from './memory-settings';
import { getExtractApiConfig, setExtractApiConfig, fetchModelList } from './api-settings';
import { getMalePov, setMalePov, getUserName } from './pov-settings';
import { BUILD_VERSION, DEBUG_BUILD } from './version';
import Masthead from './components/Masthead.vue';
import NavRail from './components/NavRail.vue';
import DaySlider from './components/DaySlider.vue';
import RinPanel from './components/RinPanel.vue';
import SlotStrip from './components/SlotStrip.vue';
import SlotDetail from './components/SlotDetail.vue';
import TurfPanel from './components/TurfPanel.vue';
import UpgradePanel from './components/UpgradePanel.vue';
import AvPanel from './components/AvPanel.vue';
import SavePanel from './components/SavePanel.vue';
import ArchivePanel from './components/ArchivePanel.vue';
import TutorialOverlay from './components/TutorialOverlay.vue';
import TutorialStage from './components/TutorialStage.vue';
import { buildMenu } from '../../game/events/machine';
import { deriveEventUnlocked } from '../../game/engine/unlocked';
import { demoEventOptions } from '../../game/engine/mock-ai';
import type { EngineState } from '../../game/engine/types';
import type { EventContext } from '../../game/events/types';
import type { SlotPeriod } from '../../game/action-grid/types';

const r = useRunnerStore();
const view = ref('行动');
const mast = ref<InstanceType<typeof Masthead> | null>(null);
const autoAdvance = ref(true); // 生成后是否自动跳到下一格（开关·tool-row 按钮）
const showHistory = ref(false);
const copyPrevHint = ref(''); // 批K2: 复制前一天日程的即时反馈(3秒自消)
let copyPrevTimer: number | null = null;
const historyView = computed(() => [...r.notifyLog].reverse());

const phase = computed(() => r.day.phase);
const phaseLabel = computed(() => (({
  allocating: '早 7:00 · 分配今日行动', day_running: '白天进行中', day_settled: '白天结束',
  night_running: '夜晚进行中', night_settled: '今日结束',
} as Record<string, string>)[phase.value] ?? phase.value));
const hasSlots = computed(() => r.day.daySlots.length + r.day.nightSlots.length > 0);

// —— 选中格（默认跟随 cursor；手动点选可覆盖；执行后复位为跟随）——
const selected = ref<{ period: SlotPeriod; index: number } | null>(null);
const effSel = computed<{ period: SlotPeriod; index: number } | null>(() => {
  if (selected.value) return selected.value;
  const c = r.day.cursor;
  if (c) return { period: c.period, index: c.index };
  if (r.day.daySlots.length) return { period: 'day', index: 0 };
  if (r.day.nightSlots.length) return { period: 'night', index: 0 };
  return null;
});
const selPeriod = computed<SlotPeriod>(() => effSel.value?.period ?? 'day');
const selSlot = computed(() => {
  const s = effSel.value; if (!s) return null;
  const arr = s.period === 'day' ? r.day.daySlots : r.day.nightSlots;
  return arr[s.index] ?? null;
});
const selKey = computed(() => effSel.value ? effSel.value.period + '-' + effSel.value.index : null);
const selOptions = computed(() => effSel.value ? opts(effSel.value.period) : []);

function onSelect(period: SlotPeriod, index: number) { selected.value = { period, index }; }
function onPick(o: string, l: string) { const s = effSel.value; if (s) r.setChoice(s.period, s.index, { optionId: o, label: l }); }
function onClear() { const s = effSel.value; if (s) r.clearChoice(s.period, s.index); }

// —— 操作（执行后 selected 复位 → 自动跳到下一格 cursor）——
async function exec() {
  if (r.busy || !r.canRunCurrent) return;
  // 刺探/贿赂格:不调 AI,改为在主区展开地盘地图选目标(由 TurfPanel selectMode 处理)
  const mapKind = r.currentMapKind();
  if (mapKind) { r.beginMapSelect(mapKind); return; }
  const prev = r.day.cursor ? { period: r.day.cursor.period, index: r.day.cursor.index } : null;
  // 批I1-6: 快进开着→链式连算所有不需要AI的格,撞到第一个必出正文的格停下;快进关→单格
  await r.runCurrentChain();
  // 自动跳转开 → selected 复位跟随新 cursor；关 → 停留在刚执行(现已结算)的格看正文
  selected.value = autoAdvance.value ? null : prev;
}
// 地图选择落子完成(pendingMap 由非空→null)后,复位 selected 跟随新 cursor
watch(() => r.pendingMap, (cur, prev) => { if (prev && !cur) selected.value = null; });
function startDay() { r.beginDay(); selected.value = null; }
function toNight() { r.beginNight(); selected.value = null; }
function toNextDay() { r.nextDay(); selected.value = null; }
function onAllocate(day: number, night: number) { r.allocate(day, night); selected.value = null; }
// 批K2: 一键复制前一天日程(只在 allocating 阶段可用;需先拖滑条分好白天/夜晚格)
function onCopyPrev() {
  const n = r.applyPrevSchedule();
  selected.value = null;
  copyPrevHint.value = n > 0
    ? `已复制前一天 ${n} 项安排`
    : '当前没有可填入的空格（先拖动滑条分配白天/夜晚格）';
  if (copyPrevTimer) clearTimeout(copyPrevTimer);
  copyPrevTimer = window.setTimeout(() => { copyPrevHint.value = ''; }, 3200);
}

// (批I4-6: canRerun/续写按钮组已并入 SlotDetail 正文区,底部栏不再持有)
const gateLabel = computed(() => (r.lastSettle?.events.firedGateIds ?? []).map(g => '堕落度（' + g.replace(/\D/g, '') + '）').join('、'));

// —— 底部状态提示栏：汇总变量变化 / 警告 / 空回 ——
const statusItems = computed(() => {
  const e = r.engine; const out: Array<{ t: string; tone: string }> = [];
  if (r.hardFail) out.push({ t: '☠ 硬失败：' + (r.hardFailReason === 'money' ? '资金断流' : '威望枯竭'), tone: 'err' });
  r.failWarnings.forEach(w => out.push({ t: w, tone: 'warn' }));
  // 再生力实时预警(随当日进度·不必等日终)
  if (!r.hardFail && e.money <= 0) out.push({ t: `⚠ 资金见底（${e.money}）：今日结束前未转正，连续两日即资金断流硬失败`, tone: 'warn' });
  if (!r.hardFail && (e.martialZeroStreak ?? 0) >= 1 && (e.martialGainToday ?? 0) <= 0) out.push({ t: '⚠ 威望停滞：今日尚无极道进账，去打据点/骚扰/收生意，否则连续两日威望枯竭', tone: 'warn' });
  if (r.lastWarn) out.push({ t: '⚠ ' + r.lastWarn, tone: 'warn' });
  if (e.desire >= e.desireCapacity) out.push({ t: `⚠ 群体欲望 ${e.desire}/${e.desireCapacity} 超上限`, tone: 'warn' });
  if (r.lastServe) out.push({ t: `供奉 ${r.lastServe.served}人 · 欲望-${r.lastServe.desireRelieved} · 套-${r.lastServe.condomUsed}` + (r.lastServe.condomShort ? '（库存不足!）' : ''), tone: r.lastServe.condomShort ? 'err' : 'rose' });
  if (r.lastSettle?.events.isFirstSpecial) out.push({ t: `◆ 首次特殊 堕落+${r.lastSettle.events.corruptionGain}` + (r.lastSettle.events.cognitionAdvancedTo ? ` → ${r.lastSettle.events.cognitionAdvancedTo}` : ''), tone: 'rose' });
  if (r.lastSettle?.events.firedGateIds.length) out.push({ t: '◆ ' + gateLabel.value + ' 奖励', tone: 'gold' });
  if (r.lastRecruit && r.lastRecruit.recruited > 0) out.push({ t: `+${r.lastRecruit.recruited}打手 (¥${r.lastRecruit.cost})`, tone: 'ok' });
  if (r.lastBuyCondom && r.lastBuyCondom.bought > 0) out.push({ t: `+${r.lastBuyCondom.bought}避孕套`, tone: 'ok' });
  if (r.lastReward && r.lastReward.gained > 0) out.push({ t: `犒赏打手 · 极道忠诚 +${r.lastReward.gained}`, tone: 'gold' });
  if (r.lastProtection && r.lastProtection.income > 0) out.push({ t: `收保护费 +¥${r.lastProtection.income.toLocaleString()}`, tone: 'ok' });
  if (r.lastAvIncome && r.lastAvIncome.income > 0) out.push({ t: `AV销售 +¥${r.lastAvIncome.income.toLocaleString()}（${r.lastAvIncome.theme}）`, tone: 'gold' });
  if (r.lastAttrition > 0) out.push({ t: `打手流失 -${r.lastAttrition}（忠诚低·被挖角/出走）`, tone: 'warn' });
  if (r.lastWalk) out.push(r.lastWalk.capped
    ? { t: '散步·体质已达上限(15格),不再积累', tone: 'dim' }
    : { t: r.lastWalk.gained ? '❀ 体质大成·行动格 +1！' : `散步·体质计数 ${r.lastWalk.count}/10`, tone: r.lastWalk.gained ? 'gold' : 'dim' });
  if (r.lastOrgy) out.push({ t: `❤ 庭院群交·打手们挥霍光了避孕套（-${r.lastOrgy.wasted}·库存归零）`, tone: 'rose' });
  r.lastMystery.forEach((t: string) => out.push({ t, tone: 'rose' }));
  if (r.lastNight) out.push({ t: `夜结：供奉${r.lastNight.servedToday}人·结余${r.lastNight.desireLeftover}` + (r.lastNight.overflowImminent ? ' ⚠次日白日供奉' : ''), tone: r.lastNight.overflowImminent ? 'warn' : 'dim' });
  return out;
});

function eventCtx(engine: EngineState): EventContext {
  return { corruption: engine.corruption, cognition: engine.cognition, infamy: engine.infamy,
    thugs: engine.thugTotal, triggeredLedger: engine.triggeredSpecials, unlocked: deriveEventUnlocked(engine) };
}
function opts(period: SlotPeriod) {
  return buildMenu(Object.values(demoEventOptions), eventCtx(r.engine), period)
    .map(e => ({ optionId: e.option.id, label: e.label, isNsfw: e.isNsfw }));
}

const collapse = inject<(() => void) | null>('pellucidCollapse', null);
// 退出=收起回酒馆（进度本就自动存到聊天变量，无需手动存档按钮）
function onNav(a: 'save' | 'exit') {
  if (a === 'exit') collapse?.();
  else if (a === 'save') view.value = '存档'; // 批E1:左栏「存档」=打开存档界面(4手动+1自动栏位)
}
const saveToast = ref('');
function closePins() { mast.value?.clearPin(); }

// 新手引导(批G3): 序章(牌匾→开场白→目标)→实操教学关(Day0)。guide=设置页重看速查页。
const tutManual = ref(false);
const tutStage = ref(false);        // 实操教学关进行中
const tutDismissed = ref(false);    // 本次会话已跳过/完成(防重弹)
const showTutorial = computed(() => tutManual.value || (!r.tutorialSeen && !tutStage.value && !tutDismissed.value));
const tutMode = computed<'full' | 'guide'>(() => tutManual.value ? 'guide' : 'full');
function closeTutorial() { // 跳过序章=跳过全部教学
  if (!tutManual.value) {
    r.markTutorialSeen(); tutDismissed.value = true;
    // 批K: 跳过教学关时补发初始套(Day0的buy_condoms格未执行→condomStock=0→开局无套)
    r.skipTutorialGiveCondoms();
  }
  tutManual.value = false;
}
function startTutStage() { // 序章末页交棒: 启动 Day0 教学关
  tutDismissed.value = true;
  r.startTutorialDay0();
  tutStage.value = true;
}
function finishTutStage() {
  tutStage.value = false;
  r.markTutorialSeen();
}
function reopenTutorial() { tutManual.value = true; }

// AI生成选项(批B-3):附加酒馆预设文风块开关(默认开·localStorage 全局偏好)
const includePreset = ref(getIncludeTavernPreset());
function onPresetToggle() { setIncludeTavernPreset(includePreset.value); }

// 男性视角模式(批H2·默认关): 正文以打手小头目({{user}}名)POV展开
const malePovOn = ref(getMalePov());
const povName = ref(getUserName());
function onPovToggle() { setMalePov(malePovOn.value); povName.value = getUserName(); }

// 前文记忆注入设置(批B6):档位/窗口/大总结开关。生成层纪律性,设置只管注入→改动立即生效。
const memCfg = ref(getMemoryConfig());
function onMemChange() { setMemoryConfig({ ...memCfg.value }); }

// 副AI独立端点(批E1):小总结/大总结/数值抽取走副端点,调用时读取即时生效
const exApi = ref(getExtractApiConfig());
function onExApiChange() { setExtractApiConfig({ ...exApi.value }); }

// 模型列表抓取(批G): GET {apiurl}/models(OpenAI兼容)→下拉选择;手动输入仍可用
const modelList = ref<string[]>([]);
const modelManual = ref(false);
const modelFetching = ref(false);
const modelFetchErr = ref('');
async function onFetchModels() {
  modelFetching.value = true; modelFetchErr.value = '';
  try {
    modelList.value = await fetchModelList(exApi.value.apiurl, exApi.value.key);
    modelManual.value = false;
    // 当前填的模型不在列表里→保留但切手动模式,避免下拉显示空选中
    if (exApi.value.model && !modelList.value.includes(exApi.value.model)) modelManual.value = true;
  } catch (e) {
    modelFetchErr.value = (e as Error).message;
    modelList.value = [];
  } finally { modelFetching.value = false; }
}

// DEBUG·prompt 审计导出(批B-1):复制最近一次实际发给 AI 的完整 prompt(实证"注入是否生效")
async function copyPromptAudit() {
  const text = dumpPromptAudit();
  let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; } catch { /* clipboard 不可用走兜底 */ }
  if (!ok) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      ok = document.execCommand('copy'); ta.remove();
    } catch { ok = false; }
  }
  saveToast.value = ok ? '✓ 完整prompt已复制到剪贴板' : '✗ 复制失败(见控制台)';
  if (!ok) console.log('[pellucid] prompt审计:\n' + text);
  setTimeout(() => { saveToast.value = ''; }, 2600);
}

// 结局回退(批E1): 自动档快捷回退(失败日早晨)
function onRollback() {
  const ok = r.rollbackFromEnding();
  saveToast.value = ok ? '✓ 已回退到失败当天早晨' : '✗ 回退失败(存档缺失)';
  setTimeout(() => { saveToast.value = ''; }, 2600);
}
// 从结局画面进存档界面自选栏位(先收起overlay)
function openSavesFromEnding() { r.dismissEnding(); view.value = '存档'; }

// 设置·存档管理
function confirmReset() {
  if (window.confirm('确定清空【当前聊天】的进度、从头开始这一局？\n（其它聊天的存档不受影响。此操作不可撤销）')) {
    r.resetGame(); selected.value = null;
    saveToast.value = '✓ 已重开本局';
    setTimeout(() => { saveToast.value = ''; }, 2600);
  }
}
</script>

<style scoped>
.app { position: relative; z-index: 1; display: grid; grid-template-columns: 212px 1fr 340px; grid-template-rows: auto 1fr; height: 100vh; }
/* ═══ 批H4·手机重排(≤820px·按手机屏幕重新布局,非挤压) ═══
   结构: 刊头(固定顶) → 主区(占满·可滚) → NavRail(固定底部tab栏)。
   RinPanel 不再挤在主流里——切到「大小姐」页全屏显示(App模板层控制)。 */
.app > :deep(header) { grid-column: 1 / 4; }
.stage { overflow: hidden; display: flex; flex-direction: column; min-height: 0; }

.action-view { display: flex; flex-direction: column; height: 100%; padding: 18px 26px 0; min-height: 0; }
.av-top { flex: none; }
.av-detail { flex: 1; min-height: 0; overflow-y: auto; margin-top: 14px; }
.av-empty { color: var(--text-dim); font-size: 14px; text-align: center; padding: 40px 0; }
.av-bottom { flex: none; display: flex; align-items: stretch; gap: 14px; padding: 12px 0 16px; margin-top: 10px; border-top: 1px solid var(--line); }

.tool-row { display: flex; align-items: center; gap: 16px; margin-bottom: 14px; }
.phase-label { font-size: 13px; color: var(--text-dim); letter-spacing: 1px; }
.ai-mode { font-size: 11px; padding: 2px 8px; border-radius: 4px; }
.ai-mode.tavern { color: var(--green); background: rgba(122,163,122,.12); }
.ai-mode.mock { color: #e8a87a; background: rgba(232,168,122,.12); }
.toggles { margin-left: auto; display: flex; gap: 8px; }
.tg { font-family: var(--serif); font-size: 12px; letter-spacing: 1px; color: var(--text-dim); cursor: pointer;
  background: rgba(0,0,0,.3); border: 1px solid var(--line); border-radius: 16px; padding: 6px 14px; transition: .12s; }
.tg:hover { color: var(--text); border-color: var(--gold-dim); }
.tg.on { color: #1a120a; font-weight: 700; background: linear-gradient(180deg, var(--gold-hi), var(--gold)); border-color: var(--gold); }
/* 批K2: 分配区工具(滑条 + 复制前一天日程) */
.alloc-tools { display: flex; flex-direction: column; gap: 8px; }
.copy-prev { align-self: flex-start; font-family: var(--serif); font-size: 12px; letter-spacing: 1px;
  color: var(--gold); cursor: pointer; background: rgba(0,0,0,.3); border: 1px solid var(--gold-dim);
  border-radius: 16px; padding: 6px 14px; transition: .12s; }
.copy-prev:hover { color: #1a120a; font-weight: 700; background: linear-gradient(180deg, var(--gold-hi), var(--gold)); border-color: var(--gold); }
.copy-prev-hint { font-family: var(--serif); font-size: 12px; color: var(--text-dim); align-self: flex-start; }
/* 滑条折叠消失动画 */
.collapse-enter-active, .collapse-leave-active { transition: max-height .35s ease, opacity .28s ease, margin-bottom .35s ease, transform .35s ease; overflow: hidden; }
.collapse-enter-from, .collapse-leave-to { max-height: 0; opacity: 0; transform: translateY(-6px); margin-bottom: 0 !important; }
.collapse-enter-to, .collapse-leave-from { max-height: 220px; }

/* 底部状态提示栏 */
.status-strip { flex: 1; min-width: 0; display: flex; flex-wrap: wrap; align-content: flex-start; gap: 6px; max-height: 76px; overflow-y: auto; }
.st-item { font-size: 12px; padding: 4px 10px; border-radius: 5px; border: 1px solid var(--line); background: rgba(0,0,0,.25); white-space: nowrap; }
.st-item.ok { color: var(--green); border-color: rgba(94,122,72,.5); }
.st-item.warn { color: #e8a87a; border-color: #e8a87a; }
.st-item.err { color: var(--red-hi); border-color: var(--red-hi); background: rgba(179,33,46,.12); }
.st-item.gold { color: var(--gold-hi); border-color: var(--gold-dim); }
.st-item.rose { color: var(--rose-hi); border-color: rgba(240,106,138,.55); background: rgba(210,74,106,.1); }
.st-item.dim { color: var(--text-dim); }
.st-empty { font-size: 12px; color: var(--text-dim); align-self: center; }
.hist-btn { flex: none; align-self: center; font-family: var(--serif); font-size: 12px; color: var(--text-dim); background: rgba(0,0,0,.3); border: 1px solid var(--line); border-radius: 14px; padding: 8px 14px; cursor: pointer; white-space: nowrap; }
.hist-btn:hover { color: var(--gold-hi); border-color: var(--gold-dim); }
.hist-btn .hb-n { margin-left: 6px; font-size: 10px; color: var(--gold-dim); }
.notify-history { border: 1px solid var(--line); border-radius: 9px; background: rgba(10,7,6,.7); padding: 10px 14px; margin-bottom: 8px; max-height: 240px; overflow-y: auto; }
/* 批H4: 手机上历史面板不再受底栏挤压——限高换算视口 */
@media (max-width: 820px) { .notify-history { max-height: 34dvh; } }
.nh-head { display: flex; align-items: center; justify-content: space-between; font-size: 12px; color: var(--gold); letter-spacing: 1px; margin-bottom: 8px; border-bottom: 1px dashed var(--line); padding-bottom: 6px; }
.nh-close { font-family: var(--serif); font-size: 11px; color: var(--text-dim); background: transparent; border: none; cursor: pointer; }
.nh-empty { font-size: 12px; color: var(--text-dim); padding: 8px 0; }
.nh-grp { margin-bottom: 9px; }
.nh-label { font-size: 11px; color: var(--gold-dim); margin-bottom: 4px; }
.nh-items { display: flex; flex-wrap: wrap; gap: 6px; }

.actions { flex: none; display: flex; gap: 12px; align-items: center; }
.primary-btn { font-family: var(--serif); background: linear-gradient(180deg, var(--gold-hi), var(--gold)); color: #1a120a; border: none; border-radius: 6px; padding: 12px 26px; font-size: 15px; font-weight: 700; letter-spacing: 2px; cursor: pointer; box-shadow: 0 6px 18px rgba(201,162,74,.25); }
.primary-btn:disabled { opacity: .45; cursor: not-allowed; }
.ghost-btn { font-family: var(--serif); background: transparent; border: 1px solid var(--line); color: var(--text-dim); border-radius: 6px; padding: 12px 20px; font-size: 14px; cursor: pointer; }

.settings { padding: 22px 28px; overflow-y: auto; }
.set-box { border: 1px solid var(--line); border-radius: 10px; background: linear-gradient(180deg, var(--panel), var(--panel-2)); padding: 18px 20px; margin-bottom: 16px; max-width: 680px; }
.set-box.dim-box { opacity: .6; }
.set-box h3 { font-family: var(--brush); font-size: 24px; color: var(--gold-hi); margin-bottom: 8px; }
.set-box .lead { font-size: 14px; color: var(--text); line-height: 1.7; margin-bottom: 12px; }
.set-box .srow { font-size: 13px; color: var(--text-dim); line-height: 1.7; padding: 7px 0; border-top: 1px dashed var(--line); }
.set-box .toggle-row { display: flex; align-items: flex-start; gap: 10px; cursor: pointer; }
.set-box .toggle-row input { margin-top: 4px; flex: none; accent-color: var(--gold-hi); }
.mem-opts { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.mem-opt { display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px; border: 1px solid var(--line); border-radius: 6px; cursor: pointer; font-size: 12px; color: var(--text-dim); }
.mem-opt.on { border-color: var(--gold-hi); color: var(--gold-hi); }
.mem-opt input { accent-color: var(--gold-hi); }
.mem-hint { margin-top: 6px; font-size: 12px; color: var(--text-dim); font-style: italic; }
.api-form { display: flex; flex-direction: column; gap: 10px; margin-top: 10px; }
.api-form label { font-size: 12px; color: var(--text-dim); display: flex; flex-direction: column; gap: 4px; }
.api-form input { background: rgba(0,0,0,.3); border: 1px solid var(--line); border-radius: 6px; padding: 8px 10px; color: var(--text); font-size: 13px; font-family: inherit; }
.api-form input:focus { outline: none; border-color: var(--gold-dim); }
.model-row { display: flex; gap: 8px; align-items: stretch; }
.model-row input, .model-row select { flex: 1; min-width: 0; background: rgba(0,0,0,.3); border: 1px solid var(--line); border-radius: 6px; padding: 8px 10px; color: var(--text); font-size: 13px; font-family: inherit; }
.model-row select option { background: #1a1410; color: var(--text); }
.fetch-btn { flex: none; font-family: var(--serif); background: linear-gradient(180deg, var(--gold-hi), var(--gold)); color: #1a120a; border: none; border-radius: 6px; padding: 0 14px; font-size: 12px; font-weight: 700; cursor: pointer; }
.fetch-btn:disabled { opacity: .5; cursor: wait; }
.fetch-btn.ghost { background: transparent; border: 1px solid var(--line); color: var(--text-dim); font-weight: 400; }
.model-err { margin-top: 6px; font-size: 12px; color: var(--red-hi); }
.set-box .srow b { color: var(--gold); font-weight: 400; }
.set-btns { display: flex; gap: 12px; margin-top: 16px; }
.danger-btn { font-family: var(--serif); background: rgba(179,33,46,.12); color: var(--red-hi); border: 1px solid var(--red); border-radius: 6px; padding: 12px 22px; font-size: 14px; cursor: pointer; }
.danger-btn:hover { background: rgba(179,33,46,.22); }
.debug-box { border-color: var(--rose) !important; }
.dbg-now { margin-top: 10px; font-size: 12.5px; color: var(--gold-hi); line-height: 1.7; }
.dbg-btns { flex-wrap: wrap; gap: 8px; }
.dbg-btns button { font-family: var(--serif); background: rgba(210,74,106,.10); color: var(--rose-hi); border: 1px solid var(--rose); border-radius: 6px; padding: 9px 14px; font-size: 13px; cursor: pointer; }
.dbg-btns button:hover { background: rgba(210,74,106,.22); }
.placeholder { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; }
/* 大小姐页(批H4): 手机=RinPanel全屏家;桌面=占位说明(右栏已常驻) */
.placeholder.rin-page { padding: 0; display: block; }
.rin-inline { display: none; }
.desk-only { padding: 20px; text-align: center; }
@media (max-width: 820px) {
  .rin-side { display: none; }                      /* 右栏在手机隐藏(不再挤压主流) */
  .rin-inline { display: flex; min-height: 100%; }  /* 大小姐页内嵌全屏版 */
  .desk-only { display: none; }
}
.ph-t { font-family: var(--brush); font-size: 48px; color: var(--gold-dim); }
.ph-s { font-size: 13px; color: var(--text-dim); letter-spacing: 2px; }

.save-toast { position: absolute; bottom: 26px; left: 50%; transform: translateX(-50%); z-index: 210; /* 批H8.2: fixed→absolute */
  background: rgba(20,16,14,.95); border: 1px solid var(--gold-dim); color: var(--gold-hi);
  padding: 10px 20px; border-radius: 8px; font-size: 14px; box-shadow: 0 8px 26px rgba(0,0,0,.6); }
.fade-enter-active, .fade-leave-active { transition: opacity .3s ease, transform .3s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; transform: translateX(-50%) translateY(8px); }
.ending-overlay { position: absolute; inset: 0; z-index: 240; display: flex; align-items: center; justify-content: center; /* 批H8.2: fixed→absolute */
  background: radial-gradient(circle at 50% 40%, rgba(40,20,12,.92), rgba(6,4,4,.97)); }
.ending-overlay.fall { background: radial-gradient(circle at 50% 40%, rgba(48,16,28,.93), rgba(6,4,4,.97)); }
.ending-overlay.fail { background: radial-gradient(circle at 50% 40%, rgba(40,8,10,.94), rgba(4,3,3,.98)); }
.ending-box { max-width: 560px; text-align: center; padding: 40px; }
.ed-kicker { font-family: var(--serif); font-size: 13px; color: var(--gold-dim); letter-spacing: 6px; }
.ed-title { font-family: var(--brush); font-size: 56px; letter-spacing: 8px; margin: 14px 0 22px; color: var(--gold-hi); text-shadow: 0 0 24px rgba(201,162,74,.4); }
.ending-overlay.fall .ed-title, .ending-overlay.fail .ed-title { color: var(--rose-hi); text-shadow: 0 0 24px rgba(240,106,138,.4); }
.ed-text { font-size: 15px; color: var(--text); line-height: 2; margin-bottom: 30px; }
.ed-text.ed-prose { white-space: pre-wrap; text-align: left; max-height: 46vh; overflow-y: auto; padding-right: 8px; }
.ed-gen { font-size: 12px; color: var(--gold-dim); margin: -18px 0 22px; animation: pulse 1.6s ease-in-out infinite; }
@keyframes pulse { 0%, 100% { opacity: .5; } 50% { opacity: 1; } }
.ed-btns { display: flex; gap: 14px; justify-content: center; }
.gen-overlay { position: absolute; inset: 0; background: rgba(10,6,8,.72); display: flex; align-items: center; justify-content: center; z-index: 200; } /* 批H8.2: fixed→absolute */
.gen-box { text-align: center; }
.gen-spinner { width: 36px; height: 36px; margin: 0 auto 14px; border: 3px solid #3d2828; border-top-color: var(--gold-hi); border-radius: 50%; animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.gen-text { font-family: var(--brush); font-size: 22px; color: var(--gold-hi); letter-spacing: 2px; }
.gen-sub { font-size: 12px; color: var(--text-dim); margin-top: 6px; }

/* ═══ 手机重排(≤820px)·批H8.2: 此块必须在【所有基础规则之后】——
   同特异性选择器后者胜,原先写在文件中部导致 .stage/.action-view 等移动覆盖全成死规则
   (基础 .stage{overflow:hidden} 反杀 overflow-y:auto → 大小姐页无法滚动的根因)。 ═══ */
@media (max-width: 820px) {
  .app { display: flex; flex-direction: column; height: 100dvh; overflow: hidden; }
  .app > :deep(header) { flex: none; }
  /* 主区占满剩余高度,自身滚动(导航已布局钉底,不需 fixed 留白) */
  .stage { flex: 1; min-height: 0; overflow-y: auto; padding-bottom: 12px; }
  .action-view { padding: 10px 10px 0; height: auto; min-height: 100%; }
  .av-detail { max-height: none; overflow: visible; flex: none; }
  /* 底部操作条: 纵排(工具开关一行+状态提示+主按钮全宽) */
  .av-bottom { flex-direction: column; gap: 8px; padding: 10px 0 12px; }
  .status-strip { max-height: 64px; }
  .settings, .placeholder { padding: 12px; }
  .settings { overflow-y: visible; }
  .set-box { max-width: none; }
  /* 结局/遮罩层适配 */
  .ending-box { width: 92vw; padding: 24px 18px; }
  .placeholder.rin-page { padding: 0; }
}
</style>
