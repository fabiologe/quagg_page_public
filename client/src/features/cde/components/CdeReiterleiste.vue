<template>
  <!-- EINE Reiterleiste rechts (Abnahme 2026-09-12, E7): alle Tafeln an einem
       Ort, mit Namen. Die Struktur öffnet weiter links — so können Struktur
       und Bauteil zugleich offen sein. Ein Strich trennt, was links aufgeht. -->
  <nav class="cde-reiter" aria-label="Tafeln">
    <template v-for="(p, i) in eintraege" :key="p.id">
      <span v-if="i > 0 && p.seite !== eintraege[i - 1].seite" class="cr-trenner" aria-hidden="true"></span>
      <button
        class="cr-knopf"
        :class="{ an: panels.isOpen(p.id) }"
        :aria-pressed="panels.isOpen(p.id)"
        :title="`${p.titel} ${panels.isOpen(p.id) ? 'schließen' : 'öffnen'}${p.seite === 'left' ? ' — öffnet links' : ''}`"
        @click="panels.toggle(p.id)"
      >
        <CdeIcon :name="p.icon" :size="17" />
        <span class="cr-text">{{ p.kurz ?? p.titel }}</span>
      </button>
    </template>
  </nav>
</template>

<script setup>
/**
 * Die Reiterleiste am rechten Rand. Sie liest den Panel-Katalog — dieselbe
 * Quelle wie Befehlspalette und Hilfe — und zeigt ALLE Tafeln mit Symbol und
 * Namen, zuerst die linke (Struktur), dann die rechten. Pro Seite ist
 * höchstens eine Tafel offen.
 *
 * Eine Tafel mit `nurIn` steht nur in diesem Ansichtsmodus da (H2): der
 * Planinhalt gehört zum Lageplan, im 3D hätte er nichts zu zeigen.
 */
import { computed } from 'vue';
import CdeIcon from './ui/CdeIcon.vue';
import { usePanels } from '../stores/usePanels.js';
import { useAnsicht } from '../stores/useAnsicht.js';

const panels = usePanels();
const ansicht = useAnsicht();
const eintraege = computed(() => {
  const sichtbar = panels.defs.filter(p => !p.nurIn || ansicht.modus === p.nurIn);
  return [...sichtbar.filter(p => p.seite === 'left'), ...sichtbar.filter(p => p.seite !== 'left')];
});
</script>

<style scoped>
.cde-reiter {
  display: flex; flex-direction: column; gap: 2px;
  width: 68px; flex-shrink: 0;
  padding: 0.35rem 0.25rem;
  background: var(--cde-bg-alt);
  border-left: 1px solid var(--cde-tint);
}

.cr-knopf {
  display: grid; justify-items: center; gap: 3px;
  min-height: 48px;
  padding: 0.35rem 0.1rem;
  background: none; border: none;
  border-radius: var(--cde-radius-sm);
  color: var(--cde-text-dim);
  font-size: var(--cde-font-xs);
  line-height: 1.1;
  cursor: pointer;
  touch-action: manipulation;
}
.cr-knopf:hover { background: var(--cde-fill-hover); color: var(--cde-text); }
.cr-knopf.an { background: var(--cde-accent-fill-hi); color: var(--cde-accent); }
.cr-knopf:focus-visible { outline: 2px solid var(--cde-accent-line); outline-offset: -2px; }
.cr-text { max-width: 100%; overflow-wrap: anywhere; text-align: center; }
.cr-trenner { height: 1px; margin: 0.25rem 0.4rem; background: var(--cde-line); }

/* Hochkant (Breakpoint wie CdePanel): die Leiste liegt als Reihe unter dem Bild. */
@media (max-width: 900px) {
  .cde-reiter {
    flex-direction: row; width: auto;
    padding: 0.25rem;
    border: none; border-top: 1px solid var(--cde-tint);
    overflow-x: auto;
  }
  .cr-knopf { min-width: 56px; }
  .cr-trenner { width: 1px; height: auto; margin: 0.4rem 0.2rem; }
}
</style>
