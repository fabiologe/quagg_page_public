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
  background: linear-gradient(180deg, #1e1e32 0%, #16213e 100%);
  border-bottom: 1px solid rgba(79, 195, 247, 0.15);
  height: 48px;
  flex-shrink: 0;
}

.tl-btn {
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 8px;
  background: rgba(79, 195, 247, 0.15);
  color: #4fc3f7;
  font-size: 1rem;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tl-btn:hover {
  background: rgba(79, 195, 247, 0.3);
  transform: scale(1.05);
}

.tl-track {
  flex: 1;
  position: relative;
  height: 6px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 3px;
  overflow: visible;
}

.tl-fill {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  background: linear-gradient(90deg, #4fc3f7, #00bcd4);
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
  color: #e0e0e0;
  font-variant-numeric: tabular-nums;
}

.tl-frame {
  font-size: 0.7rem;
  color: #607d8b;
}

.tl-speed {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  color: #b0bec5;
  padding: 4px 6px;
  font-size: 0.75rem;
  cursor: pointer;
  outline: none;
}

.tl-speed option {
  background: #1e1e32;
  color: #e0e0e0;
}
</style>
