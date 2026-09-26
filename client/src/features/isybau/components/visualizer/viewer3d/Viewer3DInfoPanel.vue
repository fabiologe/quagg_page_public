<template>
  <Transition name="slide-up">
    <div v-if="element" class="info-panel" :style="resFarben">
      <div class="info-header" :style="{ background: headerGradient }">
        <h3>{{ title }}</h3>
        <button title="Schließen" aria-label="Schließen" class="close-btn" @click="$emit('close')">×</button>
      </div>
      <div class="info-body">
        <div class="info-row">
          <span class="lbl">ID</span>
          <span class="val">{{ element.id }}</span>
        </div>

        <!-- ─── Haltung / Pipe ──────────────────────────────────────── -->
        <template v-if="isEdge">
          <div class="info-row">
            <span class="lbl">Profil</span>
            <span class="val">{{ profileName }}</span>
          </div>
          <div class="info-row" v-if="element.profile?.height">
            <span class="lbl">Dimension</span>
            <span class="val">{{ (element.profile.height * 1000).toFixed(0) }} mm</span>
          </div>
          <div class="info-row" v-if="element.length">
            <span class="lbl">Länge</span>
            <span class="val">{{ element.length.toFixed(2) }} m</span>
          </div>
          <div class="info-row" v-if="element.z1 != null">
            <span class="lbl">SH Anfang</span>
            <span class="val">{{ element.z1?.toFixed(2) }} m</span>
          </div>
          <div class="info-row" v-if="element.z2 != null">
            <span class="lbl">SH Ende</span>
            <span class="val">{{ element.z2?.toFixed(2) }} m</span>
          </div>
        </template>

        <!-- ─── Fläche / Area ──────────────────────────────────────── -->
        <template v-else-if="isArea">
          <div class="info-row">
            <span class="lbl">Größe</span>
            <span class="val">{{ element.size?.toFixed(4) }} ha</span>
          </div>
          <div class="info-row" v-if="element.runoffCoeff != null">
            <span class="lbl">Versiegelungsgrad ψ</span>
            <span class="val">{{ element.runoffCoeff }}</span>
          </div>
        </template>

        <!-- ─── Knoten / Node ──────────────────────────────────────── -->
        <template v-else>
          <!-- Common node fields -->
          <div class="info-row" v-if="element.z != null">
            <span class="lbl">Sohlhöhe</span>
            <span class="val">{{ element.z?.toFixed(2) }} m</span>
          </div>
          <div class="info-row" v-if="element.coverZ">
            <span class="lbl">Deckelhöhe</span>
            <span class="val">{{ element.coverZ?.toFixed(2) }} m</span>
          </div>
          <div class="info-row" v-if="element.depth">
            <span class="lbl">Tiefe</span>
            <span class="val">{{ element.depth?.toFixed(2) }} m</span>
          </div>
          <div class="info-row" v-if="element.diameter">
            <span class="lbl">Durchmesser</span>
            <span class="val">{{ (element.diameter * 1000).toFixed(0) }} mm</span>
          </div>

          <!-- Fiktiver Knoten — always shown first, overrides bwType badges -->
          <template v-if="element.status === 2">
            <div class="type-badge fictive">◌ Fiktiv</div>
          </template>

          <!-- Pumpwerk (bwType 1) -->
          <template v-else-if="bwType === 1">
            <div class="type-badge pumpwerk">⚙ Pumpwerk</div>
            <div class="info-row" v-if="element.pumpRate">
              <span class="lbl">Förderleistung</span>
              <span class="val">{{ element.pumpRate }} l/s</span>
            </div>
            <div class="info-row" v-if="element.onDepth != null">
              <span class="lbl">Ein-Tiefe</span>
              <span class="val">{{ element.onDepth }} m</span>
            </div>
            <div class="info-row" v-if="element.offDepth != null">
              <span class="lbl">Aus-Tiefe</span>
              <span class="val">{{ element.offDepth }} m</span>
            </div>
          </template>

          <!-- Pumpe (bwType 6) — Sonderbauwerk-Knoten (hell lila) -->
          <template v-else-if="bwType === 6">
            <div class="type-badge sonderbauwerk">⚙ Pumpe</div>
            <div class="info-row" v-if="element.pumpRate">
              <span class="lbl">Förderleistung</span>
              <span class="val">{{ element.pumpRate }} l/s</span>
            </div>
            <div class="info-row" v-if="element.onDepth != null">
              <span class="lbl">Ein-Tiefe</span>
              <span class="val">{{ element.onDepth }} m</span>
            </div>
            <div class="info-row" v-if="element.offDepth != null">
              <span class="lbl">Aus-Tiefe</span>
              <span class="val">{{ element.offDepth }} m</span>
            </div>
          </template>

          <!-- Wehr (bwType 7) — Sonderbauwerk-Knoten (hell lila) -->
          <template v-else-if="bwType === 7">
            <div class="type-badge sonderbauwerk">〰 Wehr / Überlauf</div>
            <div class="info-row" v-if="element.weirHeight">
              <span class="lbl">Wehrhöhe</span>
              <span class="val">{{ element.wehrHeight?.toFixed(2) ?? element.weirHeight?.toFixed(2) }} m</span>
            </div>
            <div class="info-row" v-if="element.weirWidth || element.bauwerkData?.wehrLaenge">
              <span class="lbl">Wehrlänge</span>
              <span class="val">{{ (element.bauwerkData?.wehrLaenge ?? element.weirWidth)?.toFixed(2) }} m</span>
            </div>
            <div class="info-row" v-if="element.dischargeCoeff">
              <span class="lbl">Beiwert Cw</span>
              <span class="val">{{ element.dischargeCoeff }}</span>
            </div>
          </template>

          <!-- Becken / Speicher (bwType 2, 3, 4, 12, 13) -->
          <template v-else-if="[2, 3, 4, 12, 13].includes(bwType)">
            <div class="type-badge becken">▭ Becken / Speicher</div>
            <div class="info-row" v-if="element.volume">
              <span class="lbl">Volumen</span>
              <span class="val">{{ element.volume }} m³</span>
            </div>
            <div class="info-row" v-if="element.maxDepth">
              <span class="lbl">Max. Tiefe</span>
              <span class="val">{{ element.maxDepth }} m</span>
            </div>
          </template>

          <!-- Drossel / Schieber (bwType 8, 9) — Sonderbauwerk-Knoten (hell lila) -->
          <template v-else-if="bwType === 8 || bwType === 9">
            <div class="type-badge sonderbauwerk">⊘ {{ bwType === 8 ? 'Drossel' : 'Schieber' }}</div>
            <div class="info-row" v-if="element.maxOutflow">
              <span class="lbl">Max. Abfluss</span>
              <span class="val">{{ element.maxOutflow }} l/s</span>
            </div>
          </template>

          <!-- Auslass (bwType 5) -->
          <template v-else-if="bwType === 5 || element.type === 'Auslass'">
            <div class="type-badge outfall">▽ Auslass</div>
          </template>
        </template>

        <!-- ─── Simulationsergebnis ───────────────────────────────────── -->
        <template v-if="result">
          <div class="result-header">Simulationsergebnis</div>

          <!-- Node results -->
          <template v-if="!isEdge && !isArea">
            <div class="info-row" v-if="knotenZustand(result) === 'überstaut'">
              <span class="lbl">Status</span>
              <span class="val res-bad">⚠ Überstaut (über Deckel)</span>
            </div>
            <div class="info-row" v-else-if="knotenZustand(result) === 'eingestaut'">
              <span class="lbl">Status</span>
              <span class="val res-warn">↑ Eingestaut (über Rohrscheitel)</span>
            </div>
            <div class="info-row" v-else>
              <span class="lbl">Status</span>
              <span class="val res-ok">✓ Normal</span>
            </div>
            <div class="info-row" v-if="result.reportedMaxDepth != null">
              <span class="lbl">Max. Wasserstand</span>
              <span class="val">{{ result.reportedMaxDepth?.toFixed(2) ?? '–' }} m</span>
            </div>
            <div class="info-row" v-if="result.maxTotalInflow">
              <span class="lbl">Max. Zufluss</span>
              <span class="val">{{ result.maxTotalInflow.toFixed(1) }} l/s</span>
            </div>
            <div class="info-row" v-if="result.floodingVolume">
              <span class="lbl">Überstauvolumen</span>
              <span class="val res-bad">{{ Math.round(result.floodingVolume) }} m³</span>
            </div>
          </template>

          <!-- Pumpwerk-Betrieb (aus systemStats.pumpingSummary der zugehörigen Haltung) -->
          <template v-if="pumpSummary">
            <div class="info-row">
              <span class="lbl">Pumpe: Nutzung</span>
              <span class="val">{{ pumpSummary.percentUtilized?.toFixed(1) }} %</span>
            </div>
            <div class="info-row">
              <span class="lbl">Pumpe: Starts</span>
              <span class="val">{{ pumpSummary.startUps }}</span>
            </div>
            <div class="info-row" v-if="pumpSummary.totalEnergy != null">
              <span class="lbl">Energie</span>
              <span class="val">{{ pumpSummary.totalEnergy.toFixed(2) }} kWh</span>
            </div>
          </template>

          <!-- Knoten→Link-Verweis für Pumpe/Wehr/Drossel/Schieber ohne eigenes Ergebnis -->
          <div v-if="relatedLinkId && !pumpSummary" class="link-hint">
            ⚙ Ergebnis siehe Haltung <strong>{{ relatedLinkId }}</strong>
          </div>

          <!-- Edge results -->
          <template v-if="isEdge">
            <div class="info-row" v-if="edgeZustand.auslastung != null">
              <span class="lbl">Auslastung Q/Qvoll</span>
              <span class="val" :style="{ color: edgeZustand.farbe }">{{ Math.round(edgeZustand.auslastung) }} %</span>
            </div>
            <div class="info-row" v-if="result.depthRatio != null">
              <span class="lbl">Füllung h/hvoll</span>
              <span class="val" :class="{ 'res-bad': edgeZustand.eingestaut }">{{ Math.round(result.depthRatio * 100) }} %{{ edgeZustand.eingestaut ? ' (eingestaut)' : '' }}</span>
            </div>
            <div class="info-row" v-if="result.maxFlow != null">
              <span class="lbl">Max. Abfluss</span>
              <span class="val">{{ result.maxFlow.toFixed(2) }} l/s</span>
            </div>
            <div class="info-row" v-if="result.maxVelocity != null">
              <span class="lbl">Max. Geschw.</span>
              <span class="val">{{ result.maxVelocity.toFixed(2) }} m/s</span>
            </div>
          </template>
        </template>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { computed } from 'vue';
import { BAUWERK, FLAECHE, DATENQUALITAET, AUSLASTUNG_STUFEN, haltungsZustand, knotenZustand } from '../../../utils/typPalette.js';
const BAUWERK_DUNKEL = 'var(--isy-pixel-border)';
const resFarben = Object.fromEntries(
  AUSLASTUNG_STUFEN.map((st, i) => [`--res-${i + 1}`, st.farbe]),
);
import { getNodeBwType } from './useSceneBuilder.js';
import { LINK_BAUWERKSTYPEN } from '../../../utils/mappings.js';

const props = defineProps({
  element: { type: Object, default: null },
  result:  { type: Object, default: null },
  edges:   { type: Map,    default: () => new Map() },
  systemStats: { type: Object, default: () => ({}) },
});
defineEmits(['close']);

const isEdge = computed(() => props.element && (props.element.fromNodeId || props.element.from));
const isArea = computed(() => props.element && Array.isArray(props.element.points));
const bwType = computed(() => (!props.element || isEdge.value || isArea.value) ? 0 : getNodeBwType(props.element));

// Pumpe/Wehr/Drossel/Schieber sind in SWMM LINKS — benannt nach der ausgehenden
// Haltung dieses Knotens. Das reale Hydraulik-Ergebnis liegt dort, nicht am
// Knoten; informativer Hinweis + (für Pumpen) direkte Kennzahlen aus dem Report.
const relatedLinkId = computed(() => {
  if (!props.element || isEdge.value || isArea.value || !LINK_BAUWERKSTYPEN.has(bwType.value)) return null;
  const edge = Array.from(props.edges.values()).find(e => e.fromNodeId === props.element.id);
  return edge?.id ?? null;
});

const pumpSummary = computed(() => {
  if (bwType.value !== 1 && bwType.value !== 6) return null;
  const id = relatedLinkId.value;
  if (!id) return null;
  return props.systemStats?.pumpingSummary?.find(p => p.id === id) ?? null;
});

const TITLES = {
  1: 'Pumpwerk (3D)', 2: 'Becken / Speicher (3D)', 3: 'Kläranlage (3D)',
  4: 'Regenüberlauf (3D)', 5: 'Auslass (3D)', 6: 'Pumpe (3D)',
  7: 'Wehr / Überlauf (3D)', 8: 'Drossel (3D)', 9: 'Schieber (3D)',
  12: 'Versickerung (3D)', 13: 'Zisterne (3D)',
};

const title = computed(() => {
  if (isEdge.value) return 'Haltung (3D)';
  if (isArea.value) return 'Fläche (3D)';
  if (!props.element) return '';
  if (props.element.status === 2) return 'Fiktiv (3D)';
  return TITLES[bwType.value] ?? 'Schacht (3D)';
});

// Bauwerke tragen KEINE Typfarbe mehr (Nutzer-Entscheidung, siehe
// utils/typPalette.js). Vorher hatte jeder Typ seinen eigenen Verlauf —
// Pumpwerk orange, Becken teal, Auslass gruen, alles uebrige graubeige. In der
// 3D-Szene kollidierte das zweimal: Orange war dort zugleich "> 75 %
// ausgelastet", Gruen zugleich "ausgewaehlt".
//
// Der Typ geht nicht verloren: er steht als Text im Kopf dieses Panels, und in
// der 3D-Szene hat jeder Typ eine eigene Geometrie (Kegel = Auslass,
// Zylinder = Pumpwerk, Quader = Becken).
const BAUWERK_GRADIENT = `linear-gradient(135deg,${BAUWERK_DUNKEL},${BAUWERK})`;

const headerGradient = computed(() => {
  if (isEdge.value)  return `linear-gradient(135deg,${BAUWERK_DUNKEL},${FLAECHE})`;
  if (isArea.value)  return `linear-gradient(135deg,${BAUWERK_DUNKEL},${FLAECHE})`;
  // Fiktivpunkt ist Datenqualitaet, kein Bauwerkstyp - behaelt seine Farbe.
  if (props.element?.status === 2) return `linear-gradient(135deg,${BAUWERK_DUNKEL},${DATENQUALITAET.fiktiv})`;
  return BAUWERK_GRADIENT;
});

const PROFILE_NAMES = {
  0: 'Kreisprofil', 1: 'Eiprofil', 2: 'Maulprofil',
  3: 'Rechteck (geschl.)', 4: 'Trapez', 5: 'Rechteck (offen)', 8: 'Trapez (breit)',
};
const profileName = computed(() =>
  isEdge.value && props.element?.profile
    ? (PROFILE_NAMES[props.element.profile.type] ?? `Typ ${props.element.profile.type}`)
    : '-'
);

// Q/Qvoll und Einstau aus EINER Regel (typPalette.haltungsZustand) — vorher stand hier
// h/hvoll als „Auslastung" und die Schwellen ein viertes Mal.
const edgeZustand = computed(() => haltungsZustand(props.result));
</script>

<style scoped>
.info-panel {
  position: absolute;
  top: 1rem; right: 1rem;
  width: 280px;
  background: var(--isy-pixel-bg);
  border: 1px solid var(--isy-pixel-border);
  border-radius: var(--isy-radius-lg);
  box-shadow: var(--isy-elev-4);
  overflow: hidden;
  z-index: var(--isy-z-sticky);
  backdrop-filter: blur(8px);
}

.info-header {
  padding: var(--isy-space-3) var(--isy-space-4);
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid rgba(255,255,255,0.1);
}
.info-header h3 {
  margin: 0;
  font-size: var(--isy-fs-sm);
  color: var(--isy-pixel-text);
  font-family: var(--isy-pixel-font);
}
.close-btn {
  background: none; border: none; color: var(--isy-pixel-text-dim);
  font-size: var(--isy-fs-xl); cursor: var(--isy-cursor-hand); line-height: 1; padding: 0;
}
.close-btn:hover { color: var(--isy-pixel-text); }

.info-body { padding: var(--isy-space-3) var(--isy-space-4); }

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--isy-space-1) 0;
  border-bottom: 1px solid rgba(255,255,255,0.05);
  font-size: var(--isy-fs-md);
}
.info-row:last-child { border-bottom: none; }
.lbl { color: var(--isy-pixel-text-dim); }
.val { color: var(--isy-pixel-text); font-weight: 600; text-align: right; }

.type-badge {
  margin: var(--isy-space-2) 0 var(--isy-space-2);
  padding: var(--isy-space-1) var(--isy-space-2);
  border-radius: var(--isy-radius-sm);
  font-size: var(--isy-fs-sm);
  font-weight: 700;
  display: inline-block;
}
/* EIN Aussehen fuer alle Bauwerkstypen. Der Typ steht als Symbol und Wort im
   Abzeichen selbst ("▭ Becken / Speicher"), die Farbe war Doppelung - und
   kollidierte in der 3D-Szene mit den Auslastungsklassen. */
.type-badge.pumpwerk,
.type-badge.sonderbauwerk,
.type-badge.becken,
.type-badge.outfall { background: var(--isy-pixel-accent-soft); color: var(--isy-pixel-content-text); border: 1px solid var(--isy-pixel-border); }
.type-badge.fictive  { background: rgba(239,68,68,0.2);  color: var(--isy-pixel-danger-soft-border); border: 1px solid var(--isy-pixel-danger); }

.slide-up-enter-active, .slide-up-leave-active { transition: all 0.25s ease; }
.slide-up-enter-from, .slide-up-leave-to { transform: translateY(12px); opacity: 0; }

.result-header {
  margin: var(--isy-space-2) 0 var(--isy-space-1);
  padding: var(--isy-space-1) 0;
  border-top: 1px solid rgba(255,255,255,0.1);
  font-size: var(--isy-fs-pixel-md);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--isy-pixel-text-dim);
  font-family: monospace;
}

.link-hint {
  margin-top: var(--isy-space-2);
  padding: var(--isy-space-1) var(--isy-space-2);
  background: var(--isy-pixel-info-soft);
  border: 1px solid var(--isy-pixel-info-soft-border);
  border-radius: var(--isy-radius-sm);
  font-size: var(--isy-fs-sm);
  color: var(--isy-pixel-info-soft-text);
}

/* Werte kommen aus utils/typPalette.js, gesetzt als CSS-Variablen am
   Panel-Wurzelelement (siehe :style dort). CSS kann kein JS importieren; so
   bleibt die Palette trotzdem die einzige Quelle. */
.res-bad    { color: var(--res-1); }
.res-warn   { color: var(--res-2); }
.res-yellow { color: var(--res-3); }
.res-ok     { color: var(--res-5); }
</style>
