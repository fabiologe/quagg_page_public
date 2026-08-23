<template>
  <Transition name="pdfed-install">
    <div v-if="sichtbar" class="pdfed-install">
      <div class="pdfed-install-kopf">
        <PdfIcon name="herunterladen" :size="18" class="pdfed-install-icon" />
        <span class="pdfed-install-titel">{{ titel }}</span>
        <button class="pdfed-btn pdfed-install-zu" title="Später" @click="lehneAb">
          <PdfIcon name="schliessen" :size="15" />
        </button>
      </div>

      <template v-if="zustand === 'fertig'">
        <p class="pdfed-install-text">
          Installiert! {{ art === 'android'
            ? 'PDFs erreichen die App jetzt über Teilen.'
            : 'PDFs künftig per Doppelklick öffnen: einmal Rechtsklick auf eine PDF, dann „Öffnen mit → Quagg PDF" wählen.' }}
        </p>
      </template>

      <template v-else-if="art === 'chromium' || art === 'android'">
        <p class="pdfed-install-text">
          Quagg PDF als eigenständige App — mit eigenem Fenster, offline nutzbar,
          {{ art === 'android' ? 'und PDFs landen über „Teilen" direkt hier.' : 'und PDFs öffnen sich per Doppelklick.' }}
        </p>
        <!-- Install-Knopf nur, wenn der Browser das Angebot gemeldet hat
             (Chrome). Android-Firefox & Co. bekommen stattdessen die APK
             als PRIMÄREN Knopf — dort gibt es keinen anderen Weg. -->
        <button
          v-if="viewStore.installEvent"
          class="pdfed-btn ist-primaer pdfed-install-knopf"
          @click="installiere"
        >
          <PdfIcon name="herunterladen" :size="16" /> App installieren
        </button>
        <a
          v-if="art === 'android' && !viewStore.installEvent"
          class="pdfed-btn ist-primaer pdfed-install-knopf"
          href="/apps/quagg-pdf.apk"
          download
        >
          <PdfIcon name="herunterladen" :size="16" /> App herunterladen (APK)
        </a>
        <a
          v-else-if="art === 'android'"
          class="pdfed-install-apk"
          href="/apps/quagg-pdf.apk"
          download
        >Alternativ: APK herunterladen (Direktinstallation)</a>
      </template>

      <template v-else>
        <p class="pdfed-install-text">
          Quagg PDF als App aufs Gerät: im Safari-Menü
          <strong>Teilen</strong> und dann
          <strong>{{ art === 'safari-ios' ? '„Zum Home-Bildschirm"' : '„Zum Dock hinzufügen"' }}</strong> wählen.
        </p>
      </template>
    </div>
  </Transition>
</template>

<script setup>
/**
 * PdfInstallHinweis — die sanfte „Als App installieren"-Karte (Stufe 13).
 * Erscheint erst nach einer Anlaufzeit, nie in der installierten App, und
 * hält nach einem Wegklicken 14 Tage Ruhe (InstallLogik + PdfRepo).
 * Chromium bekommt den echten Install-Knopf (beforeinstallprompt aus dem
 * viewStore), Safari die Zwei-Schritte-Anleitung.
 */
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import PdfIcon from './PdfIcon.vue';
import { useViewStore } from '../stores/useViewStore';
import { repo } from '../services/PdfRepo';
import { plattform, sollteHinweisZeigen } from '../services/InstallLogik';

const ANLAUF_MS = 30000;

const viewStore = useViewStore();
const sichtbar = ref(false);
const zustand = ref('angebot');   // 'angebot' | 'fertig'
let anlaufTimer = 0;
let hinweisErlaubt = false;

const basisPlattform = plattform();
const art = computed(() => basisPlattform);

const titel = computed(() =>
  zustand.value === 'fertig' ? 'Quagg PDF ist installiert' : 'Als App installieren');

function _planeAnzeige() {
  // Desktop-Chromium ohne abgefangenes Event kann nichts anbieten — dann
  // warten wir auf das Event (watch unten) statt eine leere Karte zu
  // zeigen. Android zeigt IMMER (notfalls mit APK als einzigem Weg).
  if (!hinweisErlaubt || sichtbar.value) return;
  if (art.value === 'chromium' && !viewStore.installEvent) return;
  clearTimeout(anlaufTimer);
  anlaufTimer = setTimeout(() => { sichtbar.value = true; }, ANLAUF_MS);
}

watch(() => viewStore.installEvent, _planeAnzeige);

watch(() => viewStore.appInstalliert, (installiert) => {
  if (installiert && sichtbar.value) {
    zustand.value = 'fertig';
  } else if (installiert) {
    sichtbar.value = false;
  }
});

async function installiere() {
  const event = viewStore.installEvent;
  if (!event) return;
  try {
    event.prompt();
    const wahl = await event.userChoice;
    if (wahl?.outcome !== 'accepted') {
      // Der native Prompt wurde abgelehnt — dieselbe Ruhe wie beim X.
      await lehneAb();
    }
    // 'accepted' → das appinstalled-Event schaltet auf den Erfolgstext um.
  } catch {
    await lehneAb();
  }
  viewStore.installEvent = null;   // ein Prompt-Event ist nur einmal gültig
}

async function lehneAb() {
  sichtbar.value = false;
  await repo.set('installHinweis', { abgelehntUm: Date.now() });
}

onMounted(async () => {
  const gespeichert = await repo.get('installHinweis');
  hinweisErlaubt = sollteHinweisZeigen({
    installiert: viewStore.appInstalliert,
    plattformName: basisPlattform,
    abgelehntUm: gespeichert?.abgelehntUm ?? null,
    jetzt: Date.now(),
  });
  _planeAnzeige();
});

onBeforeUnmount(() => clearTimeout(anlaufTimer));
</script>

<style scoped>
.pdfed-install {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 60;
  width: min(320px, calc(100vw - 32px));
  padding: 12px 14px;
  background: var(--pdf-flaeche);
  color: var(--pdf-text);
  border: 1px solid var(--pdf-rand);
  border-left: 3px solid var(--pdf-akzent);
  border-radius: var(--pdf-radius);
  box-shadow: var(--pdf-schatten);
  font-family: var(--pdf-schrift);
}
.pdfed-install-kopf {
  display: flex;
  align-items: center;
  gap: 8px;
}
.pdfed-install-icon { color: var(--pdf-akzent); }
.pdfed-install-titel {
  flex: 1;
  font-weight: 650;
}
.pdfed-install-zu {
  min-height: 30px;
  min-width: 30px;
  padding: 0;
  color: var(--pdf-text-dim);
}
.pdfed-install-text {
  margin: 8px 0 0;
  font-size: 13px;
  color: var(--pdf-text-dim);
  line-height: 1.5;
}
.pdfed-install-knopf {
  margin-top: 10px;
  width: 100%;
}
.pdfed-install-apk {
  display: block;
  margin-top: 8px;
  font-size: 12px;
  text-align: center;
  color: var(--pdf-text-dim);
  text-decoration: underline;
}
.pdfed-install-apk:hover { color: var(--pdf-akzent); }

.pdfed-install-enter-active,
.pdfed-install-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.pdfed-install-enter-from,
.pdfed-install-leave-to {
  opacity: 0;
  transform: translateY(12px);
}
</style>
