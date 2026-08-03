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
  border-bottom: 1px solid rgba(0, 232, 85, 0.35);
}

.info-title {
  font-family: var(--isy-pixel-font);
  font-size: 0.48rem;
  line-height: 1.5;
  color: var(--isy-pixel-green-bright, #18a34a);
  text-shadow: 0 0 10px rgba(0, 255, 101, 0.8);
}

.info-close {
  background: none;
  border: none;
  cursor: pointer;
  font-family: var(--isy-pixel-font);
  font-size: 0.42rem;
  color: var(--isy-pixel-green-active, #00994d);
  padding: 0;
  flex-shrink: 0;
}

.info-close:hover {
  color: var(--isy-pixel-green-bright, #18a34a);
}

.info-body {
  overflow-y: auto;
  padding: 0.6rem 0.7rem 0.7rem;
  scrollbar-width: thin;
  scrollbar-color: var(--isy-pixel-green-active, #00994d) var(--isy-pixel-bg, #040647);
}

/* Längere Absätze in Share Tech Mono — deutlich lesbarer als Press Start 2P. */
.info-p {
  margin: 0 0 0.6rem;
  font-family: 'Share Tech Mono', monospace;
  font-size: 0.72rem;
  line-height: 1.55;
  color: #9df5c0;
}

.info-formula {
  margin: 0 0 0.6rem;
  padding: 0.45rem 0.6rem;
  border: 1px dashed rgba(0, 232, 85, 0.5);
  background: rgba(0, 232, 85, 0.06);
  font-family: 'Share Tech Mono', monospace;
  font-size: 0.8rem;
  color: var(--isy-pixel-green-bright, #18a34a);
  text-shadow: 0 0 8px rgba(0, 255, 101, 0.6);
  text-align: center;
  white-space: pre-wrap;
}

.info-ref {
  margin: 0 0 0.4rem;
  font-family: 'Share Tech Mono', monospace;
  font-size: 0.62rem;
  color: var(--isy-pixel-green-active, #00994d);
}
</style>
