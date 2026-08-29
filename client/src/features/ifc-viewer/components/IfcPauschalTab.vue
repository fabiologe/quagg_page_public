<template>
  <div class="psch-tab cde-card">
    <CdeCardHeader icon="pauschal" titel="Pauschalpositionen (psch)">
      <CdeIconButton icon="add" titel="Position hinzufügen" @click="addRow" />
    </CdeCardHeader>

    <p class="cde-hint info-row">
      <CdeIcon name="info" :size="12" />
      <span>
        Pauschalpositionen sind keine BIM-Mengen — sie werden hier manuell gepflegt
        (z. B. Baustelleneinrichtung, Gerüst, Bauzeitenplan).
        Alle Eingaben werden lokal gespeichert.
      </span>
    </p>

    <!-- Summe oben -->
    <div class="cde-totals">
      <div class="cde-total-cell prim">
        <div class="cde-total-label">Σ Pauschalen</div>
        <div class="cde-total-value">{{ fmtEur(total) }}</div>
      </div>
      <div class="cde-total-cell">
        <div class="cde-total-label">Positionen</div>
        <div class="cde-total-value">{{ items.length }}</div>
      </div>
    </div>

    <!-- Liste / Editor -->
    <div class="psch-list">
      <div v-if="!items.length" class="empty-state">
        <CdeIcon name="pauschal" :size="22" />
        Noch keine Pauschalpositionen — oben rechts auf <CdeIcon name="add" :size="12" /> klicken.
      </div>

      <div
        v-for="(item, idx) in items"
        :key="item.id"
        class="psch-row"
      >
        <input
          v-model="item.code"
          class="psch-code"
          placeholder="OZ"
          @change="persist"
        />
        <input
          v-model="item.title"
          class="psch-title"
          placeholder="Bezeichnung der Position"
          @change="persist"
        />
        <input
          v-model.number="item.amount_eur"
          type="number"
          step="100"
          min="0"
          class="psch-amount"
          placeholder="€"
          @change="persist"
        />
        <button class="psch-del" @click="removeRow(idx)" title="Entfernen" aria-label="Position entfernen">
          <CdeIcon name="close" :size="13" />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { repo } from '../services/RepoFacade.js';
import CdeIcon from './ui/CdeIcon.vue';
import CdeCardHeader from './ui/CdeCardHeader.vue';
import CdeIconButton from './ui/CdeIconButton.vue';

const REPO_KEY = 'pauschal-items';

const items = ref([]);

const total = computed(() => items.value.reduce((sum, it) => sum + (Number(it.amount_eur) || 0), 0));

function newId() {
  return 'psch-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function addRow() {
  items.value.push({
    id: newId(),
    code: String(items.value.length + 1).padStart(3, '0'),
    title: '',
    amount_eur: 0,
  });
  persist();
}

function removeRow(idx) {
  items.value.splice(idx, 1);
  persist();
}

async function persist() {
  await repo.set(REPO_KEY, items.value);
}

async function load() {
  const stored = await repo.get(REPO_KEY);
  if (Array.isArray(stored)) items.value = stored;
}

function fmtEur(n) {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v)) return '–';
  return v.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

onMounted(load);

// Auto-persist on any deep change (debounce-light via short ticks isn't critical here)
watch(items, () => persist(), { deep: true });
</script>

<style scoped>
/* Bausteine: styles/theme.css. Pauschalen teilen die Geld-Leitfarbe der
   Kostenkachel — sie fließen dort in dieselbe Summe. */
.psch-tab {
  --card-accent: var(--cde-amber);
  --cols: 2;
  font-size: 0.78rem;
  color: var(--cde-text);
}

.info-row {
  padding: 0.5rem 0.45rem;
  background: var(--cde-fill);
  border-radius: var(--cde-radius-sm);
  font-size: 0.7rem;
  color: var(--cde-text-dim);
}

.cde-total-value { font-size: 1rem; }

.psch-list { display: flex; flex-direction: column; gap: 0.3rem; max-height: 350px; overflow-y: auto; }

.empty-state {
  display: flex; flex-direction: column; align-items: center; gap: 0.45rem;
  padding: 1.5rem 0.5rem;
  text-align: center;
  color: var(--cde-text-dim);
  background: var(--cde-fill);
  border: 1px dashed var(--cde-line-strong);
  border-radius: var(--cde-radius-sm);
}
.empty-state .cde-icon { display: inline-block; vertical-align: -2px; color: var(--cde-text-faint); }

.psch-row {
  display: grid; grid-template-columns: 3rem 1fr 6rem 1.6rem;
  gap: 0.3rem;
  align-items: center;
  padding: 0.25rem 0.3rem;
  background: var(--cde-fill);
  border: 1px solid var(--cde-line-soft);
  border-radius: var(--cde-radius-sm);
}

.psch-code, .psch-title, .psch-amount {
  background: var(--cde-fill);
  border: 1px solid var(--cde-line);
  border-radius: 3px;
  padding: 0.2rem 0.35rem;
  color: var(--cde-text-bright);
  font-size: 0.75rem;
  font-family: inherit;
}
.psch-code   { text-align: center; font-variant-numeric: tabular-nums; color: var(--cde-amber-soft); }
.psch-amount { text-align: right;  font-variant-numeric: tabular-nums; color: var(--cde-amber-soft); }

.psch-code:focus, .psch-title:focus, .psch-amount:focus {
  outline: none;
  border-color: color-mix(in srgb, var(--card-accent) 55%, transparent);
  background: var(--cde-fill-hover);
}

.psch-del {
  display: inline-flex; align-items: center; justify-content: center;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 3px;
  color: var(--cde-text-faint);
  cursor: pointer;
}
.psch-del:hover {
  background: var(--cde-danger-fill);
  border-color: color-mix(in srgb, var(--cde-danger) 35%, transparent);
  color: var(--cde-danger-soft);
}
</style>
