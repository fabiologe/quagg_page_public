<template>
  <Teleport to="body">
    <div class="ped-schleier" @click.self="$emit('schliessen')">
      <div class="ped-dialog" role="dialog" aria-modal="true">
        <header class="ped-dialog-kopf">
          <h3><PedantIcon name="storno" :size="15" /> Buchung {{ buchung.lfd_nr }} stornieren</h3>
          <button class="ped-zu" type="button" @click="$emit('schliessen')">
            <PedantIcon name="schliessen" :size="15" />
          </button>
        </header>

        <p class="ped-dialog-text">
          Es wird eine Gegenbuchung angelegt ({{ buchung.habenkonto }} an
          {{ buchung.sollkonto }},
          <GeldBetrag :cent="buchung.betrag_cent" />).
          Die Originalbuchung bleibt unverändert bestehen.
        </p>

        <label class="ped-grund">
          <span>Grund</span>
          <textarea v-model="grund" rows="2" placeholder="Warum wird storniert?" />
        </label>

        <p v-if="serverFehler" class="ped-dialog-fehler">{{ serverFehler }}</p>

        <footer class="ped-dialog-fuss">
          <button class="ped-abbrechen" type="button" @click="$emit('schliessen')">
            Abbrechen
          </button>
          <button
            class="ped-bestaetigen"
            type="button"
            :disabled="!grund.trim() || sendet"
            @click="stornieren"
          >
            {{ sendet ? 'Storniert…' : 'Gegenbuchung anlegen' }}
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
// StornoDialog — erfasst den Grund und laesst den Store die Gegenbuchung anlegen.
// Teleport unter <body>; die --ped-Tokens liegen deshalb auf :root.
import { ref } from 'vue';
import { useJournalStore } from '../../stores/useJournalStore';
import GeldBetrag from '../ui/GeldBetrag.vue';
import PedantIcon from '../ui/PedantIcon.vue';

const props = defineProps({
  buchung: { type: Object, required: true },
});
const emit = defineEmits(['schliessen']);

const store = useJournalStore();
const grund = ref('');
const sendet = ref(false);
const serverFehler = ref('');

async function stornieren() {
  sendet.value = true;
  serverFehler.value = '';
  try {
    await store.storniere(props.buchung.lfd_nr, grund.value.trim());
    emit('schliessen');
  } catch (error) {
    serverFehler.value = error.message;
  } finally {
    sendet.value = false;
  }
}
</script>

<style scoped>
.ped-schleier {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: grid;
  place-items: center;
  background: var(--ped-schleier);
}
.ped-dialog {
  width: min(30rem, calc(100vw - 2rem));
  background: var(--ped-flaeche);
  border: 1px solid var(--ped-rand-stark);
  border-radius: 10px;
  box-shadow: var(--ped-schatten);
  padding: 1rem;
  color: var(--ped-text);
}
.ped-dialog-kopf {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.ped-dialog-kopf h3 {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0;
  font-size: 0.95rem;
}
.ped-zu {
  border: none;
  background: none;
  color: var(--ped-text-dim);
  cursor: pointer;
}
.ped-dialog-text {
  font-size: 0.82rem;
  color: var(--ped-text-dim);
}
.ped-grund {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.78rem;
  color: var(--ped-text-dim);
}
.ped-grund textarea {
  padding: 0.45rem 0.55rem;
  border: 1px solid var(--ped-rand-stark);
  border-radius: 6px;
  background: var(--ped-flaeche);
  color: var(--ped-text);
  font-size: 0.82rem;
  resize: vertical;
}
.ped-dialog-fehler {
  margin: 0.6rem 0 0;
  padding: 0.5rem 0.65rem;
  border-radius: 6px;
  background: var(--ped-fehler-weich);
  color: var(--ped-fehler);
  font-size: 0.8rem;
}
.ped-dialog-fuss {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 1rem;
}
.ped-abbrechen {
  padding: 0.45rem 0.9rem;
  border: 1px solid var(--ped-rand-stark);
  border-radius: 6px;
  background: var(--ped-flaeche);
  color: var(--ped-text);
  cursor: pointer;
}
.ped-bestaetigen {
  padding: 0.45rem 0.9rem;
  border: none;
  border-radius: 6px;
  background: var(--ped-fehler);
  color: var(--ped-text-invers);
  font-weight: 600;
  cursor: pointer;
}
.ped-bestaetigen:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
