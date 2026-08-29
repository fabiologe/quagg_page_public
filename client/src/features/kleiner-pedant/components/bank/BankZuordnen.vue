<template>
  <PedantModal :titel="titel" icon="zuordnen" @schliessen="store.schliesse()">
    <div class="ped-bz">
      <dl class="ped-bz-daten">
        <div><dt>Datum</dt><dd>{{ datumText }}</dd></div>
        <div><dt>Betrag</dt><dd><GeldBetrag :cent="bewegung.betrag_cent" :richtung="bewegung.betrag_cent > 0 ? 'plus' : 'minus'" /></dd></div>
        <div v-if="bewegung.gegen_name"><dt>Gegenseite</dt><dd>{{ bewegung.gegen_name }}</dd></div>
        <div><dt>Zweck</dt><dd class="ped-bz-zweck">{{ bewegung.verwendungszweck || '—' }}</dd></div>
      </dl>

      <template v-if="bewegung.status === 'unabgeglichen'">
        <h4 v-if="store.vorschlaege.length">Vorschläge</h4>
        <ul v-if="store.vorschlaege.length" class="ped-bz-vorschlaege">
          <li v-for="kandidat in store.vorschlaege" :key="kandidat.art + (kandidat.rechnung_id || kandidat.beleg_id)">
            <StatusPille :zustand="kandidat.konfidenz === 'sicher' ? 'ok' : 'warnung'" :text="kandidat.konfidenz" />
            <span class="ped-bz-name">
              {{ kandidat.rechnungsnummer || kandidat.belegnummer }}
              — {{ kandidat.lieferant || '' }} <GeldBetrag :cent="kandidat.brutto_cent" />
            </span>
            <button class="ped-bz-knopf" type="button" :disabled="arbeitet" @click="zuordnen(kandidat)">
              Zuordnen
            </button>
          </li>
        </ul>
        <p v-else class="ped-bz-hinweis">
          Kein automatischer Treffer — unten manuell wählen oder ignorieren.
        </p>

        <FormFeld :name="istEingang ? 'Offene Rechnung' : 'Gebuchter Beleg'">
          <select v-model="manuelleWahl">
            <option :value="null" disabled>bitte wählen…</option>
            <option v-for="ziel in manuelleZiele" :key="ziel.id" :value="ziel.id">
              {{ ziel.text }}
            </option>
          </select>
        </FormFeld>
        <div class="ped-bz-aktionen">
          <button class="ped-bz-knopf" type="button" :disabled="!manuelleWahl || arbeitet" @click="manuellZuordnen">
            <PedantIcon name="zuordnen" :size="13" /> Manuell zuordnen
          </button>
          <button class="ped-bz-knopf" type="button" :disabled="arbeitet" @click="ignorierenOffen = !ignorierenOffen">
            Ignorieren…
          </button>
        </div>
        <div v-if="ignorierenOffen" class="ped-bz-grund">
          <FormFeld name="Grund (z. B. privat, Umbuchung)">
            <input v-model="grund" type="text" />
          </FormFeld>
          <button class="ped-bz-knopf" type="button" :disabled="!grund.trim() || arbeitet" @click="ignorieren">
            Endgültig ignorieren
          </button>
        </div>
      </template>

      <template v-else>
        <p class="ped-bz-hinweis">
          {{ bewegung.status === 'ignoriert' ? 'Ignoriert' : 'Zugeordnet' }}
          <template v-if="bewegung.zuordnung_grund"> — {{ bewegung.zuordnung_grund }}</template>
        </p>
        <FormFeld name="Grund für das Lösen">
          <input v-model="grund" type="text" />
        </FormFeld>
        <button class="ped-bz-knopf" type="button" :disabled="!grund.trim() || arbeitet" @click="loesen">
          <PedantIcon name="storno" :size="13" />
          Zuordnung lösen{{ bewegung.buchung_lfd_nr ? ' (Buchung wird storniert)' : '' }}
        </button>
      </template>

      <p v-if="store.fehler" class="ped-bz-fehler">{{ store.fehler }}</p>
    </div>
  </PedantModal>
</template>

<script setup>
// BankZuordnen — der Klaerdialog einer Bewegung: Vorschlaege mit Konfidenz,
// manuelle Wahl (Eingang -> offene Rechnung, Ausgang -> gebuchter Beleg),
// Ignorieren mit Grund, Loesen per Storno.
import { computed, ref } from 'vue';
import { useBankStore } from '../../stores/useBankStore';
import { useBelegStore } from '../../stores/useBelegStore';
import { useRechnungStore } from '../../stores/useRechnungStore';
import FormFeld from '../ui/FormFeld.vue';
import GeldBetrag from '../ui/GeldBetrag.vue';
import PedantIcon from '../ui/PedantIcon.vue';
import PedantModal from '../ui/PedantModal.vue';
import StatusPille from '../ui/StatusPille.vue';

const props = defineProps({
  bewegung: { type: Object, required: true },
});

const store = useBankStore();
const rechnungen = useRechnungStore();
const belege = useBelegStore();
const manuelleWahl = ref(null);
const ignorierenOffen = ref(false);
const grund = ref('');
const arbeitet = ref(false);

const istEingang = computed(() => props.bewegung.betrag_cent > 0);
const titel = computed(() => `Bewegung #${props.bewegung.id}`);
const datumText = computed(() =>
  new Date(props.bewegung.buchungsdatum).toLocaleDateString('de-DE'));

const manuelleZiele = computed(() => {
  if (istEingang.value) {
    return rechnungen.rechnungen
      .filter((zeile) => zeile.status === 'gestellt')
      .map((zeile) => ({ id: zeile.id,
        text: `${zeile.rechnungsnummer} — ${fmt(zeile.brutto_cent)}` }));
  }
  return belege.belege
    .filter((zeile) => zeile.status === 'gebucht')
    .map((zeile) => ({ id: zeile.id,
      text: `${zeile.belegnummer} — ${zeile.lieferant} ${fmt(zeile.brutto_cent)}` }));
});

function fmt(cent) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
    .format(cent / 100);
}

async function _tu(lauf) {
  arbeitet.value = true;
  try {
    await lauf();
    store.schliesse();
  } catch { /* store.fehler bleibt sichtbar */ } finally {
    arbeitet.value = false;
  }
}

const zuordnen = (kandidat) => _tu(() => store.zuordnen(props.bewegung.id, {
  rechnung_id: kandidat.rechnung_id ?? null, beleg_id: kandidat.beleg_id ?? null }));
const manuellZuordnen = () => _tu(() => store.zuordnen(props.bewegung.id,
  istEingang.value ? { rechnung_id: manuelleWahl.value } : { beleg_id: manuelleWahl.value }));
const ignorieren = () => _tu(() => store.ignoriere(props.bewegung.id, grund.value.trim()));
const loesen = () => _tu(() => store.loese(props.bewegung.id, grund.value.trim()));
</script>

<style scoped>
.ped-bz { display: flex; flex-direction: column; gap: 0.7rem; }
.ped-bz-daten { margin: 0; display: flex; flex-direction: column; gap: 0.25rem; }
.ped-bz-daten div { display: flex; gap: 0.6rem; font-size: 0.82rem; }
.ped-bz-daten dt { min-width: 6.5rem; color: var(--ped-text-dim); }
.ped-bz-daten dd { margin: 0; color: var(--ped-text); }
.ped-bz-zweck { word-break: break-word; }
.ped-bz h4 { margin: 0; font-size: 0.82rem; color: var(--ped-text); }
.ped-bz-vorschlaege { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 0.4rem; }
.ped-bz-vorschlaege li {
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.4rem 0.5rem; border: 1px solid var(--ped-rand); border-radius: 6px;
}
.ped-bz-name { flex: 1; font-size: 0.8rem; color: var(--ped-text); }
.ped-bz-knopf {
  display: inline-flex; align-items: center; gap: 0.3rem;
  padding: 0.35rem 0.7rem; border: 1px solid var(--ped-rand-stark);
  border-radius: 6px; background: var(--ped-flaeche);
  color: var(--ped-text); font-size: 0.78rem; cursor: pointer;
}
.ped-bz-knopf:hover { border-color: var(--ped-akzent); color: var(--ped-akzent); }
.ped-bz-knopf:disabled { opacity: 0.5; }
.ped-bz-aktionen { display: flex; gap: 0.5rem; }
.ped-bz-grund { display: flex; flex-direction: column; gap: 0.4rem; }
.ped-bz-hinweis { margin: 0; font-size: 0.8rem; color: var(--ped-text-dim); }
.ped-bz-fehler {
  margin: 0; padding: 0.45rem 0.6rem; border-radius: 6px;
  background: var(--ped-fehler-weich); color: var(--ped-fehler); font-size: 0.8rem;
}
</style>
