<template>
  <div class="plan-host" ref="hostRef">
    <canvas
      ref="cvRef"
      class="plan-canvas"
      :class="{ greift: greift }"
      @pointerdown="onZeigerAb"
      @pointermove="onZeigerBewegt"
      @pointerup="onZeigerAuf"
      @pointercancel="onZeigerAuf"
      @wheel.prevent="onRad"
      @dblclick="passendEinstellen"
    ></canvas>

    <!-- Bildschirmfeste Anzeigen. Maßstabsleiste, Nordpfeil und Wasserzeichen
         gehören NICHT hierher — die stehen auf dem Blatt und wandern mit. -->
    <div class="plan-hud">
      <div class="hud-gruppe">
        <button class="hud-btn" title="Maßstab vergröbern" @click="massstabSchrittSetzen(1)">−</button>
        <span class="hud-wert" title="Zeichnungsmaßstab (geht ins PDF)">1 : {{ ansicht.massstab }}</span>
        <button class="hud-btn" title="Maßstab verfeinern" @click="massstabSchrittSetzen(-1)">+</button>
      </div>
      <div class="hud-gruppe">
        <span class="hud-wert dim" title="Bildschirmlupe — ändert den Plan nicht">
          {{ Math.round(ansicht.pxProMm * 100 / grundZoom) }} %
        </span>
        <button class="hud-btn" title="Blatt einpassen (Doppelklick im Plan)" @click="passendEinstellen">
          <CdeIcon name="fit" :size="13" />
        </button>
      </div>
      <span v-if="rechnet" class="hud-status">
        <CdeIcon name="refresh" :size="12" class="dreht" /> Plan wird aufgebaut…
      </span>
    </div>

    <div v-if="ersterAufbau" class="plan-schleier">
      <CdeIcon name="refresh" :size="22" class="dreht" />
      <span>Planinhalte werden gesammelt…</span>
      <small>Umrisse, Gelände und Achsen werden einmal berechnet und dann wiederverwendet.</small>
    </div>
  </div>
</template>

<script setup>
/**
 * Der Lageplan am Bildschirm (Sprint P, AP-7).
 *
 * Gezeichnet wird durch `drawVectorPlan` — dieselbe Routine, die das PDF
 * schreibt — über den `CanvasDoc`-Adapter. Was hier steht, IST der Plan; die
 * Vorschau ist keine Nachbildung mehr, sondern das Ergebnis selbst.
 *
 * Zwei Regler, die man nicht verwechseln darf:
 *   Maßstab   — was aufs Blatt passt, steht im Schriftfeld, geht ins PDF
 *   pxProMm   — Bildschirmlupe, ändert am Plan nichts
 *
 * Neu gezeichnet wird ANGESTOSSEN, nicht geschleift: ein `watch` auf den
 * Ansichtszustand und den Stand des Inhalts-Caches, beim Schwenken über
 * requestAnimationFrame gedrosselt. Die alte Export-Vorschau hielt zwei
 * Dauerschleifen am Leben (150-ms-Snapshot und 30-fps-Übersicht) — auch dann,
 * wenn sich nichts bewegte.
 */
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import CdeIcon from './ui/CdeIcon.vue';
import { useViewerApi } from '../composables/viewerApi.js';
import { useAnsicht } from '../stores/useAnsicht.js';
import { useIfcStore } from '../stores/useIfcStore.js';
import { erstelleCanvasDoc } from '../services/CanvasDoc.js';
import { drawVectorPlan } from '../services/IfcVectorPlotter.js';
import { styleToLegacy } from '../services/VectorStyleEngine.js';
import { _drawTitleBlock, _drawWatermark } from '../services/IfcPdfExporter.js';
import { erstellePlanInhalt } from '../services/PlanContent.js';
import {
  RAND_MM, massstabSchritt, begrenzeMitte, zentriereAufBounds,
  passendenMassstab, zoomFuerBlatt,
} from '../services/PlanViewport.js';

const props = defineProps({
  /** Zeichen- und Beschriftungsoptionen aus dem Plan-Panel. */
  optionen: { type: Object, default: () => ({}) },
  /** Schriftfeld-Inhalte. */
  titleBlock: { type: Object, default: () => ({}) },
  logo: { type: String, default: null },
});

const api = useViewerApi();
const ansicht = useAnsicht();
const ifc = useIfcStore();

const hostRef = ref(null);
const cvRef = ref(null);
const rechnet = ref(false);
const ersterAufbau = ref(false);
const greift = ref(false);

let inhalt = null;          // PlanContent-Instanz
let letzterInhalt = null;
let ro = null;
let rafId = 0;
let bereichPx = { w: 0, h: 0 };

/** Zoomstufe, bei der genau ein Blatt in den Bereich passt (= 100 %). */
const grundZoom = computed(() =>
  zoomFuerBlatt(bereichPx, ansicht.format, ansicht.ausrichtung) || 1);

// ── Inhalte holen ───────────────────────────────────────────────────────────

function sammelOptionen() {
  const o = props.optionen ?? {};
  return {
    scaleRatio: ansicht.massstab,
    viewDir: 'top',
    slopeHatch: o.slopeHatch ?? null,
    contours: o.contours ?? null,
    axisLabels: o.axisLabels ?? null,
    hatch: !!o.hatch,
    footprints: o.footprints !== false,
    rules: o.rules ?? [],
    labelTemplateFor: o.labelTemplateFor ?? null,
    styleMap: o.styleMap ?? null,
  };
}

async function inhalteHolen() {
  if (!inhalt) inhalt = erstellePlanInhalt(api);
  const erstmals = letzterInhalt === null;
  rechnet.value = true;
  if (erstmals) ersterAufbau.value = true;
  try {
    letzterInhalt = await inhalt.hole(sammelOptionen());
  } catch (e) {
    console.error('[PlanCanvas] Inhalte konnten nicht gesammelt werden', e);
  } finally {
    rechnet.value = false;
    ersterAufbau.value = false;
  }
  zeichne();
}

// ── Zeichnen ────────────────────────────────────────────────────────────────

function zeichne() {
  const cv = cvRef.value;
  const ctx = cv?.getContext('2d');
  if (!ctx || !bereichPx.w) return;

  const dpr = window.devicePixelRatio || 1;
  const bw = Math.round(bereichPx.w * dpr);
  const bh = Math.round(bereichPx.h * dpr);
  if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; }

  const { dw, dh, blattW, blattH } = ansicht.flaeche;
  const px = ansicht.pxProMm;

  // Blatt mittig in den verfügbaren Bereich legen
  const versatzX = (bereichPx.w - blattW * px) / 2;
  const versatzY = (bereichPx.h - blattH * px) / 2;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, bereichPx.w, bereichPx.h);
  ctx.setTransform(dpr, 0, 0, dpr, versatzX * dpr, versatzY * dpr);

  const doc = erstelleCanvasDoc(ctx, { pxProMm: px });

  // Blatt
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, blattW, blattH, 'F');

  const o = props.optionen ?? {};
  if (o.watermark) _drawWatermark(doc, o.watermark, RAND_MM, dw, dh);

  if (letzterInhalt) {
    drawVectorPlan(doc, ansicht.frustum, RAND_MM, dw, dh, {
      ...letzterInhalt,
      slopeHatch: letzterInhalt.slopeSegments,
      contours: letzterInhalt.contourLevels,
      axisLabels: letzterInhalt.axisItems,
      styleMap: o.styleMap,
      styleMapPerModel: o.styleMapPerModel,
      // Muss gesetzt sein, sonst greifen die Stilregeln des Nutzers am
      // Bildschirm nicht, im PDF aber schon — genau die Art von Abweichung,
      // die dieser Umbau abstellen soll.
      styleToLegacy: o.styleToLegacy ?? styleToLegacy,
      showLabels: o.showLabels !== false,
      labelOpts: o.labelOpts,
      ifcGridAxes: o.ifcGridAxes ?? api.getIfcGridAxes?.() ?? null,
      annotations: o.annotations ?? [],
      measurements: o.measurements ?? [],
      utmGrid: o.utmGrid,
      northAngle: o.northAngle ?? 0,
      scaleBar: o.scaleBar !== false,
      scaleRatio: ansicht.massstab,
    });
  }

  _drawTitleBlock(doc, dw, dh, props.titleBlock ?? {}, props.logo);
  doc.beende();

  // Blattkante — der einzige Strich, den es im PDF nicht gibt: er trennt das
  // Blatt vom Arbeitshintergrund und gehört deshalb nicht in die Zeichnung.
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(versatzX - 0.5, versatzY - 0.5, blattW * px + 1, blattH * px + 1);
}

/** Neuzeichnen auf den nächsten Bildaufbau legen (Schwenken, Zoomen). */
function baldZeichnen() {
  if (rafId) return;
  rafId = requestAnimationFrame(() => { rafId = 0; zeichne(); });
}

// ── Bedienung ───────────────────────────────────────────────────────────────

let zieht = false;
let zugStart = { x: 0, y: 0, mx: 0, mz: 0 };

function onZeigerAb(ev) {
  zieht = true;
  greift.value = true;
  cvRef.value?.setPointerCapture?.(ev.pointerId);
  zugStart = { x: ev.clientX, y: ev.clientY, mx: ansicht.mitte.x, mz: ansicht.mitte.z };
}

function onZeigerBewegt(ev) {
  if (!zieht) return;
  // Pixel → Papier-mm → Weltmeter. Der Plan folgt der Hand, also gegenläufig
  // zur Blattmitte.
  const proMeter = ansicht.pxProMm * 1000 / ansicht.massstab;
  const dx = (ev.clientX - zugStart.x) / proMeter;
  const dz = (ev.clientY - zugStart.y) / proMeter;
  ansicht.setzeMitte(begrenzeMitte(
    { x: zugStart.mx - dx, z: zugStart.mz - dz },
    api.getModelBoundsXZ?.() ?? null,
    ansicht.halb,
  ));
  baldZeichnen();
}

function onZeigerAuf(ev) {
  zieht = false;
  greift.value = false;
  cvRef.value?.releasePointerCapture?.(ev.pointerId);
}

function onRad(ev) {
  if (ev.ctrlKey) {
    // Strg + Rad wechselt die Maßstabssprosse (verändert den Plan)
    massstabSchrittSetzen(ev.deltaY > 0 ? 1 : -1);
    return;
  }
  ansicht.setzeZoom(ansicht.pxProMm * (ev.deltaY > 0 ? 0.88 : 1 / 0.88));
  baldZeichnen();
}

function massstabSchrittSetzen(richtung) {
  const neu = massstabSchritt(ansicht.massstab, richtung);
  if (neu === ansicht.massstab) return;
  ansicht.setzeMassstab(neu);
}

/** Blattlage und Maßstab so setzen, dass das Modell hineinpasst. */
function passendEinstellen() {
  const b = api.getModelBoundsXZ?.();
  const { dw, dh } = ansicht.flaeche;
  if (b) {
    ansicht.setzeMitte(zentriereAufBounds(b));
    ansicht.setzeMassstab(passendenMassstab({ bounds: b, dw, dh }));
  }
  ansicht.setzeZoom(grundZoom.value);
  baldZeichnen();
}

// ── Anschluss ───────────────────────────────────────────────────────────────

function bereichMessen() {
  const el = hostRef.value;
  if (!el) return;
  bereichPx = { w: el.clientWidth, h: el.clientHeight };
}

onMounted(async () => {
  bereichMessen();
  ro = new ResizeObserver(() => { bereichMessen(); baldZeichnen(); });
  if (hostRef.value) ro.observe(hostRef.value);

  await nextTick();
  // Beim ersten Öffnen auf das Modell einpassen, sonst schaut man auf den
  // Ursprung — der bei georeferenzierten Modellen Kilometer entfernt liegt.
  passendEinstellen();
  await inhalteHolen();
});

onBeforeUnmount(() => {
  ro?.disconnect();
  if (rafId) cancelAnimationFrame(rafId);
});

// Inhalte neu sammeln, wenn sich Maßstab oder Zeichenoptionen ändern.
watch(() => [ansicht.massstab, JSON.stringify(props.optionen ?? {})], inhalteHolen);

// Reines Neuzeichnen: Blattwechsel, Schwenken, Lupe, Schriftfeld.
watch(() => [
  ansicht.format, ansicht.ausrichtung, ansicht.pxProMm,
  ansicht.mitte.x, ansicht.mitte.z, JSON.stringify(props.titleBlock ?? {}), props.logo,
], baldZeichnen);

// Modellwechsel entwertet alles.
watch(() => ifc.modelList?.length, () => {
  inhalt?.entwerte('modell');
  letzterInhalt = null;
  passendEinstellen();
  inhalteHolen();
});

defineExpose({
  /** Der Export nimmt exakt das Frustum, das gerade auf dem Schirm steht. */
  frustum: () => ansicht.frustum,
  neuAufbauen: (grund = 'alles') => { inhalt?.entwerte(grund); return inhalteHolen(); },
  passendEinstellen,
});
</script>

<style scoped>
.plan-host {
  position: absolute; inset: 0;
  overflow: hidden;
  background: var(--cde-bg-alt);
  /* Karierter Arbeitshintergrund — das weiße Blatt soll sich abheben */
  background-image:
    linear-gradient(45deg, var(--cde-fill) 25%, transparent 25%),
    linear-gradient(-45deg, var(--cde-fill) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, var(--cde-fill) 75%),
    linear-gradient(-45deg, transparent 75%, var(--cde-fill) 75%);
  background-size: 16px 16px;
  background-position: 0 0, 0 8px, 8px -8px, -8px 0;
}

.plan-canvas { position: absolute; inset: 0; width: 100%; height: 100%; cursor: grab; }
.plan-canvas.greift { cursor: grabbing; }

.plan-hud {
  position: absolute; left: 12px; bottom: 12px;
  display: flex; align-items: center; gap: 8px;
  pointer-events: none;
}
.hud-gruppe {
  display: flex; align-items: center; gap: 2px;
  padding: 2px;
  background: var(--cde-surface);
  border: 1px solid var(--cde-line);
  border-radius: var(--cde-radius);
  box-shadow: var(--cde-shadow-sm);
  pointer-events: auto;
}
.hud-btn {
  display: flex; align-items: center; justify-content: center;
  min-width: 22px; height: 22px;
  background: none; border: none; border-radius: var(--cde-radius-sm);
  color: var(--cde-text-dim); cursor: pointer;
  font-size: var(--cde-font-sm);
}
.hud-btn:hover { background: var(--cde-fill-hover); color: var(--cde-accent); }
.hud-wert {
  padding: 0 6px;
  font-size: var(--cde-font-xs); color: var(--cde-text);
  font-variant-numeric: tabular-nums; white-space: nowrap;
}
.hud-wert.dim { color: var(--cde-text-dim); }

.hud-status {
  display: flex; align-items: center; gap: 4px;
  padding: 3px 8px;
  background: var(--cde-surface);
  border: 1px solid var(--cde-line);
  border-radius: var(--cde-radius);
  font-size: var(--cde-font-xs); color: var(--cde-text-dim);
  pointer-events: auto;
}

.plan-schleier {
  position: absolute; inset: 0;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
  background: color-mix(in srgb, var(--cde-bg) 82%, transparent);
  color: var(--cde-text); font-size: var(--cde-font-sm);
  text-align: center;
}
.plan-schleier small { color: var(--cde-text-dim); font-size: var(--cde-font-xs); max-width: 320px; }

.dreht { animation: dreh 1.1s linear infinite; }
@keyframes dreh { to { transform: rotate(360deg); } }
</style>
