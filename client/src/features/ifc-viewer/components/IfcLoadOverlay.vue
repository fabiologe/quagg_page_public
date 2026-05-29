<template>
  <Transition name="fade">
    <div v-if="visible" class="load-overlay">
      <div class="load-card">
        <img
          class="load-anim"
          src="/construction%20animations/Loading%20Icon%20-%20Work%20in%20Progress.svg"
          alt="Loading..."
        />
        <div class="load-title">IFC-Modell wird geladen</div>
        <div class="load-sub">{{ currentStage }}</div>
        <div class="load-bar">
          <div class="load-bar-fill" :style="{ width: progress + '%' }"></div>
        </div>
        <div class="load-meta">{{ Math.round(progress) }} %</div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { ref, watch, onUnmounted } from 'vue';

const props = defineProps({
  visible: { type: Boolean, default: false },
});

// Stages with phase markers. Each stage gets shown for ~1.8s
// Mix of real progress steps and Baustellen-Witz für die langweilige Wartezeit.
const STAGES = [
  { pct:  5, text: 'Datei wird gelesen…' },
  { pct: 10, text: 'Plan wird gerollt… (gefühlt das 8. Mal heute)' },
  { pct: 14, text: 'Geometrie wird zerlegt — der Statiker schaut zu' },
  { pct: 18, text: 'Bewehrung wird virtuell verlegt nach DIN 488' },
  { pct: 22, text: 'Schalung wird gebaut — Maßtoleranz ±5 mm' },
  { pct: 26, text: 'Beton C25/30 noch 28 Tage bis Endfestigkeit…' },
  { pct: 32, text: 'Elemente werden tesselliert' },
  { pct: 36, text: 'Polier ist gerade in der Frühstückspause' },
  { pct: 40, text: 'Bauleiter schimpft am Telefon' },
  { pct: 45, text: 'Räumliche Struktur wird aufgebaut' },
  { pct: 50, text: 'Bauamt prüft den Antrag (kommt zurück 2027)' },
  { pct: 55, text: 'Rohrleitungen werden auf Druck PN 10 geprüft' },
  { pct: 60, text: 'Schacht-Abdeckung wird per LKW geliefert (im Stau)' },
  { pct: 65, text: 'Materialien werden zugewiesen' },
  { pct: 70, text: 'Mörtel angemischt — MG IIa nach DIN 1053' },
  { pct: 74, text: 'Lehrgerüst wird ausgeschalt…' },
  { pct: 78, text: 'Estrich abziehen, dann erstmal 24h warten' },
  { pct: 82, text: 'Brandschutzbeauftragter ist unterwegs' },
  { pct: 86, text: 'Dichtheitsprüfung läuft (DIN EN 1610)' },
  { pct: 90, text: 'Ansicht wird vorbereitet' },
  { pct: 93, text: 'Architekt zeichnet noch eine letzte Variante…' },
  { pct: 96, text: 'Letzte Schraube wird angezogen — fertig gleich' },
];

const currentStage = ref(STAGES[0].text);
const progress     = ref(0);
let _timer = null;
let _idx   = 0;

function _start() {
  _idx = 0;
  progress.value     = 0;
  currentStage.value = STAGES[0].text;
  _timer = setInterval(() => {
    if (_idx < STAGES.length - 1) {
      _idx++;
      const s = STAGES[_idx];
      progress.value     = s.pct;
      currentStage.value = s.text;
    } else {
      // Slowly creep toward 99 while waiting for actual completion
      if (progress.value < 99) progress.value += 0.15;
    }
  }, 1800);
}

function _stop() {
  if (_timer) { clearInterval(_timer); _timer = null; }
  progress.value = 100;
}

watch(() => props.visible, (val) => {
  if (val) _start();
  else     _stop();
}, { immediate: true });

onUnmounted(_stop);
</script>

<style scoped>
.load-overlay {
  position: absolute; inset: 0; z-index: 50;
  background: rgba(14, 16, 24, 0.92);
  backdrop-filter: blur(6px);
  display: flex; align-items: center; justify-content: center;
  pointer-events: all;
}
.load-card {
  display: flex; flex-direction: column; align-items: center; gap: 0.7rem;
  padding: 1.5rem 2.5rem 2rem;
  background: rgba(30, 35, 50, 0.85);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 12px;
  box-shadow: 0 16px 48px rgba(0,0,0,0.6);
  min-width: 420px;
  max-width: 500px;
}
.load-anim {
  width: 220px; height: 220px;
  /* Slight lift so the built-in "WORK IN PROGRESS" caption sits inside the card nicely */
  margin-bottom: -0.5rem;
  /* SMIL animations inside the SVG run automatically when loaded via <img> */
  user-select: none; pointer-events: none;
}
.load-title {
  font-size: 0.95rem; font-weight: 600; color: #cfd8dc;
  letter-spacing: 0.02em;
}
.load-sub {
  font-size: 0.78rem; color: #90a4ae; min-height: 2.4em;
  text-align: center; line-height: 1.4;
  font-style: italic;
}
.load-bar {
  width: 100%; height: 4px;
  background: rgba(255,255,255,0.08);
  border-radius: 2px; overflow: hidden;
}
.load-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #42a5f5, #90caf9);
  border-radius: 2px;
  transition: width 0.4s ease-out;
}
.load-meta {
  font-size: 0.7rem; color: #546e7a;
  font-variant-numeric: tabular-nums;
}
.fade-enter-active, .fade-leave-active { transition: opacity 0.25s ease; }
.fade-enter-from,  .fade-leave-to     { opacity: 0; }
</style>
