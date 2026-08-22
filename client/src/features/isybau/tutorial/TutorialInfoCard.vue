<template>
  <div v-if="info" class="info-card">
    <div class="info-header">
      <span class="info-title">WISSEN: {{ info.title }}</span>
      <button class="info-close" @click="guide.toggleInfo()">[x]</button>
    </div>
    <div class="info-body">
      <template v-for="(block, i) in info.blocks" :key="i">
        <p v-if="block.type === 'p'" class="info-p">{{ block.text }}</p>
        <div v-else-if="block.type === 'formula'" class="info-formula">{{ block.text }}</div>
        <div v-else-if="block.type === 'ref'" class="info-ref">&gt; {{ block.text }}</div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { TUTORIAL_INFO } from './tutorialInfo.js';
import { useTutorialGuide } from './useTutorialGuide.js';

const guide = useTutorialGuide();
const { activeStep } = guide;

const info = computed(() => TUTORIAL_INFO[activeStep.value?.info] || null);
</script>

<style scoped>
/* Terminal-Optik wie die Sprechblase, aber mit Platz für Lernstoff. */
.info-card {
  width: min(420px, 90vw);
  max-height: min(430px, 55vh);
  display: flex;
  flex-direction: column;
  background: var(--isy-pixel-bg);
  border: 1px solid var(--isy-pixel-green-glow);
  border-radius: var(--isy-radius-sm);
  box-shadow: var(--isy-elev-3), inset 0 0 20px rgba(0, 255, 80, 0.05);
  pointer-events: auto;
}

.info-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--isy-space-2);
  padding: var(--isy-space-2) var(--isy-space-2);
  border-bottom: 1px solid color-mix(in srgb, var(--isy-pixel-green-glow) 35%, transparent);
}

.info-title {
  font-family: var(--isy-pixel-font);
  font-size: var(--isy-fs-pixel-md);
  line-height: 1.5;
  color: var(--isy-pixel-green-text);
  text-shadow: var(--isy-pixel-text-glow);
}

.info-close {
  background: none;
  border: none;
  cursor: var(--isy-cursor-hand);
  font-family: var(--isy-pixel-font);
  font-size: var(--isy-fs-pixel-sm);
  color: var(--isy-pixel-text-dim);
  padding: 0;
  flex-shrink: 0;
}

.info-close:hover {
  color: var(--isy-pixel-green-text);
}

.info-body {
  overflow-y: auto;
  padding: var(--isy-space-2) var(--isy-space-3) var(--isy-space-3);
  /* Scrollbar: keine eigene Regel — die globale in theme-saintv.css liest
     --scroll-*, die isybau/styles/theme.css auf Gruen setzt. Vorher stand
     hier ein fester Grünton, der den Moduswechsel nicht mitmachte. */
}

/* Längere Absätze in Share Tech Mono — deutlich lesbarer als Press Start 2P.
   Farbe MUSS der neutrale Text-Token sein, nicht die Grün-Familie: hier steht
   der eigentliche Lernstoff, und der wird gelesen, nicht angeschaut. Vorher
   hing hier ein hartcodiertes #9df5c0 (Blassmint aus der Navy-Ära) — auf dem
   beigen Hellmodus-Untergrund ein Kontrast von rund 1:1, also unlesbar. */
.info-p {
  margin: 0 0 var(--isy-space-2);
  font-family: 'Share Tech Mono', monospace;
  font-size: var(--isy-fs-sm);
  line-height: 1.55;
  color: var(--isy-pixel-text);
}

.info-formula {
  margin: 0 0 var(--isy-space-2);
  padding: var(--isy-space-2) var(--isy-space-2);
  border: 1px dashed color-mix(in srgb, var(--isy-pixel-green-glow) 50%, transparent);
  background: color-mix(in srgb, var(--isy-pixel-green-glow) 8%, transparent);
  font-family: 'Share Tech Mono', monospace;
  font-size: var(--isy-fs-md);
  color: var(--isy-pixel-green-text);
  text-shadow: var(--isy-pixel-text-glow);
  text-align: center;
  white-space: pre-wrap;
}

/* Quellenangabe ("> DWA-A 118"). Ebenfalls Fliesstext, nur kleiner — und je
   kleiner die Schrift, desto mehr Kontrast braucht sie. Grün reichte hier
   nicht (rund 3:1 auf Beige bei 0.62rem). */
.info-ref {
  margin: 0 0 var(--isy-space-2);
  font-family: 'Share Tech Mono', monospace;
  font-size: var(--isy-fs-pixel-md);
  color: var(--isy-pixel-text-dim);
}
</style>
