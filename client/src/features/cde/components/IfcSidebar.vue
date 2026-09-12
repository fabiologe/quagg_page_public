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
            <span v-if="fachbereich" class="entity-domain">{{ fachbereich }}</span>
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
                <span v-if="entityInfo.abgekuendigt" class="badge badge-schema">abgekündigt</span>
                <span v-if="entityInfo.nachfolger" class="badge badge-schema">in 4.3: {{ entityInfo.nachfolger }}</span>
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
import { fachbereichVon } from '../data/fachbereiche.js';

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
// Anzeige-Etikett aus dem Baum (data/fachbereiche.js) — kein Schemawissen.
const fachbereich = computed(() => fachbereichVon(entityInfo.value?.hierarchy));

// Über die Vererbung und mit PredefinedType: eine Vorlage für IfcElement gilt
// für jede Wand, eine für IfcActuator/ELECTRICACTUATOR nur für diesen Typ.
const applicablePsets = computed(() =>
  getPsetsForType(props.element.type, props.element.predefinedType)
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
  background: var(--cde-float-deep);
  border-radius: 10px;
  border: 1px solid var(--cde-tint-strong);
  box-shadow: var(--cde-shadow-lg);
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
  background: var(--cde-accent-fill-hi);   /* Token statt 25 % von Hand — im hellen Modus leiser (H6) */
  border-bottom: 1px solid var(--cde-tint);
  flex-shrink: 0;
}

.sb-title {
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--cde-accent-soft);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.sb-header-actions { display: flex; align-items: center; gap: 0.35rem; }

.sb-btn-pset {
  background: var(--cde-accent-fill);
  border: 1px solid var(--cde-accent-line);
  border-radius: 4px;
  color: var(--cde-accent-soft);
  font-size: 0.65rem;
  font-weight: 600;
  padding: 0.15rem 0.4rem;
  cursor: pointer;
  transition: background 0.15s;
}
.sb-btn-pset:hover { background: var(--cde-accent-fill-hi); }

.sb-btn-close {
  background: none;
  border: none;
  color: var(--cde-text-dim);
  font-size: 1.2rem;
  cursor: pointer;
  line-height: 1;
  padding: 0 0.2rem;
  border-radius: 4px;
  transition: color 0.15s;
}
.sb-btn-close:hover { color: var(--cde-danger); }

/* ── Body ── */
.sb-body {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem 0;
  scrollbar-width: thin;
  scrollbar-color: var(--cde-tint-max) transparent;
}

/* ── Entity section ── */
.entity-section {
  border-bottom: 1px solid var(--cde-tint);
}

.entity-header {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  background: var(--cde-merkmal-fill);
  border: none;
  padding: 0.5rem 0.75rem;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s;
}
.entity-header:hover { background: var(--cde-merkmal-fill-hi); }

.entity-label {
  flex: 1;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--cde-merkmal);
}

.entity-name {
  font-size: 0.6rem;
  color: var(--cde-text-dimmer);
  font-family: 'Roboto Mono', monospace;
  flex-shrink: 0;
}

.entity-domain {
  font-size: 0.6rem;
  color: var(--cde-text-dimmer);
  background: var(--cde-tint-weak);
  padding: 0.1rem 0.35rem;
  border-radius: 3px;
  flex-shrink: 0;
}

.entity-chevron {
  font-size: 0.6rem;
  color: var(--cde-text-dimmer);
  flex-shrink: 0;
}

.entity-detail {
  padding: 0.5rem 0.75rem 0.65rem;
  background: var(--cde-sunken);
}

.entity-desc {
  font-size: 0.7rem;
  color: var(--cde-text-dim);
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
  color: var(--cde-text-dimmer);
  font-family: 'Roboto Mono', monospace;
}

.hier-leaf .hier-name {
  color: var(--cde-merkmal);
  font-weight: 700;
}

.hier-sep { font-size: 0.58rem; color: var(--cde-text-dimmer); }

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
  background: color-mix(in srgb, var(--cde-accent) 15%, transparent);
  border: 1px solid color-mix(in srgb, var(--cde-accent) 28%, transparent);
  color: var(--cde-accent-soft);
}

.badge-predtype {
  background: color-mix(in srgb, var(--cde-warn) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--cde-warn) 30%, transparent);
  color: var(--cde-warn-soft);
}

/* Schema blocks (Attributes / Psets) */
.schema-block {
  margin-top: 0.55rem;
  border-top: 1px solid var(--cde-tint);
  padding-top: 0.4rem;
}

.schema-label {
  font-size: 0.58rem;
  font-weight: 700;
  color: var(--cde-text-dimmer);
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
  border-bottom: 1px solid var(--cde-tint-weak);
}

.a-name {
  color: var(--cde-text-soft);
  font-family: 'Roboto Mono', monospace;
  font-weight: 500;
  white-space: nowrap;
}

.a-type {
  color: var(--cde-text-mute);
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

.card-req { color: var(--cde-danger-soft); }
.card-opt { color: var(--cde-merkmal-soft); }

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
.pset-hint-row:hover { background: var(--cde-tint-weak); }

.ph-name {
  flex: 1;
  font-size: 0.63rem;
  color: var(--cde-text-soft);
  font-family: 'Roboto Mono', monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ph-count { font-size: 0.58rem; color: var(--cde-text-dimmer); flex-shrink: 0; }

.ph-add {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  background: color-mix(in srgb, var(--cde-accent) 20%, transparent);
  border: 1px solid color-mix(in srgb, var(--cde-accent) 35%, transparent);
  border-radius: 3px;
  color: var(--cde-accent-soft);
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
.ph-add:hover { background: color-mix(in srgb, var(--cde-accent) 45%, transparent); }

/* ── Attribute section ── */
.attr-section {
  padding: 0.4rem 0.75rem 0.5rem;
  border-bottom: 1px solid var(--cde-tint);
}

.section-label {
  font-size: 0.58rem;
  font-weight: 700;
  color: var(--cde-text-dimmer);
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
  color: var(--cde-text-mute);
  padding-top: 0.05rem;
}

.kv-value {
  flex: 1;
  font-size: 0.73rem;
  color: var(--cde-text);
  word-break: break-all;
}

.kv-guid {
  font-family: 'Roboto Mono', monospace;
  font-size: 0.63rem;
  color: var(--cde-merkmal-soft);
}

/* ── Error banner ── */
.sb-error {
  margin: 0.4rem 0.75rem;
  padding: 0.35rem 0.5rem;
  background: color-mix(in srgb, var(--cde-danger) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--cde-danger) 30%, transparent);
  border-radius: 5px;
  font-size: 0.68rem;
  color: var(--cde-danger-soft);
}

/* ── Psets from model ── */
.psets-list { padding: 0.25rem 0; }

.pset-group { border-bottom: 1px solid var(--cde-tint-weak); }

.pset-toggle {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  background: none;
  border: none;
  color: var(--cde-text-soft);
  font-size: 0.72rem;
  font-weight: 600;
  padding: 0.38rem 0.75rem;
  cursor: pointer;
  text-align: left;
  transition: background 0.12s, color 0.12s;
}
.pset-toggle:hover { background: var(--cde-tint-weak); color: var(--cde-text-bright); }

.pset-arrow { font-size: 0.58rem; color: var(--cde-text-dimmer); }

.pset-props { padding: 0 0.75rem 0.35rem 1.45rem; }

/* ── Empty state ── */
.sb-empty {
  padding: 0.75rem;
  font-size: 0.72rem;
  color: var(--cde-text-dimmer);
  text-align: center;
}

.sb-link {
  background: none;
  border: none;
  color: var(--cde-accent-soft);
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
