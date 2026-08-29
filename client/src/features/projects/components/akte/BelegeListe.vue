<template>
  <ProjektKarte titel="Fremdkosten (Belege mit Kostenmerkmal)" icon="beleg">
    <template #aktionen>
      <button type="button" class="prj-knopf" @click="oeffnePicker"><ProjektIcon name="plus" :size="13" /> Beleg zuordnen</button>
    </template>
    <div v-if="picker" class="prj-picker">
      <LeerHinweis v-if="!frei.length" text="Keine freien Belege — alle sind zugeordnet oder verworfen." />
      <template v-else>
        <select v-model="gewaehlt">
          <option v-for="b in frei" :key="b.id" :value="b.id">{{ b.belegnummer }} · {{ b.lieferant || '(ohne Lieferant)' }} · {{ centAlsEuro(b.brutto_cent || 0) }}</option>
        </select>
        <button type="button" class="prj-knopf prj-knopf-primaer" :disabled="!gewaehlt" @click="zuordnen">Zuordnen als {{ merkmal }}</button>
      </template>
    </div>
    <LeerHinweis v-if="!belege.length" text="Noch kein Beleg diesem Projekt zugeordnet." />
    <ul v-else class="prj-liste">
      <li v-for="b in belege" :key="b.id">
        <span class="prj-nr">{{ b.belegnummer }}</span>
        <span>{{ b.lieferant || '—' }}</span>
        <span class="prj-datum">{{ datum(b.belegdatum) }}</span>
        <span class="prj-betrag">{{ centAlsEuro(b.brutto_cent || 0) }}</span>
        <button type="button" class="prj-knopf prj-knopf-klein" title="Zuordnung lösen" @click="store.belegLoesen(akte.id, b.id)">
          <ProjektIcon name="schliessen" :size="13" />
        </button>
      </li>
    </ul>
  </ProjektKarte>
</template>

<script setup>
// BelegeListe — Pedant-Belege mit kostenmerkmal '#P<id>'; Zuordnung per Picker über freie Belege.
import { computed, ref } from 'vue';
import { centAlsEuro } from '@/features/kleiner-pedant/services/Geld';
import ProjekteApi from '../../services/ProjekteApi';
import LeerHinweis from '../ui/LeerHinweis.vue';
import ProjektIcon from '../ui/ProjektIcon.vue';
import ProjektKarte from '../ui/ProjektKarte.vue';
import { datum } from '../../services/Phasen';
import { useProjekteStore } from '../../stores/useProjekteStore';

const props = defineProps({ akte: { type: Object, required: true }, belege: { type: Array, default: () => [] } });
const store = useProjekteStore();
const picker = ref(false);
const frei = ref([]);
const gewaehlt = ref(null);
const merkmal = computed(() => `#P${props.akte.id}`);

async function oeffnePicker() {
  picker.value = !picker.value;
  if (!picker.value) return;
  try {
    frei.value = await ProjekteApi.belegeFrei(props.akte.id);
  } catch (error) {
    console.warn('projekte belege:', error);
    frei.value = [];
  }
}

async function zuordnen() {
  if (!gewaehlt.value) return;
  const ok = await store.belegZuordnen(props.akte.id, gewaehlt.value);
  if (ok) {
    frei.value = frei.value.filter((b) => b.id !== gewaehlt.value);
    gewaehlt.value = null;
  }
}
</script>

<style scoped>
.prj-picker { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.8rem; }
.prj-picker select { flex: 1; min-width: 12rem; padding: 0.35rem 0.5rem; border: 1px solid var(--prj-rand-stark); border-radius: 6px; background: var(--prj-flaeche); color: var(--prj-text); font-size: 0.82rem; }
.prj-liste { list-style: none; margin: 0; padding: 0; }
.prj-liste li { display: grid; grid-template-columns: auto 1fr auto auto auto; align-items: center; gap: 0.6rem; padding: 0.4rem 0; border-bottom: 1px dashed var(--prj-rand); font-size: 0.85rem; }
.prj-nr { font-family: var(--prj-mono); font-size: 0.78rem; color: var(--prj-text-dim); }
.prj-datum, .prj-betrag { font-variant-numeric: tabular-nums; white-space: nowrap; }
.prj-knopf-klein { padding: 0.25rem 0.4rem; }
</style>
