

<script setup>
import SvEmoji from '../common/SvEmoji.vue';
import { ref, computed, watch } from 'vue';
import { useHydraulicStore } from '@/features/flood-2D/stores/useHydraulicStore';
import GanglinienEditor from '../hydraulics/GanglinienEditor.vue';

const props = defineProps({
  selectedItem: { type: Object, default: null }
});

const hydStore = useHydraulicStore();

// --- STATE ---
// activeType ist UI-Gruppierung: NONE, INFLOW_CONSTANT, INFLOW_DYNAMIC, OUTFLOW.
// 'OUTFLOW' wird NIE persistiert — saveSettings löst es über outflowMode in die zwei
// tatsächlich gespeicherten Store-Typen auf (OUTFLOW_FREE bzw. WATERLEVEL_FIX).
const activeType = ref('NONE');
const constantValue = ref(0);
const selectedProfileId = ref(null);
const outflowSlope = ref(null);       // Sf (m/m) für OUTFLOW/Frei; null = Standard-Sicherheitsgefälle
const outflowMode = ref('FREE');      // 'FREE' | 'HFIX' | 'HVAR' — nur wenn activeType === 'OUTFLOW'
const stageValue = ref(null);         // fester Wasserspiegel [m NHN] ODER [m über Gelände], nur bei outflowMode === 'HFIX'
const stageRelative = ref(false);     // true: stageValue ist relativ zur Geländehöhe statt absolut NHN
const directed = ref(false);          // gerichteter Zufluss an/aus
const flowAngleDeg = ref(0);          // Welt-Azimut 0=Ost, 90=Nord (nur wenn directed)

const outflowModeOptions = [
    { value: 'FREE', icon: '↘️', label: 'Frei' },
    { value: 'HFIX', icon: '📏', label: 'Fester Pegel' },
    { value: 'HVAR', icon: '🌊', label: 'Pegel-Ganglinie' },
];

// Schnellwahl-Buttons (Himmelsrichtungen) — schreiben den Azimut.
const compassPresets = [
    { deg: 90,  label: 'N' },
    { deg: 0,   label: 'O' },
    { deg: 270, label: 'S' },
    { deg: 180, label: 'W' },
];
// Pfeil-Drehung im Kompass-Rad: Azimut 0=Ost/rechts, 90=Nord/oben (CSS: 0°=oben, im UZS).
// CSS-Winkel = 90 - azimut (Nord oben), damit das Rad mit der Welt übereinstimmt.
const dialAngle = computed(() => 90 - (flowAngleDeg.value || 0));
// Normalisierter Anzeige-Winkel [0,360) fürs Zahlenfeld.
const angleDisplay = computed(() => Math.round((((flowAngleDeg.value || 0) % 360) + 360) % 360));

// Einen Winkel setzen → impliziert „gerichtet" (sonst würde saveSettings ihn verwerfen).
const setAngle = (deg) => {
    flowAngleDeg.value = ((deg % 360) + 360) % 360;
    directed.value = true; // Winkel wählen aktiviert automatisch den gerichteten Zufluss
    saveSettings();
};

// Klick aufs Kompass-Rad → Winkel aus der Position relativ zum Zentrum.
// Bildschirm: +x rechts, +y unten. Welt-Azimut: 0=Ost(rechts), 90=Nord(oben, −y).
const onDialClick = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    let deg = Math.atan2(-dy, dx) * 180 / Math.PI; // −dy: Bildschirm-oben = Nord
    setAngle(Math.round(deg));
};

// Computed
const shortId = computed(() => {
    if (!props.selectedItem || !props.selectedItem.id) return '';
    const id = props.selectedItem.id;
    return (typeof id === 'string') ? id.substring(0, 8) + '...' : id;
});

const isNode = computed(() => {
    if (!props.selectedItem) return false;
    return !props.selectedItem.geometry; // Heuristic for Node
});

// Lage des Segments (read-only aus der Geometrie): Modellkante vs. Innenlage.
// Ablauf (Frei/Fester Pegel/Pegel-Ganglinie) ist solverseitig NUR als echte Modellkante
// gültig (FREE wird vom LISFLOOD-Parser als Innen-Punktquelle verworfen) — daher hier
// zusätzlich der Hinweis, dass Ablauf bei Innen-Lage nicht wählbar ist. Zufluss bleibt
// davon unberührt (Impuls funktioniert über die Fließrichtung unabhängig von der Lage).
const EDGE_LABEL = { N: 'Nord', S: 'Süd', E: 'Ost', W: 'West' };
// Dreistufig: 'FULL' = echte Rechteck-Kante ODER mindestens eine literale Kantenzelle unter
// den geklickten Randzellen (properties.literalEdgeArc, Ablauf-Picker) — "Frei" landet EXAKT
// dort, wo geklickt wurde. 'STAGE_ONLY' = nur Front-Innenzellen geklickt (properties.nearFront
// true, literalEdgeArc leer — z. B. ein schiefes/rotiertes DGM, dessen wahre Kante diagonal
// durchs Raster läuft und die literale Rechteck-Kante nirgends berührt) — der InputGenerator
// setzt hier eine DIREKTE Punkt-FREE-Randbedingung mit Richtungs-Token an genau dieser Zelle
// (quagg-outflow-free-direction.patch, s. engines/patches/README.md) — "Frei" landet also auch
// hier normalerweise EXAKT an der geklickten Stelle; nur eine reine Diagonal-Eckzelle (grenzt
// nur über die Ecke, nicht orthogonal, an die NoData-Front) fällt auf eine Projektion auf die
// nächste Kante zurück (_accumulateFreeAtNearestEdge). 'NONE' = weder noch (reine Innen-Lage,
// kein Rand/keine Front) — hier lehnt der Solver FREE als reine Punktquelle ab, komplett gesperrt.
const outflowEligibility = computed(() => {
    if (props.selectedItem?.properties?.edge) return 'FULL';
    if (props.selectedItem?.properties?.literalEdgeArc?.length) return 'FULL';
    if (props.selectedItem?.properties?.nearFront) return 'STAGE_ONLY';
    return 'NONE';
});
const outflowAllowed = computed(() => outflowEligibility.value !== 'NONE');
const freeDisabledTooltip = 'Frei ist nur auf der Rasterkante oder nahe der Geländegrenze gültig ' +
    '(LISFLOOD lehnt sie als reine Innen-Punktquelle ab). Diese Linie liegt vollständig im Inneren — ' +
    '"Fester Pegel"/"Pegel-Ganglinie" nutzen oder die Linie näher an den Rasterrand/die Geländegrenze zeichnen.';

const segmentInfo = computed(() => {
    const edge = props.selectedItem?.properties?.edge;
    const arc = props.selectedItem?.properties?.literalEdgeArc;
    if (edge && EDGE_LABEL[edge]) {
        return { cls: 'seg-edge', text: `⬛ Kanten-Segment (${EDGE_LABEL[edge]}) auf dem Modellrand.` };
    }
    if (arc?.length) {
        return {
            cls: 'seg-edge',
            text: `⬛ Randbogen aufgelöst (${arc.length} Zellen) — „Frei" ist hier ebenfalls gültig.`
        };
    }
    if (outflowEligibility.value === 'STAGE_ONLY') {
        return {
            cls: 'seg-front',
            text: '🟡 Nahe der Geländegrenze (nicht Rasterkante) — „Frei" wird hier direkt an dieser Stelle ' +
                  'gesetzt (Punkt-Randbedingung mit Richtung). Nur reine Diagonal-Eckzellen ohne direkten ' +
                  'Geländeabschluss weichen auf die nächste Rasterkante aus.'
        };
    }
    return {
        cls: 'seg-interior',
        text: '📍 Innen-Lage — Impuls über „Fließrichtung" wählbar (keine Kante nötig). ' +
              'Ablauf ist hier NICHT wählbar (nur auf der Modellkante oder nahe der Geländegrenze möglich).'
    };
});

const ganglinienOptions = computed(() => {
    return hydStore.ganglinien ? Object.values(hydStore.ganglinien) : [];
});

const currentProfileData = computed({
    get: () => {
        if (selectedProfileId.value && hydStore.ganglinien[selectedProfileId.value]) {
            return hydStore.ganglinien[selectedProfileId.value].data || [];
        }
        return [];
    },
    set: (newPoints) => {
        if (selectedProfileId.value) {
            hydStore.updateGanglinieData(selectedProfileId.value, newPoints);
        }
    }
});

const showGanglinienEditor = computed(() => {
    return (activeType.value === 'INFLOW_DYNAMIC' || (activeType.value === 'OUTFLOW' && outflowMode.value === 'HVAR'))
        && !!selectedProfileId.value;
});

// --- SYNC ENGINE ---

watch(() => props.selectedItem, (newItem) => {
    if (!newItem || !newItem.id) {
        activeType.value = 'NONE';
        return;
    }

    const assignment = hydStore.assignments[newItem.id];
    if (assignment) {
        if (assignment.type === 'OUTFLOW_FREE') {
            activeType.value = 'OUTFLOW';
            outflowMode.value = 'FREE';
            outflowSlope.value = (assignment.outflowSlope ?? null);
            selectedProfileId.value = null;
            stageValue.value = null;
            stageRelative.value = false;
            constantValue.value = 0;
        } else if (assignment.type === 'WATERLEVEL_FIX') {
            activeType.value = 'OUTFLOW';
            outflowMode.value = assignment.profileId ? 'HVAR' : 'HFIX';
            selectedProfileId.value = assignment.profileId || null;
            stageValue.value = (assignment.value ?? null);
            stageRelative.value = assignment.relative ?? false;
            outflowSlope.value = null;
            constantValue.value = 0;
        } else {
            activeType.value = assignment.type; // INFLOW_CONSTANT | INFLOW_DYNAMIC
            constantValue.value = (assignment.value !== undefined && assignment.value !== null) ? assignment.value : 0;
            selectedProfileId.value = assignment.profileId || null;
            outflowMode.value = 'FREE';
            outflowSlope.value = null;
            stageValue.value = null;
            stageRelative.value = false;
        }
        // Winkel laden; Legacy flowDir (N/S/E/W) zu Azimut mappen.
        const LEGACY = { E: 0, N: 90, W: 180, S: 270 };
        if (Number.isFinite(assignment.flowAngleDeg)) {
            directed.value = true; flowAngleDeg.value = assignment.flowAngleDeg;
        } else if (assignment.flowDir in LEGACY) {
            directed.value = true; flowAngleDeg.value = LEGACY[assignment.flowDir];
        } else {
            directed.value = false; flowAngleDeg.value = 0;
        }
    } else {
        activeType.value = 'NONE';
        constantValue.value = 0;
        selectedProfileId.value = null;
        outflowMode.value = 'FREE';
        outflowSlope.value = null;
        stageValue.value = null;
        stageRelative.value = false;
        directed.value = false;
        flowAngleDeg.value = 0;
    }

    // Eignung kann sich geändert haben (Terrain bearbeitet) oder das Objekt hat noch gar
    // keine Zuweisung (outflowMode steht dann auf seinem Ref-Default 'FREE') — "Frei" nie als
    // scheinbar aktiv anzeigen, wenn es aktuell gar nicht wählbar ist (sonst wirkt der Button
    // gleichzeitig "aktiv" UND gesperrt, ohne dass je echt FREE gespeichert worden wäre).
    if (outflowMode.value === 'FREE' && outflowEligibility.value === 'NONE') {
        outflowMode.value = 'HFIX';
    }

}, { immediate: true });

// --- ACTIONS ---

// Wrapper fürs Verhaltenstyp-Dropdown: verhindert (defensiv — das disabled <option> sollte
// das eigentlich schon verhindern), dass "Ablauf" auf einem Innen-Objekt gespeichert wird.
function onTypeChange() {
    if (activeType.value === 'OUTFLOW' && !outflowAllowed.value) {
        activeType.value = 'NONE';
        return;
    }
    saveSettings();
}

function setOutflowMode(mode) {
    // Defensiv (das :disabled am Button sollte das schon verhindern): "Frei" braucht Rand-
    // oder Geländegrenzen-Nähe (FULL oder STAGE_ONLY), nur bei reiner Innen-Lage gesperrt.
    if (mode === 'FREE' && outflowEligibility.value === 'NONE') return;
    outflowMode.value = mode;
    saveSettings();
}

const saveSettings = () => {
    if (!props.selectedItem || !props.selectedItem.id) return;
    const id = props.selectedItem.id;

    if (activeType.value === 'NONE') {
        if (hydStore.assignments[id]) delete hydStore.assignments[id];
        return;
    }
    if (activeType.value === 'OUTFLOW' && !outflowAllowed.value) return; // Sicherheitsnetz

    // Integrity Check
    let finalProfileId = null;
    let finalValue = null;
    let resolvedType = activeType.value;

    if (activeType.value === 'INFLOW_DYNAMIC') {
        // Ohne Profil wird die Zuweisung gespeichert (Auswahl bleibt erhalten),
        // aber der InputGenerator überspringt sie mit Warnung.
        finalProfileId = selectedProfileId.value;
    } else if (activeType.value === 'INFLOW_CONSTANT') {
        // Negativer Zufluss wäre ein versteckter Abfluss → Massenbilanz kaputt.
        if (!Number.isFinite(constantValue.value) || constantValue.value < 0) {
            constantValue.value = 0;
        }
        finalValue = constantValue.value;
    } else if (activeType.value === 'OUTFLOW') {
        // "Ablauf" ist reine UI-Gruppierung — löst sich hier auf die zwei tatsächlich
        // gespeicherten Store-Typen auf (OUTFLOW_FREE bzw. WATERLEVEL_FIX).
        // Sicherheitsnetz: "Frei" nie bei reiner Innen-Lage speichern (s. setOutflowMode).
        if (outflowMode.value === 'FREE' && outflowEligibility.value !== 'NONE') {
            resolvedType = 'OUTFLOW_FREE';
        } else if (outflowMode.value === 'HFIX') {
            resolvedType = 'WATERLEVEL_FIX';
            finalValue = Number.isFinite(stageValue.value) ? stageValue.value : null;
        } else {
            resolvedType = 'WATERLEVEL_FIX';
            finalProfileId = selectedProfileId.value;
        }
    }

    const payload = {
        type: resolvedType,
        value: finalValue,
        profileId: finalProfileId,
    };

    // Relativ-Bezug (Geländehöhe + Wert statt absolut NHN) nur bei festem Pegel relevant.
    if (activeType.value === 'OUTFLOW' && outflowMode.value === 'HFIX') {
        payload.relative = stageRelative.value || false;
    }

    // Sohlgefälle nur beim freien Auslauf; kein Höchstwert (Solver kennt kein Sf-Limit) —
    // leer/ungültig ⇒ InputGenerator nutzt den Standard-Sicherheitsgefälle-Fallback.
    if (activeType.value === 'OUTFLOW' && outflowMode.value === 'FREE') {
        const sf = Number(outflowSlope.value);
        payload.outflowSlope = (Number.isFinite(sf) && sf > 0) ? sf : null;
    }

    // Fließrichtung (Welt-Azimut) nur bei Zuflüssen; gibt dem Solver Impuls an der Quellzelle.
    if (activeType.value === 'INFLOW_CONSTANT' || activeType.value === 'INFLOW_DYNAMIC') {
        if (directed.value && Number.isFinite(flowAngleDeg.value)) {
            payload.flowAngleDeg = ((flowAngleDeg.value % 360) + 360) % 360;
        } else {
            payload.flowAngleDeg = null;
        }
        payload.flowDir = null; // Legacy-Feld bereinigen
    }

    hydStore.assignBoundaryCondition([id], payload);
};

// Create a new Global Profile and link it immediately
const createNewProfile = () => {
    const newId = hydStore.createGanglinie('Neues Profil ' + new Date().toLocaleTimeString().slice(0,5), 'Zufluss');
    selectedProfileId.value = newId;
    saveSettings(); // Auto-save assignment
};

const goToProfileManager = () => {};

</script>

<template>
  <div class="boundary-config-panel">
    <div class="panel-header">
      <h4>Hydraulik ({{ shortId }})</h4>
    </div>

    <div v-if="selectedItem" class="panel-body">

      <!-- TYPE SELECTION -->
      <div class="form-group">
          <label>Verhaltenstyp</label>
          <select v-model="activeType" @change="onTypeChange" class="main-select">
              <option value="NONE">Keine Auswahl</option>
              <optgroup label="Zulauf">
                  <option value="INFLOW_CONSTANT">🚰 Konstanter Zufluss</option>
                  <option value="INFLOW_DYNAMIC">🌊 Zufluss (Ganglinie)</option>
              </optgroup>
              <option value="OUTFLOW" :disabled="!outflowAllowed">
                  ↘️ Ablauf{{ outflowAllowed ? '' : ' (nur auf Kante/nahe Gelände)' }}
              </option>
          </select>
      </div>

      <!-- DYNAMIC CONFIG (Zufluss-Ganglinie + Ablauf-Pegel-Ganglinie teilen sich den Editor) -->
      <div v-if="activeType === 'INFLOW_DYNAMIC' || (activeType === 'OUTFLOW' && outflowMode === 'HVAR')" class="dynamic-config">
          <div class="form-group">
            <label>Ganglinie wählen</label>
            <div class="select-row">
                <select v-model="selectedProfileId" @change="saveSettings" class="sub-select">
                    <option :value="null" disabled>-- Bitte wählen --</option>
                    <option v-for="gl in ganglinienOptions" :key="gl.id" :value="gl.id">
                        {{ gl.name }}
                    </option>
                </select>
                <button class="btn-new" @click="createNewProfile" title="Neue Ganglinie erstellen">+</button>
            </div>
          </div>

          <!-- EMBEDDED EDITOR -->
          <div v-if="showGanglinienEditor" class="embedded-editor">
              <GanglinienEditor
                v-model="currentProfileData"
                :duration="10800"
              />
          </div>
          <div v-else-if="!selectedProfileId" class="hint-warn">
              <SvEmoji emoji="⚠" :size="13" /> Bitte eine Ganglinie auswählen oder erstellen.
          </div>
      </div>

      <!-- CONSTANT CONFIG -->
      <div v-if="activeType === 'INFLOW_CONSTANT'" class="constant-config">
          <div class="form-group">
              <label>Gesamtzufluss Q (m³/s)</label>
              <input type="number" v-model.number="constantValue" @change="saveSettings" step="0.1" min="0" class="value-input">
              <small class="hint-info">Wird automatisch auf alle Randzellen aufgeteilt.</small>
          </div>
      </div>

      <!-- FLIESSRICHTUNG (beide Inflow-Typen) — freier Winkel -->
      <div v-if="activeType === 'INFLOW_CONSTANT' || activeType === 'INFLOW_DYNAMIC'" class="form-group">
          <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
              <input type="checkbox" v-model="directed" @change="saveSettings">
              <span>Gerichteter Zufluss (Impuls)</span>
          </label>
          <small v-if="!directed" class="hint-info">
              Richtungslos: hebt nur die Wassersäule (Quelle/Regeneinleitung/Schacht).
          </small>

          <div v-if="directed" class="angle-config">
              <div class="angle-row">
                  <!-- Kompass-Rad mit Pfeil — Klick setzt den Winkel -->
                  <div class="angle-dial clickable" title="Klicken zum Einstellen (0°=Ost, 90°=Nord)"
                       @click="onDialClick">
                      <div class="angle-needle" :style="{ transform: `rotate(${dialAngle}deg)` }"></div>
                      <span class="dial-n">N</span>
                  </div>
                  <div class="angle-input-col">
                      <div class="angle-number">
                          <input type="number" :value="angleDisplay"
                                 @change="setAngle(Number($event.target.value))"
                                 step="5" min="0" max="360" class="value-input">
                          <span class="deg">°</span>
                      </div>
                      <div class="preset-row">
                          <button v-for="pre in compassPresets" :key="pre.label" class="preset-btn"
                                  :class="{ active: ((flowAngleDeg%360)+360)%360 === pre.deg }"
                                  @click="setAngle(pre.deg)">{{ pre.label }}</button>
                      </div>
                  </div>
              </div>
              <small class="hint-info">
                  Welt-Azimut: 0°=Ost, 90°=Nord (gegen Uhrzeigersinn). Der Solver rechnet die
                  Quellzelle mit echtem Impuls in dieser Richtung. Im 3D-Editor auch per Dreh-Greifer
                  setzbar.
              </small>
          </div>
      </div>

      <!-- SEGMENT-LAGE (read-only, aus Geometrie) — immer sichtbar, auch vor der Typwahl,
           damit der "Ablauf nur auf Kante"-Hinweis schon vorab erkennbar ist. -->
      <div class="segment-info" :class="segmentInfo.cls">
          {{ segmentInfo.text }}
      </div>

       <!-- ABLAUF CONFIG -->
       <div v-if="activeType === 'OUTFLOW'" class="info-box outflow-config">
          <div class="form-group">
              <label>Verhalten</label>
              <div class="mode-row">
                  <button v-for="opt in outflowModeOptions" :key="opt.value" class="mode-btn"
                          :class="{ active: outflowMode === opt.value }"
                          :disabled="opt.value === 'FREE' && outflowEligibility === 'NONE'"
                          :title="opt.value === 'FREE' && outflowEligibility === 'NONE' ? freeDisabledTooltip : ''"
                          @click="setOutflowMode(opt.value)">{{ opt.icon }} {{ opt.label }}</button>
              </div>
          </div>

          <template v-if="outflowMode === 'FREE'">
              <p>Das Wasser fließt hier frei aus dem Modell ab.</p>
              <div class="form-group" style="margin-top:12px;">
                  <label>Sohlgefälle Sf (m/m) — optional</label>
                  <input type="number" v-model.number="outflowSlope" @change="saveSettings"
                         step="0.1" min="0.001" placeholder="Standard: 10 (steil, verhindert Rückstau)" class="value-input">
                  <small class="hint-info">
                      Steuert die Abflussgeschwindigkeit (Normalabfluss/Manning) am Modellrand.
                      Größere Werte = schnellerer, garantiert rückstaufreier Abfluss — kein
                      Höchstwert. Der Standard ist bewusst steil gewählt, damit hier nie Wasser
                      aufstaut.
                  </small>
              </div>
          </template>

          <template v-else-if="outflowMode === 'HFIX'">
              <div class="form-group" style="margin-top:12px;">
                  <label>Bezug</label>
                  <div class="mode-row">
                      <button class="mode-btn" :class="{ active: !stageRelative }"
                              @click="stageRelative = false; saveSettings()">Absolut (m NHN)</button>
                      <button class="mode-btn" :class="{ active: stageRelative }"
                              @click="stageRelative = true; saveSettings()">Relativ (über Gelände)</button>
                  </div>
              </div>
              <div class="form-group">
                  <label>{{ stageRelative ? 'Wasserstand über Gelände (m)' : 'Fester Wasserspiegel (m NHN)' }}</label>
                  <input type="number" v-model.number="stageValue" @change="saveSettings" step="0.1" class="value-input">
                  <small v-if="stageRelative" class="hint-info">
                      Wasserspiegel = Geländehöhe an dieser Randbedingung + der hier eingegebene Wert
                      (z. B. 0.3 m dauerhaft im Wasser stehend, unabhängig von der absoluten Höhe).
                  </small>
              </div>
          </template>
          <!-- HVAR: Ganglinien-Auswahl wird oben im gemeinsamen dynamic-config-Block gerendert -->
      </div>

    </div>
  </div>
</template>

<style scoped>
.boundary-config-panel {
    background: #1e1e2c;
    color: #ecf0f1;
    padding: 10px;
    height: 100%;
    display: flex; flex-direction: column;
}
.panel-header { border-bottom: 1px solid #2e2740; margin-bottom: 10px; padding-bottom: 5px; }
.panel-header h4 { margin: 0; font-size: 1rem; color: #bdc3c7; }

.form-group { margin-bottom: 15px; }
.form-group label { display: block; font-size: 0.85rem; color: #bdc3c7; margin-bottom: 5px; }

.main-select, .sub-select, .value-input {
    width: 100%; padding: 8px; background: #1e272e; border: 1px solid #2e2740; color: white; border-radius: 4px;
}
.main-select { font-weight: bold; }

.select-row { display: flex; gap: 5px; }
.btn-new {
    background: #a3e635; border: none; color: #12121a; width: 30px; border-radius: 4px; cursor: pointer; font-size: 1.2rem;
}
.btn-new:hover { background: #b6f04d; }

.embedded-editor {
    height: 250px;
    border: 1px solid #2e2740;
    border-radius: 4px;
    overflow: hidden;
    margin-top: 10px;
}

.info-box {
    background: rgba(163,230,53, 0.1); border-left: 3px solid #a3e635; padding: 10px; font-size: 0.9rem;
}
.hint-warn { color: #f39c12; font-size: 0.9rem; margin-top: 5px; }
.hint-info { color: #7f8c8d; font-size: 0.8rem; margin-top: 3px; display: block; }

/* ── Segment-Lage-Indikator (read-only) ── */
.segment-info {
    font-size: 0.8rem; padding: 7px 9px; border-radius: 4px; margin-bottom: 12px; line-height: 1.35;
}
.seg-edge     { background: rgba(41,128,185,0.15); color: #a3e635; border: 1px solid rgba(41,128,185,0.4); }
.seg-interior { background: rgba(127,140,141,0.12); color: #bdc3c7; border: 1px solid rgba(127,140,141,0.3); }
.seg-front    { background: rgba(241,196,15,0.12);  color: #f1c40f; border: 1px solid rgba(241,196,15,0.3); }

/* ── Ablauf-Verhalten-Umschalter (gleicher Stil wie preset-row/gtype-btn) ── */
.mode-row { display: flex; gap: 6px; }
.mode-btn {
    flex: 1; padding: 7px 4px; border: 1px solid #4a6278; border-radius: 5px;
    background: #1e3348; color: #bdc3c7; font-size: 0.75rem; font-weight: 600;
    cursor: pointer; transition: all 0.15s; text-align: center;
}
.mode-btn:hover  { background: #2471a3; border-color: #6d43d4; color: #fff; }
.mode-btn.active { background: #6d43d4; border-color: #a3e635; color: #fff; }
.mode-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.mode-btn:disabled:hover { background: #1e3348; border-color: #4a6278; color: #bdc3c7; }

/* ── Fließrichtungs-Winkel (Kompass-Rad) ── */
.angle-config { margin-top: 10px; }
.angle-row { display: flex; align-items: center; gap: 14px; }
.angle-dial {
    position: relative; width: 56px; height: 56px; border-radius: 50%;
    border: 2px solid #4a6278; background: #1e3348; flex-shrink: 0;
}
.angle-dial.clickable { cursor: pointer; }
.angle-dial.clickable:hover { border-color: #a3e635; }
.angle-needle {
    position: absolute; left: 50%; top: 50%; width: 3px; height: 24px;
    background: #a3e635; border-radius: 2px; transform-origin: bottom center;
    margin-left: -1.5px; margin-top: -24px;
}
.angle-needle::after {
    content: ''; position: absolute; top: -5px; left: -3.5px;
    border-left: 5px solid transparent; border-right: 5px solid transparent;
    border-bottom: 7px solid #a3e635;
}
.dial-n { position: absolute; top: 1px; left: 50%; transform: translateX(-50%); font-size: 0.6rem; color: #7f8c8d; }
.angle-input-col { flex: 1; display: flex; flex-direction: column; gap: 6px; }
.angle-number { display: flex; align-items: center; gap: 4px; }
.angle-number .deg { color: #bdc3c7; }
.preset-row { display: flex; gap: 4px; }
.preset-btn {
    flex: 1; padding: 4px 0; border: 1px solid #4a6278; border-radius: 4px;
    background: #1e3348; color: #bdc3c7; font-size: 0.78rem; font-weight: 600; cursor: pointer;
}
.preset-btn:hover  { background: #2471a3; color: #fff; }
.preset-btn.active { background: #6d43d4; border-color: #a3e635; color: #fff; }
</style>

