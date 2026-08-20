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
  background: var(--isy-pixel-bg, #040647);
  border: 1px solid var(--isy-pixel-green-glow, #128040);
  border-radius: 4px;
  box-shadow: 0 4px 16px rgba(4, 6, 71, 0.5), inset 0 0 20px rgba(0, 255, 80, 0.05);
  pointer-events: auto;
}

.info-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.55rem 0.6rem;
  border-bottom: 1px solid color-mix(in srgb, var(--isy-pixel-green-glow, #128040) 35%, transparent);
}

.info-title {
  font-family: var(--isy-pixel-font);
  font-size: 0.48rem;
  line-height: 1.5;
  color: var(--isy-pixel-green-text, #0d6b35);
  text-shadow: var(--isy-pixel-text-glow, none);
}

.info-close {
  background: none;
  border: none;
  cursor: pointer;
  font-family: var(--isy-pixel-font);
  font-size: 0.42rem;
  color: var(--isy-pixel-text-dim, #4a4a4a);
  padding: 0;
  flex-shrink: 0;
}

.info-close:hover {
  color: var(--isy-pixel-green-text, #0d6b35);
}

.info-body {
  overflow-y: auto;
  padding: 0.6rem 0.7rem 0.7rem;
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
  margin: 0 0 0.6rem;
  font-family: 'Share Tech Mono', monospace;
  font-size: 0.72rem;
  line-height: 1.55;
  color: var(--isy-pixel-text, #030430);
}

.info-formula {
  margin: 0 0 0.6rem;
  padding: 0.45rem 0.6rem;
  border: 1px dashed color-mix(in srgb, var(--isy-pixel-green-glow, #128040) 50%, transparent);
  background: color-mix(in srgb, var(--isy-pixel-green-glow, #128040) 8%, transparent);
  font-family: 'Share Tech Mono', monospace;
  font-size: 0.8rem;
  color: var(--isy-pixel-green-text, #0d6b35);
  text-shadow: var(--isy-pixel-text-glow, none);
  text-align: center;
  white-space: pre-wrap;
}

/* Quellenangabe ("> DWA-A 118"). Ebenfalls Fliesstext, nur kleiner — und je
   kleiner die Schrift, desto mehr Kontrast braucht sie. Grün reichte hier
   nicht (rund 3:1 auf Beige bei 0.62rem). */
.info-ref {
  margin: 0 0 0.4rem;
  font-family: 'Share Tech Mono', monospace;
  font-size: 0.62rem;
  color: var(--isy-pixel-text-dim, #4a4a4a);
}
</style>
