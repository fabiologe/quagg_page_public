<template>
  <svg v-if="ready" class="laengs-svg" :viewBox="`0 0 ${W} ${H}`" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <clipPath id="lclip">
        <rect :x="ML" :y="MT - 2" :width="PW" :height="PH + 4" />
      </clipPath>
    </defs>

    <!-- Y grid + labels -->
    <line v-for="t in yTicks" :key="`yg-${t}`"
      :x1="ML" :y1="zToY(t)" :x2="ML + PW" :y2="zToY(t)"
      stroke="#2b2540" stroke-width="0.7" stroke-dasharray="2 4" />
    <text v-for="t in yTicks" :key="`yl-${t}`"
      :x="ML - 5" :y="zToY(t) + 3.5"
      text-anchor="end" font-size="8" fill="#9a9ab5">{{ t.toFixed(1) }}</text>

    <!-- X labels -->
    <text v-for="t in xTicks" :key="`xl-${t}`"
      :x="sToX(t)" :y="MT + PH + 15"
      text-anchor="middle" font-size="7.5" fill="#9a9ab5">
      {{ t >= 1000 ? (t / 1000).toFixed(2) + 'km' : t.toFixed(0) + 'm' }}
    </text>

    <!-- Axis frame -->
    <line :x1="ML" :y1="MT" :x2="ML" :y2="MT + PH + 1" stroke="#3a2f5c" stroke-width="1" />
    <line :x1="ML - 1" :y1="MT + PH" :x2="ML + PW" :y2="MT + PH" stroke="#3a2f5c" stroke-width="1" />

    <!-- Y-axis unit -->
    <text :x="7" :y="MT + PH / 2 + 10" font-size="7.5" fill="#9a9ab5"
      :transform="`rotate(-90, 7, ${MT + PH / 2})`">m NN</text>

    <!-- DEM profile -->
    <path :d="demPath" fill="none" stroke="#8b5cf6" stroke-width="1.5"
      stroke-linejoin="round" clip-path="url(#lclip)" />

    <!-- Zone overlay -->
    <path v-if="zonePath" :d="zonePath" fill="none" stroke="#f97316"
      stroke-width="1.5" stroke-dasharray="5 3" stroke-linejoin="round"
      clip-path="url(#lclip)" />

    <!-- Survey point dots -->
    <circle v-for="(d, i) in surveyDots" :key="`sd-${i}`"
      :cx="sToX(d.station)" :cy="zToY(d.z)"
      r="2.5" fill="#a3e635" stroke="#7fb51f" stroke-width="0.7"
      clip-path="url(#lclip)" />

    <!-- Legend -->
    <line :x1="ML + 2" :y1="9" :x2="ML + 14" :y2="9" stroke="#8b5cf6" stroke-width="1.5" />
    <text :x="ML + 17" :y="12" font-size="7.5" fill="#9a9ab5">DGM-Profil</text>
    <line v-if="zonePath" :x1="ML + 60" :y1="9" :x2="ML + 72" :y2="9"
      stroke="#f97316" stroke-width="1.5" stroke-dasharray="4 2" />
    <text v-if="zonePath" :x="ML + 75" :y="12" font-size="7.5" fill="#9a9ab5">Bathy-Zone</text>
    <circle :cx="ML + (zonePath ? 122 : 68)" :cy="9" r="2.5" fill="#a3e635" />
    <text :x="ML + (zonePath ? 127 : 73)" :y="12" font-size="7.5" fill="#9a9ab5">
      {{ surveyDots.length }} Messpkt.
    </text>
  </svg>
  <div v-else class="laengs-empty">Flusslinie zeichnen um Längsschnitt anzuzeigen.</div>
</template>

<script setup>
import { computed } from 'vue';
import { useGeoStore } from '@/features/flood-2D/stores/useGeoStore.js';
import { useBathymetryStore } from '@/features/flood-2D/stores/useBathymetryStore.js';
import { useRasterProcessingStore } from '@/features/flood-2D/stores/useRasterProcessingStore.js';

// SVG layout
const W  = 540, H  = 185;
const ML = 44,  MR = 10, MT = 18, MB = 27;
const PW = W - ML - MR;
const PH = H - MT - MB;

const geoStore    = useGeoStore();
const bathyStore  = useBathymetryStore();
const rasterStore = useRasterProcessingStore();

// ── Geometry helpers ───────────────────────────────────────────────────────

function buildCumLens(polyline) {
    const cl = [0];
    for (let i = 0; i < polyline.length - 1; i++) {
        const dx = polyline[i + 1].x - polyline[i].x;
        const dy = polyline[i + 1].y - polyline[i].y;
        cl.push(cl[i] + Math.sqrt(dx * dx + dy * dy));
    }
    return cl;
}

function pointAtStation(polyline, cumLens, s) {
    const last = polyline.length - 1;
    if (s <= 0)                return polyline[0];
    if (s >= cumLens[last])    return polyline[last];
    for (let i = 0; i < last; i++) {
        if (s <= cumLens[i + 1]) {
            const t = (s - cumLens[i]) / (cumLens[i + 1] - cumLens[i]);
            return {
                x: polyline[i].x + t * (polyline[i + 1].x - polyline[i].x),
                y: polyline[i].y + t * (polyline[i + 1].y - polyline[i].y),
            };
        }
    }
    return polyline[last];
}

function projectOntoPolyline(px, py, polyline, cumLens) {
    let bestS = 0, bestDist = Infinity;
    for (let i = 0; i < polyline.length - 1; i++) {
        const ax = polyline[i].x,   ay = polyline[i].y;
        const bx = polyline[i+1].x, by = polyline[i+1].y;
        const dx = bx - ax, dy = by - ay;
        const segLen2 = dx * dx + dy * dy;
        if (segLen2 < 1e-12) continue;
        const t  = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / segLen2));
        const ex = px - (ax + t * dx), ey = py - (ay + t * dy);
        const d  = Math.sqrt(ex * ex + ey * ey);
        if (d < bestDist) {
            bestDist = d;
            bestS    = cumLens[i] + t * Math.sqrt(segLen2);
        }
    }
    return { station: bestS, dist: bestDist };
}

// ── Core computation ───────────────────────────────────────────────────────

const coreData = computed(() => {
    const polyline = bathyStore.channelPolyline;
    const terrain  = geoStore.terrain;
    if (polyline.length < 2 || !terrain?.gridData) return null;

    const { gridData, ncols, nrows, cellsize } = terrain;
    const xll = terrain.xllcorner ?? terrain.xll ?? 0;
    const yll  = terrain.yllcorner ?? terrain.yll ?? 0;

    const cumLens = buildCumLens(polyline);
    const totalLen = cumLens[cumLens.length - 1];
    if (totalLen < 1) return null;

    const nSamples = Math.min(500, Math.ceil(totalLen / Math.max(cellsize * 0.5, 1)));
    const samples  = [];

    for (let i = 0; i <= nSamples; i++) {
        const s = (i / nSamples) * totalLen;
        const { x, y } = pointAtStation(polyline, cumLens, s);
        const col = Math.floor((x - xll) / cellsize);
        const row = Math.floor((y - yll) / cellsize);
        let demZ = null, cellIdx = -1;
        if (col >= 0 && col < ncols && row >= 0 && row < nrows) {
            cellIdx = row * ncols + col;
            const v = gridData[cellIdx];
            if (v > -9000) demZ = v;
        }
        samples.push({ station: s, demZ, cellIdx });
    }

    // Project survey points — keep those within 200 m of the polyline
    const surveyDots = bathyStore.surveyPoints
        .map(pt => {
            const { station, dist } = projectOntoPolyline(pt.x, pt.y, polyline, cumLens);
            return { station, dist, z: pt.z };
        })
        .filter(d => d.dist < 200)
        .sort((a, b) => a.station - b.station);

    return { samples, totalLen, surveyDots };
});

// ── Zone lookup ────────────────────────────────────────────────────────────

const zoneMap = computed(() => {
    const zone = rasterStore.zones.find(z => z.id === bathyStore.BATHY_ZONE_ID);
    if (!zone?.indices?.length) return null;
    const map = new Map();
    for (let i = 0; i < zone.indices.length; i++) {
        map.set(zone.indices[i], zone.zValues[i]);
    }
    return map;
});

// ── Scale ──────────────────────────────────────────────────────────────────

const scale = computed(() => {
    const cd = coreData.value;
    if (!cd) return null;
    const zm = zoneMap.value;
    let zMin = Infinity, zMax = -Infinity;

    for (const s of cd.samples) {
        if (s.demZ !== null) {
            if (s.demZ < zMin) zMin = s.demZ;
            if (s.demZ > zMax) zMax = s.demZ;
        }
        if (zm && s.cellIdx >= 0) {
            const z = zm.get(s.cellIdx);
            if (z !== undefined) {
                if (z < zMin) zMin = z;
                if (z > zMax) zMax = z;
            }
        }
    }
    for (const d of cd.surveyDots) {
        if (d.z < zMin) zMin = d.z;
        if (d.z > zMax) zMax = d.z;
    }
    if (!isFinite(zMin)) return null;
    const pad = Math.max((zMax - zMin) * 0.12, 0.1);
    return { zMin: zMin - pad, zMax: zMax + pad, sTotal: cd.totalLen };
});

// ── Ticks ──────────────────────────────────────────────────────────────────

function niceStep(rough) {
    const mag = Math.pow(10, Math.floor(Math.log10(rough)));
    const f   = rough / mag;
    return (f <= 1.5 ? 1 : f <= 3 ? 2 : f <= 7 ? 5 : 10) * mag;
}

const yTicks = computed(() => {
    const sc = scale.value;
    if (!sc) return [];
    const step  = niceStep((sc.zMax - sc.zMin) / 4);
    const first = Math.ceil(sc.zMin / step) * step;
    const ticks = [];
    for (let t = first; t <= sc.zMax + 1e-9; t += step) ticks.push(+(+t.toFixed(6)));
    return ticks;
});

const xTicks = computed(() => {
    const sc = scale.value;
    if (!sc) return [];
    const step  = niceStep(sc.sTotal / 4);
    const ticks = [];
    for (let t = 0; t <= sc.sTotal + 1e-9; t += step) ticks.push(+(+t.toFixed(2)));
    return ticks;
});

// ── SVG helpers ────────────────────────────────────────────────────────────

const ready = computed(() => !!scale.value);

function sToX(s) {
    const sc = scale.value;
    return ML + (s / sc.sTotal) * PW;
}
function zToY(z) {
    const sc = scale.value;
    return MT + PH - ((z - sc.zMin) / (sc.zMax - sc.zMin)) * PH;
}

// ── SVG paths ──────────────────────────────────────────────────────────────

const demPath = computed(() => {
    const cd = coreData.value;
    if (!cd || !scale.value) return '';
    let d = '', gap = true;
    for (const s of cd.samples) {
        if (s.demZ === null) { gap = true; continue; }
        const x = sToX(s.station).toFixed(1), y = zToY(s.demZ).toFixed(1);
        d  += gap ? `M ${x},${y}` : ` L ${x},${y}`;
        gap = false;
    }
    return d;
});

const zonePath = computed(() => {
    const cd = coreData.value;
    const zm = zoneMap.value;
    if (!cd || !zm || !scale.value) return '';
    let d = '', gap = true;
    for (const s of cd.samples) {
        if (s.cellIdx < 0) { gap = true; continue; }
        const z = zm.get(s.cellIdx);
        if (z === undefined) { gap = true; continue; }
        const x = sToX(s.station).toFixed(1), y = zToY(z).toFixed(1);
        d  += gap ? `M ${x},${y}` : ` L ${x},${y}`;
        gap = false;
    }
    return d;
});

const surveyDots = computed(() => coreData.value?.surveyDots ?? []);
</script>

<style scoped>
.laengs-svg {
    width: 100%;
    display: block;
    background: #12121a;
    border-radius: 5px;
    border: 1px solid #3a2f5c;
}
.laengs-empty {
    font-size: 0.74rem;
    color: #9a9ab5;
    padding: 0.25rem 0;
}
</style>
