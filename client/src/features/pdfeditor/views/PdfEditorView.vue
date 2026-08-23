<template>
  <div class="pdfed-root">
    <PdfTabBar v-if="docStore.tabs.length" />
    <!-- Während eines Tab-Wechsels (laedt) bleibt die Editor-Schale stehen —
         sonst blitzte die Startseite zwischen zwei Tabs auf. -->
    <PdfEditorShell
      v-if="docStore.istOffen || (docStore.ladeStatus === 'laedt' && docStore.tabs.length)"
    />
    <PdfStartScreen v-else />
    <PdfInstallHinweis />
  </div>
</template>

<script setup>
/**
 * PdfEditorView — Route-Shell des Standalone-PDF-Editors (/pdf-editor/:docId?).
 *
 * Importiert bewusst KEIN Layout — die Route läuft als eigener Vollbild-Tab
 * (Muster /cde). Der Theme-Modus wird auf <html data-theme> gespiegelt, damit
 * teleportierte Dialoge die Tokens sehen, und beim Verlassen wieder abgeräumt
 * (Muster IsybauMain). Ab Stufe 7 kommen hier Service-Worker-Registrierung
 * und launchQueue (PWA-Dateiübergabe) dazu.
 */
import { watch, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import PdfEditorShell from '../components/PdfEditorShell.vue';
import PdfStartScreen from '../components/PdfStartScreen.vue';
import PdfTabBar from '../components/PdfTabBar.vue';
import PdfInstallHinweis from '../components/PdfInstallHinweis.vue';
import { holeGeteilteDatei } from '../services/GeteilteDatei';
import { holeTabTransfer, schliesseTabTransfer } from '../services/TabTransfer';
import { useDocStore } from '../stores/useDocStore';
import { useViewStore } from '../stores/useViewStore';
import { useToolStore } from '../stores/useToolStore';
import { useAnnotStore } from '../stores/useAnnotStore';
import { usePreventPageZoom } from '../composables/usePreventPageZoom';
import '../styles/theme.css';

const route = useRoute();
const router = useRouter();
const docStore = useDocStore();
const viewStore = useViewStore();
const toolStore = useToolStore();
const annotStore = useAnnotStore();

usePreventPageZoom();

// ── Theme auf <html> spiegeln (Teleport-Dialoge!) ───────────────────────────
watch(() => viewStore.theme, (t) => {
  document.documentElement.dataset.theme = t;
}, { immediate: true });

// ── Titel & URL synchron halten ─────────────────────────────────────────────
watch(() => [docStore.dokId, docStore.name], ([id, name]) => {
  document.title = name ? `${name} – Quagg PDF` : 'Quagg PDF';
  const aktuelle = route.params.docId || undefined;
  if ((id || undefined) !== aktuelle) {
    router.replace({ name: 'pdf-editor', params: { docId: id || undefined } });
  }
});

// Annotationen folgen dem geöffneten Dokument
watch(() => docStore.dokId, (id) => {
  if (id) annotStore.laden(id);
  else annotStore.leeren();
});

onMounted(async () => {
  document.title = 'Quagg PDF';

  // PWA: Service Worker mit hart verengtem Scope — er kontrolliert NUR
  // /pdf-editor, nie die übrige Site (Sicherheitsarchitektur Stufe 7).
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/pdf-editor' })
      .catch(() => { /* offline/inkognito — Editor läuft trotzdem */ });
  }

  // Installierte App als OS-PDF-Handler: „Öffnen mit Quagg PDF" landet hier.
  // ALLE übergebenen PDFs importieren — jede wird ein eigener Tab, die
  // letzte bleibt aktiv (launch_handler navigate-existing bündelt sie
  // ins bestehende Fenster).
  if ('launchQueue' in window) {
    window.launchQueue.setConsumer(async (params) => {
      for (const handle of params.files ?? []) {
        try {
          const datei = await handle.getFile();
          if (datei.type === 'application/pdf' || /\.pdf$/i.test(datei.name)) {
            // Handle mitgeben: „Speichern" startet dann im Herkunftsordner.
            await docStore.importiereDatei(datei, handle);
          }
        } catch { /* Zugriff verweigert */ }
      }
    });
  }

  // PWA-Installation (Stufe 13): das Browser-Angebot abfangen und dem
  // sanften Hinweis (PdfInstallHinweis) bzw. dem Startseiten-Knopf geben.
  window.addEventListener('beforeinstallprompt', aufInstallAngebot);
  window.addEventListener('appinstalled', aufInstalliert);

  // Tab-Verschieben zwischen Fenstern: hat ein ANDERES Editor-Fenster einen
  // unserer Tabs per Drag übernommen, schließen wir ihn hier.
  holeTabTransfer().aufUebernahme((dokId) => {
    if (docStore.tabs.some(t => t.dokId === dokId)) docStore.schliesseTab(dokId);
  });

  const einstellungen = await viewStore.ladeEinstellungen();
  await toolStore.ladeEinstellungen(einstellungen);
  await docStore.ladeIndex();
  // Tabs der letzten Sitzung wiederherstellen (Browser-Muster); eine
  // dokId in der URL gewinnt gegen den zuletzt aktiven Tab.
  const zuletztAktiv = await docStore.ladeTabs();

  // Android-Share-Target: „Teilen → Quagg PDF" hat eine PDF im Cache
  // hinterlegt (Service Worker) — abholen und als Tab öffnen. Der
  // dokId-Watch ersetzt die URL dabei ohnehin (Query verschwindet mit).
  if (route.query.geteilt === '1') {
    const geteilte = await holeGeteilteDatei();
    if (geteilte) {
      await docStore.importiereDatei(geteilte);
      return;
    }
  }

  const docId = route.params.docId || zuletztAktiv;
  if (docId && docStore.dokId !== docId) {
    await docStore.oeffneDokument(docId);
  }
});

function aufInstallAngebot(ev) {
  ev.preventDefault();          // der Browser-Miniprompt weicht unserem Hinweis
  viewStore.installEvent = ev;
}

function aufInstalliert() {
  viewStore.appInstalliert = true;
  viewStore.installEvent = null;
}

onBeforeUnmount(() => {
  delete document.documentElement.dataset.theme;
  window.removeEventListener('beforeinstallprompt', aufInstallAngebot);
  window.removeEventListener('appinstalled', aufInstalliert);
  schliesseTabTransfer();
  docStore.schliesseDokument();
});
</script>
