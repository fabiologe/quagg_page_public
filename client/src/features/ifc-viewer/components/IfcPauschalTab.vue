<template>
  <div class="psch-tab">
    <div class="card-header">
      <span class="card-title">💰 Pauschalpositionen (psch)</span>
      <button class="card-btn" @click="addRow" title="Position hinzufügen">+</button>
    </div>

    <div class="info-row">
      Pauschalpositionen sind keine BIM-Mengen — sie werden hier manuell gepflegt
      (z.B. Baustelleneinrichtung, Gerüst, Bauzeitenplan).
      Alle Eingaben werden lokal gespeichert.
    </div>

    <!-- Summe oben -->
    <div class="totals-bar">
      <div class="total-cell prim">
        <div class="total-label">Σ Pauschalen</div>
        <div class="total-value">{{ fmtEur(total) }}</div>
      </div>
      <div class="total-cell">
        <div class="total-label">Positionen</div>
        <div class="total-value">{{ items.length }}</div>
      </div>
    </div>

    <!-- Liste / Editor -->
    <div class="psch-list">
      <div v-if="!items.length" class="empty-state">
        Noch keine Pauschalpositionen — auf <strong>+</strong> oben rechts klicken.
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
        <button class="psch-del" @click="removeRow(idx)" title="Entfernen">×</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { repo } from '../services/RepoFacade.js';

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
.psch-tab { display: flex; flex-direction: column; gap: 0.55rem; font-size: 0.78rem; color: #cfd8dc; }

.card-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0.35rem 0.4rem;
  background: rgba(255,255,255,0.04);
  border-radius: 5px;
  border: 1px solid rgba(255,255,255,0.08);
}
.card-title { font-weight: 600; font-size: 0.84rem; color: #eceff1; }
.card-btn {
  background: rgba(255,193,7,0.18);
  border: 1px solid rgba(255,193,7,0.45);
  color: #ffe082;
  width: 1.6rem; height: 1.6rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1rem;
  font-weight: 700;
}
.card-btn:hover { background: rgba(255,193,7,0.35); }

.info-row {
  font-size: 0.7rem;
  color: #90a4ae;
  padding: 0.5rem 0.45rem;
  background: rgba(255,255,255,0.025);
  border-radius: 4px;
  line-height: 1.4;
}

.totals-bar { display: grid; grid-template-columns: 1fr 1fr; gap: 0.4rem; }
.total-cell {
  background: rgba(255,193,7,0.08);
  border: 1px solid rgba(255,193,7,0.25);
  border-radius: 4px;
  padding: 0.4rem 0.5rem;
  text-align: center;
}
.total-cell.prim { background: rgba(255,193,7,0.18); border-color: rgba(255,193,7,0.5); }
.total-label { font-size: 0.62rem; color: #ffe082; letter-spacing: 0.04em; text-transform: uppercase; }
.total-value { font-size: 1rem; color: #eceff1; font-weight: 600; }

.psch-list { display: flex; flex-direction: column; gap: 0.3rem; max-height: 350px; overflow-y: auto; }
.empty-state {
  color: #90a4ae; font-style: italic;
  padding: 1.5rem 0.5rem;
  text-align: center;
  background: rgba(255,255,255,0.02);
  border-radius: 4px;
  border: 1px dashed rgba(255,255,255,0.1);
}

.psch-row {
  display: grid; grid-template-columns: 3rem 1fr 6rem 1.4rem;
  gap: 0.3rem;
  align-items: center;
  padding: 0.25rem 0.3rem;
  background: rgba(255,255,255,0.03);
  border-radius: 4px;
  border: 1px solid rgba(255,255,255,0.06);
}
.psch-code, .psch-title, .psch-amount {
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 3px;
  padding: 0.2rem 0.35rem;
  color: #eceff1;
  font-size: 0.75rem;
  font-family: inherit;
}
.psch-code { text-align: center; font-variant-numeric: tabular-nums; color: #ffe082; }
.psch-amount { text-align: right; font-variant-numeric: tabular-nums; color: #ffe082; }
.psch-code:focus, .psch-title:focus, .psch-amount:focus {
  outline: none;
  border-color: rgba(255,193,7,0.5);
  background: rgba(255,255,255,0.07);
}

.psch-del {
  background: transparent;
  border: 1px solid transparent;
  color: #607d8b;
  cursor: pointer;
  font-size: 1rem;
  border-radius: 3px;
}
.psch-del:hover { background: rgba(244,67,54,0.2); color: #ff8a80; border-color: rgba(244,67,54,0.3); }
</style>
