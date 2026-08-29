<template>
  <Teleport to="body">
    <div class="pdfed-textmenue" :style="stil" @pointerdown.stop>
      <button class="pdfed-btn" :class="{ 'ist-aktiv': kopiert }" @click="kopiere">
        <PdfIcon :name="kopiert ? 'ok' : 'kopieren'" :size="16" />
        {{ kopiert ? 'Kopiert' : 'Kopieren' }}
      </button>
      <button class="pdfed-btn" @click="markiere">
        <PdfIcon name="textmarker" :size="16" /> Markieren
      </button>
    </div>
  </Teleport>
</template>

<script setup>
/**
 * TextAuswahlMenue — kleines Menü über einer stehenden Textauswahl
 * (Werkzeug „Text auswählen"): Kopieren in die Zwischenablage oder als
 * textHighlight markieren. Schließt sich bei Scroll, Zoomgeste und
 * Tipp außerhalb (die Auswahl kollabiert dann ohnehin).
 */
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import PdfIcon from './PdfIcon.vue';
import { useToolStore } from '../stores/useToolStore';
import { useAnnotStore } from '../stores/useAnnotStore';
import { useViewStore } from '../stores/useViewStore';

const toolStore = useToolStore();
const annotStore = useAnnotStore();
const viewStore = useViewStore();
const kopiert = ref(false);
let zuTimer = 0;

const stil = computed(() => {
  const a = toolStore.textAuswahl;
  if (!a) return { display: 'none' };
  // Über der Auswahl, an den Viewport geklemmt (Fingerziele brauchen Platz).
  const links = Math.max(90, Math.min(window.innerWidth - 90, a.ankerX));
  return {
    left: `${links}px`,
    top: `${Math.max(8, a.ankerY - 52)}px`,
  };
});

async function kopiere() {
  const a = toolStore.textAuswahl;
  if (!a) return;
  try {
    await navigator.clipboard.writeText(a.text);
  } catch {
    // Fallback für Umgebungen ohne Clipboard-API-Berechtigung
    try { document.execCommand('copy'); } catch { /* dann bleibt die Auswahl */ }
  }
  kopiert.value = true;
  clearTimeout(zuTimer);
  zuTimer = setTimeout(() => { toolStore.textAuswahl = null; kopiert.value = false; }, 900);
}

function markiere() {
  const a = toolStore.textAuswahl;
  if (!a) return;
  annotStore.fuegeHinzu({
    type: 'textHighlight',
    page: a.page,
    farbe: toolStore.textmarker.farbe,
    deckkraft: toolStore.textmarker.deckkraft,
    rects: a.rects,
    textAuszug: a.text.slice(0, 300),
  });
  window.getSelection()?.removeAllRanges();
  toolStore.textAuswahl = null;
}

function schliesseBeiScroll() {
  toolStore.textAuswahl = null;
}

watch(() => viewStore.gesteAktiv, (g) => { if (g) toolStore.textAuswahl = null; });

onMounted(() => window.addEventListener('scroll', schliesseBeiScroll, true));
onBeforeUnmount(() => {
  window.removeEventListener('scroll', schliesseBeiScroll, true);
  clearTimeout(zuTimer);
});
</script>

<style scoped>
.pdfed-textmenue {
  position: fixed;
  z-index: 80;
  display: flex;
  gap: 2px;
  padding: 3px;
  transform: translateX(-50%);
  background: var(--pdf-flaeche);
  border: 1px solid var(--pdf-rand);
  border-radius: var(--pdf-radius-klein);
  box-shadow: var(--pdf-schatten);
  font-family: var(--pdf-schrift);
}
.pdfed-textmenue .pdfed-btn {
  min-height: 40px;
  font-size: 13px;
  white-space: nowrap;
}
</style>
