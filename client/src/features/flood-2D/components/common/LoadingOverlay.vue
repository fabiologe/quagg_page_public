<template>
  <Teleport to="body">
    <Transition name="lo-fade">
      <div v-if="visible" class="lo-overlay">
        <div class="lo-card">
          <img class="lo-anim" :src="ANIM_SRC" alt="" draggable="false" />
          <div class="lo-label">{{ label || 'Bitte warten…' }}</div>

          <div v-if="percent != null" class="lo-bar">
            <div class="lo-bar-fill" :style="{ width: clampedPercent + '%' }"></div>
          </div>
          <div v-if="percent != null" class="lo-percent">{{ clampedPercent }} %</div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  visible: { type: Boolean, default: false },
  label: { type: String, default: '' },
  // null/undefined → unbestimmt (kein Balken), sonst 0..100
  percent: { type: Number, default: null },
});

// Selbst-animierte SVG aus /public (SMIL) — Leerzeichen URL-kodiert.
const ANIM_SRC = '/construction%20animations/Loading%20Icon%20-%20Plan.svg';

const clampedPercent = computed(() => Math.max(0, Math.min(100, Math.round(props.percent ?? 0))));
</script>

<style scoped>
.lo-overlay {
  position: fixed;
  inset: 0;
  z-index: 100000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(10, 10, 16, 0.6);
  backdrop-filter: blur(4px);
}
.lo-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 28px 36px;
  border-radius: var(--sv-radius, 16px);
  background: var(--sv-surface, rgba(20, 24, 40, 0.92));
  border: 1px solid var(--sv-border, rgba(255, 255, 255, 0.12));
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.5), var(--sv-glow-violet, none);
  min-width: 260px;
}
.lo-anim {
  width: 140px;
  height: 140px;
  object-fit: contain;
  user-select: none;
  filter: drop-shadow(0 0 12px rgba(139, 92, 246, 0.5));
}
.lo-label {
  color: var(--sv-text-lime, #e8eaf0);
  font-family: var(--sv-font, 'Inter', 'Segoe UI', sans-serif);
  font-size: 0.95rem;
  font-weight: 600;
  text-align: center;
  text-shadow: var(--sv-glow-lime, none);
  letter-spacing: 0.04em;
}
.lo-bar {
  width: 220px;
  height: 8px;
  border-radius: 5px;
  background: rgba(139, 92, 246, 0.18);
  overflow: hidden;
}
.lo-bar-fill {
  height: 100%;
  border-radius: 5px;
  background: linear-gradient(90deg, var(--sv-violet, #4fc3f7), var(--sv-lime, #00bcd4));
  transition: width 0.15s ease;
}
.lo-percent {
  color: var(--sv-text-dim, #90a4ae);
  font-size: 0.78rem;
  font-variant-numeric: tabular-nums;
}

.lo-fade-enter-active,
.lo-fade-leave-active { transition: opacity 0.2s ease; }
.lo-fade-enter-from,
.lo-fade-leave-to { opacity: 0; }
</style>
