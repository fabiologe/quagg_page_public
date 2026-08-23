<template>
  <Teleport to="body">
    <div class="pdfed-kal-hintergrund" @pointerdown.self="schliesse">
      <div class="pdfed-kal-dialog">
        <header class="pdfed-kal-kopf">
          <PdfIcon name="kalibrieren" :size="20" />
          <span>Maßstab kalibrieren</span>
          <button class="pdfed-btn" title="Schließen" @click="schliesse">
            <PdfIcon name="schliessen" />
          </button>
        </header>

        <section v-if="anfrage?.laengePt" class="pdfed-kal-block">
          <p class="pdfed-kal-text">
            Die angetippte Referenzstrecke ist
            <strong>{{ papierLaengeMm }} mm</strong> auf dem Papier.
            Wie lang ist sie in Wirklichkeit?
          </p>
          <label class="pdfed-kal-feld">
            Tatsächliche Länge
            <span class="pdfed-kal-eingabe">
              <input
                ref="laengeEl"
                v-model="realLaenge"
                type="number"
                inputmode="decimal"
                min="0.01"
                step="0.01"
              > m
            </span>
          </label>
          <p v-if="abgeleiteterMassstab" class="pdfed-kal-hinweis">
            entspricht etwa Maßstab 1 : {{ abgeleiteterMassstab }}
          </p>
        </section>

        <section class="pdfed-kal-block">
          <p v-if="anfrage?.laengePt" class="pdfed-kal-oder">— oder direkt —</p>
          <label class="pdfed-kal-feld">
            Maßstab 1 :
            <span class="pdfed-kal-eingabe">
              <input v-model="massstab" type="number" inputmode="numeric" min="1" step="1" placeholder="100">
            </span>
          </label>
          <div class="pdfed-kal-schnell">
            <button
              v-for="m in MASSSTAEBE"
              :key="m"
              class="pdfed-btn"
              :class="{ 'ist-aktiv': Number(massstab) === m }"
              @click="massstab = String(m)"
            >1:{{ m }}</button>
          </div>
        </section>

        <section class="pdfed-kal-block">
          <label class="pdfed-kal-radio">
            <input v-model="geltung" type="radio" value="dokument"> Für das ganze Dokument
          </label>
          <label class="pdfed-kal-radio">
            <input v-model="geltung" type="radio" value="seite">
            Nur für Seite {{ (anfrage?.page ?? 0) + 1 }}
          </label>
        </section>

        <footer class="pdfed-kal-aktionen">
          <button class="pdfed-btn" @click="schliesse">Abbrechen</button>
          <button class="pdfed-btn ist-primaer" :disabled="!realProPt" @click="uebernehme">
            <PdfIcon name="ok" /> Übernehmen
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
/**
 * CalibrateDialog — verheiratet die 2-Punkt-Referenzstrecke (angetippt mit
 * dem Kalibrier-Werkzeug) mit der realen Länge ODER nimmt den Maßstab
 * direkt („1:100"). Ergebnis ist EIN Faktor realProPt (Meter je Punkt) im
 * Dokument-Meta — je Seite oder als Dokument-Standard. Alle Messwerte
 * rechnen sofort live damit.
 */
import { ref, computed, onMounted, nextTick } from 'vue';
import PdfIcon from './PdfIcon.vue';
import { useDocStore } from '../stores/useDocStore';
import { useToolStore } from '../stores/useToolStore';
import { MM_PRO_PT, realProPtAusMassstab, realProPtAusStrecke } from '../services/MeasureMath';

const MASSSTAEBE = [50, 100, 200, 250, 500, 1000];

const emit = defineEmits(['schliessen']);
const docStore = useDocStore();
const toolStore = useToolStore();

const anfrage = computed(() => toolStore.kalibrierungAnfrage);
const laengeEl = ref(null);
const realLaenge = ref('');
const massstab = ref('');
const geltung = ref('dokument');

const papierLaengeMm = computed(() =>
  anfrage.value?.laengePt ? (anfrage.value.laengePt * MM_PRO_PT).toFixed(1) : '0');

const realProPt = computed(() => {
  const laenge = Number(String(realLaenge.value).replace(',', '.'));
  if (anfrage.value?.laengePt && laenge > 0) {
    return realProPtAusStrecke(anfrage.value.laengePt, laenge);
  }
  const m = Number(massstab.value);
  return m > 0 ? realProPtAusMassstab(m) : 0;
});

const abgeleiteterMassstab = computed(() => {
  const laenge = Number(String(realLaenge.value).replace(',', '.'));
  if (!anfrage.value?.laengePt || !(laenge > 0)) return null;
  const m = (laenge * 1000) / (anfrage.value.laengePt * MM_PRO_PT);
  return m >= 10 ? Math.round(m) : m.toFixed(1);
});

async function uebernehme() {
  if (!realProPt.value || !docStore.meta) return;
  const kal = docStore.meta.kalibrierung ?? { standard: null, jeSeite: {} };
  const eintrag = { realProPt: realProPt.value, einheit: 'm' };
  if (geltung.value === 'seite' && anfrage.value?.page != null) {
    kal.jeSeite = { ...kal.jeSeite, [anfrage.value.page]: eintrag };
  } else {
    kal.standard = eintrag;
  }
  docStore.meta.kalibrierung = { ...kal };
  await docStore.speichereMeta();
  toolStore.kalibrierungAnfrage = null;
  toolStore.waehleWerkzeug('messenStrecke');
  emit('schliessen');
}

function schliesse() {
  toolStore.kalibrierungAnfrage = null;
  emit('schliessen');
}

onMounted(async () => {
  await nextTick();
  laengeEl.value?.focus();
});
</script>

<style scoped>
.pdfed-kal-hintergrund {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 17, 20, 0.45);
}
.pdfed-kal-dialog {
  width: min(420px, calc(100vw - 32px));
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
.pdfed-kal-kopf {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 650;
}
.pdfed-kal-kopf > button { margin-left: auto; }
.pdfed-kal-block { display: flex; flex-direction: column; gap: 8px; }
.pdfed-kal-text { margin: 0; }
.pdfed-kal-oder {
  margin: 0;
  text-align: center;
  color: var(--pdf-text-dim);
  font-size: 12px;
}
.pdfed-kal-feld {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 500;
}
.pdfed-kal-eingabe {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.pdfed-kal-eingabe input {
  width: 110px;
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
.pdfed-kal-hinweis {
  margin: 0;
  color: var(--pdf-text-dim);
  font-size: 12px;
}
.pdfed-kal-schnell { display: flex; flex-wrap: wrap; gap: 4px; }
.pdfed-kal-radio {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
}
.pdfed-kal-aktionen {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}
</style>
