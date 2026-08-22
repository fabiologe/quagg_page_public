<template>
  <Teleport to="body">
    <div v-if="isOpen" class="modal-overlay" @click.self="close">
      <div class="modal-content" role="dialog" aria-modal="true" aria-label="Koordinatensystem bestätigen">
        <div class="modal-header">
          <h3>Koordinatensystem bestätigen</h3>
          <button title="Schließen" aria-label="Schließen" class="close-btn" @click="close">×</button>
        </div>

        <div class="modal-body">
          <p class="description">
            Für die EZG-Karte (Luftbild &amp; Höhenlinien) muss das Koordinatensystem
            Ihrer Netzdaten bekannt sein. Wir haben anhand der Koordinatenwerte eine
            Schätzung vorgenommen — bitte prüfen und ggf. korrigieren.
          </p>

          <div class="form-group">
            <label>Koordinatensystem (CRS):</label>
            <select v-fokus v-model="selectedCRS">
              <option v-for="opt in crsOptions" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
          </div>

          <p v-if="guessedEpsg" class="guess-hint">
            Automatische Schätzung: {{ guessedLabel }}
          </p>
        </div>

        <div class="modal-footer">
          <button class="secondary-btn" @click="close">Abbrechen</button>
          <button class="primary-btn" @click="confirm">Bestätigen</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { vFokus } from '../../composables/vFokus.js';
import { CRS_OPTIONS } from '../../utils/KostraService.js';

const props = defineProps({
  isOpen: Boolean,
  guessedEpsg: String
});

const emit = defineEmits(['close', 'confirm']);

// Lokal erweitert um WGS84 (gleiches Muster wie KostraModal.vue) — CRS_OPTIONS
// selbst bleibt unangetastet, damit KostraModal keinen doppelten Eintrag bekommt.
const crsOptions = [...CRS_OPTIONS, { label: 'WGS84 (GPS)', value: 'EPSG:4326' }];

const selectedCRS = ref(props.guessedEpsg || CRS_OPTIONS[0].value);

watch(() => props.guessedEpsg, (val) => {
  if (val) selectedCRS.value = val;
});

const guessedLabel = computed(() => {
  const opt = crsOptions.find(o => o.value === props.guessedEpsg);
  return opt ? opt.label : props.guessedEpsg;
});

const close = () => emit('close');
const confirm = () => emit('confirm', selectedCRS.value);
</script>

<style scoped src="./shared/modalBase.css"></style>
<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: var(--isy-z-modal);
  backdrop-filter: blur(2px);
}

.modal-content {
  background: var(--isy-pixel-content-bg);
  border-radius: var(--isy-radius-lg);
  width: 90%;
  max-width: 460px;
  box-shadow: var(--isy-elev-3);
  display: flex;
  flex-direction: column;
}

.modal-header {
  padding: var(--isy-space-4);
}

.modal-header h3 {
  font-family: var(--isy-pixel-font);
  font-size: var(--isy-fs-pixel-md);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  margin: 0;
  color: var(--isy-pixel-text-dim);
}

.modal-body {
  padding: var(--isy-space-6);
}

.description {
  color: var(--isy-pixel-border);
  margin-bottom: var(--isy-space-6);
  font-size: var(--isy-fs-lg);
}

.guess-hint {
  font-size: var(--isy-fs-md);
  color: var(--isy-pixel-text-dim);
  margin: 0;
}

.primary-btn {
  background: var(--isy-pixel-bg);
  color: var(--isy-pixel-text);
  border: none;
  border-radius: var(--isy-radius-md);
  padding: var(--isy-space-2) var(--isy-space-4);
  font-family: var(--isy-pixel-font);
  font-size: var(--isy-fs-pixel-md);
  letter-spacing: 0.06em;
  cursor: var(--isy-cursor-hand);
  transition: background 0.15s;
}
.primary-btn:hover { background: var(--isy-pixel-border); }

.secondary-btn {
  background: transparent;
  border: 1px solid var(--isy-pixel-border);
  color: var(--isy-pixel-text-dim);
  border-radius: var(--isy-radius-md);
  padding: var(--isy-space-2) var(--isy-space-4);
  font-family: var(--isy-pixel-font);
  font-size: var(--isy-fs-pixel-md);
  letter-spacing: 0.06em;
  cursor: var(--isy-cursor-hand);
  transition: background 0.12s;
}
.secondary-btn:hover { background: var(--isy-pixel-border); color: var(--isy-pixel-green-bright); }
</style>
