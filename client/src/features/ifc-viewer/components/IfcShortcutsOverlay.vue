<template>
  <Transition name="fade">
    <div v-if="open" class="sc-overlay" @mousedown.self="close">
      <div class="sc-modal">
        <div class="sc-header">
          <span class="sc-title"><CdeIcon name="help" :size="15" /> Tastenkürzel</span>
          <button class="sc-close" @click="close"><CdeIcon name="close" :size="14" /></button>
        </div>

        <div class="sc-body">
          <div v-for="group in groups" :key="group.title" class="sc-group">
            <div class="sc-group-title">{{ group.title }}</div>
            <div v-for="row in group.rows" :key="row.label" class="sc-row">
              <span class="sc-keys">
                <kbd v-for="(k, i) in row.keys" :key="i">{{ k }}</kbd>
              </span>
              <span class="sc-label">{{ row.label }}</span>
            </div>
          </div>
        </div>

        <div class="sc-footer">Drücke <kbd>Esc</kbd> oder <kbd>?</kbd> zum Schließen</div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { computed } from 'vue';
import CdeIcon from './ui/CdeIcon.vue';
import { usePaletteCommands } from '../stores/useCommands.js';

defineProps({ open: { type: Boolean, default: false } });
const emit = defineEmits(['close']);

const cmds = usePaletteCommands();

/**
 * Die Liste wird aus der Befehls-Registry ERZEUGT (Sprint U) — früher stand
 * hier eine handgepflegte Kopie der Tastaturlogik, die zwangsläufig veraltete.
 * Jetzt kann kein Kürzel mehr dokumentiert sein, das es nicht gibt.
 */
const groups = computed(() => {
  const nach = new Map();
  for (const c of cmds.mitTaste) {
    const g = c.gruppe || 'Allgemein';
    if (!nach.has(g)) nach.set(g, []);
    nach.get(g).push({ label: c.titel, keys: String(c.key).split('/') });
  }
  const out = [...nach.entries()].map(([title, rows]) => ({ title, rows }));
  out.push({
    title: 'Suchen & Befehle',
    rows: [
      { label: 'Befehls-Palette öffnen', keys: ['Strg', 'K'] },
      { label: 'Element suchen',         keys: ['Strg', 'F'] },
      { label: 'Diese Hilfe',            keys: ['?'] },
      { label: 'Schließen / Abbrechen',  keys: ['Esc'] },
    ],
  });
  return out;
});

function close() { emit('close'); }
</script>

<style scoped>
.sc-overlay {
  position: fixed; inset: 0; z-index: 220;
  background: var(--cde-scrim);
  display: flex; justify-content: center; align-items: center;
}
.sc-modal {
  width: 540px; max-width: 92vw; max-height: 80vh;
  background: var(--cde-surface-alt);
  border: 1px solid var(--cde-tint-strong);
  border-radius: 12px;
  box-shadow: 0 16px 48px rgba(0,0,0,0.6);
  display: flex; flex-direction: column;
  overflow: hidden;
}
.sc-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 0.7rem 1rem;
  background: rgba(30, 35, 50, 0.7);
  border-bottom: 1px solid var(--cde-tint);
}
.sc-title { font-size: 0.92rem; font-weight: 700; color: var(--cde-accent-soft); }
.sc-close {
  background: none; border: none; color: var(--cde-text-mute);
  font-size: 1.2rem; cursor: pointer; padding: 0 0.3rem;
}
.sc-close:hover { color: var(--cde-danger); }
.sc-body { padding: 0.8rem 1rem; overflow-y: auto; }
.sc-group { margin-bottom: 1rem; }
.sc-group-title {
  font-size: 0.65rem; font-weight: 700; color: var(--cde-text-dimmer);
  text-transform: uppercase; letter-spacing: 0.08em;
  margin-bottom: 0.4rem;
}
.sc-row {
  display: flex; align-items: center; gap: 0.8rem;
  padding: 0.3rem 0.2rem;
  border-bottom: 1px solid var(--cde-tint-weak);
}
.sc-keys { display: flex; gap: 0.25rem; min-width: 110px; }
.sc-label { font-size: 0.8rem; color: var(--cde-text); }
kbd {
  display: inline-block;
  background: var(--cde-tint);
  border: 1px solid var(--cde-tint-max);
  border-bottom-width: 2px;
  border-radius: 4px;
  padding: 0.1rem 0.45rem;
  font-family: monospace;
  font-size: 0.72rem;
  color: var(--cde-text);
  min-width: 1.8em;
  text-align: center;
}
.sc-footer {
  padding: 0.55rem 1rem;
  font-size: 0.7rem; color: var(--cde-text-dimmer); text-align: center;
  background: rgba(30, 35, 50, 0.5);
  border-top: 1px solid var(--cde-tint);
}
.fade-enter-active, .fade-leave-active { transition: opacity 0.18s ease; }
.fade-enter-from,  .fade-leave-to     { opacity: 0; }
</style>
