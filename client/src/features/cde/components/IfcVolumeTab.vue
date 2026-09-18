<template>
  <div class="vol-tab cde-card">
    <CdeCardHeader icon="volume" titel="Volumen-Übersicht (m³)">
      <CdeIconButton icon="refresh" titel="Neu berechnen" :busy="loading" @click="$emit('refresh')" />
    </CdeCardHeader>

    <div v-if="loading" class="cde-state-msg">Berechne…</div>
    <div v-else-if="!result || !result.byCategory.size" class="cde-state-msg">
      <CdeIcon name="volume" :size="22" />
      Keine Geometrie geladen — Volumen werden aus den Bounding-Boxen abgeleitet.
    </div>

    <template v-else>
      <!-- Summe oben -->
      <div class="cde-totals">
        <div class="cde-total-cell">
          <div class="cde-total-label">Σ Volumen</div>
          <div class="cde-total-value">{{ fmt(result.totals.volume_m3) }} m³</div>
        </div>
        <div class="cde-total-cell">
          <div class="cde-total-label">Elemente</div>
          <div class="cde-total-value">{{ result.totals.count }}</div>
        </div>
        <div class="cde-total-cell">
          <div class="cde-total-label">Qto-Quote</div>
          <div class="cde-total-value" :title="'Anteil der Elemente mit Modell-Quantities (Qto_*) statt BBox-Näherung'">
            {{ Math.round((result.totals.qtoShare ?? 0) * 100) }} %
          </div>
        </div>
      </div>

      <!-- Filter -->
      <div class="filter-row">
        <label class="filter-check">
          <input type="checkbox" v-model="onlyVolumeBilled" />
          Nur „Volumen-Positionen" (Wände, Decken, Stützen, Fundamente…)
        </label>
      </div>

      <!-- Tabelle -->
      <div class="cde-table-wrap">
        <table class="cde-table">
          <thead>
            <tr>
              <th class="col-cat sortable" @click="setSort('name')">
                Kategorie
                <CdeIcon v-if="sortKey === 'name'" class="sort-arrow" :name="sortDir === 'asc' ? 'chevron-up' : 'chevron-down'" :size="11" />
              </th>
              <th class="col-count sortable" @click="setSort('count')">
                Anzahl
                <CdeIcon v-if="sortKey === 'count'" class="sort-arrow" :name="sortDir === 'asc' ? 'chevron-up' : 'chevron-down'" :size="11" />
              </th>
              <th class="col-vol sortable" @click="setSort('volume')">
                Σ m³
                <CdeIcon v-if="sortKey === 'volume'" class="sort-arrow" :name="sortDir === 'asc' ? 'chevron-up' : 'chevron-down'" :size="11" />
              </th>
              <th class="col-area sortable" @click="setSort('area')">
                Σ m²
                <CdeIcon v-if="sortKey === 'area'" class="sort-arrow" :name="sortDir === 'asc' ? 'chevron-up' : 'chevron-down'" :size="11" />
              </th>
              <th class="col-len sortable" @click="setSort('length')">
                Σ m
                <CdeIcon v-if="sortKey === 'length'" class="sort-arrow" :name="sortDir === 'asc' ? 'chevron-up' : 'chevron-down'" :size="11" />
              </th>
              <th class="col-src" title="Herkunft: Qto = Modell-Quantities, BBox = Näherung">Quelle</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in sortedRows"
              :key="row.category"
              class="klickbar"
              :class="{ 'is-billed': isBilled(row.category) }"
              @click="$emit('select-category', row.category)"
            >
              <td class="col-cat">
                <span class="cat-name">{{ row.category.replace(/^IFC/, '') }}</span>
                <CdeIcon v-if="isBilled(row.category)" class="cat-badge" name="billed" :size="11" />
              </td>
              <td class="col-count">{{ row.count }}</td>
              <td class="col-vol">{{ fmt(row.volume_m3) }}</td>
              <td class="col-area">{{ fmt(row.area_m2) }}</td>
              <td class="col-len">{{ fmt(row.length_m) }}</td>
              <td class="col-src">
                <span class="cde-badge" :class="srcClass(row)">{{ srcLabel(row) }}</span>
              </td>
            </tr>
            <tr v-if="!sortedRows.length" class="leer">
              <td colspan="6">Keine Kategorien passen zum Filter.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p class="cde-hint">
        <CdeIcon name="info" :size="12" />
        <span>
          „Qto" = Mengen aus den Modell-Quantities (Qto_*BaseQuantities) des Autorenwerkzeugs.
          „BBox" = Näherung aus der BoundingBox — nur für Kennwerte (LP 2-3) geeignet.
        </span>
      </p>
    
  <!-- SANIERUNGSMENGEN (Stufe 14.11). Getrennt von den Bauteilmengen darüber,
       weil sie eine andere Frage beantworten: dort geht es um das Modell, hier
       um die ENTSCHEIDUNGEN darin. „Dieser Strang bekommt einen Liner" wird
       erst dann zu etwas, wenn danebensteht, wie viele Meter DN 300 Beton das
       sind. -->
  <div class="cde-card">
    <CdeCardHeader icon="quality" titel="Sanierungsmengen" />
    <div v-if="!sanierung.zeilen.length" class="cde-state-msg">
      <CdeIcon name="quality" :size="22" />
      Noch keine Maßnahme festgelegt. Am Bauteil unter „Maßnahme festlegen",
      oder für einen ganzen Abschnitt unter „Sanierungsabschnitt festlegen".
    </div>
    <div v-else class="cde-table-wrap">
      <table class="cde-table">
        <thead>
          <tr><th>Maßnahme</th><th>DN</th><th>Material</th><th>Anzahl</th><th>Länge</th></tr>
        </thead>
        <tbody>
          <tr v-for="(z, i) in sanierung.zeilen" :key="i">
            <td>{{ titelVon(z.massnahme) }}</td>
            <td class="mono">{{ z.dn ?? '—' }}</td>
            <td>{{ z.material }}</td>
            <td class="mono">{{ z.anzahl }}</td>
            <td class="mono">{{ z.laenge.toFixed(2) }} m</td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td colspan="3"><strong>Summe</strong></td>
            <td class="mono"><strong>{{ sanierung.summe.anzahl }}</strong></td>
            <td class="mono"><strong>{{ sanierung.summe.laenge.toFixed(2) }} m</strong></td>
          </tr>
        </tfoot>
      </table>
    </div>
  </div>

  <!-- ERDMASSEN (Stufe 15). Nichts davon ist gespeichert: jede Zeile
       entsteht aus dem Journal (Quelle + Operationsliste) und der Ableitung
       des Quellrasters — Ausgangszustand gegen geformten Zustand, Aushub
       und Auftrag getrennt. -->
  <div class="cde-card">
    <CdeCardHeader icon="terrain" titel="Erdmassen" />
    <div v-if="!erdmassen.length" class="cde-state-msg">
      <CdeIcon name="terrain" :size="22" />
      Noch kein Gelände geformt. Am Gelände unter „Gerinne einschneiden"
      oder „Planum herstellen" — der Auszug entsteht von selbst.
    </div>
    <div v-else class="cde-table-wrap">
      <table class="cde-table">
        <thead>
          <!-- Teil XIV: ZWEI Wege zur Masse — Raster (Zellsummen) und Körper
               (Divergenzsatz am geschlossenen Aushubkörper). Die Abweichung
               ist die Gegenprobe; über 2 % meldet die Prüfliste. -->
          <tr><th>Gelände</th><th>Aushub</th><th title="Aushub mal Auflockerungsfaktor — die Masse, die abgefahren wird">Lose</th><th title="Auftragskörper — beim Kanalgraben die Verfüllung (Graben minus Rohr)">Auftrag / Verf.</th><th title="Volumen des Aushubkörpers">Körper</th><th title="Gegenprobe Körper gegen Raster">Abw.</th></tr>
        </thead>
        <tbody>
          <tr v-for="(z, i) in erdmassen" :key="i" :class="{ gesamt: z.gesamt }">
            <td>{{ z.name }}<span v-if="z.gesamt && z.vorgaenge != null" class="zusatz"> · {{ z.vorgaenge }} {{ z.vorgaenge === 1 ? 'Vorgang' : 'Vorgänge' }}</span></td>
            <td class="mono">{{ z.aushub == null ? (z.grund ?? '—') : `${z.aushub.toFixed(1)} m³` }}</td>
            <td class="mono" :title="z.auflockerung != null ? `Auflockerung × ${z.auflockerung.toFixed(2)}` : ''">{{ z.aushubLose == null ? '—' : `${z.aushubLose.toFixed(1)} m³` }}</td>
            <td class="mono" :title="z.rohrVolumen != null ? `Rohr ${z.rohrVolumen.toFixed(2)} m³ abgezogen` : ''">{{ z.auftrag != null ? `${z.auftrag.toFixed(1)} m³` : (z.verfuellung != null ? `${z.verfuellung.toFixed(1)} m³ Verf.` : '—') }}</td>
            <td class="mono">{{ z.aushubKoerper == null ? '—' : `${z.aushubKoerper.toFixed(1)} m³` }}</td>
            <td class="mono" :class="{ warn: abweichung(z) > 2 }">{{ abweichung(z) == null ? '—' : `${abweichung(z).toFixed(1)} %` }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
  </div>
</template>

<script setup>
import { ref, computed, watchEffect } from 'vue';
import { VOLUME_BILLED_CATEGORIES } from '../services/QuantitySummary.js';
import CdeIcon from './ui/CdeIcon.vue';
import CdeCardHeader from './ui/CdeCardHeader.vue';
import CdeIconButton from './ui/CdeIconButton.vue';
import { useAenderungen } from '../stores/useAenderungen.js';
import { useViewerApi } from '../composables/viewerApi.js';
import { mengenNachMassnahme, massnahmeNach } from '../services/Sanierung.js';
import { rezeptNach } from '../services/Bauteilrezepte.js';

const aenderungen = useAenderungen();
const api = useViewerApi();

const props = defineProps({
  result:  { type: Object,  default: null },  // { byCategory: Map, totals }
  loading: { type: Boolean, default: false },
});
defineEmits(['refresh', 'select-category']);

/**
 * Der Mengenauszug je Maßnahme.
 *
 * Abgeleitet, nicht gespeichert — wie alles Gerechnete in diesem Feature. Der
 * Stand kommt aus dem Journal, Länge und Nennweite aus den Achsen, das Material
 * aus dem Merkmalssatz. Die Rechnung selbst steht rein in `Sanierung.js`.
 */
const sanierung = computed(() => {
  void aenderungen.anzahl;                       // reaktiver Anker aufs Journal
  const bauteile = api.mengenGrundlage?.() ?? [];
  return mengenNachMassnahme({
    bauteile,
    stand: aenderungen.wirksamerStand('massnahme'),
    merkmale: new Map(bauteile.map(b => [b.globalId, b.merkmale ?? {}])),
  });
});

/**
 * Erdmassen — asynchron, weil das Quellraster über die Engine abgeleitet
 * wird. `watchEffect` hängt an der Journalgrösse: jede Formung (und jedes
 * „zurück") rechnet die Zeilen neu; ein veralteter Lauf wird über die
 * Laufnummer verworfen, damit langsame Antworten schnelle nicht überholen.
 */
const erdmassen = ref([]);
let _erdmassenLauf = 0;
watchEffect(async () => {
    const stand = aenderungen.wirksamerStand('erzeugt');
    // Jeder Erdbau-Vorgang (das Rezept sagt es selbst: `erdbau`), der
    // Altbestand `gelaende` und die ANZEIGE (Stufe 1: die Zeile „Gesamt",
    // die die Summe der Vorgänge sein muss). Die alte Namensliste vergass
    // die Bauwerksgrube.
    // Was in den Mengen-Reiter gehört, sagt das Rezept: ein Erdbau oder ein Gelände.
    const bauplaene = [...stand.values()].filter(b => { const r = rezeptNach(b?.rezept); return !!(r?.erdbau || r?.gelaendeform); });
    const lauf = ++_erdmassenLauf;
    const zeilen = bauplaene.length ? await api.erdmassen?.(bauplaene) ?? [] : [];
    if (lauf === _erdmassenLauf) erdmassen.value = zeilen;
});

/** Gegenprobe in Prozent — die grössere der beiden (Aushub, Auftrag). */
function abweichung(z) {
  const rel = (koerper, raster) => (koerper == null || raster == null || raster < 1e-6
    ? null : Math.abs(koerper - raster) / raster * 100);
  const a = rel(z.aushubKoerper, z.aushub);
  const b = rel(z.auftragKoerper, z.auftrag);
  if (a == null && b == null) return null;
  return Math.max(a ?? 0, b ?? 0);
}

function titelVon(wert) {
  return massnahmeNach(wert)?.titel ?? wert;
}

const sortKey = ref('volume');
const sortDir = ref('desc');
const onlyVolumeBilled = ref(false);

function setSort(key) {
  if (sortKey.value === key) sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc';
  else { sortKey.value = key; sortDir.value = key === 'name' ? 'asc' : 'desc'; }
}

function isBilled(cat) { return VOLUME_BILLED_CATEGORIES.has(cat); }

/** Herkunfts-Badge: Qto / Mesh / BBox oder gemischt (Sprint G: 'mesh' neu). */
function srcLabel(row) {
  const q = row.sources?.qto ?? 0, m = row.sources?.mesh ?? 0, b = row.sources?.bbox ?? 0;
  const total = q + m + b;
  if (!total) return '–';
  if (q === total) return 'Qto';
  if (m === total) return 'Mesh';
  if (b === total) return 'BBox';
  const parts = [];
  if (q) parts.push(`Qto ${Math.round(q / total * 100)} %`);
  if (m) parts.push(`Mesh ${Math.round(m / total * 100)} %`);
  return parts.join(' · ') || 'BBox';
}
function srcClass(row) {
  const q = row.sources?.qto ?? 0, m = row.sources?.mesh ?? 0, b = row.sources?.bbox ?? 0;
  if ((q || m) && !b) return 'ok';
  if (!q && !m && b) return 'warn';
  return 'mute';
}

const sortedRows = computed(() => {
  if (!props.result?.byCategory) return [];
  let rows = [];
  for (const [category, data] of props.result.byCategory.entries()) {
    if (onlyVolumeBilled.value && !isBilled(category)) continue;
    rows.push({ category, ...data });
  }
  const dir = sortDir.value === 'asc' ? 1 : -1;
  rows.sort((a, b) => {
    let av, bv;
    if (sortKey.value === 'name')  { av = a.category; bv = b.category; return av.localeCompare(bv) * dir; }
    if (sortKey.value === 'count') { av = a.count;       bv = b.count; }
    else if (sortKey.value === 'area')   { av = a.area_m2 ?? 0;  bv = b.area_m2 ?? 0; }
    else if (sortKey.value === 'length') { av = a.length_m ?? 0; bv = b.length_m ?? 0; }
    else                                  { av = a.volume_m3;    bv = b.volume_m3; }
    return (av - bv) * dir;
  });
  return rows;
});

function fmt(n) {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v) || v === 0) return '–';
  return v.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
</script>

<style scoped>
/* Leitfarbe dieser Kachel — Kopf, Summenleiste und Tabelle lesen sie
   (Definition der Bausteine: styles/theme.css). */
.vol-tab { --card-accent: var(--cde-violet); font-size: 0.78rem; color: var(--cde-text); }

.filter-row { padding: 0 0.1rem; }
.filter-check {
  display: flex; align-items: center; gap: 0.4rem;
  font-size: var(--cde-font-sm); color: var(--cde-text-soft); cursor: pointer;
}
.filter-check input { accent-color: var(--card-accent); }

/* Spaltenbetonung: das Volumen ist der Wert, um den es hier geht. */
.col-vol { font-weight: 600; color: color-mix(in srgb, var(--card-accent) 75%, var(--cde-text-bright)); }
.col-area, .col-len { color: var(--cde-text-dim); }

tr.is-billed td.col-cat { color: var(--card-accent); font-weight: 600; }

.cat-badge { display: inline-block; margin-left: 0.25rem; color: var(--card-accent); vertical-align: -1px; }
.mono.warn { color: var(--cde-warn); font-weight: 600; }
/* Stufe 1: die Zeile „Gesamt" aus der Anzeige — die Summe der Vorgänge darüber. */
tr.gesamt td { font-weight: 600; border-top: 1px solid var(--cde-line-strong); }
tr.gesamt .zusatz { color: var(--cde-text-dim); font-weight: 400; }
</style>
