<template>
  <ProjektKarte v-if="vorschlaege.length" titel="Vorschläge der KI" icon="dossier">
    <ul class="prj-vorschlaege">
      <li v-for="v in vorschlaege" :key="v.id">
        <div class="prj-v-kopf">
          <span class="prj-v-art">{{ artTitel(v.art) }}</span>
          <span class="prj-v-von">von {{ v.von }} · {{ datum(String(v.angelegt_am).slice(0, 10)) }}</span>
        </div>
        <div class="prj-v-inhalt">{{ zusammenfassung(v) }}</div>
        <div v-if="v.begruendung" class="prj-v-grund">{{ v.begruendung }}</div>
        <div class="prj-v-aktionen">
          <button type="button" class="prj-knopf prj-knopf-primaer" @click="$emit('entscheiden', v.id, 'uebernehmen')">
            <ProjektIcon name="ok" :size="13" /> Übernehmen
          </button>
          <button type="button" class="prj-knopf" @click="$emit('entscheiden', v.id, 'verwerfen')">
            <ProjektIcon name="schliessen" :size="13" /> Verwerfen
          </button>
        </div>
      </li>
    </ul>
  </ProjektKarte>
</template>

<script setup>
// VorschlaegeKarte — offene KI-Vorschläge; nur ein Mensch übernimmt oder verwirft.
import ProjektIcon from '../ui/ProjektIcon.vue';
import ProjektKarte from '../ui/ProjektKarte.vue';
import { datum } from '../../services/Phasen';

const ARTEN = { aufgabe: 'Aufgabe', notiz: 'Notiz', termin: 'Termin', fortschritt: 'Fortschritt', zeitbuchung: 'Zeitbuchung' };

defineProps({ vorschlaege: { type: Array, default: () => [] } });
defineEmits(['entscheiden']);

const artTitel = (a) => ARTEN[a] || a;

function zusammenfassung(v) {
  const n = v.nutzlast || {};
  switch (v.art) {
    case 'termin': return `${n.art || 'termin'}: ${n.bezeichnung || ''} am ${datum(n.faellig_am)}`;
    case 'fortschritt': return `Abschnitt ${n.abschnitt_id} auf ${n.fortschritt_prozent} %`;
    case 'notiz': return n.text || '';
    case 'aufgabe': return `${n.titel || ''}${n.faellig_am ? ` bis ${datum(n.faellig_am)}` : ''} (Aufgabenliste kommt mit Stufe 3)`;
    default: return JSON.stringify(n);
  }
}
</script>

<style scoped>
.prj-vorschlaege { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.6rem; }
.prj-vorschlaege li { padding: 0.6rem 0.7rem; border: 1px dashed var(--prj-akzent); border-radius: 6px; background: var(--prj-akzent-weich); }
.prj-v-kopf { display: flex; justify-content: space-between; gap: 0.5rem; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--prj-text-dim); }
.prj-v-art { font-weight: 700; color: var(--prj-akzent); }
.prj-v-inhalt { margin-top: 0.25rem; font-size: 0.88rem; font-weight: 600; }
.prj-v-grund { font-size: 0.8rem; color: var(--prj-text-dim); }
.prj-v-aktionen { display: flex; gap: 0.4rem; margin-top: 0.5rem; }
</style>
