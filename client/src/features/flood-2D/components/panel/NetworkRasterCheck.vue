<template>
  <div class="nrc-overlay" @click.self="$emit('close')">
    <div class="nrc-modal">
      <div class="nrc-head">
        <span><SvEmoji emoji="⛰️" :size="15" /> Raster vs. Netz — Abgleich</span>
        <button class="nrc-x" @click="$emit('close')">×</button>
      </div>

      <div v-if="!sampler" class="nrc-empty">
        Kein Gelände (DGM) geladen — bitte zuerst ein Terrain importieren, dann prüfen.
      </div>

      <template v-else>
        <!-- CRS-/Frame-Abgleich: die häufigste Kopplungs-Falle ist ein Koordinaten-/CRS-
             Versatz zwischen Netz (ISYBAU RW/HW) und DGM → Schächte landen außerhalb. -->
        <div class="nrc-crs" :class="coverage.cls">
          <div>
            <strong>{{ coverage.inside }}/{{ net.nodes.length }} Schächte im DGM</strong>
            ({{ coverage.pct }} %) — {{ coverage.msg }}
          </div>
          <div class="nrc-bbox">
            Netz-BBox: [{{ fmt0(bbox.net.minX) }}…{{ fmt0(bbox.net.maxX) }}, {{ fmt0(bbox.net.minY) }}…{{ fmt0(bbox.net.maxY) }}]<br>
            DGM-BBox: [{{ fmt0(bbox.dem.minX) }}…{{ fmt0(bbox.dem.maxX) }}, {{ fmt0(bbox.dem.minY) }}…{{ fmt0(bbox.dem.maxY) }}]
          </div>
        </div>

        <!-- Ausrichtung (nackte Zahlen: Offset/Scale-Matching CAD↔Raster, kein CRS) -->
        <div class="nrc-align">
          <span class="al-title">Ausrichten:</span>
          <label>ΔX <input type="number" v-model.number="mDx" /></label>
          <label>ΔY <input type="number" v-model.number="mDy" /></label>
          <label>Skala <input type="number" step="0.01" v-model.number="mScale" /></label>
          <button class="nrc-btn" @click="applyManual">Anwenden</button>
          <span class="spacer"></span>
          <button class="nrc-btn" @click="autoMove" title="Netz-Mitte auf DGM-Mitte schieben (Skala 1)">Auto: verschieben</button>
          <button class="nrc-btn" @click="autoFit" title="Netz auf DGM einpassen (verschieben + skalieren)">Auto: einpassen</button>
        </div>

        <div class="nrc-summary">
          <span class="chip ok">{{ counts.ok }} ok</span>
          <span class="chip warn">{{ counts.rim }} Deckel≠Gelände</span>
          <span class="chip err">{{ counts.invert }} Sohle über Gelände</span>
          <span class="chip out">{{ counts.outside }} außerhalb Raster</span>
          <label class="tol">Toleranz [m]
            <input type="number" step="0.1" min="0" v-model.number="tol" />
          </label>
          <span class="spacer"></span>
          <button class="nrc-btn" :disabled="!rimFixable.length" @click="fixAllRims">
            Alle Deckel auf Gelände setzen ({{ rimFixable.length }})
          </button>
        </div>

        <div class="nrc-body">
          <table class="nrc-table">
            <thead><tr>
              <th>Schacht</th><th>Deckel</th><th>Gelände</th><th>Δ Deckel</th>
              <th>Sohle</th><th>Tiefe</th><th>Status</th><th></th>
            </tr></thead>
            <tbody>
              <tr v-for="r in rows" :key="r.id" :class="r.cls" @click="net.select(r.id)">
                <td class="mono" :title="r.id">{{ r.id }}</td>
                <td>{{ fmt(r.rim) }}</td>
                <td>{{ r.terrain == null ? '—' : fmt(r.terrain) }}</td>
                <td :class="{ bad: r.cls==='warn' }">{{ r.dRim == null ? '—' : (r.dRim>0?'+':'') + fmt(r.dRim) }}</td>
                <td>{{ fmt(r.invert) }}</td>
                <td>{{ fmt(r.depth) }}</td>
                <td><span class="tag" :class="r.cls">{{ r.label }}</span></td>
                <td>
                  <button v-if="r.cls==='warn' || r.cls==='err'" class="nrc-fix"
                          @click.stop="fixRim(r)">Deckel→Gelände</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="nrc-note">
          Klärt Diskrepanzen für die Kopplung: der Deckel (rim) sollte dem DGM an der Schachtposition
          entsprechen — sonst greift der 2D↔1D-Austausch auf inkonsistente Höhen zu. „Sohle über Gelände"
          heißt der Schacht ragt aus dem Raster (Datenfehler / falsche Tiefe).
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import SvEmoji from '../common/SvEmoji.vue';
import { useNetworkStore } from '@/features/flood-2D/stores/useNetworkStore.js';
import { useGeoStore } from '@/features/flood-2D/stores/useGeoStore.js';
import { makeTerrainSampler } from '@/features/flood-2D/services/geometry/terrainSample.js';

defineEmits(['close']);
const net = useNetworkStore();
const geoStore = useGeoStore();
const tol = ref(0.5);
const sampler = makeTerrainSampler(geoStore.terrain);
const fmt = (v) => (Number.isFinite(v) ? v.toFixed(2) : '—');
const fmt0 = (v) => (Number.isFinite(v) ? Math.round(v).toString() : '—');

// BBox Netz vs DGM (CRS-/Frame-Abgleich).
const bbox = computed(() => {
    const ns = net.nodes;
    const net_ = ns.length ? {
        minX: Math.min(...ns.map(n => n.x)), maxX: Math.max(...ns.map(n => n.x)),
        minY: Math.min(...ns.map(n => n.y)), maxY: Math.max(...ns.map(n => n.y)),
    } : { minX: 0, maxX: 0, minY: 0, maxY: 0 };
    return { net: net_, dem: sampler?.bounds ?? { minX: 0, maxX: 0, minY: 0, maxY: 0 } };
});
const coverage = computed(() => {
    const total = net.nodes.length || 1;
    const inside = counts.value.ok + counts.value.rim + counts.value.invert;   // alles außer 'außerhalb'
    const pct = Math.round((inside / total) * 100);
    let cls = 'ok', msg = 'Koordinaten passen zum DGM.';
    if (pct === 0) { cls = 'err'; msg = 'KEIN Schacht im DGM — Koordinaten-/CRS-Versatz (Netz und DGM in unterschiedlichen Systemen?).'; }
    else if (pct < 80) { cls = 'warn'; msg = 'Viele Schächte außerhalb — teilweiser Versatz oder DGM zu klein.'; }
    return { inside, pct, cls, msg };
});

const rows = computed(() => {
    if (!sampler) return [];
    return net.nodes.map(n => {
        const terrain = sampler.sampleZ(n.x, n.y);
        const depth = n.rim - n.invert;
        let cls = 'ok', label = 'ok', dRim = null;
        if (terrain == null) { cls = 'out'; label = 'außerhalb'; }
        else {
            dRim = n.rim - terrain;
            if (n.invert >= terrain - 1e-6) { cls = 'err'; label = 'Sohle über Gelände'; }
            else if (Math.abs(dRim) > tol.value) { cls = 'warn'; label = 'Deckel≠Gelände'; }
        }
        return { id: n.id, rim: n.rim, invert: n.invert, depth, terrain, dRim, cls, label };
    });
});
const counts = computed(() => rows.value.reduce((a, r) => { a[r.cls === 'out' ? 'outside' : r.cls === 'err' ? 'invert' : r.cls === 'warn' ? 'rim' : 'ok']++; return a; }, { ok: 0, rim: 0, invert: 0, outside: 0 }));
const rimFixable = computed(() => rows.value.filter(r => (r.cls === 'warn' || r.cls === 'err') && r.terrain != null));

function fixRim(r) { if (r.terrain != null) net.updateNode(r.id, { rim: r.terrain }); }
function fixAllRims() { rimFixable.value.forEach(fixRim); }

// Ausrichten (Offset/Scale-Matching CAD↔Raster).
const mDx = ref(0), mDy = ref(0), mScale = ref(1);
const netCenter = () => { const b = bbox.value.net; return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }; };
function applyManual() {
    const c = netCenter();
    net.transformCoords({ dx: mDx.value || 0, dy: mDy.value || 0, scale: mScale.value || 1, pivotX: c.x, pivotY: c.y });
    mDx.value = 0; mDy.value = 0; mScale.value = 1;
}
function autoMove() {
    if (!sampler) return;
    const c = netCenter();
    net.transformCoords({ dx: sampler.center.x - c.x, dy: sampler.center.y - c.y, scale: 1 });
}
function autoFit() {
    if (!sampler) return;
    const b = bbox.value, c = netCenter();
    const netW = Math.max(b.net.maxX - b.net.minX, 1e-6), netH = Math.max(b.net.maxY - b.net.minY, 1e-6);
    const scale = Math.min((b.dem.maxX - b.dem.minX) / netW, (b.dem.maxY - b.dem.minY) / netH) * 0.95;
    net.transformCoords({ dx: sampler.center.x - c.x, dy: sampler.center.y - c.y, scale, pivotX: c.x, pivotY: c.y });
}
</script>

<style scoped>
.nrc-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.6); backdrop-filter: blur(3px); z-index: 3000; display: flex; align-items: center; justify-content: center; }
.nrc-modal { width: min(820px, 92vw); max-height: 86vh; display: flex; flex-direction: column; background: var(--sv-surface, #1e2d3a); color: var(--sv-text, #ecf0f1); border: 1px solid var(--sv-violet, #8b5cf6); border-radius: 10px; font-family: var(--sv-font, sans-serif); box-shadow: 0 20px 50px rgba(0,0,0,.5); }
.nrc-head { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid #2e2740; font-weight: 700; }
.nrc-x { background: none; border: none; color: #95a5a6; font-size: 1.4rem; cursor: pointer; line-height: 1; }
.nrc-empty { padding: 30px; text-align: center; color: #7f8c8d; }
.nrc-crs { display: flex; justify-content: space-between; gap: 12px; padding: 9px 16px; font-size: 0.8rem; border-bottom: 1px solid #2e2740; }
.nrc-crs.ok { background: rgba(163,230,53,.08); }
.nrc-crs.warn { background: rgba(243,156,18,.10); color: #f39c12; }
.nrc-crs.err { background: rgba(231,76,60,.12); color: #e74c3c; }
.nrc-bbox { font-family: monospace; font-size: 0.68rem; color: #7f8c8d; text-align: right; white-space: nowrap; }
.nrc-align { display: flex; align-items: center; gap: 8px; padding: 8px 16px; border-bottom: 1px solid #2e2740; flex-wrap: wrap; font-size: 0.76rem; color: #bdc3c7; }
.nrc-align .al-title { color: #5d7f99; font-weight: 600; }
.nrc-align label { display: flex; align-items: center; gap: 4px; }
.nrc-align input { width: 78px; background: var(--sv-bg,#12121a); color: #ecf0f1; border: 1px solid #2e2740; border-radius: 3px; padding: 3px 5px; }
.nrc-align .spacer { flex: 1; }
.nrc-summary { display: flex; align-items: center; gap: 8px; padding: 10px 16px; border-bottom: 1px solid #2e2740; flex-wrap: wrap; font-size: 0.8rem; }
.chip { padding: 2px 9px; border-radius: 10px; font-size: 0.74rem; }
.chip.ok { background: rgba(163,230,53,.15); color: #a3e635; }
.chip.warn { background: rgba(243,156,18,.15); color: #f39c12; }
.chip.err { background: rgba(231,76,60,.15); color: #e74c3c; }
.chip.out { background: #1e1e2c; color: #7f8c8d; }
.tol { color: #bdc3c7; display: flex; align-items: center; gap: 5px; }
.tol input { width: 60px; background: var(--sv-bg,#12121a); color: #ecf0f1; border: 1px solid #2e2740; border-radius: 3px; padding: 3px 5px; }
.spacer { flex: 1; }
.nrc-btn { background: #1a2635; color: #a3e635; border: 1px solid var(--sv-lime, #a3e635); border-radius: 5px; padding: 5px 10px; cursor: pointer; font-size: 0.78rem; }
.nrc-btn:disabled { opacity: .45; cursor: not-allowed; }
.nrc-body { overflow: auto; padding: 4px 8px; }
.nrc-table { width: 100%; border-collapse: collapse; font-size: 0.78rem; }
.nrc-table th { text-align: left; color: #5d7f99; padding: 6px; position: sticky; top: 0; background: var(--sv-surface,#1e2d3a); border-bottom: 1px solid #2e2740; }
.nrc-table td { padding: 4px 6px; border-bottom: 1px solid #ffffff08; font-variant-numeric: tabular-nums; }
.nrc-table tr { cursor: pointer; }
.nrc-table tr.warn { background: rgba(243,156,18,.06); }
.nrc-table tr.err { background: rgba(231,76,60,.07); }
.nrc-table tr:hover { background: #ffffff0a; }
.nrc-table .mono { font-family: monospace; color: #bdc3c7; max-width: 150px; overflow: hidden; text-overflow: ellipsis; }
.nrc-table .bad { color: #f39c12; font-weight: 600; }
.tag { padding: 1px 7px; border-radius: 8px; font-size: 0.7rem; }
.tag.ok { color: #a3e635; } .tag.warn { color: #f39c12; } .tag.err { color: #e74c3c; } .tag.out { color: #7f8c8d; }
.nrc-fix { background: none; border: 1px solid #f39c1288; color: #f39c12; border-radius: 4px; padding: 2px 6px; cursor: pointer; font-size: 0.7rem; }
.nrc-note { padding: 8px 16px 14px; font-size: 0.73rem; color: #7f8c8d; line-height: 1.4; border-top: 1px solid #2e2740; }
</style>
