<!--
  ArchivePanel · 留档(正文回忆·批E2)
  上半区: 我的收藏(完整正文·可回看/删除·随聊天持久)。
  下半区: 近期正文档案(系统暂存的最近3天原文·截断700字·可补救收藏)。
  数据: runner-store favorites/removeFavorite/addFavorite + engine.proseArchive。
-->
<template>
  <div class="archive">
    <h2 class="ar-title">留 档</h2>
    <p class="ar-lead">收藏满意的正文段落随时回看。收藏入口：行动视图已结算格正文下方「❤ 收藏本段」，或从下方近期档案补救。</p>

    <!-- 我的收藏 -->
    <div class="ar-sec">我的收藏（{{ r.favorites.length }}/100）</div>
    <div v-if="!r.favorites.length" class="ar-empty">还没有收藏。看到满意的正文就点「❤ 收藏本段」。</div>
    <details v-for="f in favList" :key="f.id" class="fav" :class="{ pinned: f.pinned }">
      <summary>
        <span v-if="f.pinned" class="f-pin">📌</span>
        <span class="f-day">第{{ f.day }}天</span>
        <span class="f-label">{{ f.label }}</span>
        <span class="f-time">{{ f.savedAt }}</span>
        <button class="f-del" @click.prevent.stop="onPin(f.id)">{{ f.pinned ? '取消置顶' : '置顶' }}</button>
        <button class="f-del" @click.prevent.stop="onRename(f)">改名</button>
        <button class="f-del" @click.prevent.stop="onDel(f.id)">删除</button>
      </summary>
      <div class="f-text">{{ f.text }}</div>
    </details>

    <!-- 近期正文档案 -->
    <div class="ar-sec">近期正文档案（系统暂存·最近3天完整正文·超期自动清理）</div>
    <p class="ar-hint">引擎为前情注入暂存的原文，<b>存的是完整正文</b>——遗漏未收藏的段落可以从这里补救收藏（完整版）。</p>
    <div v-if="!archList.length" class="ar-empty">暂无档案（执行行动格后出现）。</div>
    <details v-for="p in archList" :key="p.id" class="fav arch">
      <summary>
        <span class="f-day">第{{ p.day }}天{{ p.period === 'day' ? '昼' : '夜' }}#{{ p.slot + 1 }}</span>
        <span class="f-label">{{ p.label }}</span>
        <button class="f-del save" @click.prevent.stop="onSaveArch(p)" :disabled="savedIds.has(p.id)">{{ savedIds.has(p.id) ? '✓ 已收藏' : '❤ 收藏' }}</button>
      </summary>
      <div class="f-text">{{ p.text }}</div>
    </details>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRunnerStore } from '../runner-store';
import type { ProseEntry } from '../../../game/memory/machine';

const r = useRunnerStore();
// 置顶优先,其余新→旧
const favList = computed(() => {
  const list = [...r.favorites].reverse();
  return [...list.filter(f => f.pinned), ...list.filter(f => !f.pinned)];
});
const archList = computed<ProseEntry[]>(() => [...(r.engine.proseArchive ?? [])].reverse());
const savedIds = ref(new Set<string>());

function onDel(id: string) {
  if (window.confirm('删除这条收藏？')) r.removeFavorite(id);
}
function onPin(id: string) { r.togglePinFavorite(id); }
function onRename(f: { id: string; label: string }) {
  const name = window.prompt('新的标题：', f.label);
  if (name != null) r.renameFavorite(f.id, name);
}
function onSaveArch(p: ProseEntry) {
  const ok = r.addFavorite({ id: `arch-${p.id}`, day: p.day, label: p.label, text: p.text });
  if (ok || r.favorites.some(f => f.id === `arch-${p.id}`)) savedIds.value = new Set([...savedIds.value, p.id]);
}
</script>

<style scoped>
.archive { padding: 22px 30px; max-width: 820px; overflow-y: auto; height: 100%; }
@media (max-width: 820px) { .archive { padding: 14px 12px; height: auto; } } /* 批H4 */
.ar-title { font-family: var(--brush); font-size: 30px; color: var(--gold-hi); letter-spacing: 8px; margin-bottom: 6px; }
.ar-lead { font-size: 13px; color: var(--text-dim); line-height: 1.7; margin-bottom: 16px; }
.ar-sec { font-size: 12px; color: var(--gold-dim); letter-spacing: 3px; border-bottom: 1px dashed var(--line); padding-bottom: 5px; margin: 18px 0 10px; }
.ar-hint { font-size: 12px; color: var(--text-dim); opacity: .8; margin-bottom: 10px; }
.ar-empty { font-size: 13px; color: var(--text-dim); opacity: .7; padding: 8px 0; }
.fav { border: 1px solid var(--line); border-radius: 8px; background: linear-gradient(180deg, var(--panel), var(--panel-2)); margin-bottom: 8px; }
.fav.pinned { border-color: var(--gold-dim); }
.f-pin { font-size: 12px; flex: none; }
.fav.arch { opacity: .92; }
.fav summary { display: flex; align-items: center; gap: 12px; padding: 10px 14px; cursor: pointer; list-style: none; }
.f-day { font-size: 12px; color: var(--gold-hi); flex: none; }
.f-label { font-size: 13px; color: var(--text); flex: 1; }
.f-time { font-size: 11px; color: var(--text-dim); opacity: .7; }
.f-del { font-family: var(--serif); background: transparent; border: 1px solid var(--line); color: var(--text-dim); border-radius: 5px; padding: 3px 10px; font-size: 11px; cursor: pointer; flex: none; }
.f-del:hover { color: var(--red-hi); border-color: var(--red); }
.f-del.save { color: var(--rose-hi); }
.f-del.save:hover { border-color: var(--rose); }
.f-del.save:disabled { opacity: .5; cursor: default; }
.f-text { padding: 4px 16px 14px; font-size: 14px; line-height: 1.9; color: var(--text); white-space: pre-wrap; border-top: 1px dashed var(--line); }
</style>
