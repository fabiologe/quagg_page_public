<template>
  <div v-if="sel" class="np-panel sv-theme">
    <div class="np-head">
      <span class="np-kind"><SvIcon :name="isLink ? 'Haltung.png' : 'Schacht.png'" :size="14" color="currentColor" /> {{ isLink ? 'Haltung' : 'Schacht' }}</span>
      <code class="np-id">{{ sel.id }}</code>
      <span v-if="isLink && sel.conveyance === 'open'" class="np-sgc-badge" title="Offenes Gerinne — wird als Sub-Grid-Gerinne (SGC) ins 2D-Raster exportiert">SGC</span>
      <button class="np-close" @click="net.select(null)" title="Auswahl aufheben">×</button>
    </div>

    <!-- SCHACHT -->
    <template v-if="!isLink">
      <label class="np-row">Rolle
        <select :value="sel.role" @change="upd({ role: $event.target.value })">
          <option v-for="r in NODE_ROLES" :key="r" :value="r">{{ r }}</option>
        </select>
      </label>
      <label class="np-row">Deckel (rim) [m]
        <input type="number" step="0.01" :value="sel.rim" @change="upd({ rim: num($event) })" />
      </label>
      <label class="np-row">Sohle (invert) [m]
        <input type="number" step="0.01" :value="sel.invert" @change="upd({ invert: num($event) })" />
      </label>
      <label class="np-row">Durchmesser [m]
        <input type="number" step="0.05" :value="sel.attrs?.diameter ?? ''" @change="upd({ attrs: { diameter: num($event) } })" />
      </label>
      <label class="np-row">Rechtswert x
        <input type="number" step="0.1" :value="sel.x" @change="upd({ x: num($event) })" />
      </label>
      <label class="np-row">Hochwert y
        <input type="number" step="0.1" :value="sel.y" @change="upd({ y: num($event) })" />
      </label>

      <!-- SONDERBAUWERK-PARAMETER (P-Phase): fließen via toSwmmStore in [PUMPS]/[CURVES]/
           [WEIRS]/[ORIFICES]. Regel: wirksam nur mit ABGEHENDER Haltung (Validierung meldet). -->
      <template v-if="sel.role === 'pump'">
        <div class="np-special-head"><SvEmoji emoji="⚡" :size="12" /> Pumpe</div>
        <label class="np-row">Förderleistung [l/s]
          <input type="number" step="1" min="0" :value="sel.attrs?.pumpRate ?? ''" placeholder="auto"
                 @change="upd({ attrs: { pumpRate: num($event) } })" />
        </label>
        <label class="np-row">EIN ab Wasserstand [m]
          <input type="number" step="0.1" min="0" :value="sel.attrs?.onDepth ?? ''" placeholder="40% Tiefe"
                 @change="upd({ attrs: { onDepth: num($event) } })" />
        </label>
        <label class="np-row">AUS unter [m]
          <input type="number" step="0.1" min="0" :value="sel.attrs?.offDepth ?? ''" placeholder="auto"
                 @change="upd({ attrs: { offDepth: num($event) } })" />
        </label>
      </template>
      <template v-else-if="sel.role === 'weir'">
        <div class="np-special-head"><SvEmoji emoji="🌊" :size="12" /> Wehr</div>
        <label class="np-row">Schwellenhöhe ab Sohle [m]
          <input type="number" step="0.05" min="0" :value="sel.attrs?.wehrHeight ?? ''" placeholder="70% Tiefe"
                 @change="upd({ attrs: { wehrHeight: num($event) } })" />
        </label>
        <label class="np-row">Wehrbreite [m]
          <input type="number" step="0.1" min="0" :value="sel.attrs?.wehrWidth ?? ''" placeholder="1.0"
                 @change="upd({ attrs: { wehrWidth: num($event) } })" />
        </label>
      </template>
      <template v-else-if="sel.role === 'orifice'">
        <div class="np-special-head"><SvEmoji emoji="🕳️" :size="12" /> Drossel</div>
        <label class="np-row">Drossel-Abfluss [l/s]
          <input type="number" step="1" min="0" :value="sel.attrs?.maxOutflow ?? ''" placeholder="Ø 0.3 m"
                 @change="upd({ attrs: { maxOutflow: num($event) } })" />
        </label>
      </template>
      <div v-if="isSpecialNode && !hasOutgoingLink" class="np-warn">
        ⚠ Keine abgehende Haltung — Bauwerk würde als einfacher Schacht exportiert.
      </div>

      <!-- ZUFLUSS (alle Nicht-Outfall-Knoten): konstant + optionale Ganglinie Q(t).
           Export als SWMM [INFLOWS] (externer Direktzufluss; Trockenwetter macht der
           globale Vorfüllfaktor in der Netz-Tabelle). -->
      <template v-if="sel.role !== 'outfall'">
        <div class="np-special-head"><SvEmoji emoji="🚰" :size="12" /> Zufluss</div>
        <label class="np-row">Konstant [l/s]
          <input type="number" step="1" min="0" :value="sel.attrs?.constantInflow ?? ''" placeholder="0"
                 @change="upd({ attrs: { constantInflow: num($event) } })" />
        </label>
        <div v-if="(sel.attrs?.constantInflow ?? 0) >= 100" class="np-hint">
          = {{ ((sel.attrs?.constantInflow ?? 0) / 1000).toFixed(2) }} m³/s
        </div>
        <div class="np-series">
          <div class="np-series-head">
            <span>Ganglinie Q(t)</span>
            <button class="np-mini" @click="addSeriesPoint" title="Punkt hinzufügen">+ Punkt</button>
          </div>
          <div v-for="(p, i) in series" :key="i" class="np-series-row">
            <input type="number" step="5" min="0" :value="p.t" title="Zeit [min] ab Simulationsstart"
                   @change="updSeriesPoint(i, 't', $event)" /><span class="np-unit">min</span>
            <input type="number" step="1" min="0" :value="p.q" title="Zufluss [l/s]"
                   @change="updSeriesPoint(i, 'q', $event)" /><span class="np-unit">l/s</span>
            <button class="np-mini np-mini-del" @click="delSeriesPoint(i)" title="Punkt löschen">×</button>
          </div>
          <div v-if="series.length" class="np-hint">Zwischen den Punkten interpoliert SWMM linear.</div>
        </div>
      </template>

      <!-- AUSLAUF-RANDBEDINGUNG -->
      <template v-else>
        <div class="np-special-head"><SvEmoji emoji="🌊" :size="12" /> Randbedingung</div>
        <label class="np-row">Vorfluter
          <select :value="sel.attrs?.outfallType ?? 'free'" @change="upd({ attrs: { outfallType: $event.target.value } })">
            <option value="free">frei (FREE)</option>
            <option value="normal">Normalabfluss</option>
            <option value="fixed">fester Wasserstand</option>
          </select>
        </label>
        <label v-if="sel.attrs?.outfallType === 'fixed'" class="np-row">Wasserstand [m NHN]
          <input type="number" step="0.01" :value="sel.attrs?.fixedStage ?? ''" :placeholder="fmtZ(sel.invert)"
                 @change="upd({ attrs: { fixedStage: numOrNull($event) } })" />
        </label>
      </template>

      <!-- 2D-KOPPLUNG / SCHLUCKVERMÖGEN: Amax kappt den Einzug im Solver (coupling.cpp),
           „verdeckelt" nimmt den Schacht ganz aus der Kopplung (attrs.couple=false). -->
      <template v-if="['manhole', 'inlet', 'storage'].includes(sel.role)">
        <div class="np-special-head"><SvEmoji emoji="🔗" :size="12" /> 2D-Kopplung</div>
        <label class="np-row">Einlauftyp
          <select :value="sel.attrs?.inletType ?? ''" @change="setInletType($event.target.value)">
            <option value="">Schachtdeckel (unbegrenzt)</option>
            <option value="pult">Straßenablauf Pultaufsatz (6 l/s)</option>
            <option value="doppel">Doppelablauf (12 l/s)</option>
            <option value="custom">benutzerdefiniert…</option>
            <option value="sealed">verdeckelt (koppelt nicht)</option>
          </select>
        </label>
        <template v-if="sel.attrs?.inletType === 'custom'">
          <label class="np-row">Schluckvermögen [l/s]
            <input type="number" step="1" min="0" :value="amaxLs" placeholder="unbegrenzt"
                   @change="upd({ attrs: { Amax: numOrNull($event) != null ? numOrNull($event) / 1000 : null } })" />
          </label>
          <label class="np-row">Einlaufbeiwert Cw
            <input type="number" step="0.1" min="0.1" :value="sel.attrs?.Cw ?? ''" placeholder="1.0"
                   @change="upd({ attrs: { Cw: numOrNull($event) } })" />
          </label>
        </template>
        <div v-if="sel.attrs?.inletType === 'sealed'" class="np-hint">
          Kein Wasseraustausch mit der Oberfläche — reiner 1D-Durchgangsschacht.
        </div>
      </template>
    </template>

    <!-- HALTUNG -->
    <template v-else>
      <p class="np-pos">{{ sel.fromNodeId }} → {{ sel.toNodeId }}</p>
      <div class="np-row np-toggle">
        <span>Führung</span>
        <div class="seg">
          <button :class="{ on: sel.conveyance !== 'open' }" @click="upd({ conveyance: 'covered' })" title="Rohr (1D/SWMM)">Rohr</button>
          <button :class="{ on: sel.conveyance === 'open' }" @click="upd({ conveyance: 'open' })" title="Offenes Gerinne (2D/SGC)">Gerinne</button>
        </div>
      </div>
      <template v-if="sel.conveyance === 'open'">
        <label class="np-row">Form
          <select :value="sel.profile?.shape ?? 'rect'" @change="upd({ profile: { shape: $event.target.value } })">
            <option value="rect">Rechteck</option>
            <option value="trapezoid">Trapez</option>
          </select>
        </label>
        <label v-if="sel.profile?.shape === 'trapezoid'" class="np-row">Böschungsneigung 1:m
          <input type="number" step="0.1" min="0" :value="sel.profile?.sideSlope ?? ''" placeholder="1.5"
                 @change="upd({ profile: { sideSlope: numOrNull($event) } })" />
        </label>
        <div v-if="sel.profile?.shape === 'trapezoid' && sel.profile?.sideSlope == null" class="np-hint">
          Keine Böschungsneigung gesetzt — SGC-Export nutzt Standard 1.5.
        </div>
      </template>
      <label class="np-row">Profilhöhe [m]
        <input type="number" step="0.05" :value="sel.profile?.height ?? ''" @change="upd({ profile: { height: num($event) } })" />
      </label>
      <label class="np-row">{{ sel.conveyance === 'open' ? 'Sohlbreite [m]' : 'Profilbreite [m]' }}
        <input type="number" step="0.05" :value="sel.profile?.width ?? ''" @change="upd({ profile: { width: num($event) } })" />
      </label>
      <label class="np-row">Rauheit kSt
        <input type="number" step="1" :value="sel.attrs?.kSt ?? ''" @change="upd({ attrs: { kSt: num($event) } })" />
      </label>

      <!-- Rohrsohlen (absolut, m NHN): erlauben einen Einlauf ÜBER der Schachtsohle
           (z. B. +1.5 m) — wird als SWMM InOffset/OutOffset exportiert (SwmmBuilder:
           InOffset = z1 − Schachtsohle) und so auch im 3D-Netz gerendert. Leer =
           Rohrsohle liegt auf der Schachtsohle (Offset 0). -->
      <div class="np-special-head"><SvEmoji emoji="📐" :size="12" /> Rohrsohle (Offset)</div>
      <label class="np-row">Sohle Zulauf z1 [m]
        <input type="number" step="0.01" :value="sel.attrs?.z1 ?? ''" :placeholder="fmtZ(fromNode?.invert)"
               @change="upd({ attrs: { z1: numOrNull($event) } })" />
      </label>
      <label class="np-row">Sohle Ablauf z2 [m]
        <input type="number" step="0.01" :value="sel.attrs?.z2 ?? ''" :placeholder="fmtZ(toNode?.invert)"
               @change="upd({ attrs: { z2: numOrNull($event) } })" />
      </label>
      <div v-if="inOffset > 0.005 || outOffset > 0.005" class="np-hint">
        Offset über Schachtsohle: Zulauf +{{ inOffset.toFixed(2) }} m, Ablauf +{{ outOffset.toFixed(2) }} m
      </div>
      <div v-if="inOffset < -0.005 || outOffset < -0.005" class="np-warn">
        ⚠ Rohrsohle liegt UNTER der Schachtsohle — SWMM klemmt den Offset auf 0.
      </div>
    </template>

    <button class="np-del" @click="remove"><SvEmoji emoji="🗑" :size="13" /> Löschen</button>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import SvEmoji from '../common/SvEmoji.vue';
import SvIcon from '../common/SvIcon.vue';
import { useNetworkStore } from '@/features/flood-2D/stores/useNetworkStore.js';

const NODE_ROLES = ['manhole', 'inlet', 'outfall', 'storage', 'junction', 'weir', 'orifice', 'pump'];
const net = useNetworkStore();
const sel = computed(() => net.selected);
const isLink = computed(() => !!(sel.value && 'fromNodeId' in sel.value));
const isSpecialNode = computed(() =>
    !isLink.value && ['pump', 'weir', 'orifice'].includes(sel.value?.role));
const hasOutgoingLink = computed(() =>
    !!sel.value && net.links.some(l => l.fromNodeId === sel.value.id));

// Endknoten der selektierten Haltung (für z1/z2-Platzhalter + Offset-Anzeige)
const fromNode = computed(() => isLink.value ? net.nodeById.get(sel.value.fromNodeId) : null);
const toNode   = computed(() => isLink.value ? net.nodeById.get(sel.value.toNodeId) : null);
const offsetOf = (zKey, node) => {
    const z = Number(sel.value?.attrs?.[zKey]);
    if (!Number.isFinite(z) || !node || !Number.isFinite(node.invert)) return 0;
    return z - node.invert;
};
const inOffset  = computed(() => offsetOf('z1', fromNode.value));
const outOffset = computed(() => offsetOf('z2', toNode.value));
const fmtZ = (v) => Number.isFinite(v) ? v.toFixed(2) : '';

const num = (e) => { const v = Number(e.target.value); return Number.isFinite(v) ? v : 0; };
// leeres Feld → null (Attribut löschen = Offset 0 / Schachtsohle)
const numOrNull = (e) => {
    if (String(e.target.value).trim() === '') return null;
    const v = Number(e.target.value);
    return Number.isFinite(v) ? v : null;
};

function upd(patch) {
    if (!sel.value) return;
    if (isLink.value) net.updateLink(sel.value.id, patch);
    else net.updateNode(sel.value.id, patch);
}

// ── Zufluss-Ganglinie [{t: min, q: l/s}] ────────────────────────────────────
const series = computed(() => Array.isArray(sel.value?.attrs?.inflowSeries) ? sel.value.attrs.inflowSeries : []);
function addSeriesPoint() {
    const s = series.value;
    const t = s.length ? Number(s[s.length - 1].t) + 30 : 0;
    upd({ attrs: { inflowSeries: [...s, { t, q: 0 }] } });
}
function updSeriesPoint(i, key, e) {
    const v = Number(e.target.value);
    if (!Number.isFinite(v)) return;
    const s = series.value.map((p, j) => (j === i ? { ...p, [key]: Math.max(0, v) } : p));
    upd({ attrs: { inflowSeries: s } });
}
function delSeriesPoint(i) {
    const s = series.value.filter((_, j) => j !== i);
    upd({ attrs: { inflowSeries: s.length ? s : null } });
}

// ── Einlauftyp-Presets: setzen Amax [m³/s] / couple; „custom" lässt Werte stehen ──
const amaxLs = computed(() => {
    const a = Number(sel.value?.attrs?.Amax);
    return Number.isFinite(a) && a > 0 ? Math.round(a * 1000) : '';
});
function setInletType(v) {
    const presets = {
        '':       { inletType: null, Amax: null, couple: null },
        pult:     { inletType: 'pult', Amax: 0.006, couple: null },
        doppel:   { inletType: 'doppel', Amax: 0.012, couple: null },
        custom:   { inletType: 'custom', couple: null },
        sealed:   { inletType: 'sealed', Amax: null, couple: false },
    };
    upd({ attrs: presets[v] ?? { inletType: null } });
}
function remove() {
    if (!sel.value) return;
    if (isLink.value) net.deleteLink(sel.value.id);
    else net.deleteNode(sel.value.id);
}
</script>

<style scoped>
.np-panel {
    width: 240px; background: var(--sv-surface, #253547); color: var(--sv-text, #ecf0f1);
    border: 1px solid var(--sv-violet, #8b5cf6); border-radius: 8px; padding: 10px 12px;
    font-family: var(--sv-font, sans-serif); font-size: 0.8rem;
    box-shadow: 0 10px 28px rgba(0,0,0,.45); display: flex; flex-direction: column; gap: 7px;
}
.np-head { display: flex; align-items: center; gap: 6px; }
.np-kind { font-weight: 600; }
.np-id { margin-left: 2px; font-size: 0.72rem; color: #a3e635; overflow: hidden; text-overflow: ellipsis; }
.np-sgc-badge {
  background: rgba(163, 230, 53, 0.18);
  border: 1px solid #a3e635;
  color: #a3e635;
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  padding: 1px 5px;
  border-radius: 3px;
  line-height: 1.4;
  flex-shrink: 0;
}
.np-close { margin-left: auto; background: none; border: none; color: #95a5a6; font-size: 1.1rem; cursor: pointer; line-height: 1; }
.np-close:hover { color: #ecf0f1; }
.np-row { display: flex; justify-content: space-between; align-items: center; gap: 8px; font-size: 0.76rem; color: #bdc3c7; }
.np-row select, .np-row input {
    width: 110px; background: var(--sv-bg, #12121a); color: #ecf0f1;
    border: 1px solid #2e2740; border-radius: 4px; padding: 4px 6px; font-size: 0.78rem;
}
.np-row select:focus, .np-row input:focus { border-color: var(--sv-lime, #a3e635); outline: none; }
.np-pos { margin: 0; font-size: 0.72rem; color: #7f8c8d; font-family: monospace; }
.np-special-head {
    display: flex; align-items: center; gap: 6px; margin-top: 6px; padding-top: 6px;
    border-top: 1px solid rgba(255,255,255,.12); color: #f59e0b; font-weight: 600;
    font-size: 0.74rem; text-transform: uppercase; letter-spacing: .5px;
}
.np-warn {
    background: rgba(245,158,11,.12); border: 1px solid rgba(245,158,11,.4);
    border-radius: 5px; padding: 6px 8px; font-size: 0.72rem; color: #f59e0b; line-height: 1.35;
}
.np-hint {
    background: rgba(56,189,248,.10); border: 1px solid rgba(56,189,248,.35);
    border-radius: 5px; padding: 5px 8px; font-size: 0.7rem; color: #7dd3fc; line-height: 1.35;
}
.np-series { display: flex; flex-direction: column; gap: 4px; }
.np-series-head { display: flex; justify-content: space-between; align-items: center; font-size: 0.74rem; color: #bdc3c7; }
.np-series-row { display: flex; align-items: center; gap: 4px; }
.np-series-row input { width: 64px; background: var(--sv-bg, #12121a); color: #ecf0f1; border: 1px solid #2e2740; border-radius: 4px; padding: 3px 5px; font-size: 0.74rem; }
.np-unit { color: #7f8c8d; font-size: 0.68rem; width: 22px; }
.np-mini { background: var(--sv-bg, #12121a); color: #a3e635; border: 1px solid #2e2740; border-radius: 4px; padding: 2px 7px; cursor: pointer; font-size: 0.7rem; }
.np-mini:hover { border-color: var(--sv-lime, #a3e635); }
.np-mini-del { color: #e74c3c; margin-left: auto; }
.np-toggle .seg { display: inline-flex; border: 1px solid #2e2740; border-radius: 5px; overflow: hidden; }
.np-toggle .seg button { background: var(--sv-bg, #12121a); color: #95a5a6; border: none; padding: 4px 10px; cursor: pointer; font-size: 0.74rem; }
.np-toggle .seg button.on { background: var(--sv-violet, #8b5cf6); color: #fff; }
.np-del {
    margin-top: 3px; display: flex; align-items: center; justify-content: center; gap: 6px;
    background: transparent; color: #e74c3c; border: 1px solid #e74c3c55; border-radius: 5px;
    padding: 6px; cursor: pointer; font-size: 0.78rem;
}
.np-del:hover { background: rgba(231,76,60,.15); border-color: #e74c3c; }
</style>
