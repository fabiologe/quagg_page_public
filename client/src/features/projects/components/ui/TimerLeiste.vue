<template>
  <div v-if="store.timer" class="prj-timerleiste">
    <ProjektIcon name="zeit" :size="14" />
    <strong>{{ laufzeit }}</strong>
    <span>{{ store.timer.taetigkeit || 'Arbeit am Projekt' }} ·</span>
    <router-link :to="`/intern/projects/${store.timer.projekt_id}`">#P{{ store.timer.projekt_id }} {{ store.timer.projekt }}</router-link>
    <button type="button" class="prj-knopf prj-knopf-primaer prj-knopf-klein" @click="store.timerStop({})"><ProjektIcon name="ok" :size="13" /> Stoppen</button>
  </div>
</template>

<script setup>
// TimerLeiste — der laufende Timer ist überall im Cockpit sichtbar (Portfolio und jede Akte).
import { computed, onMounted, onUnmounted, ref } from 'vue';
import ProjektIcon from './ProjektIcon.vue';
import { minutenAlsText } from '../../services/Zeit';
import { useProjekteStore } from '../../stores/useProjekteStore';

const store = useProjekteStore();
const jetzt = ref(Date.now());
let uhr = null;
const laufzeit = computed(() => (store.timer ? minutenAlsText(Math.max(0, (jetzt.value - new Date(store.timer.gestartet_am).getTime()) / 60000)) : ''));
onMounted(() => { store.ladeTimer(); uhr = setInterval(() => { jetzt.value = Date.now(); }, 15000); });
onUnmounted(() => clearInterval(uhr));
</script>

<style scoped>
.prj-timerleiste { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; padding: 0.45rem 0.8rem; border-radius: 6px; background: var(--prj-leistung-weich); color: var(--prj-text); font-size: 0.85rem; }
.prj-timerleiste strong { font-variant-numeric: tabular-nums; color: var(--prj-leistung); }
.prj-timerleiste a { color: var(--prj-akzent); font-weight: 600; text-decoration: none; }
.prj-knopf-klein { padding: 0.25rem 0.55rem; margin-left: auto; }
</style>
