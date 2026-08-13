<!--
  SlotCard · 单个行动格（黑金木纹样式）
  逻辑不变（选行动下拉 / 进行中 / 已结算可展开正文），仅表现层对齐 B 版式。
  左侧竖条颜色表状态：金=待执行 / 红=进行中或当前 / 绿=已结算。
-->
<template>
  <div class="slot" :class="statusClass">
    <div class="card-head" :style="{ cursor: canExpand ? 'pointer' : 'default' }"
      @click="canExpand && $emit('toggle')">
      <span class="no">{{ cnNum }}</span>
      <div class="body">
        <div class="label">
          <template v-if="slot.choice">{{ slot.choice.label }}</template>
          <span v-else class="dim">— 未安排 —</span>
        </div>
        <div class="meta">{{ metaText }}</div>
      </div>
      <span class="tag" :class="tagClass">{{ tagText }}</span>
      <span v-if="canExpand" class="caret">{{ expanded ? '▴' : '▾' }}</span>
    </div>

    <!-- 编辑态：选行动 -->
    <div v-if="editable" class="card-edit">
      <select :value="slot.choice?.optionId ?? ''" @change="onSelect">
        <option value="">— 选择{{ period === 'day' ? '经营' : '供奉' }}行动 —</option>
        <option v-for="o in options" :key="o.optionId" :value="o.optionId">{{ o.label }}{{ o.isNsfw ? ' ♥' : '' }}</option>
      </select>
      <button v-if="slot.choice" class="clear-btn" @click="$emit('clear')">清</button>
    </div>

    <!-- 展开态：正文 -->
    <div v-if="expanded && canExpand" class="card-body">{{ slot.resultText }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ActionSlot, SlotPeriod } from '../../../game/action-grid/types';

interface MenuOpt { optionId: string; label: string; isNsfw: boolean }
const props = defineProps<{
  slot: ActionSlot; period: SlotPeriod; options: MenuOpt[]; isCurrent: boolean; expanded: boolean;
}>();
const emit = defineEmits<{ pick: [optionId: string, label: string]; clear: []; toggle: [] }>();

const CN = ['壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖', '拾'];
const cnNum = computed(() => CN[props.slot.index] ?? String(props.slot.index + 1));
const canExpand = computed(() => props.slot.status === 'done' && !!props.slot.resultText);
const editable = computed(() => !props.slot.locked && props.slot.status !== 'done' && props.slot.status !== 'running');

const statusClass = computed(() => ({
  done: props.slot.status === 'done',
  cur: props.isCurrent || props.slot.status === 'running',
  locked: props.slot.locked,
}));
const metaText = computed(() => {
  if (props.slot.status === 'done') return '已结算';
  if (props.slot.status === 'running') return '进行中…';
  if (props.slot.choice) return '待生成';
  return '点此选择行动';
});
const tagText = computed(() => {
  if (props.slot.locked) return '⚠ ' + (props.slot.lockedBy ?? '强占');
  if (props.slot.status === 'done') return '已结算 ✓';
  if (props.slot.status === 'running') return '进行中';
  if (props.slot.status === 'planned') return '待执行';
  return '空';
});
const tagClass = computed(() => ({
  done: props.slot.status === 'done',
  nsfw: props.slot.locked || props.slot.status === 'running',
  wait: props.slot.status === 'planned',
}));

function onSelect(e: Event) {
  const id = (e.target as HTMLSelectElement).value;
  const opt = props.options.find(o => o.optionId === id);
  if (opt) emit('pick', opt.optionId, opt.label);
}
</script>

<style scoped>
.slot { border: 1px solid var(--line); border-radius: 8px; background: linear-gradient(180deg, var(--panel), var(--panel-2)); position: relative; overflow: hidden; }
.slot::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: var(--gold-dim); }
.slot.done::before { background: var(--green); }
.slot.cur::before { background: var(--red); }
.slot.cur { box-shadow: inset 0 0 0 1px rgba(216,64,77,.4); }
.slot.locked { border-color: rgba(216,64,77,.5); }
.card-head { display: flex; align-items: center; gap: 14px; padding: 14px 18px; }
.no { font-family: var(--brush); font-size: 22px; color: var(--gold); width: 42px; text-align: center; }
.body { flex: 1; min-width: 0; }
.label { font-size: 16px; color: var(--text); letter-spacing: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.label .dim { color: var(--text-dim); }
.meta { font-size: 12px; color: var(--text-dim); margin-top: 2px; }
.tag { font-size: 11px; padding: 3px 9px; border-radius: 3px; letter-spacing: 1px; white-space: nowrap; }
.tag.nsfw { background: rgba(179,33,46,.18); color: var(--red-hi); border: 1px solid rgba(216,64,77,.4); }
.tag.done { background: rgba(94,122,72,.18); color: var(--green); }
.tag.wait { background: rgba(201,162,74,.12); color: var(--gold); }
.caret { font-size: 11px; color: var(--text-dim); margin-left: 4px; }
.card-edit { display: flex; gap: 8px; padding: 0 18px 14px; }
.card-edit select { flex: 1; background: var(--ink); color: var(--text); border: 1px solid var(--line); border-radius: 6px; padding: 7px 9px; font-size: 13px; font-family: var(--serif); }
.clear-btn { background: rgba(0,0,0,.35); color: var(--text-dim); border: 1px solid var(--line); border-radius: 6px; padding: 5px 12px; font-size: 12px; cursor: pointer; }
.card-body { padding: 14px 18px; border-top: 1px solid var(--line); font-size: 14px; color: var(--text); line-height: 1.85; background: rgba(10,7,6,.6); max-height: 340px; overflow-y: auto; white-space: pre-wrap; }
</style>
