<template>
  <div class="q-tab cde-card">
    <CdeCardHeader icon="quality" titel="BIM-Qualität (IDS-Prüfung)">
      <CdeIconButton icon="refresh" titel="Prüfung ausführen" :busy="loading" @click="$emit('refresh')" />
    </CdeCardHeader>

    <div v-if="loading" class="cde-state-msg">Prüfe Modell…</div>
    <div v-else-if="!result" class="cde-state-msg">
      <CdeIcon name="quality" :size="22" />
      Noch keine Prüfung gelaufen — der Knopf oben rechts startet die IDS-Prüfung
      gegen das geladene Modell.
    </div>

    <template v-else>
      <!-- Ampel-Zusammenfassung -->
      <div class="q-summary">
        <div class="q-score" :class="scoreClass">
          {{ Math.round(result.summary.score * 100) }} %
          <small>bestanden</small>
        </div>
        <div class="q-stats">
          <span class="q-stat err" v-if="result.summary.errors">
            <CdeIcon name="status-error" :size="12" /> {{ result.summary.errors }} Fehler-Regeln
          </span>
          <span class="q-stat warn" v-if="result.summary.warnings">
            <CdeIcon name="status-warn" :size="12" /> {{ result.summary.warnings }} Warn-Regeln
          </span>
          <span class="q-stat ok" v-if="!result.summary.errors && !result.summary.warnings">
            <CdeIcon name="status-ok" :size="12" /> Alle Regeln bestanden
          </span>
          <span class="q-stat dim">{{ result.summary.totalFailed }} / {{ result.summary.totalApplicable }} Elemente auffällig</span>
        </div>
      </div>

      <!-- Regel-Liste -->
      <div class="q-list">
        <div v-for="row in sortedSpecs" :key="row.spec.id" class="q-spec" :class="{ failed: row.failed.length }">
          <button class="q-spec-head" @click="toggle(row.spec.id)">
            <CdeIcon class="q-sev" :class="sev(row).klasse" :name="sev(row).icon" :size="14" />
            <span class="q-name">{{ row.spec.name }}</span>
            <span class="q-count" :class="{ bad: row.failed.length }">
              <template v-if="row.failed.length">{{ row.failed.length }} / {{ row.applicable }}</template>
              <CdeIcon v-else-if="row.applicable" name="check" :size="12" />
              <template v-else>0 Elem.</template>
            </span>
            <CdeIcon class="q-chevron" :class="{ open: expanded.has(row.spec.id) }" name="chevron-right" :size="12" />
          </button>

          <div v-if="expanded.has(row.spec.id)" class="q-spec-body">
            <p class="q-desc">{{ row.spec.description }}</p>
            <div v-if="row.failed.length" class="q-fail-list">
              <button
                v-for="f in row.failed.slice(0, MAX_SHOWN)"
                :key="`${f.modelId}|${f.localId}`"
                class="q-fail-row"
                @click="$emit('select-element', f)"
                title="Im 3D anzeigen"
              >
                <span class="q-fail-name">{{ f.name || `#${f.localId}` }}</span>
                <span class="q-fail-msg">{{ f.messages.join(' · ') }}</span>
              </button>
              <div v-if="row.failed.length > MAX_SHOWN" class="q-more">
                … {{ row.failed.length - MAX_SHOWN }} weitere
              </div>
            </div>
            <div v-else class="q-pass-msg">
              {{ row.applicable ? 'Alle anwendbaren Elemente bestehen diese Regel.' : 'Keine passenden Elemente im Modell.' }}
            </div>
          </div>
        </div>
      </div>

      <p class="cde-hint">
        <CdeIcon name="info" :size="12" />
        <span>
          Regelwerk: {{ result.summary.specsChecked }} IDS-Regeln (LP-5-Starter-Set).
          <span class="q-legend err"><CdeIcon name="status-error" :size="11" /> error</span> =
          Phase-Gate-Blocker,
          <span class="q-legend warn"><CdeIcon name="status-warn" :size="11" /> warning</span> =
          Hinweis.
        </span>
      </p>
    </template>
  </div>
</template>

<script setup>
import { computed, reactive } from 'vue';
import CdeIcon from './ui/CdeIcon.vue';
import CdeCardHeader from './ui/CdeCardHeader.vue';
import CdeIconButton from './ui/CdeIconButton.vue';

const props = defineProps({
  result:  { type: Object,  default: null },  // { perSpec, summary } aus IdsValidator
  loading: { type: Boolean, default: false },
});
defineEmits(['refresh', 'select-element']);

const MAX_SHOWN = 30;
const expanded = reactive(new Set());

function toggle(id) {
  if (expanded.has(id)) expanded.delete(id);
  else expanded.add(id);
}

/**
 * Ampel einer Regel: Symbol UND Farbklasse aus einer Quelle.
 *
 * Vorher standen dafür farbige Kreis-Emoji im Text — die Farbe steckte im
 * Zeichen selbst und war
 * damit weder umschaltbar noch für Farbenblinde unterscheidbar. Jetzt trägt
 * die FORM die Bedeutung (Kreuz / Ausrufezeichen / Haken), die Farbe kommt
 * aus dem Token-Satz obendrauf.
 */
function sev(row) {
  if (!row.failed.length) return { icon: 'status-ok', klasse: 'ok' };
  if (row.spec.severity === 'error')   return { icon: 'status-error', klasse: 'err' };
  if (row.spec.severity === 'warning') return { icon: 'status-warn',  klasse: 'warn' };
  return { icon: 'info', klasse: 'dim' };
}

// Fehlgeschlagene zuerst (error vor warning), dann bestandene, dann leere
const sortedSpecs = computed(() => {
  const rank = (row) => {
    if (row.failed.length) return row.spec.severity === 'error' ? 0 : 1;
    return row.applicable ? 2 : 3;
  };
  return [...(props.result?.perSpec ?? [])].sort((a, b) => rank(a) - rank(b));
});

const scoreClass = computed(() => {
  const s = props.result?.summary?.score ?? 1;
  return s >= 0.95 ? 'good' : s >= 0.7 ? 'mid' : 'bad';
});
</script>

<style scoped>
/* Bausteine: styles/theme.css. Hier nur die Prüf-Ampel. */
.q-tab { --card-accent: var(--cde-success-strong); font-size: 0.78rem; color: var(--cde-text); }

.q-summary {
  display: flex; align-items: center; gap: 0.8rem;
  padding: 0.5rem 0.6rem;
  background: var(--cde-fill);
  border: 1px solid var(--cde-line);
  border-radius: var(--cde-radius);
}
.q-score {
  display: flex; flex-direction: column; align-items: center;
  font-size: 1.3rem; font-weight: 700; line-height: 1.1;
  font-variant-numeric: tabular-nums;
}
.q-score small { font-size: 0.58rem; font-weight: 400; color: var(--cde-text-dim); }
.q-score.good { color: var(--cde-success-strong); }
.q-score.mid  { color: var(--cde-warn); }
.q-score.bad  { color: var(--cde-danger); }

.q-stats { display: flex; flex-direction: column; gap: 0.15rem; font-size: var(--cde-font-sm); }
.q-stat { display: flex; align-items: center; gap: 0.3rem; }
.q-stat.dim { color: var(--cde-text-dim); }

/* Eine Farbleiter für Ampel-Symbole — überall dieselbe Zuordnung. */
.err  { color: var(--cde-danger); }
.warn { color: var(--cde-warn); }
.ok   { color: var(--cde-success-strong); }
.dim  { color: var(--cde-text-mute); }

.q-list { display: flex; flex-direction: column; gap: var(--cde-gap-xs); max-height: 340px; overflow-y: auto; }
.q-spec {
  border: 1px solid var(--cde-line);
  border-radius: var(--cde-radius-sm);
  background: var(--cde-fill);
}
.q-spec.failed { border-color: color-mix(in srgb, var(--cde-danger) 28%, transparent); }

.q-spec-head {
  display: flex; align-items: center; gap: var(--cde-gap-sm);
  width: 100%;
  padding: 0.4rem 0.5rem;
  background: none; border: none; cursor: pointer;
  color: var(--cde-text); font-size: 0.75rem; text-align: left;
}
.q-spec-head:hover { background: var(--cde-fill-hover); }
.q-sev { flex-shrink: 0; }
.q-name { flex: 1; min-width: 0; }
.q-count {
  display: inline-flex; align-items: center; gap: 0.2rem;
  font-variant-numeric: tabular-nums;
  color: var(--cde-success-strong);
}
.q-count.bad { color: var(--cde-danger-soft); }
.q-chevron { color: var(--cde-text-mute); transition: transform 0.12s; }
.q-chevron.open { transform: rotate(90deg); }

.q-spec-body { padding: 0.2rem 0.6rem 0.5rem 1.9rem; }
.q-desc { margin: 0 0 0.3rem; color: var(--cde-text-dim); font-size: 0.68rem; }
.q-fail-list { display: flex; flex-direction: column; gap: 0.1rem; }
.q-fail-row {
  display: flex; justify-content: space-between; gap: 0.6rem;
  padding: 0.15rem 0.25rem;
  background: none; border: none; border-radius: 3px; cursor: pointer;
  font-size: 0.7rem; color: var(--cde-text-soft); text-align: left;
}
.q-fail-row:hover { background: var(--cde-accent-fill); color: var(--cde-text-bright); }
.q-fail-name { flex-shrink: 0; color: var(--cde-text-bright); }
.q-fail-msg { color: var(--cde-danger-soft); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.q-more { padding: 0.15rem 0.25rem; color: var(--cde-text-mute); font-size: 0.65rem; font-style: italic; }
.q-pass-msg { color: var(--cde-success-strong); font-size: 0.68rem; }

.q-legend { display: inline-flex; align-items: center; gap: 0.15rem; white-space: nowrap; }
</style>
