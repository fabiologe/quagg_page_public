<template>
  <div class="shovel-tool-ui" @mouseenter="onEnter" @mouseleave="onLeave">

    <!-- ── PANEL (slides up above trigger) ──────────────────────────────── -->
    <Transition name="panel-slide">
      <div v-if="panelVisible" class="tool-panel">

        <!-- REVIEW MODE -->
        <div v-if="tool.state === 'REVIEW'" class="review-panel">
            <div class="status-msg">
                Änderung anwenden?
                <strong>{{ tool.pendingChanges?.length ?? 0 }} Zellen</strong>
                <span v-if="tool.settings.mode === 'ANCHOR'" class="mode-tag anchor-tag">⚓ Ankerpunkte</span>
            </div>
            <div class="btn-group">
                <button class="btn-confirm" @click="tool.commit()">✔ Anwenden</button>
                <button class="btn-cancel"  @click="tool.cancel()">✖ Abbrechen</button>
            </div>
        </div>

        <!-- AIMING MODE -->
        <div v-else class="aiming-panel">

            <label class="control-label">Modus</label>
            <div class="toggle-group mode-group">
                <button :class="{ active: tool.settings.mode === 'RAISE' }"
                        @click="tool.settings.mode = 'RAISE'">▲ Anheben</button>
                <button :class="{ active: tool.settings.mode === 'LOWER' }"
                        @click="tool.settings.mode = 'LOWER'">▼ Absenken</button>
                <button :class="{ active: tool.settings.mode === 'ANCHOR', anchor: true }"
                        @click="tool.settings.mode = 'ANCHOR'"
                        title="Zellen auf Vermessungspunkte snappen">
                    ⚓ Ankern
                </button>
            </div>

            <!-- Anchor info box -->
            <div v-if="tool.settings.mode === 'ANCHOR'" class="anchor-box">
                <div v-if="tool.surveyPointCount > 0" class="anchor-ok">
                    {{ tool.surveyPointCount }} Vermessungspunkte geladen
                </div>
                <div v-else class="anchor-warn">
                    <SvEmoji emoji="⚠" :size="13" /> Keine Vermessungspunkte — Bathymetrie-Modal öffnen
                </div>
            </div>

            <!-- Anchor method controls -->
            <template v-if="tool.settings.mode === 'ANCHOR'">
                <label class="control-label">Interpolation</label>
                <div class="toggle-group">
                    <button :class="{ active: tool.settings.anchorMethod === 'IDW' }"
                            @click="tool.settings.anchorMethod = 'IDW'"
                            title="Gewichteter Durchschnitt — Standard für Flussbett/Sohle">IDW</button>
                    <button :class="{ active: tool.settings.anchorMethod === 'NN' }"
                            @click="tool.settings.anchorMethod = 'NN'"
                            title="Nächster Punkt — hart, für Deiche und Kanten">Hart</button>
                    <button :class="{ active: tool.settings.anchorMethod === 'GRAD' }"
                            @click="tool.settings.anchorMethod = 'GRAD'"
                            title="Gradient-Korrektur — Neigung beibehalten, nur Offset korrigieren">Grad</button>
                </div>

                <div class="method-desc">{{ anchorMethodDesc }}</div>

                <div v-if="tool.settings.anchorMethod !== 'NN'" class="control-row">
                    <label>Schärfe p = {{ tool.settings.idwPower }}</label>
                    <input type="range" v-model.number="tool.settings.idwPower" min="1" max="5" step="0.5">
                </div>

                <div class="fade-row">
                    <label class="fade-label">
                        <input type="checkbox" v-model="tool.settings.anchorEdgeFade"> Kantenfade
                    </label>
                    <span v-if="tool.settings.anchorEdgeFade" class="fade-val">{{ tool.settings.anchorFadeWidth }} Zell.</span>
                </div>
                <div v-if="tool.settings.anchorEdgeFade" class="control-row" style="margin-top: 4px;">
                    <input type="range" v-model.number="tool.settings.anchorFadeWidth" min="1" max="8" step="1">
                </div>
            </template>

            <!-- Pinselform -->
            <label class="control-label">Pinselform</label>
            <div class="toggle-group start">
                <button :class="{ active: tool.settings.brushShape === 'CIRCLE' }"
                        @click="tool.settings.brushShape = 'CIRCLE'" title="Kreis">
                    <svg class="shape-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="8"/>
                    </svg>
                </button>
                <button :class="{ active: tool.settings.brushShape === 'SQUARE' }"
                        @click="tool.settings.brushShape = 'SQUARE'" title="Rechteck">
                    <svg class="shape-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="4" y="4" width="16" height="16" rx="1"/>
                    </svg>
                </button>
                <button :class="{ active: tool.settings.brushShape === 'POLYGON' }"
                        @click="tool.settings.brushShape = 'POLYGON'" title="Freiform-Polygon">
                    <svg class="shape-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round">
                        <path d="M12 3 20 7.5 20 16.5 12 21 4 16.5 4 7.5Z"/>
                    </svg>
                </button>
            </div>

            <!-- Circle params -->
            <div v-if="tool.settings.brushShape === 'CIRCLE'" class="control-row">
                <label>Radius: {{ tool.settings.radius }}m</label>
                <input type="range" v-model.number="tool.settings.radius" min="1" max="100" step="1">
            </div>

            <!-- Rectangle params -->
            <div v-if="tool.settings.brushShape === 'SQUARE'">
                <div class="control-row">
                    <label>Breite: {{ tool.settings.width }}m</label>
                    <input type="range" v-model.number="tool.settings.width" min="1" max="200" step="1">
                </div>
                <div class="control-row">
                    <label>Länge: {{ tool.settings.height }}m</label>
                    <input type="range" v-model.number="tool.settings.height" min="1" max="200" step="1">
                </div>
            </div>

            <!-- Polygon drawing controls -->
            <div v-if="tool.settings.brushShape === 'POLYGON'" class="poly-panel">
                <div v-if="!tool.isDrawingPolygon" class="poly-idle">
                    Klicke Punkte in der Karte, um die Auswahl zu zeichnen.
                </div>
                <template v-else>
                    <div class="poly-counter">
                        {{ tool.polygonPoints.length }}
                        Punkt{{ tool.polygonPoints.length === 1 ? '' : 'e' }} gesetzt
                    </div>
                    <div class="btn-group poly-actions">
                        <button class="btn-close-poly"
                                :disabled="tool.polygonPoints.length < 3"
                                @click="tool.closePolygon()">
                            ⬡ Schließen
                        </button>
                        <button class="btn-undo-poly" @click="tool.undoPolygonPoint()"
                                title="Letzten Punkt löschen">⟵</button>
                    </div>
                    <div class="poly-keys">Enter · Schließen &nbsp;|&nbsp; Backspace · Undo &nbsp;|&nbsp; Esc · Abbrechen</div>
                </template>
            </div>

            <!-- Area display (non-polygon) -->
            <div v-if="tool.settings.brushShape !== 'POLYGON'" class="area-row">
                Fläche: <strong>{{ formattedArea }} m²</strong>
            </div>

            <!-- Intensity (hidden in ANCHOR mode) -->
            <div v-if="tool.settings.mode !== 'ANCHOR'" class="control-row">
                <label>Intensität: {{ tool.settings.intensity }}m</label>
                <input type="range" v-model.number="tool.settings.intensity" min="0.1" max="5.0" step="0.1">
            </div>

            <div class="hint">
                <template v-if="tool.settings.brushShape === 'POLYGON' && tool.isDrawingPolygon">
                    Enter zum Schließen des Polygons
                </template>
                <template v-else-if="tool.settings.brushShape === 'POLYGON'">
                    Klicke in die Karte um Punkte zu setzen
                </template>
                <template v-else>
                    Klicke auf die Karte für Vorschau
                </template>
            </div>
        </div>

      </div>
    </Transition>

    <!-- ── TRIGGER PILL (always visible) ────────────────────────────────── -->
    <div class="tool-trigger" :class="{
        'trigger-open':   panelVisible,
        'trigger-review': tool.state === 'REVIEW',
        'trigger-anchor': tool.settings.mode === 'ANCHOR' && tool.state !== 'REVIEW',
    }">
      <svg class="trigger-icon" width="13" height="13" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="m8 3 4 8 5-5 5 15H2L8 3z"/>
      </svg>
      <span class="trigger-label">{{ triggerLabel }}</span>
      <span v-if="!panelVisible" class="trigger-dots">···</span>
    </div>

  </div>
</template>

<script setup>
import SvEmoji from '../common/SvEmoji.vue';
import { computed, ref } from 'vue';

const props = defineProps({
    tool: { type: Object, required: true },
});

// ── Hover logic ───────────────────────────────────────────────────────────────
const hovered = ref(false);
let closeTimer = null;

const onEnter = () => {
    clearTimeout(closeTimer);
    hovered.value = true;
};
const onLeave = () => {
    closeTimer = setTimeout(() => { hovered.value = false; }, 180);
};

// Panel auto-opens during REVIEW and active polygon drawing
const panelVisible = computed(() =>
    hovered.value ||
    props.tool.state === 'REVIEW' ||
    props.tool.isDrawingPolygon
);

// ── Trigger label ─────────────────────────────────────────────────────────────
const triggerLabel = computed(() => {
    if (props.tool.state === 'REVIEW')
        return `${props.tool.pendingChanges?.length ?? 0} Zellen`;
    if (props.tool.isDrawingPolygon)
        return `⬡ ${props.tool.polygonPoints.length} Punkte`;
    const m = props.tool.settings.mode;
    if (m === 'RAISE')  return '▲ Anheben';
    if (m === 'LOWER')  return '▼ Absenken';
    if (m === 'ANCHOR') return '⚓ Ankern';
    return 'Terrain';
});

// ── Anchor method description ─────────────────────────────────────────────────
const anchorMethodDesc = computed(() => {
    const m = props.tool.settings.anchorMethod;
    if (m === 'IDW')  return 'Gewichteter Durchschnitt — weich, geht durch alle Messpunkte';
    if (m === 'NN')   return 'Nächster Punkt — hart, erzeugt Stufen an Voronoi-Grenzen';
    return 'Offset-Interpolation — Neigung bleibt erhalten, Höhe wird korrigiert';
});

const formattedArea = computed(() => {
    const s = props.tool.settings;
    if (s.brushShape === 'CIRCLE') return (Math.PI * s.radius * s.radius).toFixed(2);
    if (s.brushShape === 'SQUARE') return (s.width * s.height).toFixed(2);
    return '—';
});
</script>

<style scoped>
/* ── Shell ────────────────────────────────────────────────────────────────── */
.shovel-tool-ui {
    position: absolute;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    pointer-events: auto;
    z-index: 100;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
}

/* ── Trigger pill ─────────────────────────────────────────────────────────── */
.tool-trigger {
    display: flex;
    align-items: center;
    gap: 6px;
    background: var(--sv-surface);
    font-family: var(--sv-font);
    letter-spacing: 0.04em;
    backdrop-filter: blur(10px);
    border: 1px solid var(--sv-border);
    border-radius: 20px;
    padding: 5px 12px 5px 10px;
    color: var(--sv-text-dim);
    font-size: 0.78rem;
    cursor: default;
    user-select: none;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    transition: background 0.18s, border-color 0.18s, color 0.18s;
    white-space: nowrap;
}
.tool-trigger.trigger-open {
    border-color: var(--sv-violet);
    color: var(--sv-text-violet);
    box-shadow: var(--sv-glow-violet);
}
.tool-trigger.trigger-review {
    background: rgba(163, 230, 53, 0.14);
    border-color: var(--sv-lime);
    color: var(--sv-text-lime);
}
.tool-trigger.trigger-anchor {
    border-color: rgba(249, 115, 22, 0.5);
    color: #f97316;
}
.trigger-icon { opacity: 0.7; flex-shrink: 0; }
.trigger-label { font-weight: 500; letter-spacing: 0.02em; }
.trigger-dots { opacity: 0.35; font-size: 0.7rem; letter-spacing: 2px; }

/* ── Panel ────────────────────────────────────────────────────────────────── */
.tool-panel {
    background: var(--sv-surface);
    color: var(--sv-text);
    font-family: var(--sv-font);
    padding: 14px 16px;
    border-radius: 8px;
    font-size: 0.88rem;
    backdrop-filter: blur(10px);
    width: 300px;
    box-shadow: var(--sv-glow-violet);
    border: 1px solid var(--sv-border);
}

/* ── Panel slide transition ───────────────────────────────────────────────── */
.panel-slide-enter-active,
.panel-slide-leave-active {
    transition: opacity 0.16s ease, transform 0.16s ease;
}
.panel-slide-enter-from,
.panel-slide-leave-to {
    opacity: 0;
    transform: translateY(8px);
}

/* ── Controls ─────────────────────────────────────────────────────────────── */
.control-label {
    display: block;
    font-size: 0.74rem;
    color: #7f8c8d;
    margin-bottom: 4px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
}
.control-row { margin-bottom: 10px; }
.control-row label { display: block; font-size: 0.8rem; margin-bottom: 3px; color: #bdc3c7; }
.control-row input[type=range] { width: 100%; cursor: pointer; accent-color: var(--sv-violet); }

.area-row {
    font-size: 0.78rem;
    color: #7f8c8d;
    margin-bottom: 10px;
    text-align: center;
}
.area-row strong { color: #ecf0f1; }

/* ── Toggle groups ────────────────────────────────────────────────────────── */
.toggle-group {
    display: flex;
    gap: 5px;
    margin-bottom: 12px;
}
.toggle-group button {
    flex: 1;
    border: 1px solid var(--sv-border);
    background: var(--sv-bg);
    color: #bdc3c7;
    font-family: var(--sv-font);
    padding: 5px 4px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.81rem;
    transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.toggle-group button:hover  { background: var(--sv-violet-dim); border-color: var(--sv-violet); color: #fff; }
.toggle-group button.active { background: var(--sv-violet); border-color: var(--sv-lime); color: #fff; font-weight: 600; }
.toggle-group button.anchor.active { background: #c0520a; border-color: #f97316; color: #fff; }
.toggle-group button.anchor { color: #f97316; }
.toggle-group.start button  { flex: unset; width: 44px; display: inline-flex; align-items: center; justify-content: center; padding: 6px 4px; }
.shape-icon { width: 18px; height: 18px; display: block; }

/* ── Anchor ───────────────────────────────────────────────────────────────── */
.anchor-box {
    background: rgba(249,115,22,0.1);
    border: 1px solid rgba(249,115,22,0.35);
    border-radius: 5px;
    padding: 8px 10px;
    margin-bottom: 12px;
    font-size: 0.78rem;
}
.anchor-ok   { color: #fdba74; font-weight: 600; }
.anchor-warn { color: #f97316; font-weight: 600; }

.method-desc {
    font-size: 0.72rem;
    color: #64748b;
    line-height: 1.4;
    margin-bottom: 10px;
    font-style: italic;
}
.fade-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 4px;
    font-size: 0.8rem;
    color: #bdc3c7;
}
.fade-label { display: flex; align-items: center; gap: 5px; cursor: pointer; }
.fade-label input[type=checkbox] { accent-color: var(--sv-violet); cursor: pointer; }
.fade-val { font-size: 0.75rem; color: #94a3b8; }

/* ── Polygon panel ────────────────────────────────────────────────────────── */
.poly-panel {
    background: rgba(251,191,36,0.08);
    border: 1px solid rgba(251,191,36,0.3);
    border-radius: 5px;
    padding: 9px 10px;
    margin-bottom: 10px;
}
.poly-idle { font-size: 0.78rem; color: #94a3b8; text-align: center; }
.poly-counter { font-size: 0.82rem; color: #fbbf24; font-weight: 600; margin-bottom: 8px; }
.poly-actions { margin-bottom: 6px; }
.poly-keys { font-size: 0.68rem; color: #64748b; text-align: center; line-height: 1.4; }

.btn-close-poly {
    flex: 1;
    background: #92400e; color: #fde68a; border: none;
    padding: 6px; border-radius: 4px; cursor: pointer;
    font-weight: 600; font-size: 0.82rem; transition: background 0.15s;
}
.btn-close-poly:hover:not(:disabled) { background: #b45309; }
.btn-close-poly:disabled { opacity: 0.4; cursor: not-allowed; }

.btn-undo-poly {
    flex: 0 0 auto; width: 38px;
    background: #374151; color: #d1d5db; border: none;
    border-radius: 4px; cursor: pointer; font-size: 1rem; transition: background 0.15s;
}
.btn-undo-poly:hover { background: #4b5563; }

/* ── Review panel ─────────────────────────────────────────────────────────── */
.status-msg {
    margin-bottom: 10px;
    text-align: center;
    font-size: 0.88rem;
    background: rgba(0,0,0,0.2);
    padding: 7px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
}
.mode-tag { font-size: 0.72rem; padding: 2px 6px; border-radius: 10px; font-weight: 600; }
.anchor-tag { background: rgba(249,115,22,0.25); color: #f97316; }

.btn-group { display: flex; gap: 8px; }
.btn-confirm {
    background: var(--sv-lime); color: #12121a; border: none;
    padding: 8px; border-radius: 4px; flex: 1; cursor: pointer; font-weight: bold;
    font-family: var(--sv-font);
}
.btn-confirm:hover { filter: brightness(1.08); box-shadow: var(--sv-glow-lime); }
.btn-cancel {
    background: #e74c3c; color: white; border: none;
    padding: 8px; border-radius: 4px; flex: 1; cursor: pointer; font-weight: bold;
    font-family: var(--sv-font);
}
.btn-cancel:hover { background: #c0392b; }

/* ── Hint ─────────────────────────────────────────────────────────────────── */
.hint {
    text-align: center;
    font-size: 0.75rem;
    color: #4b5563;
    margin-top: 8px;
    font-style: italic;
}
</style>
