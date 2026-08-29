<template>
  <div class="ped-positionen">
    <table class="ped-pos-tabelle">
      <thead>
        <tr>
          <th>Bezeichnung</th><th class="ped-schmal">Menge</th>
          <th class="ped-schmal">Einheit</th><th class="ped-schmal">Einzelpreis</th>
          <th class="ped-schmal ped-rechts">Betrag</th><th v-if="editierbar" class="ped-mini"></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(zeile, index) in zeilen" :key="index">
          <td><input v-model="zeile.bezeichnung" :disabled="!editierbar" type="text" /></td>
          <td><input v-model="zeile.mengeText" :disabled="!editierbar" type="text" inputmode="decimal" class="ped-rechts" /></td>
          <td>
            <select v-model="zeile.einheit" :disabled="!editierbar">
              <option value="HUR">Stunden</option>
              <option value="C62">pauschal</option>
              <option value="H87">Stück</option>
            </select>
          </td>
          <td><input v-model="zeile.preisText" :disabled="!editierbar" type="text" inputmode="decimal" class="ped-rechts" /></td>
          <td class="ped-rechts"><GeldBetrag :cent="zeilenBetrag(zeile)" /></td>
          <td v-if="editierbar">
            <button class="ped-weg" type="button" title="Position entfernen" @click="entfernen(index)">
              <PedantIcon name="schliessen" :size="13" />
            </button>
          </td>
        </tr>
      </tbody>
    </table>

    <button v-if="editierbar" class="ped-plus" type="button" @click="hinzufuegen">
      <PedantIcon name="plus" :size="14" /> Position
    </button>

    <dl class="ped-summen">
      <div><dt>Netto</dt><dd><GeldBetrag :cent="betraege.netto" /></dd></div>
      <div><dt>USt 19 %</dt><dd><GeldBetrag :cent="betraege.steuer" /></dd></div>
      <div class="ped-brutto"><dt>Brutto</dt><dd><GeldBetrag :cent="betraege.brutto" /></dd></div>
    </dl>
  </div>
</template>

<script setup>
// PositionenTabelle — editiert lokal (Text), rechnet live in Integer-Cent,
// meldet den validen Positionssatz nach oben (v-model:positionen).
import { computed, ref, watch } from 'vue';
import {
  mengeZuTausendstel, positionsBetragCent, rechnungSummen, tausendstelAlsText,
} from '../../composables/useRechnungSummen';
import { centAlsEuro, euroZuCent } from '../../services/Geld';
import GeldBetrag from '../ui/GeldBetrag.vue';
import PedantIcon from '../ui/PedantIcon.vue';

const props = defineProps({
  positionen: { type: Array, required: true },   // [{bezeichnung, menge_tausendstel, einheit, einzelpreis_cent}]
  editierbar: { type: Boolean, default: true },
});
const emit = defineEmits(['update:positionen']);

const zeilen = ref([]);
// Echo-Sperre: Was wir selbst nach oben melden, kommt als Prop zurueck —
// das darf die Zeilen NICHT neu aufbauen, sonst wird die Eingabe waehrend
// des Tippens umformatiert ("9" -> "9,00 €", dann "95" -> ungueltig).
// Prod-Befund 24.08.: Positionen liessen sich nicht erfassen.
let eigeneAusgabe = null;

watch(() => props.positionen, (neu) => {
  if (eigeneAusgabe !== null && JSON.stringify(neu) === eigeneAusgabe) return;
  zeilen.value = (neu.length ? neu : [leereZeile()]).map((position) => ({
    bezeichnung: position.bezeichnung || '',
    mengeText: position.menge_tausendstel ? tausendstelAlsText(position.menge_tausendstel) : '',
    einheit: position.einheit || 'HUR',
    preisText: Number.isInteger(position.einzelpreis_cent)
      ? centAlsEuro(position.einzelpreis_cent) : '',
  }));
}, { immediate: true });

function leereZeile() {
  return { bezeichnung: '', menge_tausendstel: null, einheit: 'HUR', einzelpreis_cent: null };
}

function zeilenWerte(zeile) {
  return {
    bezeichnung: zeile.bezeichnung.trim(),
    menge_tausendstel: mengeZuTausendstel(zeile.mengeText),
    einheit: zeile.einheit,
    einzelpreis_cent: euroZuCent(zeile.preisText),
  };
}

function zeilenBetrag(zeile) {
  const werte = zeilenWerte(zeile);
  return positionsBetragCent(werte.menge_tausendstel, werte.einzelpreis_cent);
}

const gueltige = computed(() => zeilen.value.map(zeilenWerte).filter((werte) =>
  werte.bezeichnung && Number.isInteger(werte.menge_tausendstel)
  && Number.isInteger(werte.einzelpreis_cent)));

const betraege = computed(() => rechnungSummen(gueltige.value, 19));

watch(gueltige, (werte) => {
  eigeneAusgabe = JSON.stringify(werte);
  emit('update:positionen', werte);
}, { deep: true });

function hinzufuegen() {
  zeilen.value.push({ bezeichnung: '', mengeText: '', einheit: 'HUR', preisText: '' });
}
function entfernen(index) {
  zeilen.value.splice(index, 1);
  if (!zeilen.value.length) hinzufuegen();
}
</script>

<style scoped>
.ped-positionen { display: flex; flex-direction: column; gap: 0.6rem; }
.ped-pos-tabelle { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
.ped-pos-tabelle th {
  text-align: left;
  padding: 0.3rem 0.4rem;
  color: var(--ped-text-dim);
  border-bottom: 1px solid var(--ped-rand-stark);
  font-weight: 600;
}
.ped-pos-tabelle td { padding: 0.25rem 0.3rem; border-bottom: 1px solid var(--ped-rand); }
.ped-pos-tabelle input, .ped-pos-tabelle select {
  width: 100%;
  padding: 0.3rem 0.45rem;
  border: 1px solid var(--ped-rand);
  border-radius: 5px;
  background: var(--ped-flaeche);
  color: var(--ped-text);
  font-size: 0.8rem;
}
.ped-pos-tabelle input:disabled, .ped-pos-tabelle select:disabled {
  background: var(--ped-flaeche-2);
  color: var(--ped-text-dim);
}
.ped-schmal { width: 7rem; }
.ped-mini { width: 2rem; }
.ped-rechts { text-align: right; }
.ped-weg {
  border: none;
  background: none;
  color: var(--ped-text-dim);
  cursor: pointer;
}
.ped-weg:hover { color: var(--ped-fehler); }
.ped-plus {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.3rem 0.6rem;
  border: 1px dashed var(--ped-rand-stark);
  border-radius: 6px;
  background: none;
  color: var(--ped-text-dim);
  font-size: 0.78rem;
  cursor: pointer;
}
.ped-plus:hover { color: var(--ped-akzent); border-color: var(--ped-akzent); }
.ped-summen {
  margin: 0;
  margin-left: auto;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 14rem;
  font-size: 0.82rem;
}
.ped-summen div { display: flex; justify-content: space-between; }
.ped-summen dt { color: var(--ped-text-dim); }
.ped-summen dd { margin: 0; }
.ped-brutto { border-top: 1px solid var(--ped-rand-stark); padding-top: 0.25rem; font-weight: 700; }
</style>
