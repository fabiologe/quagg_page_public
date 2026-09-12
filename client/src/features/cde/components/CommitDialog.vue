<template>
  <CdeDialog :offen="bearbeitung.commitDialogOffen" titel="Bearbeitung sichern"
             icon="edit" @close="weiter">
    <div class="ko-rumpf">
      <label class="ko-feld">
        <span>Beschreibung (optional)</span>
        <textarea
          v-model="nachricht"
          rows="2"
          :placeholder="vorschlag"
          class="ko-nachricht"
        ></textarea>
      </label>

      <h4 class="ko-abschnitt">
        {{ ae.sitzungVorgaenge.length }}
        Schritt{{ ae.sitzungVorgaenge.length === 1 ? '' : 'e' }}
      </h4>
      <ul class="ko-liste">
        <li v-for="v in ae.sitzungVorgaenge" :key="v.schluessel" class="ko-schritt">
          <div class="ko-schritt-text">
            <strong>{{ v.titel }}</strong>
            <small>
              {{ v.bauteile.slice(0, 3).map(kurz).join(' · ') }}
              <template v-if="v.bauteile.length > 3"> +{{ v.bauteile.length - 3 }}</template>
            </small>
          </div>
          <button
            class="ko-btn klein"
            title="Diesen Schritt herausnehmen — das Modell fährt ihn zurück"
            aria-label="Schritt herausnehmen"
            @click="entferne(v)"
          ><CdeIcon name="delete" :size="12" /></button>
        </li>
      </ul>
      <p v-if="!ae.sitzungVorgaenge.length" class="ko-leer">
        Kein Schritt mehr übrig — Sichern beendet die Bearbeitung ohne neue Version.
      </p>
      <p v-if="fehler" class="ko-fehler">{{ fehler }}</p>
    </div>

    <template #fuss>
      <button class="ko-btn" @click="weiter">Weiter bearbeiten</button>
      <button class="ko-btn gefahr" @click="verwerfen">
        {{ verwerfenBestaetigen ? 'Wirklich alles verwerfen?' : 'Verwerfen' }}
      </button>
      <button class="ko-btn primaer" :disabled="laeuft" @click="sichern">
        <CdeIcon name="check" :size="13" /> Sichern
      </button>
    </template>
  </CdeDialog>
</template>

<script setup>
/**
 * Der Commit-Dialog (Teil XI, U2) — der Moment am Ende der Bearbeitung,
 * den Fabio bestellt hat: „wie bei einem git-Commit, mit Kommentar und der
 * Liste aller Bearbeitungsschritte."
 *
 * Drei Ausgänge: COMMITTEN (Sitzung wird Historie, Modus geht aus),
 * WEITER (Dialog zu, Sitzung läuft), VERWERFEN (zweistufig — der zweite
 * Klick fährt alle Schritte über die Rückfahrkarten am Modell zurück).
 * Alles Modellberührende geht durch denselben `wendeEintragAn`.
 */
import { computed, ref, watch } from 'vue';
import CdeDialog from './ui/CdeDialog.vue';
import CdeIcon from './ui/CdeIcon.vue';
import { useAenderungen } from '../stores/useAenderungen.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { useCdeStore } from '../stores/useCdeStore.js';
import { useViewerApi } from '../composables/viewerApi.js';
import { usePanels } from '../stores/usePanels.js';

const ae = useAenderungen();
const bearbeitung = useBearbeitung();
const cde = useCdeStore();
const api = useViewerApi();

const nachricht = ref('');
const fehler = ref('');
const laeuft = ref(false);
const verwerfenBestaetigen = ref(false);
const vorschlag = computed(() => ae.nachrichtVorschlag() || 'z. B. „Kanal Süd: Sohlen nachgezogen"');

watch(() => bearbeitung.commitDialogOffen, (offen) => {
  if (offen) { nachricht.value = ''; fehler.value = ''; verwerfenBestaetigen.value = false; }
});

function kurz(gid) { return gid ? `…${String(gid).slice(-6)}` : '—'; }

async function anwenden(liste) {
  const voll = (liste ?? []).filter(Boolean);
  if (!voll.length) return;
  try {
    await api.wendeEintragAn?.(voll.length > 1 ? voll : voll[0]);
  } catch (f) {
    console.error('cde: commit-dialog anwenden', f);            // Gesetz 10
    fehler.value = `Fehler beim Zurückfahren: ${f?.message ?? f}`;
  }
}

async function entferne(v) {
  await anwenden(await ae.entferneSitzungsVorgang(v.schluessel));
}

function weiter() {
  bearbeitung.commitDialogOffen = false;
}

async function verwerfen() {
  if (!verwerfenBestaetigen.value) { verwerfenBestaetigen.value = true; return; }
  laeuft.value = true;
  try {
    await anwenden(await ae.verwerfeSitzung());
    bearbeitung.commitDialogOffen = false;
    bearbeitung.modusSetzen(false);
  } finally { laeuft.value = false; }
}

async function sichern() {
  laeuft.value = true;
  try {
    await ae.commitSitzung(nachricht.value, {
      wer: cde.bearbeiter || '',
      modellSha: api.getLoadedModelSha?.() ?? null,
    });
    bearbeitung.commitDialogOffen = false;
    bearbeitung.modusSetzen(false);
    // X1: Der frische Commit zeigt sich selbst — das Verlauf-Panel geht auf.
    usePanels().open('verlauf');
  } catch (f) {
    console.error('cde: committen', f);
    fehler.value = `Nicht gesichert: ${f?.message ?? f}`;
  } finally { laeuft.value = false; }
}
</script>

<style scoped>
.ko-rumpf { display: flex; flex-direction: column; gap: 0.6rem; }
.ko-feld { display: flex; flex-direction: column; gap: 0.3rem; font-size: var(--cde-font-sm); color: var(--cde-text-dim); }
.ko-nachricht {
  resize: vertical; min-height: 3.2em;
  padding: 0.45rem 0.55rem; font: inherit;
  background: var(--cde-surface); color: var(--cde-text);
  border: 1px solid var(--cde-line-strong); border-radius: var(--cde-radius-sm);
}
.ko-nachricht:focus { outline: 2px solid var(--cde-accent-line); }
.ko-abschnitt {
  margin: 0; font-size: var(--cde-font-xs); text-transform: uppercase;
  letter-spacing: 0.06em; color: var(--cde-text-dim);
}
.ko-liste { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.25rem; }
.ko-schritt {
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.35rem 0.45rem;
  border: 1px solid var(--cde-line); border-radius: var(--cde-radius-sm);
  background: var(--cde-surface);
}
.ko-schritt-text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.ko-schritt-text strong { font-size: var(--cde-font-sm); }
.ko-schritt-text small { color: var(--cde-text-dim); font-size: var(--cde-font-xs); }
.ko-leer { margin: 0; color: var(--cde-text-dim); font-size: var(--cde-font-sm); }
.ko-fehler { margin: 0; color: var(--cde-danger); font-size: var(--cde-font-sm); }

.ko-btn {
  display: inline-flex; align-items: center; gap: 0.3rem;
  padding: 0.4rem 0.75rem; cursor: pointer;
  border: 1px solid var(--cde-line-strong); border-radius: var(--cde-radius-sm);
  background: var(--cde-fill); color: var(--cde-text);
  font-size: var(--cde-font-sm);
  touch-action: manipulation;
}
.ko-btn:hover:not(:disabled) { border-color: var(--cde-accent-line); color: var(--cde-accent); }
.ko-btn:disabled { opacity: 0.5; cursor: default; }
.ko-btn.klein { padding: 0.3rem 0.45rem; }
.ko-btn.primaer {
  background: var(--cde-accent); color: var(--cde-text-invert, var(--cde-bg));
  border-color: var(--cde-accent);
  font-weight: 600;
}
.ko-btn.primaer:hover:not(:disabled) { color: var(--cde-text-invert, var(--cde-bg)); filter: brightness(1.1); }
.ko-btn.gefahr:hover { border-color: var(--cde-danger); color: var(--cde-danger); }

@media (pointer: coarse) {
  .ko-btn { padding: 0.6rem 0.9rem; }
  .ko-btn.klein { padding: 0.5rem 0.6rem; }
}
</style>
