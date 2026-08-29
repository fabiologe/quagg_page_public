<template>
  <PedantKarte :titel="`Beleg ${beleg.belegnummer}`" icon="beleg">
    <template #aktionen>
      <button class="ped-zu" type="button" @click="store.schliesse()">
        <PedantIcon name="schliessen" :size="15" />
      </button>
    </template>

    <div class="ped-pruefung">
      <BelegVorschau :beleg="beleg" class="ped-pruefung-vorschau" />

      <div class="ped-pruefung-formular">
        <p v-if="beleg.status === 'gebucht'" class="ped-info ped-info-ok">
          <PedantIcon name="ok" :size="14" />
          Gebucht als Journal-Nr. {{ beleg.buchung_lfd_nr }} — Felder sind fest.
        </p>
        <p v-else-if="beleg.status === 'verworfen'" class="ped-info ped-info-fehler">
          <PedantIcon name="verwerfen" :size="14" />
          Verworfen: {{ beleg.verworfen_grund }}
        </p>

        <template v-if="bearbeitbar">
          <div class="ped-reihe">
            <FormFeld name="Lieferant">
              <input v-model="form.lieferant" type="text" placeholder="Wer hat geliefert?" />
            </FormFeld>
            <FormFeld name="Belegdatum">
              <input v-model="form.belegdatum" type="date" />
            </FormFeld>
          </div>
          <div class="ped-reihe-drei">
            <FormFeld name="Netto">
              <input
                v-model="netto.text.value"
                type="text" inputmode="decimal" placeholder="0,00"
                @blur="netto.huebschMachen"
              />
            </FormFeld>
            <FormFeld name="Steuersatz">
              <select v-model.number="form.steuersatz">
                <option :value="19">19 %</option>
                <option :value="7">7 %</option>
                <option :value="0">0 %</option>
              </select>
            </FormFeld>
            <FormFeld name="Brutto">
              <input
                v-model="brutto.text.value"
                type="text" inputmode="decimal" placeholder="0,00"
                @blur="brutto.huebschMachen"
              />
            </FormFeld>
          </div>

          <BelegVorschlag :befund="befund" :vorschlag="vorschlag" />

          <p v-if="serverFehler" class="ped-info ped-info-fehler">{{ serverFehler }}</p>

          <div class="ped-aktionen">
            <button class="ped-aktion" type="button" :disabled="arbeitet" @click="speichern">
              <PedantIcon name="ok" :size="14" /> Felder speichern
            </button>
            <button
              class="ped-aktion ped-aktion-verwerfen" type="button"
              :disabled="arbeitet" @click="verwerfenOffen = true"
            >
              <PedantIcon name="verwerfen" :size="14" /> Verwerfen
            </button>
          </div>
        </template>

        <FreigabeKarte v-if="beleg.status === 'geprueft'" :beleg="beleg" />
      </div>
    </div>

    <PedantModal
      v-if="verwerfenOffen"
      titel="Beleg verwerfen"
      icon="verwerfen"
      @schliessen="verwerfenOffen = false"
    >
      <FormFeld name="Grund">
        <textarea v-model="verwerfenGrund" rows="2" placeholder="Warum ist das kein Beleg?" />
      </FormFeld>
      <template #fuss>
        <button class="ped-aktion" type="button" @click="verwerfenOffen = false">
          Abbrechen
        </button>
        <button
          class="ped-aktion ped-aktion-verwerfen" type="button"
          :disabled="!verwerfenGrund.trim() || arbeitet" @click="verwerfen"
        >
          Endgültig verwerfen
        </button>
      </template>
    </PedantModal>
  </PedantKarte>
</template>

<script setup>
// BelegPruefung — die Maske des manuellen Hauptpfads: Vorschau links,
// Felder rechts, Live-Plausibilitaet + Vorschlag, dann Freigabe (eigene Karte).
import { computed, reactive, ref, watch } from 'vue';
import { useBelegPlausibilitaet } from '../../composables/useBelegPlausibilitaet';
import { useGeldFormat } from '../../composables/useGeldFormat';
import { useBelegStore } from '../../stores/useBelegStore';
import FormFeld from '../ui/FormFeld.vue';
import PedantIcon from '../ui/PedantIcon.vue';
import PedantKarte from '../ui/PedantKarte.vue';
import PedantModal from '../ui/PedantModal.vue';
import BelegVorschau from './BelegVorschau.vue';
import BelegVorschlag from './BelegVorschlag.vue';
import FreigabeKarte from './FreigabeKarte.vue';

const props = defineProps({
  beleg: { type: Object, required: true },
});

const store = useBelegStore();
const netto = useGeldFormat();
const brutto = useGeldFormat();
const form = reactive({ lieferant: '', belegdatum: '', steuersatz: 19 });
const arbeitet = ref(false);
const serverFehler = ref('');
const verwerfenOffen = ref(false);
const verwerfenGrund = ref('');

const bearbeitbar = computed(() =>
  ['erfasst', 'erkannt', 'geprueft'].includes(props.beleg.status));

watch(() => props.beleg.id, () => {
  form.lieferant = props.beleg.lieferant || '';
  form.belegdatum = props.beleg.belegdatum || new Date().toISOString().slice(0, 10);
  form.steuersatz = props.beleg.steuersatz ?? 19;
  netto.text.value = '';
  brutto.text.value = '';
  if (Number.isInteger(props.beleg.netto_cent)) {
    netto.text.value = netto.centAlsEuro(props.beleg.netto_cent);
  }
  if (Number.isInteger(props.beleg.brutto_cent)) {
    brutto.text.value = brutto.centAlsEuro(props.beleg.brutto_cent);
  }
  serverFehler.value = '';
}, { immediate: true });

const spiegel = computed(() => ({
  netto_cent: netto.cent.value,
  steuersatz: form.steuersatz,
  brutto_cent: brutto.cent.value,
}));
const { befund, vorschlag } = useBelegPlausibilitaet(spiegel);

async function speichern() {
  arbeitet.value = true;
  serverFehler.value = '';
  try {
    await store.speichern(props.beleg.id, {
      lieferant: form.lieferant.trim(),
      belegdatum: form.belegdatum,
      netto_cent: netto.cent.value,
      steuersatz: form.steuersatz,
      brutto_cent: brutto.cent.value,
    });
  } catch (fehler) {
    serverFehler.value = fehler.message;
  } finally {
    arbeitet.value = false;
  }
}

async function verwerfen() {
  arbeitet.value = true;
  try {
    await store.verwerfen(props.beleg.id, verwerfenGrund.value.trim());
    verwerfenOffen.value = false;
  } catch (fehler) {
    serverFehler.value = fehler.message;
  } finally {
    arbeitet.value = false;
  }
}
</script>

<style scoped>
.ped-pruefung {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 1rem;
  align-items: start;
}
@media (max-width: 56rem) {
  .ped-pruefung { grid-template-columns: 1fr; }
}
.ped-pruefung-formular {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
}
.ped-reihe {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.7rem;
}
.ped-reihe-drei {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 0.7rem;
}
.ped-info {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0;
  padding: 0.5rem 0.65rem;
  border-radius: 6px;
  font-size: 0.8rem;
}
.ped-info-ok {
  background: var(--ped-akzent-weich);
  color: var(--ped-ok);
}
.ped-info-fehler {
  background: var(--ped-fehler-weich);
  color: var(--ped-fehler);
}
.ped-aktionen {
  display: flex;
  gap: 0.5rem;
}
.ped-aktion {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.45rem 0.8rem;
  border: 1px solid var(--ped-rand-stark);
  border-radius: 6px;
  background: var(--ped-flaeche);
  color: var(--ped-text);
  font-size: 0.82rem;
  cursor: pointer;
}
.ped-aktion:hover {
  border-color: var(--ped-akzent);
  color: var(--ped-akzent);
}
.ped-aktion:disabled {
  opacity: 0.6;
  cursor: wait;
}
.ped-aktion-verwerfen:hover {
  border-color: var(--ped-fehler);
  color: var(--ped-fehler);
}
.ped-zu {
  border: none;
  background: none;
  color: var(--ped-text-dim);
  cursor: pointer;
}
</style>
