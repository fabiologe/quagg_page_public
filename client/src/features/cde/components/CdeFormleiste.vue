<template>
  <!-- DIE LEISTE BEIM FORMEN, hochkant (Teil XXXII, R1 — H7 aus Teil XXXI): Mass · Rückgängig · Fertig, unten, wo der
       Daumen ist. Die Blätter sind beim Formen eingeklappt (T5); Rückgängig stand bis hierher nur oben in der Marke. -->
  <div class="formleiste" role="toolbar" aria-label="Formen">
    <span class="fl-mass" :class="{ 'fl-mass--zug': zugLaeuft }" :title="text">{{ text }}</span>
    <button type="button" class="fl-knopf" :disabled="!kannZurueck" title="Zurücknehmen (Strg+Z)" @click="$emit('rueckgaengig')">
      <CdeIcon name="undo" :size="16" /> <span>Rückgängig</span>
    </button>
    <button type="button" class="fl-knopf fl-knopf--fertig" title="Fertig — Auswahl aufheben" @click="$emit('fertig')">
      <CdeIcon name="check" :size="16" /> <span>Fertig</span>
    </button>
  </div>
</template>

<script setup>
/**
 * CdeFormleiste — Mass, Rückgängig, Fertig beim Formen hochkant (Teil XXXII, R1).
 *
 * Das MASS ist, was der Finger gerade zieht (die Pille am Griff sitzt unter dem Finger), sonst die letzte Rückmeldung,
 * sonst der Name des Bauteils. Alle Ziele 44 px (Tablet-Rezept; Tabletlauf T9: 43 von 70 Zielen unter 40 px).
 * Sichtbar nur im Hochkant-Layout (≤ 900 px, CSS) — quer stehen Rückgängig und Fertig, wo sie immer standen.
 */
import CdeIcon from './ui/CdeIcon.vue';

defineProps({
  text: { type: String, default: '' },
  zugLaeuft: { type: Boolean, default: false },
  kannZurueck: { type: Boolean, default: false },
});
defineEmits(['rueckgaengig', 'fertig']);
</script>

<style scoped>
.formleiste {
  display: none;
  position: absolute; left: 50%; bottom: 0.5rem; transform: translateX(-50%);
  z-index: 20;
  align-items: center; gap: 0.5rem;
  padding: 0.3rem 0.4rem 0.3rem 0.8rem;
  max-width: calc(100% - 1rem);
  background: var(--cde-surface-raised); border: 1px solid var(--cde-line);
  border-radius: 999px; box-shadow: var(--cde-shadow);
  color: var(--cde-text);
}
@media (max-width: 900px) {
  .formleiste { display: flex; }
}
.fl-mass {
  min-width: 0; flex: 1 1 auto;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  color: var(--cde-text-dim); font-size: var(--cde-font-sm, 0.85rem);
}
.fl-mass--zug { color: var(--cde-accent); font-weight: 600; font-variant-numeric: tabular-nums; }
.fl-knopf {
  display: inline-flex; align-items: center; justify-content: center; gap: 0.3rem;
  min-height: 44px; min-width: 44px; padding: 0 0.9rem;
  border: 1px solid var(--cde-line); border-radius: 999px;
  background: var(--cde-fill); color: var(--cde-text);
  font-size: var(--cde-font-xs); font-weight: 600; cursor: pointer;
  touch-action: manipulation; flex: 0 0 auto;
}
.fl-knopf:disabled { opacity: 0.45; cursor: default; }
.fl-knopf--fertig {
  border-color: color-mix(in srgb, var(--cde-success-strong) 50%, transparent);
  background: color-mix(in srgb, var(--cde-success-strong) 18%, transparent);
  color: var(--cde-success);
}
</style>
