<template>
  <div class="timeline-bar">
    <button class="tl-btn" @click="togglePlay" :title="isPlaying ? 'Pause' : 'Play'">
      {{ isPlaying ? '⏸' : '▶' }}
    </button>

    <div class="tl-track">
      <input
        type="range"
        :min="0"
        :max="totalFrames"
        :value="currentFrame"
        @input="onScrub"
        class="tl-slider"
      />
      <div class="tl-fill" :style="{ width: fillPercent + '%' }"></div>
    </div>

    <div class="tl-info">
      <span class="tl-time">{{ formattedTime }}</span>
      <span class="tl-frame">Frame {{ currentFrame }}/{{ totalFrames }}</span>
    </div>

    <select v-model="speed" class="tl-speed" title="Playback Speed">
      <option :value="0.5">0.5×</option>
      <option :value="1">1×</option>
      <option :value="2">2×</option>
      <option :value="4">4×</option>
    </select>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';

const props = defineProps({
  totalFrames: { type: Number, default: 0 },
  simDuration: { type: Number, default: 3600 },
  currentFrame: { type: Number, default: 0 }
});

const emit = defineEmits(['update:currentFrame', 'play', 'pause']);

const isPlaying = ref(false);
const speed = ref(1);

const fillPercent = computed(() => {
  if (props.totalFrames <= 0) return 0;
  return (props.currentFrame / props.totalFrames) * 100;
});

const formattedTime = computed(() => {
  if (props.totalFrames <= 0) return '0:00';
  const t = (props.currentFrame / props.totalFrames) * props.simDuration;
  const mins = Math.floor(t / 60);
  const secs = Math.floor(t % 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
});

const togglePlay = () => {
  isPlaying.value = !isPlaying.value;
  emit(isPlaying.value ? 'play' : 'pause');
};

const onScrub = (e) => {
  isPlaying.value = false;
  emit('pause');
  emit('update:currentFrame', parseInt(e.target.value, 10));
};
</script>

<style scoped>
.timeline-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  background: linear-gradient(180deg, var(--sv-bg-2) 0%, var(--sv-bg) 100%);
  border-bottom: 1px solid var(--sv-border);
  height: 48px;
  flex-shrink: 0;
  font-family: var(--sv-font);
}

.tl-btn {
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 8px;
  background: rgba(139, 92, 246, 0.18);
  color: var(--sv-lime);
  font-size: 1rem;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tl-btn:hover {
  background: rgba(139, 92, 246, 0.32);
  box-shadow: var(--sv-glow-lime);
  transform: scale(1.05);
}

.tl-track {
  flex: 1;
  position: relative;
  height: 6px;
  background: rgba(139, 92, 246, 0.15);
  border-radius: 3px;
  overflow: visible;
}

.tl-fill {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  background: linear-gradient(90deg, var(--sv-violet), var(--sv-lime));
  border-radius: 3px;
  pointer-events: none;
  transition: width 0.1s linear;
}

.tl-slider {
  position: absolute;
  top: -6px;
  left: 0;
  width: 100%;
  height: 18px;
  opacity: 0;
  cursor: pointer;
  z-index: 2;
  margin: 0;
}

.tl-info {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0;
  min-width: 100px;
}

.tl-time {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--sv-text);
  font-variant-numeric: tabular-nums;
}

.tl-frame {
  font-size: 0.7rem;
  color: var(--sv-text-dim);
}

.tl-speed {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--sv-border);
  border-radius: 6px;
  color: var(--sv-text-dim);
  padding: 4px 6px;
  font-size: 0.75rem;
  font-family: var(--sv-font);
  cursor: pointer;
  outline: none;
}

.tl-speed option {
  background: var(--sv-bg-2);
  color: var(--sv-text);
}
</style>
