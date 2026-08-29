<template>
  <PedantKarte titel="Systemzustand" icon="status">
    <dl v-if="store.status" class="ped-status">
      <div class="ped-status-zeile">
        <dt>Datenbank</dt>
        <dd>
          <StatusPille
            :zustand="store.dbSteht ? 'ok' : 'fehler'"
            :text="store.dbSteht ? 'erreichbar' : 'nicht erreichbar'"
          />
        </dd>
      </div>
      <div class="ped-status-zeile">
        <dt>Umgebung</dt>
        <dd>
          <StatusPille
            :zustand="store.status.umgebung === 'prod' ? 'ok' : 'warnung'"
            :text="store.status.umgebung"
          />
        </dd>
      </div>
      <div class="ped-status-zeile">
        <dt>KoSIT-Validator</dt>
        <dd>
          <StatusPille
            :zustand="store.status.kosit_bereit ? 'ok' : 'warnung'"
            :text="store.status.kosit_bereit ? 'bereit' : 'fehlt'"
          />
        </dd>
      </div>
      <template v-if="store.dbSteht">
        <div class="ped-status-zeile">
          <dt>Buchungen</dt>
          <dd class="ped-status-zahl">{{ store.status.anzahl_buchungen }}</dd>
        </div>
        <div class="ped-status-zeile">
          <dt>Letzte lfd. Nr.</dt>
          <dd class="ped-status-zahl">{{ store.status.lfd_nr_letzte }}</dd>
        </div>
        <div class="ped-status-zeile">
          <dt>Aktive Konten (SKR04)</dt>
          <dd class="ped-status-zahl">{{ store.status.anzahl_konten }}</dd>
        </div>
      </template>
    </dl>
    <LeerHinweis v-else text="Status wird geladen…" />
  </PedantKarte>
</template>

<script setup>
// StatusKarte — reine Anzeige des /status-Endpunkts, Daten aus dem Store.
import { useJournalStore } from '../../stores/useJournalStore';
import LeerHinweis from '../ui/LeerHinweis.vue';
import PedantKarte from '../ui/PedantKarte.vue';
import StatusPille from '../ui/StatusPille.vue';

const store = useJournalStore();
</script>

<style scoped>
.ped-status {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  margin: 0;
}
.ped-status-zeile {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
}
.ped-status-zeile dt {
  font-size: 0.8rem;
  color: var(--ped-text-dim);
}
.ped-status-zeile dd {
  margin: 0;
}
.ped-status-zahl {
  font-family: var(--ped-mono);
  font-variant-numeric: tabular-nums;
  color: var(--ped-text);
}
</style>
