<template>
  <div class="ped-geld">
    <p v-if="store.fehler" class="ped-geld-fehler">{{ store.fehler }}</p>

    <div class="ped-geld-kacheln">
      <SichtKarte
        titel="Bezahlt"
        :summe-cent="store.sichten?.bezahlt.summe_cent ?? 0"
        :anzahl="store.sichten?.bezahlt.anzahl ?? 0"
        einzahl="Rechnung" mehrzahl="Rechnungen"
        farbe="--ped-chart-bezahlt"
      />
      <SichtKarte
        titel="Gestellt, offen"
        :summe-cent="store.sichten?.offen.summe_cent ?? 0"
        :anzahl="store.sichten?.offen.anzahl ?? 0"
        einzahl="Rechnung" mehrzahl="Rechnungen"
        :detail="ueberfaelligText"
        farbe="--ped-chart-offen"
      />
      <SichtKarte
        titel="Kommend, nicht gestellt"
        :summe-cent="store.sichten?.kommend.summe_cent ?? 0"
        :anzahl="store.sichten?.kommend.anzahl ?? 0"
        einzahl="Vorhaben" mehrzahl="Vorhaben"
        farbe="--ped-chart-kommend"
      />
    </div>

    <MonatsBalken :reihe="store.reihe" />
    <ErwartetesGeld />
  </div>
</template>

<script setup>
// GeldBereich — Tab-Wurzel Phase 4: drei Sicht-Kacheln (FAHRPLAN Kap. 6),
// die einfache Monats-Timeline und die Planungsliste erwarteten Geldes.
import { computed, onMounted } from 'vue';
import { centAlsEuro } from '../../services/Geld';
import { useGeldStore } from '../../stores/useGeldStore';
import ErwartetesGeld from './ErwartetesGeld.vue';
import MonatsBalken from './MonatsBalken.vue';
import SichtKarte from './SichtKarte.vue';

const store = useGeldStore();

const ueberfaelligText = computed(() => {
  const offen = store.sichten?.offen;
  if (!offen?.ueberfaellig_anzahl) return '';
  return `davon überfällig: ${offen.ueberfaellig_anzahl} (${centAlsEuro(offen.ueberfaellig_cent)})`;
});

onMounted(() => store.ladeAlles());
</script>

<style scoped>
.ped-geld {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.ped-geld-fehler {
  margin: 0;
  padding: 0.5rem 0.7rem;
  border-radius: 6px;
  background: var(--ped-fehler-weich);
  color: var(--ped-fehler);
  font-size: 0.82rem;
}
.ped-geld-kacheln {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
  gap: 1rem;
}
</style>
