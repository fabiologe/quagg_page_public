<template>
  <CdeDialog :offen="offen" titel="Neuer Satz" icon="add" @close="$emit('close')">
    <div class="sn-rumpf">
      <label class="sn-feld">
        <span>Name</span>
        <input
          ref="feld"
          v-model="name"
          type="text"
          class="sn-name"
          placeholder="z. B. „Variante Nord“"
          @keydown.enter.prevent="anlegen"
        />
      </label>

      <fieldset class="sn-wahl">
        <legend>Womit beginnt er?</legend>
        <label class="sn-option" :class="{ aus: !kopierbar }">
          <input v-model="art" type="radio" value="kopie" :disabled="!kopierbar" />
          <span class="sn-text">
            <strong>Kopie von „{{ vonName }}“</strong>
            <small v-if="kopierbar">
              Dieselben Modelle und der ganze Verlauf ({{ versionenText }}). Danach gehen beide Sätze getrennte Wege.
            </small>
            <small v-else>„{{ vonName || 'Der aktive Satz' }}“ hat noch keinen Verlauf.</small>
          </span>
        </label>
        <label class="sn-option">
          <input v-model="art" type="radio" value="neu" />
          <span class="sn-text">
            <strong>Neu beginnen</strong>
            <small>Dieselben Modelle, ohne Verlauf.</small>
          </span>
        </label>
      </fieldset>
      <p v-if="fehler" class="sn-fehler">{{ fehler }}</p>
    </div>

    <template #fuss>
      <button class="sn-btn" @click="$emit('close')">Abbrechen</button>
      <button class="sn-btn primaer" :disabled="!name.trim() || laeuft" @click="anlegen">
        <CdeIcon name="add" :size="13" /> Anlegen
      </button>
    </template>
  </CdeDialog>
</template>

<script setup>
/**
 * „+ Satz" — leer oder als Kopie (Kassensturz S5, K2).
 *
 * Bis 2026-09-19 fragte ein `prompt` nur nach dem Namen: der neue Satz bekam
 * die Modellauswahl des aktiven, seinen Verlauf aber nie — eine Variante
 * begann bei null, obwohl sie auf der bisherigen Arbeit aufbauen sollte.
 * Jetzt wählt der Nutzer. Die Kopie ist `aenderungen.kopiereSatz(von, nach)`;
 * sie läuft VOR dem Laden des neuen Satzes, damit der ihn mit Verlauf lädt.
 * Ein Satzwechsel allein kopiert weiter nichts.
 */
import { computed, nextTick, ref, watch } from 'vue';
import CdeDialog from './ui/CdeDialog.vue';
import CdeIcon from './ui/CdeIcon.vue';
import { useAenderungen } from '../stores/useAenderungen.js';
import { useCdeStore } from '../stores/useCdeStore.js';

const props = defineProps({ offen: { type: Boolean, default: false } });
const emit = defineEmits(['close', 'angelegt']);

const cde = useCdeStore();
const ae = useAenderungen();

const feld = ref(null);
const name = ref('');
const art = ref('neu');
const fehler = ref('');
const laeuft = ref(false);

const vonName = computed(() => cde.aktiverSatz?.name ?? '');
const kopierbar = computed(() => !!cde.aktiverSatzId && ae.satzVersionen > 0);
const versionenText = computed(() => `${ae.satzVersionen} Version${ae.satzVersionen === 1 ? '' : 'en'}`);

watch(() => props.offen, (offen) => {
  if (!offen) return;
  name.value = '';
  fehler.value = '';
  // Hat der aktive Satz einen Verlauf, ist die Kopie das Naheliegende —
  // eine Variante baut auf der bisherigen Arbeit auf.
  art.value = kopierbar.value ? 'kopie' : 'neu';
  nextTick(() => feld.value?.focus());
}, { immediate: true });

async function anlegen() {
  const n = name.value.trim();
  if (!n || laeuft.value) return;
  laeuft.value = true;
  fehler.value = '';
  const von = cde.aktiverSatzId;
  const kopie = art.value === 'kopie' && kopierbar.value;
  try {
    // Wie `git branch`: dieselbe Modellauswahl — und auf Wunsch der Verlauf.
    const satz = await cde.satzAnlegen({ name: n, enthaelt: cde.aktiverSatz?.enthaelt ?? [] });
    // Der Satz STEHT schon; scheitert nur die Kopie (Server unerreichbar —
    // `kopiereSatz` wirft dann, statt über einen Verlauf zu schreiben), sagt
    // es die Warnung unten, nicht die Fehlermeldung „nicht angelegt".
    const kopiert = kopie ? await ae.kopiereSatz(von, satz.id).catch(() => 0) : 0;
    await ae.setzeSatz(cde.aktiverSatzId);
    emit('angelegt', {
      satz, kopiert,
      // Gewollt und nicht gekommen (Netz, fremder Stand): sagen, nicht schweigen.
      warnung: kopie && !kopiert
        ? `Der Satz „${n}“ ist angelegt, aber der Verlauf von „${vonName.value}“ kam nicht mit.` : null,
    });
  } catch (f) {
    console.error('cde: satz anlegen', f);
    fehler.value = f?.response?.data?.detail || f?.message || 'Der Satz konnte nicht angelegt werden.';
  } finally {
    laeuft.value = false;
  }
}
</script>

<style scoped>
.sn-rumpf { display: flex; flex-direction: column; gap: 0.75rem; }
.sn-feld { display: flex; flex-direction: column; gap: 0.3rem; font-size: var(--cde-font-sm); color: var(--cde-text-dim); }
.sn-name {
  padding: 0.45rem 0.55rem; font: inherit;
  background: var(--cde-surface); color: var(--cde-text);
  border: 1px solid var(--cde-line-strong); border-radius: var(--cde-radius-sm);
}
.sn-name:focus { outline: 2px solid var(--cde-accent-line); }
.sn-wahl { margin: 0; padding: 0; border: 0; display: flex; flex-direction: column; gap: 0.35rem; }
.sn-wahl legend {
  margin-bottom: 0.3rem; padding: 0;
  font-size: var(--cde-font-xs); text-transform: uppercase;
  letter-spacing: 0.06em; color: var(--cde-text-dim);
}
.sn-option {
  display: flex; align-items: flex-start; gap: 0.55rem;
  padding: 0.5rem 0.6rem; cursor: pointer;
  border: 1px solid var(--cde-line); border-radius: var(--cde-radius-sm);
  background: var(--cde-surface);
}
.sn-option:has(input:checked) { border-color: var(--cde-accent-line); }
.sn-option.aus { opacity: 0.55; cursor: default; }
.sn-option input { margin-top: 0.2rem; }
.sn-text { display: flex; flex-direction: column; gap: 0.15rem; min-width: 0; }
.sn-text strong { font-size: var(--cde-font-sm); }
.sn-text small { color: var(--cde-text-dim); font-size: var(--cde-font-xs); }
.sn-fehler { margin: 0; color: var(--cde-danger); font-size: var(--cde-font-sm); }

.sn-btn {
  display: inline-flex; align-items: center; gap: 0.3rem;
  padding: 0.4rem 0.75rem; cursor: pointer;
  border: 1px solid var(--cde-line-strong); border-radius: var(--cde-radius-sm);
  background: var(--cde-fill); color: var(--cde-text);
  font-size: var(--cde-font-sm);
  touch-action: manipulation;
}
.sn-btn:hover:not(:disabled) { border-color: var(--cde-accent-line); color: var(--cde-accent); }
.sn-btn:disabled { opacity: 0.5; cursor: default; }
.sn-btn.primaer {
  background: var(--cde-accent); color: var(--cde-text-invert, var(--cde-bg));
  border-color: var(--cde-accent);
  font-weight: 600;
}
.sn-btn.primaer:hover:not(:disabled) { color: var(--cde-text-invert, var(--cde-bg)); filter: brightness(1.1); }

@media (pointer: coarse) {
  .sn-btn { padding: 0.6rem 0.9rem; }
  .sn-option { padding: 0.7rem 0.7rem; }
}
</style>
