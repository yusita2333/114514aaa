<!--
  AvPanel · 影业/AV 视图（#17）
  职责: 解锁后定制AV(题材/场景/玩法多选/时长)→排入今日白天行动格,执行该格时注入定制范式。
  未解锁(未建摄影室)显示引导。数据: engine.av + av 模块 canShootAv/buildAvParadigm/consumeShoot。
  设计§9: AV 解锁后引入淫名机制;周编辑次数有限;选项注入行动格执行(置顶 pinned)。
-->
<template>
  <div class="av">
    <div class="av-head">
      <div class="a-title">影业 · 暗网AV</div>
      <div class="a-stats" v-if="unlocked">
        <span>本周次数 <b>{{ av.weeklyQuota }}/{{ av.weeklyQuotaMax }}</b></span>
        <span>时长上限 <b>{{ av.durationCap }}h</b></span>
        <span>累计拍摄 <b>{{ av.shotCount }}</b></span>
        <span>淫名 <b>{{ r.engine.infamy }}</b></span>
      </div>
    </div>

    <!-- 未解锁引导 -->
    <div v-if="!unlocked" class="locked-box">
      <div class="lb-icn">◉</div>
      <div class="lb-t">AV 系统未解锁</div>
      <div class="lb-s">前往「升级 · 扩张解锁」建造 <b>暗网摄影室</b>（¥8000）。建成后将强制演出第一部AV，并引入<b>淫名</b>机制（淫名计入总威望，让招募更易、AV 更好卖）。</div>
    </div>

    <template v-else>
      <div v-if="r.lastAv" class="a-feedback" :class="{ ok: r.lastAv.ok, bad: !r.lastAv.ok }">{{ r.lastAv.msg }}</div>

      <div class="builder">
        <div class="field">
          <label>题材</label>
          <div class="chips">
            <button v-for="t in THEMES" :key="t" class="chip" :class="{ on: def.theme === t }" @click="def.theme = t">{{ t }}</button>
          </div>
        </div>
        <div class="field">
          <label>场景<span class="hint">(灰=需在升级页购入对应布景·一钮一场景)</span></label>
          <div class="chips">
            <button v-for="s in SETTINGS" :key="s" class="chip" :class="{ on: def.setting === s, dis: !settingOk(s) }"
              @click="settingOk(s) && (def.setting = s)">{{ s }}</button>
          </div>
        </div>
        <div class="field">
          <label>衣装<span class="hint">(灰=需在升级页购入对应衣装·一钮一件)</span></label>
          <div class="chips">
            <button class="chip" :class="{ on: !def.outfit }" @click="def.outfit = undefined">便服/不指定</button>
            <button v-for="o in OUTFITS" :key="o" class="chip" :class="{ on: def.outfit === o, dis: !outfitOk(o) }"
              @click="outfitOk(o) && (def.outfit = o)">{{ o }}</button>
          </div>
        </div>
        <div class="field">
          <label>出演规模<span class="hint">(大部队需三机位·海量需环形机位)</span></label>
          <div class="chips">
            <button class="chip" :class="{ on: !def.cast }" @click="def.cast = undefined">按题材默认</button>
            <button v-for="c in CASTS" :key="c" class="chip" :class="{ on: def.cast === c, dis: !castOk(c) }"
              @click="castOk(c) && (def.cast = c)">{{ c }}</button>
          </div>
        </div>
        <div class="field">
          <label>玩法<span class="hint">(已选 {{ def.plays.length }}/{{ playCap }} · 升级可提升上限)</span></label>
          <div class="chips">
            <button v-for="p in PLAYS" :key="p" class="chip"
              :class="{ on: def.plays.includes(p), dis: !def.plays.includes(p) && def.plays.length >= playCap }"
              @click="togglePlay(p)">{{ p }}</button>
          </div>
        </div>
        <div class="field" v-if="def.setting.includes('角色扮演')">
          <label>角色扮演填空</label>
          <input v-model="def.setupNote" class="text-in" placeholder="如：继兄设定 / 精灵俘虏 / 某二次元角色…" />
        </div>
        <div class="field">
          <label>自由编辑<span class="hint">(玩家自定意见·优先满足·可留空)</span></label>
          <textarea v-model="def.custom" class="text-in area" rows="2" placeholder="想加的剧情/玩法/台词/服装等，直接写。会拼进本部AV的拍摄范式。"></textarea>
        </div>
        <div class="field">
          <label>时长 <b class="dur">{{ def.durationHours }}h</b><span class="hint">(上限 {{ av.durationCap }}h)</span></label>
          <input type="range" min="1" :max="av.durationCap" v-model.number="def.durationHours" class="range" />
        </div>
        <div class="actions">
          <div class="preview">{{ previewLine }}</div>
          <button class="shoot" :disabled="!ready.ok" @click="onShoot">{{ ready.ok ? '排入今日 · 开拍 ▶' : ready.reason }}</button>
        </div>
      </div>

      <div v-if="av.customs.length" class="gallery">
        <div class="g-title">拍摄档案（{{ av.customs.length }}）</div>
        <div class="g-list">
          <div v-for="(c, i) in recent" :key="i" class="g-item">
            <span class="g-th">{{ c.theme }}</span>
            <span class="g-se">{{ c.setting }}</span>
            <span class="g-pl">{{ c.plays.join('/') }}</span>
            <span class="g-du">{{ c.durationHours }}h</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue';
import { useRunnerStore } from '../runner-store';
import { defaultAvState, isAvSystemUnlocked, canShootAv, avSalesIncome, SETTING_REQ, OUTFIT_REQ, CAST_REQ } from '../../../game/av/machine';
import { avPlayCap, avIncomeMultiplier, getLevel } from '../../../game/upgrade/machine';
import type { AvTheme, AvSetting, AvPlay, AvDefinition, AvOutfit, AvCast } from '../../../game/av/machine';

const r = useRunnerStore();
const unlocked = computed(() => isAvSystemUnlocked(r.engine));
const av = computed(() => r.engine.av ?? defaultAvState());

const THEMES: AvTheme[] = ['玩具调教', '高潮挑战', '男M', '女M', '本格性爱', '目隐NTR', '目前NTR', '人数挑战', '时长挑战', '淫语调教', '公开处刑', '灌精挑战', '阿黑颜定格', '寸止折磨', '道具贯穿', '失禁奇观', '强制发情', '训练成果展示'];
const SETTINGS: AvSetting[] = ['学校', '职场', '医院', '伦理乱伦', '奇幻角色扮演', '二次元角色扮演', '偶像', '神社巫女', '婚礼新娘', '公共厕所', '监禁地下室', '温泉旅馆', '拍卖会', '直播间', '异种族交配', '庆功宴酒席', '电车车厢', '和室', '教堂圣坛', '雨夜街头(棚内)'];
const PLAYS: AvPlay[] = ['口', '手', '足', '小穴', '臀', '深喉', '颜射', '中出', '潮吹', '双插', '乳交', '捆绑', '道具', '露出', '灌肠扩张', '坐脸', '多P拓扑', '群交围操'];
const OUTFITS: AvOutfit[] = ['女仆装', '日式校服', '体操服', '修女服', 'OL制服', '旗袍', '和服', '泳装', '婚纱', '紧身胶衣'];
const CASTS: AvCast[] = ['少人数(2-3)', '小队(5-6)', '大部队(十余人)', '海量(数十人)'];

const def = reactive<AvDefinition>({ theme: '本格性爱', setting: '学校', plays: ['小穴'], durationHours: 8, setupNote: '', custom: '' });

// 一钮一tag门槛:场景/衣装/人数档各查对应升级
function settingOk(s: AvSetting): boolean {
  const req = SETTING_REQ[s];
  return !req || getLevel(r.engine.upgrades, req) >= 1;
}
function outfitOk(o: AvOutfit): boolean {
  return getLevel(r.engine.upgrades, OUTFIT_REQ[o]) >= 1;
}
function castOk(c: AvCast): boolean {
  const req = CAST_REQ[c];
  return !req || getLevel(r.engine.upgrades, req) >= 1;
}

const playCap = computed(() => avPlayCap(r.engine.upgrades));
function togglePlay(p: AvPlay) {
  const i = def.plays.indexOf(p);
  if (i >= 0) { if (def.plays.length > 1) def.plays.splice(i, 1); }
  else if (def.plays.length < playCap.value) def.plays.push(p);
}

const ready = computed(() => canShootAv(r.engine, def as AvDefinition));
const estIncome = computed(() => avSalesIncome(def as AvDefinition, r.engine.infamy, avIncomeMultiplier(r.engine.upgrades)));
const previewLine = computed(() => `${def.theme} × ${def.setting} · ${def.plays.join('/')} · ${def.durationHours}h · 预计收入 ¥${estIncome.value.toLocaleString()}`);
const recent = computed(() => av.value.customs.slice(-8).reverse());

function onShoot() {
  r.queueAvShoot(JSON.parse(JSON.stringify(def)));
}
</script>

<style scoped>
.av { padding: 18px 26px; overflow-y: auto; height: 100%; }
@media (max-width: 820px) { .av { padding: 12px 10px; height: auto; } } /* 批H4 */
.av-head { display: flex; align-items: baseline; gap: 16px; margin-bottom: 12px; }
.a-title { font-family: var(--brush); font-size: 28px; color: var(--gold-hi); }
.a-stats { margin-left: auto; display: flex; gap: 14px; font-size: 13px; color: var(--text-dim); }
.a-stats b { color: var(--gold-hi); font-size: 15px; }
.a-feedback { margin-bottom: 12px; padding: 9px 14px; border-radius: 7px; font-size: 13px; }
.a-feedback.ok { background: rgba(94,122,72,.12); border: 1px solid #3a4a2a; color: var(--green); }
.a-feedback.bad { background: rgba(179,33,46,.1); border: 1px solid var(--red); color: var(--red-hi); }

.locked-box { border: 1px dashed var(--gold-dim); border-radius: 12px; padding: 30px; text-align: center; max-width: 560px; margin: 30px auto; }
.lb-icn { font-size: 44px; color: var(--gold-dim); }
.lb-t { font-family: var(--brush); font-size: 24px; color: var(--gold-hi); margin: 8px 0; }
.lb-s { font-size: 13px; color: var(--text-dim); line-height: 1.8; }
.lb-s b { color: var(--gold); }

.builder { border: 1px solid var(--line); border-radius: 10px; background: linear-gradient(180deg, var(--panel), var(--panel-2)); padding: 16px 18px; }
.field { margin-bottom: 14px; }
.field > label { display: block; font-size: 13px; color: var(--gold); letter-spacing: 1px; margin-bottom: 7px; }
.field .hint { font-size: 11px; color: var(--text-dim); margin-left: 6px; }
.field .dur { color: var(--gold-hi); }
.chips { display: flex; flex-wrap: wrap; gap: 7px; }
.chip { font-family: var(--serif); font-size: 13px; color: var(--text-dim); background: rgba(0,0,0,.3); border: 1px solid var(--line); border-radius: 16px; padding: 6px 14px; cursor: pointer; transition: .12s; }
.chip:hover { color: var(--text); border-color: var(--gold-dim); }
.chip.on { color: #1a120a; font-weight: 700; background: linear-gradient(180deg, var(--gold-hi), var(--gold)); border-color: var(--gold); }
.chip.dis { opacity: .35; cursor: not-allowed; }
.text-in { width: 100%; background: rgba(0,0,0,.3); border: 1px solid var(--line); border-radius: 6px; padding: 8px 12px; color: var(--text); font-family: var(--serif); font-size: 13px; box-sizing: border-box; }
.text-in.area { resize: vertical; line-height: 1.6; }
.range { width: 100%; accent-color: var(--gold); }
.actions { display: flex; align-items: center; gap: 14px; margin-top: 6px; border-top: 1px solid var(--line); padding-top: 12px; }
.preview { flex: 1; font-size: 12px; color: var(--text-dim); }
.shoot { font-family: var(--serif); background: linear-gradient(180deg, var(--gold-hi), var(--gold)); color: #1a120a; border: none; border-radius: 6px; padding: 10px 20px; font-size: 14px; font-weight: 700; letter-spacing: 1px; cursor: pointer; }
.shoot:disabled { background: rgba(0,0,0,.3); color: var(--text-dim); border: 1px solid var(--line); cursor: not-allowed; font-weight: 400; }

.gallery { margin-top: 18px; }
.g-title { font-family: var(--serif); font-size: 15px; color: var(--gold); letter-spacing: 1px; margin-bottom: 8px; }
.g-list { display: flex; flex-direction: column; gap: 6px; }
.g-item { display: flex; gap: 12px; font-size: 12px; padding: 7px 12px; background: rgba(0,0,0,.25); border: 1px solid var(--line); border-radius: 6px; }
.g-th { color: var(--gold-hi); } .g-se { color: var(--text); } .g-pl { color: var(--text-dim); } .g-du { margin-left: auto; color: var(--gold-dim); }
</style>
