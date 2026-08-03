<template>
  <svg
    class="fw-icon"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    :stroke-width="strokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
    v-html="path"
  />
</template>

<script setup>
import { computed } from 'vue'

/**
 * Strichzeichnungs-Icons für das Hochwasserwellen-Werkzeug.
 * Bewusst kein Emoji: Emoji rendern je nach Betriebssystem völlig
 * unterschiedlich, lassen sich nicht einfärben und passen nicht zu einem
 * Nachweisdokument. Alle Pfade sind auf 24x24 gezeichnet und erben die
 * Textfarbe über `currentColor`.
 */
const PATHS = {
  // Fließweg zeichnen – Polylinie mit gesetzten Stützpunkten
  polyline: '<polyline points="3 17 8.5 10.5 13 14 17 6.5 21 10.5"/>'
    + '<circle cx="3" cy="17" r="1.5"/><circle cx="21" cy="10.5" r="1.5"/>',

  // Geländehöhen
  terrain: '<path d="M2.5 19l6-9.5 3.6 5 2.4-3.2L21.5 19z"/><path d="M8.5 9.5l1.6 2.5"/>',

  // Einzugsgebiet (unregelmäßiges Polygon)
  region: '<path d="M4 8.5l7-4.5 9 5-2 9-9.5 2L3.5 14z"/>',

  // Niederschlag aus der Wolke
  rain: '<path d="M7.5 15.5a4 4 0 01.3-8 5.4 5.4 0 019.9 1.4 3.4 3.4 0 01-.7 6.6"/>'
    + '<path d="M8.5 17.5L7.5 21"/><path d="M12.5 17.5L11.5 21"/><path d="M16.5 17.5L15.5 21"/>',

  // Dauerstufen durchsuchen
  search: '<circle cx="11" cy="11" r="6.2"/><path d="M15.6 15.6L21 21"/>',

  // Ganglinie berechnen – Achsenkreuz mit Welle
  hydrograph: '<path d="M3.5 3.5v17h17"/><path d="M5 17.5c2.6 0 2.8-9 6.2-9s3.6 9 9.3 9"/>',

  // Bericht
  document: '<path d="M14 3H7.5A2 2 0 005.5 5v14a2 2 0 002 2h9a2 2 0 002-2V8z"/>'
    + '<polyline points="14 3 14 8 19 8"/><path d="M8.5 13h7"/><path d="M8.5 16.5h4.5"/>',

  // Hinweisleiste schließen
  close: '<path d="M6.5 6.5l11 11"/><path d="M17.5 6.5l-11 11"/>',

  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11.5v5"/><path d="M12 8.2v.1"/>',

  alert: '<path d="M12 3.8l8.7 15.4H3.3z"/><path d="M12 10v4"/><path d="M12 16.9v.1"/>'
}

const props = defineProps({
  name: { type: String, required: true },
  size: { type: [Number, String], default: 16 },
  strokeWidth: { type: [Number, String], default: 1.6 }
})

const path = computed(() => PATHS[props.name] || '')
</script>

<style scoped>
.fw-icon {
  display: block;
  flex-shrink: 0;
}
</style>
