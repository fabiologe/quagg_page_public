<!--
  Rückfrage im Stil des Moduls statt window.confirm().

  Der Dialog des Browsers ist grau, in Systemschrift, mit Systemzeiger und
  „OK/Abbrechen" — im Pixel-Design ein Fremdkörper (Designprüfung 2026-09-27,
  sieben Stellen). Aufruf über den Store: `if (!(await store.frage(text, {ja}))) return;`
  Escape und Klick auf die Verdunkelung = Nein, Enter = Ja.
-->
<template>
  <Teleport to="body">
    <div v-if="frage" class="modal-overlay" @click.self="antworten(false)">
      <div class="modal-content" role="alertdialog" aria-modal="true" :aria-label="frage.titel" aria-describedby="isy-frage-text">
        <div class="modal-header">
          <h3>{{ frage.titel }}</h3>
        </div>
        <div class="modal-body">
          <p id="isy-frage-text" class="frage-text">{{ frage.text }}</p>
        </div>
        <div class="modal-footer">
          <button class="secondary-btn" @click="antworten(false)">{{ frage.nein }}</button>
          <button ref="jaKnopf" class="primary-btn" @click="antworten(true)">{{ frage.ja }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { useIsybauStore } from '../../store/index.js';

const store = useIsybauStore();
const frage = computed(() => store.ui.frage);
const jaKnopf = ref(null);

const antworten = (ja) => store.frageBeantworten(ja);

// Fokus auf „Ja", damit Enter ohne Maus bestätigt
watch(frage, async (f) => { if (f) { await nextTick(); jaKnopf.value?.focus(); } });

// Eigene Tasten VOR allen anderen Escape-Handlern (Capture, zuerst registriert
// greift IsybauModals — der prüft deshalb ui.frage und lässt die Taste durch).
const aufTaste = (e) => {
  if (!frage.value) return;
  if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); antworten(false); }
  else if (e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); antworten(true); }
};
onMounted(() => window.addEventListener('keydown', aufTaste, true));
onBeforeUnmount(() => window.removeEventListener('keydown', aufTaste, true));
</script>

<style scoped src="../modals/shared/modalBase.css"></style>
<style scoped>
/* Über allen Fenstern (auch der Datenmaske), unter den Meldungen */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: calc(var(--isy-z-top) + 2);
  backdrop-filter: blur(2px);
}

.modal-content {
  background: var(--isy-pixel-content-bg);
  border-radius: var(--isy-radius-lg);
  width: 90%;
  max-width: 460px;
  box-shadow: var(--isy-elev-3);
  display: flex;
  flex-direction: column;
}

.modal-header {
  padding: var(--isy-space-4);
}

.modal-header h3 {
  font-family: var(--isy-pixel-font);
  font-size: var(--isy-fs-pixel-md);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  margin: 0;
  color: var(--isy-pixel-text-dim);
}

.modal-body {
  padding: var(--isy-space-6);
}

.frage-text {
  margin: 0;
  color: var(--isy-pixel-content-text);
  font-size: var(--isy-fs-lg);
  line-height: 1.45;
  white-space: pre-line;
}

.primary-btn {
  background: var(--isy-pixel-bg);
  color: var(--isy-pixel-text);
  border: none;
  border-radius: var(--isy-radius-md);
  padding: var(--isy-space-2) var(--isy-space-4);
  font-family: var(--isy-pixel-font);
  font-size: var(--isy-fs-pixel-md);
  letter-spacing: 0.06em;
  cursor: var(--isy-cursor-hand);
  transition: background 0.15s;
}
.primary-btn:hover { background: var(--isy-pixel-border); }

.secondary-btn {
  background: transparent;
  border: 1px solid var(--isy-pixel-border);
  color: var(--isy-pixel-text-dim);
  border-radius: var(--isy-radius-md);
  padding: var(--isy-space-2) var(--isy-space-4);
  font-family: var(--isy-pixel-font);
  font-size: var(--isy-fs-pixel-md);
  letter-spacing: 0.06em;
  cursor: var(--isy-cursor-hand);
  transition: background 0.12s;
}
.secondary-btn:hover { background: var(--isy-pixel-border); color: var(--isy-pixel-green-bright); }
</style>
