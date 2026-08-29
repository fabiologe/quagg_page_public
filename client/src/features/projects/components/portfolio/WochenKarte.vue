<template>
  <ProjektKarte titel="Diese Woche" icon="zeit">
    <template #aktionen>
      <button type="button" class="prj-knopf prj-knopf-klein" title="Vorwoche" @click="verschiebe(-7)"><ProjektIcon name="weiter" :size="13" class="prj-drehen" /></button>
      <span class="prj-dim">{{ datum(von) }} – {{ datum(bis) }}</span>
      <button type="button" class="prj-knopf prj-knopf-klein" title="Folgewoche" @click="verschiebe(7)"><ProjektIcon name="weiter" :size="13" /></button>
    </template>
    <LeerHinweis v-if="geladen && !zeilen.length" text="Keine Zeitbuchungen in dieser Woche." />
    <template v-else>
      <ul class="prj-woche">
        <li v-for="z in zeilen" :key="z.projekt_id">
          <router-link :to="`/intern/projects/${z.projekt_id}`">#P{{ z.projekt_id }} {{ z.projekt }}</router-link>
          <span class="prj-balken"><span class="prj-balken-fuell" :style="{ width: `${(z.minuten / maxMinuten) * 100}%` }"></span></span>
          <strong>{{ minutenAlsText(z.minuten) }}</strong>
        </li>
      </ul>
      <p class="prj-summe">Summe <strong>{{ minutenAlsText(summe) }}</strong></p>
    </template>
  </ProjektKarte>
</template>

<script setup>
// WochenKarte — Stunden je Projekt in der Kalenderwoche (Zeitraum-Endpunkt über alle Projekte).
import { computed, onMounted, ref } from 'vue';
import ProjekteApi from '../../services/ProjekteApi';
import LeerHinweis from '../ui/LeerHinweis.vue';
import ProjektIcon from '../ui/ProjektIcon.vue';
import ProjektKarte from '../ui/ProjektKarte.vue';
import { datum } from '../../services/Phasen';
import { minutenAlsText, wochenblatt } from '../../services/Zeit';

const heute = new Date().toISOString().slice(0, 10);
const [startVon, startBis] = wochenblatt(heute);
const von = ref(startVon);
const bis = ref(startBis);
const buchungen = ref([]);
const geladen = ref(false);

const zeilen = computed(() => {
  const gruppen = new Map();
  for (const b of buchungen.value) {
    const g = gruppen.get(b.projekt_id) || { projekt_id: b.projekt_id, projekt: b.projekt, minuten: 0 };
    g.minuten += Number(b.dauer_min) || 0;
    gruppen.set(b.projekt_id, g);
  }
  return [...gruppen.values()].sort((a, b) => b.minuten - a.minuten);
});
const summe = computed(() => zeilen.value.reduce((s, z) => s + z.minuten, 0));
const maxMinuten = computed(() => Math.max(1, ...zeilen.value.map((z) => z.minuten)));

async function laden() {
  try {
    buchungen.value = await ProjekteApi.zeitraum(von.value, bis.value);
  } catch (error) {
    buchungen.value = [];
  } finally {
    geladen.value = true;
  }
}
function verschiebe(tage) {
  const d = new Date(`${von.value}T00:00:00`);
  d.setDate(d.getDate() + tage);
  [von.value, bis.value] = wochenblatt(d.toISOString().slice(0, 10));
  laden();
}
onMounted(laden);
</script>

<style scoped>
.prj-dim { font-size: 0.76rem; color: var(--prj-text-dim); font-variant-numeric: tabular-nums; }
.prj-knopf-klein { padding: 0.2rem 0.4rem; }
.prj-drehen { transform: rotate(180deg); }
.prj-woche { list-style: none; margin: 0; padding: 0; }
.prj-woche li { display: grid; grid-template-columns: minmax(0, 1fr) 6rem auto; align-items: center; gap: 0.5rem; padding: 0.3rem 0; border-bottom: 1px dashed var(--prj-rand); font-size: 0.85rem; }
.prj-woche a { color: var(--prj-akzent); text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.prj-balken { display: block; height: 0.4rem; border-radius: 2px; background: var(--prj-leistung-weich); overflow: hidden; }
.prj-balken-fuell { display: block; height: 100%; background: var(--prj-leistung); }
.prj-woche strong { font-variant-numeric: tabular-nums; }
.prj-summe { margin: 0.5rem 0 0; font-size: 0.85rem; text-align: right; }
</style>
