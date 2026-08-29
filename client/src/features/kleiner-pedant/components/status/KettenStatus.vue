<template>
  <PedantKarte titel="Hash-Kette" icon="kette">
    <template #aktionen>
      <button class="ped-pruefen" type="button" :disabled="prueft" @click="pruefen">
        <PedantIcon :name="prueft ? 'laden' : 'pruefen'" :size="14" />
        {{ prueft ? 'Prüft…' : 'Jetzt prüfen' }}
      </button>
    </template>

    <div v-if="store.kette" class="ped-kette">
      <StatusPille
        :zustand="store.kette.ok ? 'ok' : 'fehler'"
        :text="store.kette.ok ? 'Kette intakt' : 'KETTENBRUCH'"
      />
      <p class="ped-kette-detail">
        {{ store.kette.zeilen_geprueft }} Zeilen geprüft.
        <template v-if="!store.kette.ok">
          Bruch bei Nr. {{ store.kette.bruch_bei_nr }}: {{ store.kette.grund }}
        </template>
      </p>
    </div>
    <LeerHinweis v-else text="Noch nicht geprüft" />
  </PedantKarte>
</template>

<script setup>
// KettenStatus — Ergebnis von /kette plus Knopf zum Nachrechnen.
import { ref } from 'vue';
import { useJournalStore } from '../../stores/useJournalStore';
import LeerHinweis from '../ui/LeerHinweis.vue';
import PedantIcon from '../ui/PedantIcon.vue';
import PedantKarte from '../ui/PedantKarte.vue';
import StatusPille from '../ui/StatusPille.vue';

const store = useJournalStore();
const prueft = ref(false);

async function pruefen() {
  prueft.value = true;
  await store.ladeKette();
  prueft.value = false;
}
</script>

<style scoped>
.ped-pruefen {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.3rem 0.6rem;
  border: 1px solid var(--ped-rand-stark);
  border-radius: 6px;
  background: var(--ped-flaeche);
  color: var(--ped-text);
  font-size: 0.78rem;
  cursor: pointer;
}
.ped-pruefen:hover { border-color: var(--ped-akzent); color: var(--ped-akzent); }
.ped-pruefen:disabled { opacity: 0.6; cursor: wait; }
.ped-kette {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}
.ped-kette-detail {
  margin: 0;
  font-size: 0.8rem;
  color: var(--ped-text-dim);
}
</style>
