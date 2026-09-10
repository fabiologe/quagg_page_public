<template>
  <!-- Sprint P/AP-12: Der frühere `chrome`-Zweig ist entfallen. Er hätte die
       Komponente wahlweise in ein schwebendes DraggableModal gehüllt — ein Weg,
       den seit Sprint U kein Aufrufer mehr nahm (alle setzten `chrome=false`),
       dessen Vorgabewert aber auf `true` stand. Das Chrome liefert jetzt
       ausschließlich CdePanel in der Leiste. -->
  <div class="rail-fill">
    <div class="props-window">
      <div class="props-body">
        <!-- Kein Element gewählt -->
        <div v-if="!ifc.selectedElement" class="empty-state">
          <CdeIcon class="empty-icon" name="pointer" :size="30" />
          <div class="empty-text">Element im Viewer anklicken</div>
        </div>

        <!-- Element geladen -->
        <template v-else>

          <!-- Bridge-Export-Leiste (nur für strukturrelevante Elemente) -->
          <div v-if="isBridgeLike" class="bridge-export-bar">
            <span class="bridge-hint">Hydraulisches Sonderbauwerk</span>
            <button
              class="bridge-copy-btn"
              :disabled="isCopying"
              title="Bounding-Box als Bridge-JSON in Zwischenablage kopieren"
              @click="copyAsBridge"
            >
              <CdeIcon :name="isCopying ? 'busy' : 'copy'" :class="{ 'is-busy': isCopying }" :size="12" />
              Als Brücke kopieren
            </button>
          </div>

          <!-- Anzeigeform (Stufe 0): die geformte Fläche ist kein Bauteil. In
               IFC ist der Aushub ein IfcEarthworksCut am Ur-Gelände; diese
               Fläche zeigt nur, wie es danach aussieht — und geht nicht in
               den Export. Ohne diesen Satz stand hier „TERRAIN" wie bei
               einer Lieferung. -->
          <div v-if="anzeigeform" class="anzeigeform-hinweis">
            <CdeIcon name="terrain" :size="12" />
            <span>
              <b>Anzeigeform</b> — kein Bauteil, nicht im Export. Zeigt das Gelände
              <code>{{ anzeigeform.quelle }}</code> nach allen Formungen.
            </span>
          </div>

          <IfcSidebar
            :element="ifc.selectedElement"
            :psetError="ifc.psetError"
            @close="clearSelection"
            @add-pset="onAddPset"
          />
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import CdeIcon from './ui/CdeIcon.vue';
import IfcSidebar from './IfcSidebar.vue';
import { useIfcStore } from '../stores/useIfcStore.js';
import { useAenderungen } from '../stores/useAenderungen.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { useCdeStore } from '../stores/useCdeStore.js';
import { useViewerApi } from '../composables/viewerApi.js';
import { istAnzeigeform } from '../services/Bauteilrezepte.js';

// Kein 'close'-Emit mehr: Das Schließen liegt bei CdePanel, das die
// Leiste kennt und den Panel-Store führt.
const ifc  = useIfcStore();
const aenderungen = useAenderungen();
const bearbeitung = useBearbeitung();
const cde = useCdeStore();
const api = useViewerApi();
const isCopying = ref(false);

const BRIDGE_TYPES = ['IFCBEAM', 'IFCSLAB', 'IFCCOLUMN', 'IFCBRIDGE', 'IFCBUILDINGELEMENT', 'IFCMEMBER'];

const isBridgeLike = computed(() =>
  BRIDGE_TYPES.includes((ifc.selectedElement?.type ?? '').toUpperCase())
);

/** Der Bauplan des gewählten Bauteils, falls die CDE es erzeugt hat — und ob es nur Anzeige ist. */
const anzeigeform = computed(() => {
  const gid = ifc.selectedElement?.globalId;
  const plan = gid ? aenderungen.wirksamerStand('erzeugt').get(gid) : null;
  if (!istAnzeigeform(plan)) return null;
  return { quelle: plan.parameter?.quellen?.gelaende ?? plan.parameter?.quelle ?? '—' };
});

async function clearSelection() {
  ifc.clearElement();
}

/**
 * Merkmalssatz anlegen — über die SITZUNG (Lücke ⑧, 2026-09-02).
 *
 * Vorher schrieb dieser Handler direkt ins Modell: keine Spur, kein Zurück,
 * nach F5 weg, und er war der letzte Einstieg, der am Bearbeiten-Modus
 * vorbeikam. Jetzt: Journaleintrag (Karte Satzname → Felder, ABSOLUTER
 * Zielzustand — der Eintrag trägt alle bisher gesetzten Sätze mit) und die
 * Anwendung über denselben `wendeEintragAn` wie jede andere Festlegung.
 */
async function onAddPset({ psetName, props }) {
  const el = ifc.selectedElement;
  if (!el?.globalId) { ifc.setPsetError('Dem Bauteil fehlt die GlobalId.'); return; }
  if (!bearbeitung.modusAn) {
    ifc.setPsetError('Der Bearbeiten-Modus ist aus — erst einschalten (Taste E).');
    return;
  }
  try {
    const bisher = new Map(aenderungen.wirksamerStand('pset')).get(el.globalId) ?? {};
    const eintrag = await aenderungen.eintragen({
      art: 'pset',
      globalId: el.globalId,
      nachher: { ...bisher, [psetName]: props },
      wer: cde.bearbeiter,
      modellSha: api.modellShaVon?.(el.globalId) ?? api.getLoadedModelSha?.() ?? null,
      modell: el.modelId === 'cde-eigenbau' ? 'cde' : 'geliefert',
    });
    if (!eintrag) { ifc.setPsetError('Der Satz galt schon — nichts einzutragen.'); return; }
    ifc.setPsetError('');
    await api.wendeEintragAn?.(eintrag);
    const aktualisiert = await api.refreshElement?.();
    if (aktualisiert) ifc.setElement(aktualisiert);
  } catch (fehler) {
    console.error('cde: pset anlegen', fehler);
    ifc.setPsetError(`Fehler: ${fehler.message}`);
  }
}

async function copyAsBridge() {
  const el = ifc.selectedElement;
  if (!el) return;
  isCopying.value = true;
  try {
    const result = await api.getElementBox(el.localId, el.modelId);
    if (!result) { alert('Keine Bounding-Box verfügbar. Ist ein Viewer aktiv?'); return; }

    const { box, offset } = result;
    // Three.js (Y up) → IFC/Plan-view (Z up):  three.Y → ifc.Z,  three.Z → ifc.Y  (inverted)
    const off = offset ?? { x: 0, y: 0, z: 0 };
    const toReal = (v) => ({
      x: v.x + off.x,
      y: -(v.z) + off.y,  // Three.js -Z = North in plan view
      z: v.y + off.z,
    });

    const min = toReal(box.min);
    const max = toReal(box.max);
    const lenX = max.x - min.x;
    const lenY = max.y - min.y;
    const isNS = lenY > lenX;
    const cx   = (min.x + max.x) / 2;
    const cy   = (min.y + max.y) / 2;

    const json = {
      type:    'quagg-bridge-v1',
      source:  'IFC',
      element: { globalId: el.globalId, ifcType: el.type, name: el.name },
      axis: {
        p1: isNS ? { x: cx,     y: min.y } : { x: min.x, y: cy },
        p2: isNS ? { x: cx,     y: max.y } : { x: max.x, y: cy },
      },
      z: {
        sohle:  parseFloat(min.z.toFixed(3)),
        soffit: parseFloat((min.z + (max.z - min.z) * 0.55).toFixed(3)),
        deck:   parseFloat(max.z.toFixed(3)),
      },
      width: parseFloat(Math.min(Math.abs(lenX), Math.abs(lenY)).toFixed(2)),
      crs:   'IFC-raw — prüfe ob UTM (EPSG:25832)',
    };

    await navigator.clipboard.writeText(JSON.stringify(json, null, 2));
    alert(`Brückendaten kopiert!\nAchse: ${json.axis.p1.x.toFixed(0)} / ${json.axis.p1.y.toFixed(0)} → ${json.axis.p2.x.toFixed(0)} / ${json.axis.p2.y.toFixed(0)}\nz_sohle: ${json.z.sohle} m | deck: ${json.z.deck} m\n\nIn Flood-2D beim Brücken-Werkzeug einfügen.`);
  } catch (err) {
    alert(`Fehler: ${err.message}`);
  } finally {
    isCopying.value = false;
  }
}
</script>

<style scoped>
/* Sprint U: In der Panel-Leiste füllt die Komponente das Panel-Body */
.rail-fill { display: flex; flex-direction: column; height: 100%; min-height: 0; }

.props-window {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
}

/* Das CSS des entfallenen Modal-Kopfes ist mit ihm weggefallen (Sprint P/AP-12). */

.props-body {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.anzeigeform-hinweis {
  display: flex; gap: 0.4rem; align-items: flex-start;
  margin: 0.5rem 0.75rem 0;
  padding: 0.45rem 0.6rem;
  border-radius: 4px;
  background: var(--cde-hinweis);
  color: var(--cde-hinweis-text);
  font-size: 0.78rem; line-height: 1.35;
}
.anzeigeform-hinweis code { font-size: 0.72rem; }

.bridge-export-bar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.75rem;
  background: color-mix(in srgb, var(--cde-danger) 12%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--cde-danger) 25%, transparent);
  flex-shrink: 0;
}
.bridge-hint {
  flex: 1;
  font-size: 0.68rem;
  color: var(--cde-danger-soft);
}
.bridge-copy-btn {
  display: inline-flex; align-items: center; gap: 0.3rem;
  padding: 0.25rem 0.6rem;
  background: var(--cde-danger-fill);
  border: 1px solid color-mix(in srgb, var(--cde-danger) 40%, transparent);
  border-radius: var(--cde-radius-sm);
  color: var(--cde-danger-soft);
  font-size: 0.72rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
  white-space: nowrap;
}
.bridge-copy-btn:hover:not(:disabled) { background: color-mix(in srgb, var(--cde-danger) 34%, transparent); }
.bridge-copy-btn:disabled { opacity: 0.5; cursor: wait; }
.bridge-copy-btn .is-busy { animation: cde-spin 0.9s linear infinite; }

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  background: var(--cde-float-deep);
}

.empty-icon { color: var(--cde-text-dimmer); opacity: 0.7; }

.empty-text {
  font-size: 0.8rem;
  color: var(--cde-text-dimmer);
  text-align: center;
}
</style>
