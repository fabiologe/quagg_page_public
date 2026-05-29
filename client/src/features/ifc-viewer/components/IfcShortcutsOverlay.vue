<template>
  <Transition name="fade">
    <div v-if="open" class="sc-overlay" @mousedown.self="close">
      <div class="sc-modal">
        <div class="sc-header">
          <span class="sc-title">⌨ Tastenkürzel</span>
          <button class="sc-close" @click="close">✕</button>
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
const props = defineProps({ open: { type: Boolean, default: false } });
const emit  = defineEmits(['close']);

const groups = [
  {
    title: 'Navigation',
    rows: [
      { keys: ['Ctrl', 'F'],   label: 'Element-Suche öffnen' },
      { keys: ['Klick'],       label: 'Element auswählen' },
      { keys: ['Shift', 'A'],  label: 'Alle Elemente wieder einblenden' },
    ],
  },
  {
    title: 'Selektion',
    rows: [
      { keys: ['H'], label: 'Auswahl verstecken' },
      { keys: ['I'], label: 'Auswahl isolieren (alles andere ausblenden)' },
    ],
  },
  {
    title: 'Messen',
    rows: [
      { keys: ['M'],   label: 'Mess-Modus ein/aus' },
      { keys: ['Esc'], label: 'Mess-Modus verlassen' },
    ],
  },
  {
    title: 'Ansichten & Notizen',
    rows: [
      { keys: ['V'], label: 'Gespeicherte Ansichten ein/aus' },
      { keys: ['N'], label: 'Notizen ein/aus' },
      { keys: ['Esc'], label: 'Pin-Modus verlassen' },
    ],
  },
  {
    title: 'Schnitt-Werkzeug',
    rows: [
      { keys: ['T'],   label: 'Modus: Verschieben' },
      { keys: ['R'],   label: 'Modus: Drehen' },
      { keys: ['Esc'], label: 'Schnitt-Werkzeug ausblenden' },
    ],
  },
  {
    title: 'Hilfe',
    rows: [
      { keys: ['?'],   label: 'Diese Übersicht ein-/ausblenden' },
      { keys: ['Esc'], label: 'Overlay schließen' },
    ],
  },
];

function close() { emit('close'); }
</script>

<style scoped>
.sc-overlay {
  position: fixed; inset: 0; z-index: 220;
  background: rgba(0,0,0,0.5);
  display: flex; justify-content: center; align-items: center;
}
.sc-modal {
  width: 540px; max-width: 92vw; max-height: 80vh;
  background: #1a1e2e;
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 12px;
  box-shadow: 0 16px 48px rgba(0,0,0,0.6);
  display: flex; flex-direction: column;
  overflow: hidden;
}
.sc-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 0.7rem 1rem;
  background: rgba(30, 35, 50, 0.7);
  border-bottom: 1px solid rgba(255,255,255,0.07);
}
.sc-title { font-size: 0.92rem; font-weight: 700; color: #90caf9; }
.sc-close {
  background: none; border: none; color: #78909c;
  font-size: 1.2rem; cursor: pointer; padding: 0 0.3rem;
}
.sc-close:hover { color: #ef5350; }
.sc-body { padding: 0.8rem 1rem; overflow-y: auto; }
.sc-group { margin-bottom: 1rem; }
.sc-group-title {
  font-size: 0.65rem; font-weight: 700; color: #546e7a;
  text-transform: uppercase; letter-spacing: 0.08em;
  margin-bottom: 0.4rem;
}
.sc-row {
  display: flex; align-items: center; gap: 0.8rem;
  padding: 0.3rem 0.2rem;
  border-bottom: 1px solid rgba(255,255,255,0.04);
}
.sc-keys { display: flex; gap: 0.25rem; min-width: 110px; }
.sc-label { font-size: 0.8rem; color: #cfd8dc; }
kbd {
  display: inline-block;
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.18);
  border-bottom-width: 2px;
  border-radius: 4px;
  padding: 0.1rem 0.45rem;
  font-family: monospace;
  font-size: 0.72rem;
  color: #cfd8dc;
  min-width: 1.8em;
  text-align: center;
}
.sc-footer {
  padding: 0.55rem 1rem;
  font-size: 0.7rem; color: #546e7a; text-align: center;
  background: rgba(30, 35, 50, 0.5);
  border-top: 1px solid rgba(255,255,255,0.07);
}
.fade-enter-active, .fade-leave-active { transition: opacity 0.18s ease; }
.fade-enter-from,  .fade-leave-to     { opacity: 0; }
</style>
