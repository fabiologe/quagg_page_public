<template>
  <div class="culvert-manager">

    <!-- HEADER -->
    <div class="cm-header">
      <div class="cm-title">
        <span class="cm-icon"><SvEmoji emoji="🔌" :size="16" /></span>
        <div>
          <h4>1D/2D Rohrkopplung</h4>
          <p class="cm-subtitle">Verbinde Schächte als Durchlässe für den BMI-Solver</p>
        </div>
      </div>
      <div class="bmi-badge" :class="{ active: simStore.useBmiSolver }">
        <SvEmoji :emoji="simStore.useBmiSolver ? '🧪' : '⚙'" :size="13" />
        {{ simStore.useBmiSolver ? 'BMI aktiv' : 'Classic' }}
      </div>
    </div>

    <!-- KEIN TERRAIN ODER NODES -->
    <div v-if="nodes.length === 0" class="empty-state">
      <div class="empty-icon"><SvEmoji emoji="📍" :size="22" /></div>
      <p>Keine Schächte geladen.</p>
      <small>Importiere zuerst ein Kanalnetz (ISYBAU .xml) über den Daten-Importer.</small>
    </div>

    <template v-else>

      <!-- ADD FORM -->
      <div class="add-form">
        <div class="form-title">Neues Rohrsystem-Paar</div>

        <div class="form-row">
          <div class="form-group">
            <label>🔵 Einlauf (In)</label>
            <select v-model="newLink.sourceId" class="node-select">
              <option value="" disabled>— Schacht wählen —</option>
              <option
                v-for="n in nodes"
                :key="n.id"
                :value="n.id"
                :disabled="n.id === newLink.targetId"
              >
                {{ formatNodeLabel(n) }}
              </option>
            </select>
          </div>

          <div class="arrow-col">→</div>

          <div class="form-group">
            <label>🔴 Auslauf (Out)</label>
            <select v-model="newLink.targetId" class="node-select">
              <option value="" disabled>— Schacht wählen —</option>
              <option
                v-for="n in nodes"
                :key="n.id"
                :value="n.id"
                :disabled="n.id === newLink.sourceId"
              >
                {{ formatNodeLabel(n) }}
              </option>
            </select>
          </div>
        </div>

        <div class="form-row form-row--bottom">
          <div class="form-group form-group--inline">
            <label>Q<sub>max</sub> [m³/s]</label>
            <input
              type="number"
              v-model.number="newLink.maxQ"
              min="0.001"
              max="999"
              step="0.1"
              class="q-input"
              placeholder="z.B. 1.5"
            />
          </div>

          <button
            class="btn-add-link"
            :disabled="!isFormValid"
            @click="addLink"
            title="Rohrsystem-Paar hinzufügen"
          >
            + Hinzufügen
          </button>
        </div>

        <div v-if="duplicateWarning" class="warn-msg">
          <SvEmoji emoji="⚠" :size="14" /> Dieses Paar ist bereits vorhanden.
        </div>
      </div>

      <!-- LINK LIST -->
      <div class="link-list-header">
        <span>Konfigurierte Paare</span>
        <span class="link-count">{{ geoStore.culvertLinks.length }}</span>
      </div>

      <div class="link-list" v-if="geoStore.culvertLinks.length > 0">
        <transition-group name="link-fade" tag="div">
          <div
            v-for="link in geoStore.culvertLinks"
            :key="link.id"
            class="link-item"
          >
            <!-- Einlauf -->
            <div class="link-node link-node--in">
              <span class="node-dot dot-in"></span>
              <span class="node-label">{{ getNodeLabel(link.sourceId) }}</span>
            </div>

            <!-- Pfeil + Q-Wert -->
            <div class="link-connector">
              <div class="connector-line"></div>
              <div class="q-badge">
                <span class="q-val">{{ link.maxQ.toFixed(2) }}</span>
                <span class="q-unit">m³/s</span>
              </div>
              <div class="connector-line"></div>
              <div class="arrow-head">▶</div>
            </div>

            <!-- Auslauf -->
            <div class="link-node link-node--out">
              <span class="node-dot dot-out"></span>
              <span class="node-label">{{ getNodeLabel(link.targetId) }}</span>
            </div>

            <!-- Aktionen -->
            <div class="link-actions">
              <button
                class="btn-icon btn-edit"
                title="maxQ bearbeiten"
                @click="startEdit(link)"
              ><SvEmoji emoji="✏" :size="13" /></button>
              <button
                class="btn-icon btn-del"
                title="Paar entfernen"
                @click="geoStore.removeCulvertLink(link.id)"
              >×</button>
            </div>
          </div>
        </transition-group>
      </div>

      <div v-else class="empty-links">
        Noch keine Paare definiert. Wähle Einlauf &amp; Auslauf oben.
      </div>

      <!-- SUMMARY -->
      <div class="summary-bar" v-if="geoStore.culvertLinks.length > 0">
        <span>Gesamt: <strong>{{ geoStore.culvertLinks.length }}</strong> Durchlass-Paar(e)</span>
        <span>∑ Q<sub>max</sub> = <strong>{{ totalQ.toFixed(2) }} m³/s</strong></span>
      </div>

    </template>

    <!-- INLINE EDIT MODAL -->
    <div class="edit-overlay" v-if="editLink" @click.self="editLink = null">
      <div class="edit-modal">
        <h4>Q<sub>max</sub> bearbeiten</h4>
        <p class="edit-pair">
          {{ getNodeLabel(editLink.sourceId) }}
          <span class="edit-arrow">→</span>
          {{ getNodeLabel(editLink.targetId) }}
        </p>
        <input
          type="number"
          v-model.number="editLink.maxQ"
          min="0.001"
          step="0.1"
          class="q-input q-input--lg"
          autofocus
        />
        <div class="edit-actions">
          <button class="btn-cancel" @click="editLink = null">Abbrechen</button>
          <button class="btn-save" @click="saveEdit">Speichern</button>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import SvEmoji from '../common/SvEmoji.vue';
import { useGeoStore } from '@/features/flood-2D/stores/useGeoStore.js';
import { useSimulationStore } from '@/features/flood-2D/stores/useSimulationStore.js';

const geoStore  = useGeoStore();
const simStore  = useSimulationStore();

// ─── Computed ───────────────────────────────────────────────────────────────

const nodes = computed(() => geoStore.nodes ?? []);

const totalQ = computed(() =>
    geoStore.culvertLinks.reduce((sum, l) => sum + (l.maxQ || 0), 0)
);

// ─── Add Form ───────────────────────────────────────────────────────────────

const newLink = ref({ sourceId: '', targetId: '', maxQ: 1.0 });

const isFormValid = computed(() =>
    newLink.value.sourceId &&
    newLink.value.targetId &&
    newLink.value.sourceId !== newLink.value.targetId &&
    newLink.value.maxQ > 0
);

const duplicateWarning = computed(() => {
    if (!isFormValid.value) return false;
    return geoStore.culvertLinks.some(
        l => l.sourceId === newLink.value.sourceId &&
             l.targetId === newLink.value.targetId
    );
});

function addLink() {
    if (!isFormValid.value || duplicateWarning.value) return;
    // addCulvertLink erwartet ein Params-OBJEKT (z_in/diameter/…/maxQ), keine Zahl.
    // Zuvor wurde maxQ als 3. Positionsargument verschluckt → Link ohne maxQ.
    geoStore.addCulvertLink(
        newLink.value.sourceId,
        newLink.value.targetId,
        { maxQ: newLink.value.maxQ }
    );
    // Reset — maxQ behalten für schnelles Mehrfach-Anlegen
    newLink.value.sourceId = '';
    newLink.value.targetId = '';
}

// ─── Edit ───────────────────────────────────────────────────────────────────

const editLink    = ref(null);
const editMaxQBuf = ref(1.0);

function startEdit(link) {
    // Work on a shallow copy to allow cancel
    editLink.value    = { ...link };
    editMaxQBuf.value = link.maxQ;
}

function saveEdit() {
    if (!editLink.value) return;
    const target = geoStore.culvertLinks.find(l => l.id === editLink.value.id);
    if (target) target.maxQ = editLink.value.maxQ;
    editLink.value = null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatNodeLabel(node) {
    const id   = node.id?.toString().substring(0, 12) ?? '?';
    const x    = node.x?.toFixed(0) ?? '?';
    const y    = node.y?.toFixed(0) ?? '?';
    return `${id}… (${x}, ${y})`;
}

function getNodeLabel(nodeId) {
    const n = nodes.value.find(n => n.id === nodeId);
    if (!n) return nodeId?.substring(0, 10) + '…' ?? '?';
    return n.id?.toString().substring(0, 14) ?? formatNodeLabel(n);
}
</script>

<style scoped>
/* ─── Layout ──────────────────────────────────────────────────────────────── */
.culvert-manager {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: #1e2d3a;
    color: #ecf0f1;
    font-family: var(--sv-font);
    font-size: 0.88rem;
    overflow: hidden;
    position: relative;
}

/* ─── Header ─────────────────────────────────────────────────────────────── */
.cm-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 14px 16px 10px;
    background: #253547;
    border-bottom: 1px solid #2e2740;
    flex-shrink: 0;
}
.cm-title {
    display: flex;
    gap: 10px;
    align-items: center;
}
.cm-icon { font-size: 1.6rem; }
.cm-title h4 { margin: 0 0 2px; font-size: 0.95rem; color: #ecf0f1; }
.cm-subtitle { margin: 0; font-size: 0.73rem; color: #7f8c8d; }

.bmi-badge {
    padding: 3px 9px;
    border-radius: 12px;
    font-size: 0.72rem;
    font-weight: 600;
    background: #1e1e2c;
    color: #7f8c8d;
    border: 1px solid #3d5166;
    white-space: nowrap;
    transition: all 0.3s;
}
.bmi-badge.active {
    background: rgba(243, 156, 18, 0.15);
    color: #f39c12;
    border-color: rgba(243, 156, 18, 0.4);
}

/* ─── Empty State ────────────────────────────────────────────────────────── */
.empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    color: #7f8c8d;
    text-align: center;
    padding: 2rem;
}
.empty-icon { font-size: 2.5rem; }
.empty-state p { margin: 0; font-size: 0.92rem; color: #95a5a6; }
.empty-state small { font-size: 0.75rem; color: #5d6d7e; }

/* ─── Add Form ───────────────────────────────────────────────────────────── */
.add-form {
    padding: 14px 16px;
    background: #253547;
    border-bottom: 1px solid #2e2740;
    flex-shrink: 0;
}
.form-title {
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: #5d7f99;
    margin-bottom: 10px;
    font-weight: 600;
}
.form-row {
    display: flex;
    gap: 8px;
    align-items: flex-end;
    margin-bottom: 8px;
}
.form-row--bottom {
    margin-bottom: 0;
}
.form-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
}
.form-group--inline {
    flex-direction: row;
    align-items: center;
    gap: 8px;
    flex: 0 0 auto;
}
.form-group label {
    font-size: 0.72rem;
    color: #7f8c8d;
    font-weight: 600;
}
.form-group--inline label {
    white-space: nowrap;
    color: #7f8c8d;
}

.arrow-col {
    font-size: 1.4rem;
    color: #a3e635;
    padding-bottom: 2px;
    flex: 0 0 auto;
    align-self: flex-end;
}

.node-select {
    background: #1a2635;
    border: 1px solid #2e2740;
    color: #ecf0f1;
    padding: 7px 8px;
    border-radius: 5px;
    font-size: 0.8rem;
    width: 100%;
    cursor: pointer;
    transition: border-color 0.2s;
}
.node-select:focus { border-color: #a3e635; outline: none; }

.q-input {
    background: #1a2635;
    border: 1px solid #2e2740;
    color: #ecf0f1;
    padding: 7px 8px;
    border-radius: 5px;
    font-size: 0.88rem;
    width: 90px;
    text-align: right;
    font-variant-numeric: tabular-nums;
    transition: border-color 0.2s;
}
.q-input:focus { border-color: #a3e635; outline: none; }
.q-input--lg { width: 100%; font-size: 1.1rem; margin-bottom: 16px; }

.btn-add-link {
    padding: 8px 16px;
    background: #a3e635;
    color: #12121a;
    border: none;
    border-radius: 5px;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s, transform 0.1s;
    white-space: nowrap;
    flex-shrink: 0;
}
.btn-add-link:hover:not(:disabled) {
    background: #b6f04d;
    transform: translateY(-1px);
}
.btn-add-link:disabled {
    background: #1e1e2c;
    color: #5d7f99;
    cursor: not-allowed;
}

.warn-msg {
    margin-top: 6px;
    font-size: 0.75rem;
    color: #f39c12;
}

/* ─── Link List ──────────────────────────────────────────────────────────── */
.link-list-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 16px 6px;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: #5d7f99;
    font-weight: 600;
    flex-shrink: 0;
}
.link-count {
    background: #1e1e2c;
    color: #a3e635;
    padding: 1px 7px;
    border-radius: 10px;
    font-size: 0.72rem;
}

.link-list {
    flex: 1;
    overflow-y: auto;
    padding: 6px 10px;
}
.link-list::-webkit-scrollbar { width: 4px; }
.link-list::-webkit-scrollbar-track { background: transparent; }
.link-list::-webkit-scrollbar-thumb { background: #2e2740; border-radius: 2px; }

.link-item {
    display: flex;
    align-items: center;
    gap: 6px;
    background: #253547;
    border: 1px solid #2d4057;
    border-radius: 7px;
    padding: 10px 10px 10px 12px;
    margin-bottom: 6px;
    transition: border-color 0.2s, background 0.2s;
}
.link-item:hover {
    border-color: #a3e63544;
    background: #2a3d52;
}

.link-node {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    flex: 1;
}
.node-dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    flex-shrink: 0;
}
.dot-in  { background: #a3e635; box-shadow: 0 0 5px #a3e63566; }
.dot-out { background: #e74c3c; box-shadow: 0 0 5px #e74c3c66; }
.node-label {
    font-family: 'Consolas', 'Monaco', monospace;
    font-size: 0.75rem;
    color: #bdc3c7;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.link-connector {
    display: flex;
    align-items: center;
    gap: 3px;
    flex-shrink: 0;
}
.connector-line {
    width: 14px;
    height: 1px;
    background: #3d5166;
}
.q-badge {
    background: #1a2635;
    border: 1px solid #2e2740;
    border-radius: 10px;
    padding: 2px 7px;
    display: flex;
    align-items: baseline;
    gap: 2px;
}
.q-val { font-size: 0.82rem; font-weight: 700; color: #a3e635; font-variant-numeric: tabular-nums; }
.q-unit { font-size: 0.64rem; color: #7f8c8d; }
.arrow-head { font-size: 0.7rem; color: #e74c3c; }

.link-actions {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
    opacity: 0;
    transition: opacity 0.15s;
}
.link-item:hover .link-actions { opacity: 1; }

.btn-icon {
    width: 26px; height: 26px;
    background: none;
    border: 1px solid #2e2740;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.75rem;
    display: flex; align-items: center; justify-content: center;
    transition: background 0.15s;
}
.btn-edit:hover { background: #1e1e2c; }
.btn-del {
    color: #e74c3c;
    font-size: 1.1rem;
    line-height: 1;
}
.btn-del:hover { background: rgba(231, 76, 60, 0.15); border-color: #e74c3c; }

.empty-links {
    padding: 20px;
    text-align: center;
    color: #5d7f99;
    font-size: 0.8rem;
    font-style: italic;
}

/* ─── Summary Bar ────────────────────────────────────────────────────────── */
.summary-bar {
    display: flex;
    justify-content: space-between;
    padding: 8px 16px;
    background: #1a2532;
    border-top: 1px solid #2d4057;
    font-size: 0.76rem;
    color: #7f8c8d;
    flex-shrink: 0;
}
.summary-bar strong { color: #a3e635; }

/* ─── Transition ─────────────────────────────────────────────────────────── */
.link-fade-enter-active, .link-fade-leave-active { transition: all 0.25s ease; }
.link-fade-enter-from { opacity: 0; transform: translateY(-6px); }
.link-fade-leave-to   { opacity: 0; transform: translateX(10px); }

/* ─── Edit Overlay ───────────────────────────────────────────────────────── */
.edit-overlay {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.65);
    backdrop-filter: blur(3px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
}
.edit-modal {
    background: #1e1e2c;
    border: 1px solid #2e2740;
    border-radius: 10px;
    padding: 20px 24px;
    width: 260px;
    box-shadow: 0 12px 30px rgba(0,0,0,0.5);
}
.edit-modal h4 { margin: 0 0 8px; font-size: 0.95rem; color: #ecf0f1; }
.edit-pair {
    font-size: 0.78rem;
    color: #7f8c8d;
    margin: 0 0 14px;
    word-break: break-all;
}
.edit-arrow { color: #a3e635; margin: 0 4px; }
.edit-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
}
.btn-cancel {
    padding: 7px 14px;
    background: transparent;
    color: #95a5a6;
    border: 1px solid #465c71;
    border-radius: 5px;
    cursor: pointer;
    font-size: 0.85rem;
}
.btn-cancel:hover { color: #ecf0f1; border-color: #7f8c8d; }
.btn-save {
    padding: 7px 14px;
    background: #a3e635;
    color: #12121a;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    font-size: 0.85rem;
    font-weight: 600;
}
.btn-save:hover { background: #b6f04d; }
</style>
