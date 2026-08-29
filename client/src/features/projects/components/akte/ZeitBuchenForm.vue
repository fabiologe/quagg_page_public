<template>
  <form class="prj-buchen" @submit.prevent="buchen">
    <input v-model="felder.datum" type="date" required />
    <input v-model="dauerText" type="text" placeholder="1:30 / 1,5 / 90m" required :class="{ 'prj-ungueltig': dauerText && dauer === null }" />
    <input v-model.trim="felder.taetigkeit" type="text" placeholder="Tätigkeit" required />
    <select v-model="felder.abschnitt_id">
      <option :value="null">ohne Abschnitt</option>
      <option v-for="a in abschnitte" :key="a.id" :value="a.id">{{ a.bezeichnung }}</option>
    </select>
    <label class="prj-abrechenbar"><input v-model="felder.abrechenbar" type="checkbox" /> abrechenbar</label>
    <button type="submit" class="prj-knopf prj-knopf-primaer" :disabled="!gueltig">Buchen</button>
  </form>
</template>

<script setup>
// ZeitBuchenForm — manuelle Buchung; Dauer versteht 1:30, 1,5 und 90m.
import { computed, reactive, ref } from 'vue';
import { textZuMinuten } from '../../services/Zeit';

const props = defineProps({ abschnitte: { type: Array, default: () => [] } });
const emit = defineEmits(['buchen']);
const heute = new Date().toISOString().slice(0, 10);
const felder = reactive({ datum: heute, taetigkeit: '', abschnitt_id: null, abrechenbar: true });
const dauerText = ref('');
const dauer = computed(() => (dauerText.value ? textZuMinuten(dauerText.value) : null));
const gueltig = computed(() => Boolean(felder.datum && felder.taetigkeit && dauer.value > 0));

function buchen() {
  if (!gueltig.value) return;
  emit('buchen', { ...felder, dauer_min: dauer.value });
  dauerText.value = '';
  felder.taetigkeit = '';
}
</script>

<style scoped>
.prj-buchen { display: grid; grid-template-columns: 9rem 7rem 1fr 11rem auto auto; gap: 0.4rem; align-items: center; }
.prj-buchen input, .prj-buchen select { padding: 0.35rem 0.5rem; border: 1px solid var(--prj-rand-stark); border-radius: 6px; background: var(--prj-flaeche); color: var(--prj-text); font-size: 0.82rem; }
.prj-ungueltig { border-color: var(--prj-fehler) !important; }
.prj-abrechenbar { display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.78rem; color: var(--prj-text-dim); white-space: nowrap; }
@media (max-width: 60rem) { .prj-buchen { grid-template-columns: 1fr 1fr; } }
</style>
