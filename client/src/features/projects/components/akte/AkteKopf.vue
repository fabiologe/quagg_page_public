<template>
  <header class="prj-akte-kopf">
    <div class="prj-akte-titelzeile">
      <router-link to="/intern/projects" class="prj-zurueck"><ProjektIcon name="projekte" :size="14" /> Portfolio</router-link>
      <span class="prj-akte-nr">#P{{ akte.id }}</span>
      <PhasenPille :phase="akte.phase" />
    </div>
    <div class="prj-akte-hauptzeile">
      <h1>{{ akte.name }}</h1>
      <div class="prj-akte-aktionen">
        <a :href="`/cde?projekt=${akte.id}`" target="_blank" rel="noopener" class="prj-knopf" title="CDE-Viewer in eigenem Tab"><ProjektIcon name="modelle" :size="14" /> CDE-Viewer</a>
        <label class="prj-verschieben">
          <ProjektIcon name="verschieben" :size="14" />
          <select :value="akte.phase || ''" :disabled="!akte.ordner_vorhanden" @change="$emit('verschieben', $event.target.value)">
            <option v-if="!akte.phase" value="">Ohne Ordner</option>
            <option v-for="p in PHASEN" :key="p.id" :value="p.id">{{ p.titel }}</option>
          </select>
        </label>
      </div>
    </div>
    <p class="prj-akte-pfad">
      <ProjektIcon name="ordner" :size="13" />
      <span class="prj-mono">1_Projekte/{{ akte.phase || '?' }}/{{ akte.ordnername }}</span>
      <span v-if="!akte.ordner_vorhanden" class="prj-akte-warnung">Ordner fehlt — siehe Abgleich im Portfolio</span>
    </p>
    <nav class="prj-tabs" aria-label="Bereiche der Akte">
      <button
        v-for="t in tabs"
        :key="t.id"
        type="button"
        class="prj-tab"
        :class="{ 'prj-tab-aktiv': aktiv === t.id }"
        :disabled="t.bald"
        :title="t.bald ? 'Kommt mit einer späteren Stufe' : ''"
        @click="$emit('tab', t.id)"
      >
        <ProjektIcon :name="t.icon" :size="14" /> {{ t.titel }}
      </button>
    </nav>
  </header>
</template>

<script setup>
// AkteKopf — Titel, Phase (Verschieben = Ordner-Rename im Backend), Ordnerpfad, Tabs.
import ProjektIcon from '../ui/ProjektIcon.vue';
import PhasenPille from '../ui/PhasenPille.vue';
import { PHASEN } from '../../services/Phasen';

defineProps({
  akte: { type: Object, required: true },
  aktiv: { type: String, default: 'uebersicht' },
  tabs: { type: Array, required: true },
});
defineEmits(['verschieben', 'tab']);
</script>

<style scoped>
.prj-akte-kopf { display: flex; flex-direction: column; gap: 0.5rem; }
.prj-akte-titelzeile { display: flex; align-items: center; gap: 0.7rem; font-size: 0.8rem; }
.prj-zurueck {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  color: var(--prj-akzent);
  text-decoration: none;
}
.prj-akte-nr { font-family: var(--prj-mono); color: var(--prj-text-dim); }
.prj-akte-hauptzeile { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
.prj-akte-hauptzeile h1 { margin: 0; font-size: 1.45rem; line-height: 1.2; }
.prj-akte-aktionen { display: flex; align-items: center; gap: 0.6rem; }
.prj-akte-aktionen a.prj-knopf { text-decoration: none; }
.prj-verschieben {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.8rem;
  color: var(--prj-text-dim);
}
.prj-verschieben select {
  padding: 0.35rem 0.5rem;
  border: 1px solid var(--prj-rand-stark);
  border-radius: 6px;
  background: var(--prj-flaeche);
  color: var(--prj-text);
  font-size: 0.82rem;
}
.prj-akte-pfad {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0;
  font-size: 0.78rem;
  color: var(--prj-text-dim);
}
.prj-mono { font-family: var(--prj-mono); }
.prj-akte-warnung { color: var(--prj-warn); font-weight: 600; }
.prj-tabs { display: flex; flex-wrap: wrap; gap: 0.25rem; border-bottom: 1px solid var(--prj-rand); }
.prj-tab {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.5rem 0.75rem;
  border: none;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--prj-text-dim);
  font-size: 0.82rem;
  cursor: pointer;
}
.prj-tab:hover:not(:disabled) { color: var(--prj-text); }
.prj-tab:disabled { opacity: 0.45; cursor: not-allowed; }
.prj-tab-aktiv { color: var(--prj-akzent); border-bottom-color: var(--prj-akzent); font-weight: 600; }
</style>
