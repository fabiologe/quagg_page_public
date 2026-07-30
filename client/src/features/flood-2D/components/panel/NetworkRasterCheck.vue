<template>
  <!-- Teleport nach <body>: der .right-panel-container hat z-index:15 und deckelt als
       Stacking-Context JEDES innere z-index — das fixed Modal (3000) wirkte sonst wie
       „15" und Canvas-Overlays (LayerControl/Tool-Panels) lagen DRÜBER. -->
  <Teleport to="body">
  <div class="nrc-overlay" @click.self="$emit('close')">
    <div class="nrc-modal">
      <div class="nrc-head">
        <span>Raster vs. Netz — Abgleich</span>
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
          <!-- Auto-Ausrichtung ist NUR für den CRS-/Frame-Versatz gedacht (Netz außerhalb
               des DGM). Ein bereits passendes Netz würde sie auf die DGM-Mitte zerren
               („ins Nirvana") → bei guter Abdeckung gesperrt, dazwischen Rückfrage. -->
          <button class="nrc-btn" :disabled="alignBlocked" @click="autoMove"
                  :title="alignBlocked ? 'Koordinaten passen bereits zum DGM — Verschieben würde das Netz von seiner korrekten Lage wegziehen.' : 'Netz-Mitte auf DGM-Mitte schieben (Skala 1)'">
            Auto: verschieben</button>
          <button class="nrc-btn" :disabled="alignBlocked" @click="autoFit"
                  :title="alignBlocked ? 'Koordinaten passen bereits zum DGM — Einpassen würde das Netz verschieben und skalieren.' : 'Netz auf DGM einpassen (verschieben + skalieren)'">
            Auto: einpassen</button>
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
          <button class="nrc-btn" :disabled="!rimFixable.length" @click="fixAllRims"
                  title="Deckel≠Gelände: Deckel nachziehen · Sohle über Gelände: ganzen Schacht aufs Gelände (Tiefe bleibt). Ein einziger Undo-Schritt.">
            Alle auf Gelände setzen ({{ rimFixable.length }})
          </button>
        </div>

        <div class="nrc-body">
          <table class="nrc-table">
            <thead><tr>
              <th>Schacht</th><th>Deckel</th><th>Gelände</th><th>Δ Deckel</th>
              <th>Sohle</th><th>Tiefe</th><th>Status</th><th></th>
            </tr></thead>
            <tbody>
              <tr v-for="r in rows" :key="r.id" :class="r.cls" @click="pick(r.id)">
                <td class="mono" :title="r.id">{{ r.id }}</td>
                <td>{{ fmt(r.rim) }}</td>
                <td>{{ r.terrain == null ? '—' : fmt(r.terrain) }}</td>
                <td :class="{ bad: r.cls==='warn' }">{{ r.dRim == null ? '—' : (r.dRim>0?'+':'') + fmt(r.dRim) }}</td>
                <td>{{ fmt(r.invert) }}</td>
                <td>{{ fmt(r.depth) }}</td>
                <td><span class="tag" :class="r.cls">{{ r.label }}</span></td>
                <td>
                  <!-- warn: nur Deckel aufs Gelände. err (Sohle über Gelände): ganzen Schacht
                       aufs Gelände setzen (Tiefe bleibt) — nur der Deckel würde sonst UNTER
                       der Sohle landen (neuer Fehler „Sohle über Deckel"). -->
                  <button v-if="r.cls==='warn'" class="nrc-fix"
                          title="Deckelhöhe auf die DGM-Höhe setzen"
                          @click.stop="fixRim(r)">Deckel→Gelände</button>
                  <button v-else-if="r.cls==='err'" class="nrc-fix"
                          title="Deckel auf DGM-Höhe, Sohle rückt mit (Schachttiefe bleibt erhalten)"
                          @click.stop="fixRim(r)">Schacht→Gelände</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="nrc-note">
          Klärt Diskrepanzen für die Kopplung: der Deckel (rim) sollte dem DGM an der Schachtposition
          entsprechen — sonst greift der 2D↔1D-Austausch auf inkonsistente Höhen zu. „Sohle über Gelände"
          heißt der Schacht ragt aus dem Raster (Datenfehler / falsche Tiefe). Auslässe (outfall) sind
          davon ausgenommen — sie münden naturgemäß an der Oberfläche.
        </div>

        <!-- Haltungen: Rohrscheitel vs. Gelände. Meist ein Vermessungs-/DGM-Abgleichfehler
             (Invert/Profilhöhe aus ISYBAU vs. separat erhobenes DGM) — selten eine echte
             oberirdische Rohrquerung. Rein informativ, kein Auto-Fix (anders als Deckel). -->
        <div v-if="pipeRows.length" class="nrc-summary">
          <span class="chip ok">{{ pipeCounts.ok }} ok</span>
          <span class="chip err">{{ pipeCounts.exceeds }} Rohrscheitel über Gelände</span>
          <span class="chip out">{{ pipeCounts.outside }} außerhalb Raster</span>
        </div>
        <div v-if="pipeRows.length" class="nrc-body">
          <table class="nrc-table">
            <thead><tr>
              <th>Haltung</th><th>Scheitel Zulauf</th><th>Gelände Zulauf</th>
              <th>Scheitel Ablauf</th><th>Gelände Ablauf</th><th>Status</th>
            </tr></thead>
            <tbody>
              <tr v-for="r in pipeRows" :key="r.id" :class="r.cls" @click="pick(r.id)">
                <td class="mono" :title="r.id">{{ r.id }}</td>
                <td>{{ fmt(r.crownFrom) }}</td>
                <td>{{ r.terrainFrom == null ? '—' : fmt(r.terrainFrom) }}</td>
                <td>{{ fmt(r.crownTo) }}</td>
                <td>{{ r.terrainTo == null ? '—' : fmt(r.terrainTo) }}</td>
                <td><span class="tag" :class="r.cls">{{ r.label }}</span></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-if="pipeRows.length" class="nrc-note">
          Scheitel = Rohrsohle + Profilhöhe, entlang der gesamten Rohrachse gegen das DGM abgetastet
          (auch Geländeeinschnitte zwischen den Schächten werden erkannt). Liegt er über dem Gelände,
          würde das Rohr oberirdisch verlaufen — meist ein Vermessungs-/DGM-Abgleichfehler
          (unterschiedliche Erhebungen/Auflösung), seltener eine echte Rohrbrücke. Kein Auto-Fix —
          bitte Sohle/Profil bzw. Gelände prüfen.
        </div>
      </template>
    </div>
  </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useNetworkStore } from '@/features/flood-2D/stores/useNetworkStore.js';
import { useGeoStore } from '@/features/flood-2D/stores/useGeoStore.js';
import { makeTerrainSampler } from '@/features/flood-2D/services/geometry/terrainSample.js';

const emit = defineEmits(['close']);
const net = useNetworkStore();
const geoStore = useGeoStore();
const tol = ref(0.5);
// Toleranz geklemmt: v-model.number umgeht das min="0"-Attribut, negativ ⇒ alles „warn".
const tolSafe = computed(() => Math.max(Number(tol.value) || 0, 0));
// REAKTIV statt Einmal-Snapshot: DGM kann bei offenem Dialog importiert/gecroppt werden.
const sampler = computed(() => makeTerrainSampler(geoStore.terrain));
const fmt = (v) => (Number.isFinite(v) ? v.toFixed(2) : '—');
const fmt0 = (v) => (Number.isFinite(v) ? Math.round(v).toString() : '—');
// Profilhöhe defensiv mm→m (DN600 = 600) — wie useNetworkRenderer.linkRadius/sectionNetwork;
// Alt-Projektdateien liefern teils mm, sonst wird JEDER Scheitel „über Gelände" gemeldet.
const profH = (v) => { const h = Number(v); if (!Number.isFinite(h) || h <= 0) return 0; return h > 10 ? h / 1000 : h; };

// ESC schließt das Modal (wie Overlay-Klick/×).
const onKey = (e) => { if (e.key === 'Escape') emit('close'); };
onMounted(() => window.addEventListener('keydown', onKey));
onUnmounted(() => window.removeEventListener('keydown', onKey));

// Zeilen-Klick: Element auswählen UND Modal schließen — die Auswahl (3D-Highlight +
// NetworkPropertyPanel via ScenarioManager-Watcher) wäre hinter dem Modal unsichtbar.
function pick(id) { net.select(id); emit('close'); }

// BBox Netz vs DGM (CRS-/Frame-Abgleich). Schleife statt Math.min(...spread):
// der Spread wirft bei sehr großen Netzen (>~100k Knoten) einen RangeError.
const bbox = computed(() => {
    const ns = net.nodes;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of ns) {
        if (n.x < minX) minX = n.x; if (n.x > maxX) maxX = n.x;
        if (n.y < minY) minY = n.y; if (n.y > maxY) maxY = n.y;
    }
    const net_ = ns.length ? { minX, maxX, minY, maxY } : { minX: 0, maxX: 0, minY: 0, maxY: 0 };
    return { net: net_, dem: sampler.value?.bounds ?? { minX: 0, maxX: 0, minY: 0, maxY: 0 } };
});
const coverage = computed(() => {
    // Leeres Netz ist KEIN CRS-Versatz — neutral melden statt rotem Fehlalarm.
    if (net.nodes.length === 0)
        return { inside: 0, pct: 0, cls: 'warn', msg: 'Kein Schacht im Netz — zuerst ein Entwässerungsnetz importieren.' };
    const inside = counts.value.ok + counts.value.rim + counts.value.invert;   // alles außer 'außerhalb'
    const pct = Math.round((inside / net.nodes.length) * 100);
    let cls = 'ok', msg = 'Koordinaten passen zum DGM.';
    if (pct === 0) { cls = 'err'; msg = 'KEIN Schacht im DGM — Koordinaten-/CRS-Versatz (Netz und DGM in unterschiedlichen Systemen?).'; }
    else if (pct < 80) { cls = 'warn'; msg = 'Viele Schächte außerhalb — teilweiser Versatz oder DGM zu klein.'; }
    return { inside, pct, cls, msg };
});

const rows = computed(() => {
    const s = sampler.value;
    if (!s) return [];
    return net.nodes.map(n => {
        const terrain = s.sampleZ(n.x, n.y);
        const depth = n.rim - n.invert;
        let cls = 'ok', label = 'ok', dRim = null;
        if (terrain == null) { cls = 'out'; label = 'außerhalb'; }
        else {
            dRim = n.rim - terrain;
            // Outfall-Ausnahme: ein Auslass mündet naturgemäß an der Oberfläche
            // (Gerinnesohle im DGM) — invert ≈ terrain ist dort korrekt, kein Fehler.
            if (n.role !== 'outfall' && n.invert >= terrain - 1e-6) { cls = 'err'; label = 'Sohle über Gelände'; }
            else if (Math.abs(dRim) > tolSafe.value) { cls = 'warn'; label = 'Deckel≠Gelände'; }
        }
        return { id: n.id, rim: n.rim, invert: n.invert, depth, terrain, dRim, cls, label };
    });
});
const counts = computed(() => rows.value.reduce((a, r) => { a[r.cls === 'out' ? 'outside' : r.cls === 'err' ? 'invert' : r.cls === 'warn' ? 'rim' : 'ok']++; return a; }, { ok: 0, rim: 0, invert: 0, outside: 0 }));
const rimFixable = computed(() => rows.value.filter(r => (r.cls === 'warn' || r.cls === 'err') && r.terrain != null));

// Haltungen: Rohrscheitel (Sohle + Profilhöhe) vs. Gelände — ENTLANG der Achse abgetastet
// (Polylinie bzw. gerade Verbindung), nicht nur an den Endknoten: ein Geländeeinschnitt
// mitten zwischen zwei Schächten wird sonst nicht erkannt. Nur `covered` (Rohre) geprüft —
// offene Gerinne (SGC) sollen an der Oberfläche liegen, das ist gewollt.
const pipeRows = computed(() => {
    const s = sampler.value;
    if (!s) return [];
    const step = Math.max(s.cellsize * 2, 1);   // Abtastweite entlang der Achse
    return net.links.filter(l => l.conveyance !== 'open').map(l => {
        const from = net.nodeById.get(l.fromNodeId);
        const to = net.nodeById.get(l.toNodeId);
        if (!from || !to) return null;
        const z1 = Number.isFinite(Number(l.attrs?.z1)) ? Number(l.attrs.z1) : from.invert;
        const z2 = Number.isFinite(Number(l.attrs?.z2)) ? Number(l.attrs.z2) : to.invert;
        const height = profH(l.profile?.height);
        // Stützpunkte: eigene Polylinie (x,y,z = Rohrsohle) oder gerade Sohlverbindung.
        let pts = null;
        if (Array.isArray(l.points) && l.points.length >= 2) {
            const clean = l.points.filter(p =>
                Number.isFinite(p?.x) && Number.isFinite(p?.y) && Number.isFinite(p?.z));
            if (clean.length >= 2) pts = clean;
        }
        if (!pts) pts = [{ x: from.x, y: from.y, z: z1 }, { x: to.x, y: to.y, z: z2 }];
        let maxOver = null, anyTerrain = false;
        for (let i = 0; i < pts.length - 1; i++) {
            const a = pts[i], b = pts[i + 1];
            const nSteps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step));
            for (let k = 0; k <= nSteps; k++) {
                const t = k / nSteps;
                const terr = s.sampleZ(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
                if (terr == null) continue;
                anyTerrain = true;
                const over = (a.z + (b.z - a.z) * t + height) - terr;
                if (maxOver == null || over > maxOver) maxOver = over;
            }
        }
        const crownFrom = z1 + height, crownTo = z2 + height;
        const terrainFrom = s.sampleZ(from.x, from.y);
        const terrainTo = s.sampleZ(to.x, to.y);
        let cls = 'ok', label = 'ok';
        if (!anyTerrain) { cls = 'out'; label = 'außerhalb'; }
        else if (maxOver > 1e-6) { cls = 'err'; label = `Scheitel +${maxOver.toFixed(2)} m über Gelände`; }
        return { id: l.id, crownFrom, crownTo, terrainFrom, terrainTo, cls, label };
    }).filter(Boolean);
});
const pipeCounts = computed(() => pipeRows.value.reduce((a, r) => {
    if (r.cls === 'err') a.exceeds++; else if (r.cls === 'out') a.outside++; else a.ok++;
    return a;
}, { ok: 0, exceeds: 0, outside: 0 }));

// warn: nur Deckel nachziehen. err (Sohle über Gelände): ganzen Schacht aufs Gelände
// setzen und die Tiefe erhalten — NUR den Deckel zu senken würde ihn unter die Sohle
// legen (neuer Validierungsfehler „Sohle über Deckel").
function rimPatch(r) {
    if (r.cls === 'err') {
        const depth = Math.max(Number.isFinite(r.depth) ? r.depth : 0, 0.5);
        return { id: r.id, rim: r.terrain, invert: r.terrain - depth };
    }
    return { id: r.id, rim: r.terrain };
}
function fixRim(r) { if (r.terrain != null) net.updateNode(r.id, rimPatch(r)); }
// EIN Undo-Schritt für den ganzen Batch — updateNode pro Schacht würde die
// History fluten (MAX_SNAPSHOTS-FIFO frisst dann alle älteren Einträge).
function fixAllRims() {
    net.updateNodesBatch(rimFixable.value.map(rimPatch), 'Deckel auf Gelände setzen');
}

// Ausrichten (Offset/Scale-Matching CAD↔Raster).
const mDx = ref(0), mDy = ref(0), mScale = ref(1);
const netCenter = () => { const b = bbox.value.net; return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }; };
function applyManual() {
    const c = netCenter();
    // Skala nur > 0 zulassen: 0/NaN wäre Kollaps auf einen Punkt, negativ spiegelt das Netz.
    const sIn = Number(mScale.value);
    const scale = Number.isFinite(sIn) && sIn > 0 ? sIn : 1;
    net.transformCoords({ dx: mDx.value || 0, dy: mDy.value || 0, scale, pivotX: c.x, pivotY: c.y });
    mDx.value = 0; mDy.value = 0; mScale.value = 1;
}
// Auto-Ausrichtung sperren, wenn das Netz schon (überwiegend) im DGM liegt: die Buttons
// zentrieren stumpf auf die DGM-Mitte — ein korrekt georeferenziertes Teilnetz am
// DGM-Rand würde dadurch von seiner richtigen Lage WEGgezogen.
const alignBlocked = computed(() => net.nodes.length > 0 && coverage.value.pct >= 80);
// Teilweise Abdeckung (1–79 %): kann echter Versatz ODER ein zu kleines DGM sein —
// vor dem Verschieben einmal nachfragen statt kommentarlos zu transformieren.
function confirmAlign(aktion) {
    const pct = coverage.value.pct;
    if (pct === 0) return true;
    return window.confirm(
        `${pct} % der Schächte liegen bereits im DGM — möglicherweise passt das Netz schon `
        + `und nur das DGM ist zu klein.\n\n${aktion} transformiert das GESAMTE Netz. Fortfahren?\n`
        + `(Rückgängig: ↶ in der Editor-Leiste / Ctrl+Z)`);
}
function autoMove() {
    if (!sampler.value || alignBlocked.value || !confirmAlign('„Auto: verschieben"')) return;
    const c = netCenter();
    net.transformCoords({ dx: sampler.value.center.x - c.x, dy: sampler.value.center.y - c.y, scale: 1 });
}
function autoFit() {
    if (!sampler.value || alignBlocked.value || !confirmAlign('„Auto: einpassen"')) return;
    const b = bbox.value, c = netCenter();
    const netW = Math.max(b.net.maxX - b.net.minX, 1e-6), netH = Math.max(b.net.maxY - b.net.minY, 1e-6);
    const scale = Math.min((b.dem.maxX - b.dem.minX) / netW, (b.dem.maxY - b.dem.minY) / netH) * 0.95;
    net.transformCoords({ dx: sampler.value.center.x - c.x, dy: sampler.value.center.y - c.y, scale, pivotX: c.x, pivotY: c.y });
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
