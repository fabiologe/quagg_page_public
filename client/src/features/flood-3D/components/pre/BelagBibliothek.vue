<template>
  <div class="f3d-belaglib">
    <p v-if="!store.belag" class="f3d-muted f3d-small">
      Noch keine Belagskarte geladen.
    </p>
    <template v-else>
      <table class="f3d-belag-tabelle">
        <thead>
          <tr>
            <th></th><th>Material</th><th>k_s (m)</th>
            <th title="Manning-n nach Strickler — nur als Brücke zur 2D-Welt; gerechnet wird mit k_s">n</th>
            <th title="Anteil der Geländefläche">Fläche</th><th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="b in store.belaege" :key="b.id">
            <td>
              <input type="color" class="f3d-belag-farbe" :value="b.farbe"
                     title="Farbe im Editor"
                     @change="setzen(b, 'farbe', $event.target.value)" />
            </td>
            <td>
              <input class="f3d-num f3d-grow" :value="b.name"
                     @change="setzen(b, 'name', $event.target.value)" />
            </td>
            <td>
              <input type="number" class="f3d-num f3d-belag-ks" step="0.0005"
                     min="0.00001" max="1" :value="b.ks"
                     @change="setzen(b, 'ks', Number($event.target.value))" />
            </td>
            <td class="f3d-mono">{{ manningVon(b.ks) }}</td>
            <td class="f3d-mono">{{ anteilText(b.id) }}</td>
            <td>
              <button class="f3d-belag-weg" type="button"
                      :title="`„${b.name}“ aus der Liste nehmen`"
                      @click="entfernen(b)">×</button>
            </td>
          </tr>
        </tbody>
      </table>

      <div class="f3d-row">
        <button class="f3d-btn f3d-btn-s" :disabled="store.belaege.length >= 99"
                @click="hinzufuegen">+ Material</button>
        <button class="f3d-btn f3d-btn-s" :disabled="!geaendert || sichert"
                title="Materialliste im Fall speichern"
                @click="sichern">
          {{ sichert ? 'sichert …' : 'Liste sichern' }}
        </button>
      </div>

      <p v-if="ohneBelag > 0" class="f3d-muted f3d-small">
        {{ (ohneBelag * 100).toFixed(0) }} % der Geländefläche tragen keinen
        Belag — dort gilt weiter das Material des Geländes.
      </p>
      <p v-if="verwaist.length" class="f3d-hint f3d-hint-warn">
        Gemalt, aber nicht in der Liste: Kennung {{ verwaist.join(', ') }}.
        Diese Flächen behalten still das Grundmaterial — entweder ein
        Material dafür anlegen oder die Fläche übermalen.
      </p>
      <p class="f3d-muted f3d-small">
        k_s ist die äquivalente Sandrauheit in Metern — die Größe, die
        OpenFOAM kennt. Jeder Belag wird beim Fallaufbau ein eigener
        Netz-Patch; die Sohlschubspannung liegt danach getrennt je
        Material vor.
      </p>
    </template>
  </div>
</template>

<script setup>
// Materialbibliothek der Belagskarte.
//
// Sie gehört zum FALL, nicht zur Sitzung: eine Kennung im Raster ist
// wertlos, wenn niemand weiß, welche Rauheit sie meint. Gespeichert wird
// deshalb über denselben Weg wie die gemalten Striche.
import { computed, ref } from 'vue'
import { usePreStore } from '../../stores/usePreStore'
import {
  anteilVon, freieKennung, kennungZaehlen, manningVon as nAusKs,
  verwaisteKennungen,
} from '../../utils/belag'

const store = usePreStore()
const sichert = ref(false)
const geaendert = ref(false)

const manningVon = (ks) => {
  const n = nAusKs(ks)
  return n == null ? '–' : n.toFixed(3)
}

const zaehlung = computed(() => kennungZaehlen(store.belag?.ids))
const gesamt = computed(() => (store.belag ? store.belag.ids.length : 0))
const ohneBelag = computed(() => anteilVon(zaehlung.value, 0, gesamt.value))
const verwaist = computed(() =>
  verwaisteKennungen(zaehlung.value, store.belaege))

function anteilText(id) {
  const a = anteilVon(zaehlung.value, id, gesamt.value)
  return a > 0 ? `${(a * 100).toFixed(0)} %` : '–'
}

function setzen(belag, feld, wert) {
  if (feld === 'ks' && !(wert > 0)) return
  belag[feld] = wert
  geaendert.value = true
}

function hinzufuegen() {
  const id = freieKennung(store.belaege)
  if (id == null) return
  store.belaege.push({ id, name: `Material ${id}`, ks: 0.01,
    farbe: '#888888' })
  geaendert.value = true
}

function entfernen(belag) {
  const n = zaehlung.value.get(belag.id) ?? 0
  if (n > 0 && !globalThis.confirm(
    `„${belag.name}" ist auf ${((n / gesamt.value) * 100).toFixed(0)} % der `
    + 'Fläche gemalt. Wird das Material entfernt, behalten diese Flächen '
    + 'still das Grundmaterial des Geländes. Trotzdem entfernen?')) return
  store.belaege = store.belaege.filter((b) => b.id !== belag.id)
  geaendert.value = true
}

async function sichern() {
  sichert.value = true
  try {
    await store.belagMalen([])       // ohne Strich: nur die Liste
    geaendert.value = false
  } finally {
    sichert.value = false
  }
}
</script>

<style scoped>
.f3d-belaglib { margin-top: 8px; }
.f3d-belag-tabelle {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.74rem;
}
.f3d-belag-tabelle th {
  text-align: left;
  font-weight: normal;
  color: var(--f3d-text-2);
  padding-bottom: 3px;
}
.f3d-belag-tabelle td { padding: 1px 2px; }
.f3d-belag-farbe {
  width: 22px;
  height: 20px;
  padding: 0;
  border: 1px solid var(--f3d-border);
  border-radius: 3px;
  background: none;
}
.f3d-belag-ks { width: 78px; }
.f3d-belag-weg {
  background: none;
  border: none;
  color: var(--f3d-text-2);
  cursor: pointer;
  font-size: 0.95rem;
  line-height: 1;
}
.f3d-belag-weg:hover { color: var(--f3d-bad); }
.f3d-hint { margin: 5px 0 0; font-size: 0.72rem; line-height: 1.45; }
.f3d-hint-warn { color: var(--f3d-warn); }
</style>
