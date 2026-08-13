<!--
  SlotDetail · 选中事件格的子页
  职责: 展示 SlotStrip 当前选中格的内容——
    · 可编辑(未排/已排未执行): 事件选择界面(选项列表，点选即安排)
    · 进行中: 占位提示
    · 已结算: 该格生成的正文(首字水墨 + 段落保留 white-space:pre-wrap·修复排版失效)
    · 锁定: 锁定来源 + (若已结算)正文
  正文区可滚动；横条选格切换内容，玩家不用上下翻找。
-->
<template>
  <div class="detail" v-if="slot">
    <div class="d-head">
      <span class="d-no">{{ cn }}</span>
      <span class="d-title">{{ slot.choice?.label ?? '未安排' }}</span>
      <span class="d-tag" :class="tagClass">{{ tagText }}</span>
    </div>

    <!-- 已结算正文(批I4-6: 按段渲染独立卡片·每段首字水墨·续写段自带分隔,不再淹在长文里) -->
    <template v-if="showProse">
      <!-- 编辑模式(批I4-7: 玩家直接改正文) -->
      <div v-if="editing" class="edit-box">
        <textarea v-model="editText" class="edit-ta" rows="14"></textarea>
        <div class="ops-row">
          <button class="op-btn gold" @click="saveEdit">✓ 保存修改</button>
          <button class="op-btn" @click="editing = false">取消</button>
        </div>
      </div>
      <template v-else>
        <div v-for="(sg, si) in segs" :key="si" class="prose-seg">
          <div v-if="si > 0" class="seg-divider">— 续 · {{ si }} —</div>
          <div class="prose"><span class="first">{{ sg.slice(0, 1) }}</span>{{ sg.slice(1) }}</div>
        </div>
        <div class="fav-row">
          <button class="fav-btn" @click="onFav">{{ favDone ? '✓ 已收藏到留档' : '❤ 收藏本段正文' }}</button>
          <button class="fav-btn" @click="startEdit">✎ 编辑正文</button>
        </div>
        <!-- 批I4-6/批Q: 续写·重roll 操作区。批Q 前这一块被 isLastExec 锁死在"最近执行的那一格",
             玩家往前推进一格,刚看完的场面(首次AV/临盆这类想接着扩的)就再也续不了了。
             现在续写/重roll最后一段/重新生成对【任意已结算格】开放;
             只有「重roll整格」仍限最近执行格——它要连数值一起重算,依赖执行前快照,历史格没有。 -->
        <div class="cont-box">
          <textarea v-model="contNote" class="note-ta" rows="2"
            placeholder="续写要求（选填·例：接下来转到浴室 / 多写对话）"></textarea>
          <div class="ops-row">
            <button class="op-btn gold" :disabled="r.busy" @click="doCont">▸ 续写本格</button>
            <button v-if="segs.length > 1" class="op-btn" :disabled="r.busy" @click="doRerollSeg">↻ 重roll最后一段</button>
            <button class="op-btn" :disabled="r.busy" @click="doRegen">↻ 重新生成正文</button>
            <button v-if="isLastExec" class="op-btn" :disabled="r.busy" @click="doRerollAll"
              title="连数值一起重算（恢复执行前快照重跑本格）。仅最近执行的那一格可用。">↻ 重roll整格</button>
          </div>
        </div>
      </template>
    </template>

    <!-- 批L: 已结算但没有正文 = AI 空回/被截断。此前这里会掉进下面的「选项列表」或「强占提示」
         分支,且续写/重roll按钮被 v-if="showProse" 挡住 → 玩家完全没有出口(尤其突发事件等
         locked 插入格,直接卡关)。现给一个独立的失败面板,任何已结算格都能就地补救。 -->
    <div v-else-if="slot.status === 'done'" class="fail-pane">
      <div class="fp-title">⚠ 本格没有生成出正文</div>
      <div class="fp-desc">
        AI 返回了空内容或被中途截断（数值结算已经正常入账，只是正文丢了）。<br />
        直接点下面重新生成即可；连续失败多半是<b>预设破甲没生效</b>或<b>注入太长被上游拦下</b>，
        可去「设置 → AI 生成」确认预设条目开关，或把「前文记忆」档位调低再试。
      </div>
      <textarea v-model="contNote" class="note-ta" rows="2"
        placeholder="补充要求（选填·会一并发给 AI，例：写短一点 / 避开露骨描写）"></textarea>
      <div class="ops-row">
        <button class="op-btn gold" :disabled="r.busy" @click="doRegen">
          {{ r.busy ? '生成中…' : '↻ 重新生成本格正文' }}
        </button>
        <button class="op-btn" @click="startEdit">✎ 手动补写</button>
      </div>
      <div v-if="editing" class="edit-box">
        <textarea v-model="editText" class="edit-ta" rows="10"></textarea>
        <div class="ops-row">
          <button class="op-btn gold" @click="saveEdit">✓ 保存</button>
          <button class="op-btn" @click="editing = false">取消</button>
        </div>
      </div>
    </div>

    <!-- 进行中 -->
    <div v-else-if="slot.status === 'running'" class="hint-pane">⏳ 本格正在生成…</div>

    <!-- 锁定（未结算） -->
    <div v-else-if="slot.locked" class="hint-pane">⚠ 本格被「{{ slot.lockedBy }}」强占，不可改派。</div>

    <!-- 可编辑：事件选择 -->
    <div v-else class="picker">
      <div class="picker-cap">选择本格{{ period === 'day' ? '经营' : '供奉' }}行动：</div>
      <div class="opts">
        <button v-for="o in options" :key="o.optionId"
          class="opt" :class="{ on: slot.choice?.optionId === o.optionId }"
          @click="$emit('pick', o.optionId, o.label)">
          {{ o.label }}<span v-if="o.isNsfw" class="heart"> ♥</span>
        </button>
      </div>
      <!-- 批I2: 自定义事件·内容输入 + 读取玩家世界书开关 -->
      <div v-if="slot.choice?.optionId === 'custom_event'" class="custom-box">
        <div class="cb-cap">写下你想要的事件内容（AI 按此生成，场景/人物/走向都可指定）：</div>
        <textarea v-model="customText" class="note-ta" rows="4"
          placeholder="例：凛独自泡汤时被两名巡夜打手撞见，从赔罪演变成……"
          @change="saveParams"></textarea>
        <label class="wb-row">
          <input type="checkbox" v-model="useWb" @change="saveParams" />
          读取我的全局世界书（按关键词命中的条目附给 AI；默认关）
        </label>
      </div>
      <!-- 批I2: 普通事件·补充要求(选填·user层注入) -->
      <div v-else-if="slot.choice" class="custom-box">
        <div class="cb-cap">补充要求（选填，会注入给 AI）：</div>
        <textarea v-model="noteText" class="note-ta" rows="2"
          placeholder="例：这一场多写凛的心理活动 / 场景放在雨夜"
          @change="saveParams"></textarea>
      </div>
      <button v-if="slot.choice" class="clear" @click="$emit('clear')">清空本格</button>
    </div>
  </div>
  <div class="detail empty" v-else>从上方横条点选一个事件格查看 / 安排</div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { ActionSlot, SlotPeriod } from '../../../game/action-grid/types';
import { useRunnerStore } from '../runner-store';

interface MenuOpt { optionId: string; label: string; isNsfw: boolean }
const props = defineProps<{ slot: ActionSlot | null; period: SlotPeriod; options: MenuOpt[] }>();
defineEmits<{ pick: [optionId: string, label: string]; clear: [] }>();

// 收藏本段(批E2·留档)
const r = useRunnerStore();
const favDone = ref(false);
watch(() => props.slot, () => { favDone.value = false; });

// ─── 批I2: 自定义事件内容/补充要求/世界书开关(存进 choice.params·执行时注入) ───
const customText = ref('');
const noteText = ref('');
const useWb = ref(false);
watch(() => props.slot?.choice, (c) => { // 切格/换选项时从 params 回填
  customText.value = typeof c?.params?.customPrompt === 'string' ? c.params.customPrompt as string : '';
  noteText.value = typeof c?.params?.userNote === 'string' ? c.params.userNote as string : '';
  useWb.value = c?.params?.useUserLorebook === true;
}, { immediate: true });
function saveParams() {
  const s = props.slot; const c = s?.choice;
  if (!s || !c || s.status === 'done' || s.status === 'running') return;
  r.setChoice(props.period, s.index, {
    ...c,
    params: {
      ...(c.params ?? {}),
      ...(c.optionId === 'custom_event'
        ? { customPrompt: customText.value, useUserLorebook: useWb.value }
        : { userNote: noteText.value }),
    },
  });
}
function onFav() {
  if (!props.slot) return;
  if (r.favoriteSlot(props.slot as any)) favDone.value = true;
  else favDone.value = true; // 已收藏过同样置✓(去重)
}

// 中文大写计数(1起):壹..玖/拾/拾壹..拾玖/廿/廿壹..廿玖/卅... 行动格上限约20,做到卌冗余。
const D = ['', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'];
const TENS = ['', '拾', '廿', '卅', '卌'];
function cnNumber(n: number): string {
  if (n <= 0) return '';
  if (n < 10) return D[n];
  const t = Math.floor(n / 10), u = n % 10;
  if (t >= TENS.length) return String(n); // 超范围兜底
  return TENS[t] + D[u];
}
const cn = computed(() => props.slot ? cnNumber(props.slot.index + 1) : '');
const showProse = computed(() => props.slot?.status === 'done' && !!props.slot.resultText);
const text = computed(() => (props.slot?.resultText ?? '').trim());

// ─── 批I4-6: 按段拆分(segStarts 偏移·缺省单段兼容旧档) ───
const segs = computed(() => {
  const full = props.slot?.resultText ?? '';
  const starts = props.slot?.segStarts?.length ? props.slot.segStarts : [0];
  return starts
    .map((s, i) => full.slice(s, i + 1 < starts.length ? starts[i + 1] : full.length).trim())
    .filter(Boolean);
});
const isLastExec = computed(() => {
  const le = r.lastExec;
  return !!le && !!props.slot && le.period === props.period && le.index === props.slot.index
    && props.slot.status === 'done';
});

// ─── 批I4-5/6: 续写要求 + 操作 ───
// 批N(社区实证·用户"塞拉": "重ROLL似乎要提前复制一遍,否则就要完全重写,不小心吞掉自己以前的
// 要求好几次了"): 此前 doCont/doRerollSeg 用完就把输入框清空,doRerollAll 更是压根不传 note。
// 现在改为【用完保留】,玩家可以拿同一条要求反复重roll直到满意;换格时才由下方 watch 清掉。
// 批Q: 续写/重roll最后一段改为按格调用(不再依赖 store 的"最近执行格"单例)
const contNote = ref('');
async function doCont() {
  if (!props.slot) return;
  await r.continueSlot(props.period, props.slot.index, contNote.value);
}
async function doRerollSeg() {
  if (!props.slot) return;
  await r.rerollLastSegment(props.period, props.slot.index, contNote.value);
}
async function doRerollAll() { await r.rerunLast(contNote.value); }
// 批L: 空回/截断格的重新生成(只补正文,不重跑数值结算)
async function doRegen() {
  if (!props.slot) return;
  await r.regenerateSlotText(props.period, props.slot.index, contNote.value);
}

// ─── 批I4-7: 编辑正文 ───
const editing = ref(false);
const editText = ref('');
function startEdit() { editText.value = text.value; editing.value = true; }
function saveEdit() {
  if (!props.slot) return;
  if (r.editSlotText(props.period, props.slot.index, editText.value)) editing.value = false;
}
watch(() => props.slot, () => { editing.value = false; contNote.value = ''; });
const tagText = computed(() => {
  const s = props.slot; if (!s) return '';
  if (s.locked) return '强占';
  if (s.status === 'done') return '已结算';
  if (s.status === 'running') return '进行中';
  if (s.status === 'planned') return '已安排';
  return '待安排';
});
const tagClass = computed(() => ({
  done: props.slot?.status === 'done',
  wait: props.slot?.status === 'planned',
  nsfw: props.slot?.locked || props.slot?.status === 'running',
}));
</script>

<style scoped>
.detail { border: 1px solid var(--line); border-radius: 8px; background: linear-gradient(180deg, var(--panel), var(--panel-2)); padding: 16px 18px; min-height: 100%; }
.detail.empty { display: flex; align-items: center; justify-content: center; color: var(--text-dim); font-size: 14px; }
.d-head { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; padding-bottom: 10px; border-bottom: 1px solid var(--line); }
.d-no { font-family: var(--brush); font-size: 26px; color: var(--gold); }
.d-title { flex: 1; font-size: 18px; color: var(--text); letter-spacing: 1px; }
.d-tag { font-size: 11px; padding: 3px 10px; border-radius: 3px; }
.d-tag.done { background: rgba(94,122,72,.18); color: var(--green); }
.d-tag.wait { background: rgba(201,162,74,.12); color: var(--gold); }
.d-tag.nsfw { background: rgba(179,33,46,.18); color: var(--red-hi); }

.prose { font-size: 15px; line-height: 2; color: var(--text); white-space: pre-wrap; }
/* 批I4-6: 段卡片+分隔 */
.prose-seg { margin-bottom: 4px; }
.seg-divider { text-align: center; font-family: var(--brush); font-size: 15px; color: var(--gold-dim); letter-spacing: 6px; margin: 16px 0 12px; border-top: 1px dashed var(--line); padding-top: 12px; }
.fav-row { margin-top: 10px; display: flex; gap: 8px; }
.fav-btn { font-family: var(--serif); background: transparent; border: 1px solid var(--line); color: var(--rose-hi); border-radius: 6px; padding: 6px 14px; font-size: 12px; cursor: pointer; }
.fav-btn:hover { border-color: var(--rose); }
/* 批I4-5/6/7: 续写操作区/编辑 */
.cont-box { margin-top: 14px; border-top: 1px dashed var(--line); padding-top: 12px; }
.ops-row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.op-btn { font-family: var(--serif); background: transparent; border: 1px solid var(--line); color: var(--text-dim); border-radius: 6px; padding: 8px 16px; font-size: 13px; cursor: pointer; }
.op-btn:hover { border-color: var(--gold-dim); color: var(--text); }
.op-btn.gold { background: linear-gradient(180deg, var(--gold-hi), var(--gold)); color: #1a120a; border: none; font-weight: 700; }
.op-btn:disabled { opacity: .5; cursor: wait; }
.edit-box { margin-top: 4px; }
.edit-ta { width: 100%; box-sizing: border-box; font-family: var(--serif); font-size: 14px; line-height: 1.9; color: var(--text); background: rgba(0,0,0,.3); border: 1px solid var(--gold-dim); border-radius: 7px; padding: 12px 14px; resize: vertical; }
.edit-ta:focus { outline: none; border-color: var(--gold); }
.prose .first { font-family: var(--brush); font-size: 32px; color: var(--gold-hi); float: left; line-height: 1; margin: 6px 12px 0 0; }

.hint-pane { color: var(--text-dim); font-size: 14px; padding: 20px 0; text-align: center; }

/* 批L: 空回/截断失败面板 */
.fail-pane { border: 1px solid rgba(179,33,46,.45); border-radius: 8px; background: rgba(179,33,46,.07); padding: 16px 18px; }
.fp-title { font-size: 15px; color: var(--red-hi); letter-spacing: 1px; margin-bottom: 10px; }
.fp-desc { font-size: 13px; line-height: 1.9; color: var(--text-dim); margin-bottom: 12px; }
.fp-desc b { color: var(--gold-hi); font-weight: 700; }

.picker-cap { font-size: 13px; color: var(--text-dim); margin-bottom: 12px; letter-spacing: 1px; }
.opts { display: flex; flex-direction: column; gap: 8px; }
.opt { text-align: left; font-family: var(--serif); background: rgba(0,0,0,.3); color: var(--text); border: 1px solid var(--line); border-radius: 7px; padding: 12px 16px; font-size: 15px; cursor: pointer; transition: .12s; }
.opt:hover { border-color: var(--gold-dim); background: rgba(236,200,120,.06); }
.opt.on { border-color: var(--gold); background: rgba(201,162,74,.16); color: var(--gold-hi); font-weight: 700; }
.opt .heart { color: var(--red-hi); }
.clear { margin-top: 12px; background: rgba(0,0,0,.3); color: var(--text-dim); border: 1px solid var(--line); border-radius: 6px; padding: 7px 14px; font-size: 12px; cursor: pointer; }

/* 批I2: 自定义事件/补充要求输入区 */
.custom-box { margin-top: 12px; border-top: 1px dashed var(--line); padding-top: 12px; }
.cb-cap { font-size: 12px; color: var(--gold-dim); margin-bottom: 8px; letter-spacing: 1px; }
.note-ta { width: 100%; box-sizing: border-box; font-family: var(--serif); font-size: 13px; line-height: 1.7;
  color: var(--text); background: rgba(0,0,0,.3); border: 1px solid var(--line); border-radius: 7px;
  padding: 10px 12px; resize: vertical; }
.note-ta:focus { outline: none; border-color: var(--gold-dim); }
.wb-row { display: flex; align-items: center; gap: 8px; margin-top: 8px; font-size: 12px; color: var(--text-dim); cursor: pointer; }
.wb-row input { accent-color: var(--gold-hi); }
</style>
