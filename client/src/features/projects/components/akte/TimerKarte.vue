<template>
  <ProjektKarte titel="Timer" icon="zeit">
    <div v-if="store.timer" class="prj-timer-laeuft">
      <div>
        <strong>{{ laufzeit }}</strong>
        <span class="prj-timer-was">{{ store.timer.taetigkeit || 'Arbeit am Projekt' }}</span>
        <span v-if="store.timer.projekt_id !== akte.id" class="prj-timer-fremd">läuft für #P{{ store.timer.projekt_id }} {{ store.timer.projekt }}</span>
      </div>
      <div class="prj-timer-aktionen">
        <button type="button" class="prj-knopf prj-knopf-primaer" @click="stoppen"><ProjektIcon name="ok" :size="14" /> Stoppen und buchen</button>
        <button type="button" class="prj-knopf" @click="store.timerVerwerfen()">Verwerfen</button>
      </div>
    </div>
    <form v-else class="prj-timer-start" @submit.prevent="starten">
      <input v-model.trim="taetigkeit" type="text" placeholder="Woran arbeitest du? (optional)" />
      <select v-model="abschnittId">
        <option :value="null">ohne Abschnitt</option>
        <option v-for="a in akte.abschnitte || []" :key="a.id" :value="a.id">{{ a.bezeichnung }}</option>
      </select>
      <button type="submit" class="prj-knopf prj-knopf-primaer"><ProjektIcon name="zeit" :size="14" /> Start</button>
    </form>
  </ProjektKarte>
</template>

<script setup>
// TimerKarte — ein laufender Timer je Nutzer; Stoppen bucht mindestens eine Minute.
import { computed, onMounted, onUnmounted, ref } from 'vue';
import ProjektIcon from '../ui/ProjektIcon.vue';
import ProjektKarte from '../ui/ProjektKarte.vue';
import { minutenAlsText } from '../../services/Zeit';
import { useProjekteStore } from '../../stores/useProjekteStore';

const props = defineProps({ akte: { type: Object, required: true } });
const store = useProjekteStore();
const taetigkeit = ref('');
const abschnittId = ref(null);
const jetzt = ref(Date.now());
let uhr = null;

const laufzeit = computed(() => {
  if (!store.timer) return '';
  const start = new Date(store.timer.gestartet_am).getTime();
  return minutenAlsText(Math.max(0, (jetzt.value - start) / 60000));
});

async function starten() {
  await store.timerStart(props.akte.id, { taetigkeit: taetigkeit.value, abschnitt_id: abschnittId.value });
}
async function stoppen() {
  await store.timerStop({});
}

onMounted(() => {
  store.ladeTimer();
  uhr = setInterval(() => { jetzt.value = Date.now(); }, 15000);
});
onUnmounted(() => clearInterval(uhr));
</script>

<style scoped>
.prj-timer-laeuft { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 0.8rem; }
.prj-timer-laeuft strong { font-size: 1.4rem; font-variant-numeric: tabular-nums; margin-right: 0.6rem; color: var(--prj-leistung); }
.prj-timer-was { font-size: 0.85rem; }
.prj-timer-fremd { display: block; font-size: 0.76rem; color: var(--prj-warn); }
.prj-timer-aktionen { display: flex; gap: 0.4rem; }
.prj-timer-start { display: grid; grid-template-columns: 1fr 12rem auto; gap: 0.4rem; }
.prj-timer-start input, .prj-timer-start select { padding: 0.4rem 0.55rem; border: 1px solid var(--prj-rand-stark); border-radius: 6px; background: var(--prj-flaeche); color: var(--prj-text); font-size: 0.85rem; }
@media (max-width: 60rem) { .prj-timer-start { grid-template-columns: 1fr; } }
</style>
