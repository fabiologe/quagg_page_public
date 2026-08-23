<template>
  <section class="cde-panel" :class="`side-${seite}`" :style="{ width: breite + 'px' }">
    <header class="cp-head">
      <CdeIcon :name="icon" :size="15" />
      <span class="cp-title">{{ titel }}</span>
      <slot name="head-actions" />
      <button class="cp-close" :title="`${titel} schließen`" @click="$emit('close')">
        <CdeIcon name="close" :size="14" />
      </button>
    </header>

    <div class="cp-body">
      <slot />
    </div>

    <!-- Ziehgriff an der Innenkante der Leiste -->
    <div class="cp-grip" @pointerdown="onGripDown" :title="'Breite ändern'"></div>
  </section>
</template>

<script setup>
/**
 * CdePanel — einheitliches Panel-Chrome der CDE (Sprint U).
 *
 * Ersetzt das geliehene DraggableModal: Panels docken an eine Leiste an,
 * statt frei über dem Modell zu schweben. Damit entfallen zugleich der
 * Stapel-Streit mehrerer Fenster und der `parseInt('calc(...)')`-Fehler,
 * der drei Panels bisher auf `left: NaNpx` schob.
 */
import CdeIcon from './CdeIcon.vue';

const props = defineProps({
  titel:  { type: String, required: true },
  icon:   { type: String, default: 'info' },
  seite:  { type: String, default: 'right' },   // 'left' | 'right'
  breite: { type: Number, default: 330 },
});
const emit = defineEmits(['close', 'resize']);

function onGripDown(e) {
  e.preventDefault();
  const startX = e.clientX;
  const startB = props.breite;
  const richtung = props.seite === 'right' ? -1 : 1;

  const move = (ev) => emit('resize', startB + (ev.clientX - startX) * richtung);
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}
</script>

<style scoped>
.cde-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: var(--cde-bg);
  color: var(--cde-text);
  font-size: var(--cde-font-md);
}
.side-left  { border-right: 1px solid var(--cde-line); }
.side-right { border-left: 1px solid var(--cde-line); }

.cp-head {
  display: flex; align-items: center; gap: var(--cde-gap-sm);
  padding: 0.45rem 0.6rem;
  background: var(--cde-bg-alt);
  border-bottom: 1px solid var(--cde-line);
  color: var(--cde-text-bright);
  flex-shrink: 0;
}
.cp-title { font-weight: 600; font-size: var(--cde-font-md); flex: 1; }

.cp-close {
  display: flex; align-items: center;
  background: none; border: none; cursor: pointer;
  color: var(--cde-text-mute);
  padding: 0.15rem; border-radius: var(--cde-radius-sm);
}
.cp-close:hover { color: var(--cde-danger); background: var(--cde-fill); }

.cp-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--cde-tint-max) transparent;
}
.cp-body::-webkit-scrollbar { width: 6px; }
.cp-body::-webkit-scrollbar-thumb { background: var(--cde-tint-max); border-radius: 3px; }

/* Ziehgriff: 5 px breit, liegt auf der zum Viewer zeigenden Kante */
.cp-grip {
  position: absolute; top: 0; bottom: 0; width: 5px;
  cursor: col-resize;
  background: transparent;
  transition: background 0.12s;
}
.side-right .cp-grip { left: -2px; }
.side-left  .cp-grip { right: -2px; }
.cp-grip:hover { background: var(--cde-accent-fill-hi); }
</style>
