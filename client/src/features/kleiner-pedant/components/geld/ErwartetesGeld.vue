<template>
  <PedantKarte titel="Erwartetes Geld" icon="erwartet">
    <template #aktionen>
      <label class="ped-erledigte">
        <input
          type="checkbox"
          :checked="store.mitErledigten"
          @change="store.zeigeErledigte($event.target.checked)"
        />
        erledigte zeigen
      </label>
      <button class="ped-neu" type="button" @click="oeffneNeu">
        <PedantIcon name="plus" :size="14" /> Neu
      </button>
    </template>

    <PedantTabelle
      :spalten="SPALTEN"
      :leer="store.erwartet.length === 0"
      leer-text="Noch nichts erwartet — Anfragen und Aufträge hier vormerken"
    >
      <tr
        v-for="eintrag in store.erwartet"
        :key="eintrag.id"
        class="ped-erwartet-zeile"
        @click="oeffneBearbeiten(eintrag)"
      >
        <td>{{ eintrag.bezeichnung }}</td>
        <td>{{ datumText(eintrag.erwartet_am) }}</td>
        <td><StatusPille :zustand="pillenZustand(eintrag.status)" :text="STATUS_NAMEN[eintrag.status]" /></td>
        <td class="ped-zahl"><GeldBetrag :cent="eintrag.betrag_cent" /></td>
        <td class="ped-zahl">
          <GeldBetrag :cent="eintrag.offener_rest_cent" richtung="plus" />
        </td>
      </tr>
    </PedantTabelle>

    <PedantModal
      v-if="offen"
      :titel="bearbeitetId ? 'Eintrag bearbeiten' : 'Erwartetes Geld vormerken'"
      icon="erwartet"
      @schliessen="offen = false"
    >
      <div class="ped-form">
        <FormFeld name="Bezeichnung">
          <input v-model="form.bezeichnung" type="text" placeholder="z. B. Vergabe Kanalplanung Musterstadt" />
        </FormFeld>
        <div class="ped-form-reihe">
          <FormFeld name="Betrag (brutto)">
            <input v-model="betrag.text.value" type="text" inputmode="decimal" @blur="betrag.huebschMachen" />
          </FormFeld>
          <FormFeld name="Erwartet am">
            <input v-model="form.erwartet_am" type="date" />
          </FormFeld>
        </div>
        <div class="ped-form-reihe">
          <FormFeld name="Status">
            <select v-model="form.status">
              <option v-for="(name, wert) in STATUS_NAMEN" :key="wert" :value="wert">{{ name }}</option>
            </select>
          </FormFeld>
          <FormFeld name="Davon bereits gestellt" optional>
            <input v-model="gestellt.text.value" type="text" inputmode="decimal" @blur="gestellt.huebschMachen" />
          </FormFeld>
        </div>
        <FormFeld name="Notiz" optional>
          <input v-model="form.notiz" type="text" />
        </FormFeld>
      </div>
      <template #fuss>
        <button class="ped-abbruch" type="button" @click="offen = false">Abbrechen</button>
        <button class="ped-neu" type="button" :disabled="!speicherbar || sendet" @click="speichern">
          {{ sendet ? 'Speichert…' : 'Speichern' }}
        </button>
      </template>
    </PedantModal>
  </PedantKarte>
</template>

<script setup>
// ErwartetesGeld — die schlanke Planungsliste (FAHRPLAN Kap. 5): nur genug,
// um kommendes Geld vorauszusehen. Kein Fortschrittstracking.
import { computed, ref } from 'vue';
import { useGeldFormat } from '../../composables/useGeldFormat';
import { useGeldStore } from '../../stores/useGeldStore';
import FormFeld from '../ui/FormFeld.vue';
import GeldBetrag from '../ui/GeldBetrag.vue';
import PedantIcon from '../ui/PedantIcon.vue';
import PedantKarte from '../ui/PedantKarte.vue';
import PedantModal from '../ui/PedantModal.vue';
import PedantTabelle from '../ui/PedantTabelle.vue';
import StatusPille from '../ui/StatusPille.vue';

const STATUS_NAMEN = {
  angefragt: 'angefragt',
  angeboten: 'angeboten',
  beauftragt: 'beauftragt',
  teilweise_gestellt: 'teilweise gestellt',
  vollstaendig_gestellt: 'vollständig gestellt',
  entfallen: 'entfallen',
};

const SPALTEN = [
  { key: 'bezeichnung', titel: 'Bezeichnung' },
  { key: 'erwartet_am', titel: 'Erwartet' },
  { key: 'status', titel: 'Status' },
  { key: 'betrag', titel: 'Volumen', zahl: true },
  { key: 'rest', titel: 'Kommend', zahl: true },
];

const store = useGeldStore();
const offen = ref(false);
const bearbeitetId = ref(null);
const sendet = ref(false);
const form = ref({});
const betrag = useGeldFormat();
const gestellt = useGeldFormat();

const speicherbar = computed(() =>
  String(form.value.bezeichnung || '').trim()
  && Number.isInteger(betrag.cent.value) && betrag.cent.value > 0
  && form.value.erwartet_am);

function pillenZustand(status) {
  if (status === 'entfallen') return 'fehler';
  if (['beauftragt', 'teilweise_gestellt'].includes(status)) return 'ok';
  return 'warnung';
}

function datumText(wert) {
  return new Date(wert).toLocaleDateString('de-DE');
}

function oeffneNeu() {
  bearbeitetId.value = null;
  form.value = { bezeichnung: '', erwartet_am: new Date().toISOString().slice(0, 10),
                 status: 'angefragt', notiz: '' };
  betrag.zuruecksetzen();
  gestellt.zuruecksetzen();
  offen.value = true;
}

function oeffneBearbeiten(eintrag) {
  bearbeitetId.value = eintrag.id;
  form.value = { bezeichnung: eintrag.bezeichnung, erwartet_am: eintrag.erwartet_am,
                 status: eintrag.status, notiz: eintrag.notiz };
  betrag.text.value = betrag.centAlsEuro(eintrag.betrag_cent);
  gestellt.text.value = eintrag.bereits_gestellt_cent
    ? gestellt.centAlsEuro(eintrag.bereits_gestellt_cent) : '';
  offen.value = true;
}

async function speichern() {
  sendet.value = true;
  const felder = {
    ...form.value,
    betrag_cent: betrag.cent.value,
    bereits_gestellt_cent: Number.isInteger(gestellt.cent.value) ? gestellt.cent.value : 0,
  };
  try {
    if (bearbeitetId.value) await store.speichere(bearbeitetId.value, felder);
    else await store.legeAn(felder);
    offen.value = false;
  } catch { /* store.fehler wird im Bereich gezeigt */ } finally {
    sendet.value = false;
  }
}
</script>

<style scoped>
.ped-erledigte {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.74rem;
  color: var(--ped-text-dim);
}
.ped-neu {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.3rem 0.65rem;
  border: none;
  border-radius: 6px;
  background: var(--ped-akzent);
  color: var(--ped-akzent-kontrast);
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
}
.ped-neu:hover { background: var(--ped-akzent-hover); }
.ped-neu:disabled { opacity: 0.6; }
.ped-erwartet-zeile { cursor: pointer; }
.ped-zahl { text-align: right; }
.ped-form { display: flex; flex-direction: column; gap: 0.6rem; }
.ped-form-reihe { display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; }
.ped-abbruch {
  padding: 0.45rem 0.9rem;
  border: 1px solid var(--ped-rand-stark);
  border-radius: 6px;
  background: var(--ped-flaeche);
  color: var(--ped-text);
  cursor: pointer;
}
</style>
