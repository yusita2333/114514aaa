<!--
  SavePanel · 存档界面(批E1·SLG式多槽)
  4个手动栏位(自由存/读) + 1个自动栏位(每日自动·只读不可覆盖存)。
  数据: runner-store manualSlotInfos/autoSlotInfo + saveToSlot/loadFromSlot/loadAutoSave。
-->
<template>
  <div class="save-panel">
    <h2 class="sp-title">存 档</h2>
    <p class="sp-lead">进度本就随时自动保存到当前聊天；这里是额外的<b>存档栏位</b>——像 SLG 一样，把安稳的节点留下来，随时读回。读档会覆盖当前进度。</p>

    <!-- 自动栏位 -->
    <div class="slot auto" :class="{ empty: !r.autoSlotInfo }">
      <div class="sl-head"><span class="sl-tag auto-tag">自动</span><span class="sl-name">每日自动存档</span></div>
      <template v-if="r.autoSlotInfo">
        <div class="sl-day">第 {{ r.autoSlotInfo.day }} 天 · 清晨</div>
        <div class="sl-sum">{{ r.autoSlotInfo.summary }}</div>
        <div class="sl-time">{{ r.autoSlotInfo.savedAt }}</div>
        <div class="sl-btns"><button class="ghost-btn" @click="onLoad('auto')">读取</button></div>
      </template>
      <div v-else class="sl-empty">每天开始时自动写入（进入第 2 天后出现）</div>
    </div>

    <!-- 手动栏位×4 -->
    <div v-for="(info, i) in r.manualSlotInfos" :key="i" class="slot" :class="{ empty: !info }">
      <div class="sl-head"><span class="sl-tag">栏位 {{ i + 1 }}</span><span class="sl-name">{{ info ? `第 ${info.day} 天` : '空栏位' }}</span></div>
      <template v-if="info">
        <div class="sl-sum">{{ info.summary }}</div>
        <div class="sl-time">{{ info.savedAt }}</div>
      </template>
      <div v-else class="sl-empty">—</div>
      <div class="sl-btns">
        <button class="primary-sm" @click="onSave(i)">{{ info ? '覆盖存档' : '存入' }}</button>
        <button v-if="info" class="ghost-btn" @click="onLoad(i)">读取</button>
      </div>
    </div>

    <Transition name="fade"><div v-if="toast" class="sp-toast">{{ toast }}</div></Transition>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRunnerStore } from '../runner-store';

const r = useRunnerStore();
const toast = ref('');
function say(t: string) { toast.value = t; setTimeout(() => { toast.value = ''; }, 2600); }

function onSave(i: number) {
  const has = r.manualSlotInfos[i];
  if (has && !window.confirm(`覆盖栏位 ${i + 1}（第${has.day}天）？`)) return;
  r.saveToSlot(i);
  say(`✓ 已存入栏位 ${i + 1}`);
}
function onLoad(target: number | 'auto') {
  const info = target === 'auto' ? r.autoSlotInfo : r.manualSlotInfos[target as number];
  if (!info) return;
  if (!window.confirm(`读取${target === 'auto' ? '自动存档' : `栏位 ${(target as number) + 1}`}（第${info.day}天）？当前进度将被覆盖。`)) return;
  const ok = target === 'auto' ? r.loadAutoSave() : r.loadFromSlot(target as number);
  say(ok ? '✓ 已读取存档' : '✗ 读取失败');
}
</script>

<style scoped>
.save-panel { padding: 22px 30px; max-width: 720px; overflow-y: auto; height: 100%; }
@media (max-width: 820px) { .save-panel { padding: 14px 12px; height: auto; } } /* 批H4 */
.sp-title { font-family: var(--brush); font-size: 30px; color: var(--gold-hi); letter-spacing: 8px; margin-bottom: 6px; }
.sp-lead { font-size: 13px; color: var(--text-dim); line-height: 1.7; margin-bottom: 18px; }
.slot { border: 1px solid var(--line); border-radius: 10px; background: linear-gradient(180deg, var(--panel), var(--panel-2)); padding: 14px 18px; margin-bottom: 12px; }
.slot.auto { border-color: var(--gold-dim); }
.slot.empty { opacity: .75; }
.sl-head { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
.sl-tag { font-size: 11px; padding: 2px 10px; border: 1px solid var(--line); border-radius: 4px; color: var(--text-dim); letter-spacing: 2px; }
.sl-tag.auto-tag { color: var(--gold-hi); border-color: var(--gold-dim); }
.sl-name { font-size: 15px; color: var(--text); font-weight: 700; }
.sl-day { font-size: 14px; color: var(--gold-hi); margin-bottom: 2px; }
.sl-sum { font-size: 12px; color: var(--text-dim); }
.sl-time { font-size: 11px; color: var(--text-dim); opacity: .7; margin-top: 2px; }
.sl-empty { font-size: 12px; color: var(--text-dim); opacity: .6; padding: 4px 0; }
.sl-btns { display: flex; gap: 10px; margin-top: 10px; }
.primary-sm { font-family: var(--serif); background: linear-gradient(180deg, var(--gold-hi), var(--gold)); color: #1a120a; border: none; border-radius: 6px; padding: 7px 18px; font-size: 13px; font-weight: 700; cursor: pointer; }
.ghost-btn { font-family: var(--serif); background: transparent; border: 1px solid var(--line); color: var(--text-dim); border-radius: 6px; padding: 7px 16px; font-size: 13px; cursor: pointer; }
.sp-toast { position: absolute; bottom: 30px; left: 50%; transform: translateX(-50%); /* 批H8.2: fixed→absolute */ background: var(--panel); border: 1px solid var(--gold-dim); color: var(--gold-hi); padding: 10px 22px; border-radius: 8px; font-size: 13px; z-index: 50; }
.fade-enter-active, .fade-leave-active { transition: opacity .3s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
