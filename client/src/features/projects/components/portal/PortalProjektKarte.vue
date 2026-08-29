<template>
  <article class="prj-pk">
    <header class="prj-pk-kopf">
      <span class="prj-pk-nr">#P{{ projekt.id }}</span>
      <span class="prj-pk-phase">{{ projekt.phase_titel }}</span>
    </header>
    <h2>{{ projekt.name }}</h2>
    <div class="prj-pk-stand">
      <span>Leistungsstand</span>
      <strong>{{ projekt.fortschritt_prozent }} %</strong>
    </div>
    <div class="prj-pk-segmente">
      <div
        v-for="a in projekt.abschnitte"
        :key="a.nr"
        class="prj-pk-seg"
        :class="{ 'prj-pk-seg-nicht': !a.beauftragt }"
        :style="{ flex: a.anteil || 0.01 }"
        :title="`${a.bezeichnung}: ${a.beauftragt ? `${a.fortschritt_prozent} %` : 'nicht beauftragt'}`"
      >
        <div v-if="a.beauftragt" class="prj-pk-fuell" :style="{ width: `${a.fortschritt_prozent}%` }"></div>
      </div>
    </div>
    <ul class="prj-pk-abschnitte">
      <li v-for="a in projekt.abschnitte.filter((x) => x.beauftragt)" :key="a.nr">
        <span>{{ a.bezeichnung }}</span>
        <span class="prj-pk-prozent">{{ a.fortschritt_prozent }} %</span>
      </li>
    </ul>
    <div v-if="projekt.termine.length" class="prj-pk-termine">
      <h3>Nächste Termine</h3>
      <ul>
        <li v-for="t in projekt.termine" :key="t.bezeichnung + t.faellig_am" :class="{ 'prj-pk-ueberfaellig': t.ueberfaellig }">
          <span>{{ datum(t.faellig_am) }}</span><span>{{ t.bezeichnung }}</span>
        </li>
      </ul>
    </div>
    <footer class="prj-pk-fuss">Stand {{ datum(projekt.stand) }}</footer>
  </article>
</template>

<script setup>
// PortalProjektKarte — die Kundensicht: Phase, Balken ohne Beträge, Abschnitte, Termine.
import { datum } from '../../services/Phasen';

defineProps({ projekt: { type: Object, required: true } });
</script>

<style scoped>
.prj-pk { display: flex; flex-direction: column; gap: 0.6rem; padding: 1rem 1.1rem; border: 1px solid var(--prj-rand); border-radius: 8px; background: var(--prj-flaeche); color: var(--prj-text); box-shadow: var(--prj-schatten); }
.prj-pk-kopf { display: flex; justify-content: space-between; font-size: 0.78rem; color: var(--prj-text-dim); }
.prj-pk-nr { font-family: var(--prj-mono); }
.prj-pk-phase { text-transform: uppercase; letter-spacing: 0.04em; font-weight: 600; color: var(--prj-akzent); }
.prj-pk h2 { margin: 0; font-size: 1.1rem; }
.prj-pk-stand { display: flex; justify-content: space-between; font-size: 0.82rem; color: var(--prj-text-dim); }
.prj-pk-stand strong { color: var(--prj-text); font-variant-numeric: tabular-nums; }
.prj-pk-segmente { display: flex; gap: 2px; height: 0.9rem; }
.prj-pk-seg { position: relative; min-width: 2px; background: var(--prj-leistung-weich); border-radius: 2px; overflow: hidden; }
.prj-pk-seg-nicht { background: repeating-linear-gradient(135deg, var(--prj-flaeche-3) 0 4px, var(--prj-flaeche) 4px 8px); }
.prj-pk-fuell { height: 100%; background: var(--prj-leistung); }
.prj-pk-abschnitte { list-style: none; margin: 0; padding: 0; font-size: 0.82rem; }
.prj-pk-abschnitte li { display: flex; justify-content: space-between; gap: 0.5rem; padding: 0.2rem 0; border-bottom: 1px dashed var(--prj-rand); }
.prj-pk-prozent { font-variant-numeric: tabular-nums; }
.prj-pk-termine h3 { margin: 0.3rem 0 0.2rem; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--prj-text-dim); }
.prj-pk-termine ul { list-style: none; margin: 0; padding: 0; font-size: 0.82rem; }
.prj-pk-termine li { display: flex; gap: 0.6rem; padding: 0.15rem 0; }
.prj-pk-termine li span:first-child { font-variant-numeric: tabular-nums; color: var(--prj-text-dim); }
.prj-pk-ueberfaellig { color: var(--prj-warn); font-weight: 600; }
.prj-pk-fuss { font-size: 0.72rem; color: var(--prj-text-dim); }
</style>
