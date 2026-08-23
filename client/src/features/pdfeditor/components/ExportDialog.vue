<template>
  <Teleport to="body">
    <div class="pdfed-exp-hintergrund" @pointerdown.self="$emit('schliessen')">
      <div class="pdfed-exp-dialog">
        <header class="pdfed-exp-kopf">
          <PdfIcon name="herunterladen" :size="20" />
          <span>Exportieren</span>
          <button class="pdfed-btn" title="Schließen" @click="$emit('schliessen')">
            <PdfIcon name="schliessen" />
          </button>
        </header>

        <label class="pdfed-exp-feld">
          Dateiname
          <input v-model="dateiname" type="text" spellcheck="false">
        </label>

        <label v-if="anzahlNotizen" class="pdfed-exp-schalter">
          <input v-model="mitKommentarSeite" type="checkbox">
          Kommentar-Übersicht als letzte Seite anhängen ({{ anzahlNotizen }})
        </label>

        <p class="pdfed-exp-hinweis">
          Alle Markierungen werden als Vektorgrafik fest in die Seiten
          gezeichnet; Text und Qualität des Originals bleiben erhalten.
        </p>

        <p v-if="fehler" class="pdfed-exp-fehler">
          <PdfIcon name="warnung" :size="16" /> {{ fehler }}
        </p>

        <footer class="pdfed-exp-aktionen">
          <button class="pdfed-btn" :disabled="laeuft" @click="starte(drucke)">
            <PdfIcon name="drucken" /> Drucken
          </button>
          <button v-if="kannTeilen" class="pdfed-btn" :disabled="laeuft" @click="starte(teileDatei)">
            <PdfIcon name="teilen" /> Teilen
          </button>
          <button class="pdfed-btn ist-primaer" :disabled="laeuft" @click="starte(speichereDatei)">
            <PdfIcon :name="laeuft ? 'laedt' : (kannPickern ? 'speichern' : 'herunterladen')" />
            {{ laeuft ? 'Wird erstellt' : (kannPickern ? 'Speichern' : 'Herunterladen') }}
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
/**
 * ExportDialog — Burn-in-Export als Download, System-Teilen oder Druck.
 * Der eigentliche Export läuft in PdfExporter; hier nur Optionen + Status.
 */
import { ref, computed } from 'vue';
import PdfIcon from './PdfIcon.vue';
import { useDocStore } from '../stores/useDocStore';
import { useAnnotStore } from '../stores/useAnnotStore';
import {
  exportiereMitAnnotationen, speichereMitPicker, teile, drucke as druckeBytes,
} from '../services/PdfExporter';

const emit = defineEmits(['schliessen']);
const docStore = useDocStore();
const annotStore = useAnnotStore();

const dateiname = ref(`${docStore.name || 'Dokument'}_markiert.pdf`);
const anzahlNotizen = computed(() => annotStore.items.filter(a => a.type === 'note').length);
const mitKommentarSeite = ref(true);
const laeuft = ref(false);
const fehler = ref('');
const kannTeilen = typeof navigator.canShare === 'function';
const kannPickern = typeof window.showSaveFilePicker === 'function';

async function _erzeugeBytes() {
  const original = await docStore.holeOriginalBytes();
  if (!original) throw new Error('Das Original ließ sich nicht aus der Ablage laden.');
  return exportiereMitAnnotationen(
    original,
    annotStore.items,
    docStore.meta?.kalibrierung ?? null,
    { kommentarSeite: mitKommentarSeite.value },
  );
}

async function starte(aktion) {
  laeuft.value = true;
  fehler.value = '';
  try {
    const bytes = await _erzeugeBytes();
    await aktion(bytes);
  } catch (e) {
    fehler.value = /encrypted/i.test(String(e?.message))
      ? 'Diese PDF ist verschlüsselt und kann nicht exportiert werden.'
      : (e?.message || 'Export fehlgeschlagen.');
  } finally {
    laeuft.value = false;
  }
}

async function speichereDatei(bytes) {
  const name = dateiname.value.endsWith('.pdf') ? dateiname.value : `${dateiname.value}.pdf`;
  // Herkunfts-Handle der Originaldatei → der Dialog startet in ihrem Ordner.
  const startIn = await docStore.holeDateiHandle();
  const ergebnis = await speichereMitPicker(bytes, name, { startIn });
  if (ergebnis !== 'abgebrochen') emit('schliessen');
}

async function teileDatei(bytes) {
  const ok = await teile(bytes, dateiname.value);
  if (ok) emit('schliessen');
}

function drucke(bytes) {
  druckeBytes(bytes);
}
</script>

<style scoped>
.pdfed-exp-hintergrund {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 17, 20, 0.45);
}
.pdfed-exp-dialog {
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
.pdfed-exp-kopf {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 650;
}
.pdfed-exp-kopf > button { margin-left: auto; }
.pdfed-exp-feld {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-weight: 500;
}
.pdfed-exp-feld input {
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
.pdfed-exp-schalter {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
}
.pdfed-exp-hinweis {
  margin: 0;
  color: var(--pdf-text-dim);
  font-size: 12.5px;
}
.pdfed-exp-fehler {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  color: var(--pdf-fehler);
}
.pdfed-exp-aktionen {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}
</style>
