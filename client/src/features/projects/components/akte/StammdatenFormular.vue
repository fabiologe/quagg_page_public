<template>
  <ProjektKarte titel="Stammdaten" icon="akte">
    <form class="prj-form" @submit.prevent="speichern">
      <FormFeld name="Projektname">
        <input v-model.trim="felder.name" type="text" required />
      </FormFeld>
      <div class="prj-form-zeile">
        <FormFeld name="Kurzname" optional>
          <input v-model.trim="felder.kurzname" type="text" />
        </FormFeld>
        <FormFeld name="Honorarmodell">
          <select v-model="felder.honorarmodell">
            <option v-for="m in HONORARMODELLE" :key="m.id" :value="m.id">{{ m.titel }}</option>
          </select>
        </FormFeld>
      </div>
      <div v-if="felder.honorarmodell === 'stunden'" class="prj-form-zeile">
        <FormFeld name="Stundensatz (€ netto)">
          <input v-model="stundensatzText" type="text" inputmode="decimal" placeholder="95,00" />
        </FormFeld>
        <FormFeld name="Budget (Stunden)" optional>
          <input v-model.number="felder.budget_stunden" type="number" min="1" step="1" />
        </FormFeld>
      </div>
      <FormFeld name="Auftraggeber (Pedant-Stammdaten, für Rechnungen)" optional>
        <select v-model="felder.auftraggeber_id">
          <option :value="null">— kein Auftraggeber —</option>
          <option v-for="ag in store.auftraggeber" :key="ag.id" :value="ag.id">{{ ag.name }}</option>
        </select>
      </FormFeld>
      <FormFeld name="Notiz" optional>
        <textarea v-model="felder.notiz" rows="3"></textarea>
      </FormFeld>
      <div class="prj-form-fuss">
        <span v-if="geaendert" class="prj-form-status">Ungespeicherte Änderungen</span>
        <button type="submit" class="prj-knopf prj-knopf-primaer" :disabled="!geaendert || !felder.name">
          <ProjektIcon name="speichern" :size="14" /> Speichern
        </button>
      </div>
    </form>
  </ProjektKarte>
</template>

<script setup>
// StammdatenFormular — bearbeitet nur die änderbaren Felder; Geld als Cent (Geld.js).
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { centAlsEuro, euroZuCent } from '@/features/kleiner-pedant/services/Geld';
import FormFeld from '../ui/FormFeld.vue';
import ProjektIcon from '../ui/ProjektIcon.vue';
import ProjektKarte from '../ui/ProjektKarte.vue';
import { HONORARMODELLE } from '../../services/Phasen';
import { useProjekteStore } from '../../stores/useProjekteStore';

const props = defineProps({ akte: { type: Object, required: true } });
const emit = defineEmits(['speichern']);
const store = useProjekteStore();

const felder = reactive({ name: '', kurzname: '', honorarmodell: 'hoai', budget_stunden: null, notiz: '', auftraggeber_id: null });
const stundensatzText = ref('');

function uebernehmen(a) {
  felder.name = a.name || '';
  felder.kurzname = a.kurzname || '';
  felder.honorarmodell = a.honorarmodell || 'hoai';
  felder.budget_stunden = a.budget_stunden ?? null;
  felder.notiz = a.notiz || '';
  felder.auftraggeber_id = a.auftraggeber_id ?? null;
  stundensatzText.value = Number.isInteger(a.stundensatz_cent)
    ? centAlsEuro(a.stundensatz_cent).replace(/\s?€/, '') : '';
}
watch(() => props.akte, uebernehmen, { immediate: true, deep: true });

const stundensatzCent = computed(() => (stundensatzText.value ? euroZuCent(stundensatzText.value) : null));

const geaendert = computed(() => {
  const a = props.akte;
  return felder.name !== (a.name || '') || felder.kurzname !== (a.kurzname || '')
    || felder.honorarmodell !== a.honorarmodell || felder.notiz !== (a.notiz || '')
    || (felder.budget_stunden ?? null) !== (a.budget_stunden ?? null)
    || (felder.auftraggeber_id ?? null) !== (a.auftraggeber_id ?? null)
    || (stundensatzCent.value ?? null) !== (a.stundensatz_cent ?? null);
});

function speichern() {
  emit('speichern', {
    name: felder.name, kurzname: felder.kurzname, honorarmodell: felder.honorarmodell,
    notiz: felder.notiz, budget_stunden: felder.budget_stunden || null,
    stundensatz_cent: stundensatzCent.value || null, auftraggeber_id: felder.auftraggeber_id || null,
  });
}

onMounted(() => store.ladeAuftraggeber());
</script>

<style scoped>
.prj-form { display: flex; flex-direction: column; gap: 0.7rem; }
.prj-form-zeile { display: grid; grid-template-columns: 1fr 1fr; gap: 0.7rem; }
.prj-form-fuss { display: flex; align-items: center; justify-content: flex-end; gap: 0.8rem; }
.prj-form-status { font-size: 0.78rem; color: var(--prj-warn); }
</style>
