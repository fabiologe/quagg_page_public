<template>
  <div class="f3d-gruppe">
    <div v-for="k in schluessel" :key="k" class="f3d-gruppe-feld">
      <label>{{ labels[k] ?? k }}</label>
      <select v-if="enumFor(k, gruppe, typ)" class="f3d-select f3d-select-s"
              :value="wert[k]" @change="setzen(k, $event.target.value)">
        <option v-for="opt in enumFor(k, gruppe, typ)" :key="opt" :value="opt">
          {{ ENUM_LABELS[opt] ?? opt }}
        </option>
      </select>
      <PunktListe v-else-if="istPunktListe(k, wert[k])"
                  :model-value="wert[k]" :dim="punktDim(k, wert[k], typ)"
                  :min="GESCHLOSSEN.has(k) ? 3 : 2"
                  :geschlossen="GESCHLOSSEN.has(k)"
                  @update:model-value="(v) => setzen(k, v)" />
      <div v-else-if="istZahlenreihe(wert[k])" class="f3d-zahlen">
        <label v-for="(nm, i) in zahlenNamen(k, wert[k].length)" :key="i"
               class="f3d-zahl">
          <span>{{ nm }}</span>
          <input type="number" step="any" class="f3d-num"
                 :value="wert[k][i]"
                 @change="setzeIndex(k, i, $event.target.value)" />
        </label>
      </div>
      <input v-else-if="typeof wert[k] === 'number'" type="number" step="any"
             class="f3d-num f3d-grow" :value="wert[k]"
             @change="setzen(k, zahl($event.target.value))" />
      <input v-else-if="typeof wert[k] === 'boolean'" type="checkbox"
             :checked="wert[k]" @change="setzen(k, $event.target.checked)" />
      <input v-else type="text" class="f3d-num f3d-grow"
             :value="wert[k] ?? ''"
             @change="setzen(k, $event.target.value || null)" />
    </div>
    <p v-if="!schluessel.length" class="f3d-muted f3d-small">
      keine Angaben — Form oben wählen
    </p>
  </div>
</template>

<script setup>
// Zusammengesetztes Feld (Profil, Widerstand, Achse, Fenster) als kleine
// Eingabemaske statt als JSON-Text. Eine Ebene tief; was darunter noch
// verschachtelt ist, bleibt Text — in der casespec kommt das nicht vor.
import { computed } from 'vue'
import PunktListe from './PunktListe.vue'
import {
  ENUM_LABELS, GESCHLOSSEN, enumFor, istPunktListe, istZahlenreihe,
  punktDim, zahlenNamen,
} from '../../utils/feldTypen'

const props = defineProps({
  modelValue: { type: Object, default: () => ({}) },
  labels: { type: Object, default: () => ({}) },
  // Objekttyp des ÜBERGEORDNETEN Objekts — entscheidet bei mehrdeutigen
  // Listen über die Dimension
  typ: { type: String, default: '' },
  // Feldname der Gruppe — entscheidet über gruppeneigene Auswahlwerte
  gruppe: { type: String, default: '' },
  // Felder, die woanders im Panel bedient werden
  verbergen: { type: Array, default: () => [] },
})
const emit = defineEmits(['update:modelValue'])

const wert = computed(() => props.modelValue ?? {})
// leere Angaben ausblenden: ein Kreisprofil zeigt keine Rechteckmaße
const schluessel = computed(() => Object.keys(wert.value)
  .filter((k) => wert.value[k] !== null && wert.value[k] !== undefined
    && !props.verbergen.includes(k)))

const zahl = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)

function setzen(k, v) {
  emit('update:modelValue', { ...wert.value, [k]: v })
}

function setzeIndex(k, i, v) {
  const reihe = [...wert.value[k]]
  reihe[i] = zahl(v)
  setzen(k, reihe)
}
</script>

<style scoped>
.f3d-gruppe {
  display: flex;
  flex-direction: column;
  gap: 5px;
  border-left: 2px solid var(--f3d-border);
  padding-left: 7px;
}
.f3d-gruppe-feld { display: flex; flex-direction: column; gap: 2px; }
.f3d-gruppe-feld > label { color: var(--f3d-text-2); font-size: 0.68rem; }
.f3d-zahlen { display: flex; flex-wrap: wrap; gap: 4px; }
.f3d-zahl {
  display: flex;
  flex-direction: column;
  gap: 1px;
  flex: 1 1 62px;
  min-width: 62px;
}
.f3d-zahl > span { color: var(--f3d-text-2); font-size: 0.64rem; }
.f3d-zahl .f3d-num { width: 100%; min-width: 0; }
</style>
