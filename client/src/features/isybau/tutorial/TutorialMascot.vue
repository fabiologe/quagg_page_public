<template>
  <!-- v-show statt v-if: die vorgeladenen Lottie-Instanzen (mood-layer)
       bleiben dauerhaft im DOM — Mood-Wechsel ist nur noch Umblenden. -->
  <Transition :name="leaveTransition">
    <div v-show="activeStep" class="tutorial-mascot">
      <Transition name="bubble-fade">
        <div v-if="bubbleVisible && activeStep" class="speech-bubble">
          <button class="bubble-close" @click="guide.dismiss()">[x]</button>
          <div class="bubble-text">{{ typedText }}<span class="cursor">_</span></div>
          <div v-if="activeStep.isTour" class="bubble-actions">
            <button class="bubble-btn" @click="guide.next()">[Weiter]</button>
            <button v-if="activeStep.info" class="bubble-btn bubble-btn-info" @click="guide.toggleInfo()">[Mehr dazu]</button>
            <button class="bubble-btn bubble-btn-dim" @click="guide.skipTour()">[Tour beenden]</button>
          </div>
          <div v-else-if="activeStep.kind === 'confirm'" class="bubble-actions">
            <button class="bubble-btn" @click="guide.confirmYes()">[Ja]</button>
            <button class="bubble-btn bubble-btn-dim" @click="guide.confirmNo()">[Nein]</button>
          </div>
          <div v-else-if="activeStep.info" class="bubble-actions">
            <button class="bubble-btn bubble-btn-info" @click="guide.toggleInfo()">[Mehr dazu]</button>
          </div>
        </div>
      </Transition>
      <Transition name="bubble-fade">
        <TutorialInfoCard v-if="infoOpen && activeStep?.info" class="info-card-slot" />
      </Transition>
      <img
        v-if="activeStep?.gif && gifVisible"
        class="kill-gif"
        src="/saintv1d/tutorial/kill_rat.gif"
        alt=""
      />
      <div ref="lottieEl" class="mascot-figure" />
    </div>
  </Transition>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue';
import lottie from 'lottie-web';
import { loadMoodAnimation } from './moods.js';
import { KILL_STEPS } from './tutorialSteps.js';
import { useTutorialGuide } from './useTutorialGuide.js';
import TutorialInfoCard from './TutorialInfoCard.vue';
import { useTutorialTriggers } from './useTutorialTriggers.js';
import { useHighlight } from './useHighlight.js';

const CHAR_DELAY_MS = 32;
const BUBBLE_DELAY_MS = 450; // let the mascot rise in before the bubble types
const STARTUP_DELAY_MS = 5000; // Ratte taucht 5s nach Seitenladen auf
const GIF_DELAY_MS = 1000; // kurze Schrecksekunde, bevor Schuss-GIF + Knall kommen

const guide = useTutorialGuide();
const { activeStep, infoOpen } = guide;

// Store-Beobachtung (reaktive Trigger) und Element-Highlighting leben in
// eigenen Modulen — hier nur einmal angeschlossen.
useTutorialTriggers();
useHighlight();

const lottieEl = ref(null);
const bubbleVisible = ref(false);
const gifVisible = ref(false);
const typedText = ref('');
// Nach der Kill-Sequenz verblasst die tote Ratte, statt nach unten
// rauszurutschen. Muss ein eigener Ref sein: beim Leave ist activeStep
// schon null, der Transition-Name braucht den letzten Step.
const leaveTransition = ref('rise');

let typingTimer = null;
let bubbleTimer = null;
let gifTimer = null;

function stopTyping() {
  clearTimeout(typingTimer);
  clearTimeout(bubbleTimer);
  clearTimeout(gifTimer);
}

function typeMessage(message) {
  typedText.value = '';
  let i = 0;
  const step = () => {
    typedText.value += message[i];
    i++;
    if (i < message.length) {
      typingTimer = setTimeout(step, CHAR_DELAY_MS);
    }
  };
  step();
}

let sound = null;

// GIF + MP3 werden zusammen mit den Lotties direkt beim Mount vorgeladen,
// damit die Kill-Sequenz ohne Nachlade-Ruckler durchläuft.
const KILL_GIF_SRC = '/saintv1d/tutorial/kill_rat.gif';
const SPEAK_SOUND_SRC = '/saintv1d/tutorial/rat_speak_sound.mp3';
let preloadedGif = null;
let preloadedAudio = null;
let preloadedSpeakAudio = null;

function preloadKillAssets() {
  if (preloadedGif) return;
  const soundSrc = KILL_STEPS.find((s) => s.sound)?.sound;
  if (soundSrc) {
    preloadedAudio = new Audio(soundSrc);
    preloadedAudio.preload = 'auto';
    preloadedAudio.load();
  }
  preloadedGif = new Image();
  preloadedGif.src = KILL_GIF_SRC;
  preloadedSpeakAudio = new Audio(SPEAK_SOUND_SRC);
  preloadedSpeakAudio.preload = 'auto';
  preloadedSpeakAudio.load();
}

// Kein Autoplay-Problem: die Kill-Sequenz folgt immer auf einen Klick ([Nein]),
// damit ist die Audio-Wiedergabe vom Browser erlaubt.
function playSound(src) {
  stopSound();
  sound = preloadedAudio?.src.endsWith(src) ? preloadedAudio : new Audio(src);
  sound.currentTime = 0;
  sound.play().catch(() => {}); // falls der Browser doch blockt: still bleiben
}

function stopSound() {
  if (sound) {
    sound.pause();
    sound = null;
  }
}

// Eigener Sound-Slot fuer die Sprechblase, unabhaengig von playSound/stopSound
// (Schuss-SFX), damit ein Tour-Klick waehrend der Kill-Sequenz nichts abwuergt.
let speakSound = null;

function playSpeakSound() {
  stopSpeakSound();
  speakSound = preloadedSpeakAudio || new Audio(SPEAK_SOUND_SRC);
  speakSound.currentTime = 0;
  speakSound.play().catch(() => {}); // erster Auftritt nach 5s hat evtl. noch keine Nutzer-Geste
}

function stopSpeakSound() {
  if (speakSound) {
    speakSound.pause();
    speakSound = null;
  }
}

// ── Persistente Lottie-Instanzen ─────────────────────────────────────────────
// Jeder Mood bekommt EINMAL eine eigene Instanz in einem eigenen Layer-Div.
// Mood-Wechsel = Layer umblenden + von vorn abspielen — kein destroy/rebuild,
// kein Nachladen, kein Flackern (das war der Produktions-Ruckler).
const moodLayers = new Map(); // mood -> { anim, el }
let currentMood = null;

async function ensureMoodLayer(mood) {
  if (moodLayers.has(mood)) return moodLayers.get(mood);
  const animationData = await loadMoodAnimation(mood);
  if (moodLayers.has(mood)) return moodLayers.get(mood); // paralleler Aufruf war schneller
  if (!lottieEl.value) return null;

  const el = document.createElement('div');
  el.className = 'mood-layer';
  el.style.display = 'none';
  lottieEl.value.appendChild(el);

  const anim = lottie.loadAnimation({
    container: el,
    renderer: 'svg',
    loop: false,
    autoplay: false,
    animationData,
  });
  anim.setSpeed(0.25);
  // stop() spult auf Frame 0 zurück — Steps mit freeze:true (rat_kill)
  // bleiben stattdessen auf dem letzten Frame stehen.
  anim.addEventListener('complete', () => {
    if (!activeStep.value?.freeze) anim.goToAndStop(0, true);
  });

  const entry = { anim, el };
  moodLayers.set(mood, entry);
  return entry;
}

async function showMood(mood) {
  if (!mood) return;
  currentMood = mood;
  const entry = await ensureMoodLayer(mood); // vorgeladen: löst sofort auf
  // Während des (Erst-)Ladens kann der Step schon weitergesprungen sein.
  if (!entry || currentMood !== mood) return;

  for (const [m, layer] of moodLayers) {
    if (m !== mood && layer.el.style.display !== 'none') {
      layer.el.style.display = 'none';
      layer.anim.goToAndStop(0, true);
    }
  }
  entry.el.style.display = '';
  entry.anim.goToAndPlay(0, true);
}

function hideMascotAnim() {
  currentMood = null;
  for (const layer of moodLayers.values()) {
    layer.el.style.display = 'none';
    layer.anim.goToAndStop(0, true);
  }
}

// Alle Moods beim Seitenstart laden — sequenziell in Auftritts-Reihenfolge,
// damit 'happy' (Tour-Begrüßung nach 5 s) zuerst fertig ist.
async function preloadAllMoods() {
  const order = ['happy', 'asking', 'rain', 'surprised', 'sad', 'kill'];
  for (const mood of order) {
    try {
      await ensureMoodLayer(mood);
    } catch {
      /* Netzfehler: showMood versucht es beim Auftritt erneut */
    }
  }
}

watch(
  activeStep,
  (step) => {
    stopTyping();
    stopSpeakSound();
    bubbleVisible.value = false;
    gifVisible.value = false;
    typedText.value = '';

    if (!step) {
      hideMascotAnim();
      return;
    }

    leaveTransition.value = step.kind === 'kill' ? 'fade-out' : 'rise';
    showMood(step.mood);
    if (step.gif) {
      // GIF und Knall zusammen, nach der Schrecksekunde
      gifTimer = setTimeout(() => {
        gifVisible.value = true;
        if (step.sound) playSound(step.sound);
      }, GIF_DELAY_MS);
    } else if (step.sound) {
      playSound(step.sound);
    }
    if (step.message) {
      bubbleTimer = setTimeout(() => {
        bubbleVisible.value = true;
        typeMessage(step.message);
        playSpeakSound();
      }, BUBBLE_DELAY_MS);
    }
  },
  { immediate: true, flush: 'post' }
);

let startupTimer = null;

onMounted(() => {
  // ALLE Animations-Assets sofort vorladen (Lotties, GIF, MP3) — bis zum
  // Auftritt nach 5 s ist alles da, danach wird nur noch umgeblendet.
  preloadAllMoods();
  preloadKillAssets();
  // Tour startet bei jedem Laden — wer sie nicht will, drückt sie einfach weg.
  startupTimer = setTimeout(() => guide.startTour(), STARTUP_DELAY_MS);
});

onUnmounted(() => {
  clearTimeout(startupTimer);
  stopTyping();
  stopSound();
  stopSpeakSound();
  for (const layer of moodLayers.values()) layer.anim.destroy();
  moodLayers.clear();
});
</script>

<style scoped>
.tutorial-mascot {
  position: fixed;
  right: clamp(0.75rem, 1.4vw, 1.25rem);
  bottom: 5px;
  z-index: 1500;
  display: flex;
  align-items: flex-end;
  gap: 0.75rem;
  max-width: calc(100vw - 1.5rem);
  pointer-events: none;
}

/* Shotgun-Blast aus kill_rat.gif: gespiegelt (Lauf zeigt dann nach
   oben-rechts auf die Ratte), links neben ihr eingeblendet. */
.kill-gif {
  position: absolute;
  right: clamp(95px, 9.5vw, 130px);
  bottom: 0;
  height: clamp(130px, 13vw, 180px);
  transform: scaleX(-1);
  image-rendering: pixelated;
  pointer-events: none;
}

/* Baseline (150x94px) tuned at ~1400px viewport width; clamp() keeps the
   same relative size/position on narrower and wider screens instead of
   staying pinned at a fixed pixel size regardless of viewport. */
.mascot-figure {
  position: relative;
  width: clamp(110px, 10.7vw, 150px);
  aspect-ratio: 150 / 94;
  height: auto;
  pointer-events: none;
  transform: scaleX(-1);
}

/* Dynamisch erzeugte Layer (je Mood eine Lottie-Instanz), übereinander
   gestapelt — :deep nötig, weil sie per JS eingehängt werden. */
.mascot-figure :deep(.mood-layer) {
  position: absolute;
  inset: 0;
}

/* ── Terminal-style speech bubble ── */
.speech-bubble {
  position: relative;
  margin-bottom: 3.5rem;
  margin-right: clamp(-2.5rem, -2.857vw, -0.95rem);
  top: -25px;
  left: clamp(15px, 2.857vw, 40px);
  max-width: min(240px, 45vw);
  background: #040647;
  border: 1px solid #00e855;
  border-radius: 4px;
  padding: 0.65rem 1.75rem 0.65rem 0.75rem;
  box-shadow: 0 4px 16px rgba(4, 6, 71, 0.5), inset 0 0 20px rgba(0, 255, 80, 0.05);
  pointer-events: auto;
}

.speech-bubble::after {
  content: '';
  position: absolute;
  right: 1.5rem;
  bottom: -0.5rem;
  width: 0;
  height: 0;
  border-left: 0.5rem solid transparent;
  border-right: 0.5rem solid transparent;
  border-top: 0.5rem solid #00e855;
}

.speech-bubble::before {
  content: '';
  position: absolute;
  right: 1.5rem;
  bottom: -0.38rem;
  width: 0;
  height: 0;
  border-left: 0.4rem solid transparent;
  border-right: 0.4rem solid transparent;
  border-top: 0.4rem solid #040647;
  z-index: 1;
}

.bubble-text {
  font-family: 'Press Start 2P', monospace;
  font-size: 0.5rem;
  line-height: 1.7;
  color: #00e855;
  text-shadow: 0 0 8px rgba(0, 232, 85, 0.7);
  white-space: pre-wrap;
  word-break: break-word;
}

.cursor {
  display: inline-block;
  animation: blink 0.85s step-start infinite;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}

.bubble-close {
  position: absolute;
  top: 0.15rem;
  right: 0.35rem;
  background: none;
  border: none;
  cursor: pointer;
  font-family: 'Press Start 2P', monospace;
  font-size: 0.42rem;
  color: #00994d;
  padding: 0;
}

.bubble-close:hover {
  color: #00ff65;
}

/* ── Tour buttons ── */
.bubble-actions {
  display: flex;
  gap: 0.6rem;
  margin-top: 0.55rem;
}

.bubble-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  font-family: 'Press Start 2P', monospace;
  font-size: 0.44rem;
  color: #00ff65;
  text-shadow: 0 0 8px rgba(0, 255, 101, 0.7);
}

.bubble-btn:hover {
  color: #fff;
}

.bubble-btn-dim {
  color: #00994d;
  text-shadow: none;
}

.bubble-btn-info {
  color: #f9ca24;
  text-shadow: 0 0 8px rgba(249, 202, 36, 0.6);
}

.bubble-btn-info:hover {
  color: #fff;
}

/* Lernkarte schwebt über Bubble + Ratte, rechtsbündig am Container.
   Die Bubble ragt via top:-25px über den Container hinaus — der Offset
   gleicht das aus, damit nichts überlappt. */
.info-card-slot {
  position: absolute;
  right: 0;
  bottom: calc(100% + 40px);
}

/* ── Entrance: mascot rises from below the viewport edge ── */
.rise-enter-active {
  transition: transform 0.55s cubic-bezier(0.2, 0.9, 0.3, 1.2), opacity 0.4s ease;
}
.rise-leave-active {
  transition: transform 0.35s ease, opacity 0.3s ease;
}
.rise-enter-from,
.rise-leave-to {
  transform: translateY(115%);
  opacity: 0;
}

.bubble-fade-enter-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}
.bubble-fade-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

/* ── Abgang nach der Kill-Sequenz: tote Ratte verblasst an Ort und Stelle ── */
.fade-out-enter-active {
  transition: opacity 0.4s ease;
}
.fade-out-leave-active {
  transition: opacity 0.8s ease;
}
.fade-out-enter-from,
.fade-out-leave-to {
  opacity: 0;
}
</style>
