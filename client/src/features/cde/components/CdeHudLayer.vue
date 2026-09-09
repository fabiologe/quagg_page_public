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

    <!-- Die Pille am Zeiger (Teil XVI, S1): Koordinate und Fang, solange ein
         Werkzeug scharf ist. Sie folgt dem Zeiger direkt (Canvas-Pixel), nicht
         der Kamera — deshalb kein Tick. -->
    <div
      v-if="zeigerMarke"
      class="hud-zeiger"
      :class="{ 'hud-zeiger--fang': !!zeigerMarke.fang }"
      :style="{ left: zeigerMarke.x + 'px', top: zeigerMarke.y + 'px' }"
    >
      <span v-if="zeigerMarke.fang" class="hud-zeiger-fang">→ {{ zeigerMarke.fang.name }}</span>
      <span v-if="zeigerMarke.text" class="hud-zeiger-text">{{ zeigerMarke.text }}</span>
    </div>

    <!-- Die PILLE an der Auswahl (Teil XVI, S6): zu sieht man nur Typ und
         Namen — das Bauteil darunter bleibt frei. Ein Tipp klappt Aktionen
         und Werkzeugliste auf. Das FORMULAR der scharfen Bearbeitung wohnt
         NICHT mehr hier (es stand dreimal im Bild: HUD, Toolbox, Leiste) —
         nur noch in der Kontextleiste. -->
    <div
      v-if="auswahlPunkt"
      class="hud-menu"
      :class="{ 'hud-menu--zu': !aufgeklappt, 'hud-menu--scharf': !!bearbeitung.scharf }"
      :style="{ left: auswahlPunkt.x + 'px', top: auswahlPunkt.y + 'px' }"
    >
      <button
        class="hud-pille"
        :class="{ 'hud-pille--offen': aufgeklappt }"
        :title="aufgeklappt ? 'Zuklappen' : `${auswahlTitel}${beziehungsText ? ` · ${beziehungsText}` : ''} — Aktionen aufklappen`"
        :aria-expanded="aufgeklappt ? 'true' : 'false'"
        @click="aufgeklappt = !aufgeklappt"
      >
        <span class="hud-menu-typ">{{ (element?.type ?? '').replace(/^IFC/, '') }}</span>
        <span class="hud-menu-name">{{ element?.name || '—' }}</span>
        <span v-if="bearbeitung.scharf" class="hud-pille-werkzeug" :title="`${bearbeitung.scharf.titel} — Eingabe unten in der Leiste`">
          <CdeIcon :name="bearbeitung.scharf.icon || 'edit'" :size="11" />
        </span>
        <CdeIcon :name="aufgeklappt ? 'chevron-up' : 'chevron-down'" :size="11" class="hud-pille-pfeil" />
      </button>

      <template v-if="aufgeklappt">
        <!-- Was das Bauteil BERÜHRT (Teil XVII): Anschlüsse, Überdeckung,
             Enthalten, Kreuzung, Nähe, Ableitung — aus dem Beziehungsindex,
             am Subjekt (`bearbeitung.bauteil.beziehungen`). -->
        <div v-if="beziehungsChips.length" class="hud-beziehungen" title="Was dieses Bauteil berührt">
          <span
            v-for="(c, i) in beziehungsChips"
            :key="i"
            class="hud-beziehung"
            :class="{ 'hud-beziehung--warnung': c.warnung }"
          >{{ c.text }}</span>
        </div>
        <!-- VERBUNDENES WÄHLEN (B2): was zusammenhängt, wird zur Mehrfachauswahl —
             nur die Wege, die es an diesem Bauteil gibt. -->
        <div v-if="verbundWege.length" class="hud-verbund">
          <span class="hud-verbund-titel">Wählen:</span>
          <button
            v-for="w in verbundWege"
            :key="w.id"
            class="hud-verbund-btn"
            :title="w.hinweis"
            @click="emit('waehle-verbund', { arten: w.arten, tiefe: w.tiefe, titel: w.titel })"
          >{{ w.titel }}</button>
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
              @click="starte(b.id)"
            >
              <CdeIcon :name="b.icon" :size="12" />
              <span>{{ b.titel }}</span>
            </button>
          </div>
          <p v-else class="hud-bearb-hinweis">
            <CdeIcon name="edit" :size="12" /> {{ bearbeitung.scharf.titel }} läuft — Eingabe unten in der Leiste.
          </p>
        </div>
      </template>
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
import { useScreenProjection } from '../composables/useScreenProjection.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { fasseZusammen } from '../services/Beziehungen.js';

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
  /** { x, y, text, fang:{art,name}|null } in Canvas-Pixeln — oder null (Teil XVI) */
  zeigerMarke:  { type: Object, default: null },
});

const emit = defineEmits([
  'delete-measurement', 'zoom', 'hide', 'isolate', 'properties', 'new-issue', 'waehle-verbund',
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
/** Die Beziehungen des Subjekts als Chips — der Index hängt am eingeordneten Bauteil. */
const beziehungsChips = computed(() => {
  const b = bearbeitung.bauteil;
  const gid = b?.globalId ?? null;
  if (!gid || !Array.isArray(b?.beziehungen) || !b.beziehungen.length) return [];
  return fasseZusammen(b.beziehungen, gid);
});
const beziehungsText = computed(() => beziehungsChips.value.map(c => c.text).join(' · '));
/**
 * Welche „Verbundenes wählen"-Wege es an DIESEM Bauteil gibt — aus den Arten
 * seiner Beziehungen. Ein Knopf, der nichts fände, wäre ein toter Knopf.
 */
const verbundWege = computed(() => {
  const rel = bearbeitung.bauteil?.beziehungen ?? [];
  const hat = (art) => rel.some(r => r.art === art);
  const wege = [];
  if (hat('anschluss')) {
    wege.push({ id: 'nachbarn', titel: 'Nachbarn', arten: ['anschluss'], tiefe: 1, hinweis: 'Die direkt angeschlossenen Bauteile dazu wählen' });
    wege.push({ id: 'verbund', titel: 'Verbund', arten: ['anschluss'], tiefe: Infinity, hinweis: 'Alles, was über Anschlüsse zusammenhängt (Strang, Netz)' });
  }
  if (hat('enthalten')) wege.push({ id: 'enthalten', titel: 'Im selben Körper', arten: ['enthalten'], tiefe: Infinity, hinweis: 'Alles im selben Graben / in derselben Baugrube' });
  if (hat('gruppe')) wege.push({ id: 'gruppe', titel: 'Gruppe', arten: ['gruppe'], tiefe: Infinity, hinweis: 'Alle Bauteile derselben Gruppe (Kanalart, System)' });
  if (hat('ableitung')) wege.push({ id: 'ableitung', titel: 'Ableitung', arten: ['ableitung'], tiefe: 1, hinweis: 'Quellen und abgeleitete Teile dazu wählen' });
  return wege;
});
/**
 * Auf- oder zugeklappt. ZU ist die Vorgabe: die Pille nennt nur Typ und
 * Namen, das Bauteil darunter bleibt sichtbar. Wer ein Werkzeug scharf
 * schaltet, bekommt die Pille wieder zu — das Formular steht in der Leiste,
 * die Werkzeugliste braucht dann niemand mehr.
 */
const aufgeklappt = ref(false);
watch(() => bearbeitung.scharfId, (id) => { if (id) aufgeklappt.value = false; });
watch(() => props.element?.globalId ?? props.element?.localId ?? null, () => { aufgeklappt.value = false; });
function starte(id) {
  bearbeitung.starte(id);
  aufgeklappt.value = false;
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

/* ── Die Pille am Zeiger (Teil XVI) ── */
.hud-zeiger {
  position: absolute;
  transform: translate(14px, 14px);
  display: flex; flex-direction: column; gap: 0.05rem;
  padding: 0.15rem 0.4rem;
  background: var(--cde-surface-raised);
  border: 1px solid var(--cde-accent-line);
  border-radius: var(--cde-radius-sm);
  color: var(--cde-text);
  font-size: var(--cde-font-xs);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  box-shadow: var(--cde-shadow-sm);
  pointer-events: none;
}
.hud-zeiger--fang { border-color: var(--cde-warn); }
.hud-zeiger-fang { color: var(--cde-warn-soft); font-weight: 600; }
.hud-zeiger-text { color: var(--cde-text-dim); }

/* ── Kontextmenü an der Auswahl — zu eine Pille, offen ein Menü ── */
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
.hud-menu--zu { padding: 0; border-radius: 999px; }
.hud-menu--zu .hud-menu-name { max-width: 150px; }
.hud-menu--scharf { border-color: var(--cde-accent); }
.hud-pille {
  display: flex; align-items: center; gap: 0.35rem;
  padding: 0.25rem 0.6rem 0.25rem 0.55rem;
  background: transparent; border: 0; border-radius: 999px;
  color: var(--cde-text); cursor: pointer;
  font-size: var(--cde-font-xs); white-space: nowrap; max-width: 100%;
  touch-action: manipulation;
}
.hud-pille:hover { background: var(--cde-accent-fill-hi); }
.hud-pille-pfeil { color: var(--cde-text-dim); flex-shrink: 0; }
.hud-pille-werkzeug { display: inline-flex; color: var(--cde-accent); flex-shrink: 0; }
.hud-bearb-hinweis {
  margin: 0; font-size: var(--cde-font-xs); color: var(--cde-text-dim);
  display: flex; align-items: center; gap: 0.3rem;
}
/* Verbundenes wählen (B2) */
.hud-verbund { display: flex; flex-wrap: wrap; align-items: center; gap: 0.25rem; }
.hud-verbund-titel { font-size: var(--cde-font-xs); color: var(--cde-text-dim); }
.hud-verbund-btn {
  font-size: var(--cde-font-xs); line-height: 1.3; padding: 0.1rem 0.5rem;
  border: 1px solid var(--cde-accent-line); border-radius: 999px;
  background: transparent; color: var(--cde-text); cursor: pointer; touch-action: manipulation;
}
.hud-verbund-btn:hover { background: var(--cde-accent-fill-hi); }
/* Beziehungs-Chips (Teil XVII) */
.hud-beziehungen { display: flex; flex-wrap: wrap; gap: 0.25rem; max-width: 100%; }
.hud-beziehung {
  font-size: var(--cde-font-xs); line-height: 1.3;
  padding: 0.1rem 0.45rem; border-radius: 999px;
  background: var(--cde-accent-fill); color: var(--cde-text);
  white-space: nowrap; max-width: 100%; overflow: hidden; text-overflow: ellipsis;
}
.hud-beziehung--warnung { background: color-mix(in srgb, var(--cde-warn) 22%, transparent); color: var(--cde-warn); }
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
  .hud-pille { min-height: 40px; padding: 0.4rem 0.8rem 0.4rem 0.7rem; }
  .hud-menu-btn { width: 38px; height: 36px; }
  .hud-bearb-btn { padding: 0.5rem 0.45rem; }
  .hud-pill-x { position: relative; }
  .hud-pill-x::after { content: ''; position: absolute; inset: -10px; }
}
</style>
