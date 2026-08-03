<template>
  <span v-if="k" class="f3d-hilfe">
    <button ref="knopf" class="f3d-hilfe-knopf" :class="{ offen }" type="button"
            :title="`Was sagt ${k.label} aus?`" @click="umschalten">?</button>

    <Teleport to="body">
    <div v-if="offen" class="f3d-hilfe-karte" :style="lage" @click.stop>
      <header>
        <strong>{{ k.label }}</strong>
        <span class="f3d-muted">in {{ k.einheit }}</span>
        <button class="f3d-hilfe-zu" type="button" @click="offen = false">×</button>
      </header>

      <p>{{ k.was }}</p>

      <p v-if="stufe" class="f3d-hilfe-wert" :class="stufe.cls">
        <strong>{{ fmt(wert) }} {{ k.einheit }}</strong> — {{ stufe.text }}
      </p>

      <ul class="f3d-hilfe-skala">
        <li v-for="(s, i) in k.stufen" :key="i"
            :class="[s.cls, { aktiv: s === stufe }]">
          <span class="f3d-hilfe-bereich">{{ bereich(i) }}</span>
          <span>{{ s.text }}</span>
        </li>
      </ul>

      <p v-if="k.faustformel" class="f3d-hilfe-formel">{{ k.faustformel }}</p>
      <p v-if="k.achtung" class="f3d-hilfe-achtung">{{ k.achtung }}</p>
    </div>
    </Teleport>
  </span>
</template>

<script setup>
// Erklärung einer Ergebnisgröße auf Abruf — mit Einordnung des KONKRETEN
// Werts, nicht nur einer allgemeinen Tabelle. „22,3 N/m²" allein sagt
// niemandem etwas; „Kies wird transportiert, ohne Sohlsicherung entsteht
// hier Kolk" beantwortet die Frage, die dahintersteht.
import { computed, ref } from 'vue'
import { KENNWERTE, einordnen } from '../../utils/kennwerte'
import { fmt } from '../../utils/labels'

const props = defineProps({
  groesse: { type: String, required: true },
  wert: { type: Number, default: null },
})

const offen = ref(false)
const knopf = ref(null)
const lage = ref({})

// Die Karte hängt am body, nicht im Bedienfeld: die Spalten dort sind
// schmal und scrollen, jede Erklärkarte wäre sonst abgeschnitten.
function umschalten() {
  offen.value = !offen.value
  if (!offen.value) return
  const r = knopf.value?.getBoundingClientRect()
  if (!r) return
  const breite = Math.min(420, window.innerWidth - 32)
  const links = Math.min(Math.max(r.left - breite / 2, 12),
    window.innerWidth - breite - 12)
  // nach unten aufklappen, aber nie aus dem Fenster laufen — sonst steht
  // der halbe Text unter dem Bildschirmrand
  const maxHoehe = window.innerHeight * 0.7
  const oben = Math.max(12,
    Math.min(r.bottom + 6, window.innerHeight - maxHoehe - 12))
  lage.value = { left: `${links}px`, top: `${oben}px`, width: `${breite}px` }
}
const k = computed(() => KENNWERTE[props.groesse] ?? null)
const stufe = computed(() => einordnen(props.groesse, props.wert))

// Zahlenbereich einer Stufe als „von … bis"
function bereich(i) {
  const stufen = k.value.stufen
  const von = i === 0 ? null : stufen[i - 1].bis
  const bis = stufen[i].bis
  if (von == null) return bis === Infinity ? 'alle' : `bis ${fmt(bis)}`
  if (bis === Infinity) return `über ${fmt(von)}`
  return `${fmt(von)} – ${fmt(bis)}`
}
</script>

<style scoped>
.f3d-hilfe { position: relative; display: inline-block; }
.f3d-hilfe-knopf {
  width: 1.15rem;
  height: 1.15rem;
  line-height: 1;
  padding: 0;
  border-radius: 50%;
  border: 1px solid currentColor;
  background: transparent;
  color: #8fa0c2;
  font-size: 0.72rem;
  cursor: pointer;
  vertical-align: middle;
}
.f3d-hilfe-knopf:hover, .f3d-hilfe-knopf.offen { color: #4d9fff; }
.f3d-hilfe-karte {
  /* Die Karte haengt am <body> und damit AUSSERHALB von .f3d-root, wo die
     Theme-Variablen definiert sind. Farben deshalb ausgeschrieben — sonst
     erbt sie das Schwarz des Dokuments und steht unlesbar auf Dunkelblau. */
  position: fixed;
  z-index: 200;
  max-height: 70vh;
  text-transform: none;
  letter-spacing: normal;
  font-weight: 400;
  overflow: auto;
  padding: 0.7rem 0.8rem;
  border-radius: 8px;
  border: 1px solid #2c4370;
  background: #0e1526;
  color: #d4dcf0;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
  font-size: 0.78rem;
  line-height: 1.45;
  text-align: left;
  white-space: normal;
}
.f3d-hilfe-karte strong { color: #e9eefb; }
.f3d-hilfe-karte .f3d-muted { color: #8fa0c2; }
.f3d-hilfe-karte header {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  margin-bottom: 0.4rem;
}
.f3d-hilfe-zu {
  margin-left: auto;
  border: 0;
  background: transparent;
  color: inherit;
  font-size: 1rem;
  cursor: pointer;
}
.f3d-hilfe-karte p { margin: 0.4rem 0; }
.f3d-hilfe-wert {
  padding: 0.35rem 0.5rem;
  border-radius: 5px;
  border-left: 3px solid currentColor;
  background: rgba(255, 255, 255, 0.04);
}
.f3d-hilfe-skala {
  list-style: none;
  margin: 0.5rem 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.f3d-hilfe-skala li {
  display: grid;
  grid-template-columns: 5.5rem 1fr;
  gap: 0.5rem;
  padding: 0.2rem 0.3rem;
  border-radius: 4px;
  opacity: 0.75;
}
.f3d-hilfe-skala li.aktiv {
  opacity: 1;
  background: rgba(255, 255, 255, 0.07);
  font-weight: 550;
}
.f3d-hilfe-bereich {
  font-variant-numeric: tabular-nums;
  color: #b9c6dd;
}
.ruhig { color: #9fb0c8; }
.ok { color: #45d6a0; }
.warn { color: #eab04a; }
.bad { color: #ff7b7b; }
.f3d-hilfe-formel {
  border-top: 1px solid #2c4370;
  padding-top: 0.4rem;
  opacity: 0.85;
}
.f3d-hilfe-achtung {
  border-left: 3px solid #e0a63a;
  padding-left: 0.5rem;
  opacity: 0.9;
}
</style>
