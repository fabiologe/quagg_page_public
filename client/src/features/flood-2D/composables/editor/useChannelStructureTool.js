import { ref } from 'vue';
import * as THREE from 'three';
import { useDrawTool } from './useDrawTool.js';
import { useToolStateMachine, TOOL_STATE } from './useToolStateMachine.js';
import { worldToCell } from '../../utils/weirGeometry.js';
import { useGeoStore } from '../../stores/useGeoStore.js';
import { useNetworkStore } from '../../stores/useNetworkStore.js';

/**
 * useChannelStructureTool.js — Channel/Gerinne-Werkzeug: Polylinie zeichnen,
 * bei Abschluss (Enter / "Linie abschließen") öffnet das Panel ein Popup
 * (ChannelSectionModal.vue) für den Querschnitt (aktuell nur Rechteck — Trapez-
 * Option im Popup deaktiviert, SGCchan_type 7 fehlt im Solver, s. SgcGenerator.
 * buildSgcChanPramsFile). Beim Bestätigen wird der Kanal als ECHTES LISFLOOD-
 * SGC-Sub-Grid-Gerinne in geoStore.sgcChannels abgelegt — KEINE Terrain-/DGM-
 * Mutation. Der Export (InputGenerator.js) rechnet daraus sgc.width/bed/bank/
 * group.asc + sgc.chanprams.txt.
 *
 * Tool-ID 'CHANNEL_STRUCTURE' — bewusst NICHT 'CHANNEL_LINE'/'CHANNEL_POLYGON',
 * die sind ein anderes Feature (Bathymetrie-Flusslauf-Einbrennen, useChannelLineTool.js).
 * geoStore.sgcChannels ist zusätzlich zur dortigen Einzelkanal-Mittellinie
 * (bathyStore.channelPolyline) — beide werden erst beim Export zusammengeführt
 * (SgcGenerator.mergeSgcChannels).
 */
export function useChannelStructureTool() {
    const drawTool = useDrawTool({ isPolygon: false });
    const sm = useToolStateMachine();
    const geoStore = useGeoStore();
    const net = useNetworkStore();
    const showModal = ref(false);
    // Live-Entwurf für die 3D-Gerinnekörper-Vorschau (useChannelGhostPreview):
    // Polylinie steht fest, sobald das Popup offen ist; section folgt den
    // Popup-Eingaben live (ChannelSectionModal @update → updateDraftSection).
    const draft = ref(null);   // { polyline, section } | null
    // Weiterzeichnen: erster Klick nahe eines Kanal-/Gerinne-Endpunkts rastet dort ein
    // und vererbt den Querschnitt (Popup-Vorbelegung). Hydraulisch verbinden sich die
    // SGC-Zellen von selbst — der Snap garantiert nur die LÜCKENLOSE Stempelung.
    const snapInfo = ref(null); // { label, section } | null

    let sceneRef = null;
    let cachedContext = null;   // { parsedData, ... } vom letzten Klick
    let cachedPolyline = null;  // [{x,y,terrainZ}] Weltkoordinaten

    // ── Weiterzeichnen: Snap-Ziele = Endpunkte gezeichneter Kanäle + offener
    //    Netz-Gerinne (ISYBAU, laufen ebenfalls als SGC ins Raster). ────────────

    // Profilhöhe defensiv mm→m (DN600 = 600) — wie useNetworkRenderer.linkRadius.
    const profHeightM = (v) => { const h = Number(v); if (!Number.isFinite(h) || h <= 0) return 0; return h > 10 ? h / 1000 : h; };
    // kSt (>1) → Manning n — gleiche Heuristik wie networkToSgc.js.
    const manningFrom = (raw) => { const k = Number(raw); if (!Number.isFinite(k) || k <= 0) return 0.03; return k > 1 ? 1 / k : k; };

    const collectSnapTargets = () => {
        const targets = [];
        // Alle Querschnittswerte HART zu Zahlen koerzieren: '2.5' > 0 ist wahr (String-
        // Koerzierung), und ein String in section.bedWidth crashte im Popup jedes
        // bedWidth.toFixed(...) — „$setup.bedWidth.toFixed is not a function".
        const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : NaN; };
        for (const c of geoStore.sgcChannels || []) {
            const pl = c.polyline || [];
            if (pl.length < 2) continue;
            const section = { shape: c.shape, bedWidth: num(c.bedWidth), depth: num(c.bedDepth),
                              sideSlope: num(c.sideSlope), manningN: num(c.manningN) };
            const label = `Kanal (b=${num(c.bedWidth).toFixed(1)} m, t=${num(c.bedDepth).toFixed(1)} m)`;
            targets.push({ x: pl[0].x, y: pl[0].y, label, section });
            targets.push({ x: pl[pl.length - 1].x, y: pl[pl.length - 1].y, label, section });
        }
        for (const l of net.links || []) {
            if (l.conveyance !== 'open') continue;
            const shape = l.profile?.shape === 'trapezoid' ? 'trapezoid' : 'rect';
            const bwRaw = Number(l.profile?.bedWidth ?? l.profile?.width);
            const h = profHeightM(l.profile?.height);
            const slRaw = Number(l.profile?.sideSlope);
            const section = {
                shape,
                bedWidth: Number.isFinite(bwRaw) && bwRaw > 0 ? bwRaw : 1.0,
                depth: h > 0 ? h : 1.0,
                sideSlope: shape === 'trapezoid'
                    ? (Number.isFinite(slRaw) && slRaw > 0 ? slRaw : 1.5) : 0,
                manningN: manningFrom(l.attrs?.kSt ?? l.attrs?.roughness),
            };
            const label = `Netz-Gerinne ${l.id}`;
            // Endpunkte: eigene Polylinie bevorzugt, sonst die Anschlussknoten.
            const pts = Array.isArray(l.points)
                ? l.points.filter(p => Number.isFinite(p?.x) && Number.isFinite(p?.y)) : [];
            if (pts.length >= 2) {
                targets.push({ x: pts[0].x, y: pts[0].y, label, section });
                targets.push({ x: pts[pts.length - 1].x, y: pts[pts.length - 1].y, label, section });
            } else {
                const from = net.nodeById.get(l.fromNodeId), to = net.nodeById.get(l.toNodeId);
                if (from) targets.push({ x: from.x, y: from.y, label, section });
                if (to) targets.push({ x: to.x, y: to.y, label, section });
            }
        }
        return targets;
    };

    // Nach dem ERSTEN gesetzten Punkt: nächstgelegenen Endpunkt im Radius suchen und den
    // Punkt exakt dorthin verschieben (removeLast/addPoint aktualisiert Marker + Linie).
    const trySnapFirstPoint = (context) => {
        snapInfo.value = null;
        const parsedData = context?.parsedData;
        const center = parsedData?.center;
        if (!center) return;
        const p = drawTool.getPoints()[0];
        const wx = p.x + center.x, wy = -p.z + center.y;
        const radius = Math.max(Number(parsedData.cellsize) || 1, 0.5) * 1.5;
        let best = null, bestD = Infinity;
        for (const t of collectSnapTargets()) {
            const d = Math.hypot(t.x - wx, t.y - wy);
            if (d < radius && d < bestD) { best = t; bestD = d; }
        }
        if (!best) return;
        drawTool.removeLastPoint(context.scene);
        drawTool.addPoint(new THREE.Vector3(best.x - center.x, p.y, -(best.y - center.y)), context.scene);
        snapInfo.value = { label: best.label, section: best.section };
    };

    // ── Zeichnen ──────────────────────────────────────────────────────────────

    const onClick = (context) => {
        if (sm.state.value === TOOL_STATE.REVIEW) return { action: 'NONE' };
        sceneRef = context.scene;
        cachedContext = context;
        const res = drawTool.onClick(context);
        if (res?.action === 'ADDED_POINT') {
            sm.setDrawing();
            if (drawTool.getPoints().length === 1) trySnapFirstPoint(context);
        }
        return res;
    };

    const onMove = (context) => {
        if (sm.state.value === TOOL_STATE.REVIEW) return;
        sceneRef = context.scene;
        return drawTool.onMove(context);
    };

    const onRightClick = () => {
        cancel();
        return { action: 'RESET' };
    };

    const onDoubleClick = () => ({ action: 'NONE' }); // Abschluss läuft über Enter/Panel-Button

    // Weltkoordinaten (real, wie geoStore/SgcGenerator sie erwarten) + Gelände-Z je
    // Vertex sampeln — Basis für die relative Sohltiefe (bedMode:'depth').
    const buildRealPolyline = (points, parsedData) => {
        const { cellsize, bounds, ncols, nrows, gridData, center } = parsedData;
        const header = {
            ncols, nrows, cellsize,
            xllcorner: center.x - bounds.width / 2,
            yllcorner: center.y - bounds.height / 2,
        };
        return points.map(p => {
            const realX = p.x + center.x;
            const realY = -p.z + center.y;
            const { col, row } = worldToCell(header, realX, realY);
            let terrainZ = 0;
            if (col >= 0 && col < ncols && row >= 0 && row < nrows) {
                const z = gridData[row * ncols + col];
                terrainZ = z > -9000 ? z : 0;
            }
            return { x: realX, y: realY, terrainZ };
        });
    };

    // Enter / "Linie abschließen": Linie fixieren, Popup öffnen. Schreibt NICHT
    // in den Store — das passiert erst in applyChannel() beim Bestätigen des Popups.
    const finishDrawing = () => {
        if (sm.state.value !== TOOL_STATE.DRAWING) return { action: 'NONE' };
        const points = drawTool.getPoints();
        if (points.length < 2) return { action: 'NONE' };
        const parsedData = cachedContext?.parsedData;
        if (!parsedData) return { action: 'NONE' };

        cachedPolyline = buildRealPolyline(points, parsedData);
        draft.value = { polyline: cachedPolyline, section: null };

        sm.setReview();
        showModal.value = true;
        return { action: 'REVIEW' };
    };

    /** Live-Querschnitt aus dem Popup in die 3D-Vorschau spiegeln. */
    const updateDraftSection = (section) => {
        if (draft.value) draft.value = { ...draft.value, section };
    };

    // ── Kanal anlegen (vom Popup aufgerufen) ────────────────────────────────────

    /** @param {{shape:'trapezoid'|'rect', bedWidth:number, depth:number, sideSlope?:number, manningN?:number}} section */
    const applyChannel = (section) => {
        if (!cachedPolyline) { reset(); return; }
        geoStore.addSgcChannel({
            id: crypto.randomUUID(),
            polyline: cachedPolyline,
            shape: section.shape,
            bedWidth: section.bedWidth,
            bedMode: 'depth',
            bedDepth: section.depth,
            bedZStart: null,
            bedZEnd: null,
            sideSlope: section.shape === 'trapezoid' ? (section.sideSlope || 0) : 0,
            manningN: section.manningN ?? 0.03,
        });
        reset();
    };

    const cancel = () => reset();

    const reset = () => {
        showModal.value = false;
        if (sceneRef) drawTool.reset(sceneRef);
        cachedPolyline = null;
        cachedContext = null;
        draft.value = null;
        snapInfo.value = null;
        sm.setIdle();
    };

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    const activate = (scene) => {
        sceneRef = scene;
        sm.setIdle();
        sm.attachShortcuts({
            onCancel: cancel,
            onConfirm: finishDrawing,
            onUndo: () => {
                drawTool.removeLastPoint(sceneRef);
                // Erster (gesnappter) Punkt entfernt → Anschluss-Vererbung aufheben.
                if (drawTool.getPoints().length === 0) snapInfo.value = null;
            },
        });
    };

    const deactivate = () => {
        sm.detachShortcuts();
        reset();
    };

    return {
        state: sm.state,
        showModal,
        draft,
        snapInfo,
        updateDraftSection,
        get pointCount() { return drawTool.getPoints().length; },
        activate,
        deactivate,
        onClick,
        onMove,
        onRightClick,
        onDoubleClick,
        finishDrawing,
        applyChannel,
        cancel,
    };
}
