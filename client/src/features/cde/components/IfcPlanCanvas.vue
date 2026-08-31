<template>
  <div class="plan-host" ref="hostRef">
    <canvas
      ref="cvRef"
      class="plan-canvas"
      :class="{ greift: greift, misst: messen || setzModus, malt: stiftModus }"
      @pointerdown="onZeigerAb"
      @pointermove="onZeigerBewegt"
      @pointerup="onZeigerAuf"
      @pointercancel="onZeigerAuf"
      @wheel.prevent="onRad"
      @dblclick="onDoppelklick"
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

    <!-- Bemaßung (AP-10): der Hinweis sitzt am Blattrand, nicht auf dem Blatt —
         er gehört zur Bedienung, nicht zur Zeichnung. -->
    <div v-if="messen" class="plan-messhinweis">
      <CdeIcon name="measure" :size="13" />
      <span>{{ massPunkt ? 'Zweiten Punkt setzen' : 'Ersten Punkt setzen' }} — Esc beendet</span>
    </div>
    <!-- Zeichnen (Stufe 9.4). Der Hinweis oben sagt, wie viele Punkte noch
         fehlen; das Formular unten hält Bezeichnung, IFC-Typ und Höhe. Beides
         am Blattrand, nicht auf dem Blatt — es gehört zur Bedienung. -->
    <div v-else-if="zeichnen.aktiv.value" class="plan-messhinweis">
      <CdeIcon :name="zeichnen.werkzeug.value?.icon ?? 'add'" :size="13" />
      <span>{{ zeichnen.hinweis.value }} — Esc bricht ab</span>
    </div>
    <div v-else-if="setzModus" class="plan-messhinweis">
      <CdeIcon :name="setzModus === 'loeschen' ? 'delete' : setzModus === 'text' ? 'edit' : 'coords'" :size="13" />
      <span>{{ setzHinweis }} — Esc beendet</span>
    </div>

    <div v-if="zeichnen.aktiv.value" class="plan-zeichenform">
      <CdeBearbeitungForm
        :felder="bearbeitung.felder"
        :werte="bearbeitung.werte"
        :fehler="zeichenFehler"
        :bereit="bearbeitung.bereit && zeichnen.genug.value"
        :ok-text="zeichnen.genug.value ? 'Anlegen' : `Noch ${zeichnen.mindestPunkte.value - zeichnen.punkte.value.length} Punkte`"
        @setze-wert="bearbeitung.setzeWert"
        @uebernehmen="zeichnenAbschliessen"
        @abbrechen="zeichnen.abbrechen()"
      />
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
import CdeBearbeitungForm from './ui/CdeBearbeitungForm.vue';
import { useViewerApi } from '../composables/viewerApi.js';
import { useAnsicht } from '../stores/useAnsicht.js';
import { useIfcStore } from '../stores/useIfcStore.js';
import { usePlanInhalt } from '../stores/usePlanInhalt.js';
import { useRotstift, STIFT_FARBEN, STIFT_BREITE_MM, RADIER_RADIUS_MM, mmZuWelt } from '../stores/useRotstift.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { useAenderungen } from '../stores/useAenderungen.js';
import { useCdeStore } from '../stores/useCdeStore.js';
import { useZeichnen } from '../composables/useZeichnen.js';
import { rezeptNach } from '../services/Bauteilrezepte.js';
import { erzeugeEingabeRouting } from '@/services/tinte/EingabeRouting';
import { erstelleCanvasDoc } from '../services/CanvasDoc.js';
import { drawVectorPlan, makeWorldTransform } from '../services/IfcVectorPlotter.js';
import { styleToLegacy } from '../services/VectorStyleEngine.js';
import { _drawTitleBlock, _drawWatermark } from '../services/IfcPdfExporter.js';
import { erstellePlanInhalt } from '../services/PlanContent.js';
import {
  RAND_MM, massstabSchritt, begrenzeMitte, zentriereAufBounds,
  passendenMassstab, zoomFuerBlatt, bildschirmZuMm,
} from '../services/PlanViewport.js';

const props = defineProps({
  /** Zeichen- und Beschriftungsoptionen aus dem Plan-Panel. */
  optionen: { type: Object, default: () => ({}) },
  /** Schriftfeld-Inhalte. */
  titleBlock: { type: Object, default: () => ({}) },
  logo: { type: String, default: null },
});

const emit = defineEmits(['zeichnen-beendet']);

const api = useViewerApi();
const ansicht = useAnsicht();
const ifc = useIfcStore();
const planInhalt = usePlanInhalt();
const rotstift = useRotstift();
const bearbeitung = useBearbeitung();
const aenderungen = useAenderungen();
const cde = useCdeStore();

/**
 * Zeichnen (Stufe 9.4).
 *
 * Der Zug wird HIER gehalten, weil hier die Weltkoordinaten entstehen
 * (`zeigerZuWelt`). Was daraus wird — Prüfung, Journaleintrag, Rücknahme —
 * weiss das Composable, und der Katalog liefert das Formular. Damit gibt es
 * keinen zweiten Weg, ein Bauteil anzulegen.
 */
const zeichnen = useZeichnen({
  bearbeitung,
  cde,
  getModellSha: () => api.getLoadedModelSha?.() ?? null,
  // Die Raumansicht baut ihr CDE-Modell aus dem Journal neu auf. Der Plan
  // braucht das nicht — er zeichnet ohnehin direkt aus dem Journal.
  nachBauen: () => api.baueErzeugteNeu?.(),
});

/** Prüfmeldungen des Formulars UND des Zuges — der Nutzer sieht eine Liste. */
const zeichenFehler = computed(() => (zeichnen.grund.value
  ? [zeichnen.grund.value, ...bearbeitung.fehler]
  : bearbeitung.fehler));

/**
 * Die erzeugten Bauteile als Zeichenanweisung.
 *
 * Direkt aus dem wirksamen Stand des Journals — nicht aus dem 3D-Modell.
 * `drawVectorPlan` fasst nie ein Fragment an, und deshalb steht eine
 * gezeichnete Linie sofort im Plan, auch wenn der Editor sie noch nicht
 * gebaut hat (oder gar nicht bauen kann).
 */
const erzeugtePunkte = computed(() => {
  const out = [];
  for (const [, bauplan] of aenderungen.wirksamerStand('erzeugt')) {
    const punkte = bauplan?.parameter?.punkte;
    if (!Array.isArray(punkte) || punkte.length < 2) continue;
    out.push({ punkte, name: bauplan.name, geschlossen: !!rezeptNach(bauplan.rezept)?.geschlossen });
  }
  return out;
});

async function zeichnenAbschliessen() {
  const eintrag = await zeichnen.abschliessen();
  if (eintrag) baldZeichnen();
}

/**
 * Der Plan beendet das Zeichnen auch von sich aus — nach dem Abschliessen,
 * über Esc, über Doppelklick. Ohne diese Meldung bliebe der Knopf in der
 * Werkzeugleiste hervorgehoben, obwohl nichts mehr scharf ist. Genau die Sorte
 * toter Bindung, die sich für den Nutzer als „das Werkzeug hängt" anfühlt.
 */
watch(() => zeichnen.aktiv.value, (an) => { if (!an) emit('zeichnen-beendet'); });

const hostRef = ref(null);
const cvRef = ref(null);
const rechnet = ref(false);
const ersterAufbau = ref(false);
const greift = ref(false);
/** Bemaßungsmodus (AP-10) — von außen über `messenUmschalten` geschaltet. */
const messen = ref(false);
/** Erster gesetzter Punkt, solange die Kette offen ist. */
const massPunkt = ref(null);
/**
 * Das Logo als fertiges Bild.
 *
 * `ctx.drawImage` kann mit einer Data-URL nichts anfangen, und Zeichnen ist
 * hier synchron — die URL muss also vorher aufgelöst sein. Vorher stand im
 * Exporter zusätzlich die jsPDF-Altform von `addImage`, wodurch am Bildschirm
 * ohnehin nichts ankam.
 */
const logoBild = ref(null);

// ── Planinhalte setzen (Sprint I, Stufe 7) ──────────────────────────────────
// null = aus · 'text' · ein Symbolname aus PlanSymbols · 'loeschen'
const setzModus = ref(null);
/** Gerade gezogener Inhalt, oder null. */
let ziehtInhalt = null;

// ── Rotstift (Sprint I, Stufe 7) ────────────────────────────────────────────
// null = aus · 'stift' · 'radierer'
const stiftModus = ref(null);
const stiftFarbe = ref(STIFT_FARBEN[0]);
/** Laufender Strich in Welt-XZ, solange der Zeiger unten ist. */
const nasserStrich = ref(null);

/**
 * Stift- und Fingerregeln — geteilt mit dem PDF-Editor.
 *
 * Der Surface-Stift gewinnt gegen den Finger, ein zweiter Finger im
 * Karenzfenster wird zum Schwenken, und nach einem Stiftkontakt bleibt der
 * Finger kurz gesperrt (die Handballen-Regel). Das ist genau dieselbe
 * Zustandsmaschine wie über einer PDF-Seite — nur liegt darunter ein Plan.
 */
const eingabe = erzeugeEingabeRouting({
  holeModus: () => 'stiftUndFinger',
  holeWerkzeug: () => (stiftModus.value === 'radierer' ? 'radierer'
                     : stiftModus.value === 'stift' ? 'stift' : 'pan'),
});

/** Radierradius in Weltmetern beim aktuellen Maßstab. */
function radierRadius() {
  return mmZuWelt(RADIER_RADIUS_MM, ansicht.massstab);
}

let inhalt = null;          // PlanContent-Instanz
let letzterInhalt = null;
let ro = null;
let rafId = 0;
let bereichPx = { w: 0, h: 0 };

const setzHinweis = computed(() => {
  if (setzModus.value === 'loeschen') return 'Planinhalt anklicken zum Entfernen';
  if (setzModus.value === 'text') return 'Klicken, wo die Beschriftung stehen soll';
  return 'Klicken, wo das Symbol stehen soll';
});

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
    // Die Haltungsbeschriftung liest die Achsen direkt aus web-ifc — dafür
    // braucht sie die Instanzen und den Koordinaten-Versatz. Beides weiß nur
    // die Engine, deshalb wird es hier ergänzt und nicht im Store geführt.
    axisLabels: o.axisLabels
      ? {
          ...o.axisLabels,
          apis:         o.axisLabels.apis         ?? api.getWebIfcAPIs?.()      ?? null,
          coordOffsets: o.axisLabels.coordOffsets ?? api.getAllCoordOffsets?.() ?? null,
        }
      : null,
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
      ifcGridAxes: o.ifcGrids ? (o.ifcGridAxes ?? api.getIfcGridAxes?.() ?? null) : null,
      annotations: o.annotations ?? [],
      measurements: o.measurements ?? [],
      dimensions: o.dimensions ?? [],
      planInhalte: planInhalt.inhalte,
      erzeugte: erzeugtePunkte.value,
      zeichenZug: zeichnen.zug.value,
      // Fertige Striche plus der gerade laufende — sonst sähe man beim Malen
      // nichts, bis man loslässt.
      rotstift: nasserStrich.value
        ? [...rotstift.striche, nasserStrich.value]
        : rotstift.striche,
      utmGrid: o.utmGrid && {
        ...o.utmGrid,
        offset: o.utmGrid.offset ?? Object.values(api.getAllCoordOffsets?.() ?? {})[0] ?? { x: 0, y: 0, z: 0 },
      },
      northAngle: o.northAngle ?? 0,
      scaleBar: o.scaleBar !== false,
      scaleRatio: ansicht.massstab,
    });
  }

  _drawTitleBlock(doc, dw, dh, props.titleBlock ?? {}, logoBild.value);
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

/**
 * Bildschirmpunkt → Weltpunkt (Welt-XZ).
 *
 * Der Rückweg zur Zeichnung: Pixel → Papier-mm (über den Blattversatz) →
 * Welt. `makeWorldTransform` ist genau dafür gebaut und durch
 * `test/paperTransform.test.js` als exakte Umkehrung abgesichert — deshalb
 * wird hier nichts nachgerechnet.
 */
function zeigerZuWelt(ev) {
  const cv = cvRef.value;
  if (!cv) return null;
  const welt = makeWorldTransform(ansicht.frustum, RAND_MM, ansicht.flaeche.dw, ansicht.flaeche.dh);
  if (!welt) return null;

  const kasten = cv.getBoundingClientRect();
  const px = ansicht.pxProMm;
  const { blattW, blattH } = ansicht.flaeche;
  const versatz = {
    x: (bereichPx.w - blattW * px) / 2,
    y: (bereichPx.h - blattH * px) / 2,
  };
  const mm = bildschirmZuMm(ev.clientX - kasten.left, ev.clientY - kasten.top, { pxProMm: px, versatz });
  return { x: welt.zuX(mm.x), z: welt.zuZ(mm.y) };
}

/**
 * Was in Weltmetern noch als „getroffen" gilt.
 *
 * Sechs Papier-Millimeter, in Weltmeter umgerechnet — was nah heißt, hängt
 * vom Maßstab ab: bei 1:1000 sind 6 mm sechs Meter, bei 1:50 dreißig
 * Zentimeter.
 */
function trefferRadius() {
  return (6 / 1000) * ansicht.massstab;
}

function onZeigerAb(ev) {
  // ── Rotstift ─────────────────────────────────────────────────────────────
  if (stiftModus.value) {
    const antwort = eingabe.pointerDown({
      id: ev.pointerId, typ: ev.pointerType || 'mouse',
      button: ev.button, buttons: ev.buttons, x: ev.clientX, y: ev.clientY,
    });
    if (antwort.aktion === 'ignorieren') return;
    if (antwort.aktion !== 'nav') {
      const punkt = zeigerZuWelt(ev);
      if (!punkt) return;
      cvRef.value?.setPointerCapture?.(ev.pointerId);
      if (antwort.aktion.startsWith('radierer')) {
        rotstift.radiere(punkt.x, punkt.z, radierRadius(), ansicht.massstab);
        baldZeichnen();
        return;
      }
      nasserStrich.value = {
        id: 'nass', rev: 0, tool: 'stift', farbe: stiftFarbe.value,
        breiteMm: STIFT_BREITE_MM, echterDruck: ev.pointerType === 'pen',
        points: [[punkt.x, punkt.z, ev.pressure || 0.5]],
      };
      return;
    }
    // 'nav' → weiter unten schwenken
  }

  // ── Planinhalte setzen und anfassen ──────────────────────────────────────
  if (setzModus.value) {
    const punkt = zeigerZuWelt(ev);
    if (!punkt) return;

    if (setzModus.value === 'loeschen') {
      const t = planInhalt.treffer(punkt, trefferRadius());
      if (t) { planInhalt.entferne(t.id); baldZeichnen(); }
      return;
    }
    if (setzModus.value === 'text') {
      const text = prompt('Beschriftung:', '');
      if (text) { planInhalt.addText(punkt, text); baldZeichnen(); }
      return;
    }
    planInhalt.addSymbol(punkt, setzModus.value);
    baldZeichnen();
    return;
  }

  // Zeichnen (9.4) geht VOR dem Anfassen vorhandener Inhalte: sonst griffe
  // ein Punkt, der neben einem Symbol liegt, das Symbol — und der Zug bräche
  // ab, ohne dass jemand wüsste warum.
  if (zeichnen.aktiv.value) {
    const punkt = zeigerZuWelt(ev);
    if (punkt) { zeichnen.setzePunkt(punkt); baldZeichnen(); }
    return;
  }

  // Ohne Setzmodus: einen vorhandenen Inhalt anfassen und ziehen.
  const unterZeiger = zeigerZuWelt(ev);
  if (unterZeiger) {
    const t = planInhalt.treffer(unterZeiger, trefferRadius());
    if (t) {
      ziehtInhalt = t.id;
      greift.value = true;
      cvRef.value?.setPointerCapture?.(ev.pointerId);
      return;
    }
  }

  // Im Bemaßungsmodus setzt der Klick Punkte, statt das Blatt zu schwenken.
  if (messen.value) {
    const punkt = zeigerZuWelt(ev);
    if (!punkt) return;
    if (!massPunkt.value) { massPunkt.value = punkt; return; }
    ifc.addPlanDimension(massPunkt.value, punkt);
    massPunkt.value = null;
    baldZeichnen();
    return;
  }
  zieht = true;
  greift.value = true;
  cvRef.value?.setPointerCapture?.(ev.pointerId);
  zugStart = { x: ev.clientX, y: ev.clientY, mx: ansicht.mitte.x, mz: ansicht.mitte.z };
}

function onZeigerBewegt(ev) {
  if (stiftModus.value) {
    const ziel = eingabe.zielVon(ev.pointerId);
    if (ziel === 'radierer') {
      const punkt = zeigerZuWelt(ev);
      if (punkt) { rotstift.radiere(punkt.x, punkt.z, radierRadius(), ansicht.massstab); baldZeichnen(); }
      return;
    }
    if (nasserStrich.value && ziel === 'tinte') {
      const punkt = zeigerZuWelt(ev);
      if (punkt) {
        nasserStrich.value.points.push([punkt.x, punkt.z, ev.pressure || 0.5]);
        baldZeichnen();
      }
      return;
    }
  }
  if (zeichnen.aktiv.value) {
    zeichnen.bewegeZeiger(zeigerZuWelt(ev));
    baldZeichnen();
    return;
  }
  if (ziehtInhalt) {
    const punkt = zeigerZuWelt(ev);
    if (punkt) { planInhalt.verschiebe(ziehtInhalt, punkt); baldZeichnen(); }
    return;
  }
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
  if (stiftModus.value) {
    eingabe.pointerUp({ id: ev.pointerId, typ: ev.pointerType || 'mouse' });
    if (nasserStrich.value) {
      rotstift.addStrich(nasserStrich.value.points, {
        farbe: nasserStrich.value.farbe,
        echterDruck: nasserStrich.value.echterDruck,
      });
      nasserStrich.value = null;
      baldZeichnen();
    }
  }
  ziehtInhalt = null;
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

/** Bemaßungsmodus schalten. Beim Verlassen fällt ein halb gesetztes Maß weg. */
function messenUmschalten(an = null) {
  messen.value = an === null ? !messen.value : !!an;
  if (!messen.value) massPunkt.value = null;
}

function onTaste(e) {
  // Zeichnen hört auf mehr als Esc: Enter schliesst ab, Rücktaste nimmt den
  // letzten Punkt zurück. Ohne die Rücktaste müsste man bei einem verklickten
  // Punkt den ganzen Zug wegwerfen.
  if (zeichnen.aktiv.value) {
    if (e.key === 'Escape') { zeichnen.abbrechen(); baldZeichnen(); e.stopPropagation(); return; }
    if (e.key === 'Enter') { zeichnenAbschliessen(); e.preventDefault(); e.stopPropagation(); return; }
    if (e.key === 'Backspace') { zeichnen.entferneLetzten(); baldZeichnen(); e.preventDefault(); e.stopPropagation(); return; }
  }
  if (e.key !== 'Escape') return;
  if (stiftModus.value) { stiftModus.value = null; nasserStrich.value = null; e.stopPropagation(); return; }
  if (setzModus.value) { setzModus.value = null; e.stopPropagation(); return; }
  if (messen.value) { messenUmschalten(false); e.stopPropagation(); }
}

/**
 * Doppelklick: im Zeichenmodus schliesst er den Zug ab, sonst passt er ein.
 *
 * Der Doppelklick ist die eingeübte Geste zum Beenden eines Polygonzugs — in
 * jedem CAD. Sie hier NICHT zu belegen hiesse, dass der Nutzer den Zug mit
 * einem Doppelklick versehentlich wegzoomt.
 */
function onDoppelklick() {
  if (zeichnen.aktiv.value) { zeichnenAbschliessen(); return; }
  passendEinstellen();
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
  document.addEventListener('keydown', onTaste);
  await inhalteHolen();
});

/**
 * Data-URL des Logos zu einem zeichenbaren Bild auflösen.
 *
 * `immediate`, weil das Logo beim ersten Zeichnen schon dastehen soll; das
 * Neuzeichnen stößt der Ladevorgang selbst an.
 */
watch(() => props.logo, (url) => {
  if (!url) { logoBild.value = null; baldZeichnen(); return; }
  const bild = new Image();
  bild.onload = () => { logoBild.value = bild; baldZeichnen(); };
  bild.onerror = () => { logoBild.value = null; };
  bild.src = url;
}, { immediate: true });

onBeforeUnmount(() => {
  ro?.disconnect();
  if (rafId) cancelAnimationFrame(rafId);
  document.removeEventListener('keydown', onTaste);
});

// Inhalte neu sammeln, wenn sich Maßstab oder Zeichenoptionen ändern.
watch(() => [ansicht.massstab, JSON.stringify(props.optionen ?? {})], inhalteHolen);

// Reines Neuzeichnen: Blattwechsel, Schwenken, Lupe, Schriftfeld.
watch(() => [
  ansicht.format, ansicht.ausrichtung, ansicht.pxProMm,
  ansicht.mitte.x, ansicht.mitte.z, JSON.stringify(props.titleBlock ?? {}),
  // Bemaßung: reines Zeichnen. Sie gehört bewusst NICHT in die
  // Inhalts-Beobachtung darüber — dort würde jedes gesetzte Maß die teure
  // Sammlung von Umrissen, Gelände und Achsen neu anwerfen.
  ifc.planDimensions.length,
  // Gesetzte Planinhalte: ebenfalls reines Zeichnen. Die Länge reicht nicht —
  // Verschieben ändert sie nicht.
  JSON.stringify(planInhalt.inhalte),
  rotstift.anzahl,
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
  messenUmschalten,
  misstGerade: () => messen.value,
  setzeModus: (m) => { setzModus.value = m; if (m) { messenUmschalten(false); stiftModus.value = null; } },
  aktiverModus: () => setzModus.value,
  setzeStift: (m, farbe = null) => {
    stiftModus.value = m;
    if (farbe) stiftFarbe.value = farbe;
    if (m) { messenUmschalten(false); setzModus.value = null; }
    else nasserStrich.value = null;
  },
  aktiverStift: () => stiftModus.value,
  /** Ein Zeichenwerkzeug scharf schalten (Stufe 9.4) — Id aus dem Katalog. */
  zeichneMit: (id) => {
    if (!id) { zeichnen.abbrechen(); baldZeichnen(); return false; }
    messenUmschalten(false);
    setzModus.value = null;
    stiftModus.value = null;
    const ok = zeichnen.starte(id);
    baldZeichnen();
    return ok;
  },
  zeichnetGerade: () => zeichnen.werkzeug.value?.id ?? null,
  neuAufbauen: (grund = 'alles') => { inhalt?.entwerte(grund); return inhalteHolen(); },
  passendEinstellen,
});
</script>

<style scoped>
/* Das Zeichenformular sitzt unten links, dem Hinweis oben gegenüber — es soll
   den Blick auf den laufenden Zug nicht verstellen. */
.plan-zeichenform {
  position: absolute;
  left: 0.6rem; bottom: 0.6rem;
  min-width: 190px;
  padding: 0.45rem 0.55rem;
  background: var(--cde-float);
  border: 1px solid var(--cde-line);
  border-radius: var(--cde-radius);
  box-shadow: var(--cde-shadow);
}

.plan-messhinweis {
  position: absolute;
  top: 0.6rem; left: 50%; transform: translateX(-50%);
  display: flex; align-items: center; gap: 0.4rem;
  padding: 0.3rem 0.6rem;
  background: var(--cde-float);
  border: 1px solid var(--cde-accent-line);
  border-radius: var(--cde-radius);
  box-shadow: var(--cde-shadow-float);
  color: var(--cde-text-bright);
  font-size: var(--cde-font-sm);
  pointer-events: none;
  z-index: var(--cde-z-hud);
}
.plan-messhinweis .cde-icon { color: var(--cde-accent); }

.plan-canvas.misst { cursor: crosshair; }
.plan-canvas.malt { cursor: crosshair; touch-action: none; }

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
