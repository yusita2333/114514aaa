<!--
  DaySlider · 日夜分配滑动长条（设计待办「8格长条滑动点选+日夜拖拽」）
  职责: 拖动分隔把 total 格在白天/夜晚之间切分；整格吸附（一格一格）；边界(0)隐藏该侧文字。
  交互: 拖柄半嵌凹槽、三点纹路始终露出；刻度 1..total-1。
  对外: emit('change', day, night) —— 每次变更触发，App 据此 allocate。
-->
<template>
  <div class="dayslider">
    <div class="dscap">早 7:00 · 拖动分配今日 {{ total }} 格 · 左白天经营 / 右夜晚供奉（白0 = 全天供奉）</div>
    <div class="dstrackwrap" ref="wrap" @click="onTrackClick">
      <div class="dstrack">
        <div class="dsday" :style="{ flex: `0 0 ${pct}%` }">
          <span class="dlbl" v-show="day > 0">白天 <b>{{ day }}</b></span>
        </div>
        <div class="dsnight">
          <span class="nlbl" v-show="night > 0">夜晚 <b>{{ night }}</b></span>
        </div>
      </div>
      <div class="dshandle" ref="handle" :style="{ left: `${pct}%` }"
        @pointerdown="onDown" @pointermove="onMove" @pointerup="onUp" @pointercancel="onUp"></div>
    </div>
    <div class="dsticks">
      <span v-for="i in total - 1" :key="i" :style="{ left: `${(i / total) * 100}%` }">{{ i }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';

const props = defineProps<{ total: number; initialDay?: number }>();
const emit = defineEmits<{ change: [day: number, night: number] }>();

const wrap = ref<HTMLElement | null>(null);
const handle = ref<HTMLElement | null>(null);
const day = ref(props.initialDay ?? Math.floor(props.total / 2));
const night = computed(() => props.total - day.value);
const pct = computed(() => (day.value / props.total) * 100);

let dragging = false;
function setFromX(clientX: number) {
  const el = wrap.value; if (!el) return;
  const r = el.getBoundingClientRect();
  let f = (clientX - r.left) / r.width;
  f = Math.max(0, Math.min(1, f));
  const next = Math.round(f * props.total); // 整格吸附
  if (next !== day.value) day.value = next;
}
// 指针捕获 + 元素级监听：全屏时 DOM 在顶层窗口，捕获后 move/up 直接打到手柄上(跨文档可靠)，
// 不能用 window.addEventListener（那是楼层 iframe 的 window，收不到顶层窗口的指针事件）。
function onDown(e: PointerEvent) { dragging = true; handle.value?.setPointerCapture?.(e.pointerId); }
function onMove(e: PointerEvent) { if (dragging) setFromX(e.clientX); }
function onUp(e: PointerEvent) { dragging = false; try { handle.value?.releasePointerCapture?.(e.pointerId); } catch { /* ignore */ } }
function onTrackClick(e: MouseEvent) { if (e.target !== handle.value) setFromX(e.clientX); }

watch(day, () => emit('change', day.value, night.value), { immediate: true });
</script>

<style scoped>
.dayslider { margin-bottom: 20px; }
.dscap { font-size: 12px; color: var(--text-dim); letter-spacing: 2px; margin-bottom: 8px; }
.dstrackwrap { position: relative; height: 40px; }
.dstrack { position: absolute; inset: 0; border: 1px solid var(--line); border-radius: 9px; display: flex; overflow: hidden; }
.dsday { background: linear-gradient(180deg, rgba(201,162,74,.30), rgba(201,162,74,.10));
  display: flex; align-items: center; justify-content: center; color: var(--gold-hi);
  font-size: 15px; letter-spacing: 2px; white-space: nowrap; overflow: hidden; }
.dsnight { flex: 1; background: linear-gradient(180deg, rgba(179,33,46,.24), rgba(20,12,12,.45));
  display: flex; align-items: center; justify-content: center; color: var(--red-hi);
  font-size: 15px; letter-spacing: 2px; white-space: nowrap; overflow: hidden; }
.dsday b, .dsnight b { font-size: 20px; font-weight: 700; }
.dshandle { position: absolute; top: -4px; height: 48px; width: 16px; transform: translateX(-50%);
  border-radius: 5px; cursor: ew-resize; z-index: 5; touch-action: none;
  background: linear-gradient(180deg, var(--gold-hi), var(--gold-dim));
  box-shadow: 0 0 0 2px var(--ink), 0 2px 10px rgba(0,0,0,.7);
  display: flex; align-items: center; justify-content: center; }
.dshandle::before { content: "⋮"; color: #1a120a; font-size: 18px; font-weight: 700; line-height: 1; }
.dsticks { position: relative; height: 16px; margin-top: 9px; }
.dsticks span { position: absolute; transform: translateX(-50%); font-size: 10px; color: var(--text-dim); }
.dsticks span::before { content: ""; position: absolute; top: -8px; left: 50%; width: 1px; height: 5px; background: rgba(201,162,74,.3); transform: translateX(-50%); }
</style>
