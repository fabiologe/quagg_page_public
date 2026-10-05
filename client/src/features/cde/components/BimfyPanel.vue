<template>
  <div class="bimfy cde-card">
    <CdeCardHeader icon="bimfy" titel="BIMFY" :zusatz="geometrien.length ? `${geometrien.length} Geometrien` : ''">
      <CdeIconButton v-if="geometrien.length" icon="close" titel="Datei verwerfen" @click="verwerfen" />
    </CdeCardHeader>

    <p class="bf-satz">
      Aus Zeichnung, Kanalnetz oder Punktliste werden IFC-Bauteile. Jede Geometrie
      wird über das passende Zeichenwerkzeug angelegt und steht danach im Verlauf.
    </p>

    <!-- 1. Datei -->
    <label class="bf-ablage" :class="{ ueber: ziehtDarueber }"
           @dragover.prevent="ziehtDarueber = true" @dragleave="ziehtDarueber = false" @drop.prevent="onDrop">
      <input type="file" :accept="ANNAHME" @change="onDatei" />
      <CdeIcon name="upload" :size="16" />
      <span v-if="!dateiName">Datei wählen oder hierher ziehen<br><small>{{ formatListe }}</small></span>
      <span v-else><b>{{ dateiName }}</b><br><small>{{ FORMATE[format]?.titel ?? format }}</small></span>
    </label>

    <!-- 2. Einstellungen, die das Lesen und die Lage betreffen -->
    <div v-if="dateiText" class="bf-optionen">
      <label v-if="format === 'obj' || format === 'stl'">
        <span>Achsen</span>
        <select v-model="zOben" @change="neuLesen">
          <option :value="true">Z oben (CAD)</option>
          <option :value="false">Y oben (3D-Modellierer)</option>
        </select>
      </label>
      <label v-if="istPunktliste">
        <span>Spalten</span>
        <select v-model="reihenfolge" @change="neuLesen">
          <option value="">automatisch</option>
          <option value="ost-nord">Rechtswert, Hochwert</option>
          <option value="nord-ost">Hochwert, Rechtswert</option>
        </select>
      </label>
      <label>
        <span>Koordinaten</span>
        <select v-model="lage">
          <option value="projekt">Projektkoordinaten (Ost/Nord)</option>
          <option value="lokal">lokal, am Modellursprung</option>
        </select>
      </label>
      <label>
        <span>Grundhöhe 2D</span>
        <input v-model="grundhoehe" type="text" inputmode="decimal" placeholder="m NN, leer = Modellnull" />
      </label>
    </div>

    <ul v-if="warnungen.length" class="bf-warnungen">
      <li v-for="(w, i) in warnungen" :key="i"><CdeIcon name="warn" :size="12" /> {{ w }}</li>
    </ul>

    <!-- 3. Vorschau in der Draufsicht -->
    <svg v-if="vorschau" class="bf-vorschau" :viewBox="vorschau.viewBox" preserveAspectRatio="xMidYMid meet" role="img"
         aria-label="Draufsicht der gelesenen Geometrie">
      <g v-for="v in vorschau.formen" :key="v.id" :class="['bf-form', v.art, { aus: !v.aktiv }]">
        <circle v-if="v.art === 'punkt'" :cx="v.x" :cy="v.y" :r="vorschau.punktR" />
        <polygon v-else-if="v.art !== 'zug'" :points="v.punkte" />
        <polyline v-else :points="v.punkte" />
      </g>
    </svg>

    <!-- 4. Je Ebene: was daraus wird -->
    <table v-if="zeilen.length" class="bf-zeilen">
      <thead>
        <tr><th></th><th>Ebene</th><th>wird zu</th><th>IFC-Klasse</th></tr>
      </thead>
      <tbody>
        <tr v-for="z in zeilen" :key="z.schluessel" :class="{ aus: !z.aktiv }">
          <td><input v-model="z.aktiv" type="checkbox" :aria-label="`${z.ebene || 'ohne Ebene'} übersetzen`" /></td>
          <td>
            <span class="bf-ebene">{{ z.ebene || '—' }}</span>
            <small>{{ z.geometrien.length }} × {{ ARTEN[z.art] }}</small>
          </td>
          <td>
            <select v-model="z.rezept" :disabled="!z.aktiv" @change="z.kategorie = klasseVon(z.rezept)">
              <option v-for="r in rezepteFuerZeile(z)" :key="r.id" :value="r.id">{{ r.titel }}</option>
            </select>
            <small :title="`Vorschlag aus ${z.grund}`">{{ z.grund }}</small>
          </td>
          <td>
            <input v-model="z.kategorie" type="text" :disabled="!z.aktiv" spellcheck="false"
                   :class="{ falsch: z.aktiv && klasseFalsch(z) }" :title="klasseFalsch(z) ?? 'IFC 4.3, schreibbar'" />
          </td>
        </tr>
      </tbody>
    </table>

    <!-- 5. Anlegen -->
    <div v-if="zeilen.length" class="bf-fuss">
      <p v-if="uebersetzung.fehler.length" class="bf-hinweis">
        <CdeIcon name="warn" :size="12" />
        {{ uebersetzung.fehler.length }} lassen sich so nicht anlegen — {{ uebersetzung.fehler[0].fehler }}
      </p>
      <p v-if="!kommandoweg" class="bf-hinweis">
        <CdeIcon name="info" :size="12" /> Erst ein Modell im 3D öffnen — BIMFY legt die Bauteile dort an.
      </p>
      <button class="bf-knopf primaer" :disabled="!uebersetzung.kommandos.length || laeuft || !kommandoweg" @click="anlegen">
        <CdeIcon :name="laeuft ? 'busy' : 'bimfy'" :size="14" />
        {{ laeuft ? `legt an … ${fortschritt} / ${uebersetzung.kommandos.length}` : `${uebersetzung.kommandos.length} Bauteile anlegen` }}
      </button>
      <p v-if="meldung" class="bf-meldung" :class="meldung.art">{{ meldung.text }}</p>
    </div>

    <div v-else-if="!dateiText" class="bf-leer">
      <b>Was BIMFY liest</b>
      <ul>
        <li><b>DXF</b> aus dem Vermessungs- oder CAD-Plan: Linien, Polylinien, Kreise, Punkte, 3D-Flächen. Der Layer entscheidet, was entsteht.</li>
        <li><b>ISYBAU-XML</b>: Schächte und Haltungen mit Sohlhöhen und Nennweite.</li>
        <li><b>XYZ, CSV, TXT</b>: Punktlisten der Vermessung, der Punktcode ist die Ebene.</li>
        <li><b>GeoJSON</b> in Metern, <b>OBJ</b> und <b>STL</b> als Körper.</li>
      </ul>
    </div>
  </div>
</template>

<script setup>
/**
 * BIMFY — Geometrie (2D/3D) wird IFC-Bauteil.
 *
 * Die Tafel ist nur Oberfläche: lesen (`services/bimfy/Geometrieleser.js`),
 * vorschlagen und Kommandos bauen (`services/bimfy/Uebersetzer.js`), absetzen
 * über den Kommandoweg der Fenster (`useKommandoweg`) — dieselbe Engstelle wie
 * das Cockpit und das Merkmalsfenster. Danach wird der Vorgang über
 * `wendeEintragAn` ans Modell gebracht, wie jede andere Bearbeitung.
 */
import { computed, ref, shallowRef } from 'vue';
import CdeIcon from './ui/CdeIcon.vue';
import CdeCardHeader from './ui/CdeCardHeader.vue';
import CdeIconButton from './ui/CdeIconButton.vue';
import { useKommandoweg } from '../composables/useKommandoweg.js';
import { useViewerApi } from '../composables/viewerApi.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { rahmenOhneBezug } from '../services/kommando/Kommando.js';
import { rezeptNach, warumNichtSchreibbar } from '../services/Bauteilrezepte.js';
import { ANNAHME, FORMATE, endungVon, liesGeometrien } from '../services/bimfy/Geometrieleser.js';
import { ausdehnung, gruppiere, kommandosFuer, rezepteFuerZeile } from '../services/bimfy/Uebersetzer.js';

const ARTEN = Object.freeze({ punkt: 'Punkt', zug: 'Zug', umriss: 'Umriss', koerper: 'Körper' });
const formatListe = [...new Set(Object.keys(FORMATE).map(e => e.toUpperCase()))].join(' · ');

const bearbeitung = useBearbeitung();
// Ohne Viewer (etwa im Register) gibt es keinen Ort, an dem Bauteile entstehen.
let kommandoweg = null, api = null;
try { kommandoweg = useKommandoweg(); api = useViewerApi(); } catch { kommandoweg = null; }

const dateiName = ref('');
const dateiText = ref('');
const format = ref('');
const zOben = ref(true);
const reihenfolge = ref('');
const lage = ref('projekt');
const grundhoehe = ref('');
const ziehtDarueber = ref(false);

const geometrien = shallowRef([]);
const warnungen = ref([]);
const zeilen = ref([]);
const laeuft = ref(false);
const fortschritt = ref(0);
const meldung = ref(null);

const istPunktliste = computed(() => ['xyz', 'csv', 'txt'].includes(format.value));

function lesen() {
  const aus = liesGeometrien(dateiName.value, dateiText.value,
    { zOben: zOben.value, ...(reihenfolge.value ? { reihenfolge: reihenfolge.value } : {}) });
  format.value = aus.format;
  geometrien.value = aus.geometrien;
  warnungen.value = aus.warnungen;
  zeilen.value = gruppiere(aus.geometrien);
  meldung.value = null;
}

/**
 * Text einer Datei in IHRER Kodierung: ISYBAU nennt sie im XML-Kopf (oft
 * ISO-8859-1), ältere DXF schreiben Windows-1252. Als UTF-8 gelesen würden
 * aus „Schacht Süd" Fragezeichen.
 */
async function leseText(datei) {
  const bytes = new Uint8Array(await datei.arrayBuffer());
  const kopf = new TextDecoder('ascii').decode(bytes.slice(0, 200));
  const genannt = /encoding=["']([\w-]+)["']/i.exec(kopf)?.[1];
  if (genannt) {
    try { return new TextDecoder(genannt).decode(bytes); } catch { /* unbekannte Kodierung: weiter unten */ }
  }
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { return new TextDecoder('windows-1252').decode(bytes); }
}

async function laden(datei) {
  if (!datei) return;
  dateiName.value = datei.name;
  dateiText.value = await leseText(datei);
  zOben.value = FORMATE[endungVon(datei.name)]?.zOben ?? true;
  reihenfolge.value = '';
  lesen();
}
const onDatei = (e) => laden(e.target.files?.[0]);
function onDrop(e) { ziehtDarueber.value = false; laden(e.dataTransfer?.files?.[0]); }
const neuLesen = () => lesen();

function verwerfen() {
  dateiName.value = ''; dateiText.value = ''; format.value = '';
  geometrien.value = []; warnungen.value = []; zeilen.value = []; meldung.value = null;
}

const klasseVon = (id) => String(rezeptNach(id)?.kategorieVorgabe ?? '').toUpperCase();
const klasseFalsch = (z) => warumNichtSchreibbar(z.kategorie, { raum: !!rezeptNach(z.rezept)?.raum });

/** Versatz und Grundhöhe — was die Zeichnung nicht selbst weiss. */
const optionen = computed(() => {
  const h = Number(String(grundhoehe.value).replace(',', '.'));
  const rahmen = bearbeitung.rahmen ?? rahmenOhneBezug();
  const ursprung = rahmen.nachProjekt({ x: 0, y: 0, z: 0 });
  return {
    basisHoehe: String(grundhoehe.value).trim() && Number.isFinite(h) ? h : null,
    versatz: lage.value === 'lokal' ? { ost: ursprung.ost, nord: ursprung.nord } : null,
  };
});

const uebersetzung = computed(() => kommandosFuer(zeilen.value, optionen.value));

/** Draufsicht: Nord oben, eine Breite von 1000 Einheiten. */
const vorschau = computed(() => {
  const a = ausdehnung(geometrien.value);
  if (!a) return null;
  const breite = Math.max(a.maxO - a.minO, a.maxN - a.minN, 1e-6);
  const s = 1000 / breite;
  const x = (p) => ((p.ost - a.minO) * s).toFixed(1);
  const y = (p) => ((a.maxN - p.nord) * s).toFixed(1);
  const aktiv = new Map(zeilen.value.flatMap(z => z.geometrien.map(g => [g.id, z.aktiv])));
  // Grosse Punktlisten zeichnen wir gedünnt — die Vorschau ist eine Übersicht.
  const schritt = Math.max(1, Math.ceil(geometrien.value.length / 4000));
  const formen = geometrien.value.filter((_, i) => i % schritt === 0).map(g => {
    const umriss = g.art === 'koerper' ? null : g.punkte;
    return {
      id: g.id, art: g.art, aktiv: aktiv.get(g.id) ?? true,
      ...(g.art === 'punkt' ? { x: x(g.punkte[0]), y: y(g.punkte[0]) }
        : { punkte: (umriss ?? huelleGrob(g.punkte)).map(p => `${x(p)},${y(p)}`).join(' ') }),
    };
  });
  const w = (a.maxO - a.minO) * s, h = (a.maxN - a.minN) * s;
  const rand = 20;
  return { viewBox: `${-rand} ${-rand} ${Math.max(w, 1) + 2 * rand} ${Math.max(h, 1) + 2 * rand}`, formen, punktR: 4 };
});

/** Für die Vorschau genügt beim Körper sein Begrenzungsrechteck in Ost/Nord. */
function huelleGrob(punkte) {
  let minO = Infinity, minN = Infinity, maxO = -Infinity, maxN = -Infinity;
  for (const p of punkte) { minO = Math.min(minO, p.ost); maxO = Math.max(maxO, p.ost); minN = Math.min(minN, p.nord); maxN = Math.max(maxN, p.nord); }
  return [{ ost: minO, nord: minN }, { ost: maxO, nord: minN }, { ost: maxO, nord: maxN }, { ost: minO, nord: maxN }];
}

async function anlegen() {
  if (!kommandoweg || laeuft.value) return;
  meldung.value = null;
  // Anlegen heisst bearbeiten — mit den echten Sperren des Viewers (Einheit, Status).
  if (!bearbeitung.modusAn && !api?.bearbeitenEin?.()) {
    meldung.value = { art: 'fehler', text: 'Bearbeiten lässt sich gerade nicht einschalten — oben steht, warum.' };
    return;
  }
  laeuft.value = true;
  fortschritt.value = 0;
  const geschrieben = [];
  const abgelehnt = [];
  try {
    for (const { geo, kommando } of uebersetzung.value.kommandos) {
      const erg = await kommandoweg.absetzen(kommando);
      if (erg.ausgefuehrt) geschrieben.push(...erg.eintraege);
      else abgelehnt.push(`${geo.name || geo.ebene || geo.id}: ${erg.grund}`);
      fortschritt.value++;
    }
    if (geschrieben.length) await api?.wendeEintragAn?.(geschrieben.length > 1 ? geschrieben : geschrieben[0]);
  } finally {
    laeuft.value = false;
  }
  meldung.value = abgelehnt.length
    ? { art: 'fehler', text: `${geschrieben.length} angelegt, ${abgelehnt.length} abgelehnt — ${abgelehnt[0]}` }
    : { art: 'ok', text: `${geschrieben.length} Bauteile angelegt. Jedes steht im Verlauf und lässt sich zurücknehmen.` };
}
</script>

<style scoped>
.bimfy { display: flex; flex-direction: column; gap: var(--cde-gap); padding-bottom: var(--cde-gap); }
.bf-satz { margin: 0; color: var(--cde-text-dim); font-size: var(--cde-font-sm); line-height: 1.4; }

.bf-ablage {
  display: flex; align-items: center; gap: var(--cde-gap);
  padding: var(--cde-gap); border: 1px dashed var(--cde-line-strong); border-radius: var(--cde-radius);
  color: var(--cde-text); font-size: var(--cde-font-sm); cursor: pointer;
}
.bf-ablage.ueber, .bf-ablage:hover { background: var(--cde-fill-hover); border-color: var(--cde-accent-line); }
.bf-ablage input { display: none; }
.bf-ablage small { color: var(--cde-text-dim); }

.bf-optionen { display: grid; grid-template-columns: 1fr 1fr; gap: var(--cde-gap-sm); }
.bf-optionen label { display: grid; gap: 2px; font-size: var(--cde-font-xs); color: var(--cde-text-dim); }
.bf-optionen select, .bf-optionen input, .bf-zeilen select, .bf-zeilen input[type='text'] {
  width: 100%; min-width: 0; padding: 0.2rem 0.3rem;
  background: var(--cde-surface); color: var(--cde-text);
  border: 1px solid var(--cde-line); border-radius: var(--cde-radius-sm); font-size: var(--cde-font-sm);
}
.bf-zeilen input.falsch { border-color: var(--cde-danger); }

.bf-warnungen { margin: 0; padding: 0; list-style: none; display: grid; gap: 2px; font-size: var(--cde-font-xs); color: var(--cde-warn); }

.bf-vorschau { width: 100%; height: 180px; background: var(--cde-sunken); border-radius: var(--cde-radius-sm); }
.bf-form polyline, .bf-form polygon { fill: none; stroke: var(--cde-accent); stroke-width: 2; vector-effect: non-scaling-stroke; }
.bf-form.umriss polygon, .bf-form.koerper polygon { fill: var(--cde-accent-fill); }
.bf-form circle { fill: var(--cde-accent); }
.bf-form.aus polyline, .bf-form.aus polygon { stroke: var(--cde-text-faint); fill: none; }
.bf-form.aus circle { fill: var(--cde-text-faint); }

.bf-zeilen { width: 100%; border-collapse: collapse; font-size: var(--cde-font-sm); table-layout: fixed; }
.bf-zeilen th { text-align: left; font-weight: 500; color: var(--cde-text-dim); font-size: var(--cde-font-xs); padding: 0 0.2rem 0.2rem; }
.bf-zeilen th:first-child { width: 1.6rem; }
.bf-zeilen td { padding: 0.25rem 0.2rem; vertical-align: top; border-top: 1px solid var(--cde-line-soft); }
.bf-zeilen td small { display: block; color: var(--cde-text-dim); font-size: var(--cde-font-xs); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bf-zeilen tr.aus { opacity: 0.55; }
.bf-ebene { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.bf-fuss { display: grid; gap: var(--cde-gap-sm); }
.bf-hinweis { margin: 0; font-size: var(--cde-font-xs); color: var(--cde-text-dim); }
.bf-knopf {
  display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem;
  padding: 0.45rem 0.7rem; border-radius: var(--cde-radius-sm); border: 1px solid var(--cde-accent-line);
  background: var(--cde-accent-fill); color: var(--cde-text-bright); font-size: var(--cde-font-sm); cursor: pointer;
}
.bf-knopf:hover:not(:disabled) { background: var(--cde-accent-fill-hi); }
.bf-knopf:disabled { opacity: 0.45; cursor: default; }
.bf-meldung { margin: 0; font-size: var(--cde-font-sm); }
.bf-meldung.ok { color: var(--cde-success); }
.bf-meldung.fehler { color: var(--cde-danger-soft); }

.bf-leer { font-size: var(--cde-font-sm); color: var(--cde-text-dim); }
.bf-leer ul { margin: 0.3rem 0 0; padding-left: 1.1rem; display: grid; gap: 0.25rem; }
</style>
