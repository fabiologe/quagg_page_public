<template>
  <Transition name="slide">
    <div v-if="storeys.length" class="sn-panel">
      <div class="sn-header">
        <span class="sn-title"><CdeIcon name="layers" :size="14" /> Ebenen</span>
        <label class="sn-check" title="Beim Springen zusätzlich einen Schnitt setzen">
          <input type="checkbox" v-model="autoSection" />
          Schnitt
        </label>
      </div>

      <!-- Ansichtsmodi -->
      <div class="sn-modes">
        <button
          v-for="m in MODI"
          :key="m.id"
          class="sn-mode"
          :class="{ active: modus === m.id }"
          :title="m.hilfe"
          @click="setModus(m.id)"
        >{{ m.label }}</button>
      </div>

      <div class="sn-body">
        <div
          v-for="s in sortiert"
          :key="`${s.modelId}:${s.localId}`"
          class="sn-row"
          :class="{ active: istAktiv(s), gedimmt: !istSichtbar(s) }"
        >
          <button
            class="sn-eye"
            :title="istSichtbar(s) ? 'Ebene ausblenden' : 'Ebene einblenden'"
            @click.stop="toggleSichtbar(s)"
          >
            <CdeIcon :name="istSichtbar(s) ? 'visible' : 'hidden'" :size="13" />
          </button>
          <button class="sn-goto" :title="`${s.name} · ${hoeheText(s.elevation)}`" @click="onClick(s)">
            <span class="sn-name">{{ s.name }}</span>
            <span class="sn-elev">{{ hoeheText(s.elevation) }}</span>
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
/**
 * Ebenen-Navigation (Sprint U, AP-U5).
 *
 * Neu gegenüber der reinen Sprungliste: Sichtbarkeit je Ebene und drei
 * Ansichtsmodi.
 *
 * Bewusst NICHT dabei ist ein „explodierter" Modus: `@thatopen/fragments`
 * bietet keine Transformation einzelner Elemente (die Geometrie liegt in
 * Batches, nur `setVisible` ist vorgesehen). Statt eines Scheinfeatures gibt
 * es „Bis hierhin" — kumulativ von unten, was für Bauzustände und den Blick
 * unter das Gelände ohnehin mehr trägt.
 *
 * „Ebenen" statt „Geschosse", weil Infrastrukturmodelle keine Storeys haben.
 */
import { ref, computed, watch } from 'vue';
import CdeIcon from './ui/CdeIcon.vue';
import { sichtbarkeitFuerModus, aenderungen, hoeheText, nachHoehe, storeyKey } from '../services/StoreyModes.js';

const props = defineProps({
  storeys: { type: Array, default: () => [] },  // [{modelId, localId, name, elevation, box}]
});
const emit = defineEmits(['goto', 'set-visible']);

const MODI = [
  { id: 'alle', label: 'Alle',  hilfe: 'Alle Ebenen sichtbar' },
  { id: 'solo', label: 'Solo',  hilfe: 'Nur die gewählte Ebene' },
  { id: 'bis',  label: 'Bis',   hilfe: 'Alle Ebenen bis einschließlich der gewählten (von unten)' },
];

const autoSection = ref(false);
const modus = ref('alle');
const aktiv = ref(null);                 // {modelId, localId}
const versteckt = ref(new Set());        // "modelId:localId"

const key = storeyKey;

/** Von unten nach oben — Grundlage für „Bis hierhin". */
const sortiert = computed(() =>
  nachHoehe(props.storeys));

function istAktiv(s) {
  return aktiv.value && aktiv.value.localId === s.localId && aktiv.value.modelId === s.modelId;
}
function istSichtbar(s) { return !versteckt.value.has(key(s)); }

/** Sichtbarkeit setzen und nach außen melden (Engine schaltet den Hider). */
function anwenden(s, sichtbar) {
  const next = new Set(versteckt.value);
  if (sichtbar) next.delete(key(s));
  else next.add(key(s));
  versteckt.value = next;
  emit('set-visible', { modelId: s.modelId, localId: s.localId, visible: sichtbar });
}

function toggleSichtbar(s) {
  modus.value = 'alle';                 // Handbetrieb hebt den Modus auf
  anwenden(s, !istSichtbar(s));
}

/** Modus auf die aktuelle Auswahl anwenden. */
function setModus(id) {
  modus.value = id;
  modusAnwenden();
}

function modusAnwenden() {
  const ziel = sichtbarkeitFuerModus(props.storeys, aktiv.value, modus.value);
  for (const { key: k, visible } of aenderungen(ziel, versteckt.value)) {
    const s = props.storeys.find(x => storeyKey(x) === k);
    if (s) anwenden(s, visible);
  }
}

function onClick(s) {
  aktiv.value = { modelId: s.modelId, localId: s.localId };
  emit('goto', { modelId: s.modelId, localId: s.localId, withSection: autoSection.value });
  if (modus.value !== 'alle') modusAnwenden();
}

// Modellwechsel: Zustand zurücksetzen, sonst zeigen alte Schlüssel ins Leere
watch(() => props.storeys, () => {
  versteckt.value = new Set();
  aktiv.value = null;
  modus.value = 'alle';
});

/** Für Befehle (Strg+K) von außen bedienbar. */
defineExpose({ setModus, modus });
</script>

<style scoped>
.sn-panel {
  position: absolute;
  left: 70px; top: 5rem;
  width: 186px;
  z-index: 24;
  background: var(--cde-surface);
  border: 1px solid var(--cde-line);
  border-radius: var(--cde-radius);
  box-shadow: var(--cde-shadow-sm);
  overflow: hidden;
}

.sn-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0.4rem 0.5rem;
  background: var(--cde-bg-alt);
  border-bottom: 1px solid var(--cde-line);
}
.sn-title {
  display: flex; align-items: center; gap: 0.3rem;
  font-size: var(--cde-font-sm); font-weight: 600;
  color: var(--cde-text-bright);
}
.sn-check {
  display: flex; align-items: center; gap: 0.2rem;
  font-size: var(--cde-font-xs); color: var(--cde-text-dim); cursor: pointer;
}
.sn-check input { accent-color: var(--cde-accent); }

.sn-modes {
  display: flex; gap: 2px;
  padding: 0.3rem 0.4rem;
  border-bottom: 1px solid var(--cde-line-soft);
}
.sn-mode {
  flex: 1;
  background: var(--cde-fill); border: 1px solid var(--cde-line);
  border-radius: var(--cde-radius-sm);
  color: var(--cde-text-dim);
  font-size: var(--cde-font-xs);
  padding: 0.15rem 0;
  cursor: pointer;
}
.sn-mode:hover { background: var(--cde-fill-hover); color: var(--cde-text); }
.sn-mode.active {
  background: var(--cde-accent-fill-hi);
  border-color: var(--cde-accent-line);
  color: var(--cde-accent);
}

.sn-body {
  max-height: 340px; overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--cde-tint-max) transparent;
}

.sn-row {
  display: flex; align-items: stretch;
  border-bottom: 1px solid var(--cde-line-soft);
}
.sn-row:last-child { border-bottom: none; }
.sn-row.gedimmt .sn-goto { opacity: 0.4; }
.sn-row.active { background: var(--cde-accent-fill); }

.sn-eye {
  display: flex; align-items: center; justify-content: center;
  width: 24px; flex-shrink: 0;
  background: none; border: none; cursor: pointer;
  color: var(--cde-text-mute);
}
.sn-eye:hover { color: var(--cde-accent); background: var(--cde-fill); }

.sn-goto {
  flex: 1; min-width: 0;
  display: flex; flex-direction: column; align-items: flex-start; gap: 1px;
  background: none; border: none; cursor: pointer;
  padding: 0.3rem 0.4rem;
  text-align: left;
}
.sn-goto:hover { background: var(--cde-fill); }
.sn-name {
  font-size: var(--cde-font-sm); color: var(--cde-text);
  max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.sn-elev {
  font-size: var(--cde-font-xs); color: var(--cde-text-faint);
  font-variant-numeric: tabular-nums;
}

.slide-enter-active, .slide-leave-active { transition: opacity 0.18s, transform 0.18s; }
.slide-enter-from, .slide-leave-to { opacity: 0; transform: translateX(-20px); }
</style>
