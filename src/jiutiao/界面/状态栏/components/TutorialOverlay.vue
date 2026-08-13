<!--
  TutorialOverlay · 新手引导序章(批G2→批G3重构·用户定稿)
  full 模式(每聊天首次): 牌匾演出(点击展开)→开场白(运行时读卡·带滚动条)→目标 → emit('startStage') 交棒实操教学关(TutorialStage)。
  guide 模式(设置页重看): 单页操作速查(大白话),不含牌匾/开场白/目标。
-->
<template>
  <div class="tut-overlay">
    <button class="tut-skip" @click="$emit('close')">{{ mode === 'guide' ? '✕ 关闭' : '跳过教学 ✕' }}</button>

    <!-- 页0·牌匾演出(仅full) -->
    <div v-if="page === 'plaque'" class="tut-page plaque-page" @click="next">
      <div class="plaque">
        <div class="plaque-frame">
          <div class="plaque-text">血债血偿<br>百倍奉还</div>
          <div class="plaque-sub">九 条 家 家 训</div>
        </div>
      </div>
      <div class="plaque-hint">—— 点击牌匾 ——</div>
    </div>

    <!-- 页1·开场白(仅full·运行时读卡·带滚动条) -->
    <div v-else-if="page === 'story'" class="tut-page">
      <div class="tut-body story-body"><span class="first">{{ storyFirst }}</span>{{ storyRest }}</div>
      <div class="tut-btns"><button class="tut-next" @click="next">继续 ▸</button></div>
    </div>

    <!-- 页2·目标(仅full·末页交棒教学关) -->
    <div v-else-if="page === 'goal'" class="tut-page">
      <h2 class="tut-h">这 个 游 戏 玩 什 么</h2>
      <div class="tut-body">
        <div class="goal-row"><b>白天：把失去的抢回来。</b><br>招人、挣钱、打地盘。打赢四个阶段的 Boss，最后干掉杀了凛父母的弥生道会长，复仇就成了。</div>
        <div class="goal-row"><b>晚上：大宅里的另一套规矩。</b><br>手下的打手不领工资也肯卖命，靠的是「供奉」——用大小姐的身体喂饱他们。怎么安排，你说了算。</div>
        <div class="goal-row"><b>结局不止一个。</b><br>金盆洗手、畸形团体、堕落生育——右边栏的「结局倾向」随时告诉你正在滑向哪个。另外注意：<b>连着两天没进账或没威望，九条会直接完蛋</b>（游戏失败）。</div>
      </div>
      <div class="tut-btns"><button class="tut-next gold" @click="$emit('startStage')">进入教学 · 亲手玩一遍 ▸</button></div>
    </div>

    <!-- guide·操作速查(设置页重看·单页) -->
    <div v-else-if="page === 'guide'" class="tut-page">
      <h2 class="tut-h">操 作 速 查</h2>
      <div class="tut-body">
        <div class="goal-row"><b>每天的流程</b>：早上拖滑块分白天/夜晚格子 → 每个格子点开选一件事 → 逐格执行看结果 → 一天结束进下一天。</div>
        <div class="goal-row"><b>⏩ 快进</b>：开着=事件不找 AI 写正文，一句话直接结算，省时间省 API 钱。想看正文就关掉。<br><b>⏭ 自动跳转</b>：开着=一格演完自动跳下一格。这两个开关在行动页左上角。</div>
        <div class="goal-row"><b>左边导航</b>：行动=主舞台；地盘=打架抢地盘；升级=花钱变强（♥是色色的）；影业=后期解锁；存档=4手动+1自动栏位；留档=收藏好正文随时回看。</div>
        <div class="goal-row"><b>两条命脉</b>：钱别见底（连续两天≤0 完蛋）；避孕套见底前记得让大小姐亲自去买（这是大宅的规矩）。</div>
        <div class="goal-row dim">副 AI 省钱：设置 → 副 AI 独立端点，给后台小活（总结/抓数字）换个便宜模型，可一键拉模型列表。</div>
      </div>
      <div class="tut-btns"><button class="tut-next gold" @click="$emit('close')">知道了 ▸</button></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { getOpeningStory } from '../../../game/story/opening';

const props = defineProps<{ mode: 'full' | 'guide' }>();
defineEmits<{ close: []; startStage: [] }>();

const FULL_PAGES = ['plaque', 'story', 'goal'] as const;
const pages = computed<readonly string[]>(() => props.mode === 'guide' ? ['guide'] : FULL_PAGES);
const idx = ref(0);
const page = computed(() => pages.value[idx.value]);
function next() { if (idx.value < pages.value.length - 1) idx.value++; }

const story = getOpeningStory();
const storyFirst = story.slice(0, 1);
const storyRest = story.slice(1);
</script>

<style scoped>
/* 批H7: overflow:auto + 内容 margin:auto = 溢出小视口时不裁切两侧(经典 flex-center 裁切修复) */
/* 批H8.2: fixed→absolute(锚.app全屏盒)。窄屏宿主环境下深层fixed不渲染(导航同病已实证),absolute零视口依赖 */
.tut-overlay { position: absolute; inset: 0; z-index: 90; background: rgba(8, 5, 4, .96); display: flex; overflow: auto; }
.tut-page { margin: auto; }
.tut-skip { position: absolute; top: 20px; right: 26px; font-family: var(--serif); background: transparent; border: 1px solid var(--line); color: var(--text-dim); border-radius: 6px; padding: 7px 16px; font-size: 13px; cursor: pointer; z-index: 2; }
.tut-skip:hover { color: var(--text); }
.tut-page { width: min(760px, 92vw); max-height: 88vh; display: flex; flex-direction: column; }
@media (max-width: 820px) { .tut-page { max-height: 92dvh; } .tut-h { font-size: 26px; letter-spacing: 6px; } .plaque-text { font-size: 38px; letter-spacing: 8px; } .plaque-frame { padding: 30px 34px; } } /* 批H4 */
.tut-h { font-family: var(--brush); font-size: 34px; color: var(--gold-hi); letter-spacing: 10px; text-align: center; margin-bottom: 22px; flex: none; }
.tut-body { overflow-y: auto; min-height: 0; padding: 0 8px; }
/* 开场白滚动条(批G3·内容超页可滚): 明确高度上限,超出滚动 */
.story-body { font-size: 15px; line-height: 2.1; color: var(--text); white-space: pre-wrap; max-height: 68vh; overflow-y: auto; padding-right: 12px; }
.story-body .first { font-family: var(--brush); font-size: 34px; color: var(--gold-hi); float: left; line-height: 1; padding: 4px 8px 0 0; }
.goal-row { font-size: 15px; line-height: 1.9; color: var(--text); border: 1px solid var(--line); border-radius: 10px; padding: 14px 18px; margin-bottom: 12px; background: linear-gradient(180deg, var(--panel), var(--panel-2)); }
.goal-row b { color: var(--gold-hi); }
.goal-row.dim { color: var(--text-dim); font-size: 13px; }
.tut-btns { flex: none; display: flex; justify-content: center; padding-top: 20px; }
.tut-next { font-family: var(--serif); background: transparent; border: 1px solid var(--gold-dim); color: var(--gold-hi); border-radius: 8px; padding: 12px 42px; font-size: 15px; letter-spacing: 3px; cursor: pointer; }
.tut-next:hover { background: rgba(201,162,74,.1); }
.tut-next.gold { background: linear-gradient(180deg, var(--gold-hi), var(--gold)); color: #1a120a; border: none; font-weight: 700; box-shadow: 0 6px 18px rgba(201,162,74,.3); }
/* 牌匾演出 */
.plaque-page { align-items: center; cursor: pointer; }
.plaque { display: flex; justify-content: center; }
.plaque-frame { background: linear-gradient(180deg, #2a1c10, #1a110a); border: 3px solid var(--gold-dim); box-shadow: inset 0 0 0 6px #0a0706, inset 0 0 0 8px rgba(201,162,74,.35), 0 18px 50px rgba(0,0,0,.7); border-radius: 8px; padding: 46px 56px; text-align: center; animation: plaqueGlow 2.4s ease-in-out infinite; }
.plaque-text { font-family: var(--brush); font-size: 52px; line-height: 1.5; color: var(--text); letter-spacing: 14px; }
.plaque-sub { margin-top: 20px; font-size: 13px; color: var(--gold-dim); letter-spacing: 8px; }
.plaque-hint { text-align: center; margin-top: 34px; font-size: 14px; color: var(--gold-dim); letter-spacing: 6px; animation: hintPulse 1.8s ease-in-out infinite; }
@keyframes plaqueGlow { 0%, 100% { box-shadow: inset 0 0 0 6px #0a0706, inset 0 0 0 8px rgba(201,162,74,.35), 0 18px 50px rgba(0,0,0,.7); } 50% { box-shadow: inset 0 0 0 6px #0a0706, inset 0 0 0 8px rgba(201,162,74,.6), 0 18px 60px rgba(201,162,74,.15); } }
@keyframes hintPulse { 0%, 100% { opacity: .4; } 50% { opacity: 1; } }
</style>
