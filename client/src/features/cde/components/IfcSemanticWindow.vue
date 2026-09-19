<template>
  <!-- Sprint P/AP-12: Der frühere `chrome`-Zweig ist entfallen. Er hätte die
       Komponente wahlweise in ein schwebendes DraggableModal gehüllt — ein Weg,
       den seit Sprint U kein Aufrufer mehr nahm (alle setzten `chrome=false`),
       dessen Vorgabewert aber auf `true` stand. Das Chrome liefert jetzt
       ausschließlich CdePanel in der Leiste. -->
  <div :class="eingebettet ? 'eingebettet' : 'rail-fill'">
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
            <span :title="`Quelle: ${anzeigeform.quelle}`">
              <b>Gelände nach allen Formungen</b> — nur zur Ansicht: kein Bauteil, nicht im Export.
            </span>
          </div>

          <!-- Woher das Bauteil stammt (Teil XXIII, A1): aus einer Vorlage der
               Bibliothek — und wie weit es inzwischen von ihr abweicht. Es
               darf abweichen; der Bezug bleibt. -->
          <div v-if="vorlagenbezug" class="vorlage-hinweis"
               :class="{ 'vorlage-hinweis--fehlt': vorlagenbezug.fehlt }">
            <CdeIcon name="copy" :size="12" />
            <span :title="vorlagenbezugTitel">
              <template v-if="vorlagenbezug.fehlt">
                Aus Vorlage <b>{{ vorlagenbezug.id }}</b> — diese Vorlage gibt es nicht mehr.
              </template>
              <template v-else>
                Aus Vorlage <b>{{ vorlagenbezug.name }}</b><template v-if="vorlagenbezug.abweichend.length">
                  · {{ vorlagenbezug.abweichend.length === 1 ? '1 Abweichung' : `${vorlagenbezug.abweichend.length} Abweichungen` }}</template>
              </template>
            </span>
          </div>

          <!-- Mengen eines EIGENEN Cut/Fill (Teil XX, Fabio: „es fehlen die
               Volumen in m³"): dieselben Zahlen, die ins IFC gehen
               (Qto_Earthworks…) und im Mengen-Reiter stehen — aus dem
               letzten Aufbau, keine zweite Rechnung. -->
          <div v-if="mengen.length" class="mengen-block">
            <div class="mengen-kopf">
              <CdeIcon name="volume" :size="12" /> Mengen <span class="mengen-quelle">wie im IFC</span>
            </div>
            <div v-for="m in mengen" :key="m.feld" class="mengen-zeile">
              <span>{{ m.titel }}</span><b>{{ m.wert }}</b>
            </div>
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
import { useViewerApi } from '../composables/viewerApi.js';
import { useKommandoweg } from '../composables/useKommandoweg.js';
import { istAnzeigeform, mengenVon, rezeptNach } from '../services/Bauteilrezepte.js';
import { m3 } from '../services/Mengenzeile.js';
import { vorlagenbezugVon } from '../services/Bibliothek.js';

/** In der Tafel „Bauteil“ (Kassensturz H2) steht die Komponente im Fluss, nicht als eigene Tafel. */
defineProps({ eingebettet: { type: Boolean, default: false } });

// Kein 'close'-Emit mehr: Das Schließen liegt bei CdePanel, das die
// Leiste kennt und den Panel-Store führt.
const ifc  = useIfcStore();
const aenderungen = useAenderungen();
const bearbeitung = useBearbeitung();
const api = useViewerApi();
const kommandoweg = useKommandoweg();
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

/**
 * Woher ein eigenes Bauteil stammt (Teil XXIII, A1). Die Vorlagen liegen schon
 * am eingeordneten Subjekt (`IfcViewer` lädt sie für jedes eigene Bauteil) —
 * kein zweites Laden. Fehlt die Liste noch, steht nur die Id da, kein Urteil:
 * „gibt es nicht mehr" wäre sonst eine Behauptung ohne Grundlage.
 */
const vorlagenbezug = computed(() => {
  const gid = ifc.selectedElement?.globalId;
  const plan = gid ? aenderungen.wirksamerStand('erzeugt').get(gid) : null;
  if (!plan?.parameter?.vorlage) return null;
  const vorlagen = bearbeitung.bauteil?.globalId === gid ? bearbeitung.bauteil?.vorlagen : null;
  if (!Array.isArray(vorlagen)) return { id: String(plan.parameter.vorlage), name: String(plan.parameter.vorlage), fehlt: false, abweichend: [] };
  return vorlagenbezugVon(plan, vorlagen);
});

const vorlagenbezugTitel = computed(() => {
  const b = vorlagenbezug.value;
  if (!b?.abweichend?.length) return b?.fehlt ? 'Das Bauteil behält seine Werte; nur der Bezug zeigt ins Leere.' : 'Entspricht der Vorlage.';
  return b.abweichend.map(a => `${a.feld}: Vorlage ${a.soll}, hier ${a.ist ?? '—'}`).join('\n');
});

/** Die Qto-Felder mit deutschem Namen — was ein Planer liest, nicht was im Schema steht. */
const MENGEN_TITEL = { undisturbedVolume: 'Aushub (gewachsen)', looseVolume: 'Aushub (lose, abzufahren)',
                       compactedVolume: 'Auftrag (verdichtet)', length: 'Länge' };

/**
 * Die Mengen eines eigenen Cut/Fill (Teil XX) — `mengenVon` wie der IFC-Export,
 * aus den Kennzahlen des letzten Aufbaus. Nach jedem Neuaufbau neu.
 */
const mengen = computed(() => {
  void ifc.geometrieStand;
  const gid = ifc.selectedElement?.globalId;
  const plan = gid ? aenderungen.wirksamerStand('erzeugt').get(gid) : null;
  if (!plan?.ableitung || !rezeptNach(plan.rezept)?.erdbau) return [];
  const k = api.kennzahlenVon?.(plan.ableitung);
  const zeilen = Object.entries(mengenVon(plan, k)).map(([feld, v]) => ({
    feld,
    titel: MENGEN_TITEL[feld] ?? feld,
    wert: feld === 'length' ? `${v.toLocaleString('de-DE', { maximumFractionDigits: 2 })} m` : m3(v),
  }));
  if (!zeilen.length) return zeilen;
  // DER FAKTOR, MIT DEM GERECHNET WURDE (Teil XXI, P4): ohne ihn steht die
  // lose Masse als Zahl da, die niemand nachrechnen kann.
  if (Number.isFinite(k?.auflockerung) && zeilen.some(z => z.feld === 'looseVolume')) {
    zeilen.push({ feld: 'auflockerung', titel: 'Auflockerung',
                  wert: `× ${k.auflockerung.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` });
  }
  // DIE GEGENPROBE (Teil XXI, P4): Körper gegen Raster. Sie sprach bisher nur,
  // wenn sie ausschlug — jetzt sieht man auch, wie gut sie stimmt.
  const abw = plan.rolle === 'auftrag' ? k?.gegenprobeAuftrag : k?.gegenprobeAushub;
  if (Number.isFinite(abw)) {
    zeilen.push({ feld: 'gegenprobe', titel: 'Gegenprobe Körper ↔ Raster',
                  wert: `${(abw * 100).toLocaleString('de-DE', { maximumFractionDigits: 2 })} %` });
  }
  return zeilen;
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
 *
 * SEIT O6 (Teil XXIV) als KOMMANDO: „Merkmalssatz setzen" aus dem Katalog,
 * mit Beleg. Die Karte baut das Werkzeug aus dem Stand, nicht dieses Fenster.
 */
async function onAddPset({ psetName, props }) {
  const el = ifc.selectedElement;
  if (!el?.globalId) { ifc.setPsetError('Dem Bauteil fehlt die GlobalId.'); return; }
  // Ein Merkmal setzen heißt bearbeiten (Kassensturz E4): der Viewer schaltet
  // ein, mit seinen echten Sperren. Die Prüfung steht weiter VOR dem
  // Eintragen (Wächter in bearbeitungVerklebung.test.js).
  if (!bearbeitung.modusAn && !api.bearbeitenEin?.()) {
    ifc.setPsetError(api.bearbeitenSperrgrund?.() || 'Bearbeiten lässt sich gerade nicht einschalten.');
    return;
  }
  try {
    const erg = await kommandoweg.absetzen({
      werkzeug: 'merkmalssatz-setzen',
      ziel: [el.globalId],
      werte: { satz: psetName, merkmale: props },
    });
    const [eintrag] = erg.eintraege;
    if (!erg.ausgefuehrt || !eintrag) { ifc.setPsetError(erg.grund || 'Der Satz galt schon — nichts einzutragen.'); return; }
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
/* Eingebettet (Tafel „Bauteil“): im Fluss, ohne eigene Höhe und ohne eigenes Scrollen. */
.eingebettet .props-window,
.eingebettet .props-body { height: auto; overflow: visible; }
/* Der Abschnitt heisst schon „Merkmale“ — der Kopf der Liste nennt sich nicht noch einmal. */
.eingebettet :deep(.sb-title) { display: none; }

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

.vorlage-hinweis {
  display: flex; gap: 0.4rem; align-items: flex-start;
  margin: 0.5rem 0.75rem 0;
  padding: 0.35rem 0.6rem;
  border-radius: 4px;
  border: 1px solid var(--cde-line);
  color: var(--cde-text-dim);
  font-size: 0.78rem; line-height: 1.35;
}
.vorlage-hinweis b { color: var(--cde-text); font-weight: 600; }
.vorlage-hinweis--fehlt { background: var(--cde-hinweis); color: var(--cde-hinweis-text); border-color: transparent; }
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

/* Mengen eines eigenen Cut/Fill (Teil XX) — dieselben Zahlen wie im IFC. */
.mengen-block {
  margin: 0.5rem 0.75rem 0;
  padding: 0.4rem 0.6rem;
  border-radius: var(--cde-radius-sm);
  background: var(--cde-tint-weak);
  border-left: 2px solid var(--cde-accent-line);
  font-size: 0.78rem;
}
.mengen-kopf { display: flex; align-items: center; gap: 0.35rem; color: var(--cde-text); font-weight: 600; margin-bottom: 0.2rem; }
.mengen-quelle { margin-left: auto; font-weight: 400; font-size: var(--cde-font-xs); color: var(--cde-text-dim); }
.mengen-zeile { display: flex; justify-content: space-between; gap: 0.75rem; color: var(--cde-text-soft); padding: 0.05rem 0; }
.mengen-zeile b { color: var(--cde-text); font-variant-numeric: tabular-nums; }

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
