<template>
  <PedantKarte :titel="titel" icon="rechnung">
    <template #aktionen>
      <button class="ped-zu" type="button" @click="store.schliesse()">
        <PedantIcon name="schliessen" :size="15" />
      </button>
    </template>

    <div class="ped-formular">
      <p v-if="rechnung.status === 'verworfen'" class="ped-info-fehler">
        Verworfen: {{ rechnung.verworfen_grund }}
      </p>
      <RechnungAktionen v-if="istGestellt" :rechnung="rechnung" />

      <div class="ped-kopf-reihe">
        <FormFeld name="Auftraggeber">
          <select v-model.number="form.auftraggeber_id" :disabled="!editierbar">
            <option v-for="eintrag in stammdaten.auftraggeber" :key="eintrag.id" :value="eintrag.id">
              {{ eintrag.name }}
            </option>
          </select>
        </FormFeld>
        <FormFeld name="Leitweg-ID">
          <input :value="leitweg" type="text" disabled />
        </FormFeld>
        <FormFeld name="Auftragsreferenz" optional>
          <input v-model="form.auftrag_referenz" :disabled="!editierbar" type="text" />
        </FormFeld>
        <FormFeld name="Rechnungstyp">
          <select v-model="form.rechnungstyp" :disabled="!editierbar">
            <option value="380">Rechnung / Schlussrechnung (380)</option>
            <option value="326">Abschlagsrechnung (326)</option>
          </select>
        </FormFeld>
      </div>
      <div class="ped-kopf-reihe">
        <FormFeld name="Rechnungsdatum">
          <input v-model="form.rechnungsdatum" :disabled="!editierbar" type="date" />
        </FormFeld>
        <FormFeld name="Leistung von">
          <input v-model="form.leistung_von" :disabled="!editierbar" type="date" />
        </FormFeld>
        <FormFeld name="Leistung bis">
          <input v-model="form.leistung_bis" :disabled="!editierbar" type="date" />
        </FormFeld>
        <FormFeld name="Zahlungsziel (Tage)">
          <input v-model.number="form.zahlungsziel_tage" :disabled="!editierbar" type="number" min="0" max="90" />
        </FormFeld>
      </div>

      <PositionenTabelle v-model:positionen="positionen" :editierbar="editierbar" />
      <p v-if="rechnung.vorrechnungen?.length" class="ped-vorrechnungen">
        Vorrechnungen (BG-3): <span v-for="v in rechnung.vorrechnungen" :key="v.id" class="ped-mono">{{ v.rechnungsnummer }} </span>
        · Vorab {{ centAlsEuro(rechnung.vorab_cent || 0) }} · zahlbar <strong>{{ centAlsEuro(rechnung.zahlbar_cent ?? rechnung.brutto_cent ?? 0) }}</strong>
      </p>

      <p v-if="store.fehler && !stellenOffen" class="ped-info-fehler">{{ store.fehler }}</p>

      <div v-if="editierbar" class="ped-fuss">
        <button class="ped-aktion" type="button" :disabled="arbeitet" @click="speichern">
          <PedantIcon name="ok" :size="14" /> Entwurf speichern
        </button>
        <button class="ped-aktion" type="button" :disabled="arbeitet" @click="verwerfenOffen = true">
          <PedantIcon name="verwerfen" :size="14" /> Verwerfen
        </button>
        <button class="ped-stellen" type="button" :disabled="arbeitet" @click="stellenVorbereiten">
          <PedantIcon name="stellen" :size="14" /> Stellen…
        </button>
      </div>
    </div>

    <StellenDialog
      v-if="stellenOffen"
      :rechnung-id="rechnung.id"
      @schliessen="stellenOffen = false"
    />

    <PedantModal v-if="verwerfenOffen" titel="Entwurf verwerfen" icon="verwerfen"
                 @schliessen="verwerfenOffen = false">
      <FormFeld name="Grund">
        <textarea v-model="verwerfenGrund" rows="2" />
      </FormFeld>
      <template #fuss>
        <button class="ped-aktion" type="button" @click="verwerfenOffen = false">Abbrechen</button>
        <button class="ped-aktion" type="button" :disabled="!verwerfenGrund.trim()" @click="verwerfen">
          Endgültig verwerfen
        </button>
      </template>
    </PedantModal>
  </PedantKarte>
</template>

<script setup>
import { centAlsEuro } from '../../services/Geld';
// RechnungsFormular — Kopf + Positionen im Entwurf; nach dem Stellen
// read-only mit Aktionsleiste (RechnungAktionen). Speichern sichert Kopf UND
// Positionssatz in einem Zug.
import { computed, reactive, ref, watch } from 'vue';
import { useRechnungStore } from '../../stores/useRechnungStore';
import { useStammdatenStore } from '../../stores/useStammdatenStore';
import FormFeld from '../ui/FormFeld.vue';
import PedantIcon from '../ui/PedantIcon.vue';
import PedantKarte from '../ui/PedantKarte.vue';
import PedantModal from '../ui/PedantModal.vue';
import PositionenTabelle from './PositionenTabelle.vue';
import RechnungAktionen from './RechnungAktionen.vue';
import StellenDialog from './StellenDialog.vue';

const props = defineProps({
  rechnung: { type: Object, required: true },
});

const store = useRechnungStore();
const stammdaten = useStammdatenStore();

const form = reactive({});
const positionen = ref([]);
const arbeitet = ref(false);
const stellenOffen = ref(false);
const verwerfenOffen = ref(false);
const verwerfenGrund = ref('');

const editierbar = computed(() => props.rechnung.status === 'entwurf');
const istGestellt = computed(() => ['gestellt', 'bezahlt'].includes(props.rechnung.status));
const titel = computed(() => props.rechnung.rechnungsnummer
  ? `Rechnung ${props.rechnung.rechnungsnummer}`
  : `Rechnungsentwurf #${props.rechnung.id}`);
const leitweg = computed(() => {
  const eintrag = stammdaten.auftraggeber.find((ag) => ag.id === form.auftraggeber_id);
  return props.rechnung.leitweg_id || eintrag?.leitweg_id || '';
});

watch(() => props.rechnung.id, () => {
  form.auftraggeber_id = props.rechnung.auftraggeber_id;
  form.auftrag_referenz = props.rechnung.auftrag_referenz || '';
  form.rechnungstyp = props.rechnung.rechnungstyp || '380';
  form.rechnungsdatum = props.rechnung.rechnungsdatum;
  form.leistung_von = props.rechnung.leistung_von;
  form.leistung_bis = props.rechnung.leistung_bis;
  form.zahlungsziel_tage = props.rechnung.zahlungsziel_tage;
  positionen.value = props.rechnung.positionen || [];
}, { immediate: true });

async function speichern() {
  arbeitet.value = true;
  try {
    await store.speichereKopf(props.rechnung.id, { ...form });
    if (positionen.value.length) {
      await store.speicherePositionen(props.rechnung.id, positionen.value);
    }
  } catch { /* store.fehler zeigt es */ } finally {
    arbeitet.value = false;
  }
}

async function stellenVorbereiten() {
  await speichern();
  if (!store.fehler) stellenOffen.value = true;
}

async function verwerfen() {
  try {
    await store.verwerfen(props.rechnung.id, verwerfenGrund.value.trim());
    verwerfenOffen.value = false;
    store.schliesse();
  } catch { /* store.fehler zeigt es */ }
}
</script>

<style scoped>
.ped-vorrechnungen { margin: 0.5rem 0 0; font-size: 0.8rem; color: var(--ped-text-dim); }
.ped-mono { font-family: var(--ped-mono); }
.ped-formular { display: flex; flex-direction: column; gap: 0.8rem; }
.ped-kopf-reihe {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
  gap: 0.7rem;
}
.ped-info-fehler {
  margin: 0; padding: 0.5rem 0.65rem; border-radius: 6px;
  background: var(--ped-fehler-weich); color: var(--ped-fehler); font-size: 0.8rem;
}
.ped-fuss { display: flex; gap: 0.5rem; flex-wrap: wrap; }
.ped-aktion {
  display: inline-flex; align-items: center; gap: 0.35rem;
  padding: 0.45rem 0.8rem; border: 1px solid var(--ped-rand-stark);
  border-radius: 6px; background: var(--ped-flaeche);
  color: var(--ped-text); font-size: 0.82rem; cursor: pointer;
}
.ped-aktion:hover { border-color: var(--ped-akzent); color: var(--ped-akzent); }
.ped-aktion:disabled { opacity: 0.6; }
.ped-stellen {
  display: inline-flex; align-items: center; gap: 0.4rem;
  margin-left: auto; padding: 0.45rem 1rem; border: none; border-radius: 6px;
  background: var(--ped-akzent); color: var(--ped-akzent-kontrast);
  font-size: 0.85rem; font-weight: 600; cursor: pointer;
}
.ped-stellen:hover { background: var(--ped-akzent-hover); }
.ped-stellen:disabled { opacity: 0.6; }
.ped-zu { border: none; background: none; color: var(--ped-text-dim); cursor: pointer; }
</style>
