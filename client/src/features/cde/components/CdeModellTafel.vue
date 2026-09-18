<template>
  <!-- Die linke Tafel „Modelle“ (Kassensturz H3): was geladen ist. Der Satz,
       der eine Weg hinein, je Modell Auge und ×, die Bauwerksstruktur, dazu
       Kategorien, Geschosse, Lage und Import. Vorher schwebten Pillen, Laden,
       Kategorien und Geschosse über dem Bild, und Lage und Import standen
       unten in der Tafel „Bauteil“. -->
  <div class="mt">
    <div class="mt-kopf">
      <span class="mt-satz" :title="cde.aktiverSatz ? `Satz „${cde.aktiverSatz.name}“` : ''">
        <template v-if="cde.aktiverSatz">Satz <strong>{{ cde.aktiverSatz.name }}</strong></template>
        <template v-else>Ohne Projekt</template>
      </span>
      <label
        class="mt-hinzu"
        :class="{ laedt }"
        :title="laedt ? 'Es wird gerade ein Modell geladen'
          : cde.aktiverSatz ? `IFC-Datei ins Projekt und in den Satz „${cde.aktiverSatz.name}“` : 'IFC-Datei öffnen'"
      >
        <input type="file" accept=".ifc" :disabled="laedt" class="sr-only" @change="hinzufuegen" />
        <CdeIcon name="add" :size="13" /> Modell hinzufügen
      </label>
    </div>

    <IfcSpatialWindow ref="strukturRef" class="mt-struktur" />

    <!-- Kategorien und Geschosse bleiben Komponenten des Viewers (dort liegen
         Daten, Handler und die Befehle der Palette); gezeigt werden sie HIER —
         der Viewer teleportiert sie in diese Ziele. -->
    <details v-show="api.kategorienDa?.()" ref="kategorienRef" class="mt-abschnitt" :open="offen.kategorien"
             @toggle="merke('kategorien', $event)">
      <summary><CdeIcon name="layers" :size="12" /> Kategorien</summary>
      <div ref="kategorienZiel" class="mt-ziel"></div>
    </details>

    <details v-show="api.geschosseDa?.()" ref="geschosseRef" class="mt-abschnitt" :open="offen.geschosse"
             @toggle="merke('geschosse', $event)">
      <summary><CdeIcon name="storey" :size="12" /> Geschosse</summary>
      <div ref="geschosseZiel" class="mt-ziel"></div>
    </details>

    <details v-if="georeferenz || importBefunde.length" ref="lageRef" class="mt-abschnitt" :open="offen.lage"
             @toggle="merke('lage', $event)">
      <summary><CdeIcon name="coords" :size="12" /> Lage und Import</summary>
      <div class="mt-lage">
        <details v-if="georeferenz" class="mt-geo">
          <summary>
            Georeferenz
            <span :class="['mt-stufe', 'mt-stufe--' + (georeferenz.stufe.wert >= 40 ? 'gut' : georeferenz.stufe.wert > 0 ? 'teil' : 'keine')]">
              {{ georeferenz.stufe.wert }}
            </span>
          </summary>
          <dl class="mt-kette">
            <dt>Lage</dt>
            <dd>{{ georeferenz.stufe.text }}</dd>

            <template v-if="georeferenz.crs">
              <dt>System</dt>
              <dd>
                <code>{{ georeferenz.crs.name || 'unbenannt' }}</code>
                <span class="mt-dim">{{ georeferenz.crs.beschreibung }}</span>
              </dd>
            </template>

            <template v-if="georeferenz.kartenbezug">
              <dt>Ursprung</dt>
              <dd class="mt-dim">
                O {{ georeferenz.kartenbezug.ost.toFixed(2) }} ·
                N {{ georeferenz.kartenbezug.nord.toFixed(2) }} ·
                H {{ georeferenz.kartenbezug.hoehe.toFixed(2) }}
              </dd>
            </template>

            <dt>Nord</dt>
            <dd class="mt-dim">
              {{ nordGrad }}° ({{ georeferenz.nordrichtung.quelle === 'TrueNorth' ? 'aus der Datei' : 'Vorgabe der Norm' }})
            </dd>

            <dt>Höhe</dt>
            <dd :class="hoehenbezug.warnung ? 'mt-warnung' : 'mt-dim'">
              {{ hoehenbezug.text }}
              <template v-if="hoehenbezug.raeume"><br>{{ hoehenbezug.raeume }}</template>
            </dd>

            <dt>Einheit</dt>
            <dd class="mt-dim">
              {{ georeferenz.einheit.name }}<template v-if="georeferenz.einheit.faktor !== 1"> × {{ georeferenz.einheit.faktor }}</template>
              <span v-if="georeferenz.einheit.quelle === 'angenommen'"> — nicht in der Datei</span>
            </dd>
          </dl>
          <p v-for="(b, i) in georeferenz.befunde" :key="i" class="mt-warnung">
            <CdeIcon name="warn" :size="12" /> {{ b.text ?? b }}
          </p>
        </details>

        <!-- Je MODELL, nicht nur das erste: eine Lieferung in IFC2x3 neben einer
             in 4.3 ist genau der Fall, den man sehen muss. Klappt von selbst auf, wenn er warnt. -->
        <details v-for="b in importBefunde" :key="b.modelId" class="mt-geo"
                 :open="b.texte.some(t => t.schwere === 'warnung')">
          <summary>
            Import · {{ b.modelId }}
            <span class="mt-dim">{{ b.schema ?? 'Schema unbekannt' }} · {{ b.bauteile }} Bauteile</span>
          </summary>
          <p v-for="(t, i) in b.texte" :key="i" class="mt-warnung">
            <CdeIcon :name="t.schwere === 'warnung' ? 'warn' : 'info'" :size="12" /> {{ t.text }}
          </p>
          <p v-if="!b.texte.length" class="mt-dim">Nichts Auffälliges.</p>
        </details>
      </div>
    </details>
  </div>
</template>

<script setup>
/**
 * Die Tafel „Modelle“ (Kassensturz H3, zusammen mit S3 „Viewer = Satz“).
 *
 * Vier Orte (Kassensturz): oben wo bin ich, LINKS WAS IST GELADEN, rechts was
 * ist gewählt, unten was tue ich gerade. Diese Tafel ist „links“. Der Viewer
 * reicht, was er weiß, über die viewerApi herein; Kategorien und Geschosse
 * rendert er selbst per Teleport in die Ziele dieser Tafel.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import CdeIcon from './ui/CdeIcon.vue';
import IfcSpatialWindow from './IfcSpatialWindow.vue';
import { useCdeStore } from '../stores/useCdeStore.js';
import { useIfcStore } from '../stores/useIfcStore.js';
import { usePanels } from '../stores/usePanels.js';
import { useViewerApi } from '../composables/viewerApi.js';

const cde = useCdeStore();
const ifc = useIfcStore();
const panels = usePanels();
const api = useViewerApi();

const strukturRef = ref(null);
const kategorienZiel = ref(null);
const geschosseZiel = ref(null);
const kategorienRef = ref(null);
const geschosseRef = ref(null);
const lageRef = ref(null);

const laedt = computed(() => { void ifc.modelList.length; return !!api.laedtGerade?.(); });
function hinzufuegen(e) { return api.modellHinzufuegen?.(e); }

// Welche Abschnitte offen sind — je Gerät gemerkt, wie die Tafeln selbst.
const MERK = 'cde-modelle-abschnitte';
const offen = reactive({ kategorien: false, geschosse: true, lage: false });
try { Object.assign(offen, JSON.parse(localStorage.getItem(MERK) ?? '{}')); } catch { /* ohne Speicher gilt die Vorgabe */ }
function merke(name, ereignis) {
  offen[name] = !!ereignis?.target?.open;
  try { localStorage.setItem(MERK, JSON.stringify({ ...offen })); } catch { /* egal */ }
}

// „Ansicht → Kategorien“ und Ähnliches: diesen Abschnitt zeigen.
const ABSCHNITTE = { kategorien: kategorienRef, geschosse: geschosseRef, lage: lageRef };
watch(() => panels.abschnitt, async (name) => {
  if (!name) return;
  offen[name] = true;
  await nextTick();
  ABSCHNITTE[name]?.value?.scrollIntoView?.({ block: 'nearest' });
  panels.abschnitt = null;
}, { immediate: true });

onMounted(() => {
  api.tafelZielSetzen?.('kategorien', kategorienZiel.value);
  api.tafelZielSetzen?.('geschosse', geschosseZiel.value);
});
onBeforeUnmount(() => {
  api.tafelZielSetzen?.('kategorien', null);
  api.tafelZielSetzen?.('geschosse', null);
});

// ── Lage und Import (bis H3 unten in der Tafel „Bauteil“) ──────────────────
/** Die Georeferenz — bei mehreren Modellen die des ersten (es setzt den Weltrahmen). */
const georeferenz = computed(() => {
  void ifc.modelList.length;                       // reaktiver Anker
  const alle = api.getGeoreferenzen?.() ?? {};
  return Object.values(alle)[0] ?? null;
});
const importBefunde = computed(() => {
  void ifc.modelList.length;
  return Object.entries(api.getImportBefunde?.() ?? {}).map(([modelId, b]) => ({ modelId, ...b }));
});
/** Woher der Höhenversatz kommt — und ob er überhaupt gemessen wurde. */
const hoehenbezug = computed(() => {
  void ifc.modelList.length;
  const b = Object.values(api.getHoehenBefunde?.() ?? {})[0] ?? null;
  if (!b) return { text: 'nicht bestimmt', warnung: true };
  if (b.art === 'gemessen') {
    return {
      text: `Versatz ${b.wert.toFixed(3)} m — ${b.text}`,
      raeume: `Datei ${b.datei.min.toFixed(1)}…${b.datei.max.toFixed(1)} m · `
            + `Viewer ${b.welt.min.toFixed(1)}…${b.welt.max.toFixed(1)} m`,
      warnung: false,
    };
  }
  return { text: `nicht bestimmt (${b.text})`, warnung: true };
});
const nordGrad = computed(() => ((georeferenz.value?.nordrichtung?.rad ?? 0) * 180 / Math.PI).toFixed(2));

defineExpose({
  expandAll: () => strukturRef.value?.expandAll(),
  collapseAll: () => strukturRef.value?.collapseAll(),
});
</script>

<style scoped>
.mt { display: flex; flex-direction: column; height: 100%; min-height: 0; background: var(--cde-float-deeper); }

.mt-kopf {
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.45rem 0.6rem;
  border-bottom: 1px solid var(--cde-line);
  background: var(--cde-float-deep);
  flex-shrink: 0;
}
.mt-satz {
  flex: 1; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: var(--cde-font-sm); color: var(--cde-text-dim);
}
.mt-satz strong { color: var(--cde-text-bright); }
.mt-hinzu {
  display: inline-flex; align-items: center; gap: 0.3rem; flex-shrink: 0;
  padding: 0.3rem 0.55rem;
  background: var(--cde-accent); border: 1px solid var(--cde-accent);
  border-radius: var(--cde-radius-sm);
  color: var(--cde-text-auf-farbe);
  font-size: var(--cde-font-sm); font-weight: 600;
  cursor: pointer; white-space: nowrap;
  touch-action: manipulation;
}
.mt-hinzu:hover { filter: brightness(1.08); }
.mt-hinzu.laedt { opacity: 0.5; cursor: progress; }
.mt-hinzu:focus-within { outline: 2px solid var(--cde-accent-line); outline-offset: 1px; }

/* Die Struktur nimmt den Platz; die Abschnitte darunter so viel, wie sie brauchen. */
.mt-struktur { flex: 1 1 auto; min-height: 8rem; }

.mt-abschnitt {
  flex-shrink: 0;
  max-height: 45%;
  overflow: auto;
  border-top: 1px solid var(--cde-line);
  background: var(--cde-float-deep);
}
.mt-abschnitt > summary {
  display: flex; align-items: center; gap: 0.35rem;
  padding: 0.4rem 0.6rem;
  font-size: var(--cde-font-xs); text-transform: uppercase; letter-spacing: 0.06em;
  color: var(--cde-text-dim);
  cursor: pointer; user-select: none;
  position: sticky; top: 0; z-index: 1;
  background: var(--cde-float-deep);
}
.mt-abschnitt > summary:hover { color: var(--cde-text); }
.mt-ziel:empty { display: none; }

.mt-lage { display: flex; flex-direction: column; gap: 0.35rem; padding: 0 0.6rem 0.6rem; }
.mt-geo {
  border: 1px solid var(--cde-line);
  border-radius: var(--cde-radius-sm);
  padding: 0.35rem 0.45rem;
  background: var(--cde-fill);
}
.mt-geo > summary {
  cursor: pointer; font-size: var(--cde-font-xs);
  color: var(--cde-text-dim); user-select: none;
  display: flex; align-items: center; gap: 0.35rem;
}
.mt-stufe { margin-left: auto; padding: 0 0.3rem; border-radius: var(--cde-radius-sm); font-weight: 600; }
.mt-stufe--gut   { background: var(--cde-accent-fill-hi); color: var(--cde-success-strong); }
.mt-stufe--teil  { background: var(--cde-accent-fill-hi); color: var(--cde-warn); }
.mt-stufe--keine { background: var(--cde-danger-fill); color: var(--cde-danger); }
.mt-kette {
  display: grid; grid-template-columns: auto 1fr; gap: 0.15rem 0.5rem;
  margin: 0.4rem 0 0; font-size: var(--cde-font-xs);
}
.mt-kette dt { color: var(--cde-text-dim); }
.mt-kette dd { margin: 0; display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.3rem; }
.mt-dim { color: var(--cde-text-dim); }
.mt-warnung {
  margin: 0.4rem 0 0; font-size: var(--cde-font-xs); color: var(--cde-warn);
  display: flex; gap: 0.3rem; align-items: flex-start;
}

.sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0;
}

@media (pointer: coarse) {
  .mt-hinzu { min-height: 40px; }
  .mt-abschnitt > summary { min-height: 40px; }
}
</style>
