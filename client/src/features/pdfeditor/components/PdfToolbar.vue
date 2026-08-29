<template>
  <header ref="leisteEl" class="pdfed-toolbar" :class="{ 'ist-eng': eng }">
    <div class="pdfed-toolbar-gruppe pdfed-toolbar-links">
      <button class="pdfed-btn" title="Zur Startseite" @click="$emit('schliessen')">
        <PdfIcon name="zurueck" />
      </button>
    </div>

    <div class="pdfed-toolbar-gruppe pdfed-toolbar-mitte">
      <button
        v-for="w in WERKZEUGE"
        :key="w.id"
        class="pdfed-btn"
        :class="{ 'ist-aktiv': toolStore.aktivesWerkzeug === w.id }"
        :title="w.titel"
        @click="waehle(w.id)"
      >
        <PdfIcon :name="w.icon" :size="20" />
      </button>

      <button
        class="pdfed-btn"
        :class="{ 'ist-aktiv': toolStore.aktivesWerkzeug === 'signatur' }"
        title="Signatur einfügen"
        @click="$emit('signatur')"
      >
        <PdfIcon name="signatur" :size="20" />
      </button>
      <button
        class="pdfed-btn"
        :class="{ 'ist-aktiv': toolStore.aktivesWerkzeug === 'bild' }"
        title="Bild einfügen (Datei oder Kamera; auch Strg+V und Ziehen auf die Seite)"
        @click="$emit('bild')"
      >
        <PdfIcon name="bild" :size="20" />
      </button>
      <button
        class="pdfed-btn"
        :class="{ 'ist-aktiv': istMessWerkzeug }"
        title="Messen (Strecke, Fläche, Volumen, Kalibrieren)"
        @click="messMenueOffen = !messMenueOffen"
      >
        <PdfIcon name="messen" :size="20" />
      </button>
      <button
        class="pdfed-btn"
        :class="{ 'ist-aktiv': !!toolStore.lineal }"
        :title="toolStore.lineal ? 'Lineal ausblenden' : 'Lineal einblenden (Striche an der Kante werden gerade)'"
        @click="$emit('lineal')"
      >
        <PdfIcon name="lineal" :size="20" />
      </button>
      <button
        v-if="docStore.pdfLayer.length"
        class="pdfed-btn"
        :class="{ 'ist-aktiv': layerPanelOffen }"
        title="PDF-Layer ein-/ausblenden (CAD-Layer)"
        @click="layerPanelOffen = !layerPanelOffen"
      >
        <PdfIcon name="ebenen" :size="20" />
      </button>
      <PdfLayerPanel v-if="layerPanelOffen" @schliessen="layerPanelOffen = false" />

      <div v-if="messMenueOffen" class="pdfed-messmenue" @pointerdown.stop>
        <button
          class="pdfed-btn pdfed-messmenue-eintrag"
          :class="{ 'ist-aktiv': toolStore.aktivesWerkzeug === 'messenStrecke' }"
          @click="waehleMess('messenStrecke')"
        >
          <PdfIcon name="messen" :size="17" /> Strecke messen
        </button>
        <button
          class="pdfed-btn pdfed-messmenue-eintrag"
          :class="{ 'ist-aktiv': toolStore.aktivesWerkzeug === 'messenFlaeche' }"
          @click="waehleMess('messenFlaeche')"
        >
          <PdfIcon name="flaeche" :size="17" /> Fläche messen
        </button>
        <button
          class="pdfed-btn pdfed-messmenue-eintrag"
          :class="{ 'ist-aktiv': toolStore.aktivesWerkzeug === 'messenVolumen' }"
          @click="waehleMess('messenVolumen')"
        >
          <PdfIcon name="volumen" :size="17" /> Volumen (Aushub)
        </button>
        <button
          class="pdfed-btn pdfed-messmenue-eintrag"
          :class="{ 'ist-aktiv': toolStore.aktivesWerkzeug === 'kalibrieren' }"
          @click="waehleMess('kalibrieren')"
        >
          <PdfIcon name="kalibrieren" :size="17" /> Kalibrieren (2 Punkte)
        </button>
        <button class="pdfed-btn pdfed-messmenue-eintrag" @click="massstabDirekt">
          <PdfIcon name="einstellungen" :size="17" /> Maßstab eingeben
        </button>
      </div>

      <span class="pdfed-toolbar-trenner"></span>

      <button
        class="pdfed-btn"
        title="Rückgängig (Strg+Z)"
        :disabled="!annotStore.canUndo"
        @click="annotStore.undo()"
      >
        <PdfIcon name="undo" />
      </button>
      <button
        class="pdfed-btn"
        title="Wiederherstellen (Strg+Y)"
        :disabled="!annotStore.canRedo"
        @click="annotStore.redo()"
      >
        <PdfIcon name="redo" />
      </button>

      <PdfToolOptions v-if="optionenOffen" @schliessen="optionenOffen = false" />
    </div>

    <div class="pdfed-toolbar-gruppe pdfed-toolbar-rechts">
      <button
        class="pdfed-btn"
        :class="{ 'ist-aktiv': toolStore.eingabemodus === 'nurStift' }"
        :title="toolStore.eingabemodus === 'nurStift'
          ? 'Nur Stift zeichnet — Finger navigiert (umschalten)'
          : 'Stift und Finger zeichnen (umschalten)'"
        @click="toolStore.schalteEingabemodus()"
      >
        <PdfIcon :name="toolStore.eingabemodus === 'nurStift' ? 'nur-stift' : 'finger'" />
      </button>
      <span class="pdfed-toolbar-trenner"></span>
      <button class="pdfed-btn" title="Verkleinern" @click="$emit('zoom', 1 / ZOOM_SCHRITT)">
        <PdfIcon name="zoom-minus" />
      </button>
      <span class="pdfed-toolbar-zoom">{{ viewStore.zoomProzent }} %</span>
      <button class="pdfed-btn" title="Vergrößern" @click="$emit('zoom', ZOOM_SCHRITT)">
        <PdfIcon name="zoom-plus" />
      </button>
      <button class="pdfed-btn" title="Auf Seitenbreite einpassen" @click="$emit('breite')">
        <PdfIcon name="breite" />
      </button>
      <!-- EIN Dreh-Knopf: jeder Tipp 90° im Uhrzeigersinn, viermal = wieder
           gerade. Zwei Knöpfe wären für den Weg zurück nicht nötig. -->
      <button
        class="pdfed-btn"
        :class="{ 'ist-aktiv': viewStore.drehung !== 0 }"
        :title="viewStore.drehung === 0
          ? 'Seite drehen (90° im Uhrzeigersinn)'
          : `Seite drehen — aktuell ${viewStore.drehung}°, noch ${(360 - viewStore.drehung) / 90}× bis gerade`"
        @click="$emit('drehen', 1)"
      >
        <PdfIcon name="drehen-rechts" />
      </button>
      <span class="pdfed-toolbar-trenner"></span>
      <button class="pdfed-btn" title="Exportieren (Herunterladen, Teilen, Drucken)" @click="$emit('export')">
        <PdfIcon name="herunterladen" />
      </button>
    </div>
  </header>
</template>

<script setup>
/**
 * PdfToolbar — obere Leiste: Werkzeuge in der Mitte, Navigation rechts.
 * Ein zweiter Tipp auf das aktive Zeichenwerkzeug öffnet die Kontextoptionen
 * (Farbe/Breite) — das übliche Tablet-Muster, spart eine zweite Leiste.
 * Zoom-Klicks laufen als Events zur Shell, weil das Zoomzentrum
 * (Viewportmitte) nur der Scroller kennt.
 */
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import PdfIcon from './PdfIcon.vue';
import PdfToolOptions from './PdfToolOptions.vue';
import PdfLayerPanel from './PdfLayerPanel.vue';
import { useDocStore } from '../stores/useDocStore';
import { useViewStore, ZOOM_SCHRITT } from '../stores/useViewStore';
import { useToolStore } from '../stores/useToolStore';
import { useAnnotStore } from '../stores/useAnnotStore';

const WERKZEUGE = [
  { id: 'pan',        icon: 'hand',       titel: 'Verschieben' },
  { id: 'stift',      icon: 'stift',      titel: 'Stift (erneut tippen: Optionen)' },
  { id: 'textmarker', icon: 'textmarker', titel: 'Textmarker (erneut tippen: Optionen)' },
  { id: 'radierer',   icon: 'radierer',   titel: 'Radierer (erneut tippen: Optionen)' },
  { id: 'textfeld',   icon: 'textfeld',   titel: 'Textfeld (erneut tippen: Optionen)' },
  { id: 'textMarkieren', icon: 'text-markieren', titel: 'Text auswählen (kopieren oder markieren)' },
  { id: 'lasso',      icon: 'lasso',      titel: 'Lasso-Auswahl' },
  { id: 'kommentar',  icon: 'kommentar',  titel: 'Kommentar setzen' },
  { id: 'stempel',    icon: 'stempel',    titel: 'Stempel (Vorabzug u. a. — erneut tippen: Optionen)' },
];

defineEmits(['schliessen', 'zoom', 'breite', 'signatur', 'bild', 'export', 'lineal', 'drehen']);

const docStore = useDocStore();
const viewStore = useViewStore();
const toolStore = useToolStore();
const annotStore = useAnnotStore();

// ── Platz messen statt Breakpoints raten ────────────────────────────────────
// Feste Pixelschwellen veralten mit jedem neuen Werkzeug (genau so kollidierte
// die Zoom-Gruppe nach Stempel/Ebenen/Drehen mit der Werkzeugmitte). Deshalb
// misst die Leiste selbst: passen die drei Gruppen nebeneinander? Wenn nein,
// bekommen die Werkzeuge eine eigene, zentrierte Zeile.
// Die Messung ist ZUSTANDSUNABHÄNGIG (Summe der Gruppeninhalte, egal ob ein-
// oder zweizeilig) — sonst kippte das Layout zwischen beiden Zuständen hin und her.
const leisteEl = ref(null);
const eng = ref(false);
const PUFFER_PX = 28;   // Außenabstand + Lücken zwischen den Gruppen
let beobachter = null;

/**
 * Platzbedarf einer Gruppe = Summe ihrer Knöpfe (+ Lücken). Bewusst NICHT
 * `scrollWidth` der Gruppe: in der engen Zeile spannt sie über die volle
 * Breite, die Messung ergäbe dann das Kastenmaß statt des Inhalts — der
 * Zustand könnte nie zurückkippen (genau so blieb die Leiste zweizeilig
 * hängen, nachdem das Fenster wieder breiter wurde).
 * Popover (Werkzeugoptionen, Messmenü, Ebenen) liegen absolut und zählen nicht.
 */
function _breiteVon(gruppe) {
  const kinder = [...gruppe.children]
    .filter(k => getComputedStyle(k).position !== 'absolute')
    .filter(k => k.getBoundingClientRect().width > 0);
  const luecke = parseFloat(getComputedStyle(gruppe).columnGap) || 0;
  return kinder.reduce((summe, k) => summe + k.getBoundingClientRect().width, 0)
    + luecke * Math.max(0, kinder.length - 1);
}

function _messePlatz() {
  const el = leisteEl.value;
  if (!el) return;
  const gruppen = [...el.querySelectorAll(':scope > .pdfed-toolbar-gruppe')];
  if (gruppen.length < 3) return;
  const noetig = gruppen.reduce((summe, g) => summe + _breiteVon(g), 0) + PUFFER_PX;
  eng.value = noetig > el.clientWidth;
}

// Der Inhalt der Leiste ändert sich, ohne dass sie ihre Größe ändert: der
// Ebenen-Knopf kommt erst mit einem CAD-Plan dazu. Dann muss neu gemessen
// werden, sonst läuft die Leiste über.
watch(() => docStore.pdfLayer.length, async () => {
  await nextTick();
  _messePlatz();
});

onMounted(() => {
  beobachter = new ResizeObserver(_messePlatz);
  beobachter.observe(leisteEl.value);
  _messePlatz();
});
onBeforeUnmount(() => beobachter?.disconnect());

const optionenOffen = ref(false);
const messMenueOffen = ref(false);
const layerPanelOffen = ref(false);

const istMessWerkzeug = computed(() =>
  ['messenStrecke', 'messenFlaeche', 'messenVolumen', 'kalibrieren'].includes(toolStore.aktivesWerkzeug));

function waehle(id) {
  messMenueOffen.value = false;
  if (toolStore.aktivesWerkzeug === id && id !== 'pan') {
    optionenOffen.value = !optionenOffen.value;
  } else {
    toolStore.waehleWerkzeug(id);
    optionenOffen.value = false;
  }
}

function waehleMess(id) {
  toolStore.waehleWerkzeug(id);
  messMenueOffen.value = false;
}

function massstabDirekt() {
  toolStore.kalibrierungAnfrage = { laengePt: null, page: null };
  messMenueOffen.value = false;
}
</script>

<style scoped>
.pdfed-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  row-gap: 4px;
  padding: 6px 10px;
  background: var(--pdf-flaeche);
  border-bottom: 1px solid var(--pdf-rand);
  box-shadow: var(--pdf-schatten);
  z-index: 10;
}
.pdfed-toolbar-gruppe {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}
/* Nur der Dateiname darf schrumpfen (Ellipse). Die Knopfgruppen behalten
   ihre Fingerziele — sie würden sonst überlappen statt umzubrechen. */
.pdfed-toolbar-links {
  flex: 0 1 auto;
  min-width: 0;
}
.pdfed-toolbar-rechts {
  flex: 0 0 auto;
  justify-content: flex-end;
}
/* Auto-Ränder zentrieren die Werkzeuge zwischen Titel und Ansichtsreglern —
   und in der eigenen Zeile ebenso. */
.pdfed-toolbar-mitte {
  position: relative;
  flex: 0 0 auto;
  margin-inline: auto;
  justify-content: center;
  flex-wrap: wrap;
  row-gap: 4px;
}
.pdfed-toolbar-trenner {
  width: 1px;
  height: 24px;
  margin: 0 6px;
  background: var(--pdf-rand);
}
.pdfed-toolbar-zoom {
  color: var(--pdf-text-dim);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  min-width: 52px;
  text-align: center;
}

.pdfed-messmenue {
  position: absolute;
  top: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px;
  background: var(--pdf-flaeche);
  border: 1px solid var(--pdf-rand);
  border-radius: var(--pdf-radius);
  box-shadow: var(--pdf-schatten);
  z-index: 30;
}
.pdfed-messmenue-eintrag {
  justify-content: flex-start;
  white-space: nowrap;
}

/* Zu eng für eine Zeile (gemessen, nicht geraten): die Werkzeuge rücken
   unter Titel und Ansichtsregler — eine ruhige, volle Fingerzeile. */
.pdfed-toolbar.ist-eng .pdfed-toolbar-mitte {
  order: 3;
  flex-basis: 100%;
  margin-inline: 0;
}

@media (max-width: 720px) {
  .pdfed-toolbar-zoom { display: none; }
}
</style>
