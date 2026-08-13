<!--
  RinPanel · 右栏 九条凛
  职责: 立绘人像（常驻不滚动）+ 可折叠秘密状态（独立滚动区）。
  秘密状态字段以"域3·九条凛"为准：内心独白 / 身体开发度四部位(各0-4级) / 特殊性癖三项 / 生育·经期。
  数据: engine.bodyDevelopment / cognition / pregnant / isDangerousPeriod（其余 🟡 占位，见 UI改版工程说明.md §3）。
-->
<template>
  <aside class="rin">
    <!-- 立绘(批E2·时段+事件换装;背景/插图层为发布后迭代预留) -->
    <div class="portrait">
      <div class="photo">
        <!-- 背景层(接口预留·portrait.background) -->
        <img class="p-img" :src="portrait.url" :alt="`九条凛·${portrait.label}`" @error="imgFailed = true" v-show="!imgFailed" />
        <div v-if="imgFailed" class="hint"><span class="cam">❏</span>立绘加载中…</div>
        <!-- 插图层(接口预留·portrait.illustration) -->
        <div class="p-outfit">{{ portrait.label }}</div>
      </div>
      <div class="plate">九 条 凛</div>
    </div>

    <!-- 秘密状态（独立滚动） -->
    <div class="rin-scroll">
      <details class="secret" open>
        <summary><span class="lock">秘</span><span><span class="t">秘密状态</span><br><span class="sub">大小姐不愿示人的真实</span></span><span class="arr">▸</span></summary>
        <div class="sbody">
          <div class="inner-voice">{{ voice }}</div>

          <!-- 结局倾向(批C2·endings.endingTendency 过程可感知) -->
          <div class="group-t">结局倾向 · 大小姐正滑向何处</div>
          <div class="tendency" :class="tendencyClass">
            <span class="td-main">{{ tendency }}</span>
            <span class="td-sub">{{ salvationOpen ? '「金盆洗手」仍有可能（认知未崩·堕落<50）' : '「金盆洗手」的门已经关上了' }}</span>
          </div>

          <div class="group-t">身体开发度 · 四部位（0-4级·单向不可逆·点开看次数）</div>
          <details v-for="p in parts" :key="p.key" class="part">
            <summary>
              <span class="pn">{{ p.name }}</span>
              <span class="dots"><i v-for="n in 4" :key="n" :class="{ on: n <= p.lv }"></i></span>
              <span class="lv">{{ p.lv }}/4</span><span class="arr">▸</span>
            </summary>
            <div class="part-body"><div class="cnt3"><div v-for="c in p.cnt" :key="c.k"><div class="k">{{ c.k }}</div><div class="v">{{ c.v }}</div></div></div></div>
          </details>

          <!-- TODO(数据): 特殊性癖觉醒度未建变量，占位 -->
          <details class="part"><summary><span class="pn">特殊性癖</span><span class="lv">3项</span><span class="arr">▸</span></summary>
            <div class="part-body" style="padding-top:8px">
              <div class="fetish-row"><span>受虐癖</span><div class="dots"><i></i><i></i><i></i></div></div>
              <div class="fetish-row"><span>暴露癖</span><div class="dots"><i></i><i></i><i></i></div></div>
              <div class="fetish-row"><span>便器意识</span><div class="dots"><i></i><i></i><i></i></div></div>
            </div>
          </details>

          <div class="group-t">生育 · 经期</div>
          <div class="mini">
            <div><div class="k">怀孕</div><div class="v" :style="{ color: engine.pregnant ? 'var(--rose-hi)' : 'var(--green)' }">{{ engine.pregnant ? '已孕' : '未孕' }}</div></div>
            <div><div class="k">生育记录</div><div class="v white">0</div></div>
            <div><div class="k">经期</div><div class="v white">{{ engine.isDangerousPeriod ? '危险期' : '安全' }}</div></div>
          </div>
        </div>
      </details>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { EngineState } from '../../../game/engine/types';
import { endingTendency, isSalvationOpen } from '../../../game/endings/machine';
import { resolvePortrait } from '../../../game/engine/portraits';
import { useRunnerStore } from '../runner-store';

const props = defineProps<{ engine: EngineState }>();

// 立绘(批E2): 夜晚睡衣/白天按当前格事件(极道=正装·外出采购=休闲)。无当前格按时段(白天默认正装)。
const r = useRunnerStore();
const imgFailed = ref(false);
const portrait = computed(() => {
  const cur = r.currentSlot;
  const period = cur?.period ?? (String(r.day.phase ?? '').startsWith('night') ? 'night' : 'day');
  return resolvePortrait(period, cur?.choice?.optionId ?? null);
});
watch(() => portrait.value.url, () => { imgFailed.value = false; }); // 换装时重试加载

// 结局倾向(批C2)
const tendency = computed(() => endingTendency({
  cognition: props.engine.cognition, corruption: props.engine.corruption, pregnant: props.engine.pregnant,
}));
const salvationOpen = computed(() => isSalvationOpen({
  cognition: props.engine.cognition, corruption: props.engine.corruption, pregnant: props.engine.pregnant,
}));
const tendencyClass = computed(() => ({
  解脱: 'td-free', 畸形团体: 'td-warped', 堕落生育: 'td-breed', 未定: '',
}[tendency.value] ?? ''));

const VOICE: Record<string, string> = {
  死撑: '"嘴上死撑着九条家的体面，绝不肯承认身体的任何一丝反应——那都是生理反射，根本不算数。"',
  动摇: '"嘴上还撑着九条家的体面……可只要那些手一碰上来，身体就不像话地软下去、迎上去。"',
  崩溃: '"已经懒得再装了。被怎么对待，都只剩一声疲惫的默认。"',
  母猪化: '"主动张开身体去索求、去催促——被使用，本就是理所当然的圆满。"',
};
const voice = computed(() => VOICE[props.engine.cognition] ?? VOICE['动摇']);

const parts = computed(() => {
  const b = props.engine.bodyDevelopment ?? {};
  const c = props.engine.bodyCounts ?? {}; // 批I1: 部位计数接真(此前为占位符"—")
  const row = (key: string, name: string, lv: number, labels: string[]) => ({
    key, name, lv,
    cnt: labels.map(lb => ({ k: lb, v: c[`${key}.${lb}`] ?? 0 })),
  });
  // 缺省=1(被迫接受)与引擎 getDevelopment 一致(批C1 对齐,此前 UI 缺省0与引擎不同源)
  return [
    row('口腔', '口腔', b.口腔 ?? 1, ['口交', '口内射', '颜射']),
    row('小穴', '小穴', b.小穴 ?? 1, ['插入', '内射', '高潮']),
    row('肛门', '肛门', b.肛门 ?? 1, ['插入', '内射', '高潮']),
    row('子宫', '子宫', b.子宫生育 ?? 1, ['宫颈侵入', '中出', '子宫高潮']),
  ];
});
</script>

<style scoped>
.rin { border-left: 2px solid #000; background: linear-gradient(180deg, #100b09, #0b0807);
  box-shadow: inset 3px 0 8px rgba(0,0,0,.5); display: flex; flex-direction: column; overflow: hidden; }
/* 批H4·手机重排: 内嵌于「大小姐」页时(rin-inline)全宽纵排·立绘居中·状态区自然高度 */
@media (max-width: 820px) {
  .rin { border-left: none; border-top: none; overflow: visible; width: 100%; }
  .rin-scroll { overflow: visible; }
  .portrait { margin: 14px auto 10px; }
}
/* 批F1#3: 立绘框 横向×1.2(178→214) 纵向×1.6(237→380);
   批D0(用户反馈): 视窗高截短为85%(380→323)腾出下方状态栏空间——但立绘渲染尺寸不变(见 .p-img 固定px),
   顶部对齐,视窗装不下的部分直接裁掉,人物大小不受视窗缩短影响。 */
.portrait { flex: none; position: relative; width: 214px; height: 323px; margin: 16px auto 12px; border-radius: 6px; overflow: hidden;
  background: linear-gradient(180deg, #1a141a, #0d0a0c); border: 1px solid var(--gold-dim);
  box-shadow: 0 8px 22px rgba(0,0,0,.55), inset 0 0 0 4px #0a0706, inset 0 0 0 5px rgba(201,162,74,.35); }
.portrait .photo { position: absolute; inset: 5px; border-radius: 3px; overflow: hidden;
  background: radial-gradient(70% 55% at 50% 38%, rgba(236,200,120,.10), transparent 70%),
              radial-gradient(120% 80% at 50% 120%, rgba(0,0,0,.7), transparent 60%),
              linear-gradient(180deg, #241b22, #100b0e); }
.portrait .photo .hint { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 5px; color: rgba(239,230,218,.28); font-size: 11px; letter-spacing: 3px; }
/* 批F1#3+批D0: 图片渲染尺寸固定 475px 高(=原380视窗的125%,即当前人物大小),不随视窗缩放。
   顶部对齐,视窗(323px)装不下的底部直接被容器裁掉。改视窗高只需动 .portrait,人物大小不变。 */
.portrait .photo .p-img { position: absolute; top: 0; left: 0; width: 100%; height: 475px; object-fit: cover; object-position: top center; }
.portrait .photo .p-outfit { position: absolute; right: 6px; bottom: 6px; font-size: 10px; letter-spacing: 2px; color: var(--gold-dim); background: rgba(0,0,0,.45); padding: 2px 8px; border-radius: 4px; }
.portrait .photo .hint .cam { font-size: 24px; }
.portrait .plate { position: absolute; left: 0; right: 0; bottom: 0; padding: 8px 0 9px; text-align: center;
  background: linear-gradient(180deg, transparent, rgba(8,5,4,.85)); font-family: var(--brush); font-size: 24px; color: var(--gold-hi); text-shadow: 0 2px 6px #000; letter-spacing: 5px; }
.rin-scroll { flex: 1; min-height: 0; overflow-y: auto; padding: 0 16px 18px; }
.secret > summary { list-style: none; cursor: pointer; display: flex; align-items: center; gap: 10px; padding: 11px 13px; border: 1px solid var(--gold-dim); border-radius: 10px; background: linear-gradient(180deg, #211512, #160e0c); }
.secret > summary::-webkit-details-marker { display: none; }
.secret > summary .lock { font-family: var(--brush); font-size: 20px; color: var(--rose-hi); }
.secret > summary .t { font-family: var(--brush); font-size: 22px; color: var(--gold-hi); }
.secret > summary .sub { font-size: 11px; color: var(--text-dim); letter-spacing: 1px; }
.secret > summary .arr { margin-left: auto; color: var(--gold-dim); font-size: 12px; transition: .2s; }
.secret[open] > summary .arr { transform: rotate(90deg); }
.secret[open] > summary { border-radius: 10px 10px 0 0; border-bottom: none; }
.sbody { border: 1px solid var(--gold-dim); border-top: none; border-radius: 0 0 10px 10px; padding: 13px; background: rgba(18,12,11,.7); }
.inner-voice { margin: 0 0 10px; padding: 9px 11px; border-left: 3px solid var(--rose); background: rgba(210,74,106,.08); font-size: 13px; line-height: 1.75; color: #d9cfc5; font-style: italic; }
.group-t { font-size: 11px; color: var(--gold-dim); letter-spacing: 3px; margin: 12px 0 8px; border-bottom: 1px dashed var(--line); padding-bottom: 4px; }
.tendency { display: flex; flex-direction: column; gap: 3px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; }
.tendency .td-main { font-size: 15px; letter-spacing: 4px; font-weight: bold; }
.tendency .td-sub { font-size: 11px; color: var(--text-dim); }
.tendency.td-free .td-main { color: var(--green); }
.tendency.td-warped .td-main { color: var(--gold-hi); }
.tendency.td-breed .td-main { color: var(--rose-hi); }
.dots { display: flex; gap: 3px; }
.dots i { width: 10px; height: 10px; border-radius: 50%; border: 1px solid var(--gold-dim); background: transparent; }
.dots i.on { background: var(--rose); border-color: var(--rose-hi); box-shadow: 0 0 5px rgba(240,106,138,.45); }
.part { margin-bottom: 6px; border: 1px solid var(--line); border-radius: 7px; overflow: hidden; background: rgba(0,0,0,.2); }
.part > summary { list-style: none; cursor: pointer; display: flex; align-items: center; gap: 10px; padding: 9px 11px; }
.part > summary::-webkit-details-marker { display: none; }
.part > summary .pn { font-size: 14px; color: var(--text); min-width: 62px; }
.part > summary .lv { font-size: 11px; color: var(--gold); margin-left: auto; margin-right: 6px; }
.part > summary .arr { color: var(--gold-dim); font-size: 11px; transition: .2s; }
.part[open] > summary .arr { transform: rotate(90deg); }
.part-body { padding: 4px 11px 11px; }
.cnt3 { display: flex; gap: 6px; }
.cnt3 div { flex: 1; text-align: center; border: 1px solid var(--line); border-radius: 5px; padding: 6px 0; background: rgba(0,0,0,.25); }
.cnt3 .k { font-size: 10px; color: var(--text-dim); } .cnt3 .v { font-size: 14px; color: var(--gold-hi); font-weight: 700; }
.fetish-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 7px; font-size: 13px; color: var(--text); }
.fetish-row .dots i { width: 9px; height: 9px; }
.mini { display: flex; gap: 8px; margin-top: 8px; }
.mini div { flex: 1; text-align: center; border: 1px solid var(--line); border-radius: 6px; padding: 7px 0; background: rgba(0,0,0,.25); }
.mini .k { font-size: 10px; color: var(--text-dim); } .mini .v { font-size: 15px; color: var(--gold-hi); font-weight: 700; } .mini .v.white { color: var(--text); }
</style>
