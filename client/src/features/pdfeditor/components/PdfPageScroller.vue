<template>
  <div
    ref="scrollerEl"
    class="pdfed-scroller"
    :class="{ 'ist-drop': dropAktiv }"
    tabindex="0"
    @dragover="aufDragOver"
    @dragleave="aufDragLeave"
    @drop="aufDrop"
    @scroll.passive="aufScroll"
    @wheel="gesten.onWheel"
    @pointerdown="aufPointerDown"
    @pointermove="aufPointerMove"
    @pointerup="aufPointerUp"
    @pointercancel="aufPointerCancel"
    @pointerleave="zeigerTools.versteckeRadiererCursor()"
    @contextmenu.prevent
  >
    <!-- Sticky-Anker: hält das Wet-Ink-Canvas über dem Viewport fest -->
    <div class="pdfed-wet-anker">
      <WetInkLayer ref="wetInk" :breite="containerBreite" :hoehe="containerHoehe" />
    </div>
    <div
      class="pdfed-host"
      :style="{
        width: hostBreite + 'px',
        height: hostHoehe + 'px',
        transform: gesten.gestenTransform.value || undefined,
      }"
    >
      <PdfPage
        v-for="(s, i) in layoutSeiten"
        :key="i"
        :index="i"
        :top="s.top"
        :left="s.left"
        :css-breite="s.breite"
        :css-hoehe="s.hoehe"
        :breite-pt="s.breitePt"
        :hoehe-pt="s.hoehePt"
        :lebendig="lebendig.has(i)"
        :render-zoom="renderZoom"
        :sichtfenster="sichtfenster"
      />
      <!-- Dokument wie ein Notizbuch verlängern: leere Seite im Format
           der letzten anhängen (nicht im Annotations-Undo) -->
      <button
        v-if="layoutSeiten.length"
        class="pdfed-btn pdfed-seite-plus"
        :style="{ top: seitePlusTop + 'px', left: hostBreite / 2 + 'px' }"
        :disabled="seiteWirdAngehaengt"
        title="Leere Seite im Format der letzten anhängen"
        @pointerdown.stop
        @click="haengeSeiteAn"
      >
        <PdfIcon name="plus" :size="16" /> Seite anhängen
      </button>
    </div>
  </div>
</template>

<script setup>
/**
 * PdfPageScroller — kontinuierliche Seitenliste mit Virtualisierung.
 *
 * Der Scroller scrollt nativ (Rad, Scrollbar, Tastatur); Touch läuft wegen
 * `touch-action: none` komplett über Pointer-Events und wird hier geroutet:
 * Stufe 1 ist jeder Zeiger Navigation, ab Stufe 2 entscheidet usePointerTools
 * nach den Stift/Finger-Konfliktregeln, wem ein Zeiger gehört.
 */
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import PdfPage from './PdfPage.vue';
import WetInkLayer from './WetInkLayer.vue';
import PdfIcon from './PdfIcon.vue';
import { useDocStore } from '../stores/useDocStore';
import { useViewStore } from '../stores/useViewStore';
import { useToolStore } from '../stores/useToolStore';
import { useAnnotStore } from '../stores/useAnnotStore';
import { useVirtualPages } from '../composables/useVirtualPages';
import { useViewportGestures } from '../composables/useViewportGestures';
import { usePointerTools } from '../composables/usePointerTools';
import { useTextSelection } from '../composables/useTextSelection';
import { boxMasse, zuSeitenPunkt } from '../services/AnsichtRotation';
import { bildAusDrop } from '../services/BildImport';
import { legeBildAb } from '../services/BildAblage';
import { TAB_DRAG_TYP } from '../services/TabTransfer';

const RAND = 24;      // Abstand Seiten ↔ Viewportkante (CSS-px)
const LUECKE = 16;    // Abstand zwischen Seiten

const docStore = useDocStore();
const viewStore = useViewStore();
const toolStore = useToolStore();
const annotStore = useAnnotStore();

const scrollerEl = ref(null);
const wetInk = ref(null);
const scrollTop = ref(0);
const scrollLeft = ref(0);
const containerBreite = ref(0);
const containerHoehe = ref(0);

// Sichtfenster in Host-Koordinaten — die Schärfe-Kachel jeder Seite
// braucht es, um nur den SICHTBAREN Ausschnitt scharf nachzurendern.
const sichtfenster = computed(() => ({
  x: scrollLeft.value,
  y: scrollTop.value,
  b: containerBreite.value,
  h: containerHoehe.value,
}));

// ── Layout: Seitenpositionen aus Maßen × Zoom ───────────────────────────────

// `breite`/`hoehe` sind die Maße der ANZEIGEBOX (bei 90°/270° getauscht) —
// Layout, Virtualisierung und Zoom-Anker rechnen durchgehend damit;
// `breitePt`/`hoehePt` bleiben die unrotierten Seitenmaße für die Inhalte.
const layoutSeiten = computed(() => {
  const zoom = viewStore.zoom;
  const drehung = viewStore.drehung;
  const seiten = docStore.seiten;
  const maxBreite = seiten.reduce(
    (m, s) => Math.max(m, boxMasse(s.breitePt, s.hoehePt, drehung).breitePt * zoom), 0);
  const breiteHost = Math.max(containerBreite.value, maxBreite + 2 * RAND);
  let y = RAND;
  return seiten.map((s) => {
    const box = boxMasse(s.breitePt, s.hoehePt, drehung);
    const breite = box.breitePt * zoom;
    const hoehe = box.hoehePt * zoom;
    const eintrag = {
      top: y, left: (breiteHost - breite) / 2,
      breite, hoehe, breitePt: s.breitePt, hoehePt: s.hoehePt,
      boxBreitePt: box.breitePt, boxHoehePt: box.hoehePt,
    };
    y += hoehe + LUECKE;
    return eintrag;
  });
});

const hostBreite = computed(() => {
  const zoom = viewStore.zoom;
  const drehung = viewStore.drehung;
  const maxBreite = docStore.seiten.reduce(
    (m, s) => Math.max(m, boxMasse(s.breitePt, s.hoehePt, drehung).breitePt * zoom), 0);
  return Math.max(containerBreite.value, maxBreite + 2 * RAND);
});

const PLUS_PLATZ = 64;   // Raum für den „Seite anhängen"-Knopf unter der letzten Seite

const hostHoehe = computed(() => {
  const letzte = layoutSeiten.value.at(-1);
  return letzte ? letzte.top + letzte.hoehe + RAND + PLUS_PLATZ : 0;
});

const seitePlusTop = computed(() => {
  const letzte = layoutSeiten.value.at(-1);
  return letzte ? letzte.top + letzte.hoehe + 14 : 0;
});

const seiteWirdAngehaengt = ref(false);
async function haengeSeiteAn() {
  seiteWirdAngehaengt.value = true;
  try { await docStore.fuegeSeiteAn(); }
  finally { seiteWirdAngehaengt.value = false; }
}

// ── Virtualisierung ─────────────────────────────────────────────────────────

const { sichtbar, lebendig } = useVirtualPages(scrollTop, containerHoehe, layoutSeiten, 1);
watch(sichtbar, (s) => { viewStore.sichtbareSeiten = s; });

// ── Beruhigter Render-Zoom: erst wenn der Zoom kurz still steht, rendern
//    alle lebendigen Seiten scharf nach — nicht bei jeder Radraste. ─────────

const renderZoom = ref(viewStore.zoom);
let renderZoomTimer = 0;
watch(() => viewStore.zoom, (z) => {
  clearTimeout(renderZoomTimer);
  renderZoomTimer = setTimeout(() => { renderZoom.value = z; }, 180);
});

// ── Gesten & Pointer-Routing (Stift/Finger-Konfliktregeln) ──────────────────

const gesten = useViewportGestures({
  scrollerRef: scrollerEl,
  viewStore,
  layout: () => layoutSeiten.value,
});

/** Welche Seite liegt unter dem Zeiger? Liefert die konstante Abbildung
 *  Seite→Viewport für die Dauer eines Strichs mit. */
function findeSeite(clientX, clientY) {
  const el = scrollerEl.value;
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  const hx = el.scrollLeft + clientX - rect.left;
  const hy = el.scrollTop + clientY - rect.top;
  const seiten = layoutSeiten.value;
  for (let i = 0; i < seiten.length; i++) {
    const s = seiten[i];
    if (hy >= s.top && hy <= s.top + s.hoehe && hx >= s.left && hx <= s.left + s.breite) {
      const ursprungX = s.left - el.scrollLeft;
      const ursprungY = s.top - el.scrollTop;
      return {
        index: i, breitePt: s.breitePt, hoehePt: s.hoehePt, zoom: viewStore.zoom,
        // Ursprung ist die obere linke Ecke der ANZEIGEBOX; die Umrechnung
        // in Seitenpunkte dreht in usePointerTools zurück.
        drehung: viewStore.drehung,
        boxBreitePt: s.boxBreitePt, boxHoehePt: s.boxHoehePt,
        ursprungX, ursprungY,
        ursprungClientX: rect.left + ursprungX,
        ursprungClientY: rect.top + ursprungY,
      };
    }
  }
  return null;
}

const zeigerTools = usePointerTools({
  scrollerRef: scrollerEl, gesten, wetInkRef: wetInk,
  toolStore, annotStore, viewStore, findeSeite,
});

useTextSelection({ toolStore, annotStore, viewStore });

// Werkzeugwechsel → Radierkreis/Marker-Vorschau verschwindet sofort.
watch(() => toolStore.aktivesWerkzeug, (w) => {
  if (w !== 'radierer' && w !== 'textmarker') zeigerTools.versteckeRadiererCursor();
});

function aufPointerDown(ev) {
  // Text-Markieren: Zeiger auf der Textschicht gehören dem Browser
  // (native Auswahl) — unser Routing fasst sie nicht an.
  if (toolStore.aktivesWerkzeug === 'textMarkieren'
      && ev.target?.closest?.('.pdfed-textlayer')) return;
  zeigerTools.onPointerDown(ev);
}
function aufPointerMove(ev) { zeigerTools.onPointerMove(ev); }
function aufPointerUp(ev) { zeigerTools.onPointerUp(ev); }
function aufPointerCancel(ev) { zeigerTools.onPointerCancel(ev); }

// ── Drag&Drop auf die Seiten (Stufe 16): Bild → direkt platzieren, PDF → Tab ─

const dropAktiv = ref(false);

function _istDateiDrag(ev) {
  const typen = Array.from(ev.dataTransfer?.types ?? []);
  // Tab-Drags gehören der Tab-Leiste — hier nicht anfassen.
  return typen.includes('Files') && !typen.includes(TAB_DRAG_TYP);
}

function aufDragOver(ev) {
  if (!_istDateiDrag(ev)) return;
  ev.preventDefault();
  ev.dataTransfer.dropEffect = 'copy';
  dropAktiv.value = true;
}

function aufDragLeave() { dropAktiv.value = false; }

async function aufDrop(ev) {
  dropAktiv.value = false;
  if (!_istDateiDrag(ev)) return;
  ev.preventDefault();   // sonst navigiert der Browser zur Datei und räumt den Editor ab
  // Alles SYNCHRON sichern — DataTransfer ist nach dem ersten await leer.
  const bild = bildAusDrop(ev.dataTransfer);
  const pdf = bild ? null : Array.from(ev.dataTransfer.files ?? [])
    .find(f => f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
  const { clientX, clientY } = ev;
  if (pdf) { await docStore.importiereDatei(pdf); return; }
  if (!bild || !docStore.dokId) return;
  let vorlage;
  try {
    vorlage = await legeBildAb(docStore.dokId, bild);
  } catch (e) {
    toolStore.bildFehler = e?.message || 'Das Bild konnte nicht übernommen werden.';
    return;
  }
  // Zwischen den Seiten losgelassen → auf den nächsten Tipp warten.
  if (!zeigerTools.platziereBildBei(clientX, clientY, vorlage)) {
    toolStore.waehleWerkzeug('bild');
    toolStore.bildZumPlatzieren = vorlage;
  }
}

let scrollRafGeplant = false;
function aufScroll() {
  if (scrollRafGeplant) return;
  scrollRafGeplant = true;
  requestAnimationFrame(() => {
    scrollRafGeplant = false;
    if (scrollerEl.value) {
      scrollTop.value = scrollerEl.value.scrollTop;
      scrollLeft.value = scrollerEl.value.scrollLeft;
    }
  });
}

// ── Containergröße & initiales Fit-Width ────────────────────────────────────

let resizeObserver = null;
let fitErledigtFuer = null;

watch(() => [docStore.dokId, docStore.seiten.length, containerBreite.value], async () => {
  if (!docStore.seiten.length || !containerBreite.value) return;
  if (fitErledigtFuer === docStore.dokId) return;
  fitErledigtFuer = docStore.dokId;
  const ansicht = docStore.gewuenschteAnsicht;
  if (ansicht) {
    // Tab-Wechsel: gemerkten Zoom + oberste Seite wiederherstellen.
    docStore.gewuenschteAnsicht = null;
    viewStore.setzeZoom(ansicht.zoom);
    viewStore.setzeDrehung(ansicht.drehung ?? 0);
    renderZoom.value = viewStore.zoom;
    await nextTick();   // Layout mit dem restaurierten Zoom steht jetzt
    const s = layoutSeiten.value[ansicht.seite];
    if (scrollerEl.value) scrollerEl.value.scrollTop = s ? Math.max(0, s.top - 12) : 0;
  } else {
    // Frisch geöffnetes Dokument: ungedreht und auf Seitenbreite.
    viewStore.setzeDrehung(0);
    viewStore.passeBreiteAn(containerBreite.value - 2 * RAND, docStore.seiten[0].breitePt);
    renderZoom.value = viewStore.zoom;
    if (scrollerEl.value) scrollerEl.value.scrollTop = 0;
  }
});

onMounted(() => {
  resizeObserver = new ResizeObserver(() => {
    if (!scrollerEl.value) return;
    containerBreite.value = scrollerEl.value.clientWidth;
    containerHoehe.value = scrollerEl.value.clientHeight;
  });
  resizeObserver.observe(scrollerEl.value);
  containerBreite.value = scrollerEl.value.clientWidth;
  containerHoehe.value = scrollerEl.value.clientHeight;
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  clearTimeout(renderZoomTimer);
  gesten.stoppeTraegheit();
});

// ── Für die Toolbar: Zoom um die Viewportmitte, Fit-Width ───────────────────

function zoomeSchritt(faktor) {
  gesten.zoomeUm(faktor, {
    x: containerBreite.value / 2,
    y: containerHoehe.value / 2,
  });
}

function passeBreiteAn() {
  if (!docStore.seiten.length) return;
  // Bei gedrehter Ansicht zählt die BREITE DER ANZEIGEBOX.
  const s = docStore.seiten[0];
  const box = boxMasse(s.breitePt, s.hoehePt, viewStore.drehung);
  viewStore.passeBreiteAn(containerBreite.value - 2 * RAND, box.breitePt);
}

/**
 * Ansicht drehen (Toolbar). Danach EINMAL neu einpassen — ein quer
 * gedrehtes A4 stünde sonst halb außerhalb des Sichtfensters.
 * Bewusst als Aktion und NICHT als watch auf `drehung`: beim Wiederher-
 * stellen eines Tabs wird die Drehung ebenfalls gesetzt, dort soll aber
 * der gemerkte Zoom gelten, nicht Fit-Width.
 */
async function dreheAnsicht(richtung) {
  viewStore.drehe(richtung);
  if (!docStore.seiten.length) return;
  await nextTick();
  passeBreiteAn();
  renderZoom.value = viewStore.zoom;
}

/** Lineal ein-/ausblenden: platziert es mittig im Sichtfenster der obersten
 *  sichtbaren Seite (nur der Scroller kennt Scrollstand und Layout). */
function schalteLineal() {
  if (toolStore.lineal) { toolStore.lineal = null; return; }
  const index = viewStore.sichtbareSeiten.von ?? 0;
  const s = layoutSeiten.value[index];
  if (!s) return;
  const zoom = viewStore.zoom;
  const sichtMitteY = scrollTop.value + containerHoehe.value / 2;
  // Mitte des sichtbaren Streifens IN DER ANZEIGEBOX, dann zurückdrehen —
  // so liegt das Lineal auch bei gedrehter Ansicht im Blickfeld.
  const boxY = Math.max(30, Math.min(s.boxHoehePt - 30, (sichtMitteY - s.top) / zoom));
  const [px, py] = zuSeitenPunkt(
    s.boxBreitePt / 2, boxY, viewStore.drehung, s.breitePt, s.hoehePt);
  toolStore.lineal = {
    page: index,
    x: px,
    y: py,
    // Der Winkel lebt im Seitenraum: 0° soll am Bildschirm waagerecht
    // aussehen, also die Ansichtsdrehung gegenrechnen.
    winkelGrad: -viewStore.drehung,
  };
}

defineExpose({ zoomeSchritt, passeBreiteAn, schalteLineal, dreheAnsicht });
</script>

<style scoped>
.pdfed-scroller {
  flex: 1;
  overflow: auto;
  outline: none;
  /* Touch komplett über Pointer-Events — nativer Touch-Scroll wäre den
     Werkzeug-Konfliktregeln (Stufe 2) nicht unterzuordnen. */
  touch-action: none;
  overscroll-behavior: contain;
}
.pdfed-scroller.ist-drop {
  outline: 3px dashed var(--pdf-akzent);
  outline-offset: -8px;
}
.pdfed-host {
  position: relative;
  transform-origin: 0 0;
}
.pdfed-wet-anker {
  position: sticky;
  top: 0;
  left: 0;
  width: 0;
  height: 0;
  z-index: 5;
}
.pdfed-seite-plus {
  position: absolute;
  transform: translateX(-50%);
  border: 1px dashed var(--pdf-rand-stark);
  background: var(--pdf-flaeche);
  color: var(--pdf-text-dim);
}
.pdfed-seite-plus:hover {
  color: var(--pdf-akzent);
  border-color: var(--pdf-akzent);
}
</style>
