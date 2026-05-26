<template>
  <div class="ifc-sidebar">

    <!-- ── Pset-Browser-Overlay ───────────────────────────────────────── -->
    <PsetBrowser
      v-if="showPsetBrowser"
      :entityType="element.type"
      :initQuery="psetBrowserQuery"
      @close="closePsetBrowser"
      @add="emit('add-pset', $event)"
    />

    <!-- ── Hauptansicht ──────────────────────────────────────────────── -->
    <template v-else>

      <!-- Header -->
      <div class="sb-header">
        <span class="sb-title">Eigenschaften</span>
        <div class="sb-header-actions">
          <button class="sb-btn-pset" @click="openPsetBrowser()" title="Pset hinzufügen">
            + Pset
          </button>
          <button class="sb-btn-close" @click="emit('close')" title="Auswahl aufheben">
            &times;
          </button>
        </div>
      </div>

      <div class="sb-body">

        <!-- ① Entity-Typ (aufklappbar) -->
        <div class="entity-section">
          <button class="entity-header" @click="showEntityDetail = !showEntityDetail">
            <span class="entity-label">{{ entityInfo?.label || entityInfo?.name || element.type || '—' }}</span>
            <span class="entity-name">{{ entityInfo?.name || element.type }}</span>
            <span v-if="entityInfo?.domain" class="entity-domain">{{ entityInfo.domain }}</span>
            <span class="entity-chevron">{{ showEntityDetail ? '▲' : '▼' }}</span>
          </button>

          <Transition name="expand">
            <div v-if="showEntityDetail && entityInfo" class="entity-detail">

              <p v-if="entityInfo.description" class="entity-desc">
                {{ entityInfo.description }}
              </p>

              <!-- Vererbungskette -->
              <div v-if="entityInfo.hierarchy.length" class="hierarchy">
                <span
                  v-for="(step, i) in entityInfo.hierarchy"
                  :key="step"
                  class="hier-step"
                  :class="{ 'hier-leaf': i === entityInfo.hierarchy.length - 1 }"
                >
                  <span class="hier-name">{{ step }}</span>
                  <span v-if="i < entityInfo.hierarchy.length - 1" class="hier-sep">›</span>
                </span>
              </div>

              <!-- Badges: Schema-Version + PredefinedType -->
              <div class="badge-row">
                <span
                  v-for="s in entityInfo.schema"
                  :key="s"
                  class="badge badge-schema"
                >{{ s }}</span>
                <span v-if="element.predefinedType" class="badge badge-predtype">
                  {{ element.predefinedType }}
                </span>
              </div>

              <!-- EXPRESS-Attribute -->
              <div v-if="entityInfo.standardAttributes?.length" class="schema-block">
                <div class="schema-label">Attribute (EXPRESS)</div>
                <table class="attr-table">
                  <tbody>
                    <tr v-for="a in entityInfo.standardAttributes" :key="a.name">
                      <td class="a-name">{{ a.name }}</td>
                      <td class="a-type">{{ a.type }}</td>
                      <td class="a-card" :class="a.card === '1:1' ? 'card-req' : 'card-opt'">
                        {{ a.card }}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <!-- Passende Psets laut Schema -->
              <div v-if="applicablePsets.length" class="schema-block">
                <div class="schema-label">Passende Psets</div>
                <div class="pset-hints">
                  <div
                    v-for="[name, tpl] in applicablePsets"
                    :key="name"
                    class="pset-hint-row"
                  >
                    <span class="ph-name">{{ name }}</span>
                    <span class="ph-count">{{ tpl.props.length }} Prop.</span>
                    <button
                      class="ph-add"
                      title="Pset hinzufügen"
                      @click.stop="openPsetBrowser(name)"
                    >+</button>
                  </div>
                </div>
              </div>

            </div>
          </Transition>
        </div>

        <!-- ② IFC-Attribute aus der Datei (dynamisch) -->
        <div class="attr-section">
          <div class="kv-row">
            <span class="kv-label">Name</span>
            <span class="kv-value">{{ element.name || '—' }}</span>
          </div>
          <div v-if="element.typeName" class="kv-row">
            <span class="kv-label">Typ</span>
            <span class="kv-value">{{ element.typeName }}</span>
          </div>
          <div v-if="element.description" class="kv-row">
            <span class="kv-label">Beschreibung</span>
            <span class="kv-value">{{ element.description }}</span>
          </div>
          <!-- Alle weiteren skalaren IFC-Attribute aus der Datei -->
          <div v-for="attr in element.attrs" :key="attr.name" class="kv-row">
            <span class="kv-label">{{ attr.name }}</span>
            <span class="kv-value">{{ attr.value }}</span>
          </div>
          <div class="kv-row">
            <span class="kv-label">GlobalId</span>
            <span class="kv-value kv-guid">{{ element.globalId || '—' }}</span>
          </div>
        </div>

        <!-- ③ Materialien -->
        <div v-if="element.materials?.length" class="attr-section">
          <div class="section-label">Material</div>
          <div v-for="mat in element.materials" :key="mat" class="kv-row">
            <span class="kv-value">{{ mat }}</span>
          </div>
        </div>

        <!-- ④ Fehlermeldung -->
        <div v-if="psetError" class="sb-error">{{ psetError }}</div>

        <!-- ⑤ Psets + Mengenermittlung aus dem Modell -->
        <div v-if="element.psets.length || element.quantities?.length" class="psets-list">
          <div
            v-for="group in [...element.psets, ...(element.quantities ?? [])]"
            :key="group.name"
            class="pset-group"
          >
            <button class="pset-toggle" @click="togglePset(group.name)">
              <span class="pset-arrow">{{ expandedPsets.has(group.name) ? '▼' : '▶' }}</span>
              {{ group.name }}
            </button>
            <div v-if="expandedPsets.has(group.name)" class="pset-props">
              <div v-for="prop in group.props" :key="prop.name" class="kv-row">
                <span class="kv-label">{{ prop.name }}</span>
                <span class="kv-value">{{ prop.value ?? '—' }}</span>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="sb-empty">
          Keine Psets —
          <button class="sb-link" @click="openPsetBrowser()">Jetzt hinzufügen</button>
        </div>

      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, reactive, watch } from 'vue';
import PsetBrowser from './PsetBrowser.vue';
import { getEntityInfo } from '../data/entity-schema.js';
import { getPsetsForType } from '../data/pset-templates.js';

const props = defineProps({
  element:   { type: Object, required: true },
  psetError: { type: String, default: null  },
});

const emit = defineEmits(['close', 'add-pset']);

// ── local UI state ──────────────────────────────────────────────────────────
const showEntityDetail  = ref(false);
const showPsetBrowser   = ref(false);
const psetBrowserQuery  = ref('');
const expandedPsets     = reactive(new Set());

// Reset panel state whenever a new element is selected
watch(
  () => props.element?.globalId,
  () => {
    showEntityDetail.value = false;
    showPsetBrowser.value  = false;
    psetBrowserQuery.value = '';
    expandedPsets.clear();
    // Auto-open the first available group (pset or quantity)
    const firstGroup = props.element?.psets?.[0] ?? props.element?.quantities?.[0];
    if (firstGroup) expandedPsets.add(firstGroup.name);
  },
  { immediate: true }
);

// ── derived ─────────────────────────────────────────────────────────────────
const entityInfo = computed(() => getEntityInfo(props.element.type));

const applicablePsets = computed(() =>
  getPsetsForType(props.element.type).filter(([, t]) => t.applicableTo[0] !== '*')
);

// ── actions ─────────────────────────────────────────────────────────────────
function togglePset(name) {
  expandedPsets.has(name) ? expandedPsets.delete(name) : expandedPsets.add(name);
}

function openPsetBrowser(preselect = '') {
  psetBrowserQuery.value = preselect;
  showPsetBrowser.value  = true;
}

function closePsetBrowser() {
  showPsetBrowser.value  = false;
  psetBrowserQuery.value = '';
}
</script>

<style scoped>
/* ── Shell ── */
.ifc-sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: rgba(20, 22, 30, 0.92);
  border-radius: 10px;
  border: 1px solid rgba(255,255,255,0.1);
  box-shadow: 0 8px 32px rgba(0,0,0,0.4);
  backdrop-filter: blur(10px);
  overflow: hidden;
  font-family: system-ui, sans-serif;
}

/* ── Header ── */
.sb-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.6rem 0.75rem;
  background: rgba(52, 152, 219, 0.25);
  border-bottom: 1px solid rgba(255,255,255,0.08);
  flex-shrink: 0;
}

.sb-title {
  font-size: 0.78rem;
  font-weight: 700;
  color: #90caf9;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.sb-header-actions { display: flex; align-items: center; gap: 0.35rem; }

.sb-btn-pset {
  background: rgba(52,152,219,0.25);
  border: 1px solid rgba(52,152,219,0.4);
  border-radius: 4px;
  color: #90caf9;
  font-size: 0.65rem;
  font-weight: 600;
  padding: 0.15rem 0.4rem;
  cursor: pointer;
  transition: background 0.15s;
}
.sb-btn-pset:hover { background: rgba(52,152,219,0.45); }

.sb-btn-close {
  background: none;
  border: none;
  color: #90a4ae;
  font-size: 1.2rem;
  cursor: pointer;
  line-height: 1;
  padding: 0 0.2rem;
  border-radius: 4px;
  transition: color 0.15s;
}
.sb-btn-close:hover { color: #ef5350; }

/* ── Body ── */
.sb-body {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem 0;
  scrollbar-width: thin;
  scrollbar-color: rgba(255,255,255,0.15) transparent;
}

/* ── Entity section ── */
.entity-section {
  border-bottom: 1px solid rgba(255,255,255,0.07);
}

.entity-header {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  background: rgba(128,222,234,0.07);
  border: none;
  padding: 0.5rem 0.75rem;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s;
}
.entity-header:hover { background: rgba(128,222,234,0.13); }

.entity-label {
  flex: 1;
  font-size: 0.8rem;
  font-weight: 700;
  color: #80deea;
}

.entity-name {
  font-size: 0.6rem;
  color: #37474f;
  font-family: 'Roboto Mono', monospace;
  flex-shrink: 0;
}

.entity-domain {
  font-size: 0.6rem;
  color: #546e7a;
  background: rgba(255,255,255,0.06);
  padding: 0.1rem 0.35rem;
  border-radius: 3px;
  flex-shrink: 0;
}

.entity-chevron {
  font-size: 0.6rem;
  color: #546e7a;
  flex-shrink: 0;
}

.entity-detail {
  padding: 0.5rem 0.75rem 0.65rem;
  background: rgba(0,0,0,0.2);
}

.entity-desc {
  font-size: 0.7rem;
  color: #90a4ae;
  line-height: 1.5;
  margin: 0 0 0.45rem;
}

/* Inheritance chain */
.hierarchy {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.1rem;
  margin-bottom: 0.45rem;
}

.hier-step {
  display: inline-flex;
  align-items: center;
  gap: 0.1rem;
}

.hier-name {
  font-size: 0.6rem;
  color: #546e7a;
  font-family: 'Roboto Mono', monospace;
}

.hier-leaf .hier-name {
  color: #80deea;
  font-weight: 700;
}

.hier-sep { font-size: 0.58rem; color: #37474f; }

/* Badges */
.badge-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  margin-bottom: 0.45rem;
}

.badge {
  font-size: 0.58rem;
  padding: 0.1rem 0.35rem;
  border-radius: 3px;
  font-family: 'Roboto Mono', monospace;
}

.badge-schema {
  background: rgba(52,152,219,0.15);
  border: 1px solid rgba(52,152,219,0.28);
  color: #64b5f6;
}

.badge-predtype {
  background: rgba(255,183,77,0.12);
  border: 1px solid rgba(255,183,77,0.3);
  color: #ffcc80;
}

/* Schema blocks (Attributes / Psets) */
.schema-block {
  margin-top: 0.55rem;
  border-top: 1px solid rgba(255,255,255,0.07);
  padding-top: 0.4rem;
}

.schema-label {
  font-size: 0.58rem;
  font-weight: 700;
  color: #546e7a;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  margin-bottom: 0.3rem;
}

/* EXPRESS attributes */
.attr-table { width: 100%; border-collapse: collapse; }

.attr-table td {
  padding: 0.14rem 0.2rem;
  font-size: 0.63rem;
  vertical-align: middle;
  border-bottom: 1px solid rgba(255,255,255,0.04);
}

.a-name {
  color: #b0bec5;
  font-family: 'Roboto Mono', monospace;
  font-weight: 500;
  white-space: nowrap;
}

.a-type {
  color: #78909c;
  font-family: 'Roboto Mono', monospace;
  font-size: 0.58rem;
}

.a-card {
  font-size: 0.56rem;
  font-family: 'Roboto Mono', monospace;
  font-weight: 700;
  text-align: right;
  padding-left: 0.35rem;
  white-space: nowrap;
}

.card-req { color: #ef9a9a; }
.card-opt { color: #80cbc4; }

/* Applicable pset hints */
.pset-hints { display: flex; flex-direction: column; gap: 1px; }

.pset-hint-row {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.18rem 0.2rem;
  border-radius: 4px;
  transition: background 0.12s;
}
.pset-hint-row:hover { background: rgba(255,255,255,0.04); }

.ph-name {
  flex: 1;
  font-size: 0.63rem;
  color: #b0bec5;
  font-family: 'Roboto Mono', monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ph-count { font-size: 0.58rem; color: #546e7a; flex-shrink: 0; }

.ph-add {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  background: rgba(52,152,219,0.2);
  border: 1px solid rgba(52,152,219,0.35);
  border-radius: 3px;
  color: #90caf9;
  font-size: 0.72rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  line-height: 1;
  transition: background 0.12s;
}
.ph-add:hover { background: rgba(52,152,219,0.45); }

/* ── Attribute section ── */
.attr-section {
  padding: 0.4rem 0.75rem 0.5rem;
  border-bottom: 1px solid rgba(255,255,255,0.07);
}

.section-label {
  font-size: 0.58rem;
  font-weight: 700;
  color: #546e7a;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  margin-bottom: 0.25rem;
}

.kv-row {
  display: flex;
  gap: 0.5rem;
  padding: 0.2rem 0;
  align-items: flex-start;
}

.kv-label {
  flex-shrink: 0;
  width: 86px;
  font-size: 0.68rem;
  color: #78909c;
  padding-top: 0.05rem;
}

.kv-value {
  flex: 1;
  font-size: 0.73rem;
  color: #cfd8dc;
  word-break: break-all;
}

.kv-guid {
  font-family: 'Roboto Mono', monospace;
  font-size: 0.63rem;
  color: #80cbc4;
}

/* ── Error banner ── */
.sb-error {
  margin: 0.4rem 0.75rem;
  padding: 0.35rem 0.5rem;
  background: rgba(239,83,80,0.12);
  border: 1px solid rgba(239,83,80,0.3);
  border-radius: 5px;
  font-size: 0.68rem;
  color: #ef9a9a;
}

/* ── Psets from model ── */
.psets-list { padding: 0.25rem 0; }

.pset-group { border-bottom: 1px solid rgba(255,255,255,0.05); }

.pset-toggle {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  background: none;
  border: none;
  color: #b0bec5;
  font-size: 0.72rem;
  font-weight: 600;
  padding: 0.38rem 0.75rem;
  cursor: pointer;
  text-align: left;
  transition: background 0.12s, color 0.12s;
}
.pset-toggle:hover { background: rgba(255,255,255,0.05); color: #e0e0e0; }

.pset-arrow { font-size: 0.58rem; color: #546e7a; }

.pset-props { padding: 0 0.75rem 0.35rem 1.45rem; }

/* ── Empty state ── */
.sb-empty {
  padding: 0.75rem;
  font-size: 0.72rem;
  color: #546e7a;
  text-align: center;
}

.sb-link {
  background: none;
  border: none;
  color: #90caf9;
  font-size: 0.72rem;
  cursor: pointer;
  padding: 0;
  text-decoration: underline;
}

/* ── Expand transition ── */
.expand-enter-active,
.expand-leave-active {
  transition: max-height 0.25s ease, opacity 0.2s ease;
  overflow: hidden;
  max-height: 700px;
}
.expand-enter-from,
.expand-leave-to {
  max-height: 0;
  opacity: 0;
}
</style>
