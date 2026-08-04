<template>
  <div class="f3d-pl">
    <div class="f3d-pl-kopf">
      <span class="f3d-pl-nr">#</span>
      <span>x</span><span>y</span><span v-if="dreiD">z</span>
      <span class="f3d-pl-weg"></span>
    </div>
    <div v-for="(p, i) in punkte" :key="i" class="f3d-pl-zeile"
         @mouseenter="store.zeigePunkt(p)" @mouseleave="store.zeigePunkt(null)"
         @focusin="store.zeigePunkt(p)" @focusout="store.zeigePunkt(null)">
      <span class="f3d-pl-nr">{{ i + 1 }}</span>
      <input type="number" step="any" class="f3d-num" :value="p[0]"
             @change="setzen(i, 0, $event.target.value)" />
      <input type="number" step="any" class="f3d-num" :value="p[1]"
             @change="setzen(i, 1, $event.target.value)" />
      <input v-if="dreiD" type="number" step="any" class="f3d-num"
             :value="p[2] ?? 0" @change="setzen(i, 2, $event.target.value)" />
      <button class="f3d-pl-weg" title="Punkt löschen"
              :disabled="punkte.length <= min" @click="loeschen(i)">×</button>
    </div>
    <div class="f3d-pl-fuss">
      <button class="f3d-btn f3d-btn-s" @click="anhaengen">＋ Punkt</button>
      <span class="f3d-muted f3d-small">
        {{ punkte.length }} Punkte<template v-if="laenge"> · {{ laenge }} m
        {{ geschlossen ? 'Umfang' : 'lang' }}</template>
      </span>
    </div>
  </div>
</template>

<script setup>
// Stützpunkte als Tabelle statt als JSON-Text. Koordinaten kommen im
// Wasserbau regelmäßig aus dem CAD und werden abgetippt — eine Zahl je
// Feld, sichtbare Nummerierung und eine Längenangabe zur Kontrolle sind
// dafür das Richtige. Die JSON-Ansicht bleibt im Panel als Rückfallebene.
//
// Die Zeile zeigt beim Überfahren „ihren" Punkt in der Szene. Ohne das ist
// bei einem Polygon mit zwanzig Stützpunkten nicht zu erkennen, welche
// Zeile welche Ecke ist. Der Store ist hier der kürzeste Weg — sonst müsste
// das Ereignis durch UnterGruppe und EditListe durchgereicht werden.
import { computed, onUnmounted } from 'vue'
import { usePreStore } from '../../stores/usePreStore'

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  // 2 = Grundriss, 3 = mit Höhe je Stützpunkt
  dim: { type: Number, default: 2 },
  // Mindestzahl der Punkte (Linie 2, Polygon 3)
  min: { type: Number, default: 2 },
  geschlossen: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])

const store = usePreStore()
// Wird die Liste ausgeblendet, während der Zeiger auf einer Zeile steht,
// bliebe der Marker sonst für immer stehen
onUnmounted(() => store.zeigePunkt(null))

const punkte = computed(() => props.modelValue ?? [])
const dreiD = computed(() => props.dim >= 3)

// Streckenlänge zur Plausibilitätskontrolle — ein vertippter Punkt fällt
// hier sofort auf, lange bevor der Vernetzer sich beschwert
const laenge = computed(() => {
  const p = punkte.value
  if (p.length < 2) return 0
  const folge = props.geschlossen ? [...p, p[0]] : p
  let s = 0
  for (let i = 1; i < folge.length; i++) {
    s += Math.hypot(folge[i][0] - folge[i - 1][0], folge[i][1] - folge[i - 1][1])
  }
  return Math.round(s * 100) / 100
})

function kopie() {
  return punkte.value.map((p) => [...p])
}

function setzen(i, j, wert) {
  const neu = kopie()
  const z = Number(wert)
  neu[i][j] = Number.isFinite(z) ? z : 0
  // fehlende Höhe auffüllen, wenn die Liste 3D ist
  if (dreiD.value) neu[i][2] = neu[i][2] ?? 0
  emit('update:modelValue', neu)
}

function loeschen(i) {
  if (punkte.value.length <= props.min) return
  const neu = kopie()
  neu.splice(i, 1)
  emit('update:modelValue', neu)
}

// Neuer Punkt setzt die letzte Richtung fort — das trifft öfter als ein
// Punkt auf dem Vorgänger, den man erst wegziehen müsste
function anhaengen() {
  const p = punkte.value
  const n = dreiD.value ? 3 : 2
  let neuerPunkt = new Array(n).fill(0)
  if (p.length >= 2) {
    const a = p[p.length - 2]
    const b = p[p.length - 1]
    neuerPunkt = b.slice(0, n).map((v, k) => Math.round((v + (v - (a[k] ?? v))) * 1000) / 1000)
  } else if (p.length === 1) {
    neuerPunkt = p[0].slice(0, n).map((v, k) => (k === 0 ? v + 1 : v))
  }
  emit('update:modelValue', [...kopie(), neuerPunkt])
}
</script>

<style scoped>
.f3d-pl { display: flex; flex-direction: column; gap: 2px; }
.f3d-pl-kopf, .f3d-pl-zeile {
  display: grid;
  grid-template-columns: 18px repeat(v-bind('dreiD ? 3 : 2'), 1fr) 18px;
  gap: 3px;
  align-items: center;
}
.f3d-pl-kopf {
  color: var(--f3d-text-2);
  font-size: 0.66rem;
  padding-bottom: 1px;
}
.f3d-pl-nr { color: var(--f3d-text-2); font-size: 0.66rem; text-align: right; }
.f3d-pl-zeile .f3d-num { width: 100%; min-width: 0; }
.f3d-pl-weg {
  background: none;
  border: none;
  color: var(--f3d-text-2);
  cursor: pointer;
  font-size: 0.9rem;
  line-height: 1;
  padding: 0;
}
.f3d-pl-weg:disabled { opacity: 0.25; cursor: default; }
.f3d-pl-weg:hover:not(:disabled) { color: var(--f3d-bad); }
.f3d-pl-fuss {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 3px;
}
</style>
