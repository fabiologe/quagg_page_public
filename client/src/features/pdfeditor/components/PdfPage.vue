<template>
  <div
    class="pdfed-seite"
    :style="{
      top: top + 'px', left: left + 'px',
      width: cssBreite + 'px', height: cssHoehe + 'px',
    }"
  >
    <!-- Der gesamte Seitenstapel bleibt UNROTIERT (alle Schichten rechnen
         weiter in Seitenpunkten); nur dieser Rahmen dreht ihn in die
         Anzeigebox. Zeiger werden in usePointerTools zurückgerechnet. -->
    <div
      class="pdfed-seite-inhalt"
      :style="{
        width: stapelBreite + 'px', height: stapelHoehe + 'px',
        transform: inhaltTransformCss || undefined,
      }"
    >
    <!-- Bitmap nur für lebendige Seiten — rausgescrollte geben ihren
         Canvas-Speicher frei (Tablet!). CSS streckt die letzte Render-
         Auflösung, bis der scharfe Nachrender kommt. -->
    <canvas v-if="lebendig" ref="canvasEl" class="pdfed-seite-canvas"></canvas>
    <!-- Schärfe-Kachel: der sichtbare Ausschnitt in voller Zielskala,
         passgenau über dem (gedeckelten) Basisbild. Position in
         Seitenkoordinaten → scrollt und zoomt lagerichtig mit. -->
    <canvas
      v-if="lebendig && kachelInfo"
      ref="kachelEl"
      class="pdfed-kachel"
      :style="{
        left: kachelInfo.xPt * stapelZoom + 'px',
        top: kachelInfo.yPt * stapelZoom + 'px',
        width: kachelInfo.bPt * stapelZoom + 'px',
        height: kachelInfo.hPt * stapelZoom + 'px',
      }"
    ></canvas>
    <AnnotCanvas
      v-if="lebendig"
      :index="index"
      :breite-pt="breitePt"
      :hoehe-pt="hoehePt"
      :render-zoom="renderZoom"
    />
    <PdfTextLayer
      v-if="lebendig"
      :index="index"
      :zoom="stapelZoom"
      :breite-pt="breitePt"
    />
    <PageOverlay
      v-if="lebendig"
      :index="index"
      :zoom="stapelZoom"
      :breite-pt="breitePt"
      :hoehe-pt="hoehePt"
    />
    </div>
    <div v-if="!lebendig" class="pdfed-seite-platzhalter">{{ index + 1 }}</div>
  </div>
</template>

<script setup>
/**
 * PdfPage — eine Seite: pdf.js-Canvas heute, ab Stufe 2 kommen TextLayer,
 * Annotations-Canvas und HTML-Overlay als weitere Schichten dazu.
 *
 * Render-Auflösung: `renderZoom` (der beruhigte Zoom) × devicePixelRatio,
 * gedeckelt so, dass die Canvas-Fläche unter ~16 Mio Pixeln bleibt —
 * darüber verweigern mobile Browser das Canvas stillschweigend.
 */
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import AnnotCanvas from './AnnotCanvas.vue';
import PageOverlay from './PageOverlay.vue';
import PdfTextLayer from './PdfTextLayer.vue';
import { useDocStore } from '../stores/useDocStore';
import { RenderingCancelledException, renderScaleFuer } from '../services/PdfEngine';
import { istSchwer, merkeRenderZeit, SCHWER_MS } from '../services/RenderProfil';
import { hole, lege, skalaPasst } from '../services/SeitenBitmapCache';
import { berechneKachel, kachelDeckt, kachelNoetig } from '../services/SchaerfeKachel';
import { useViewStore } from '../stores/useViewStore';
import { inhaltTransform, zuSeitenRect } from '../services/AnsichtRotation';

const props = defineProps({
  index:      { type: Number, required: true },
  top:        { type: Number, required: true },
  left:       { type: Number, required: true },
  cssBreite:  { type: Number, required: true },
  cssHoehe:   { type: Number, required: true },
  breitePt:   { type: Number, required: true },
  hoehePt:    { type: Number, required: true },
  lebendig:   { type: Boolean, default: false },
  renderZoom: { type: Number, required: true },
  sichtfenster: { type: Object, default: null },   // { x, y, b, h } in Host-px
});

const docStore = useDocStore();
const viewStore = useViewStore();
const canvasEl = ref(null);
const kachelEl = ref(null);
const kachelInfo = ref(null);   // { xPt, yPt, bPt, hPt, skala } | null

// ── Ansichtsdrehung ─────────────────────────────────────────────────────────
// ACHTUNG: `cssBreite`/`cssHoehe` sind die Maße der ANZEIGEBOX — der Scroller
// hat den Tausch für Layout und Virtualisierung schon vorgenommen. Hier läuft
// deshalb die GEGENRICHTUNG: Box → unrotierter Stapel (sonst tauscht man
// zweimal und quetscht die Seite ins falsche Seitenverhältnis).
const stapelBreite = computed(() =>
  viewStore.drehung % 180 === 0 ? props.cssBreite : props.cssHoehe);
const stapelHoehe = computed(() =>
  viewStore.drehung % 180 === 0 ? props.cssHoehe : props.cssBreite);
/** CSS-px je Seitenpunkt — immer am UNROTIERTEN Stapel gemessen. */
const stapelZoom = computed(() => stapelBreite.value / props.breitePt);
const inhaltTransformCss = computed(() =>
  inhaltTransform(viewStore.drehung, stapelBreite.value, stapelHoehe.value));

// ── Render-Pipeline (Stufe 11: CAD-Vektor-Performance) ──────────────────────
// Leichte Seiten (Text/Scan): EIN direkter Pass, unverändert scharf.
// Schwere Seiten (gemessen > SCHWER_MS): sofort billiger Vorschau-Pass,
// voller Pass erst nach Ruhe und auf ein Offscreen-Canvas (kein Weißblitz);
// beim Entleiben wandert das teure Ergebnis als ImageBitmap in den Cache.

let laufendeTask = null;
let renderNr = 0;
let ruheTimer = 0;
let letzterPass = null;   // { dokId, skala, ms } des letzten VOLLEN Passes
// Liegt auf dem sichtbaren Canvas schon ein brauchbares Bild? Dann ersetzt
// das CSS-gestreckte Altbild den Vorschau-Pass — die Messung zeigte, dass
// bei pfad-dominierten CAD-Seiten die Auflösung kaum Renderzeit spart
// (Operator-Ausführung dominiert), der Vorschau-Pass also nur dann lohnt,
// wenn es GAR NICHTS zu strecken gibt.
let hatBild = false;

function _brichLaufendeAb() {
  if (laufendeTask) { try { laufendeTask.cancel(); } catch { /* */ } laufendeTask = null; }
  clearTimeout(ruheTimer);
}

function _ruhe(ms) {
  return new Promise(r => { ruheTimer = setTimeout(r, ms); });
}

/**
 * Ein Render-Pass. `aufOffscreen`: erst fertig rastern, dann in einem Zug
 * aufs sichtbare Canvas — Pflicht, wenn dort schon ein brauchbares Bild
 * liegt (Vorschau/Cache), das nicht weiß weggeblitzt werden darf.
 */
async function _passe(seite, skala, nr, vollerPass, aufOffscreen = false) {
  const dok = docStore.pdfDok;
  if (!dok || nr !== renderNr || !canvasEl.value) return false;
  const viewport = seite.getViewport({ scale: skala });
  const ziel = aufOffscreen ? document.createElement('canvas') : canvasEl.value;
  ziel.width = Math.floor(viewport.width);
  ziel.height = Math.floor(viewport.height);

  const task = seite.render({
    canvasContext: ziel.getContext('2d', { alpha: false }),
    viewport,
    // PDF-Layer (OCGs): dieselbe mutierbare Config wie das Layer-Panel.
    ...(dok.ocgConfig ? { optionalContentConfigPromise: Promise.resolve(dok.ocgConfig) } : {}),
  });
  laufendeTask = task;
  const t0 = performance.now();
  try {
    await task.promise;
  } catch (e) {
    if (!(e instanceof RenderingCancelledException)) {
      console.error(`PDF-Seite ${props.index + 1} ließ sich nicht rendern:`, e);
    }
    return false;
  } finally {
    if (laufendeTask === task) laufendeTask = null;
  }
  const ms = performance.now() - t0;
  merkeRenderZeit(docStore.dokId, props.index, ms, skala, vollerPass);
  if (import.meta.env.DEV) {
    console.debug(`[pdfed] Seite ${props.index + 1}: ${vollerPass ? 'voll' : 'vorschau'} ${Math.round(ms)} ms @${skala.toFixed(2)}`);
  }
  if (aufOffscreen) {
    const sichtbar = canvasEl.value;
    if (nr !== renderNr || !sichtbar) return false;
    sichtbar.width = ziel.width;
    sichtbar.height = ziel.height;
    sichtbar.getContext('2d', { alpha: false }).drawImage(ziel, 0, 0);
  }
  hatBild = true;
  if (vollerPass) letzterPass = { dokId: docStore.dokId, skala, ms };
  return true;
}

async function render() {
  if (!props.lebendig) return;
  const nr = ++renderNr;
  _brichLaufendeAb();
  const dok = docStore.pdfDok;
  const dokId = docStore.dokId;
  if (!dok || !dokId) return;

  // Beim Wiederbeleben existiert das v-if-Canvas erst NACH dem Patch —
  // ohne dieses Warten liefe der Cache-Blit ins Leere (gemessen: Cache
  // griff nie, jede Rückkehr renderte voll).
  if (!canvasEl.value) {
    await nextTick();
    if (nr !== renderNr || !props.lebendig || !canvasEl.value) return;
  }

  const schwer = istSchwer(dokId, props.index);
  const zielSkala = renderScaleFuer(
    props.breitePt, props.hoehePt, props.renderZoom, undefined, schwer);

  // Bitmap-Cache: Zurückscrollen/Tab-Rückkehr blittet sofort statt zu rendern.
  const treffer = hole(dokId, props.index);
  if (treffer && canvasEl.value) {
    const canvas = canvasEl.value;
    canvas.width = treffer.bitmap.width;
    canvas.height = treffer.bitmap.height;
    canvas.getContext('2d', { alpha: false }).drawImage(treffer.bitmap, 0, 0);
    hatBild = true;
    letzterPass = { dokId, skala: treffer.skala, ms: treffer.kostenMs };
    if (import.meta.env.DEV) {
      console.debug(`[pdfed] Seite ${props.index + 1}: cache-blit @${treffer.skala.toFixed(2)}`);
    }
    if (skalaPasst(treffer, zielSkala)) return;   // gut genug — fertig
  }

  let seite;
  try { seite = await dok.holeSeite(props.index); }
  catch { return; }                       // Dokument wurde inzwischen geschlossen
  if (nr !== renderNr || !props.lebendig || !canvasEl.value) return;

  if (schwer && !treffer && !hatBild) {
    // Nichts zum Strecken da → sofort lesbares Bild in 40 %.
    // (Mit Altbild entfällt der Pass: Auflösung spart bei pfad-dominierten
    // Seiten kaum Zeit — das gestreckte Altbild ist die bessere Vorschau.)
    if (!await _passe(seite, zielSkala * 0.4, nr, false)) return;
    if (nr !== renderNr) return;
  }
  if (schwer || treffer) {
    // Der teure volle Pass wartet kurz — wer weiterzoomt, bricht ihn ab.
    await _ruhe(350);
    if (nr !== renderNr || !props.lebendig) return;
  }
  // Offscreen, sobald bereits ein Bild (Altbild/Vorschau/Cache) sichtbar ist.
  await _passe(seite, zielSkala, nr, true, hatBild || schwer || !!treffer);
}

/** Beim Entleiben: teure Ergebnisse als ImageBitmap in den Cache retten. */
function _sichereInCache() {
  const canvas = canvasEl.value;
  const p = letzterPass;
  letzterPass = null;
  if (!canvas || !p?.dokId || !(p.ms > SCHWER_MS)) return;
  if (typeof createImageBitmap !== 'function') return;
  createImageBitmap(canvas)
    .then(bm => lege(p.dokId, props.index, bm, p.skala, p.ms))
    .catch(() => { /* z. B. 0×0-Canvas */ });
}

watch(() => [
  props.lebendig, props.renderZoom, props.breitePt,
  docStore.pdfDok, docStore.layerRevision,
], () => {
  if (props.lebendig) {
    render();
  } else {
    renderNr++;
    _brichLaufendeAb();
    _sichereInCache();
    hatBild = false;   // das v-if-Canvas verschwindet mitsamt Bild
  }
});

// ── Schärfe-Kachel (Stufe 12): sichtbaren Ausschnitt scharf nachrendern ─────

let kachelTask = null;
let kachelNr = 0;
let kachelTimer = 0;

function _brichKachelAb() {
  clearTimeout(kachelTimer);
  if (kachelTask) { try { kachelTask.cancel(); } catch { /* */ } kachelTask = null; }
}

/** Debounce: erst wenn Scroll UND Zoom kurz ruhen, wird nachgeschärft. */
function _planeKachel() {
  clearTimeout(kachelTimer);
  kachelTimer = setTimeout(_aktualisiereKachel, 250);
}

async function _aktualisiereKachel() {
  const dok = docStore.pdfDok;
  const sf = props.sichtfenster;
  if (!dok || !sf || !props.lebendig) return;
  const nr = ++kachelNr;
  if (kachelTask) { try { kachelTask.cancel(); } catch { /* */ } kachelTask = null; }

  const dpr = window.devicePixelRatio || 1;
  const zielSkala = props.renderZoom * dpr;
  const schwer = istSchwer(docStore.dokId, props.index);
  const basis = renderScaleFuer(props.breitePt, props.hoehePt, props.renderZoom, dpr, schwer);
  if (!kachelNoetig(basis, zielSkala)) {
    kachelInfo.value = null;   // Basisbild ist scharf genug
    return;
  }

  // Sichtfenster (Host-px) → Ausschnitt der ANZEIGEBOX → Seitenpunkte.
  // Bei gedrehter Ansicht liegt der sichtbare Streifen auf der Seite quer;
  // zuSeitenRect dreht ihn zurück (bei 90°-Vielfachen exakt).
  const cssZoom = stapelZoom.value;
  const inBox = {
    x: (sf.x - props.left) / cssZoom,
    y: (sf.y - props.top) / cssZoom,
    w: sf.b / cssZoom,
    h: sf.h / cssZoom,
  };
  const r = zuSeitenRect(inBox, viewStore.drehung, props.breitePt, props.hoehePt);
  const sicht = { x: r.x, y: r.y, b: r.w, h: r.h };
  const seite = { breitePt: props.breitePt, hoehePt: props.hoehePt };
  const neu = berechneKachel(sicht, seite, zielSkala);
  if (!neu) return;   // Seite nicht im Blick — bestehende Kachel bleibt
  if (kachelDeckt(kachelInfo.value, sicht, seite, neu.skala)) return;

  let seiteProxy;
  try { seiteProxy = await dok.holeSeite(props.index); }
  catch { return; }
  if (nr !== kachelNr || !props.lebendig) return;

  // Offscreen rastern, dann in einem Zug zeigen (kein progressiver Aufbau
  // über dem Basisbild). Der transform-Offset schiebt den gewünschten
  // Ausschnitt des Voll-Rasters auf (0,0) des kleinen Canvas.
  const off = document.createElement('canvas');
  off.width = Math.max(1, Math.floor(neu.bPt * neu.skala));
  off.height = Math.max(1, Math.floor(neu.hPt * neu.skala));
  const task = seiteProxy.render({
    canvasContext: off.getContext('2d', { alpha: false }),
    viewport: seiteProxy.getViewport({ scale: neu.skala }),
    transform: [1, 0, 0, 1, -neu.xPt * neu.skala, -neu.yPt * neu.skala],
    ...(dok.ocgConfig ? { optionalContentConfigPromise: Promise.resolve(dok.ocgConfig) } : {}),
  });
  kachelTask = task;
  const t0 = performance.now();
  try { await task.promise; }
  catch (e) {
    if (!(e instanceof RenderingCancelledException)) {
      console.error(`Schärfe-Kachel Seite ${props.index + 1} fehlgeschlagen:`, e);
    }
    return;
  } finally {
    if (kachelTask === task) kachelTask = null;
  }
  if (nr !== kachelNr || !props.lebendig) return;

  kachelInfo.value = { xPt: neu.xPt, yPt: neu.yPt, bPt: neu.bPt, hPt: neu.hPt, skala: neu.skala };
  await nextTick();   // das v-if-Canvas existiert erst nach dem Patch
  const kc = kachelEl.value;
  if (!kc || nr !== kachelNr) return;
  kc.width = off.width;
  kc.height = off.height;
  kc.getContext('2d', { alpha: false }).drawImage(off, 0, 0);
  if (import.meta.env.DEV) {
    console.debug(`[pdfed] Seite ${props.index + 1}: kachel ${Math.round(performance.now() - t0)} ms @${neu.skala.toFixed(2)} (${off.width}x${off.height})`);
  }
}

watch(() => [props.sichtfenster, props.renderZoom, props.lebendig, viewStore.drehung], () => {
  if (!props.lebendig) {
    _brichKachelAb();
    kachelNr++;
    kachelInfo.value = null;
    return;
  }
  _planeKachel();
});

// Layer-Umschaltung ändert den INHALT — die alte Kachel zeigt falsche Layer.
watch(() => docStore.layerRevision, () => {
  kachelInfo.value = null;
  if (props.lebendig) _planeKachel();
});

onMounted(render);
onBeforeUnmount(() => {
  renderNr++;
  kachelNr++;
  _brichLaufendeAb();
  _brichKachelAb();
  _sichereInCache();
});
</script>

<style scoped>
.pdfed-seite {
  position: absolute;
  background: var(--pdf-seite);
  box-shadow: var(--pdf-schatten-seite);
  border-radius: 2px;
  /* KEIN overflow: hidden — Kommentar-Popover und Auswahl-Aktionen dürfen
     über die Seitenkante ragen. */
}
/* Der unrotierte Seitenstapel. Bei gedrehter Ansicht legt ihn der
   transform (origin 0 0) in die getauschte Anzeigebox darüber. */
.pdfed-seite-inhalt {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: 0 0;
}
.pdfed-seite-canvas {
  display: block;
  width: 100%;
  height: 100%;
}
.pdfed-kachel {
  position: absolute;
  pointer-events: none;
}
.pdfed-seite-platzhalter {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--pdf-rand-stark);
  font-size: 28px;
  font-weight: 600;
}
</style>
