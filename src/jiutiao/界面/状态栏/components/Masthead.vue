<!--
  Masthead · 顶部刊头（横向木纹）+ 状态条
  职责: logo + 六项核心数值（资金/威望/打手/群体欲望/避孕套/堕落度），
        每项悬停出浮窗、点击钉住（再点或点别处取消）。
  数据: engine（见 UI改版工程说明.md §3 数据映射，🟡=占位）。
-->
<template>
  <header class="masthead">
    <div class="logo">九条会<span class="sub">JIUTIAO · 极道手账 · {{ BUILD_VERSION }}</span></div>

    <div class="stat-strip">
      <!-- 1 资金 -->
      <div class="stat pinnable" :class="{ pinned: pin === 'money' }" @click.stop="toggle('money')">
        <div class="k">资 金</div>
        <div class="v">¥{{ e.money.toLocaleString() }}</div>
        <div class="pop wide-pop">
          <h4>资金流水 · 最近进出（悬停查看 · 点击钉住）</h4>
          <div v-if="!ledger.length" class="prow">暂无流水——招募/采购/收保护费/卖AV/升级 等会记在这里。</div>
          <div v-for="(rr, i) in ledger" :key="i" class="row"><span>{{ rr.t }}</span><b :class="rr.d >= 0 ? 'plus' : 'minus'">{{ rr.d >= 0 ? '+' : '' }}{{ rr.d.toLocaleString() }}</b></div>
        </div>
      </div>

      <!-- 2 威望 单数值(色随偏向)·悬停出占比条 -->
      <div class="stat pinnable" :class="{ pinned: pin === 'prestige' }" @click.stop="toggle('prestige')">
        <div class="k">威 望</div>
        <div class="v" :style="{ color: prestigeColor }">{{ prestigeTotal }}</div>
        <div class="pop">
          <h4>威望 = 极道 + 淫名{{ avUnlocked ? '' : '（淫名未解锁）' }}</h4>
          <div class="pbar"><span class="pg" :style="{ width: goldPct + '%' }"></span><span class="pr" :style="{ width: redPct + '%' }"></span></div>
          <div class="row" style="margin-top:8px"><span style="color:var(--gold-hi)">极道威望</span><b>{{ e.martialPrestige }}</b></div>
          <div class="row"><span :style="{ color: 'var(--rose-hi)' }">淫名{{ avUnlocked ? '' : '（不计入）' }}</span><b>{{ e.infamy }}</b></div>
          <div class="row"><span>今日极道进账</span><b :class="(e.martialGainToday ?? 0) > 0 ? 'plus' : 'minus'">{{ (e.martialGainToday ?? 0) > 0 ? '+' : '' }}{{ e.martialGainToday ?? 0 }}</b></div>
          <div class="row"><span>占比风味</span><b>{{ prestigeBias }}</b></div>
          <div class="frow">威望每日自然衰减 ~3%（江湖善忘）；连续两日零极道进账 → 再生力枯竭（硬失败）。</div>
          <div class="hint">{{ avUnlocked ? '颜色越偏极道越金、越偏淫名越绯红；总威望决定招募额度。' : '拍第一部AV解锁淫名后，淫名才计入总威望。当前威望=极道威望。' }}</div>
        </div>
      </div>

      <!-- 3 打手·在场 -->
      <div class="stat pinnable" :class="{ pinned: pin === 'thug' }" @click.stop="toggle('thug')">
        <div class="k">打手 · 在场</div>
        <div class="v white">{{ e.thugTotal }}<span class="sub-n"> / {{ e.presentCount }}</span></div>
        <div class="pop">
          <h4>打手 · 机制</h4>
          <div class="row"><span>总打手</span><b>{{ e.thugTotal }}</b></div>
          <div class="row"><span>在场（当前场景）</span><b>{{ e.presentCount }}</b></div>
          <div class="prow">总数 = 麾下全部人手；在场 = 当前这场供奉/事件出场的人数（决定避孕套消耗与场面规模）。</div>
          <div class="prow">增减：招募↑ / 自然增长↑（淫名越高越快）/ 攻防损耗↓ / 驻守占用（锁定不可用）。</div>
          <div class="row"><span>本周招募额度</span><b>{{ e.recruitQuotaMax ?? e.recruitQuota }}</b></div>
          <div class="row"><span>本周剩余额度</span><b :class="{ minus: e.recruitQuota <= 0 }">{{ e.recruitQuota }}</b></div>
          <div class="row"><span>单次招募</span><b>3-4 人（可升级）</b></div>
          <div class="hint">额度随威望提升；上限随设施升级</div>
        </div>
      </div>

      <!-- 3.5 忠诚度(色随偏向·极道金/淫乱绯红) -->
      <div class="stat pinnable" :class="{ pinned: pin === 'loyalty' }" @click.stop="toggle('loyalty')">
        <div class="k">忠 诚</div>
        <div class="v" :style="{ color: loyaltyColor }">{{ e.loyalty }}</div>
        <div class="pop">
          <h4>忠诚度 · {{ loyaltyBiasText }}（{{ loyaltyStageNo }}/5）</h4>
          <div class="loyal-quote">「{{ loyaltyQuote }}」</div>
          <div class="frow">忠诚越高，<b>在场打手比率</b>越容易刷高（在场人数 = 总人数 × 比率），间接抬升战斗力。</div>
          <div class="frow">每日自然流失率 =（100 − 忠诚）÷ 10 %。</div>
          <div class="frow">忠诚每日自然衰减 −{{ loyDecay }}（不维护就滑落{{ loyDecayReduce > 0 ? '·升级已减免 ' + loyDecayReduce : '' }}）。</div>
          <div class="row"><span>预计日流失率</span><b>{{ ((100 - e.loyalty) / 10).toFixed(1) }}%</b></div>
          <div class="row"><span>极道忠诚 · 淫乱忠诚</span><b>{{ e.loyaltyMartial ?? 0 }} · {{ e.loyaltyInfamy ?? 0 }}</b></div>
          <div class="hint">发钱「犒赏打手」→极道忠诚；夜晚「供奉」→淫乱忠诚。颜色按两者占比金↔绯红渐变。</div>
        </div>
      </div>

      <!-- 4 群体欲望 -->
      <div class="stat pinnable" :class="{ pinned: pin === 'desire' }" @click.stop="toggle('desire')">
        <div class="k">群体欲望</div>
        <div class="v" :style="{ color: desireOver ? 'var(--red-hi)' : 'var(--gold-hi)' }">{{ e.desire }}/{{ e.desireCapacity }}</div>
        <div class="pop">
          <h4>群体欲望 · 机制</h4>
          <div class="prow">每天清晨按可用打手数累积欲望；夜晚每场供奉按人数清偿。日终结余仍 ≥ 上限 → 次日触发「白日供奉」（全天供奉泄欲）。</div>
          <div class="row"><span>当前 / 上限</span><b>{{ e.desire }} / {{ e.desireCapacity }}</b></div>
          <div class="row"><span>今晨累积</span><b class="minus">+{{ e.desireAddedThisMorning ?? 0 }}</b></div>
          <div class="hint">上限可由设施升级提高（拖延白日供奉）</div>
        </div>
      </div>

      <!-- 5 避孕套 -->
      <div class="stat pinnable" :class="{ pinned: pin === 'condom' }" @click.stop="toggle('condom')">
        <div class="k">避孕套</div>
        <div class="v" :style="{ color: condomTone }">{{ e.condomStock }}</div>
        <div class="pop wide-pop">
          <h4>避孕套 · 库存与消耗</h4>
          <div class="row"><span>库存</span><b>{{ e.condomStock }}</b></div>
          <div class="row"><span>今日消耗</span><b :class="{ minus: condomToday > 0 }">{{ condomToday > 0 ? '-' + condomToday : '—' }}</b></div>
          <div class="row"><span>昨日消耗</span><b :class="{ minus: condomYesterday > 0 }">{{ condomYesterday > 0 ? '-' + condomYesterday : '—' }}</b></div>
          <div class="chart-warn">安全措施保障，避孕套消耗殆尽的话，不难猜到欲望上头的打手们会做出什么事。</div>
          <div class="chart-inline">
            <div class="ci-t">消耗趋势</div>
            <svg v-if="condomChart.length >= 2" viewBox="0 0 280 72" preserveAspectRatio="none">
              <polyline :points="condomChartPoints" fill="none" stroke="var(--rose-hi)" stroke-width="2"/>
            </svg>
            <div v-else class="chart-empty">暂无消耗记录——开始供奉/采购后这里按日统计。</div>
          </div>
        </div>
      </div>

      <!-- 6 堕落度（含认知防线） -->
      <div class="stat pinnable" :class="{ pinned: pin === 'corruption' }" @click.stop="toggle('corruption')">
        <div class="k">堕落度</div>
        <div class="v red">{{ e.corruption }}</div>
        <div class="pop">
          <h4>堕落度 · 认知防线</h4>
          <div class="prow">堕落度累积推进「认知防线」：死撑 → 动摇 → 崩溃 → 母猪化，单向不可逆，决定凛面对玷污时的真实态度。</div>
          <div class="row"><span>当前认知</span><b>{{ e.cognition }}</b></div>
          <template v-if="nextStage">
            <div class="row"><span>距下阶段「{{ nextStage.stage }}」({{ nextStage.at }})</span><b>还差 {{ nextStage.gap }}</b></div>
          </template>
          <template v-else>
            <div class="row"><span>认知防线</span><b>已至母猪化</b></div>
          </template>
          <div v-if="nextGate" class="row sub"><span>↳ 下阶段奖励（{{ nextGate.at }}）</span><b class="plus">{{ nextGate.text }}</b></div>
          <div class="hint">堕落越深，阶段奖励越丰</div>
        </div>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { BUILD_VERSION } from '../version';
import { COGNITION_THRESHOLDS, REWARD_GATES } from '../../../game/corruption/machine';
import { isAvUnlocked } from '../../../game/prestige/machine';
import { loyaltyStage, loyaltyBias, CONST } from '../../../game/economy/machine';
import { loyaltyDecayReduction } from '../../../game/upgrade/machine';
import type { EngineState } from '../../../game/engine/types';
import type { DayState } from '../../../game/action-grid/types';

const props = defineProps<{ engine: EngineState; day: DayState }>();
const e = computed(() => props.engine); // 模板里 e.xxx 自动解包，engine 整体替换即响应

// 金↔绯红 线性插值(t:0=金,1=绯红)
function mixGoldRose(t: number): string {
  const g = [236, 200, 120], rr = [240, 106, 138]; // --gold-hi / --rose-hi
  const c = g.map((gv, i) => Math.round(gv + (rr[i] - gv) * Math.max(0, Math.min(1, t))));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

// —— 威望：单值 + 颜色随偏向（AV 解锁前淫名不计入）——
const avUnlocked = computed(() => isAvUnlocked(props.engine.unlocked ?? {}));
const prestigeTotal = computed(() => props.engine.martialPrestige + (avUnlocked.value ? props.engine.infamy : 0));
const prestigeRedRatio = computed(() => {
  if (!avUnlocked.value) return 0;
  const t = props.engine.martialPrestige + props.engine.infamy;
  return t <= 0 ? 0 : props.engine.infamy / t;
});
const prestigeColor = computed(() => mixGoldRose(prestigeRedRatio.value));
const prestigeBias = computed(() => !avUnlocked.value ? '纯极道' : (prestigeRedRatio.value > 0.5 ? '偏淫名' : '偏极道'));

// —— 忠诚：颜色随偏向 + 五阶段两套文案 ——
const LOYAL_QUOTES: Record<'极道' | '淫乱', string[]> = {
  极道: ['打手们对九条会毫不上心', '打手们不看好九条会的前景', '打手们至少不会临阵叛变', '打手们向九条会献上忠诚', '打手们为大小姐赴汤蹈火'],
  淫乱: ['打手们把九条宅当作免费妓院', '打手们觉得老大的性器还不错', '打手们团结在名器身边', '打手们用精液向大小姐宣誓忠诚', '九条家的肉棒贤婿们'],
};
const loyaltyBiasText = computed(() => loyaltyBias(props.engine.loyaltyMartial ?? 0, props.engine.loyaltyInfamy ?? 0));
const loyaltyStageNo = computed(() => loyaltyStage(props.engine.loyalty));
const loyaltyQuote = computed(() => LOYAL_QUOTES[loyaltyBiasText.value][loyaltyStageNo.value - 1]);
// 忠诚颜色:按极道/淫乱成分比例金↔绯红渐变(同威望)
const loyaltyRoseRatio = computed(() => {
  const m = props.engine.loyaltyMartial ?? 0, inf = props.engine.loyaltyInfamy ?? 0;
  const t = m + inf; return t <= 0 ? 0.5 : inf / t;
});
const loyaltyColor = computed(() => mixGoldRose(loyaltyRoseRatio.value));
const loyDecayReduce = computed(() => loyaltyDecayReduction(props.engine.upgrades));
const loyDecay = computed(() => Math.max(0, CONST.忠诚日衰减 - loyDecayReduce.value));

// —— 避孕套消耗（今日累计 + 昨日=历史最后一条）——
const condomToday = computed(() => props.engine.condomUsedToday ?? 0);
const condomYesterday = computed(() => { const h = props.engine.condomHistory ?? []; return h.length ? h[h.length - 1] : 0; });
// —— 避孕套消耗折线图（无数据则不画）——
const condomChart = computed(() => props.engine.condomHistory ?? []);
const condomChartPoints = computed(() => {
  const h = condomChart.value; if (h.length < 2) return '';
  const max = Math.max(1, ...h);
  const W = 280, H = 64;
  return h.map((v, i) => `${(i / (h.length - 1)) * W},${H - (v / max) * (H - 8)}`).join(' ');
});

// 钉住浮窗
const pin = ref<string | null>(null);
function toggle(k: string) { pin.value = pin.value === k ? null : k; }
function clearPin() { pin.value = null; }
defineExpose({ clearPin });

// 威望双色条占比（淫名仅 AV 解锁后计入）
const goldPct = computed(() => {
  if (!avUnlocked.value) return 100;
  const t = props.engine.martialPrestige + props.engine.infamy;
  return t <= 0 ? 100 : (props.engine.martialPrestige / t) * 100;
});
const redPct = computed(() => 100 - goldPct.value);

const desireOver = computed(() => props.engine.desire >= props.engine.desireCapacity);
const condomTone = computed(() => props.engine.condomStock <= 0 ? 'var(--red-hi)'
  : props.engine.condomStock < 10 ? '#e8a87a' : 'var(--text)');

// 堕落度：下一认知档 + 下一奖励闸门
const nextStage = computed(() => {
  const c = props.engine.corruption;
  const t = COGNITION_THRESHOLDS.find(x => x.atCorruption > c);
  return t ? { stage: t.stage, at: t.atCorruption, gap: t.atCorruption - c } : null;
});
const nextGate = computed(() => {
  const c = props.engine.corruption;
  const g = REWARD_GATES.find(x => x.atCorruption > c);
  if (!g) return null;
  const r = g.reward;
  const parts: string[] = [];
  if (r.money) parts.push(`+¥${r.money.toLocaleString()}`);
  if (r.thugs) parts.push(`+${r.thugs}打手`);
  return { at: g.atCorruption, text: parts.join(' / ') };
});

// 资金流水（#12·最近进出+来源·倒序最近在上）
const ledger = computed(() => [...(props.engine.moneyLog ?? [])].reverse().map(m => ({ t: `D${m.day} ${m.label}`, d: m.delta })));
</script>

<style scoped>
.masthead {
  display: flex; align-items: center; gap: 22px; padding: 14px 26px;
  background: var(--wood-h); background-color: var(--wood-base); border-bottom: 2px solid #000;
  box-shadow: inset 0 -3px 8px rgba(0,0,0,.4), 0 3px 12px rgba(0,0,0,.5);
}
/* 批H3·手机适配: 刊头纵排收紧·数值条横向滚动 */
@media (max-width: 820px) {
  .masthead { flex-wrap: wrap; gap: 8px; padding: 10px 12px; }
  .logo { font-size: 28px; }
  .logo .sub { font-size: 10px; letter-spacing: 3px; }
  .stat-strip { margin-left: 0; width: 100%; overflow-x: auto; }
  .stat { padding: 3px 10px; flex: none; }
  .stat .v { font-size: 16px; }
}
.logo { font-family: var(--brush); font-size: 46px; line-height: 1; color: var(--gold-hi);
  text-shadow: 0 2px 0 #000, 0 0 18px rgba(201,162,74,.3); letter-spacing: 2px; margin-top: 6px; }
.logo .sub { font-family: var(--serif); font-size: 12px; color: var(--text-dim); letter-spacing: 6px; display: block; margin-top: 4px; }
.stat-strip { margin-left: auto; display: flex; }
.stat { position: relative; padding: 4px 18px; text-align: center; border-left: 1px solid rgba(201,162,74,.16); cursor: pointer; }
.stat:hover { background: rgba(236,200,120,.06); }
.stat .k { font-size: 11px; color: var(--text-dim); letter-spacing: 2px; }
.stat .v { font-size: 20px; color: var(--gold-hi); font-weight: 700; }
.stat .v.red { color: var(--rose-hi); } .stat .v.white { color: var(--text); }
.stat .v .sub-n { font-size: 13px; color: var(--text-dim); }
.stat.wide { min-width: 158px; }
.prestige { margin-top: 3px; }
.pbar { display: flex; height: 8px; border-radius: 4px; overflow: hidden; border: 1px solid rgba(201,162,74,.3); background: #0a0706; }
.pbar .pg { background: linear-gradient(180deg, var(--gold-hi), var(--gold)); }
.pbar .pr { background: linear-gradient(180deg, var(--rose-hi), var(--rose)); }
.pnum { font-size: 12px; margin-top: 3px; color: var(--text-dim); }
.pnum b { font-weight: 700; font-size: 13px; }
/* 浮窗 */
.pop { display: none; position: absolute; top: 100%; right: 0; margin-top: 8px; width: 240px; text-align: left;
  background: var(--panel-2); border: 1px solid var(--gold-dim); border-radius: 8px; padding: 12px 14px;
  z-index: 20; box-shadow: 0 14px 40px rgba(0,0,0,.6); }
.stat:hover .pop, .stat.pinned .pop { display: block; }
.stat.pinned { background: rgba(236,200,120,.09); }
.stat.pinned .pop { max-height: 62vh; overflow: auto; }
.pop.wide-pop { width: 282px; }
.pop h4 { font-size: 12px; color: var(--gold); letter-spacing: 1px; margin-bottom: 8px; border-bottom: 1px dashed var(--line); padding-bottom: 6px; }
.pop .row { display: flex; justify-content: space-between; font-size: 12px; color: var(--text-dim); padding: 3px 0; }
.pop .row b { color: var(--text); font-weight: 400; }
.pop .row .plus { color: var(--green); } .pop .row .minus { color: var(--red-hi); }
.pop .row.sub { padding-left: 16px; color: var(--gold-dim); }
.pop .prow { font-size: 11px; color: var(--text-dim); line-height: 1.65; padding: 5px 0; border-bottom: 1px dashed rgba(201,162,74,.12); }
.pop .hint { font-size: 11px; color: var(--gold-dim); margin-top: 8px; }
.chart-inline { margin-top: 9px; border-top: 1px dashed var(--line); padding-top: 9px; }
.chart-inline .ci-t { font-size: 11px; color: var(--gold); margin-bottom: 6px; }
.chart-inline svg { width: 100%; height: 64px; display: block; }
.chart-inline .chart-empty { font-size: 11px; color: var(--text-dim); padding: 14px 0; text-align: center; }
.chart-warn { font-size: 11px; color: var(--rose-hi); line-height: 1.6; margin: 8px 0; padding: 7px 9px; background: rgba(210,74,106,.08); border-left: 2px solid var(--rose); border-radius: 4px; }
.loyal-quote { color: var(--gold-hi); font-size: 16px; font-weight: 700; line-height: 1.5; padding: 8px 0 10px; text-align: center; border-bottom: 1px dashed var(--line); margin-bottom: 6px; }
.pop .frow { font-size: 12px; color: var(--text-dim); line-height: 1.65; padding: 4px 0; }
.pop .frow b { color: var(--gold); }
</style>
