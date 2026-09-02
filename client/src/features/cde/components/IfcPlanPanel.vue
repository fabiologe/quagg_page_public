<template>
  <div class="plan-panel cde-card">
    <!-- Blatt -->
    <CdeCardHeader icon="view-top" titel="Blatt" :zusatz="`1:${ansicht.massstab}`" />
    <div class="pp-zeile">
      <label class="pp-feld">
        Format
        <select :value="ansicht.format" @change="ansicht.setzeBlatt($event.target.value, null)">
          <option v-for="f in FORMATE" :key="f" :value="f">{{ f }}</option>
        </select>
      </label>
      <label class="pp-feld">
        Lage
        <select :value="ansicht.ausrichtung" @change="ansicht.setzeBlatt(null, $event.target.value)">
          <option value="landscape">quer</option>
          <option value="portrait">hoch</option>
        </select>
      </label>
      <label class="pp-feld">
        Maßstab
        <select :value="ansicht.massstab" @change="ansicht.setzeMassstab(Number($event.target.value))">
          <option v-for="m in MASSSTAB_LEITER" :key="m" :value="m">1:{{ m }}</option>
        </select>
      </label>
    </div>

    <!-- Was gezeichnet wird -->
    <CdeCardHeader icon="layers" titel="Inhalt" />
    <div class="pp-schalter">
      <label v-for="s in INHALT" :key="s.id" class="pp-check" :title="s.hilfe">
        <input type="checkbox" :checked="plan.optionen[s.id]" @change="plan.setzeOption(s.id, $event.target.checked)" />
        <span>{{ s.titel }}</span>
      </label>
    </div>

    <!-- Tiefbau -->
    <CdeCardHeader icon="terrain" titel="Tiefbau" />
    <div class="pp-schalter">
      <label class="pp-check" title="Böschungsschraffur aus den Gelände-Kategorien">
        <input type="checkbox" :checked="plan.optionen.slopeHatch" @change="plan.setzeOption('slopeHatch', $event.target.checked)" />
        <span>Böschungsschraffur</span>
      </label>
      <div v-if="plan.optionen.slopeHatch" class="pp-unter">
        <label class="pp-feld">
          ab Neigung
          <input type="number" min="1" max="80" step="1" :value="plan.optionen.slopeMinAngle"
                 @change="plan.setzeOption('slopeMinAngle', Number($event.target.value))" /> °
        </label>
        <label class="pp-feld">
          Strichabstand
          <input type="number" min="1" max="20" step="0.5" :value="plan.optionen.slopeTickMm"
                 @change="plan.setzeOption('slopeTickMm', Number($event.target.value))" /> mm
        </label>
      </div>

      <label class="pp-check" title="Höhenlinien aus dem Geländemodell">
        <input type="checkbox" :checked="plan.optionen.contours" @change="plan.setzeOption('contours', $event.target.checked)" />
        <span>Höhenlinien</span>
      </label>
      <div v-if="plan.optionen.contours" class="pp-unter">
        <label class="pp-feld">
          Abstand
          <input type="number" min="0.1" max="10" step="0.1" :value="plan.optionen.contourInterval"
                 @change="plan.setzeOption('contourInterval', Number($event.target.value))" /> m
        </label>
      </div>

      <label class="pp-check" title="Haltungsbeschriftung entlang der Achse (DN · Länge · Gefälle)">
        <input type="checkbox" :checked="plan.optionen.axisLabels" @change="plan.setzeOption('axisLabels', $event.target.checked)" />
        <span>Haltungsbeschriftung</span>
      </label>
      <label class="pp-check" title="Nur bei georeferenzierten Modellen sinnvoll">
        <input type="checkbox" :checked="plan.optionen.utmGrid" @change="plan.setzeOption('utmGrid', $event.target.checked)" />
        <span>UTM-Gitterkreuze</span>
      </label>
    </div>

    <!-- Nordpfeil + Wasserzeichen -->
    <div class="pp-zeile">
      <label class="pp-feld">
        Nord
        <input type="number" min="-180" max="180" step="1" :value="plan.optionen.northAngle"
               @change="plan.setzeOption('northAngle', Number($event.target.value))" /> °
      </label>
      <label class="pp-feld wachsend">
        Wasserzeichen
        <input type="text" :value="plan.optionen.watermarkText" :placeholder="autoWasserzeichen || '— keins —'"
               @change="plan.setzeOption('watermarkText', $event.target.value)" />
      </label>
    </div>
    <p class="cde-hint">
      <CdeIcon name="info" :size="12" />
      <span>Leer = automatisch aus dem ISO-19650-Status des Dokuments.</span>
    </p>

    <!-- Schriftfeld -->
    <CdeCardHeader icon="register" titel="Schriftfeld">
      <CdeIconButton icon="project" titel="Aus dem Projekt übernehmen" @click="ausProjekt" />
    </CdeCardHeader>
    <div class="pp-schriftfeld">
      <label v-for="f in SCHRIFTFELD" :key="f.id" class="pp-feld">
        {{ f.titel }}
        <input type="text" :value="plan.schriftfeld[f.id]"
               @change="plan.setzeSchriftfeld({ [f.id]: $event.target.value })" />
      </label>
    </div>

    <div class="pp-logo">
      <img v-if="plan.logo" :src="plan.logo" class="pp-logo-bild" alt="Firmenlogo" />
      <label class="pp-knopf">
        <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" class="sr-only" @change="logoWaehlen" />
        <CdeIcon :name="plan.logo ? 'refresh' : 'image'" :size="12" />
        {{ plan.logo ? 'Ändern' : 'Logo laden' }}
      </label>
      <button v-if="plan.logo" class="pp-knopf schlicht" @click="plan.setzeLogo(null)" title="Logo entfernen">
        <CdeIcon name="delete" :size="12" />
      </button>
      <span v-if="logoFehler" class="pp-fehler">{{ logoFehler }}</span>
    </div>

    <!-- Ausgabe -->
    <CdeCardHeader icon="export" titel="Ausgabe" />
    <div class="pp-ausgabe">
      <button class="pp-knopf voll" :disabled="!bereit || busy" @click="ausgeben('pdf')">
        <CdeIcon :name="busy === 'pdf' ? 'busy' : 'vector'" :class="{ 'is-busy': busy === 'pdf' }" :size="13" />
        Als Vektor-PDF
      </button>
      <!-- X2: „Blatt" wohnt bei der übrigen Ausgabe — vorher ein Toolbar-
           Knopf ohne erkennbaren Unterschied zum Vektor-PDF daneben. -->
      <button class="pp-knopf" :disabled="!bereit || busy" title="Rasterbild der aktuellen 3D-Ansicht auf ein Blatt"
              @click="api.ansichtAufsBlatt?.()">
        <CdeIcon name="snapshot" :size="13" />
        3D-Ansicht aufs Blatt (Bild)
      </button>
      <button class="pp-knopf" :disabled="!bereit || busy" @click="ausgeben('dxf')">
        <CdeIcon :name="busy === 'dxf' ? 'busy' : 'dxf'" :class="{ 'is-busy': busy === 'dxf' }" :size="13" />
        Lageplan als DXF
      </button>
      <button class="pp-knopf" :disabled="!bereit || busy" @click="ausgeben('ls')">
        <CdeIcon :name="busy === 'ls' ? 'busy' : 'laengsschnitt'" :class="{ 'is-busy': busy === 'ls' }" :size="13" />
        Kanal-Längsschnitt
      </button>
      <button class="pp-knopf" :disabled="!bereit || busy" @click="ausgeben('qp')">
        <CdeIcon :name="busy === 'qp' ? 'busy' : 'querprofil'" :class="{ 'is-busy': busy === 'qp' }" :size="13" />
        Querprofile
      </button>
      <div class="pp-zeile">
        <label class="pp-feld">
          V-Maßstab
          <select v-model.number="lsMassstabV">
            <option :value="50">1:50</option>
            <option :value="100">1:100</option>
            <option :value="200">1:200</option>
          </select>
        </label>
        <label class="pp-feld">
          Querprofil alle
          <select v-model.number="qpAbstand">
            <option :value="10">10 m</option>
            <option :value="25">25 m</option>
            <option :value="50">50 m</option>
          </select>
        </label>
      </div>
      <p v-if="fehler" class="pp-fehler">{{ fehler }}</p>
    </div>

    <button class="pp-knopf schlicht breit" @click="emit('stile-oeffnen')">
      <CdeIcon name="style" :size="12" /> Linienstile bearbeiten
    </button>

    <!-- Büro-Ebene (Stufe 6): Blattgewohnheiten, Schriftfeld und Logo einmal
         fürs Büro pflegen statt in jedem Projekt von vorn. -->
    <CdeCardHeader icon="project" titel="Bürovorgabe" />
    <p class="cde-hint">
      <CdeIcon name="info" :size="12" />
      <span>
        Projekt schlägt Büro. Solange hier etwas eigenes steht, bleibt die
        Bürovorgabe unsichtbar.
      </span>
    </p>
    <div class="pp-ausgabe">
      <button class="pp-knopf" :disabled="!bueroDa || bueroBusy" @click="alsVorgabe">
        <CdeIcon :name="bueroBusy === 'setzen' ? 'busy' : 'save'" :class="{ 'is-busy': bueroBusy === 'setzen' }" :size="12" />
        Diesen Stand fürs Büro übernehmen
      </button>
      <button class="pp-knopf schlicht" :disabled="bueroBusy" @click="zurueck">
        <CdeIcon :name="bueroBusy === 'zurueck' ? 'busy' : 'undo'" :class="{ 'is-busy': bueroBusy === 'zurueck' }" :size="12" />
        Projekteigenes verwerfen
      </button>
      <p v-if="bueroMeldung" class="pp-meldung">{{ bueroMeldung }}</p>
    </div>
  </div>
</template>

<script setup>
/**
 * Plan-Panel (Sprint I, AP-9).
 *
 * Bedient, was `IfcPlanCanvas` längst zeichnen kann. Die Optionen lagen bisher
 * im PDF-Export-Modal; der Bildschirmplan bekam eine feste Standardausstattung
 * und zeichnete Böschungen, Höhenlinien und UTM-Kreuze deshalb nie.
 *
 * Das Panel hält KEINEN eigenen Zustand — er liegt in `usePlan` bzw.
 * `useAnsicht`. Was es tut, ist Bedienung und die Ausgabe anstoßen.
 */
import { computed, ref } from 'vue';
import CdeIcon from './ui/CdeIcon.vue';
import CdeCardHeader from './ui/CdeCardHeader.vue';
import CdeIconButton from './ui/CdeIconButton.vue';
import { usePlan } from '../stores/usePlan.js';
import { repo } from '../services/RepoFacade.js';
import { useAnsicht } from '../stores/useAnsicht.js';
import { useCdeStore, resolveWatermarkText } from '../stores/useCdeStore.js';
import { BLATT_FORMATE, MASSSTAB_LEITER } from '../services/PlanViewport.js';
import { useViewerApi } from '../composables/viewerApi.js';
import { usePlanExport } from '../composables/usePlanExport.js';

const emit = defineEmits(['stile-oeffnen']);

const plan = usePlan();
const ansicht = useAnsicht();
const cde = useCdeStore();
const api = useViewerApi();
const { ausfuehren, busy, fehler } = usePlanExport();

const FORMATE = Object.keys(BLATT_FORMATE);

const INHALT = [
  { id: 'footprints',   titel: 'Grundriss-Kurven',  hilfe: 'Umrisse der Bauteile in der Draufsicht' },
  { id: 'hatch',        titel: 'Schnittschraffur',  hilfe: 'Flächen, die die Schnittebene trifft' },
  { id: 'showLabels',   titel: 'Beschriftung',      hilfe: 'Bauteiltexte nach Kategorie-Vorlage' },
  { id: 'scaleBar',     titel: 'Maßstab & Nord',    hilfe: 'Maßstabsleiste und Nordpfeil' },
  { id: 'annotations',  titel: 'Issue-Pins',        hilfe: 'Offene und geschlossene Issues als Marke' },
  { id: 'measurements', titel: 'Messstrecken',      hilfe: 'Im 3D gemessene Strecken' },
  { id: 'dimensions',   titel: 'Bemaßung',          hilfe: 'Im Plan gesetzte Maßketten' },
  { id: 'ifcGrids',     titel: 'IFC-Achsenraster',  hilfe: 'Achsenraster aus dem Modell' },
];

const SCHRIFTFELD = [
  { id: 'projekt',      titel: 'Projekt' },
  { id: 'auftraggeber', titel: 'Auftraggeber' },
  { id: 'bearbeiter',   titel: 'Bearbeiter' },
  { id: 'firma',        titel: 'Firma' },
  { id: 'nummer',       titel: 'Nummer' },
  { id: 'datum',        titel: 'Datum' },
  { id: 'index',        titel: 'Index' },
];

const lsMassstabV = ref(100);
const bueroBusy = ref(null);
const bueroMeldung = ref('');
/** Ohne Netz gibt es keine Büroablage — die Knöpfe bleiben dann aus. */
const bueroDa = computed(() => !!repo.buero);

async function alsVorgabe() {
  bueroBusy.value = 'setzen';
  bueroMeldung.value = '';
  bueroMeldung.value = await plan.alsBuerovorgabe()
    ? 'Als Bürovorgabe übernommen — gilt in Projekten ohne eigene Einstellung.'
    : 'Keine Büroablage erreichbar.';
  bueroBusy.value = null;
}

async function zurueck() {
  bueroBusy.value = 'zurueck';
  bueroMeldung.value = '';
  await plan.zurueckAufBuero();
  bueroMeldung.value = 'Projekteigenes verworfen — es gilt wieder die Bürovorgabe.';
  bueroBusy.value = null;
}
const qpAbstand = ref(25);
const logoFehler = ref('');

/** Ohne Modell ist jede Ausgabe ein leeres Blatt. */
const bereit = computed(() => (api.getCategoryGroups?.() ?? []).length > 0);

const autoWasserzeichen = computed(() => {
  const sha = api.getLoadedModelSha?.();
  return sha ? (resolveWatermarkText(cde.dokumente, sha) ?? '') : '';
});

/** Schriftfeld aus der Projektakte füllen — sieben Felder statt vier. */
function ausProjekt() {
  const p = cde.auftrag;
  plan.setzeSchriftfeld({
    projekt:      [p?.nummer, p?.name].filter(Boolean).join(' '),
    auftraggeber: p?.bauherr ?? '',
    bearbeiter:   cde.bearbeiter ?? '',
    nummer:       p?.nummer ?? '',
    datum:        new Date().toLocaleDateString('de-DE'),
  });
}

async function logoWaehlen(e) {
  const datei = e.target.files?.[0];
  if (!datei) return;
  logoFehler.value = '';
  const leser = new FileReader();
  leser.onload = async () => {
    // setzeLogo wandelt nach PNG — SVG zeichnet der Canvas, jsPDF nicht.
    if (!await plan.setzeLogo(String(leser.result))) {
      logoFehler.value = 'Bild nicht lesbar.';
    }
  };
  leser.readAsDataURL(datei);
  e.target.value = '';
}

function ausgeben(art) {
  ausfuehren(art, { scaleV: lsMassstabV.value, interval: qpAbstand.value });
}
</script>

<style scoped>
.plan-panel {
  --card-accent: var(--cde-accent);
  padding: 0.6rem;
  font-size: 0.78rem;
  color: var(--cde-text);
  overflow-y: auto;
}

.pp-zeile { display: flex; gap: var(--cde-gap-sm); flex-wrap: wrap; }
.pp-feld {
  display: flex; align-items: center; gap: 0.3rem;
  font-size: var(--cde-font-sm); color: var(--cde-text-soft);
}
.pp-feld.wachsend { flex: 1; min-width: 9rem; }
.pp-feld select, .pp-feld input {
  min-width: 0;
  background: var(--cde-fill-hover);
  border: 1px solid var(--cde-line-strong);
  border-radius: 3px;
  color: var(--cde-text-bright);
  font: inherit;
  font-size: 0.74rem;
  padding: 0.14rem 0.3rem;
}
.pp-feld.wachsend input { flex: 1; }
.pp-feld input[type="number"] { width: 3.6rem; text-align: right; font-variant-numeric: tabular-nums; }
.pp-feld select:focus-visible, .pp-feld input:focus-visible {
  outline: none; border-color: var(--card-accent);
}

.pp-schalter { display: flex; flex-direction: column; gap: 0.28rem; }
.pp-check {
  display: flex; align-items: center; gap: 0.4rem;
  font-size: var(--cde-font-sm); color: var(--cde-text-soft); cursor: pointer;
}
.pp-check input { accent-color: var(--card-accent); }
/* Untereinstellungen rücken ein — sie gehören zum Schalter darüber. */
.pp-unter {
  display: flex; gap: var(--cde-gap-sm); flex-wrap: wrap;
  padding: 0.15rem 0 0.25rem 1.35rem;
  border-left: 1px solid var(--cde-line);
  margin-left: 0.35rem;
}

.pp-schriftfeld { display: grid; grid-template-columns: 1fr 1fr; gap: 0.3rem 0.5rem; }
.pp-schriftfeld .pp-feld { display: grid; grid-template-columns: 5.2rem 1fr; }

.pp-logo { display: flex; align-items: center; gap: var(--cde-gap-sm); flex-wrap: wrap; }
/* Weiße Unterlage mit Absicht: Logos sind für den Druck gemacht. */
.pp-logo-bild {
  height: 30px; max-width: 76px; object-fit: contain;
  background: var(--cde-papier); border-radius: 3px; padding: 2px;
}

.pp-ausgabe { display: flex; flex-direction: column; gap: 0.3rem; }
.pp-knopf {
  display: inline-flex; align-items: center; gap: 0.35rem;
  padding: 0.32rem 0.6rem;
  background: var(--cde-fill-hover);
  border: 1px solid var(--cde-line-strong);
  border-radius: var(--cde-radius-sm);
  color: var(--cde-text); font: inherit; font-size: 0.75rem;
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s;
}
.pp-knopf:hover:not(:disabled) {
  background: var(--cde-accent-fill);
  border-color: var(--cde-accent-line);
  color: var(--cde-text-bright);
}
.pp-knopf:disabled { opacity: 0.45; cursor: default; }
.pp-knopf.voll { background: var(--cde-accent-fill-hi); border-color: var(--cde-accent-line); font-weight: 600; }
.pp-knopf.schlicht { background: none; }
.pp-knopf.breit { justify-content: center; }
.pp-knopf .is-busy { animation: cde-spin 0.9s linear infinite; }

.pp-fehler { color: var(--cde-danger-soft); font-size: 0.7rem; margin: 0; }
.pp-meldung { color: var(--cde-text-dim); font-size: 0.68rem; margin: 0; line-height: 1.4; }

.sr-only {
  position: absolute; width: 1px; height: 1px;
  overflow: hidden; clip: rect(0,0,0,0);
}
</style>
