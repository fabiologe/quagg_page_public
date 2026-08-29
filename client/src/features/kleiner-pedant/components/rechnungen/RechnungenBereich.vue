<template>
  <div class="ped-bereich">
    <p v-if="stammdaten.fehler" class="ped-bereich-fehler">{{ stammdaten.fehler }}</p>

    <RechnungsFormular v-if="store.aktiveRechnung" :rechnung="store.aktiveRechnung" />

    <template v-else>
      <div class="ped-bereich-spalten">
        <RechnungsListe class="ped-breit" @neu="neuerEntwurf" />
        <div class="ped-stapel">
          <FirmendatenKarte />
          <AuftraggeberVerwaltung />
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
// RechnungenBereich — Tab-Wurzel: Liste+Stammdaten oder die aktive Rechnung.
import { onMounted } from 'vue';
import { useRechnungStore } from '../../stores/useRechnungStore';
import { useStammdatenStore } from '../../stores/useStammdatenStore';
import AuftraggeberVerwaltung from './AuftraggeberVerwaltung.vue';
import FirmendatenKarte from './FirmendatenKarte.vue';
import RechnungsFormular from './RechnungsFormular.vue';
import RechnungsListe from './RechnungsListe.vue';

const store = useRechnungStore();
const stammdaten = useStammdatenStore();

onMounted(() => {
  stammdaten.ladeAlles();
  store.ladeRechnungen();
});

async function neuerEntwurf() {
  const erster = stammdaten.auftraggeber[0];
  if (!erster) {
    stammdaten.fehler = 'Erst einen Auftraggeber anlegen';
    return;
  }
  const heute = new Date().toISOString().slice(0, 10);
  const monatsanfang = `${heute.slice(0, 8)}01`;
  try {
    await store.legeAn({
      auftraggeber_id: erster.id, rechnungsdatum: heute,
      leistung_von: monatsanfang, leistung_bis: heute, zahlungsziel_tage: 30,
    });
  } catch { /* store.fehler wird gezeigt */ }
}
</script>

<style scoped>
.ped-bereich { display: flex; flex-direction: column; gap: 1rem; }
.ped-bereich-fehler {
  margin: 0; padding: 0.5rem 0.7rem; border-radius: 6px;
  background: var(--ped-fehler-weich); color: var(--ped-fehler); font-size: 0.82rem;
}
.ped-bereich-spalten {
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(20rem, 2fr);
  gap: 1rem;
  align-items: start;
}
.ped-breit { min-width: 0; }
.ped-stapel { display: flex; flex-direction: column; gap: 1rem; }
@media (max-width: 64rem) {
  .ped-bereich-spalten { grid-template-columns: 1fr; }
}
</style>
