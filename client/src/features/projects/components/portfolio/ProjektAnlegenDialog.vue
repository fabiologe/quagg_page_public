<template>
  <ProjektModal :titel="titel" icon="plus" @schliessen="$emit('schliessen')">
    <form class="prj-form" @submit.prevent="absenden">
      <p v-if="ordner" class="prj-form-hinweis">
        Bestandsordner <span class="prj-mono">{{ ordner.phase }}/{{ ordner.ordnername }}</span> bekommt eine Akte.
      </p>
      <FormFeld name="Projektname" :fehler="fehler.name">
        <input v-model.trim="felder.name" type="text" required autofocus />
      </FormFeld>
      <FormFeld v-if="!ordner" name="Kurzname für den Ordner" optional>
        <input v-model.trim="felder.kurzname" type="text" placeholder="z. B. Kanal MH" />
      </FormFeld>
      <div class="prj-form-zeile">
        <FormFeld name="Honorarmodell">
          <select v-model="felder.honorarmodell">
            <option v-for="m in HONORARMODELLE" :key="m.id" :value="m.id">{{ m.titel }}</option>
          </select>
        </FormFeld>
        <FormFeld v-if="!ordner" name="Phase">
          <select v-model="felder.phase">
            <option v-for="p in PHASEN" :key="p.id" :value="p.id">{{ p.titel }}</option>
          </select>
        </FormFeld>
      </div>
      <fieldset v-if="!ordner && felder.honorarmodell === 'hoai'" class="prj-lph">
        <legend>Leistungsphasen (Ordner unter 02_Planung)</legend>
        <label v-for="l in LEISTUNGSPHASEN" :key="l.nr">
          <input v-model="felder.lph" type="checkbox" :value="l.nr" /> LPH {{ l.nr }} {{ l.titel }}
        </label>
      </fieldset>
    </form>
    <template #fuss>
      <button type="button" class="prj-knopf" @click="$emit('schliessen')">Abbrechen</button>
      <button type="button" class="prj-knopf prj-knopf-primaer" :disabled="!felder.name || laeuft" @click="absenden">
        <ProjektIcon :name="laeuft ? 'laden' : 'ok'" :size="14" /> {{ ordner ? 'Akte anlegen' : 'Projekt anlegen' }}
      </button>
    </template>
  </ProjektModal>
</template>

<script setup>
// ProjektAnlegenDialog — neues Projekt ODER Akte für einen Bestandsordner (prop `ordner`).
import { computed, reactive, ref } from 'vue';
import FormFeld from '../ui/FormFeld.vue';
import ProjektIcon from '../ui/ProjektIcon.vue';
import ProjektModal from '../ui/ProjektModal.vue';
import { HONORARMODELLE, LEISTUNGSPHASEN, PHASEN } from '../../services/Phasen';

const props = defineProps({ ordner: { type: Object, default: null } });
const emit = defineEmits(['schliessen', 'anlegen', 'uebernehmen']);

const felder = reactive({ name: '', kurzname: '', honorarmodell: 'hoai', phase: '00_Angebote', lph: [] });
const fehler = reactive({ name: '' });
const laeuft = ref(false);
const titel = computed(() => (props.ordner ? 'Akte für Bestandsordner' : 'Neues Projekt'));

async function absenden() {
  fehler.name = felder.name ? '' : 'Bitte einen Namen eingeben';
  if (fehler.name) return;
  laeuft.value = true;
  try {
    if (props.ordner) {
      emit('uebernehmen', props.ordner.id, { name: felder.name, honorarmodell: felder.honorarmodell });
    } else {
      emit('anlegen', { ...felder, lph: [...felder.lph].sort((a, b) => a - b) });
    }
  } finally {
    laeuft.value = false;
  }
}
</script>

<style scoped>
.prj-form { display: flex; flex-direction: column; gap: 0.8rem; }
.prj-form-zeile { display: grid; grid-template-columns: 1fr 1fr; gap: 0.8rem; }
.prj-form-hinweis { margin: 0; font-size: 0.85rem; color: var(--prj-text-dim); }
.prj-mono { font-family: var(--prj-mono); }
.prj-lph {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.3rem 1rem;
  padding: 0.6rem 0.8rem;
  border: 1px solid var(--prj-rand);
  border-radius: 6px;
  font-size: 0.82rem;
}
.prj-lph legend { font-size: 0.75rem; color: var(--prj-text-dim); padding: 0 0.3rem; }
.prj-lph label { display: flex; align-items: center; gap: 0.35rem; }
</style>
