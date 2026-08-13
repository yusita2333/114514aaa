<!--
  NavRail · 左侧木纹导航栏
  职责: 木纹背景上的"镶嵌式"导航按钮 + 底部 存读档/设置/退出。
  数据: v-model:view（当前页签）。各页签的真实面板由 App.vue 按 view 分支渲染，
        目前只有「行动」是完整可玩视图，其余为占位（玩法接入后填，见 UI改版工程说明.md §2）。
-->
<template>
  <nav class="nav">
    <button
      v-for="it in items" :key="it.key"
      class="item" :class="{ active: view === it.key }"
      @click="$emit('update:view', it.key)">
      <span class="icn">{{ it.icn }}</span>{{ it.label }}
    </button>
    <div class="spacer"></div>
    <button class="save exit" @click="$emit('action', 'exit')">退 出</button>
  </nav>
</template>

<script setup lang="ts">
defineProps<{ view: string }>();
defineEmits<{ 'update:view': [v: string]; action: [a: 'save' | 'exit'] }>();

// 设置=配置API/切换UI风格；退出=临时离开前端回酒馆调预设（功能待接，见待办）
const items = [
  { key: '行动', icn: '▣', label: '行动' },
  { key: '地盘', icn: '⚔', label: '地盘' },
  { key: '升级', icn: '⬆', label: '升级' },
  { key: '影业', icn: '◉', label: '影业' },
  { key: '大小姐', icn: '❀', label: '大小姐' },
  { key: '留档', icn: '❏', label: '留档' },
  { key: '存档', icn: '❖', label: '存档' },
  { key: '设置', icn: '⚙', label: '设置' },
];
</script>

<style scoped>
.nav {
  background: var(--wood-v); background-color: var(--wood-base);
  border-right: 2px solid #000; padding: 18px 0;
  display: flex; flex-direction: column; gap: 9px;
  box-shadow: inset -4px 0 10px rgba(0,0,0,.4);
}
/* 批H4·手机重排: 导航=底部tab栏。
   批H8改法: 不用 position:fixed(用户实测在顶层宿主环境下 fixed 导航不渲染,具体被哪环干扰难考),
   改为 .app flex 纵列的末位子项(order:99)被布局钉在底部——零视口/包含块依赖,环境再怪也杀不掉。 */
@media (max-width: 820px) {
  .nav {
    position: static; order: 99; flex: none; width: 100%;
    flex-direction: row; overflow-x: auto; -webkit-overflow-scrolling: touch;
    padding: 6px 4px calc(6px + env(safe-area-inset-bottom)); gap: 4px;
    border-right: none; border-top: 2px solid #000;
    box-shadow: inset 0 4px 10px rgba(0,0,0,.4), 0 -4px 16px rgba(0,0,0,.6);
  }
  .nav .item {
    flex: 1 0 auto; margin: 0; padding: 9px 10px; min-width: 58px;
    font-size: 13px; letter-spacing: 1px; gap: 4px;
    flex-direction: column; text-align: center; justify-content: center;
  }
  .nav .item .icn { width: auto; font-size: 16px; }
  .nav .spacer { display: none; }
  .nav .save, .nav .exit { flex: 1 0 auto; margin: 0; padding: 9px 10px; min-width: 52px; font-size: 12px; }
}
/* 镶嵌进木栏的按钮（凹槽内阴影·不悬浮） */
.item {
  display: flex; align-items: center; gap: 13px; margin: 0 16px; padding: 12px 15px;
  color: var(--text); cursor: pointer; border-radius: 7px;
  font-family: var(--serif); font-size: 19px; letter-spacing: 5px; transition: .13s;
  background: linear-gradient(180deg, rgba(0,0,0,.42), rgba(0,0,0,.28));
  border: 1px solid rgba(0,0,0,.6);
  box-shadow: inset 0 2px 4px rgba(0,0,0,.7), inset 0 -1px 0 rgba(236,200,120,.06);
  text-align: left;
}
.item .icn { width: 24px; text-align: center; font-size: 18px; color: var(--gold-dim); }
.item:hover { color: var(--gold-hi); }
.item:hover .icn { color: var(--gold); }
.item.active {
  color: #1a120a; font-weight: 700;
  background: linear-gradient(180deg, var(--gold-hi), var(--gold));
  border: 1px solid #43350f;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.4), inset 0 -3px 6px rgba(120,90,30,.45);
}
.item.active .icn { color: #1a120a; }
.spacer { flex: 1; }
.save {
  margin: 0 16px; padding: 10px; text-align: center; border: 1px solid var(--line);
  border-radius: 6px; color: var(--text-dim); font-family: var(--serif); font-size: 13px;
  letter-spacing: 2px; cursor: pointer; background: rgba(0,0,0,.3);
  box-shadow: inset 0 2px 4px rgba(0,0,0,.6);
}
.save:hover { color: var(--gold-hi); border-color: var(--gold-dim); }
.save.exit { margin-top: 8px; color: #caa0a0; border-color: rgba(179,33,46,.4); }
.save.exit:hover { color: var(--red-hi); border-color: var(--red); background: rgba(179,33,46,.12); }
</style>
