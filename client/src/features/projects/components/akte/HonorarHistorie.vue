<template>
  <ProjektKarte titel="Honorarhistorie" icon="geld">
    <LeerHinweis v-if="!historie.length" text="Noch keine Honoraränderung." />
    <ul v-else class="prj-historie">
      <li v-for="h in historie" :key="h.id">
        <span class="prj-datum">{{ datum(h.am) }}</span>
        <span class="prj-abschnitt">{{ h.abschnitt }}</span>
        <span class="prj-betrag">{{ centAlsEuro(h.alt_cent) }} → <strong>{{ centAlsEuro(h.neu_cent) }}</strong></span>
        <span class="prj-grund">{{ h.grund }} · {{ h.akteur }}</span>
      </li>
    </ul>
  </ProjektKarte>
</template>

<script setup>
// HonorarHistorie — append-only: Angebot → Auftrag → Nachtrag bleibt nachvollziehbar.
import { centAlsEuro } from '@/features/kleiner-pedant/services/Geld';
import LeerHinweis from '../ui/LeerHinweis.vue';
import ProjektKarte from '../ui/ProjektKarte.vue';
import { datum as datumFormat } from '../../services/Phasen';

defineProps({ historie: { type: Array, default: () => [] } });
const datum = (iso) => datumFormat(String(iso || '').slice(0, 10));
</script>

<style scoped>
.prj-historie { list-style: none; margin: 0; padding: 0; max-height: 18rem; overflow: auto; }
.prj-historie li {
  display: grid;
  grid-template-columns: 6rem 1fr auto;
  gap: 0.2rem 0.6rem;
  padding: 0.35rem 0;
  border-bottom: 1px dashed var(--prj-rand);
  font-size: 0.8rem;
}
.prj-datum { font-variant-numeric: tabular-nums; color: var(--prj-text-dim); }
.prj-betrag { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.prj-grund { grid-column: 2 / 4; color: var(--prj-text-dim); font-size: 0.74rem; }
</style>
