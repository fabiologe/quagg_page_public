<template>
  <router-link :to="`/intern/projects/${projekt.id}`" class="prj-kachel">
    <div class="prj-kachel-kopf">
      <span class="prj-kachel-nr">#P{{ projekt.id }}</span>
      <PhasenPille :phase="projekt.phase" />
    </div>
    <h3 class="prj-kachel-name">{{ projekt.name }}</h3>
    <div class="prj-kachel-balken">
      <div class="prj-kachel-balken-zeile">
        <span>Leistung</span>
        <span class="prj-kachel-prozent">{{ projekt.fortschritt?.prozent ?? 0 }} %</span>
      </div>
      <MiniLeiste :fortschritt="projekt.fortschritt" />
    </div>
    <dl class="prj-kachel-fakten">
      <div><dt>Unabgerechnet</dt><dd :class="{ 'prj-unabgerechnet': projekt.geld?.unabgerechnet_cent > 0 }">{{ centAlsEuro(projekt.geld?.unabgerechnet_cent ?? 0) }}</dd></div>
      <div>
        <dt>Nächster Termin</dt>
        <dd :class="`prj-termin-${dringlichkeit(projekt.naechster_termin) || 'keiner'}`">
          {{ datum(projekt.naechster_termin) }}
        </dd>
      </div>
    </dl>
    <p v-if="projekt.aufgaben?.offen" class="prj-kachel-aufgaben" :class="{ 'prj-kachel-warnung': projekt.aufgaben.ueberfaellig }">
      <ProjektIcon name="aufgaben" :size="13" /> {{ projekt.aufgaben.offen }} offen<template v-if="projekt.aufgaben.ueberfaellig">, {{ projekt.aufgaben.ueberfaellig }} überfällig</template>
    </p>
    <p v-if="!projekt.ordner_vorhanden" class="prj-kachel-warnung">
      <ProjektIcon name="warnung" :size="13" /> Ordner fehlt auf der StorageBox
    </p>
  </router-link>
</template>

<script setup>
// ProjektKachel — eine Karte je Projekt im Portfolio; der Mini-Balken zeigt
// die Leistung aus dem Portfolio-Endpunkt (eine Zahl je Projekt, keine Abschnitte).
import MiniLeiste from '../ui/MiniLeiste.vue';
import ProjektIcon from '../ui/ProjektIcon.vue';
import PhasenPille from '../ui/PhasenPille.vue';
import { centAlsEuro } from '@/features/kleiner-pedant/services/Geld';
import { datum, dringlichkeit } from '../../services/Phasen';

defineProps({ projekt: { type: Object, required: true } });
</script>

<style scoped>
.prj-kachel {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.85rem 1rem;
  border: 1px solid var(--prj-rand);
  border-radius: 8px;
  background: var(--prj-flaeche);
  color: var(--prj-text);
  text-decoration: none;
  box-shadow: var(--prj-schatten);
}
.prj-kachel:hover { border-color: var(--prj-akzent); }
.prj-kachel-kopf {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
}
.prj-kachel-nr {
  font-family: var(--prj-mono);
  font-size: 0.78rem;
  color: var(--prj-text-dim);
}
.prj-kachel-name {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  line-height: 1.25;
}
.prj-kachel-balken { display: flex; flex-direction: column; gap: 0.25rem; }
.prj-kachel-balken-zeile { display: flex; justify-content: space-between; font-size: 0.7rem; color: var(--prj-text-dim); text-transform: uppercase; letter-spacing: 0.04em; }
.prj-kachel-prozent { font-variant-numeric: tabular-nums; color: var(--prj-text); font-weight: 600; }
.prj-kachel-fakten {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
  margin: 0;
}
.prj-kachel-fakten dt {
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--prj-text-dim);
}
.prj-kachel-fakten dd {
  margin: 0;
  font-size: 0.85rem;
  font-variant-numeric: tabular-nums;
}
.prj-unabgerechnet { color: var(--prj-warn); font-weight: 600; }
.prj-termin-ueberfaellig { color: var(--prj-fehler); font-weight: 600; }
.prj-termin-bald { color: var(--prj-warn); font-weight: 600; }
.prj-kachel-aufgaben { display: flex; align-items: center; gap: 0.3rem; margin: 0; font-size: 0.78rem; color: var(--prj-text-dim); }
.prj-kachel-warnung {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  margin: 0;
  font-size: 0.78rem;
  color: var(--prj-warn);
}
</style>
