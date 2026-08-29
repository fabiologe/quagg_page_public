<template>
  <div class="prj-portfolio">
    <div class="prj-portfolio-leiste">
      <label class="prj-suche">
        <ProjektIcon name="suche" :size="14" />
        <input v-model="suche" type="search" placeholder="Projekt suchen (Name oder Nummer)" />
      </label>
      <span class="prj-portfolio-zaehler">{{ gefiltert.length }} von {{ projekte.length }}</span>
    </div>
    <LeerHinweis v-if="gefiltert.length === 0" :text="leerText" />
    <div v-else class="prj-portfolio-raster">
      <ProjektKachel v-for="p in gefiltert" :key="p.id" :projekt="p" />
    </div>
  </div>
</template>

<script setup>
// PortfolioListe — Kacheln, gefiltert nach Kennzahl-Auswahl und Suchtext.
import { computed, ref } from 'vue';
import LeerHinweis from '../ui/LeerHinweis.vue';
import ProjektIcon from '../ui/ProjektIcon.vue';
import ProjektKachel from './ProjektKachel.vue';
import { dringlichkeit } from '../../services/Phasen';

const props = defineProps({
  projekte: { type: Array, default: () => [] },
  filter: { type: String, default: 'alle' },
});

const suche = ref('');

const gefiltert = computed(() => {
  const text = suche.value.trim().toLowerCase();
  return props.projekte.filter((p) => {
    if (props.filter === 'faellig') {
      const d = dringlichkeit(p.naechster_termin);
      if (d !== 'bald' && d !== 'ueberfaellig') return false;
    } else if (props.filter === 'vorschlaege') {
      if (!(p.vorschlaege_offen > 0)) return false;
    } else if (props.filter === 'aufgaben') {
      if (!(p.aufgaben?.ueberfaellig > 0)) return false;
    } else if (props.filter === 'unabgerechnet') {
      if (!(p.geld?.unabgerechnet_cent > 0)) return false;
    } else if (props.filter !== 'alle' && p.phase !== props.filter) {
      return false;
    }
    if (!text) return true;
    return `${p.id} ${p.name} ${p.kurzname || ''}`.toLowerCase().includes(text);
  });
});

const leerText = computed(() => (props.projekte.length === 0
  ? 'Noch kein Projekt angelegt — oben rechts „Neues Projekt".'
  : 'Kein Projekt passt zu Filter und Suche.'));
</script>

<style scoped>
.prj-portfolio { display: flex; flex-direction: column; gap: 0.8rem; }
.prj-portfolio-leiste {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.8rem;
}
.prj-suche {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex: 1;
  max-width: 26rem;
  padding: 0.35rem 0.6rem;
  border: 1px solid var(--prj-rand-stark);
  border-radius: 6px;
  background: var(--prj-flaeche);
  color: var(--prj-text-dim);
}
.prj-suche input {
  flex: 1;
  border: none;
  background: transparent;
  color: var(--prj-text);
  font-size: 0.85rem;
  outline: none;
}
.prj-portfolio-zaehler { font-size: 0.78rem; color: var(--prj-text-dim); }
.prj-portfolio-raster {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
  gap: 0.8rem;
}
</style>
