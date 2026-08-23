<template>
  <div class="q-tab">
    <div class="card-header">
      <span class="card-title">✅ BIM-Qualität (IDS-Prüfung)</span>
      <button class="card-btn" :disabled="loading" @click="$emit('refresh')" title="Prüfung ausführen">
        {{ loading ? '⏳' : '↻' }}
      </button>
    </div>

    <div v-if="loading" class="state-msg">Prüfe Modell…</div>
    <div v-else-if="!result" class="state-msg">
      Noch keine Prüfung gelaufen — ↻ startet die IDS-Prüfung gegen das geladene Modell.
    </div>

    <template v-else>
      <!-- Ampel-Zusammenfassung -->
      <div class="q-summary">
        <div class="q-score" :class="scoreClass">
          {{ Math.round(result.summary.score * 100) }} %
          <small>bestanden</small>
        </div>
        <div class="q-stats">
          <span class="q-stat err"  v-if="result.summary.errors">🔴 {{ result.summary.errors }} Fehler-Regeln</span>
          <span class="q-stat warn" v-if="result.summary.warnings">🟡 {{ result.summary.warnings }} Warn-Regeln</span>
          <span class="q-stat ok"   v-if="!result.summary.errors && !result.summary.warnings">🟢 Alle Regeln bestanden</span>
          <span class="q-stat dim">{{ result.summary.totalFailed }} / {{ result.summary.totalApplicable }} Elemente auffällig</span>
        </div>
      </div>

      <!-- Regel-Liste -->
      <div class="q-list">
        <div v-for="row in sortedSpecs" :key="row.spec.id" class="q-spec" :class="{ failed: row.failed.length }">
          <button class="q-spec-head" @click="toggle(row.spec.id)">
            <span class="q-sev">{{ sevIcon(row) }}</span>
            <span class="q-name">{{ row.spec.name }}</span>
            <span class="q-count" :class="{ bad: row.failed.length }">
              {{ row.failed.length ? `${row.failed.length} / ${row.applicable}` : (row.applicable ? '✓' : '0 Elem.') }}
            </span>
            <span class="q-chevron" :class="{ open: expanded.has(row.spec.id) }">▸</span>
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

      <div class="hint-row">
        ⓘ Regelwerk: {{ result.summary.specsChecked }} IDS-Regeln (LP-5-Starter-Set).
        🔴 error = Phase-Gate-Blocker, 🟡 warning = Hinweis.
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, reactive } from 'vue';

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

function sevIcon(row) {
  if (!row.failed.length) return '🟢';
  return row.spec.severity === 'error' ? '🔴' : row.spec.severity === 'warning' ? '🟡' : 'ℹ️';
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
.q-tab { display: flex; flex-direction: column; gap: 0.55rem; font-size: 0.78rem; color: var(--cde-text); }

.card-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0.35rem 0.4rem;
  background: var(--cde-tint-weak);
  border-radius: 5px;
  border: 1px solid var(--cde-tint);
}
.card-title { font-weight: 600; font-size: 0.84rem; color: var(--cde-text-bright); }
.card-btn {
  background: var(--cde-tint);
  border: 1px solid var(--cde-tint-strong);
  color: var(--cde-text);
  width: 1.6rem; height: 1.6rem;
  border-radius: 4px;
  cursor: pointer;
}
.card-btn:hover:not(:disabled) { background: var(--cde-tint-max); }
.card-btn:disabled { opacity: 0.5; cursor: default; }

.state-msg { color: var(--cde-text-dim); font-style: italic; padding: 1rem 0.5rem; text-align: center; }

.q-summary {
  display: flex; align-items: center; gap: 0.8rem;
  padding: 0.5rem 0.6rem;
  background: var(--cde-tint-weak);
  border: 1px solid var(--cde-tint);
  border-radius: 5px;
}
.q-score {
  font-size: 1.3rem; font-weight: 700;
  display: flex; flex-direction: column; align-items: center; line-height: 1.1;
}
.q-score small { font-size: 0.58rem; font-weight: 400; color: var(--cde-text-dim); }
.q-score.good { color: var(--cde-success-strong); }
.q-score.mid  { color: var(--cde-warn); }
.q-score.bad  { color: var(--cde-danger); }
.q-stats { display: flex; flex-direction: column; gap: 0.15rem; font-size: 0.72rem; }
.q-stat.dim { color: var(--cde-text-dim); }

.q-list { display: flex; flex-direction: column; gap: 0.25rem; max-height: 340px; overflow-y: auto; }
.q-spec {
  border: 1px solid var(--cde-tint);
  border-radius: 4px;
  background: var(--cde-tint-weak);
}
.q-spec.failed { border-color: rgba(239,83,80,0.25); }
.q-spec-head {
  display: flex; align-items: center; gap: 0.4rem;
  width: 100%;
  background: none; border: none; cursor: pointer;
  padding: 0.4rem 0.5rem;
  color: var(--cde-text); font-size: 0.75rem; text-align: left;
}
.q-spec-head:hover { background: var(--cde-tint-weak); }
.q-name { flex: 1; }
.q-count { font-variant-numeric: tabular-nums; color: var(--cde-success-strong); }
.q-count.bad { color: var(--cde-danger-soft); }
.q-chevron { color: var(--cde-text-mute); font-size: 0.65rem; transition: transform 0.12s; }
.q-chevron.open { transform: rotate(90deg); }

.q-spec-body { padding: 0.2rem 0.6rem 0.5rem 1.8rem; }
.q-desc { color: var(--cde-text-dim); font-size: 0.68rem; margin: 0 0 0.3rem; }
.q-fail-list { display: flex; flex-direction: column; gap: 0.1rem; }
.q-fail-row {
  display: flex; justify-content: space-between; gap: 0.6rem;
  background: none; border: none; cursor: pointer;
  padding: 0.15rem 0.25rem;
  font-size: 0.7rem; color: var(--cde-text-soft); text-align: left;
  border-radius: 3px;
}
.q-fail-row:hover { background: rgba(52,152,219,0.15); color: #fff; }
.q-fail-name { flex-shrink: 0; color: var(--cde-text-bright); }
.q-fail-msg { color: var(--cde-danger-soft); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.q-more { color: var(--cde-text-mute); font-size: 0.65rem; font-style: italic; padding: 0.15rem 0.25rem; }
.q-pass-msg { color: var(--cde-success-strong); font-size: 0.68rem; }

.hint-row { font-size: 0.62rem; color: var(--cde-text-faint); font-style: italic; padding: 0 0.2rem; }
</style>
