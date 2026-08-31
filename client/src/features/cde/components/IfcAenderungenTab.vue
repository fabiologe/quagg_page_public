<template>
  <div class="ae-tab cde-card">
    <CdeCardHeader
      icon="undo"
      titel="Änderungen"
      :zusatz="ae.anzahl ? `${ae.beruehrteBauteile} Bauteile` : ''"
    >
      <CdeIconButton
        icon="undo"
        titel="Letzten Schritt zurücknehmen"
        :disabled="!ae.kannZurueck"
        @click="zurueck"
      />
    </CdeCardHeader>

    <div v-if="!ae.anzahl" class="cde-state-msg">
      <CdeIcon name="undo" :size="22" />
      Noch nichts geändert. Kostengruppen weist du im Tab „Kostengruppen" zu,
      DIN-277-Klassen im Tab „Flächen".
    </div>

    <template v-else>
      <div class="cde-totals">
        <div class="cde-total-cell prim">
          <div class="cde-total-label">Schritte</div>
          <div class="cde-total-value">{{ ae.anzahl }}</div>
        </div>
        <div class="cde-total-cell">
          <div class="cde-total-label">Bauteile</div>
          <div class="cde-total-value">{{ ae.beruehrteBauteile }}</div>
        </div>
        <div class="cde-total-cell">
          <div class="cde-total-label">Wirksam</div>
          <div class="cde-total-value">{{ ae.kgStand.size + ae.din277Stand.size }}</div>
        </div>
      </div>

      <div class="cde-table-wrap">
        <table class="cde-table">
          <thead>
            <tr>
              <th>Wann</th>
              <th>Art</th>
              <th>Bauteil</th>
              <th>Von</th>
              <th>Auf</th>
              <th>Wer</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="e in neuesteZuerst" :key="e.id" :class="{ ruecknahme: e.ruecknahmeVon }">
              <td class="mono">{{ zeit(e.wann) }}</td>
              <td>
                <CdeIcon :name="ARTEN[e.art]?.icon ?? 'info'" :size="11" />
                {{ ARTEN[e.art]?.titel ?? e.art }}
              </td>
              <td class="mono kuerzel" :title="e.globalId">{{ kurz(e.globalId) }}</td>
              <td class="mono">{{ e.vorher == null ? '—' : beschreibeWert(e.art, e.vorher) }}</td>
              <td class="mono betont">{{ beschreibeWert(e.art, e.nachher) }}</td>
              <td>{{ e.wer || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p class="cde-hint">
        <CdeIcon name="info" :size="12" />
        <span>
          Zurücknehmen fügt einen Gegeneintrag an, statt zu löschen — die Spur
          bleibt vollständig. „— (Regel)" heißt: keine Handzuweisung mehr, es
          gilt wieder die automatische Klassifikation.
        </span>
      </p>

      <div class="ae-verwerfen">
        <button class="ae-btn" @click="verwerfe('kg')" :disabled="!ae.kgStand.size">
          <CdeIcon name="kg" :size="12" /> Alle KG-Zuweisungen verwerfen
        </button>
        <button class="ae-btn" @click="verwerfe('din277')" :disabled="!ae.din277Stand.size">
          <CdeIcon name="areas" :size="12" /> Alle DIN-277-Zuweisungen verwerfen
        </button>
      </div>
    </template>
  </div>
</template>

<script setup>
/**
 * Was am Bauteilbestand von Hand geändert wurde (Sprint I, Stufe 7).
 *
 * Die Liste ist append-only: auch eine Rücknahme steht darin, als
 * Gegeneintrag. Wer nachvollziehen will, warum eine Wand in KG 340 statt 330
 * zählt, soll sehen, dass jemand sie umgehängt hat — und wer.
 */
import { computed } from 'vue';
import CdeIcon from './ui/CdeIcon.vue';
import CdeCardHeader from './ui/CdeCardHeader.vue';
import CdeIconButton from './ui/CdeIconButton.vue';
import { useAenderungen, AENDERUNGS_ARTEN, beschreibeWert } from '../stores/useAenderungen.js';
import { useCdeStore } from '../stores/useCdeStore.js';

const emit = defineEmits(['geaendert']);

const ae = useAenderungen();
const cde = useCdeStore();
const ARTEN = AENDERUNGS_ARTEN;

const neuesteZuerst = computed(() => ae.eintraege.slice().reverse());

/** GlobalIds sind 22 Zeichen — für die Tabelle reichen die letzten sechs. */
function kurz(globalId) {
  return globalId ? `…${String(globalId).slice(-6)}` : '—';
}

function zeit(ms) {
  if (!ms) return '—';
  return new Date(ms).toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

async function zurueck() {
  await ae.zurueck(cde.bearbeiter || '');
  emit('geaendert');
}

async function verwerfe(art) {
  await ae.verwerfe(art, cde.bearbeiter || '');
  emit('geaendert');
}
</script>

<style scoped>
/* Bausteine: styles/theme.css. Hier nur das Eigene des Journals. */
.ae-tab {
  --card-accent: var(--cde-warn);
  --table-max-h: 340px;
  font-size: 0.78rem;
  color: var(--cde-text);
}

.mono { font-family: ui-monospace, monospace; font-size: 0.72rem; }
.kuerzel { color: var(--cde-text-dim); }
.betont { color: var(--card-accent); font-weight: 600; }

/* Rücknahmen treten zurück — sie sind Buchhaltung, keine Aussage. */
tr.ruecknahme td { opacity: 0.62; font-style: italic; }

.ae-verwerfen { display: flex; flex-direction: column; gap: 0.3rem; }
.ae-btn {
  display: inline-flex; align-items: center; gap: 0.35rem;
  padding: 0.3rem 0.6rem;
  background: var(--cde-fill);
  border: 1px solid var(--cde-line);
  border-radius: var(--cde-radius-sm);
  color: var(--cde-text-soft);
  font: inherit; font-size: 0.73rem; cursor: pointer;
  transition: background 0.12s, color 0.12s;
}
.ae-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--card-accent) 16%, transparent);
  color: var(--cde-text-bright);
}
.ae-btn:disabled { opacity: 0.45; cursor: default; }
</style>
