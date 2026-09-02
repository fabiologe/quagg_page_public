<template>
  <div class="hud-layer">
    <!-- Messlinien -->
    <svg v-if="messPunkte.length" class="hud-svg">
      <line
        v-for="m in messPunkte"
        :key="`l-${m.i}`"
        :x1="m.a.x" :y1="m.a.y" :x2="m.b.x" :y2="m.b.y"
        class="hud-mess-linie"
      />
      <circle v-for="m in messPunkte" :key="`p1-${m.i}`" :cx="m.a.x" :cy="m.a.y" r="2.5" class="hud-mess-punkt" />
      <circle v-for="m in messPunkte" :key="`p2-${m.i}`" :cx="m.b.x" :cy="m.b.y" r="2.5" class="hud-mess-punkt" />
    </svg>

    <!-- Mess-Pillen: Wert direkt an der Strecke, einzeln löschbar -->
    <div
      v-for="m in messPunkte"
      :key="`pill-${m.i}`"
      class="hud-pill"
      :style="{ left: m.mitte.x + 'px', top: m.mitte.y + 'px' }"
    >
      <CdeIcon name="measure" :size="12" />
      <span class="hud-pill-wert">{{ m.text }}</span>
      <button class="hud-pill-x" title="Diese Messung löschen" @click="$emit('delete-measurement', m.i)">
        <CdeIcon name="close" :size="11" />
      </button>
    </div>

    <!-- Kontext-Aktionen an der Auswahl -->
    <div
      v-if="auswahlPunkt"
      class="hud-menu"
      :style="{ left: auswahlPunkt.x + 'px', top: auswahlPunkt.y + 'px' }"
    >
      <div class="hud-menu-kopf" :title="auswahlTitel">
        <span class="hud-menu-typ">{{ (element?.type ?? '').replace(/^IFC/, '') }}</span>
        <span class="hud-menu-name">{{ element?.name || '—' }}</span>
      </div>
      <div class="hud-menu-tasten">
        <button
          v-for="a in aktionen"
          :key="a.id"
          class="hud-menu-btn"
          :title="a.key ? `${a.titel} [${a.key}]` : a.titel"
          @click="a.run"
        >
          <CdeIcon :name="a.icon" :size="14" />
        </button>
      </div>

      <!-- Bearbeiten am Bauteil (Stufe 9.0). Was hier steht, kommt aus dem
           Katalog und ist über die Bauform gefiltert — dieselbe Liste, die auch
           die Befehls-Palette liest. -->
      <div v-if="bearbeitung.modusAn && bearbeitung.moeglich.length" class="hud-bearb">
        <div v-if="!bearbeitung.scharf" class="hud-bearb-liste">
          <button
            v-for="b in bearbeitung.moeglich"
            :key="b.id"
            class="hud-bearb-btn"
            :title="b.titel"
            @click="bearbeitung.starte(b.id)"
          >
            <CdeIcon :name="b.icon" :size="12" />
            <span>{{ b.titel }}</span>
          </button>
        </div>

        <CdeBearbeitungForm
          v-else
          :felder="bearbeitung.felder"
          :werte="bearbeitung.werte"
          :fehler="bearbeitung.fehler"
          :hinweis="guetehinweis"
          :bereit="bearbeitung.bereit"
          @setze-wert="bearbeitung.setzeWert"
          @uebernehmen="uebernehmen"
          @abbrechen="bearbeitung.abbrechen()"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
/**
 * CdeHudLayer — Werte und Aktionen dort, wo sie hingehören: am Objekt
 * (Sprint U, AP-U4).
 *
 * Ersetzt zwei Notlösungen: die Messliste in der Bildschirmecke (die beim
 * Verlassen des Mess-Modus verschwand und einzelne Messungen nicht löschen
 * konnte) und die Auswahl-Knöpfe am Rand, die nichts mit der Lage des
 * gewählten Bauteils zu tun hatten.
 *
 * Die Reprojektion läuft über `useScreenProjection` — nur bei bewegter Kamera.
 */
import { computed, ref, watch } from 'vue';
import CdeIcon from './ui/CdeIcon.vue';
import CdeBearbeitungForm from './ui/CdeBearbeitungForm.vue';
import { useScreenProjection } from '../composables/useScreenProjection.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { useCdeStore } from '../stores/useCdeStore.js';
import { useViewerApi } from '../composables/viewerApi.js';
import { modellHerkunft } from '../services/IfcAutor.js';

const props = defineProps({
  /** [{ dist, p1:{x,y,z}, p2:{x,y,z} }] */
  measurements: { type: Array, default: () => [] },
  /** aktuell gewähltes Element (useIfcStore.selectedElement) */
  element:      { type: Object, default: null },
  /** Welt-Punkt der Auswahl (BBox-Zentrum) — [x,y,z] oder null */
  elementAnker: { type: Array, default: null },
  /** (worldPos[3]) => {x,y}|null */
  projectToScreen: { type: Function, default: null },
  getCamera:    { type: Function, default: null },
  getCanvas:    { type: Function, default: null },
});

const emit = defineEmits([
  'delete-measurement', 'zoom', 'hide', 'isolate', 'properties', 'new-issue',
]);

/**
 * Der Bearbeitungs-Store wird hier DIREKT gelesen, nicht über acht weitere
 * Props durchgereicht (Stufe 9.0). Grund: Liste, scharfe Bearbeitung, Felder,
 * Werte, Fehler und Bereitschaft gehören zusammen und ändern sich gemeinsam —
 * sie einzeln durch `IfcViewer` zu fädeln wäre genau die Zeremonie, die den
 * Viewer vor Stufe 5 auf 1.400 Zeilen gebracht hat. Die Messwerte und das
 * gewählte Element bleiben Props: die kommen aus der Engine, nicht aus einem Store.
 */
const bearbeitung = useBearbeitung();
const cde = useCdeStore();
const api = useViewerApi();

/** Warnt, wenn die Bauform nur geschätzt ist — schweigt, wenn sie gemessen ist. */
const guetehinweis = computed(() => {
  const e = bearbeitung.einordnung;
  if (!e || e.guete === 'gemessen') return '';
  if (e.warnungen?.includes('achse_skelettiert')) return 'Achse aus dem Netz geschätzt — Wert prüfen.';
  return `Form nur ${e.guete} — Wert prüfen.`;
});

/**
 * Übernehmen am Bauteil — eintragen UND anwenden.
 *
 * Vorher wurde nur ein `bearbeitet`-Ereignis geworfen, dem niemand zuhörte.
 * Ein Ereignis ohne Empfänger sieht im Code aus wie eine Verdrahtung und ist
 * keine — deshalb steht hier jetzt der Aufruf statt des Emits.
 */
async function uebernehmen() {
  // Genau dieselben Angaben wie in der Toolbox — inklusive `modellSha`, das
  // hier bisher fehlte: Einträge aus dem Kontextmenü hatten dadurch keinen
  // Modellbezug, die aus der Toolbox schon. Zwei Sorten Eintrag für dieselbe
  // Bearbeitung, je nachdem wo man klickt.
  try {
    const el = bearbeitung.bauteil;
    const eintrag = await bearbeitung.ausfuehren({
      wer: cde.bearbeiter || '',
      modellSha: api.getLoadedModelSha?.() ?? null,
      basis: el?.globalId ? api.lieferstandVon?.(el.globalId) : undefined,
      modell: el ? modellHerkunft(el.modelId) : undefined,
    });
    if (eintrag) await api.wendeEintragAn?.(eintrag);
  } catch (fehler) {
    console.error('cde: uebernehmen (HUD)', fehler);   // Gesetz 10
  }
}

const { tick } = useScreenProjection({
  getCamera: () => props.getCamera?.() ?? null,
  getCanvas: () => props.getCanvas?.() ?? null,
});

/** Sichtbarkeits-Anker neu berechnen, sobald sich Kamera oder Daten ändern. */
function projiziere(p) {
  if (!p || !props.projectToScreen) return null;
  return props.projectToScreen(Array.isArray(p) ? p : [p.x, p.y, p.z]);
}

const messPunkte = computed(() => {
  // eslint-disable-next-line no-unused-vars
  const _ = tick.value; // Neuberechnung an den Tick koppeln
  const out = [];
  props.measurements.forEach((m, i) => {
    if (!m?.p1 || !m?.p2) return;
    const a = projiziere(m.p1);
    const b = projiziere(m.p2);
    if (!a || !b) return;
    out.push({
      i, a, b,
      mitte: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      text: formatDist(m.dist),
    });
  });
  return out;
});

const auswahlPunkt = computed(() => {
  // eslint-disable-next-line no-unused-vars
  const _ = tick.value;
  if (!props.element || !props.elementAnker) return null;
  return projiziere(props.elementAnker);
});

const auswahlTitel = computed(() =>
  `${props.element?.type ?? ''} · ${props.element?.name ?? ''}`.trim());

const aktionen = [
  { id: 'zoom',  icon: 'zoom-to',  titel: 'Auf Auswahl zoomen',  run: () => emit('zoom') },
  { id: 'hide',  icon: 'hidden',   titel: 'Auswahl ausblenden',  key: 'H', run: () => emit('hide') },
  { id: 'iso',   icon: 'isolate',  titel: 'Auswahl isolieren',   key: 'I', run: () => emit('isolate') },
  { id: 'props', icon: 'info',     titel: 'Eigenschaften zeigen', run: () => emit('properties') },
  { id: 'issue', icon: 'issues',   titel: 'Issue hier anlegen',  run: () => emit('new-issue') },
];

function formatDist(m) {
  const v = Number(m ?? 0);
  if (!Number.isFinite(v)) return '–';
  if (v < 1) return `${(v * 1000).toFixed(0)} mm`;
  if (v < 10) return `${v.toFixed(2)} m`;
  return `${v.toFixed(1)} m`;
}
</script>

<style scoped>
.hud-layer {
  position: absolute; inset: 0;
  pointer-events: none;          /* der Viewer bleibt bedienbar … */
  z-index: var(--cde-z-hud);
  overflow: hidden;
}
.hud-pill, .hud-menu { pointer-events: auto; }  /* … nur die Marken fangen Klicks */

.hud-svg { position: absolute; inset: 0; width: 100%; height: 100%; }
.hud-mess-linie {
  stroke: var(--cde-warn);
  stroke-width: 1.4;
  stroke-dasharray: 5 3;
}
.hud-mess-punkt { fill: var(--cde-warn); }

/* ── Mess-Pille ── */
.hud-pill {
  position: absolute;
  transform: translate(-50%, -50%);
  display: flex; align-items: center; gap: 0.25rem;
  padding: 0.15rem 0.35rem;
  background: var(--cde-surface-raised);
  border: 1px solid var(--cde-warn);
  border-radius: 999px;
  color: var(--cde-warn-soft);
  font-size: var(--cde-font-sm);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  box-shadow: var(--cde-shadow-sm);
}
.hud-pill-wert { font-weight: 600; }
.hud-pill-x {
  display: flex; align-items: center;
  background: none; border: none; cursor: pointer;
  color: var(--cde-text-mute); padding: 0;
}
.hud-pill-x:hover { color: var(--cde-danger); }

/* ── Kontextmenü an der Auswahl ── */
.hud-menu {
  position: absolute;
  transform: translate(-50%, calc(-100% - 14px));
  display: flex; flex-direction: column; gap: 0.25rem;
  padding: 0.35rem 0.4rem;
  background: var(--cde-surface-raised);
  border: 1px solid var(--cde-accent-line);
  border-radius: var(--cde-radius);
  box-shadow: var(--cde-shadow);
  max-width: 260px;
}
/* Zeiger zum Bauteil */
.hud-menu::after {
  content: '';
  position: absolute; left: 50%; bottom: -6px;
  transform: translateX(-50%);
  border-left: 6px solid transparent;
  border-right: 6px solid transparent;
  border-top: 6px solid var(--cde-accent-line);
}

.hud-menu-kopf {
  display: flex; align-items: baseline; gap: 0.35rem;
  font-size: var(--cde-font-xs);
  overflow: hidden;
}
.hud-menu-typ { color: var(--cde-accent); font-weight: 600; }
.hud-menu-name {
  color: var(--cde-text); overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap;
}

.hud-menu-tasten { display: flex; gap: 0.15rem; }
.hud-menu-btn {
  display: flex; align-items: center; justify-content: center;
  width: 26px; height: 24px;
  background: var(--cde-fill); border: 1px solid var(--cde-line);
  border-radius: var(--cde-radius-sm);
  color: var(--cde-text); cursor: pointer;
  transition: background 0.12s, color 0.12s;
}
.hud-menu-btn:hover { background: var(--cde-accent-fill-hi); color: var(--cde-accent); }

/* ── Bearbeiten am Bauteil (Stufe 9.0) ───────────────────────────────────── */
.hud-bearb {
  border-top: 1px solid var(--cde-line);
  padding-top: 0.3rem;
  display: flex; flex-direction: column; gap: 0.25rem;
  min-width: 190px;
}
.hud-bearb-liste { display: flex; flex-direction: column; gap: 0.15rem; }
.hud-bearb-btn {
  display: flex; align-items: center; gap: 0.35rem;
  padding: 0.22rem 0.35rem;
  background: transparent; border: 1px solid transparent;
  border-radius: var(--cde-radius-sm);
  color: var(--cde-text); cursor: pointer;
  font-size: var(--cde-font-xs); text-align: left;
}
.hud-bearb-btn:hover { background: var(--cde-accent-fill-hi); color: var(--cde-accent); }


/* T1 (Tablet-Pass): Das Kontextmenü schwebt und darf wachsen; nur das
   Pillen-X bekommt die unsichtbare Trefferfläche — ein echtes Wachsen
   verschöbe die Messpille um den Knopf herum. */
.hud-menu-btn, .hud-bearb-btn, .hud-pill-x { touch-action: manipulation; }
@media (pointer: coarse) {
  .hud-menu-btn { width: 38px; height: 36px; }
  .hud-bearb-btn { padding: 0.5rem 0.45rem; }
  .hud-pill-x { position: relative; }
  .hud-pill-x::after { content: ''; position: absolute; inset: -10px; }
}
</style>
