<template>
  <button
    class="cde-card-btn"
    :class="{ 'is-active': aktiv }"
    :disabled="disabled || busy"
    :title="titel"
    :aria-label="titel"
    type="button"
  >
    <CdeIcon :name="busy ? 'busy' : icon" :size="14" :class="{ 'is-busy': busy }" />
  </button>
</template>

<script setup>
/**
 * Quadratischer Icon-Knopf der Kachelköpfe und Panel-Leisten.
 *
 * `busy` tauscht das Symbol gegen die kreisende Anzeige UND sperrt den Knopf —
 * bisher stand dafür in fünf Kacheln ein `{{ loading ? '⏳' : '↻' }}`, das den
 * Doppelklick währenddessen nicht verhinderte.
 *
 * `titel` ist Pflicht: der Knopf trägt keine Beschriftung, ohne ihn wäre er
 * für Screenreader stumm.
 */
import CdeIcon from './CdeIcon.vue';

defineProps({
  icon:     { type: String,  required: true },
  titel:    { type: String,  required: true },
  busy:     { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  aktiv:    { type: Boolean, default: false },
});
</script>

<style scoped>
.cde-card-btn.is-active {
  background: color-mix(in srgb, var(--card-accent) 22%, transparent);
  border-color: color-mix(in srgb, var(--card-accent) 55%, transparent);
  color: var(--card-accent);
}
</style>
