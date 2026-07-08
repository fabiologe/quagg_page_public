<template>
  <div class="default-map sv-theme">
    <!-- Regen-Animation im Hintergrund (Canvas, dezent, hinter dem Terminal) -->
    <canvas ref="rainCanvas" class="rain"></canvas>

    <div class="crt">
      <!-- ASCII-Banner (aus public/saintv1d/ascii/…) -->
      <pre class="ascii-banner">{{ banner }}</pre>

      <!-- Terminal-Boot-Log: Zeilen tippen sich nacheinander ein -->
      <div class="terminal">
        <div v-for="(l, i) in doneLines" :key="i" class="term-line" :class="l.cls">{{ l.text }}</div>
        <div class="term-line" :class="typingCls">
          {{ typing }}<span class="caret">█</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';

/**
 * DefaultMap — Terminal/ASCII-Startbildschirm des SaintV-2D-Editors.
 * Wird angezeigt, solange noch KEIN Terrain/Raster geladen ist (statt weißer Wand).
 *
 * ASCII-Art wird aus `public/saintv1d/ascii/<asciiFile>` geladen (mit Inline-Fallback).
 * Boot-Log-Zeilen tippen sich terminal-typisch nacheinander ein.
 */
const props = defineProps({
  // Dateiname unter public/saintv1d/ascii/ (ohne Pfad)
  asciiFile: { type: String, default: 'default.txt' },
  // Boot-Log-Zeilen. `cls`: 'ok' | 'warn' | 'accent' | '' (Farbe)
  lines: {
    type: Array,
    default: () => [
      { text: '> SaintV-2D // 2D hydrodynamic editor', cls: 'accent' },
      { text: '> booting render pipeline .......... OK', cls: 'ok' },
      { text: '> webgl context ................... OK', cls: 'ok' },
      { text: '> terrain buffer ............... EMPTY', cls: 'warn' },
      { text: '>', cls: '' },
      { text: '[!] kein Raster geladen', cls: 'warn' },
      { text: '> awaiting input:  .xyz · .asc · .txt · raster', cls: '' },
      { text: '> ↑  "Select .XYZ File"  im Header klicken, um zu starten', cls: 'accent' },
    ],
  },
});

const FALLBACK_BANNER = [
  '   ____       _       _   __     __     ____  ____',
  '  / ___|  __ _(_)_ __ | |_ \\ \\   / /    |___ \\|  _ \\',
  '  \\___ \\ / _` | | \'_ \\| __| \\ \\ / /       __) | | | |',
  '   ___) | (_| | | | | | |_    \\ V /       / __/| |_| |',
  '  |____/ \\__,_|_|_| |_|\\__|    \\_/       |_____|____/',
].join('\n');

const banner = ref(FALLBACK_BANNER);
const doneLines = ref([]);
const typing = ref('');
const typingCls = ref('');

let timers = [];
const sleep = (ms) => new Promise((r) => { const t = setTimeout(r, ms); timers.push(t); });

/* ── Regen-Animation (Canvas) ─────────────────────────────────────────────── */
const rainCanvas = ref(null);
let rainCtx = null;
let rainRaf = 0;
let drops = [];
let resizeObs = null;
let splashes = [];
let particles = [];   // Rückpraller-Tröpfchen am Boden
let dpr = 1;

// Lime-Regen mit gelegentlichen Violett-Tropfen, leicht schräg (Wind).
const RAIN_COLORS = ['163, 230, 53', '163, 230, 53', '139, 92, 246'];
const WIND = 0.9; // horizontaler Versatz pro Fall-Einheit

function makeDrop(w, h, atTop = false) {
  const speed = 3.6 + Math.random() * 6;     // Tiefe → Geschwindigkeit (40 % langsamer)
  return {
    x: Math.random() * (w + 200) - 100,
    y: atTop ? -20 - Math.random() * h : Math.random() * h,
    len: 8 + speed * 1.6,
    speed,
    alpha: 0.12 + Math.random() * 0.35,
    color: RAIN_COLORS[(Math.random() * RAIN_COLORS.length) | 0],
  };
}

// Splash + Rückpraller am Aufprallpunkt erzeugen (präsenterer Boden-Effekt).
function spawnSplash(x, y, color, speed) {
  if (Math.random() > 0.7) return;           // ~70 % der Tropfen spritzen
  splashes.push({ x, y, r: 0, a: 0.55 + Math.random() * 0.25, color });
  const n = 2 + ((Math.random() * 3) | 0);   // 2–4 Tröpfchen
  for (let k = 0; k < n; k++) {
    particles.push({
      x, y,
      vx: (Math.random() - 0.5) * 1.76,
      vy: -(1.2 + Math.random() * 1.6 + speed * 0.096), // nach oben, skaliert mit Wucht (20 % langsamer)
      a: 0.5 + Math.random() * 0.3,
      color,
    });
  }
}

function sizeRain() {
  const cv = rainCanvas.value;
  if (!cv || !cv.parentElement) return;
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = cv.parentElement.clientWidth;
  const h = cv.parentElement.clientHeight;
  cv.width = Math.max(1, w * dpr);
  cv.height = Math.max(1, h * dpr);
  cv.style.width = w + 'px';
  cv.style.height = h + 'px';
  rainCtx = cv.getContext('2d');
  rainCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // Tropfendichte an Fläche koppeln (gedeckelt für Performance) — 20 % weniger
  const target = Math.min(176, Math.round((w * h) / 11250));
  drops = Array.from({ length: target }, () => makeDrop(w, h));
}

function stepRain() {
  const cv = rainCanvas.value;
  if (!cv || !rainCtx) return;
  const w = cv.width / dpr;
  const h = cv.height / dpr;
  rainCtx.clearRect(0, 0, w, h);
  rainCtx.lineWidth = 1;

  for (const d of drops) {
    rainCtx.strokeStyle = `rgba(${d.color}, ${d.alpha})`;
    rainCtx.beginPath();
    rainCtx.moveTo(d.x, d.y);
    rainCtx.lineTo(d.x + WIND * d.len * 0.12, d.y + d.len);
    rainCtx.stroke();

    d.y += d.speed;
    d.x += WIND * (d.speed * 0.12);

    if (d.y > h) {
      spawnSplash(d.x, h - 2, d.color, d.speed);
      Object.assign(d, makeDrop(w, h, true));
    }
  }

  // ── Boden-„Pfütze": leuchtender Saum, macht den Aufprall-Bereich präsenter ──
  const puddle = rainCtx.createLinearGradient(0, h - 22, 0, h);
  puddle.addColorStop(0, 'rgba(163, 230, 53, 0)');
  puddle.addColorStop(1, 'rgba(163, 230, 53, 0.14)');
  rainCtx.fillStyle = puddle;
  rainCtx.fillRect(0, h - 22, w, 22);

  // ── Splash-Ringe (Doppelring, heller) ──────────────────────────────────────
  for (let i = splashes.length - 1; i >= 0; i--) {
    const s = splashes[i];
    rainCtx.lineWidth = 1.4;
    rainCtx.strokeStyle = `rgba(${s.color}, ${s.a})`;
    rainCtx.beginPath();
    rainCtx.arc(s.x, s.y, s.r, Math.PI, 2 * Math.PI);
    rainCtx.stroke();
    // zweiter, innerer Ring (versetzt) für mehr „Wumms"
    if (s.r > 3) {
      rainCtx.strokeStyle = `rgba(${s.color}, ${s.a * 0.5})`;
      rainCtx.beginPath();
      rainCtx.arc(s.x, s.y, s.r * 0.55, Math.PI, 2 * Math.PI);
      rainCtx.stroke();
    }
    s.r += 1.12; s.a -= 0.0224;   // 20 % langsamer aufweiten/ausklingen
    if (s.a <= 0) splashes.splice(i, 1);
  }
  rainCtx.lineWidth = 1;

  // ── Rückpraller-Tröpfchen (kleine Bögen nach oben) ─────────────────────────
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    rainCtx.fillStyle = `rgba(${p.color}, ${p.a})`;
    rainCtx.fillRect(p.x, p.y, 1.5, 1.5);
    p.x += p.vx; p.y += p.vy; p.vy += 0.28; // Schwerkraft (20 % langsamer)
    p.a -= 0.016;
    if (p.a <= 0 || p.y > h) particles.splice(i, 1);
  }

  rainRaf = requestAnimationFrame(stepRain);
}

function startRain() {
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !rainCanvas.value) return;
  sizeRain();
  resizeObs = new ResizeObserver(() => sizeRain());
  resizeObs.observe(rainCanvas.value.parentElement);
  rainRaf = requestAnimationFrame(stepRain);
}

function stopRain() {
  cancelAnimationFrame(rainRaf);
  if (resizeObs) { resizeObs.disconnect(); resizeObs = null; }
  drops = []; splashes = []; particles = [];
}

async function runTypewriter() {
  for (const line of props.lines) {
    typingCls.value = line.cls || '';
    typing.value = '';
    for (const ch of line.text) {
      typing.value += ch;
      await sleep(14 + Math.random() * 26); // leicht unregelmäßig = „echtes" Tippen
    }
    doneLines.value.push({ text: line.text, cls: line.cls || '' });
    typing.value = '';
    await sleep(180);
  }
  typingCls.value = 'accent';
}

onMounted(async () => {
  // ASCII-Banner aus public/ laden (Fallback bleibt bei Fehler bestehen)
  try {
    const res = await fetch(`/saintv1d/ascii/${props.asciiFile}`);
    if (res.ok) {
      const txt = await res.text();
      if (txt.trim()) banner.value = txt.replace(/\s+$/, '');
    }
  } catch { /* Fallback-Banner behalten */ }
  startRain();
  runTypewriter();
});

onBeforeUnmount(() => {
  timers.forEach(clearTimeout);
  timers = [];
  stopRain();
});
</script>

<style scoped>
.default-map {
  position: absolute;
  inset: 0;
  z-index: 5;                 /* unter dem Header (z-index 10) → Header-Button klickbar */
  pointer-events: none;        /* rein dekorativ, blockiert nichts */
  display: flex;
  align-items: center;
  justify-content: center;
  background:
    radial-gradient(circle at 50% 35%, #1b1b28 0%, var(--sv-bg) 70%),
    var(--sv-bg);
  overflow: hidden;
}

/* Regen-Canvas: füllt den Hintergrund, liegt hinter dem Terminal */
.rain {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
}

/* dezente CRT-Scanlines */
.crt {
  position: relative;
  z-index: 1;                 /* über dem Regen */
  padding: 2rem 2.5rem;
  max-width: 90%;
}
.crt::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: repeating-linear-gradient(
    to bottom,
    rgba(163, 230, 53, 0.04) 0px,
    rgba(163, 230, 53, 0.04) 1px,
    transparent 2px,
    transparent 4px
  );
}

.ascii-banner {
  margin: 0 0 1.5rem;
  font-family: var(--sv-font);
  color: var(--sv-text-violet);
  text-shadow: var(--sv-glow-violet);
  font-size: clamp(0.5rem, 1.4vw, 0.95rem);
  line-height: 1.15;
  white-space: pre;
  letter-spacing: 0;
}

.terminal {
  font-family: var(--sv-font);
  font-size: clamp(0.72rem, 1.1vw, 0.95rem);
  line-height: 1.7;
  color: var(--sv-text);
}
.term-line { white-space: pre-wrap; }
.term-line.ok     { color: var(--sv-text-lime); }
.term-line.warn   { color: #f1c40f; }
.term-line.accent { color: var(--sv-text-violet); text-shadow: var(--sv-glow-violet); }

.caret {
  color: var(--sv-text-lime);
  animation: sv-blink 1s steps(1) infinite;
}
@keyframes sv-blink { 0%, 50% { opacity: 1; } 50.01%, 100% { opacity: 0; } }
</style>
