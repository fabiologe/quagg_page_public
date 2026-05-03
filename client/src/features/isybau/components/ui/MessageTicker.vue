<template>
  <div class="ticker-bar">
    <div class="ticker-label">QUAGG</div>
    <div class="ticker-track" ref="trackEl">
      <Transition name="ticker-slide" mode="out-in">
        <span :key="currentIndex" class="ticker-text">
          {{ current.text }}
          <a
            v-if="current.link"
            :href="current.link"
            target="_blank"
            rel="noopener noreferrer"
            class="ticker-link"
            @click.stop
          >{{ current.linkText || current.link }}</a>
        </span>
      </Transition>
    </div>
    <div class="ticker-dots">
      <span
        v-for="(_, i) in messages"
        :key="i"
        class="dot"
        :class="{ active: i === currentIndex }"
        @click="jumpTo(i)"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import rawMessages from '../../data/ticker-messages.json';

const messages = rawMessages;
const currentIndex = ref(0);
const INTERVAL_MS = 7000;

let timer = null;

const current = computed(() => messages[currentIndex.value] ?? {});

const advance = () => {
  currentIndex.value = (currentIndex.value + 1) % messages.length;
};

const jumpTo = (i) => {
  currentIndex.value = i;
  resetTimer();
};

const resetTimer = () => {
  clearInterval(timer);
  timer = setInterval(advance, INTERVAL_MS);
};

onMounted(() => {
  timer = setInterval(advance, INTERVAL_MS);
});

onBeforeUnmount(() => {
  clearInterval(timer);
});
</script>

<style scoped>
.ticker-bar {
  height: 28px;
  background: #1a1a2e;
  display: flex;
  align-items: center;
  gap: 0;
  flex-shrink: 0;
  overflow: hidden;
  user-select: none;
}

.ticker-label {
  flex-shrink: 0;
  background: #3367d6;
  color: white;
  font-size: 0.65rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  padding: 0 0.6rem;
  height: 100%;
  display: flex;
  align-items: center;
}

.ticker-track {
  flex: 1;
  overflow: hidden;
  padding: 0 0.75rem;
  position: relative;
  height: 100%;
  display: flex;
  align-items: center;
}

.ticker-text {
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 0.75rem;
  color: #c8d6e5;
  line-height: 1;
}

.ticker-link {
  color: #74b9ff;
  text-decoration: none;
  margin-left: 0.3rem;
  border-bottom: 1px dotted #74b9ff;
}
.ticker-link:hover {
  color: #fff;
  border-bottom-style: solid;
}

.ticker-dots {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 0.6rem;
}

.dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #444;
  cursor: pointer;
  transition: background 0.25s;
  flex-shrink: 0;
}
.dot.active { background: #3367d6; }
.dot:hover  { background: #74b9ff; }

/* Slide transition: neues kommt von rechts, altes geht nach links */
.ticker-slide-enter-active {
  transition: transform 0.35s cubic-bezier(0.25, 0.8, 0.25, 1), opacity 0.25s ease;
}
.ticker-slide-leave-active {
  transition: transform 0.25s ease-in, opacity 0.2s ease;
}
.ticker-slide-enter-from {
  transform: translateX(24px);
  opacity: 0;
}
.ticker-slide-leave-to {
  transform: translateX(-24px);
  opacity: 0;
}
</style>
