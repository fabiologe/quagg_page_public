<template>
  <PedantModal titel="Rechnung stellen" icon="stellen" @schliessen="$emit('schliessen')">
    <div class="ped-stellen">
      <p class="ped-stellen-satz">
        Beim Stellen wird die Rechnungsnummer endgültig vergeben, die XRechnung
        erzeugt, gegen den KoSIT-Validator geprüft und die Forderung gebucht —
        danach ist die Rechnung unveränderlich.
      </p>

      <div v-if="pruefung === null" class="ped-stellen-laedt">
        <PedantIcon name="laden" :size="16" /> Vorprüfung läuft…
      </div>

      <template v-else>
        <div class="ped-punkt">
          <StatusPille :zustand="pruefung.pflichtfelder_ok ? 'ok' : 'fehler'"
                       :text="pruefung.pflichtfelder_ok ? 'Pflichtfelder vollständig' : 'Pflichtfelder unvollständig'" />
        </div>
        <ul v-if="pruefung.fehler.length" class="ped-meldungen">
          <li v-for="(fehler, index) in pruefung.fehler" :key="index">{{ fehler }}</li>
        </ul>

        <div v-if="pruefung.validator" class="ped-punkt">
          <StatusPille :zustand="pruefung.validator.valide ? 'ok' : 'fehler'"
                       :text="pruefung.validator.valide ? 'KoSIT-Validator: valide' : 'KoSIT-Validator: abgelehnt'" />
        </div>
        <ul v-if="pruefung.validator && !pruefung.validator.valide" class="ped-meldungen">
          <li v-for="(meldung, index) in pruefung.validator.meldungen" :key="index">{{ meldung }}</li>
        </ul>

        <ul v-if="store.meldungen.length" class="ped-meldungen">
          <li v-for="(meldung, index) in store.meldungen" :key="index">{{ meldung }}</li>
        </ul>
        <p v-if="store.fehler" class="ped-stellen-fehler">{{ store.fehler }}</p>
      </template>
    </div>

    <template #fuss>
      <button class="ped-abbruch" type="button" @click="$emit('schliessen')">Abbrechen</button>
      <button class="ped-los" type="button" :disabled="!bereit || sendet" @click="stellen">
        <PedantIcon :name="sendet ? 'laden' : 'stellen'" :size="14" />
        {{ sendet ? 'Stellt…' : 'Jetzt stellen' }}
      </button>
    </template>
  </PedantModal>
</template>

<script setup>
// StellenDialog — Vorpruefung (Pflichtfelder + KoSIT-Probelauf) und der
// eigentliche Stellen-Schritt. Der Probelauf verbraucht KEINE Nummer.
import { onMounted, ref } from 'vue';
import { useRechnungStore } from '../../stores/useRechnungStore';
import PedantIcon from '../ui/PedantIcon.vue';
import PedantModal from '../ui/PedantModal.vue';
import StatusPille from '../ui/StatusPille.vue';

const props = defineProps({
  rechnungId: { type: Number, required: true },
});
const emit = defineEmits(['schliessen', 'gestellt']);

const store = useRechnungStore();
const pruefung = ref(null);
const sendet = ref(false);
const bereit = ref(false);

onMounted(async () => {
  try {
    pruefung.value = await store.vorpruefung(props.rechnungId, true);
    bereit.value = pruefung.value.pflichtfelder_ok
      && (pruefung.value.validator?.valide ?? false);
  } catch {
    pruefung.value = { pflichtfelder_ok: false, fehler: [store.fehler], validator: null };
  }
});

async function stellen() {
  sendet.value = true;
  try {
    const ergebnis = await store.stellen(props.rechnungId);
    emit('gestellt', ergebnis);
    emit('schliessen');
  } catch {
    // store.fehler/meldungen werden oben angezeigt
  } finally {
    sendet.value = false;
  }
}
</script>

<style scoped>
.ped-stellen { display: flex; flex-direction: column; gap: 0.6rem; }
.ped-stellen-satz { margin: 0; font-size: 0.8rem; color: var(--ped-text-dim); }
.ped-stellen-laedt {
  display: flex; align-items: center; gap: 0.4rem;
  color: var(--ped-text-dim); font-size: 0.82rem;
}
.ped-punkt { display: flex; }
.ped-meldungen {
  margin: 0; padding: 0.5rem 0.6rem 0.5rem 1.6rem;
  border-radius: 6px; background: var(--ped-fehler-weich);
  color: var(--ped-fehler); font-size: 0.78rem;
}
.ped-stellen-fehler {
  margin: 0; padding: 0.45rem 0.6rem; border-radius: 6px;
  background: var(--ped-fehler-weich); color: var(--ped-fehler); font-size: 0.8rem;
}
.ped-abbruch {
  padding: 0.45rem 0.9rem; border: 1px solid var(--ped-rand-stark);
  border-radius: 6px; background: var(--ped-flaeche);
  color: var(--ped-text); cursor: pointer;
}
.ped-los {
  display: inline-flex; align-items: center; gap: 0.4rem;
  padding: 0.45rem 0.9rem; border: none; border-radius: 6px;
  background: var(--ped-akzent); color: var(--ped-akzent-kontrast);
  font-weight: 600; cursor: pointer;
}
.ped-los:hover { background: var(--ped-akzent-hover); }
.ped-los:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
