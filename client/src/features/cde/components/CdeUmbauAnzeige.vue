<template>
  <div class="umbau" :class="{ 'umbau--klein': klein }" role="status" aria-live="polite" aria-busy="true">
    <span class="umbau-bild" aria-hidden="true" v-html="BILD"></span>
    <span class="umbau-text">{{ text }}</span>
  </div>
</template>

<script setup>
/**
 * CdeUmbauAnzeige — „wird übernommen …" mit der Plananimation (Teil XXXI, T1).
 *
 * Zwischen Loslassen (oder Übernehmen) und fertigem Bild vergehen 1–6 s, weil der fragments-Editor das Eigenbau-Modell
 * neu baut (Teil XXX, B4). Gemessen im Tabletlauf T0: in dieser Zeit stand der alte Zustand ohne jedes Zeichen da —
 * Fabios „der Stand ist irgendwie unklar". Fabio (2026-10-05): „die Plananimation aus flood-2D, nur in passender Farbe".
 *
 * KOPIE, KEIN IMPORT (keine Feature-Querverknüpfungen): `assets/plan-laden.svg` ist `public/construction animations/
 * Loading Icon - Plan.svg` mit `currentColor` statt des Limettengrüns von flood-2D — die Farbe kommt aus dem
 * CDE-Token (`--cde-accent`), hell wie dunkel.
 */
import BILD from '../assets/plan-laden.svg?raw';

defineProps({
  text:  { type: String, default: 'Wird übernommen …' },
  /** Eine Zeile (Tafel) statt Bild über Text (Zeichenfläche). */
  klein: { type: Boolean, default: false },
});
</script>

<style scoped>
.umbau {
  display: flex; flex-direction: column; align-items: center; gap: 0.35rem;
  padding: 0.6rem 0.9rem; border-radius: var(--cde-radius-sm);
  background: var(--cde-surface-raised); border: 1px solid var(--cde-accent-line);
  color: var(--cde-accent);
}
.umbau-bild { display: block; width: 88px; height: 88px; }
.umbau-bild :deep(svg) { width: 100%; height: 100%; display: block; }
.umbau-text { font-size: var(--cde-font-xs); color: var(--cde-text); }
.umbau--klein { flex-direction: row; gap: 0.5rem; padding: 0.3rem 0.5rem; }
.umbau--klein .umbau-bild { width: 44px; height: 44px; }
</style>
