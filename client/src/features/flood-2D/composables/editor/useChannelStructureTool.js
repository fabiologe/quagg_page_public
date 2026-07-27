import { ref } from 'vue';
import { useDrawTool } from './useDrawTool.js';
import { useToolStateMachine, TOOL_STATE } from './useToolStateMachine.js';
import { worldToCell } from '../../utils/weirGeometry.js';
import { useGeoStore } from '../../stores/useGeoStore.js';

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
    const showModal = ref(false);

    let sceneRef = null;
    let cachedContext = null;   // { parsedData, ... } vom letzten Klick
    let cachedPolyline = null;  // [{x,y,terrainZ}] Weltkoordinaten

    // ── Zeichnen ──────────────────────────────────────────────────────────────

    const onClick = (context) => {
        if (sm.state.value === TOOL_STATE.REVIEW) return { action: 'NONE' };
        sceneRef = context.scene;
        cachedContext = context;
        const res = drawTool.onClick(context);
        if (res?.action === 'ADDED_POINT') sm.setDrawing();
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

        sm.setReview();
        showModal.value = true;
        return { action: 'REVIEW' };
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
        sm.setIdle();
    };

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    const activate = (scene) => {
        sceneRef = scene;
        sm.setIdle();
        sm.attachShortcuts({
            onCancel: cancel,
            onConfirm: finishDrawing,
            onUndo: () => drawTool.removeLastPoint(sceneRef),
        });
    };

    const deactivate = () => {
        sm.detachShortcuts();
        reset();
    };

    return {
        state: sm.state,
        showModal,
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
