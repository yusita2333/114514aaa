<!--
  TurfPanel · 地盘地图（#13 大改：4阶段×(10小关+1中心关)≈44关）
  两种用法:
   1. 浏览模式(view='地盘'): 阶段选项卡 + 地图块(点亮=占据/红=未纳入/锁=未解锁)，点块弹关卡信息+攻打。
   2. 选择模式(行动视图·刺探/贿赂格执行中, props.selectMode): 点可选块→resolveMapSlot。
  地图规则: 阶段1开局激活;占满本阶段10小关→解锁中心关;击败中心Boss→解锁下一阶段10小关。
  数据: engine.regions + turf 模块 + combatPowerNow。
-->
<template>
  <div class="turf" :class="{ selecting: !!selectMode }">
    <div class="turf-head">
      <div class="t-title">{{ selectMode ? selectTitle : '地盘 · 复仇地图' }}</div>
      <div class="t-power">当前武力 <b>{{ Math.round(power) }}</b></div>
      <button v-if="selectMode" class="cancel" @click="$emit('cancel')">取消</button>
    </div>

    <div class="t-hint" v-if="selectMode">{{ selectHint }}</div>
    <div class="t-hint" v-else>
      点亮=已占据 · 红=未纳入(可攻打/门槛不足) · 锁=未解锁。占满一阶段全部小关→解锁中枢Boss；击败Boss→解锁下一阶段。攻打/骚扰/刺探/贿赂均在【行动格】中选择对应动作后于此地图选目标。点地盘块查看详情。
    </div>

    <!-- 驻防 + 防守历史(浏览模式·占领后出现) -->
    <div v-if="!selectMode && occupiedCount > 0" class="garrison">
      <div class="g-row">
        <span class="g-label">驻防打手 <b>{{ r.engine.garrison }}</b> / 总 {{ r.engine.thugTotal }}</span>
        <div class="g-ctrl">
          <button @click="r.setGarrison(r.engine.garrison - 5)" :disabled="r.engine.garrison <= 0">−5</button>
          <button @click="r.setGarrison(r.engine.garrison - 1)" :disabled="r.engine.garrison <= 0">−1</button>
          <button @click="r.setGarrison(r.engine.garrison + 1)" :disabled="r.engine.garrison >= r.engine.thugTotal">+1</button>
          <button @click="r.setGarrison(r.engine.garrison + 5)" :disabled="r.engine.garrison >= r.engine.thugTotal">+5</button>
        </div>
        <span class="g-stab">常驻武力 <b>{{ r.garrisonPowerNow }}</b><template v-if="r.fortifyLevelsNow > 0"> ×加固+{{ r.fortifyLevelsNow * 10 }}% = <b>{{ r.garrisonEffectiveNow }}</b></template></span>
      </div>
      <div class="g-tip">派打手驻守地盘：敌人反击时，<b>有效常驻武力（常驻×加固加成）≥ 敌进攻强度</b>即自动守住，否则随机丢一块已占地盘。升级页的据点加固每级+10%常驻武力。驻防占用打手、<b>白天在场人数与攻打武力随之下降</b>（夜晚打手归宅不受影响）。占越多地盘、复仇越深，敌人反击越频繁越强。</div>
      <details v-if="defenseHistory.length" class="g-hist">
        <summary>防守历史（最近 {{ defenseHistory.length }} 天）</summary>
        <div v-for="d in defenseHistory" :key="d.day" class="gh-day-block">
          <div class="gh-row">
            <span class="gh-day">第{{ d.day }}天</span>
            <span v-if="d.raids === 0" class="gh-ok">平安无事</span>
            <span v-else-if="!d.lost.length" class="gh-ok">被进攻{{ d.raids }}次·全守住{{ myPowerNote(d) }}</span>
            <span v-else class="gh-bad">被进攻{{ d.raids }}次·丢失 {{ d.lost.join('、') }}{{ myPowerNote(d) }}</span>
          </div>
          <!-- 逐次战报：敌强度 vs 我方有效武力(常驻×加固%)，为何丢地盘（旧存档无 records 不显示） -->
          <div v-for="(rec, i) in (d.records ?? [])" :key="i" class="gh-row gh-rec" :class="rec.repelled ? 'gh-ok' : 'gh-bad'">
            <span class="gh-day"></span>
            <span v-if="rec.repelled">⚔ 第{{ rec.stage }}阶段敌袭 强度{{ rec.strength }} ≤ 我方{{ myPower(d) }} → 击退</span>
            <span v-else-if="rec.lostRegion">⚔ 第{{ rec.stage }}阶段敌袭 强度{{ rec.strength }} &gt; 我方{{ myPower(d) }} → 防线被突破，丢失「{{ rec.lostRegion }}」</span>
            <span v-else>⚔ 第{{ rec.stage }}阶段敌袭 强度{{ rec.strength }} &gt; 我方{{ myPower(d) }} → 防线被突破（该图已无地盘可丢）</span>
          </div>
        </div>
      </details>
    </div>

    <div v-if="r.lastTurf" class="t-feedback" :class="{ ok: r.lastTurf.ok, bad: !r.lastTurf.ok }">{{ r.lastTurf.msg }}</div>

    <!-- 阶段选项卡 -->
    <div class="stage-tabs">
      <button v-for="s in stageTabs" :key="s.stage" class="tab" :class="{ active: s.stage === curStage, locked: !s.active }"
        :disabled="!s.active" @click="curStage = s.stage">
        <span class="tab-no">第{{ s.stage }}阶段</span>
        <span class="tab-name">{{ s.region }}</span>
        <span class="tab-prog" v-if="s.active">{{ s.bossDone ? '✓ 已通关' : `${s.done}/${s.total}` }}</span>
        <span class="tab-prog" v-else>🔒</span>
      </button>
    </div>

    <!-- 中枢Boss关 -->
    <div class="center-row">
      <div class="region center" :class="centerCell.display" @click="onCell(centerCell)">
        <div class="c-badge">中枢 · Boss</div>
        <div class="c-name">{{ centerCell.def.name }}</div>
        <div class="c-boss">{{ centerCell.def.bossName }}</div>
        <div class="c-meta">门槛 <b :class="{ red: centerCell.display === 'weak' }">{{ centerCell.threshold }}</b> · 产出 {{ centerCell.yieldText }}</div>
        <div class="c-state">{{ centerCell.tag }}</div>
      </div>
    </div>

    <!-- 10 小关 -->
    <div class="grid">
      <div v-for="c in smallCells" :key="c.def.id" class="region small" :class="[c.display, { pick: selectMode && c.selectable }]" @click="onCell(c)">
        <div class="s-name">{{ shortName(c.def.name) }}</div>
        <div class="s-thr" :class="{ red: c.display === 'weak' }">{{ c.display === 'occupied' ? '✓' : (c.display === 'locked' ? '🔒' : c.threshold) }}</div>
        <div v-if="c.intel" class="s-intel">情</div>
      </div>
    </div>

    <!-- 关卡信息弹窗(浏览模式) -->
    <div v-if="popup" class="pop-mask" @click="popup = null">
      <div class="popup" @click.stop>
        <div class="p-head">
          <span class="p-name">{{ popup.def.name }}</span>
          <span class="p-tag" :class="popup.display">{{ popup.tag }}</span>
        </div>
        <div class="p-boss">守敌 · {{ popup.def.bossName }}</div>
        <div class="p-rows">
          <div class="p-row"><span>击败门槛</span><b :class="{ red: popup.display === 'weak' }">{{ popup.threshold }}</b></div>
          <div class="p-row"><span>当前武力</span><b>{{ Math.round(power) }}</b></div>
          <div class="p-row"><span>每日产出</span><b>{{ popup.yieldText }}</b></div>
          <div class="p-row"><span>驻防需求</span><b>{{ popup.def.garrisonNeed }}</b></div>
          <div class="p-row"><span>情报</span><b :class="{ gold: popup.intel }">{{ popup.intel ? '已掌握(可贿赂)' : '未刺探' }}</b></div>
        </div>
        <div class="p-note">攻打 / 骚扰 / 刺探 / 贿赂 请在【行动格】中选择对应动作，再于地图上点选此关。</div>
        <div class="p-btns">
          <button class="close" @click="popup = null">关闭</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRunnerStore } from '../runner-store';
import {
  regionState, effectiveThreshold, regionDisplay,
  smallsOfStage, centerOfStage, stageSmallProgress, isStageActive, isStageBossDefeated,
  highestActiveStage, STAGE_COUNT, SCOUT_COST, occupiedRegionIds,
} from '../../../game/turf/machine';
import type { RegionDef } from '../../../game/turf/types';
import type { RegionDisplay } from '../../../game/turf/machine';

const props = defineProps<{ selectMode?: 'scout' | 'bribe' | 'attack' | 'harass' | null }>();
const emit = defineEmits<{ cancel: [] }>();

const r = useRunnerStore();
const power = computed(() => r.combatPowerNow);
const selectMode = computed(() => props.selectMode ?? null);
const occupiedCount = computed(() => occupiedRegionIds(r.engine.regions).length);
const defenseHistory = computed(() => [...(r.engine.defenseLog ?? [])].reverse());
// 战报显示用:当日我方有效武力(优先 effectivePower;旧存档回落 garrisonPower)
type DefLogEntry = NonNullable<typeof r.engine.defenseLog>[number];
function myPower(d: DefLogEntry): string { return String(d.effectivePower ?? d.garrisonPower ?? '?'); }
function myPowerNote(d: DefLogEntry): string {
  if (d.effectivePower == null && d.garrisonPower == null) return '';
  const fort = (d.fortifyLevels ?? 0) > 0 ? `=驻防${d.garrisonPower}×加固+${(d.fortifyLevels ?? 0) * 10}%` : '';
  return `（我方有效武力 ${myPower(d)}${fort}）`;
}

const selectTitle = computed(() => ({
  attack: '攻打 · 选择目标', harass: '骚扰 · 选择目标', scout: '刺探 · 选择目标', bribe: '贿赂 · 选择目标',
} as Record<string, string>)[selectMode.value ?? ''] ?? '选择目标');
const selectHint = computed(() => {
  switch (selectMode.value) {
    case 'attack': return '点选一个【武力已达标】的高亮地盘发起攻打：成功即占据，获极道威望。门槛不足的关需先贿赂/骚扰降门槛或提升武力。';
    case 'harass': return '点选一个未占据的地盘骚扰：随机降低其击败门槛，但有概率折损打手（初期2~3，随阶段上升）。';
    case 'scout': return `点选一个未占据的地盘刺探：花费 ¥${SCOUT_COST}，约四分之一概率拿到情报（拿到后才能对其贿赂降门槛）。`;
    case 'bribe': return '点选一个【已刺探到情报】的高亮地盘贿赂：固定花门路钱，按门槛比例降低击败门槛。';
    default: return '';
  }
});

const curStage = ref(highestActiveStage(r.engine.regions));
watch(() => r.engine.regions, () => {
  // 推进后若当前阶段已通关,自动定位到最高激活阶段
  const hi = highestActiveStage(r.engine.regions);
  if (hi > curStage.value) curStage.value = hi;
});

interface Cell { def: RegionDef; display: RegionDisplay; threshold: number; tag: string; yieldText: string; intel: boolean; selectable: boolean; }

function tagOf(d: RegionDisplay): string {
  return d === 'occupied' ? '已占据' : d === 'attackable' ? '可攻打' : d === 'weak' ? '门槛不足' : '未解锁';
}
function yieldOf(def: RegionDef): string {
  const y = def.yields;
  return [y.money ? `¥${y.money}` : '', y.condom ? `套${y.condom}` : '', y.martial ? `威${y.martial}` : ''].filter(Boolean).join('·');
}
function shortName(name: string): string {
  const i = name.indexOf('·');
  return i >= 0 ? name.slice(i + 1) : name;
}
function selectableOf(def: RegionDef, display: RegionDisplay): boolean {
  if (!selectMode.value) return false;
  const st = regionState(r.engine.regions, def.id);
  if (st.defeated) return false;
  if (selectMode.value === 'attack') return display === 'attackable'; // 攻打:武力达标的关
  if (selectMode.value === 'bribe') return st.intel === true;          // 贿赂:仅已获情报关
  return display !== 'locked'; // 刺探/骚扰:任一可见未占据关
}
function buildCell(def: RegionDef): Cell {
  const st = regionState(r.engine.regions, def.id);
  const display = regionDisplay(r.engine.regions, def, power.value);
  return {
    def, display, threshold: effectiveThreshold(def, st), tag: tagOf(display),
    yieldText: yieldOf(def), intel: st.intel === true, selectable: selectableOf(def, display),
  };
}

const smallCells = computed(() => smallsOfStage(curStage.value).map(buildCell));
const centerCell = computed(() => buildCell(centerOfStage(curStage.value)!));

const stageTabs = computed(() => Array.from({ length: STAGE_COUNT }, (_, i) => {
  const stage = i + 1;
  const p = stageSmallProgress(r.engine.regions, stage);
  return { stage, region: centerOfStage(stage)!.name.split('·')[0], active: isStageActive(r.engine.regions, stage),
    done: p.done, total: p.total, bossDone: isStageBossDefeated(r.engine.regions, stage) };
}));

const popup = ref<Cell | null>(null);

function onCell(c: Cell) {
  if (selectMode.value) {
    if (c.selectable) r.resolveMapSlot(c.def.id);
    return;
  }
  popup.value = c;
}
</script>

<style scoped>
.turf { padding: 18px 24px; overflow-y: auto; height: 100%; }
/* 批H4·手机重排: 地图 5列→3列(每格更大可点);阶段tab横滑;收边距 */
@media (max-width: 820px) {
  .turf { padding: 12px 10px; height: auto; }
  .grid { grid-template-columns: repeat(3, 1fr); gap: 7px; }
  .stage-tabs { overflow-x: auto; flex-wrap: nowrap; -webkit-overflow-scrolling: touch; padding-bottom: 4px; }
  .stage-tabs .tab { flex: none; }
}
.turf.selecting { background: radial-gradient(circle at 50% 0, rgba(201,162,74,.06), transparent 60%); }
.turf-head { display: flex; align-items: baseline; gap: 16px; margin-bottom: 6px; }
.t-title { font-family: var(--brush); font-size: 28px; color: var(--gold-hi); }
.t-power { margin-left: auto; font-size: 14px; color: var(--text-dim); }
.t-power b { font-size: 22px; color: var(--gold-hi); font-weight: 700; }
.cancel { font-family: var(--serif); background: rgba(179,33,46,.12); color: var(--red-hi); border: 1px solid var(--red); border-radius: 6px; padding: 6px 14px; font-size: 13px; cursor: pointer; }
.t-hint { font-size: 12px; color: var(--text-dim); line-height: 1.7; margin: 4px 0 12px; max-width: 800px; }
.t-feedback { margin-bottom: 12px; padding: 9px 14px; border-radius: 7px; font-size: 13px; }
.t-feedback.ok { background: rgba(94,122,72,.12); border: 1px solid #3a4a2a; color: var(--green); }
.t-feedback.bad { background: rgba(179,33,46,.1); border: 1px solid var(--red); color: var(--red-hi); }

.garrison { border: 1px solid var(--line); border-radius: 9px; background: rgba(0,0,0,.25); padding: 10px 14px; margin-bottom: 14px; }
.g-row { display: flex; align-items: center; gap: 14px; }
.g-label { font-size: 13px; color: var(--text-dim); } .g-label b { color: var(--gold-hi); font-size: 15px; }
.g-ctrl { display: flex; gap: 6px; }
.g-ctrl button { font-family: var(--serif); font-size: 13px; color: var(--text); background: rgba(0,0,0,.35); border: 1px solid var(--line); border-radius: 5px; padding: 4px 11px; cursor: pointer; }
.g-ctrl button:hover:not(:disabled) { border-color: var(--gold-dim); color: var(--gold-hi); }
.g-ctrl button:disabled { opacity: .35; cursor: not-allowed; }
.g-stab { margin-left: auto; font-size: 13px; color: var(--text-dim); } .g-stab b { color: var(--gold-hi); font-size: 16px; }
.g-tip { font-size: 11px; color: var(--text-dim); line-height: 1.6; margin-top: 7px; } .g-tip b { color: var(--gold); }
.g-hist { margin-top: 8px; }
.g-hist summary { font-size: 12px; color: var(--gold-dim); cursor: pointer; }
.gh-row { display: flex; gap: 12px; font-size: 12px; padding: 3px 0 3px 12px; }
.gh-day-block { margin-bottom: 2px; }
.gh-rec { padding-top: 0; padding-bottom: 1px; font-size: 11px; opacity: 0.85; }
.gh-day { color: var(--text-dim); min-width: 54px; }
.gh-ok { color: var(--green); }
.gh-bad { color: var(--rose-hi); }

.stage-tabs { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
.tab { display: flex; flex-direction: column; align-items: flex-start; gap: 1px; min-width: 92px;
  font-family: var(--serif); background: rgba(0,0,0,.3); border: 1px solid var(--line); border-radius: 7px;
  padding: 7px 12px; cursor: pointer; transition: .12s; }
.tab .tab-no { font-size: 11px; color: var(--text-dim); letter-spacing: 1px; }
.tab .tab-name { font-size: 14px; color: var(--text); }
.tab .tab-prog { font-size: 11px; color: var(--gold-dim); }
.tab.active { border-color: var(--gold); background: linear-gradient(180deg, rgba(201,162,74,.18), rgba(0,0,0,.2)); }
.tab.active .tab-name { color: var(--gold-hi); }
.tab.locked { opacity: .45; cursor: not-allowed; }

.center-row { margin-bottom: 14px; }
.region { cursor: pointer; border-radius: 9px; border: 1px solid var(--line); transition: .12s; position: relative; }
.region.center { padding: 14px 18px; background: linear-gradient(180deg, rgba(30,16,18,.6), rgba(0,0,0,.3)); }
.region.center .c-badge { font-size: 10px; letter-spacing: 2px; color: var(--red-hi); }
.region.center .c-name { font-family: var(--brush); font-size: 24px; color: var(--text); margin-top: 2px; }
.region.center .c-boss { font-size: 13px; color: var(--gold-dim); margin-top: 2px; }
.region.center .c-meta { font-size: 12px; color: var(--text-dim); margin-top: 6px; }
.region.center .c-meta b { color: var(--text); } .region.center .c-meta b.red { color: var(--red-hi); }
.region.center .c-state { position: absolute; top: 14px; right: 18px; font-size: 12px; }

/* 占据=点亮(金) / attackable=红可打 / weak=暗红 / locked=锁 */
.region.occupied { border-color: var(--gold); background: linear-gradient(180deg, rgba(201,162,74,.2), rgba(0,0,0,.25)); box-shadow: 0 0 12px rgba(201,162,74,.18); }
.region.attackable { border-color: var(--red); box-shadow: 0 0 8px rgba(179,33,46,.3); }
/* Boss战可打(批F1·用户反馈#2): 中枢关达到可攻打状态时脉冲高亮,一眼可见 */
.region.center.attackable { border: 2px solid var(--red-hi); animation: bossPulse 1.6s ease-in-out infinite; }
.region.center.attackable .c-state { color: var(--red-hi); font-weight: 700; letter-spacing: 2px; }
@keyframes bossPulse {
  0%, 100% { box-shadow: 0 0 10px rgba(179,33,46,.35); }
  50% { box-shadow: 0 0 24px rgba(179,33,46,.75), inset 0 0 14px rgba(179,33,46,.2); }
}
.region.weak { border-color: rgba(179,33,46,.4); }
.region.locked { opacity: .4; cursor: default; }
.region.center.occupied .c-state { color: var(--gold-hi); }
.region.center.attackable .c-state { color: var(--red-hi); }

.grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 9px; }
.region.small { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; aspect-ratio: 1.5; padding: 6px; min-height: 56px; }
.region.small .s-name { font-size: 12px; color: var(--text); text-align: center; line-height: 1.2; }
.region.small .s-thr { font-size: 14px; font-weight: 700; color: var(--gold-dim); }
.region.small .s-thr.red { color: var(--red-hi); }
.region.small.occupied .s-thr { color: var(--gold-hi); }
.region.small.locked .s-name { color: var(--text-dim); }
.region.small .s-intel { position: absolute; top: 3px; right: 5px; font-size: 10px; color: var(--gold-hi); }
.region.pick { border-color: var(--gold-hi) !important; box-shadow: 0 0 12px rgba(236,200,120,.5) !important; cursor: pointer; animation: pickpulse 1.3s ease-in-out infinite; }
@keyframes pickpulse { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-2px); } }
.turf.selecting .region:not(.pick) { opacity: .4; }

.pop-mask { position: absolute; inset: 0; background: rgba(8,5,6,.6); display: flex; align-items: center; justify-content: center; z-index: 50; } /* 批H8.2: fixed→absolute(锚最近定位祖先,窄屏fixed不渲染对策) */
.popup { width: 340px; background: linear-gradient(180deg, var(--panel), var(--panel-2)); border: 1px solid var(--gold-dim); border-radius: 12px; padding: 18px 20px; box-shadow: 0 20px 60px rgba(0,0,0,.7); }
.p-head { display: flex; align-items: center; gap: 10px; }
.p-name { font-family: var(--brush); font-size: 22px; color: var(--gold-hi); }
.p-tag { font-size: 11px; padding: 3px 9px; border-radius: 3px; margin-left: auto; }
.p-tag.occupied { background: rgba(201,162,74,.18); color: var(--gold-hi); }
.p-tag.attackable { background: rgba(179,33,46,.18); color: var(--red-hi); }
.p-tag.weak { background: rgba(179,33,46,.12); color: #caa0a0; }
.p-tag.locked { background: rgba(0,0,0,.3); color: var(--text-dim); }
.p-boss { font-size: 12px; color: var(--text-dim); margin-top: 6px; }
.p-rows { margin: 12px 0; }
.p-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dashed var(--line); font-size: 13px; color: var(--text-dim); }
.p-row b { color: var(--text); } .p-row b.red { color: var(--red-hi); } .p-row b.gold { color: var(--gold-hi); }
.p-note { font-size: 11px; color: var(--gold-dim); line-height: 1.6; margin-top: 10px; padding: 7px 9px; background: rgba(201,162,74,.06); border-radius: 5px; }
.p-btns { display: flex; gap: 10px; margin-top: 12px; }
.atk { flex: 1; font-family: var(--serif); background: linear-gradient(180deg, var(--gold-hi), var(--gold)); color: #1a120a; border: none; border-radius: 6px; padding: 10px; font-size: 14px; font-weight: 700; cursor: pointer; }
.atk:disabled { background: rgba(0,0,0,.3); color: var(--text-dim); border: 1px solid var(--line); cursor: not-allowed; }
.close { font-family: var(--serif); background: transparent; border: 1px solid var(--line); color: var(--text-dim); border-radius: 6px; padding: 10px 16px; font-size: 13px; cursor: pointer; }
</style>
