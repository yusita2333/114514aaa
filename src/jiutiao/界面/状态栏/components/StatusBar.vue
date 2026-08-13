<template>
  <div class="status-bar">
    <div v-for="(c, i) in cells" :key="i" class="cell" :class="{ last: i === cells.length - 1 }">
      <div class="label">{{ c.label }}</div>
      <div class="value" :style="{ color: c.tone || '#e8dde0' }">{{ c.value }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { EngineState } from '../../../game/engine/types';
import type { DayState } from '../../../game/action-grid/types';

const props = defineProps<{ engine: EngineState; day: DayState }>();

const cells = computed(() => {
  const e = props.engine;
  const condomTone = e.condomStock <= 0 ? '#e06666' : e.condomStock < 10 ? '#e8a87a' : undefined;
  const desireTone = e.desire >= e.desireCapacity ? '#e06666'
    : e.desire >= e.desireCapacity * 0.7 ? '#e8a87a' : undefined;
  return [
    { label: '第', value: `${props.day.dayNumber} 天` },
    { label: '资金', value: `¥${e.money.toLocaleString()}`, tone: '#e8c87a' },
    { label: '打手', value: e.thugTotal },
    { label: '堕落度', value: e.corruption, tone: '#d96a8f' },
    { label: '认知防线', value: e.cognition, tone: '#d96a8f' },
    { label: '避孕套', value: e.condomStock, tone: condomTone },
    { label: '群体欲望', value: `${e.desire}/${e.desireCapacity}`, tone: desireTone },
    { label: '经期', value: e.isDangerousPeriod ? '危险期' : '安全期', tone: e.isDangerousPeriod ? '#e06666' : undefined },
  ] as Array<{ label: string; value: string | number; tone?: string }>;
});
</script>

<style scoped>
.status-bar {
  display: flex;
  flex-wrap: wrap;
  background: linear-gradient(180deg, #1a1014, #241318);
  border: 1px solid #3a2128;
  border-radius: 8px;
  overflow: hidden;
}
.cell {
  flex: 1 1 auto;
  min-width: 72px;
  padding: 6px 12px;
  border-right: 1px solid #2c1a20;
}
.cell.last { border-right: none; }
.label { font-size: 10px; color: #8a6b73; letter-spacing: 1px; }
.value { font-size: 15px; font-weight: 700; margin-top: 1px; }
</style>
