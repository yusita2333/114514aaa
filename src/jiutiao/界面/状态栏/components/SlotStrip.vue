<!--
  SlotStrip · 事件格横条（对齐日夜滑条的分格）
  职责: 把当天 白天格+夜晚格 排成一条等宽长条，每格=一个事件格预览(序号/状态/简标签)。
        点选某格 → emit select(period,index)，由 App 在下方子页展示该格的事件选择/正文。
        格数增加只是横条变长，玩家不需上下滚动。
  状态色: 白天格金顶边 / 夜晚格红顶边；空/已排/进行中/已结算/锁定 各异。
-->
<template>
  <div class="strip">
    <div v-for="c in cells" :key="c.key"
      class="cell" :class="[c.period, c.statusClass, { sel: c.key === selectedKey, cur: c.isCur, chosen: c.hasChoice }]"
      :title="c.label" @click="$emit('select', c.period, c.index)">
      <!-- 未选事件: 极道菊纹醒目；已选: 菊纹淡成背景水印 -->
      <KikuMon class="mon" :class="{ wm: c.hasChoice }" />
      <div v-if="c.hasChoice" class="fg">
        <div class="lbl">{{ c.label }}</div>
        <div class="st">{{ c.st }}<span v-if="c.statusClass === 'done'"> 展开查看</span></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import KikuMon from './KikuMon.vue';
import type { DayState, ActionSlot, SlotPeriod } from '../../../game/action-grid/types';

const props = defineProps<{ day: DayState; selectedKey: string | null }>();
defineEmits<{ select: [period: SlotPeriod, index: number] }>();

function cellOf(slot: ActionSlot, period: SlotPeriod) {
  const cur = props.day.cursor;
  const isCur = cur?.period === period && cur?.index === slot.index;
  let st = '○'; let statusClass = 'empty';
  if (slot.locked) { st = '⚠'; statusClass = 'locked'; }
  else if (slot.status === 'done') { st = '✓'; statusClass = 'done'; }
  else if (slot.status === 'running') { st = '●'; statusClass = 'running'; }
  else if (slot.status === 'planned') { st = '●'; statusClass = 'planned'; }
  const label = slot.choice?.label ?? '空';
  return { key: period + '-' + slot.index, period, index: slot.index, label, st, statusClass, isCur, hasChoice: !!slot.choice };
}

const cells = computed(() => [
  ...props.day.daySlots.map(s => cellOf(s, 'day')),
  ...props.day.nightSlots.map(s => cellOf(s, 'night')),
]);
</script>

<style scoped>
.strip { display: flex; gap: 4px; }
/* 批H4·手机重排: 格子不再均分挤压——固定宽度+横向滑动(12格也能看清每格) */
@media (max-width: 820px) {
  .strip { overflow-x: auto; -webkit-overflow-scrolling: touch; padding-bottom: 4px; }
  .strip .cell { flex: 0 0 92px; min-height: 64px; }
}
.cell {
  position: relative; flex: 1 1 0; min-width: 0; cursor: pointer; text-align: center;
  border: 1px solid var(--line); border-radius: 6px; padding: 8px 6px; min-height: 58px;
  display: flex; flex-direction: column; align-items: center; justify-content: center; overflow: hidden;
  background: linear-gradient(180deg, rgba(0,0,0,.25), rgba(0,0,0,.4)); transition: .12s;
}
.cell.day { border-top: 3px solid var(--gold-dim); }
.cell.night { border-top: 3px solid rgba(179,33,46,.65); }
.cell:hover { background: rgba(236,200,120,.08); }
.cell.sel { border-color: var(--gold-hi); background: rgba(201,162,74,.14); box-shadow: 0 0 0 1px var(--gold-hi); }
.cell.cur { box-shadow: inset 0 0 0 1px var(--red-hi); }
.cell.done { opacity: .9; }
/* 未选事件: 醒目极道菊纹 */
.mon { width: 30px; height: 30px; color: var(--gold); }
.cell.night .mon { color: var(--rose-hi); }
/* 已选事件: 菊纹淡化成背景水印（几乎看不清的花纹底） */
.mon.wm { position: absolute; inset: 0; width: 100%; height: 100%; padding: 6px;
  opacity: .07; pointer-events: none; z-index: 0; }
.fg { position: relative; z-index: 1; width: 100%; }
.lbl { font-size: 12px; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.st { font-size: 11px; margin-top: 3px; color: var(--gold-dim); }
.cell.done .st { color: var(--green); }
.cell.planned .st, .cell.running .st { color: var(--gold); }
.cell.locked .st { color: var(--red-hi); }
</style>
