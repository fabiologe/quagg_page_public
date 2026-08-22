<template>
  <DraggableModal :is-open="isOpen" initial-width="380px" initial-height="auto" initial-left="center" initial-top="120">
      <header class="modal-header">
        <h3>Schmutzfracht-Daten</h3>
        <button class="close-btn" @click="$emit('close')">×</button>
      </header>

      <div class="modal-body">
        <form @submit.prevent="save">

          <div class="form-group">
            <label>Gebietsname</label>
            <input v-model="localData.gebietsname" type="text" class="form-input" placeholder="optional" />
          </div>

          <div class="form-group">
            <label>Kommentar</label>
            <input v-model="localData.kommentar" type="text" class="form-input" placeholder="optional" />
          </div>

          <div class="form-group">
            <label>Einwohnerzahl (EZ)</label>
            <input v-model.number="localData.einwohnerzahl" type="number" step="1" min="0" class="form-input" placeholder="optional" @change="onEinwohnerzahlChange" />
            <small class="hint">Reine Kopfzahl der angeschlossenen Einwohner — ganzzahlig.</small>
          </div>

          <div class="form-group">
            <label>Einwohnergleichwert (EGW)</label>
            <input v-model.number="localData.einwohnergleichwert" type="number" step="0.01" min="0" class="form-input" placeholder="optional" @change="recomputeEw" />
            <small class="hint">Fracht-Äquivalenz aus gewerblichem/industriellem Abwasser nach DWA-A 198 (kann gebrochen sein).</small>
          </div>

          <div class="form-group">
            <label>Einwohnerwerte (EW = EZ + EGW)</label>
            <input v-model.number="localData.einwohnerwerte" type="number" step="0.01" min="0" class="form-input" />
            <small class="hint">Wird aus EZ + EGW automatisch berechnet, bleibt aber manuell überschreibbar — z. B. bei ISYBAU-Importen, die nur EW ohne Aufschlüsselung liefern.</small>
          </div>

          <div class="form-group">
            <label>Einwohnerdichte (E/ha)</label>
            <div class="value-display">{{ einwohnerdichteDisplay }}</div>
            <small class="hint">Automatisch berechnet aus Einwohnerwerte / Flächengröße.</small>
          </div>

          <div class="form-group">
            <label>Wasserverbrauch (l/(E·d))</label>
            <input v-model.number="localData.wasserverbrauch" type="number" step="1" min="0" class="form-input" />
            <small class="hint">Für den Trockenwetterzufluss im SWMM-Modell. Richtwert 120 l/(E·d) nach DWA-A118 — bei Bedarf anpassen.</small>
          </div>

          <div class="form-group">
            <label>Tagesspitzenfaktor</label>
            <input v-model.number="localData.tagesspitzenfaktor" type="number" step="0.1" min="1" class="form-input" placeholder="z.B. 1.5" />
            <small class="hint">Verhältnis Spitzenstunde/Tagesmittel. Leer lassen für konstanten Trockenwetterzufluss ohne Tagesgang.</small>
          </div>

          <DwfPatternPreview :tagesspitzenfaktor="localData.tagesspitzenfaktor" />

          <div class="form-group">
            <label>Trockenwetterkennung</label>
            <input v-model="localData.trockenwetterkennung" type="text" class="form-input" placeholder="z.B. T01" />
            <small class="hint">Referenz auf Systembelastung/Trockenwetterabflussspenden — hier nur als Kennung hinterlegt.</small>
          </div>

          <div class="modal-actions">
            <button type="button" class="btn-secondary" @click="remove">Daten entfernen</button>
            <button type="button" class="btn-secondary" @click="$emit('close')">Abbrechen</button>
            <button type="submit" class="btn-primary">Speichern</button>
          </div>
        </form>
      </div>
  </DraggableModal>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import DraggableModal from './DraggableModal.vue';
import DwfPatternPreview from './DwfPatternPreview.vue';

const props = defineProps({
  isOpen: Boolean,
  modelValue: {
    type: Object,
    default: null
  },
  // Flächengröße (ha) — für die Live-Berechnung der Einwohnerdichte
  areaSize: {
    type: Number,
    default: 0
  }
});

const emit = defineEmits(['close', 'update:modelValue']);

const emptyForm = () => ({
    gebietsname: null,
    kommentar: null,
    // EZ/EGW sind reine Tool-Hilfsfelder (kein ISYBAU-Schema-Feld) zur Herleitung
    // von Einwohnerwerte = EZ + EGW nach DWA-A 198 Abschn. 2.6. Nur einwohnerwerte
    // wird exportiert/importiert (xmlExporter.js/xmlParser.js) — ISYBAU kennt die
    // Aufschlüsselung nicht.
    einwohnerzahl: null,
    einwohnergleichwert: null,
    einwohnerwerte: null,
    einwohnerdichte: null,
    // Richtwert nach DWA-A118 — editierbar, wird für den [DWF]-Trockenwetterzufluss
    // im SWMM-Modell gebraucht (core/services/SwmmBuilder.js)
    wasserverbrauch: 120,
    tagesspitzenfaktor: null
});

const localData = ref(emptyForm());

// Einwohnerdichte wird nicht mehr manuell gepflegt, sondern live aus
// Einwohnerwerte / Flächengröße berechnet (vermeidet inkonsistente Werte).
const einwohnerdichte = computed(() => {
    const ew = localData.value.einwohnerwerte;
    if (ew == null || !(props.areaSize > 0)) return null;
    return ew / props.areaSize;
});
const einwohnerdichteDisplay = computed(() => einwohnerdichte.value != null ? einwohnerdichte.value.toFixed(2) : '–');

// EW = EZ + EGW, nur angewendet wenn eines der beiden Felder tatsächlich befüllt
// ist — sonst würde ein reiner ISYBAU-Import (EW gesetzt, EZ/EGW leer) beim
// nächsten Öffnen des Dialogs überschrieben. Läuft über @change (nicht @input/
// watch), damit es ausschließlich bei echter Nutzereingabe feuert, nie beim
// programmatischen Neubefüllen von localData beim Öffnen.
const recomputeEw = () => {
    const ez = localData.value.einwohnerzahl;
    const egw = localData.value.einwohnergleichwert;
    if (ez == null && egw == null) return;
    localData.value.einwohnerwerte = Math.round(((ez ?? 0) + (egw ?? 0)) * 100) / 100;
};

const onEinwohnerzahlChange = () => {
    if (localData.value.einwohnerzahl != null) {
        localData.value.einwohnerzahl = Math.round(localData.value.einwohnerzahl);
    }
    recomputeEw();
};

// Lokale Kopie bei jedem Öffnen neu aus modelValue ziehen — Abbrechen darf keine
// Teiländerung hinterlassen (gleiches Prinzip wie formData/localData in den
// anderen isybau-Modals).
watch(() => props.isOpen, (val) => {
    if (val) {
        localData.value = props.modelValue ? { ...emptyForm(), ...props.modelValue } : emptyForm();
    }
});

const save = () => {
    emit('update:modelValue', { ...localData.value, einwohnerdichte: einwohnerdichte.value });
    emit('close');
};

const remove = () => {
    emit('update:modelValue', null);
    emit('close');
};
</script>

<style scoped src="../modals/shared/modalBase.css"></style>
<style scoped src="../modals/shared/modalDark.css"></style>
<style scoped>
.modal-header {
  padding: var(--isy-space-3) var(--isy-space-4);
  cursor: move;
  flex-shrink: 0;
  background: var(--isy-pixel-bg);
}
.modal-header h3 {
  margin: 0;
  font-family: var(--isy-pixel-font);
  font-size: var(--isy-fs-pixel-md);
  color: var(--isy-pixel-green);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.modal-body {
  padding: var(--isy-space-4);
  overflow-y: auto;
  max-height: calc(90vh - 56px);
  background: var(--isy-pixel-bg-deep);
}
.hint { font-size: var(--isy-fs-sm); color: var(--isy-pixel-border-hover); margin-top: var(--isy-space-1); }
.value-display { color: var(--isy-pixel-green); font-weight: 600; padding: var(--isy-space-1) 0; }
</style>
