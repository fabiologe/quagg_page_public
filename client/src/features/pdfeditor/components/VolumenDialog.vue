<template>
  <Teleport to="body">
    <div class="pdfed-vol-hintergrund" @pointerdown.self="schliesse">
      <div class="pdfed-vol-dialog" @keydown.esc="schliesse">
        <header class="pdfed-vol-kopf">
          <PdfIcon name="volumen" :size="20" />
          <span>Aushubvolumen</span>
          <button class="pdfed-btn" title="Schließen" @click="schliesse">
            <PdfIcon name="schliessen" />
          </button>
        </header>

        <p v-if="anfrage?.quelle === 'flaeche'" class="pdfed-vol-text">
          Die angetippte Flächenmessung wird zur Sohle der Baugrube (rückgängig möglich).
        </p>

        <section v-if="!kal" class="pdfed-vol-block pdfed-vol-unkalibriert">
          <PdfIcon name="warnung" :size="16" />
          <span>Diese Seite ist nicht kalibriert — ohne Maßstab gibt es kein Volumen.</span>
          <button class="pdfed-btn" @click="kalibriere">Jetzt kalibrieren</button>
        </section>

        <section class="pdfed-vol-block pdfed-vol-felder">
          <div class="pdfed-vol-reihe">
            <span class="pdfed-vol-label">Tiefe</span>
            <span class="pdfed-vol-eingabe">
              <input
                ref="tiefeEl"
                v-model="tiefe"
                type="number"
                inputmode="decimal"
                min="0.01"
                step="0.1"
              > m
            </span>
          </div>

          <div class="pdfed-vol-reihe">
            <span class="pdfed-vol-label">Böschung</span>
            <div class="pdfed-vol-schnell">
              <button
                v-for="o in NEIGUNGEN"
                :key="o.n"
                class="pdfed-btn"
                :class="{ 'ist-aktiv': neigungWahl === String(o.n) }"
                @click="neigungWahl = String(o.n)"
              >{{ o.titel }}</button>
              <button
                class="pdfed-btn"
                :class="{ 'ist-aktiv': neigungWahl === 'eigene' }"
                @click="neigungWahl = 'eigene'"
              >eigene</button>
              <span v-if="neigungWahl === 'eigene'" class="pdfed-vol-eingabe">
                1 : <input v-model="neigungEigene" type="number" inputmode="decimal" min="0" step="0.1">
              </span>
            </div>
          </div>

          <div class="pdfed-vol-reihe">
            <span class="pdfed-vol-label">Polygon ist</span>
            <div class="pdfed-vol-radios">
              <label class="pdfed-vol-radio">
                <input v-model="modus" type="radio" value="sohle"> Sohle — Böschung nach außen
              </label>
              <label class="pdfed-vol-radio">
                <input v-model="modus" type="radio" value="oberkante"> Oberkante — Böschung nach innen
              </label>
            </div>
          </div>

          <div class="pdfed-vol-reihe">
            <span class="pdfed-vol-label">Auflockerung</span>
            <div class="pdfed-vol-schnell">
              <button
                v-for="f in AUFLOCKERUNGEN"
                :key="f"
                class="pdfed-btn"
                :class="{ 'ist-aktiv': auflockerungWahl === String(f) }"
                @click="auflockerungWahl = String(f)"
              >× {{ DE.format(f) }}</button>
              <button
                class="pdfed-btn"
                :class="{ 'ist-aktiv': auflockerungWahl === 'eigene' }"
                @click="auflockerungWahl = 'eigene'"
              >eigene</button>
              <span v-if="auflockerungWahl === 'eigene'" class="pdfed-vol-eingabe">
                × <input v-model="auflockerungEigene" type="number" inputmode="decimal" min="1" step="0.05">
              </span>
            </div>
          </div>

          <label class="pdfed-vol-radio">
            <input v-model="rechenwegAnzeigen" type="checkbox"> Rechenweg am Plan anzeigen (auch im Export)
          </label>
        </section>

        <section class="pdfed-vol-block">
          <template v-if="ergebnis">
            <pre class="pdfed-vol-rechenweg">{{ zeilen.join('\n') }}</pre>
            <p class="pdfed-vol-ergebnis">
              <strong>{{ formatVolumen(ergebnis.V) }}</strong>
              <span v-if="auflockerungWert !== 1" class="pdfed-vol-ergebnis-locker">
                aufgelockert {{ formatVolumen(ergebnis.V * auflockerungWert) }}
              </span>
            </p>
            <p v-for="w in ergebnis.warnungen" :key="w" class="pdfed-vol-warnung">
              <PdfIcon name="warnung" :size="14" /> {{ w }}
            </p>
          </template>
          <p v-else class="pdfed-vol-text">
            Tiefe und Böschung eingeben — der Rechenweg erscheint hier live.
          </p>
        </section>

        <footer class="pdfed-vol-aktionen">
          <button class="pdfed-btn" @click="schliesse">Abbrechen</button>
          <button v-if="annot?.kind === 'volumen'" class="pdfed-btn" @click="alsFlaeche">
            Als Fläche behalten
          </button>
          <button class="pdfed-btn ist-primaer" :disabled="!kannUebernehmen" @click="uebernehme">
            <PdfIcon name="ok" /> Übernehmen
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
/**
 * VolumenDialog — Parameter einer Baugrube (Stufe 17): Tiefe, Böschung
 * 1:n, Sohle/Oberkante, Auflockerung. Der Rechenweg erscheint live und ist
 * DERSELBE Text wie am Plan und im Export (VolumenMath.rechenwegZeilen).
 * Öffnet/schließt über toolStore.volumenAnfrage (Muster CalibrateDialog);
 * verschwindet die Annotation (Undo), schließt sich der Dialog selbst.
 */
import { ref, computed, watch, onMounted, nextTick } from 'vue';
import PdfIcon from './PdfIcon.vue';
import { useToolStore, NEIGUNGEN, AUFLOCKERUNGEN } from '../stores/useToolStore';
import { useAnnotStore } from '../stores/useAnnotStore';
import { useDocStore } from '../stores/useDocStore';
import { kalibrierungFuerSeite } from '../services/MeasureMath';
import { volumenAusPolygon, rechenwegZeilen, formatVolumen } from '../services/VolumenMath';

const DE = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });

const toolStore = useToolStore();
const annotStore = useAnnotStore();
const docStore = useDocStore();
const tiefeEl = ref(null);

const anfrage = computed(() => toolStore.volumenAnfrage);
const annot = computed(() => annotStore.items.find(a => a.id === anfrage.value?.id) ?? null);

// Startwerte: aus der Baugrube selbst, sonst die zuletzt übernommenen Vorgaben.
const start = annot.value?.kind === 'volumen' ? annot.value : toolStore.volumenVorgaben;
const tiefe = ref(String(start.tiefeM ?? 2));
const neigungWahl = ref(NEIGUNGEN.some(o => o.n === start.neigungN) ? String(start.neigungN) : 'eigene');
const neigungEigene = ref(String(start.neigungN ?? 1));
const modus = ref(start.modus ?? 'sohle');
const auflockerungWahl = ref(AUFLOCKERUNGEN.includes(start.auflockerung) ? String(start.auflockerung) : 'eigene');
const auflockerungEigene = ref(String(start.auflockerung ?? 1.25));
const rechenwegAnzeigen = ref(annot.value?.rechenwegAnzeigen !== false);

const zahl = (v) => Number(String(v ?? '').replace(',', '.'));
const tiefeWert = computed(() => zahl(tiefe.value));
const neigungWert = computed(() =>
  neigungWahl.value === 'eigene' ? zahl(neigungEigene.value) : Number(neigungWahl.value));
const auflockerungWert = computed(() =>
  auflockerungWahl.value === 'eigene' ? zahl(auflockerungEigene.value) : Number(auflockerungWahl.value));

const kal = computed(() => kalibrierungFuerSeite(docStore.meta?.kalibrierung, anfrage.value?.page ?? 0));
const ergebnis = computed(() => (kal.value && annot.value)
  ? volumenAusPolygon({
    points: annot.value.points, realProPt: kal.value.realProPt,
    tiefeM: tiefeWert.value, neigungN: neigungWert.value, modus: modus.value,
  })
  : null);
const zeilen = computed(() => rechenwegZeilen(ergebnis.value, { auflockerung: auflockerungWert.value }));

// Parameter dürfen auch unkalibriert gespeichert werden (Label sagt dann
// „unkalibriert") — nur eine Grube, die sich vor der Sohle schließt, nicht.
const kannUebernehmen = computed(() =>
  !!annot.value && tiefeWert.value > 0 && neigungWert.value >= 0
  && auflockerungWert.value > 0 && !ergebnis.value?.schliesstSich);

function schliesse() {
  toolStore.volumenAnfrage = null;
}

function kalibriere() {
  // Der Kalibrierdialog legt sich über diesen; danach rechnet der
  // Rechenweg hier live weiter.
  toolStore.kalibrierungAnfrage = { laengePt: null, page: anfrage.value?.page ?? null };
}

function uebernehme() {
  if (!kannUebernehmen.value) return;
  const parameter = {
    tiefeM: tiefeWert.value, neigungN: neigungWert.value,
    auflockerung: auflockerungWert.value, modus: modus.value,
  };
  annotStore.aktualisiere([{
    id: annot.value.id,
    patch: { kind: 'volumen', ...parameter, rechenwegAnzeigen: rechenwegAnzeigen.value },
  }]);
  toolStore.volumenVorgaben = { ...parameter };
  toolStore.speichereWerkzeugOptionen();
  toolStore.volumenAnfrage = null;
}

function alsFlaeche() {
  annotStore.aktualisiere([{ id: annot.value.id, patch: { kind: 'area' } }]);
  toolStore.volumenAnfrage = null;
}

watch(annot, (a) => { if (!a) toolStore.volumenAnfrage = null; });

onMounted(async () => {
  await nextTick();
  tiefeEl.value?.focus();
  tiefeEl.value?.select();
});
</script>

<style scoped>
.pdfed-vol-hintergrund {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 17, 20, 0.45);
}
.pdfed-vol-dialog {
  width: min(520px, calc(100vw - 32px));
  max-height: calc(100vh - 32px);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  background: var(--pdf-flaeche);
  color: var(--pdf-text);
  border: 1px solid var(--pdf-rand);
  border-radius: var(--pdf-radius);
  box-shadow: var(--pdf-schatten);
  font-family: var(--pdf-schrift);
}
.pdfed-vol-kopf {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 650;
}
.pdfed-vol-kopf > button { margin-left: auto; }
.pdfed-vol-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.pdfed-vol-text {
  margin: 0;
  font-size: 13px;
  color: var(--pdf-text-dim);
}
.pdfed-vol-unkalibriert {
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: var(--pdf-radius-klein);
  background: var(--pdf-akzent-weich);
  color: var(--pdf-warn);
  font-size: 13px;
}
.pdfed-vol-unkalibriert > span { flex: 1; min-width: 180px; color: var(--pdf-text); }
.pdfed-vol-reihe {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 10px;
}
.pdfed-vol-label {
  min-width: 96px;
  font-weight: 500;
}
.pdfed-vol-eingabe {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.pdfed-vol-eingabe input {
  width: 96px;
  min-height: 40px;
  padding: 0 10px;
  border: 1px solid var(--pdf-rand);
  border-radius: var(--pdf-radius-klein);
  background: var(--pdf-flaeche-2);
  color: var(--pdf-text);
  font: inherit;
  -webkit-user-select: text;
  user-select: text;
}
.pdfed-vol-schnell {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}
.pdfed-vol-schnell .pdfed-btn {
  min-height: 36px;
  padding: 0 10px;
  border: 1px solid var(--pdf-rand);
}
.pdfed-vol-radios {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.pdfed-vol-radio {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  cursor: pointer;
}
.pdfed-vol-rechenweg {
  margin: 0;
  padding: 10px 12px;
  border-radius: var(--pdf-radius-klein);
  background: var(--pdf-flaeche-2);
  border: 1px solid var(--pdf-rand);
  font-family: var(--pdf-schrift-mono);
  font-size: 12.5px;
  line-height: 1.55;
  white-space: pre-wrap;
  overflow-x: auto;
  -webkit-user-select: text;
  user-select: text;
}
.pdfed-vol-ergebnis {
  margin: 0;
  display: flex;
  align-items: baseline;
  gap: 12px;
  font-size: 20px;
}
.pdfed-vol-ergebnis-locker {
  font-size: 13px;
  color: var(--pdf-text-dim);
}
.pdfed-vol-warnung {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--pdf-warn);
}
.pdfed-vol-aktionen {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 6px;
}
</style>
