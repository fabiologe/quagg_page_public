<template>
  <span v-if="k" class="f3d-hilfe">
    <button ref="knopf" class="f3d-hilfe-knopf" :class="{ offen }" type="button"
            :title="`Was sagt ${k.label} aus?`" :aria-expanded="offen"
            @click="umschalten">?</button>

    <Teleport to="body">
    <div v-if="offen" ref="karte" class="f3d-hilfe-karte" :style="lage"
         role="dialog" :aria-label="`Erklärung ${k.label}`" @click.stop>
      <header>
        <strong>{{ k.label }}</strong>
        <span class="f3d-muted">in {{ k.einheit }}</span>
        <button class="f3d-hilfe-zu" type="button" title="Erklärung schliessen"
                aria-label="Erklärung schliessen" @click="schliessen">×</button>
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
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { KENNWERTE, einordnen } from '../../utils/kennwerte'
import { fmt } from '../../utils/labels'

const props = defineProps({
  groesse: { type: String, required: true },
  wert: { type: Number, default: null },
})

const offen = ref(false)
const knopf = ref(null)
const karte = ref(null)
const lage = ref({})

// Nur EINE Erklärkarte gleichzeitig. Vorher hatte jede Instanz ihr
// eigenes `offen`, und weil die Lage auf denselben Wert geklemmt wurde,
// lagen zwei Karten deckungsgleich übereinander — die untere war nur noch
// zu schliessen, wenn man die obere zuerst zumachte.
let offeneKarte = null

// Die Karte hängt am body, nicht im Bedienfeld: die Spalten dort sind
// schmal und scrollen, jede Erklärkarte wäre sonst abgeschnitten.
function platzieren() {
  const r = knopf.value?.getBoundingClientRect()
  if (!r) return
  const rand = 12
  const breite = Math.min(420, window.innerWidth - 2 * rand)
  const links = Math.min(Math.max(r.left - breite / 2, rand),
    window.innerWidth - breite - rand)

  // Die Karte gehört an ihren Auslöser. Vorher wurde `top` hart auf
  // 0,3 · Fensterhöhe − 12 geklemmt (bei 768 px also 218 px) — dadurch
  // legte sich die Karte über die ganze Bedienspalte samt dem Knopf, mit
  // dem man sie geöffnet hatte. Jetzt: unter den Knopf, wenn dort Platz
  // ist, sonst darüber; die Höhe richtet sich nach dem, was frei ist.
  const platzUnten = window.innerHeight - r.bottom - rand - 6
  const platzOben = r.top - rand - 6
  const nachUnten = platzUnten >= Math.min(260, platzOben)
  const maxHoehe = Math.max(160, Math.floor(nachUnten ? platzUnten : platzOben))
  const stil = { left: `${links}px`, width: `${breite}px`,
    maxHeight: `${maxHoehe}px` }
  if (nachUnten) stil.top = `${Math.round(r.bottom + 6)}px`
  else stil.bottom = `${Math.round(window.innerHeight - r.top + 6)}px`
  lage.value = stil
}

function schliessen() {
  offen.value = false
  if (offeneKarte === schliessen) offeneKarte = null
}

function umschalten() {
  if (offen.value) { schliessen(); return }
  if (offeneKarte) offeneKarte()      // die andere Karte zuerst zumachen
  offen.value = true
  offeneKarte = schliessen
  nextTick(platzieren)
}

// Schliessen per Escape und per Klick daneben — beides fehlte, die Karte
// liess sich nur über ihr eigenes × wieder loswerden.
function aufTaste(e) { if (e.key === 'Escape') schliessen() }
function aufKlick(e) {
  if (!offen.value) return
  if (karte.value?.contains(e.target) || knopf.value?.contains(e.target)) return
  schliessen()
}
// Position gilt nur für den Moment des Öffnens: scrollt die Spalte oder
// ändert sich das Fenster, wandert der Anker weg — dann lieber schliessen
// als eine Karte ohne Bezug stehen zu lassen.
function aufBewegung() { if (offen.value) schliessen() }

onMounted(() => {
  document.addEventListener('keydown', aufTaste)
  document.addEventListener('pointerdown', aufKlick, true)
  window.addEventListener('resize', aufBewegung)
  window.addEventListener('scroll', aufBewegung, true)
})
onBeforeUnmount(() => {
  document.removeEventListener('keydown', aufTaste)
  document.removeEventListener('pointerdown', aufKlick, true)
  window.removeEventListener('resize', aufBewegung)
  window.removeEventListener('scroll', aufBewegung, true)
  if (offeneKarte === schliessen) offeneKarte = null
})
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
  color: var(--f3d-text-2);
  font-size: 0.72rem;
  cursor: pointer;
  vertical-align: middle;
}
.f3d-hilfe-knopf:hover, .f3d-hilfe-knopf.offen { color: var(--f3d-accent); }
.f3d-hilfe-karte {
  /* Die Karte haengt am <body> und damit AUSSERHALB von .f3d-root. Die
     Tokens stehen deshalb auf :root (f3d-theme.css) — hier zusaetzlich
     mit Fallback, damit der Text auch dann lesbar bleibt, wenn sie
     jemand zurueck auf .f3d-root schiebt. Genau daran stand der
     Erklaertext vorher dunkel auf dunkelblau. */
  position: fixed;
  z-index: 200;
  /* die tatsaechliche Hoehe kommt aus der Lageberechnung (platzieren) */
  text-transform: none;
  letter-spacing: normal;
  font-weight: 400;
  overflow: auto;
  padding: 0.7rem 0.8rem;
  border-radius: 8px;
  border: 1px solid var(--f3d-border-strong, #2c4370);
  background: #0e1526;
  color: var(--f3d-text, #e9eefb);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
  font-size: 0.78rem;
  line-height: 1.45;
  text-align: left;
  white-space: normal;
}
.f3d-hilfe-karte strong { color: var(--f3d-text, #e9eefb); }
/* Die Einheit gehört zur Überschrift und wird mitgelesen — heller als
   das übliche Grau der Nebenbeschriftung */
.f3d-hilfe-karte .f3d-muted { color: var(--f3d-text-hilfe, #dee7f9); }
/* Der Erklaertext selbst ist der Grund fuer die ganze Karte — er steht
   in voller Textfarbe, nicht gedaempft. */
.f3d-hilfe-karte p { color: var(--f3d-text, #e9eefb); }
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
  /* nur leicht zuruecknehmen: die nicht zutreffenden Stufen sind der
     Massstab, an dem der aktive Wert eingeordnet wird — unlesbar
     nuetzen sie nichts */
  opacity: 0.92;
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
  border-top: 1px solid var(--f3d-border-strong, #2c4370);
  padding-top: 0.4rem;
}
.f3d-hilfe-achtung {
  border-left: 3px solid var(--f3d-warn, #e8a13c);
  padding-left: 0.5rem;
}
</style>
