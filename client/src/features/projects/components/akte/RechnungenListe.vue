<template>
  <ProjektKarte titel="Rechnungen des Projekts" icon="rechnung">
    <LeerHinweis v-if="!rechnungen.length" text="Noch keine Rechnung mit diesem Projektbezug." />
    <ul v-else class="prj-liste">
      <li v-for="r in rechnungen" :key="r.id">
        <router-link :to="`/intern/pedant?tab=rechnungen&rechnung=${r.id}`" class="prj-nr">{{ r.rechnungsnummer || `Entwurf #${r.id}` }}</router-link>
        <span class="prj-typ">{{ r.rechnungstyp === '326' ? 'Abschlag' : (r.vorab_cent ? 'Schluss' : 'Rechnung') }}<template v-if="r.abgerechnet_in_schluss"> · in Schluss</template></span>
        <span class="prj-status" :class="`prj-status-${r.status}`">{{ r.status }}</span>
        <span class="prj-datum">{{ datum(r.rechnungsdatum) }}</span>
        <span class="prj-betrag">{{ centAlsEuro(r.netto_cent || 0) }} netto</span>
      </li>
    </ul>
  </ProjektKarte>
</template>

<script setup>
// RechnungenListe — Rechnungen mit projekt_id aus dem Pedanten; Klick öffnet sie dort.
import { centAlsEuro } from '@/features/kleiner-pedant/services/Geld';
import LeerHinweis from '../ui/LeerHinweis.vue';
import ProjektKarte from '../ui/ProjektKarte.vue';
import { datum } from '../../services/Phasen';

defineProps({ rechnungen: { type: Array, default: () => [] } });
</script>

<style scoped>
.prj-liste { list-style: none; margin: 0; padding: 0; }
.prj-liste li { display: grid; grid-template-columns: 1fr auto auto auto auto; align-items: center; gap: 0.6rem; padding: 0.4rem 0; border-bottom: 1px dashed var(--prj-rand); font-size: 0.85rem; }
.prj-typ { font-size: 0.72rem; color: var(--prj-text-dim); white-space: nowrap; }
.prj-nr { color: var(--prj-akzent); font-weight: 600; text-decoration: none; }
.prj-status { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--prj-text-dim); }
.prj-status-gestellt { color: var(--prj-akzent); }
.prj-status-bezahlt { color: var(--prj-leistung); }
.prj-status-verworfen { color: var(--prj-fehler); }
.prj-datum, .prj-betrag { font-variant-numeric: tabular-nums; white-space: nowrap; }
</style>
