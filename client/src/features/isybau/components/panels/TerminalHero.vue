<template>
  <div class="terminal" aria-hidden="true">
    <div class="terminal-inner">
      <!-- Completed lines -->
      <div
        v-for="(line, i) in completedLines"
        :key="i"
        class="t-line"
        :class="lineClass(line)"
      >{{ line === '' ? ' ' : line }}</div>

      <!-- Currently-typing line -->
      <div v-if="typingText !== null" class="t-line" :class="lineClass(typingText)">
        {{ typingText }}<span class="cursor">_</span>
      </div>

      <!-- Idle cursor (after all lines done) -->
      <div v-else class="t-line">
        <span class="cursor">_</span>
      </div>
    </div>

    <!-- CRT overlay -->
    <div class="scanlines" />
    <div class="crt-vignette" />
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import takes from '../../data/terminal-takes.json';

// ── Timing config ─────────────────────────────────────────────────────────────
const CHAR_DELAY_MS   = 42;   // ms per character while typing
const LINE_PAUSE_MS   = 420;  // pause after line completes before next starts
const TAKE_HOLD_MS    = 2600; // hold finished take before resetting
const TAKE_GAP_MS     = 700;  // blank screen gap between takes

// ── State ─────────────────────────────────────────────────────────────────────
const completedLines = ref([]);
const typingText     = ref(null); // null = idle, string = currently typing

let running = true;
let takeIndex = 0;

// ── Helpers ───────────────────────────────────────────────────────────────────
function cancellableSleep(ms) {
  return new Promise(resolve => {
    const start = Date.now();
    const tick = () => {
      if (!running) { resolve(); return; }
      if (Date.now() - start >= ms) { resolve(); return; }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

function lineClass(text) {
  if (!text) return '';
  if (text.startsWith('>')) return 'cmd';
  if (text.includes('[OK]') || text.includes('[BEREIT]')) return 'ok';
  if (text.includes('[EXPORT]') || text.includes('[ERR]')) return 'warn';
  if (text === '================') return 'sep';
  if (text.startsWith('. ')) return 'dots';
  return '';
}

// ── Main loop ─────────────────────────────────────────────────────────────────
async function runLoop() {
  while (running) {
    const take = takes[takeIndex % takes.length];
    takeIndex++;

    completedLines.value = [];
    typingText.value = null;

    await cancellableSleep(TAKE_GAP_MS);

    for (const lineText of take.lines) {
      if (!running) return;

      if (lineText === '') {
        typingText.value = null;
        completedLines.value = [...completedLines.value, ''];
        await cancellableSleep(LINE_PAUSE_MS * 0.6);
        continue;
      }

      typingText.value = '';
      for (const char of lineText) {
        if (!running) return;
        typingText.value += char;
        await cancellableSleep(CHAR_DELAY_MS);
      }

      await cancellableSleep(LINE_PAUSE_MS);
      completedLines.value = [...completedLines.value, typingText.value];
      typingText.value = null;
    }

    // Hold finished take
    await cancellableSleep(TAKE_HOLD_MS);
  }
}

onMounted(() => { runLoop(); });
onUnmounted(() => { running = false; });
</script>

<style scoped>
/* ── Root ── */
.terminal {
  position: relative;
  flex: 1;
  min-height: 0;
  background: #040647;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: inset 0 0 40px rgba(0, 255, 80, 0.04);
}

/* ── Text area ── */
.terminal-inner {
  flex: 1;
  padding: 1rem 0.85rem 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  overflow: hidden;
}

/* ── Lines ── */
.t-line {
  font-family: 'Press Start 2P', monospace;
  font-size: 0.52rem;
  line-height: 1.7;
  color: #00e855;
  white-space: pre-wrap;
  word-break: break-all;
  text-shadow: 0 0 8px rgba(0, 232, 85, 0.7);
  min-height: 1em;
}

/* Command line: brighter */
.t-line.cmd {
  color: #00ff65;
  text-shadow: 0 0 12px rgba(0, 255, 101, 0.9);
}

/* [OK] status: slightly dimmer green */
.t-line.ok {
  color: #2ecc71;
  text-shadow: 0 0 6px rgba(46, 204, 113, 0.5);
}

/* Warnings / export */
.t-line.warn {
  color: #f9ca24;
  text-shadow: 0 0 8px rgba(249, 202, 36, 0.6);
}

/* Separator */
.t-line.sep {
  color: #00662e;
  text-shadow: none;
}

/* Progress dots */
.t-line.dots {
  letter-spacing: 0.35em;
  color: #00994d;
}

/* ── Cursor ── */
.cursor {
  display: inline-block;
  animation: blink 0.85s step-start infinite;
  color: #00ff65;
  text-shadow: 0 0 10px #00ff65;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0; }
}

/* ── CRT Scanlines ── */
.scanlines {
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(
    0deg,
    transparent,
    transparent 3px,
    rgba(0, 0, 0, 0.18) 3px,
    rgba(0, 0, 0, 0.18) 4px
  );
  pointer-events: none;
  z-index: 2;
}

/* ── Vignette ── */
.crt-vignette {
  position: absolute;
  inset: 0;
  background: radial-gradient(
    ellipse at center,
    transparent 60%,
    rgba(0, 0, 0, 0.55) 100%
  );
  pointer-events: none;
  z-index: 3;
}
</style>
