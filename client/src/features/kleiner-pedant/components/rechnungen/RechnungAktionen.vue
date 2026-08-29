<template>
  <div class="ped-aktionen">
    <h4><PedantIcon name="freigeben" :size="14" /> Gestellt — {{ rechnung.rechnungsnummer }}</h4>
    <div class="ped-aktionen-reihe">
      <button class="ped-aktion" type="button" @click="ladeDatei('xml')">
        <PedantIcon name="herunterladen" :size="14" /> XRechnung (XML)
      </button>
      <button class="ped-aktion" type="button" @click="ladeDatei('bericht')">
        <PedantIcon name="pruefen" :size="14" /> Prüfbericht
      </button>
    </div>

    <div class="ped-aktionen-reihe">
      <select v-model="weg">
        <option value="zre_rlp">ZRE Rheinland-Pfalz</option>
        <option value="zre_bw">ZRE Baden-Württemberg</option>
      </select>
      <button class="ped-aktion" type="button" :disabled="arbeitet" @click="versandVermerken">
        <PedantIcon name="stellen" :size="14" />
        {{ rechnung.versand_am ? 'Versand aktualisieren' : 'Versand vermerken' }}
      </button>
    </div>
    <p v-if="rechnung.versand_am" class="ped-hinweis">
      Versandt {{ new Date(rechnung.versand_am).toLocaleDateString('de-DE') }}
      über {{ rechnung.versand_weg === 'zre_rlp' ? 'ZRE RLP' : 'ZRE BW' }}
    </p>

    <button class="ped-aktion" type="button" :disabled="arbeitet" @click="bezahltUmschalten">
      <PedantIcon name="ok" :size="14" />
      {{ rechnung.status === 'bezahlt' ? 'Bezahlt zurücknehmen' : 'Als bezahlt markieren' }}
    </button>
    <p v-if="rechnung.status === 'bezahlt'" class="ped-hinweis">
      Bezahlt am {{ new Date(rechnung.bezahlt_am).toLocaleDateString('de-DE') }}
    </p>
  </div>
</template>

<script setup>
// RechnungAktionen — alles NACH dem Stellen: Downloads (Blob mit Bearer ueber
// die Api, dann Objekt-URL), Versand-Vermerk, manuelles Bezahlt (bis Phase 5).
import { ref } from 'vue';
import PedantApi from '../../services/PedantApi';
import { useRechnungStore } from '../../stores/useRechnungStore';
import PedantIcon from '../ui/PedantIcon.vue';

const props = defineProps({
  rechnung: { type: Object, required: true },
});

const store = useRechnungStore();
const weg = ref(props.rechnung.versand_weg || 'zre_rlp');
const arbeitet = ref(false);

async function ladeDatei(art) {
  const blob = art === 'xml'
    ? await PedantApi.rechnungXml(props.rechnung.id)
    : await PedantApi.rechnungBericht(props.rechnung.id);
  const url = URL.createObjectURL(blob);
  const anker = document.createElement('a');
  anker.href = url;
  anker.download = art === 'xml'
    ? `${props.rechnung.rechnungsnummer}.xml`
    : `${props.rechnung.rechnungsnummer}-pruefbericht.html`;
  anker.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

async function versandVermerken() {
  arbeitet.value = true;
  try {
    await store.versand(props.rechnung.id, weg.value);
  } catch { /* store.fehler zeigt es */ } finally {
    arbeitet.value = false;
  }
}

async function bezahltUmschalten() {
  arbeitet.value = true;
  try {
    await store.bezahlt(props.rechnung.id, props.rechnung.status !== 'bezahlt');
  } catch { /* store.fehler zeigt es */ } finally {
    arbeitet.value = false;
  }
}
</script>

<style scoped>
.ped-aktionen {
  display: flex; flex-direction: column; gap: 0.55rem;
  padding: 0.8rem; border: 1px solid var(--ped-akzent);
  border-radius: 8px; background: var(--ped-akzent-weich);
}
.ped-aktionen h4 {
  display: flex; align-items: center; gap: 0.4rem;
  margin: 0; font-size: 0.85rem; color: var(--ped-akzent);
}
.ped-aktionen-reihe { display: flex; gap: 0.5rem; flex-wrap: wrap; }
.ped-aktionen select {
  padding: 0.35rem 0.5rem; border: 1px solid var(--ped-rand-stark);
  border-radius: 6px; background: var(--ped-flaeche);
  color: var(--ped-text); font-size: 0.8rem;
}
.ped-aktion {
  display: inline-flex; align-items: center; gap: 0.35rem;
  padding: 0.4rem 0.7rem; border: 1px solid var(--ped-rand-stark);
  border-radius: 6px; background: var(--ped-flaeche);
  color: var(--ped-text); font-size: 0.8rem; cursor: pointer;
}
.ped-aktion:hover { border-color: var(--ped-akzent); color: var(--ped-akzent); }
.ped-aktion:disabled { opacity: 0.6; }
.ped-hinweis { margin: 0; font-size: 0.76rem; color: var(--ped-text-dim); }
</style>
