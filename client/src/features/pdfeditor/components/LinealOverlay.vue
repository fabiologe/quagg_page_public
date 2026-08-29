<template>
  <div ref="rootEl" class="pdfed-lineal-anker">
    <div
      class="pdfed-lineal"
      :style="{
        left: lineal.x * zoom + 'px',
        top: lineal.y * zoom + 'px',
        width: laengePx + 'px',
        transform: `translate(-50%, 0) rotate(${lineal.winkelGrad}deg)`,
      }"
      @pointerdown.stop="starteKoerperZug"
      @pointermove="bewege"
      @pointerup="beende"
      @pointercancel="beende"
    >
      <svg class="pdfed-lineal-skala" :width="laengePx" height="46">
        <line :x1="0" :y1="1" :x2="laengePx" :y2="1" class="pdfed-lineal-kante" />
        <g v-for="t in ticks" :key="t.n">
          <line :x1="t.x" y1="1" :x2="t.x" :y2="t.gross ? 14 : 8" class="pdfed-lineal-tick" />
          <text v-if="t.gross" :x="t.x" y="26" class="pdfed-lineal-wert">{{ t.label }}</text>
        </g>
      </svg>

      <div
        class="pdfed-lineal-badge"
        :style="{ transform: `translateX(-50%) rotate(${-(lineal.winkelGrad + viewStore.drehung)}deg)` }"
      >
        {{ winkelText }} · Raster {{ rasterText }}
      </div>

      <button
        class="pdfed-lineal-griff ist-links"
        title="Lineal drehen"
        @pointerdown.stop="starteRotation($event)"
        @pointermove="bewege"
        @pointerup="beende"
        @pointercancel="beende"
      ></button>
      <button
        class="pdfed-lineal-griff ist-rechts"
        title="Lineal drehen"
        @pointerdown.stop="starteRotation($event)"
        @pointermove="bewege"
        @pointerup="beende"
        @pointercancel="beende"
      ></button>
      <button
        class="pdfed-btn pdfed-lineal-schliessen"
        title="Lineal ausblenden"
        @pointerdown.stop
        @click="toolStore.lineal = null"
      >
        <PdfIcon name="schliessen" :size="14" />
      </button>
    </div>
  </div>
</template>

<script setup>
/**
 * LinealOverlay — das maßstabsgetreue Lineal einer Seite (OneNote-Muster).
 *
 * Die Zeichenkante ist die OBERKANTE des Balkens; usePointerTools projiziert
 * Stift-/Markerstriche, die nahe der Kante ansetzen, auf diese Gerade.
 * Skalenstriche kommen aus der Seiten-Kalibrierung (LinealMath.tickSchritt):
 * bei 1:100 ist der 1-m-Tick exakt 10 mm Papier; unkalibriert Papier-cm.
 *
 * Gesten: 1 Zeiger auf dem Balken = verschieben; 2 Zeiger = drehen +
 * verschieben (OneNote-Geste); Endgriffe = drehen um den Anker. Rotation
 * rastet magnetisch bei den Konstruktionswinkeln (LinealMath.rasteWinkel).
 */
import { ref, computed } from 'vue';
import PdfIcon from './PdfIcon.vue';
import { useToolStore } from '../stores/useToolStore';
import { useViewStore } from '../stores/useViewStore';
import { useDocStore } from '../stores/useDocStore';
import { kalibrierungFuerSeite } from '../services/MeasureMath';
import { tickSchritt, rasteWinkel } from '../services/LinealMath';
import { drehDelta, vonSeitenPunkt } from '../services/AnsichtRotation';

const props = defineProps({
  index:    { type: Number, required: true },
  zoom:     { type: Number, required: true },
  breitePt: { type: Number, required: true },
  hoehePt:  { type: Number, required: true },
});

const toolStore = useToolStore();
const viewStore = useViewStore();
const docStore = useDocStore();
const rootEl = ref(null);

const lineal = computed(() => toolStore.lineal);

const laengePx = computed(() =>
  Math.hypot(props.breitePt, props.hoehePt) * 1.2 * props.zoom);

// ── Skala ────────────────────────────────────────────────────────────────────

const kal = computed(() =>
  kalibrierungFuerSeite(docStore.meta?.kalibrierung, props.index));

const schritt = computed(() => tickSchritt(kal.value, props.zoom));

const DE = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });

const ticks = computed(() => {
  const abstandPx = schritt.value.laengePt * props.zoom;
  if (!(abstandPx > 4)) return [];
  const mitte = laengePx.value / 2;
  const liste = [];
  const maxN = Math.ceil(mitte / abstandPx);
  for (let n = -maxN; n <= maxN; n++) {
    const x = mitte + n * abstandPx;
    if (x < 0 || x > laengePx.value) continue;
    liste.push({ n, x, gross: true, label: DE.format(Math.abs(n) * schritt.value.wert) });
    // Zwischentick auf halbem Weg, wenn Platz ist
    const halbX = x + abstandPx / 2;
    if (abstandPx >= 56 && halbX <= laengePx.value) {
      liste.push({ n: n + 0.5, x: halbX, gross: false });
    }
  }
  return liste;
});

const winkelText = computed(() => {
  const norm = ((lineal.value.winkelGrad % 180) + 180) % 180;
  return `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 }).format(norm)}°`;
});

const rasterText = computed(() =>
  schritt.value.einheit === 'm'
    ? `${DE.format(schritt.value.wert)} m`
    : `${DE.format(schritt.value.wert)} cm (Papier, unkalibriert)`);

// ── Gesten ───────────────────────────────────────────────────────────────────

const zeiger = new Map();   // pointerId → { x, y } (Client-Koordinaten)
let zug = null;             // { art: 'koerper'|'rotation', start: {...} }

/**
 * Ankerpunkt in Client-Koordinaten. Der Anker-Container steckt im gedrehten
 * Seitenstapel — sein Rect IST die Anzeigebox, der Ankerpunkt muss also
 * erst in die Box gedreht werden.
 */
function _ankerClient() {
  const r = rootEl.value.getBoundingClientRect();
  const [lx, ly] = vonSeitenPunkt(
    lineal.value.x, lineal.value.y, viewStore.drehung, props.breitePt, props.hoehePt);
  return { x: r.left + lx * props.zoom, y: r.top + ly * props.zoom };
}

/** Zieh-Delta (Client-px) → Seitenraum-Delta in Punkten. */
function _dPt(dxPx, dyPx) {
  return drehDelta(dxPx / props.zoom, dyPx / props.zoom, viewStore.drehung);
}

function starteKoerperZug(ev) {
  if (ev.button === 2) return;
  ev.currentTarget.setPointerCapture(ev.pointerId);
  zeiger.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  zug = {
    art: 'koerper',
    x0: lineal.value.x, y0: lineal.value.y, winkel0: lineal.value.winkelGrad,
    punkte0: new Map(zeiger),
  };
}

function starteRotation(ev) {
  ev.currentTarget.setPointerCapture(ev.pointerId);
  zeiger.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  zug = { art: 'rotation', pointerId: ev.pointerId };
}

function bewege(ev) {
  if (!zug || !zeiger.has(ev.pointerId)) return;
  zeiger.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });

  if (zug.art === 'rotation') {
    const anker = _ankerClient();
    const p = zeiger.get(ev.pointerId);
    // Bildschirm-y wächst nach unten → atan2 liefert direkt den
    // Uhrzeiger-positiven Winkel unserer Konvention.
    // Der Winkel lebt im SEITENRAUM: die Ansichtsdrehung herausrechnen.
    const grad = (Math.atan2(p.y - anker.y, p.x - anker.x) * 180) / Math.PI;
    lineal.value.winkelGrad = rasteWinkel(grad - viewStore.drehung);
    return;
  }

  // Körper: 1 Zeiger = verschieben, 2 Zeiger = drehen + verschieben
  const start = [...zug.punkte0.entries()].filter(([id]) => zeiger.has(id));
  if (start.length >= 2) {
    const [idA, a0] = start[0], [idB, b0] = start[1];
    const a1 = zeiger.get(idA), b1 = zeiger.get(idB);
    const w0 = Math.atan2(b0.y - a0.y, b0.x - a0.x);
    const w1 = Math.atan2(b1.y - a1.y, b1.x - a1.x);
    lineal.value.winkelGrad = rasteWinkel(zug.winkel0 + ((w1 - w0) * 180) / Math.PI);
    const mid0 = { x: (a0.x + b0.x) / 2, y: (a0.y + b0.y) / 2 };
    const mid1 = { x: (a1.x + b1.x) / 2, y: (a1.y + b1.y) / 2 };
    const [dx, dy] = _dPt(mid1.x - mid0.x, mid1.y - mid0.y);
    lineal.value.x = zug.x0 + dx;
    lineal.value.y = zug.y0 + dy;
  } else if (start.length === 1) {
    const [id, p0] = start[0];
    const p1 = zeiger.get(id);
    const [dx, dy] = _dPt(p1.x - p0.x, p1.y - p0.y);
    lineal.value.x = zug.x0 + dx;
    lineal.value.y = zug.y0 + dy;
  }
}

function beende(ev) {
  zeiger.delete(ev.pointerId);
  if (zeiger.size === 0) zug = null;
}
</script>

<style scoped>
.pdfed-lineal-anker {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.pdfed-lineal {
  position: absolute;
  height: 46px;
  transform-origin: 50% 0;
  background: color-mix(in srgb, var(--pdf-flaeche) 82%, transparent);
  border: 1px solid var(--pdf-rand-stark);
  border-top: 2px solid var(--pdf-akzent);
  border-radius: 0 0 8px 8px;
  box-shadow: var(--pdf-schatten);
  backdrop-filter: blur(2px);
  pointer-events: auto;
  touch-action: none;
  cursor: move;
}
.pdfed-lineal-skala {
  display: block;
  position: absolute;
  inset: 0;
}
.pdfed-lineal-kante { stroke: transparent; }
.pdfed-lineal-tick {
  stroke: var(--pdf-text);
  stroke-width: 1;
}
.pdfed-lineal-wert {
  fill: var(--pdf-text-dim);
  font-size: 10px;
  font-family: var(--pdf-schrift);
  text-anchor: middle;
}
.pdfed-lineal-badge {
  position: absolute;
  left: 50%;
  bottom: 3px;
  transform: translateX(-50%);
  padding: 1px 8px;
  border-radius: 8px;
  background: var(--pdf-akzent-weich);
  color: var(--pdf-akzent);
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  pointer-events: none;
}
.pdfed-lineal-griff {
  position: absolute;
  top: 50%;
  width: 26px;
  height: 26px;
  padding: 0;
  transform: translateY(-50%);
  border: 2px solid var(--pdf-akzent);
  border-radius: 50%;
  background: var(--pdf-flaeche);
  cursor: grab;
  touch-action: none;
}
.pdfed-lineal-griff.ist-links { left: -13px; }
.pdfed-lineal-griff.ist-rechts { right: -13px; }
.pdfed-lineal-griff:active { cursor: grabbing; }
.pdfed-lineal-schliessen {
  position: absolute;
  right: 20px;
  top: 50%;
  transform: translateY(-50%);
  min-height: 28px;
  min-width: 28px;
  padding: 0;
  color: var(--pdf-text-dim);
}
</style>
