<template>
  <ProjektKarte titel="Abgleich Ordner ↔ Akte" icon="ordner">
    <p v-if="sauber" class="prj-abgleich-ok"><ProjektIcon name="ok" :size="14" /> Jeder Ordner hat eine Akte, jede Akte einen Ordner.</p>
    <template v-else>
      <div v-if="abgleich.ordner_ohne_akte.length" class="prj-abgleich-block">
        <h4>Ordner ohne Akte</h4>
        <ul>
          <li v-for="o in abgleich.ordner_ohne_akte" :key="o.id">
            <span class="prj-mono">{{ o.phase }}/{{ o.ordnername }}</span>
            <button type="button" class="prj-knopf" @click="$emit('uebernehmen', o)">Akte anlegen</button>
          </li>
        </ul>
      </div>
      <div v-if="abgleich.akte_ohne_ordner.length" class="prj-abgleich-block">
        <h4>Akte ohne Ordner</h4>
        <ul>
          <li v-for="a in abgleich.akte_ohne_ordner" :key="a.id">
            <span>#P{{ a.id }} {{ a.name }}</span>
            <small>erwartet: <span class="prj-mono">{{ a.ordnername }}</span> — im Explorer prüfen</small>
          </li>
        </ul>
      </div>
    </template>
  </ProjektKarte>
</template>

<script setup>
// AbgleichKarte — meldet Drift zwischen StorageBox und Akten; repariert nichts still.
import { computed } from 'vue';
import ProjektIcon from '../ui/ProjektIcon.vue';
import ProjektKarte from '../ui/ProjektKarte.vue';

const props = defineProps({
  abgleich: { type: Object, default: () => ({ ordner_ohne_akte: [], akte_ohne_ordner: [] }) },
});
defineEmits(['uebernehmen']);

const sauber = computed(() => !props.abgleich.ordner_ohne_akte.length && !props.abgleich.akte_ohne_ordner.length);
</script>

<style scoped>
.prj-abgleich-ok {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  margin: 0;
  font-size: 0.85rem;
  color: var(--prj-leistung);
}
.prj-abgleich-block h4 {
  margin: 0 0 0.35rem;
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--prj-warn);
}
.prj-abgleich-block + .prj-abgleich-block { margin-top: 0.8rem; }
.prj-abgleich-block ul { list-style: none; margin: 0; padding: 0; }
.prj-abgleich-block li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.4rem;
  padding: 0.35rem 0;
  border-bottom: 1px dashed var(--prj-rand);
  font-size: 0.85rem;
}
.prj-abgleich-block small { color: var(--prj-text-dim); }
.prj-mono { font-family: var(--prj-mono); font-size: 0.8rem; }
</style>
