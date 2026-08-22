<template>
  <Teleport to="body">
    <div v-if="store.ui.meldungen.length" class="meldungen" role="status" aria-live="polite">
      <TransitionGroup name="meldung">
        <div
          v-for="m in store.ui.meldungen"
          :key="m.id"
          class="meldung"
          :class="`meldung-${m.art}`"
        >
          <span class="meldung-zeichen" aria-hidden="true">{{ ZEICHEN[m.art] }}</span>
          <span class="meldung-text">{{ m.text }}</span>
          <button
            class="close-toast"
            title="Meldung schließen"
            aria-label="Meldung schließen"
            @click="store.meldungSchliessen(m.id)"
          >×</button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<script setup>
import { useIsybauStore } from '../../store/index.js';

const store = useIsybauStore();

/* Zeichen statt Emoji: das Modul traegt eine Pixel-Optik, und ein farbiges
   System-Emoji faellt darin auf wie ein Fremdkoerper. */
const ZEICHEN = { fehler: '✕', hinweis: '!', erfolg: '✓' };
</script>

<style scoped>
/* Ueber allem, auch ueber Modals - eine Fehlermeldung, die hinter dem Dialog
   liegt, den sie betrifft, ist keine Meldung. */
.meldungen {
  position: fixed;
  right: var(--isy-space-4);
  bottom: var(--isy-space-4);
  z-index: calc(var(--isy-z-top) + 4);
  display: flex;
  flex-direction: column;
  gap: var(--isy-space-2);
  max-width: min(28rem, calc(100vw - 2 * var(--isy-space-4)));
}

.meldung {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: var(--isy-space-3);
  align-items: start;
  padding: var(--isy-space-3) var(--isy-space-4);
  border: 2px solid;
  border-radius: var(--isy-radius-sm);
  font-family: var(--isy-pixel-font);
  font-size: var(--isy-fs-pixel-md);
  line-height: 1.6;
  box-shadow: var(--isy-elev-3);
  /* Meldungen tragen oft mehrzeiligen Text (der Export-Hinweis sammelt eine
     ganze Liste), deshalb Zeilenumbrueche erhalten. */
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.meldung-zeichen { font-weight: 700; }

.meldung-fehler  { background: var(--isy-pixel-danger-soft);  border-color: var(--isy-pixel-danger-soft-border);  color: var(--isy-pixel-danger-soft-text); }
.meldung-hinweis { background: var(--isy-pixel-warning-soft); border-color: var(--isy-pixel-warning-soft-border); color: var(--isy-pixel-warning-soft-text); }
.meldung-erfolg  { background: var(--isy-pixel-success-soft); border-color: var(--isy-pixel-success-soft-border); color: var(--isy-pixel-success-soft-text); }

.close-toast {
  background: none;
  border: none;
  color: inherit;
  font-size: var(--isy-fs-lg);
  line-height: 1;
  padding: 0;
  cursor: var(--isy-cursor-hand);
}

.meldung-enter-active, .meldung-leave-active { transition: opacity 0.2s, transform 0.2s; }
.meldung-enter-from, .meldung-leave-to { opacity: 0; transform: translateY(var(--isy-space-2)); }

@media (prefers-reduced-motion: reduce) {
  .meldung-enter-active, .meldung-leave-active { transition: none; }
}
</style>
