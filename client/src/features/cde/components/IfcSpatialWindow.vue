<template>
  <!-- Sprint P/AP-12: Der frühere `chrome`-Zweig ist entfallen. Er hätte die
       Komponente wahlweise in ein schwebendes DraggableModal gehüllt — ein Weg,
       den seit Sprint U kein Aufrufer mehr nahm (alle setzten `chrome=false`),
       dessen Vorgabewert aber auf `true` stand. Das Chrome liefert jetzt
       ausschließlich CdePanel in der Leiste. -->
  <div class="rail-fill">
    <div class="spatial-window">

      <!-- Search -->
      <div class="sw-search">
        <CdeIcon class="search-icon" name="search" :size="13" />
        <input
          v-model="filterText"
          class="search-input"
          placeholder="Filtern…"
          spellcheck="false"
        />
        <button v-if="filterText" class="search-clear" @click="filterText = ''" title="Filter leeren" aria-label="Filter leeren">
          <CdeIcon name="close" :size="12" />
        </button>
      </div>

      <!-- Stufe 8 (Fahrplan Erdbau-Container, T6): je geladenem Modell ein Abschnitt
           mit seiner Herkunft — bis 2026-09-11 stand hier nur das ERSTE Modell, während
           die Fußzeile „n Modelle" zählte. Aushübe hängen unter ihrem Wirt, Gruppen
           (Fachmodell, Vorgang, System) stehen als eigener Zweig daneben. -->
      <div class="sw-body" ref="bodyRef">
        <div v-if="!ifc.spatialBaeume.length" class="empty-state">
          <CdeIcon class="empty-icon" name="bim" :size="30" />
          <div class="empty-text">IFC-Modell laden um die<br>Gebäudestruktur anzuzeigen</div>
        </div>

        <section v-for="baum in sichtbar" :key="baum.modelId" class="sw-modell" :data-modell="baum.modelId">
          <header class="sw-kopf" :class="{ aktiv: aktiv === baum.modelId }" @click="umschalten(baum.modelId)">
            <CdeIcon :name="zu.has(baum.modelId) ? 'chevron-right' : 'chevron-down'" :size="12" />
            <span class="sw-name" :title="baum.name">{{ baum.name }}</span>
            <span class="sw-chip" :class="`sw-chip--${kopf(baum).art}`" :title="kopf(baum).titel">{{ kopf(baum).text }}</span>
            <span v-if="kopf(baum).stand" class="sw-stand">{{ kopf(baum).stand }}</span>
            <span class="sw-zahl" :title="`${baum.knoten} Knoten in der Gliederung`">{{ baum.knoten }}</span>
            <!-- Das Auge je Modell (Abnahme 2026-09-12, A7): ganz aus, ganz ein. -->
            <button class="sw-auge" :class="{ aus: verborgen.has(baum.modelId) }"
                    :title="verborgen.has(baum.modelId) ? 'Einblenden' : 'Ausblenden'"
                    :aria-label="verborgen.has(baum.modelId) ? 'Modell einblenden' : 'Modell ausblenden'"
                    @click.stop="augeUmschalten(baum.modelId)">
              <CdeIcon :name="verborgen.has(baum.modelId) ? 'hidden' : 'visible'" :size="12" />
            </button>
            <!-- × (S3/K5, H3): im Satz „Aus dem Satz nehmen“, mit Rückfrage; ohne Satz schliessen.
                 Der Eigenbau hat keins — leer wird er über den Verlauf. -->
            <button v-if="!baum.eigenbau" class="sw-weg"
                    :title="cde.aktiverSatz ? `${baum.name} aus dem Satz nehmen` : `${baum.name} schließen`"
                    :aria-label="cde.aktiverSatz ? 'Aus dem Satz nehmen' : 'Modell schließen'"
                    @click.stop="api.modellEntfernen?.(baum.modelId)">
              <CdeIcon name="close" :size="12" />
            </button>
          </header>
          <template v-if="!zu.has(baum.modelId)">
            <IfcSpatialTree v-if="baum.wurzel" :tree="baum.wurzel" :bare="true" :filter="filterText"
                            @toggle-storey="onToggleStorey" @zoom-to="onZoomTo" />
            <div v-else class="sw-leer">ohne Raumgliederung</div>
            <IfcSpatialTree v-if="baum.gruppen" :tree="baum.gruppen" :bare="true" :filter="filterText"
                            @toggle-storey="onToggleStorey" @zoom-to="onZoomTo" />
          </template>
        </section>
      </div>

      <!-- Footer stats -->
      <div v-if="ifc.spatialBaeume.length" class="sw-footer">
        <span class="footer-info">{{ ifc.spatialBaeume.length }} Modell{{ ifc.spatialBaeume.length !== 1 ? 'e' : '' }}</span>
      </div>

    </div>
  </div>
</template>

<script setup>
import { computed, provide, ref } from 'vue';
import CdeIcon from './ui/CdeIcon.vue';
import IfcSpatialTree from './IfcSpatialTree.vue';
import { useIfcStore } from '../stores/useIfcStore.js';
import { useCdeStore } from '../stores/useCdeStore.js';
import { useViewerApi } from '../composables/viewerApi.js';
import { herkunftChip } from '../services/Herkunft.js';
import { trifft } from '../services/Bauwerksstruktur.js';

// Kein 'close'-Emit mehr: Das Schließen liegt bei CdePanel, das die
// Leiste kennt und den Panel-Store führt.
const ifc  = useIfcStore();
const cde  = useCdeStore();
const api = useViewerApi();

const filterText = ref('');
const bodyRef    = ref(null);
// Zugeklappte Abschnitte und der zuletzt berührte. „Aufklappen" wirkt NUR dort
// (Landmine des Fahrplans: IFCOUT hat 187 000 Entitäten — alles auf einmal hängt den Tab).
const zu    = ref(new Set());
const aktiv = ref(null);

const sichtbar = computed(() => ifc.spatialBaeume.filter(b =>
  !filterText.value || trifft(b.wurzel, filterText.value) || trifft(b.gruppen, filterText.value)));

// DAS AUGE JE MODELL (Abnahme 2026-09-12, A7). Die Wahrheit führt die Engine
// (`modellSichtbar`); der Zähler im Store sagt Fenster und Pille, dass sich
// etwas geändert hat — ein eigener Spiegel hier liefe auseinander.
const verborgen = computed(() => {
  void ifc.sichtbarkeitStand;
  return new Set(ifc.spatialBaeume.map(b => b.modelId).filter(id => !(api.modellSichtbar?.(id) ?? true)));
});
async function augeUmschalten(modelId) {
  aktiv.value = modelId;
  await api.setzeModellSichtbar?.(modelId, verborgen.value.has(modelId));
}

/**
 * DAS AUGE JE VORGANG (Teil XXI, E3) — am Knoten eines Erdbau-Vorgangs.
 *
 * Ein Vorgang, den ein späterer wieder überformt hat (Auffüllung über einer
 * Grube), steht nicht im Raum: sonst lägen zwei Erdkörper und das Netz
 * übereinander. Über dieses Auge kommt er zurück. Die Regel und der Zustand
 * leben in der Engine; hier wird nur geschaltet.
 */
provide('vorgangAuge', async (knoten, sichtbar) => {
  await api.setzeVorgangSichtbar?.(knoten.vorgang, sichtbar);
});

// „Vorgang entfernen" am Knoten eines Erdbau-Vorgangs (A6) — mit Rückfrage.
provide('vorgangEntfernen', async (knoten) => {
  if (!confirm(`„${knoten.name}" entfernen?\nAushub, Auftrag und die Grube im Gelände gehen; der Verlauf behält den Schritt.`)) return;
  await api.vorgangEntfernen?.(knoten.vorgang);
});

/** Der Kopf je Modell: Chip und Stand aus dem Register — reaktiv, das Register kommt oft nach dem Modell. */
function kopf(baum) {
  // Der Eigenbau ist kein Dokument — sein Abschnitt kommt aus dem Verlauf (A7).
  if (baum.eigenbau) return { art: 'erdbau', text: 'Eigenbau', titel: 'Aus dem Verlauf gebaut — kein Registerdokument', stand: '' };
  const dok = baum.sha256 ? (cde.dokumente ?? []).find(d => d.sha256 === baum.sha256) : null;
  const stand = dok ? `R${dok.revision ?? '?'} · ${dok.status ?? 'WIP'}` : '';
  const chip = dok ? herkunftChip(dok) : null;
  if (chip) return { ...chip, stand };
  return dok ? { art: 'lieferung', text: 'Lieferung', titel: dok.name ?? '', stand }
             : { art: 'lokal', text: 'lokal', titel: 'nicht im Register', stand: '' };
}

function umschalten(modelId) {
  const neu = new Set(zu.value);
  if (neu.has(modelId)) neu.delete(modelId); else neu.add(modelId);
  zu.value = neu;
  aktiv.value = modelId;
}

async function onToggleStorey({ localId, visible, modelId }) {
  if (modelId != null) aktiv.value = modelId;
  await api.setStoreyVisible(localId, visible, modelId ?? null);
}

async function onZoomTo({ localId, modelId }) {
  if (modelId != null) aktiv.value = modelId;
  await api.zoomToLocalId(localId, modelId ?? null);
}

/** Der Abschnitt, auf den „Aufklappen" wirkt: der zuletzt berührte, sonst der erste offene. */
function _abschnitt() {
  const id = aktiv.value ?? sichtbar.value.find(b => !zu.value.has(b.modelId))?.modelId;
  if (id == null) return null;
  return [...(bodyRef.value?.querySelectorAll('.sw-modell') ?? [])].find(s => s.dataset.modell === String(id)) ?? null;
}
function expandAll()   { _abschnitt()?.querySelectorAll('.caret[data-open="false"]').forEach(el => el.click()); }
function collapseAll() { bodyRef.value?.querySelectorAll('.caret[data-open="true"]').forEach(el => el.click()); }

// Sprint P/AP-12: Die beiden Knöpfe saßen im entfallenen Modal-Kopf. Sie
// wandern in den `head-actions`-Slot von CdePanel — dessen ersten Nutzer.
defineExpose({ expandAll, collapseAll });
</script>

<style scoped>
/* Sprint U: In der Panel-Leiste füllt die Komponente das Panel-Body */
.rail-fill { display: flex; flex-direction: column; height: 100%; min-height: 0; }

.spatial-window {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background: var(--cde-float-deeper);
}

/* Das CSS des entfallenen Modal-Kopfes ist mit ihm weggefallen (Sprint P/AP-12). */

/* ── Search ── */
.sw-search {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.45rem 0.75rem;
  border-bottom: 1px solid var(--cde-tint-weak);
  background: var(--cde-float-deep);
  flex-shrink: 0;
}
.search-icon { color: var(--cde-text-mute); flex-shrink: 0; }
.search-input {
  flex: 1;
  background: none;
  border: none;
  outline: none;
  color: var(--cde-text);
  font-size: 0.78rem;
  caret-color: var(--cde-accent);
}
.search-input::placeholder { color: var(--cde-text-dimmer); }
.search-clear {
  display: inline-flex; align-items: center; justify-content: center;
  background: none; border: none; cursor: pointer;
  color: var(--cde-text-dimmer); padding: 0;
  transition: color 0.12s;
}
.search-clear:hover { color: var(--cde-danger); }

/* ── Body ── */
.sw-body {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: thin;
  scrollbar-color: var(--cde-tint-strong) transparent;
}

/* ── Empty state ── */
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.8rem;
  padding: 3rem 1rem;
}
.empty-icon { color: var(--cde-text-dimmer); opacity: 0.6; }
.empty-text {
  font-size: 0.78rem;
  color: var(--cde-text-dimmer);
  text-align: center;
  line-height: 1.5;
}

/* ── Abschnitt je Modell (Stufe 8) ── */
.sw-modell + .sw-modell { border-top: 1px solid var(--cde-tint-weak); }
.sw-kopf {
  display: flex; align-items: center; gap: 0.35rem;
  padding: 0.35rem 0.6rem; cursor: pointer; user-select: none;
  position: sticky; top: 0; z-index: 1;
  background: var(--cde-float-deep); color: var(--cde-text-soft); font-size: 0.74rem;
}
.sw-kopf.aktiv { color: var(--cde-text-bright); }
.sw-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
.sw-chip {
  flex-shrink: 0; font-size: 0.62rem; padding: 0.05rem 0.35rem;
  border: 1px solid var(--cde-tint); border-radius: var(--cde-radius-sm); color: var(--cde-text-dimmer);
}
.sw-chip--erdbau, .sw-chip--verbund { color: var(--cde-accent-soft); border-color: var(--cde-accent-soft); }
.sw-stand, .sw-zahl { flex-shrink: 0; font-size: 0.62rem; color: var(--cde-text-dimmer); font-variant-numeric: tabular-nums; }
/* Das Auge je Modell (Abnahme 2026-09-12, A7) */
.sw-auge {
  flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center;
  background: none; border: none; padding: 0.1rem; cursor: pointer;
  color: var(--cde-text-dim); border-radius: var(--cde-radius-sm);
}
.sw-auge:hover { color: var(--cde-text); background: var(--cde-fill-hover); }
.sw-auge.aus { color: var(--cde-text-dimmer); }
.sw-weg {
  flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center;
  background: none; border: none; padding: 0.1rem; cursor: pointer;
  color: var(--cde-text-dimmer); border-radius: var(--cde-radius-sm);
  touch-action: manipulation;
}
.sw-weg:hover { color: var(--cde-danger); background: var(--cde-fill-hover); }
/* Auf dem Finger: Auge und × mit unsichtbarer Trefferfläche (T1). */
@media (pointer: coarse) {
  .sw-auge, .sw-weg { position: relative; }
  .sw-auge::after, .sw-weg::after { content: ''; position: absolute; inset: -9px; }
}
.sw-leer { padding: 0.4rem 1.4rem; font-size: 0.7rem; color: var(--cde-text-dimmer); }

/* ── Footer ── */
.sw-footer {
  flex-shrink: 0;
  padding: 0.35rem 0.9rem;
  border-top: 1px solid var(--cde-tint-weak);
  background: var(--cde-float-deep);
}
.footer-info {
  font-size: 0.65rem;
  color: var(--cde-text-dimmer);
}
</style>
