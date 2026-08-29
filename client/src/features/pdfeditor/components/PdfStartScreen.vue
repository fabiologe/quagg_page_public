<template>
  <div
    class="pdfed-start"
    :class="{ 'ist-drop': dropAktiv }"
    @dragover.prevent="dropAktiv = true"
    @dragleave="dropAktiv = false"
    @drop.prevent="aufDrop"
  >
    <header class="pdfed-start-kopf">
      <div class="pdfed-start-marke">
        <PdfIcon name="dokument" :size="22" />
        <span>Quagg PDF</span>
      </div>
      <div class="pdfed-start-kopf-aktionen">
        <button
          v-if="viewStore.installEvent && !viewStore.appInstalliert"
          class="pdfed-btn"
          title="Quagg PDF als App installieren (eigenes Fenster, offline, PDF-Doppelklick)"
          @click="installiereApp"
        >
          <PdfIcon name="herunterladen" /> Als App installieren
        </button>
        <!-- Android ohne Browser-Install-Angebot (Firefox & Co.): die APK
             ist dort der einzige Weg zur App — immer sichtbar anbieten. -->
        <a
          v-else-if="istAndroid && !viewStore.appInstalliert"
          class="pdfed-btn"
          href="/apps/quagg-pdf.apk"
          download
          title="Quagg PDF als Android-App herunterladen (APK-Direktinstallation)"
        >
          <PdfIcon name="herunterladen" /> App herunterladen
        </a>
      </div>
    </header>

    <main class="pdfed-start-inhalt">
      <section class="pdfed-dropzone" @click="waehleDatei">
        <PdfIcon name="hochladen" :size="40" :stroke-width="1.25" />
        <p class="pdfed-dropzone-titel">PDF hierher ziehen</p>
        <p class="pdfed-dropzone-hinweis">oder tippen, um eine Datei zu wählen</p>
        <button class="pdfed-btn ist-primaer" @click.stop="waehleDatei">
          <PdfIcon name="oeffnen" /> Datei öffnen
        </button>
      </section>

      <section class="pdfed-neu">
        <h2 class="pdfed-zuletzt-titel">
          <PdfIcon name="plus" :size="16" /> Neu beginnen
        </h2>
        <div class="pdfed-neu-karten">
          <div v-for="format in ['A4', 'A3']" :key="format" class="pdfed-neu-karte">
            <button class="pdfed-neu-flaeche" :title="`Leeres ${format}-Blatt erstellen`" @click="erstelleBlatt(format)">
              <span
                class="pdfed-neu-blatt"
                :class="ausrichtungen[format] === 'quer' ? 'ist-quer' : 'ist-hoch'"
              ></span>
              <span class="pdfed-neu-name">Leeres {{ format }}</span>
            </button>
            <div class="pdfed-neu-ausrichtung">
              <button
                class="pdfed-btn"
                :class="{ 'ist-aktiv': ausrichtungen[format] === 'hoch' }"
                title="Hochformat"
                @click="ausrichtungen[format] = 'hoch'"
              >
                <PdfIcon name="hochformat" :size="16" />
              </button>
              <button
                class="pdfed-btn"
                :class="{ 'ist-aktiv': ausrichtungen[format] === 'quer' }"
                title="Querformat"
                @click="ausrichtungen[format] = 'quer'"
              >
                <PdfIcon name="querformat" :size="16" />
              </button>
            </div>
          </div>
        </div>
      </section>

      <p v-if="docStore.ladeStatus === 'fehler'" class="pdfed-start-fehler">
        <PdfIcon name="warnung" /> {{ docStore.ladeFehler }}
      </p>
      <p v-else-if="docStore.ladeStatus === 'laedt'" class="pdfed-start-laedt">
        Dokument wird geöffnet …
      </p>

      <section v-if="docStore.dokIndex.length" class="pdfed-zuletzt">
        <h2 class="pdfed-zuletzt-titel">
          <PdfIcon name="zuletzt" :size="16" /> Zuletzt geöffnet
        </h2>
        <ul class="pdfed-zuletzt-liste">
          <li v-for="d in docStore.dokIndex" :key="d.id">
            <button class="pdfed-zuletzt-karte" @click="oeffne(d.id)">
              <PdfIcon name="dokument" :size="26" :stroke-width="1.25" class="pdfed-zuletzt-icon" />
              <span class="pdfed-zuletzt-name" :title="d.name">{{ d.name }}</span>
              <span class="pdfed-zuletzt-meta">
                {{ d.seitenAnzahl || '?' }} Seiten · {{ formatGroesse(d.groesse) }} · {{ formatDatum(d.modifiedAt) }}
              </span>
            </button>
            <button
              class="pdfed-btn pdfed-zuletzt-loeschen"
              :title="`„${d.name}“ aus der Ablage entfernen`"
              @click="loesche(d)"
            >
              <PdfIcon name="loeschen" :size="16" />
            </button>
          </li>
        </ul>
      </section>
    </main>

    <input
      ref="dateiInput"
      type="file"
      accept="application/pdf,.pdf"
      hidden
      @change="aufDateiwahl"
    >
  </div>
</template>

<script setup>
/**
 * PdfStartScreen — Einstieg: Datei öffnen (Drop, Dateiwahl) und die lokale
 * Ablage („Zuletzt geöffnet" aus der IndexedDB). Löschen fragt einmal nach —
 * es entfernt das Dokument samt Annotationen endgültig aus dem Browser.
 */
import { ref } from 'vue';
import PdfIcon from './PdfIcon.vue';
import { useDocStore } from '../stores/useDocStore';
import { useViewStore } from '../stores/useViewStore';
import { erzeugeLeeresPdf } from '../services/BlankPdf';
import { plattform } from '../services/InstallLogik';
import { TAB_DRAG_TYP, holeTabTransfer } from '../services/TabTransfer';

const docStore = useDocStore();
const viewStore = useViewStore();
const istAndroid = plattform() === 'android';

const dropAktiv = ref(false);
const dateiInput = ref(null);
const ausrichtungen = ref({ A4: 'hoch', A3: 'quer' });

async function erstelleBlatt(format) {
  const ausrichtung = ausrichtungen.value[format];
  const bytes = await erzeugeLeeresPdf(format, ausrichtung);
  const datei = new File([bytes], `${format}-Blatt.pdf`, { type: 'application/pdf' });
  await docStore.importiereDatei(datei);
}

async function waehleDatei() {
  // File System Access API (Chromium): liefert ein Datei-Handle mit —
  // „Speichern" startet damit später im Ordner der Originaldatei.
  if (typeof window.showOpenFilePicker === 'function') {
    let handles;
    try {
      handles = await window.showOpenFilePicker({
        multiple: true,
        types: [{ description: 'PDF-Datei', accept: { 'application/pdf': ['.pdf'] } }],
      });
    } catch { return; }   // abgebrochen
    for (const handle of handles) {
      try {
        await docStore.importiereDatei(await handle.getFile(), handle);
      } catch { /* Zugriff verweigert */ }
    }
    return;
  }
  dateiInput.value?.click();
}

async function aufDateiwahl(ev) {
  const datei = ev.target.files?.[0];
  ev.target.value = '';
  if (datei) await docStore.importiereDatei(datei);
}

async function aufDrop(ev) {
  dropAktiv.value = false;
  // Ein Tab aus einem ANDEREN Editor-Fenster? Dann Dokument übernehmen —
  // das Quellfenster schließt seinen Tab (TabTransfer-Broadcast).
  const tabDokId = ev.dataTransfer?.getData(TAB_DRAG_TYP);
  if (tabDokId) {
    const ok = await docStore.oeffneDokument(tabDokId);
    if (ok) holeTabTransfer().meldeUebernahme(tabDokId);
    return;
  }
  const items = [...(ev.dataTransfer?.items ?? [])];
  const datei = [...(ev.dataTransfer?.files ?? [])]
    .find(f => f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
  if (!datei) return;
  // Chromium liefert zum Drop auch das Datei-Handle (fürs spätere Speichern).
  let handle = null;
  const item = items.find(i => i.kind === 'file'
    && (i.type === 'application/pdf' || i.getAsFile()?.name === datei.name));
  if (item?.getAsFileSystemHandle) {
    try { handle = await item.getAsFileSystemHandle(); } catch { /* egal */ }
  }
  await docStore.importiereDatei(datei, handle);
}

function oeffne(id) { docStore.oeffneDokument(id); }

/** Direkter Install-Weg für alle, die das sanfte Popup weggeklickt haben. */
async function installiereApp() {
  const event = viewStore.installEvent;
  if (!event) return;
  try {
    event.prompt();
    await event.userChoice;
  } finally {
    viewStore.installEvent = null;   // ein Prompt-Event ist nur einmal gültig
  }
}

async function loesche(d) {
  if (confirm(`„${d.name}" endgültig aus der lokalen Ablage entfernen?`)) {
    await docStore.loescheDokument(d.id);
  }
}

function formatGroesse(bytes) {
  if (!bytes) return '–';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDatum(ts) {
  if (!ts) return '–';
  return new Date(ts).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
</script>

<style scoped>
.pdfed-start {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: auto;
}
.pdfed-start.ist-drop { outline: 3px dashed var(--pdf-akzent); outline-offset: -8px; }

.pdfed-start-kopf {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
}
.pdfed-start-marke {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 650;
  color: var(--pdf-akzent);
}
.pdfed-start-kopf-aktionen {
  display: flex;
  align-items: center;
  gap: 4px;
}

.pdfed-start-inhalt {
  width: min(720px, 100% - 32px);
  margin: 0 auto;
  padding-bottom: 48px;
}

.pdfed-dropzone {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  margin-top: 6vh;
  padding: 40px 24px;
  border: 2px dashed var(--pdf-rand-stark);
  border-radius: var(--pdf-radius);
  background: var(--pdf-flaeche);
  color: var(--pdf-text-dim);
  cursor: pointer;
}
.pdfed-dropzone:hover { border-color: var(--pdf-akzent); }
.pdfed-dropzone-titel {
  margin: 8px 0 0;
  font-size: 17px;
  font-weight: 600;
  color: var(--pdf-text);
}
.pdfed-dropzone-hinweis { margin: 0 0 10px; }

.pdfed-neu { margin-top: 24px; }
.pdfed-neu-karten {
  display: flex;
  gap: 10px;
}
.pdfed-neu-karte {
  flex: 1;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--pdf-rand);
  border-radius: var(--pdf-radius);
  background: var(--pdf-flaeche);
  overflow: hidden;
}
.pdfed-neu-flaeche {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 14px 10px 8px;
  border: none;
  background: transparent;
  color: var(--pdf-text);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.pdfed-neu-flaeche:hover .pdfed-neu-blatt { border-color: var(--pdf-akzent); }
.pdfed-neu-blatt {
  display: block;
  background: var(--pdf-seite);
  border: 1.5px solid var(--pdf-rand-stark);
  border-radius: 2px;
  box-shadow: var(--pdf-schatten);
}
.pdfed-neu-blatt.ist-hoch { width: 38px; height: 54px; }
.pdfed-neu-blatt.ist-quer { width: 54px; height: 38px; }
.pdfed-neu-ausrichtung {
  display: flex;
  justify-content: center;
  gap: 4px;
  padding: 4px 0 8px;
}
.pdfed-neu-ausrichtung .pdfed-btn {
  min-height: 32px;
  min-width: 36px;
  padding: 0;
}

.pdfed-start-fehler,
.pdfed-start-laedt {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 16px;
  padding: 10px 14px;
  border-radius: var(--pdf-radius-klein);
  background: var(--pdf-flaeche);
}
.pdfed-start-fehler { color: var(--pdf-fehler); border: 1px solid var(--pdf-fehler); }
.pdfed-start-laedt { color: var(--pdf-text-dim); }

.pdfed-zuletzt { margin-top: 36px; }
.pdfed-zuletzt-titel {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 10px;
  font-size: 13px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--pdf-text-dim);
}
.pdfed-zuletzt-liste {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 10px;
}
.pdfed-zuletzt-liste li { position: relative; }

.pdfed-zuletzt-karte {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  width: 100%;
  padding: 14px;
  border: 1px solid var(--pdf-rand);
  border-radius: var(--pdf-radius);
  background: var(--pdf-flaeche);
  color: var(--pdf-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.pdfed-zuletzt-karte:hover { border-color: var(--pdf-akzent); box-shadow: var(--pdf-schatten); }
.pdfed-zuletzt-icon { color: var(--pdf-akzent); }
.pdfed-zuletzt-name {
  font-weight: 600;
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pdfed-zuletzt-meta { font-size: 12px; color: var(--pdf-text-dim); }

.pdfed-zuletzt-loeschen {
  position: absolute;
  top: 6px;
  right: 6px;
  min-height: 32px;
  min-width: 32px;
  padding: 0;
  color: var(--pdf-text-dim);
}
.pdfed-zuletzt-loeschen:hover { color: var(--pdf-fehler); }
</style>
