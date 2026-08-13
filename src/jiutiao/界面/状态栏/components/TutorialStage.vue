<!--
  TutorialStage · 实操新手教学关(批G3·Day0·用户定稿)
  独立全屏界面: 只有3个事件格+时间滑块,其它功能全部不存在。
  手把手步骤: 滑块2+1 → 格1收保护费(金钱说明·快进结算) → 格2买避孕套(扩写机制说明+副API询问+真实生成)
    → 着重介绍快进/下一格 → 夜格选休息 → Day0结算 → 收尾说明 → 进入第1天。
  收益真实入账(保护费的钱+买到的套=开局资源)。文案原则: 大白话,宁繁勿涩。
-->
<template>
  <!-- 批G4#3: 收尾说明(end)时遮罩变透视——底下已是第1天真实界面,说明"左边/右边"时用户能看到实物 -->
  <div class="stage-overlay" :class="{ reveal: step === 'end' }">
    <div v-if="step === 'end'" class="end-card">
      <div class="gb-popup-text" v-html="popup?.text"></div>
      <div class="gb-popup-btns">
        <button v-for="b in popup?.btns" :key="b.label" class="gb-btn" :class="{ gold: b.gold }" @click="b.onClick">{{ b.label }}</button>
      </div>
    </div>
    <div v-else class="stage-inner">
      <!-- 步骤说明横幅(大白话) -->
      <div class="guide-banner" :class="{ pulse: bannerPulse }">
        <div class="gb-tag">新手教学 · 第 {{ stepNo }}/8 步</div>
        <div class="gb-text" v-html="banner"></div>
        <div v-if="popup" class="gb-popup">
          <div class="gb-popup-text" v-html="popup.text"></div>
          <div class="gb-popup-btns">
            <button v-for="b in popup.btns" :key="b.label" class="gb-btn" :class="{ gold: b.gold }" @click="b.onClick">{{ b.label }}</button>
          </div>
        </div>
      </div>

      <!-- 滑块(步骤1) -->
      <div v-if="phase === 'allocating'" class="stage-block">
        <DaySlider :total="3" :initialDay="1" @change="onSlider" />
      </div>

      <!-- 3格条 -->
      <SlotStrip v-if="hasSlots" :day="r.day" :selectedKey="selKey" @select="onSelect" />

      <!-- 选中格·选项/正文区(教学专用简版,可控高亮/禁用) -->
      <div class="stage-detail" v-if="detailSlot">
        <!-- 选项列表(未执行) -->
        <div v-if="detailSlot.status !== 'done'" class="opt-list">
          <div class="opt-title">{{ detailSlot.period === 'day' ? '白天能做的事' : '夜晚能做的事' }}</div>
          <button v-for="o in menuOptions" :key="o.id" class="opt-btn"
            :class="{ target: o.id === targetOption, picked: detailSlot.choice?.optionId === o.id, disabled: targetOption && o.id !== targetOption }"
            :disabled="!!targetOption && o.id !== targetOption"
            @click="pickOption(o)">
            {{ o.label }}<span v-if="o.id === targetOption" class="opt-arrow">◂ 点这个</span>
          </button>
        </div>
        <!-- 已执行正文 -->
        <div v-else class="prose-box">
          <div class="prose-text">{{ detailSlot.resultText }}</div>
        </div>
      </div>

      <!-- 底部操作区(教学版快进/自动跳转/执行按钮·与正式界面同款,供介绍) -->
      <div class="stage-bottom">
        <div class="tool-demo" :class="{ hl: step === 'buttons' }">
          <button class="tg" :class="{ on: r.fastForward }" @click="r.setFastForward(!r.fastForward)">⏩ 快进</button>
          <button class="tg on">⏭ 自动跳转</button>
        </div>
        <button v-if="mainBtn" class="main-btn" :disabled="mainBtn.disabled || r.busy" @click="mainBtn.onClick">
          {{ r.busy ? '生成中…' : mainBtn.label }}
        </button>
      </div>
    </div>

    <!-- 生成遮罩 -->
    <div v-if="r.busy" class="gen-mask"><div class="gen-txt">{{ r.genHint }}</div></div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import DaySlider from './DaySlider.vue';
import SlotStrip from './SlotStrip.vue';
import { useRunnerStore } from '../runner-store';
import { demoEventOptions } from '../../../game/engine/mock-ai';

const emit = defineEmits<{ done: [] }>();
const r = useRunnerStore();

// ─── 步骤状态机 ───
type Step = 'slider' | 'pick1' | 'money' | 'pick2' | 'expand' | 'api' | 'gen' | 'buttons' | 'night' | 'end';
const step = ref<Step>('slider');
const stepNo = computed(() => ({ slider: 1, pick1: 2, money: 2, pick2: 3, expand: 3, api: 4, gen: 5, buttons: 6, night: 7, end: 8 }[step.value]));
const bannerPulse = ref(true);
const selKey = ref<string | null>(null);
const phase = computed(() => r.day.phase);
const hasSlots = computed(() => r.day.phase !== 'allocating' || r.day.dayCount + r.day.nightCount > 0);

// 大白话横幅
const banner = computed(() => ({
  slider: '欢迎！这里是<b>教学关</b>，我带你把第一天走一遍。<br>先看下面这根<b>长条</b>：它决定今天白天做几件事、晚上做几件事。<b>按住中间的把手，拖到「白天 2 / 夜晚 1」</b>。',
  pick1: '好了！下面出现了 3 个格子——前 2 个是白天的，最后 1 个是晚上的。<br><b>点第 1 个格子</b>，给它安排一件事。今天先去<b>收保护费</b>。',
  money: '',
  pick2: '第 2 个格子：还记得开场白吗？大小姐今天必须去<b>买避孕套</b>。<b>点第 2 个格子，选「采购避孕套」</b>。',
  expand: '',
  api: '',
  gen: '都安排好了！点下面的金色按钮<b>「开始这一天」</b>——收保护费会快速结算，然后<b>真正让 AI 写一段「买避孕套」的正文</b>给你看。',
  buttons: '看到正文了吧！现在<b>重点来了</b>，看左下角那两个按钮：<br><b>「⏩ 快进」</b>：开着它，事件就不找 AI 写正文了，直接一句话结算完。刷日常、赶进度的时候特别省时间省钱（API 费用）。想看正文就关掉它。<br><b>「⏭ 自动跳转」</b>：开着它，一格演完自动跳到下一格，不用你每格都点一下。<br>这两个按钮在正式界面的左上角，<b>一定要记住它们</b>。',
  night: '最后是晚上的格子。晚上主要就两件事：<b>「供奉」</b>（让打手们用大小姐的身体发泄，维持他们的忠诚）和<b>「休息」</b>（什么都不做）。今天累了，<b>点夜晚格子，选「休息」</b>。',
  end: '',
}[step.value] ?? ''));

// 弹出说明(带按钮·大白话)
interface PopupBtn { label: string; gold?: boolean; onClick: () => void }
const popup = ref<{ text: string; btns: PopupBtn[] } | null>(null);

// 目标选项(引导时只许点它,其它禁用)
const targetOption = computed(() => ({
  pick1: 'protection', pick2: 'buy_condoms', night: 'rest',
}[step.value as string] ?? null));

// 菜单(教学过滤): 白天只有3项,夜晚2项
const menuOptions = computed(() => {
  const period = detailSlot.value?.period;
  const ids = period === 'night' ? ['serve_vaginal', 'rest'] : ['protection', 'buy_condoms', 'recruit'];
  return ids.map(id => ({ id, label: demoEventOptions[id]?.label ?? id }));
});

const detailSlot = computed(() => {
  if (!selKey.value) return null;
  const dash = selKey.value.lastIndexOf('-');
  const p = selKey.value.slice(0, dash), i = Number(selKey.value.slice(dash + 1));
  const list = p === 'day' ? r.day.daySlots : r.day.nightSlots;
  return list[i] ?? null;
});

// ─── 步骤动作 ───
function onSlider(dayN: number, nightN: number) {
  r.allocate(dayN, nightN);
  if (step.value === 'slider' && dayN === 2 && nightN === 1) {
    step.value = 'pick1';
    selKey.value = null;
  }
}
function onSelect(period: string, index: number) { selKey.value = `${period}-${index}`; }

function pickOption(o: { id: string; label: string }) {
  const slot = detailSlot.value; if (!slot) return;
  r.setChoice(slot.period, slot.index, { optionId: o.id, label: o.label });
  if (step.value === 'pick1' && o.id === 'protection') {
    step.value = 'money';
    popup.value = {
      text: '<b>关于钱（￥）</b>，用大白话说：<br>· <b>钱怎么来</b>：收保护费、以后占了地盘每天自动进账、再往后拍片子卖钱。<br>· <b>钱怎么花</b>：招打手要钱、升级设施要钱、贿赂对手要钱、买避孕套也要钱。<br>· 钱<b>不能见底</b>：账上连续两天没钱，九条会就撑不下去了（游戏失败）。<br>记住一句话：先挣钱，再花钱。',
      btns: [{ label: '明白了，下一步', gold: true, onClick: () => { popup.value = null; step.value = 'pick2'; selKey.value = null; } }],
    };
  } else if (step.value === 'pick2' && o.id === 'buy_condoms') {
    step.value = 'expand';
    popup.value = {
      text: '<b>这个游戏的正文是怎么来的？</b><br>你安排的每个格子，执行时分两种情况：<br>· <b>重要的事</b>（第一次发生的、色色的、有剧情的）→ 会让 AI 写一段完整的正文给你看。<br>· <b>普通的事</b>（日常经营、重复做过的）→ 只出一句话总结＋数字变化，不浪费你的时间和 API 钱。<br>像现在这个「买避孕套」是第一次发生，等会儿就会生成完整正文。',
      btns: [{ label: '懂了，继续', gold: true, onClick: showApiPopup }],
    };
  } else if (step.value === 'night' && o.id === 'rest') {
    finishNight();
  }
}

function showApiPopup() {
  step.value = 'api';
  popup.value = {
    text: '<b>关于 AI（API）</b>：<br>· 正文由你酒馆里<b>当前连的 AI</b> 来写，不用额外设置。<br>· 游戏后台还有些小活（记前情、抓数字），默认也用同一个 AI。如果你想给这些小活换个<b>便宜点的模型</b>省钱，以后可以去「设置 → 副 AI 独立端点」里配置，还能一键拉取模型列表。<br>现在不用管它，先玩起来。',
    btns: [
      { label: '知道了，开始玩', gold: true, onClick: () => { popup.value = null; step.value = 'gen'; } },
    ],
  };
}

const mainBtn = computed<{ label: string; disabled?: boolean; onClick: () => void } | null>(() => {
  if (step.value === 'gen' && phase.value === 'allocating') return { label: '开始这一天 ▸', onClick: startDay0Run };
  if (step.value === 'buttons') return { label: '记住了，去晚上 ▸', onClick: goNight };
  return null;
});

// 批H7(用户反馈:第6步卡死): 此前生成失败也照样进第6步,白天时段未结算完,
// 「去晚上」的 beginNight 阶段校验失败后静默 return=点哪都没反应。
// 现在: 逐格补跑白天剩余格,失败弹重试弹窗(错误可见),goNight 遇阶段异常先补跑再进夜。
async function runDay0Remaining(): Promise<boolean> {
  while (r.day.phase === 'day_running') {
    const idx = r.day.cursor?.index ?? 0;
    selKey.value = `day-${idx}`;
    // 格1(idx0)=收保护费快进结算;格2(idx1)=买避孕套真实生成
    r.setFastForward(idx === 0);
    await r.runCurrent();
    if (r.error) {
      r.setFastForward(false);
      popup.value = {
        text: '<b>正文生成失败</b>：' + r.error + '<br>（常见原因：API 网络波动 / 外部审核拦截 / 超时。不影响进度，点重试再来一次。）',
        btns: [{ label: '重试 ▸', gold: true, onClick: () => { popup.value = null; void startDay0Run(); } }],
      };
      return false;
    }
  }
  r.setFastForward(false);
  return true;
}

async function startDay0Run() {
  if (r.day.phase === 'allocating' && !r.beginDay()) {
    popup.value = {
      text: '<b>无法开始</b>：' + (r.error ?? '阶段异常') + '<br>请重开聊天重进教学；若反复出现请截图反馈。',
      btns: [{ label: '知道了', onClick: () => { popup.value = null; } }],
    };
    return;
  }
  if (await runDay0Remaining()) step.value = 'buttons';
}

async function goNight() {
  // 白天有格没结算完(此前生成失败) → 先补跑,不再静默死掉
  if (r.day.phase === 'day_running') {
    if (!(await runDay0Remaining())) return; // 失败已弹重试弹窗
  }
  if (!r.beginNight()) {
    popup.value = {
      text: '<b>进入夜晚失败</b>：' + (r.error ?? '阶段异常') + '<br>请截图反馈给开发。',
      btns: [{ label: '知道了', onClick: () => { popup.value = null; } }],
    };
    return;
  }
  step.value = 'night';
  selKey.value = 'night-0';
}

async function finishNight() {
  // 休息格: 开快进秒过
  r.setFastForward(true);
  await r.runCurrent();
  r.setFastForward(false);
  if (r.error) { // 批H7: 夜格结算失败也给重试出口,不静默
    popup.value = {
      text: '<b>结算失败</b>：' + r.error + '<br>点重试再来一次。',
      btns: [{ label: '重试 ▸', gold: true, onClick: () => { popup.value = null; void finishNight(); } }],
    };
    return;
  }
  r.nextDay(); // Day0 结算 → 第1天
  step.value = 'end';
  popup.value = {
    text: '<b>教学结束！</b>教学的幕布已经掀开——你现在看到的就是<b>真实的游戏界面</b>（正式的第 1 天）。对照着看：<br>'
      + '· <b>看左边那一竖排按钮</b>：「行动」就是你刚玩的这套；「地盘」打架抢地盘；「升级」花钱变强（带♥的是色色的东西）；「影业」以后解锁；「存档」「留档」「设置」也在这排。<br>'
      + '· <b>看右边那一栏</b>：大小姐本人——立绘、她的秘密状态、还有「结局倾向」，实时告诉你这一局正在滑向哪个结局。<br>'
      + '· <b>存档</b>：进度随时自动保存，另有 4 个手动档＋1 个每天自动档，输了可以退回去。<br>'
      + '· <b>留档</b>：看到写得好的正文，点正文下面的「❤ 收藏」，以后随时回看。<br>'
      + '· 最后两句忠告：<b>晚上要供奉</b>稳住打手的忠诚；<b>避孕套见底</b>前记得让大小姐亲自去买。<br>'
      + '九条会的复兴，从今天开始。',
    btns: [{ label: '开始经营 ▸', gold: true, onClick: () => { popup.value = null; emit('done'); } }],
  };
}
</script>

<style scoped>
/* 批H8.2: fixed→absolute(锚.app全屏盒·窄屏fixed不渲染对策) */
.stage-overlay { position: absolute; inset: 0; z-index: 88; background: rgba(8, 5, 4, .97); display: flex; align-items: flex-start; justify-content: center; overflow-y: auto; }
/* 收尾透视(批G4#3): 遮罩变淡·底下第1天真实界面可见·说明卡收窄居中不挡左右 */
.stage-overlay.reveal { background: rgba(8, 5, 4, .38); align-items: center; transition: background .5s; }
.end-card { width: min(560px, 82vw); max-height: 82vh; overflow-y: auto; border: 1px solid var(--gold-dim); border-radius: 14px; background: linear-gradient(180deg, rgba(20,14,10,.97), rgba(12,8,6,.97)); padding: 22px 26px; box-shadow: 0 18px 60px rgba(0,0,0,.8); }
.stage-inner { width: min(860px, 94vw); padding: 26px 0 40px; display: flex; flex-direction: column; gap: 16px; }
@media (max-width: 820px) { .stage-inner { padding: 12px 0 30px; gap: 10px; } .guide-banner { padding: 12px 14px; } } /* 批H4 */
.guide-banner { border: 1px solid var(--gold-dim); border-radius: 12px; background: linear-gradient(180deg, rgba(201,162,74,.08), var(--panel)); padding: 16px 22px; }
.guide-banner.pulse { animation: bannerGlow 2.2s ease-in-out infinite; }
@keyframes bannerGlow { 0%, 100% { box-shadow: 0 0 0 rgba(201,162,74,0); } 50% { box-shadow: 0 0 18px rgba(201,162,74,.25); } }
.gb-tag { font-size: 11px; color: var(--gold-dim); letter-spacing: 3px; margin-bottom: 6px; }
.gb-text { font-size: 15px; line-height: 1.9; color: var(--text); }
.gb-text :deep(b) { color: var(--gold-hi); }
.gb-popup { margin-top: 14px; border-top: 1px dashed var(--line); padding-top: 14px; }
.gb-popup-text { font-size: 14px; line-height: 1.9; color: var(--text); }
.gb-popup-text :deep(b) { color: var(--gold-hi); }
.gb-popup-btns { display: flex; gap: 10px; margin-top: 12px; }
.gb-btn { font-family: var(--serif); background: transparent; border: 1px solid var(--line); color: var(--text-dim); border-radius: 6px; padding: 9px 20px; font-size: 13px; cursor: pointer; }
.gb-btn.gold { background: linear-gradient(180deg, var(--gold-hi), var(--gold)); color: #1a120a; border: none; font-weight: 700; }
.stage-block { flex: none; }
.stage-detail { border: 1px solid var(--line); border-radius: 10px; background: linear-gradient(180deg, var(--panel), var(--panel-2)); padding: 16px 20px; }
.opt-title { font-size: 12px; color: var(--gold-dim); letter-spacing: 3px; margin-bottom: 10px; }
.opt-list { display: flex; flex-direction: column; gap: 8px; }
.opt-btn { display: flex; align-items: center; justify-content: space-between; font-family: var(--serif); text-align: left; background: rgba(0,0,0,.25); border: 1px solid var(--line); color: var(--text); border-radius: 8px; padding: 12px 16px; font-size: 14px; cursor: pointer; }
.opt-btn.target { border: 2px solid var(--gold-hi); animation: optPulse 1.5s ease-in-out infinite; }
.opt-btn.picked { border-color: var(--green); }
.opt-btn.disabled { opacity: .35; cursor: not-allowed; }
.opt-arrow { color: var(--gold-hi); font-size: 12px; animation: hintPulse 1.5s ease-in-out infinite; }
@keyframes optPulse { 0%, 100% { box-shadow: 0 0 4px rgba(236,200,120,.2); } 50% { box-shadow: 0 0 16px rgba(236,200,120,.55); } }
@keyframes hintPulse { 0%, 100% { opacity: .5; } 50% { opacity: 1; } }
.prose-box { max-height: 44vh; overflow-y: auto; }
.prose-text { font-size: 15px; line-height: 2; color: var(--text); white-space: pre-wrap; }
.stage-bottom { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.tool-demo { display: flex; gap: 8px; padding: 8px 10px; border: 1px dashed var(--line); border-radius: 8px; }
.tool-demo.hl { border: 2px solid var(--gold-hi); animation: optPulse 1.5s ease-in-out infinite; }
.tg { font-family: var(--serif); background: transparent; border: 1px solid var(--line); color: var(--text-dim); border-radius: 6px; padding: 7px 14px; font-size: 12px; cursor: pointer; }
.tg.on { color: var(--gold-hi); border-color: var(--gold-dim); }
.main-btn { font-family: var(--serif); background: linear-gradient(180deg, var(--gold-hi), var(--gold)); color: #1a120a; border: none; border-radius: 8px; padding: 13px 38px; font-size: 15px; font-weight: 700; letter-spacing: 3px; cursor: pointer; box-shadow: 0 6px 18px rgba(201,162,74,.3); }
.main-btn:disabled { opacity: .5; cursor: wait; }
.gen-mask { position: absolute; inset: 0; z-index: 92; background: rgba(0,0,0,.6); display: flex; align-items: center; justify-content: center; }
.gen-txt { font-family: var(--brush); font-size: 26px; color: var(--gold-hi); letter-spacing: 6px; animation: hintPulse 1.6s ease-in-out infinite; }
</style>
