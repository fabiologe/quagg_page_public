// Schacht-Werkzeug (NET_NODE) — Hover-Feedback + abgesichertes Drag-Verschieben (E2/UX).
// Das SETZEN neuer Schächte läuft weiter über das globale 'map-click'-Event → NetNodeTool.vue;
// dieses Singleton ergänzt den tools-Map-Eintrag um Cursor + Verschieben:
//
//   Hover:     Terrain-Ring zeigt den Klickpunkt (Lime, wenn Schacht ODER Haltung getroffen würde).
//   1. Klick:  Schacht/Haltung auswählen (Highlight) — verschiebt NICHTS (Drag nur für Schächte).
//   Drag:      nur ein bereits AUSGEWÄHLTER Schacht lässt sich ziehen, und erst ab
//              DRAG_THRESHOLD_PX Mausweg (gegen versehentliches Verschieben beim Klicken).
//              Während des Zugs bewegt sich nur das Mesh (Vorschau, kein Store-Write pro
//              Mousemove — sonst History-Spam + Voll-Re-Render); MapEditor3D friert die
//              Kamera via state.dragging ein (Muster bridge3DState, flush:'sync').
//   Drop:      EIN updateNode-Commit (eine History-Stufe): x/y = Drop-Punkt,
//              rim = Gelände am Drop (Terrain-Resample), invert = rim − bisherige Tiefe.
//              Haltungen folgen über den Store-Watch des Renderers automatisch.
//
// Singleton (Muster getNetworkConduitToolInstance): UI-Panel und tools-Map teilen die Instanz.

import { reactive } from 'vue';
import { useNetworkStore } from '@/features/flood-2D/stores/useNetworkStore.js';
import { useGeoStore } from '@/features/flood-2D/stores/useGeoStore.js';
import { createTerrainCursor } from './useTerrainCursor.js';

const DRAG_THRESHOLD_PX = 6;   // Mindest-Mausweg, bevor ein Drag als Drag gilt

let _instance = null;

export function getNetworkNodeToolInstance() {
    if (_instance) return _instance;

    const net = useNetworkStore();
    const geo = useGeoStore();
    const state = reactive({
        dragging: false,          // → MapEditor3D-Watcher (controls.enabled, flush:'sync')
        dragId: null,
        suppressNextClick: false, // nach Klick/Drag auf Schacht KEIN Platzierungs-Popup (map-click)
    });
    let renderer = null;          // useNetworkRenderer-Instanz
    let last = null;              // letzte Welt-Position während des Drags
    let startScreen = null;       // Maus-Position beim mousedown (Drag-Schwelle)
    let moved = false;            // Schwelle überschritten?
    const cursor = createTerrainCursor();  // Hover-Ring (violett; Lime über Schacht)

    /** Vom MapEditor3D nach dem Erzeugen des Netz-Renderers gesetzt. */
    function setRenderer(r) { renderer = r; }

    /** Netz-Objekt (Schacht ODER Haltung) unterm Cursor — {id, kind} oder null. */
    function pick(ctx) {
        if (!renderer || !ctx.raycaster || !ctx.camera) return null;
        ctx.raycaster.setFromCamera(ctx.pointer, ctx.camera);
        const hits = ctx.raycaster.intersectObjects(renderer.group.children, false);
        return renderer.pickFromIntersects(hits);
    }

    function pickNode(ctx) {
        const p = pick(ctx);
        return p && p.kind === 'node' ? p.id : null;
    }

    /** Terrain-Treffer unter dem Cursor → Weltkoordinaten (Übersetzung wie useInteractionManager). */
    function terrainWorld(ctx) {
        if (!ctx.terrainMesh || !ctx.raycaster) return null;
        const hits = ctx.raycaster.intersectObject(ctx.terrainMesh);
        if (!hits.length) return null;
        const grid = geo.terrain;
        if (!grid?.center) return null;
        const p = hits[0].point;
        return { x: p.x + grid.center.x, y: -p.z + grid.center.y, z: p.y + grid.minZ };
    }

    function onMouseDown(ctx) {
        const p = pick(ctx);
        if (!p) return;
        state.suppressNextClick = true;   // Klick auf Netz-Objekt = Auswahl/Drag, nie Neuplatzierung
        // Haltung: nur auswählen (Highlight im Renderer + Property-Panel) — kein Drag.
        if (p.kind !== 'node') { net.select(p.id); return; }
        const id = p.id;
        if (id !== net.selectedId) {
            net.select(id);               // 1. Klick: nur auswählen — noch kein Verschieben
            return;
        }
        // Bereits ausgewählter Schacht: Drag scharf schalten (Kamera friert sofort ein,
        // damit vor der Schwelle nicht halb orbitiert wird); Commit erst nach Schwelle.
        state.dragging = true;
        state.dragId = id;
        startScreen = { x: ctx.event?.clientX ?? 0, y: ctx.event?.clientY ?? 0 };
        moved = false;
        last = null;
    }

    function onMove(ctx) {
        const hover = pick(ctx);          // setzt den Raycaster (auch für den Cursor)
        cursor.update(ctx, { snap: !!hover });   // Lime auch über Haltungen (Auswahl-Voransicht)

        if (!state.dragging || !state.dragId) return;
        if (!moved) {
            const dx = (ctx.event?.clientX ?? 0) - (startScreen?.x ?? 0);
            const dy = (ctx.event?.clientY ?? 0) - (startScreen?.y ?? 0);
            if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;   // noch ein Klick, kein Drag
            moved = true;
        }
        const w = terrainWorld(ctx);
        if (!w) return;
        last = w;
        renderer?.previewNodePosition?.(state.dragId, w.x, w.y, w.z);
    }

    function onMouseUp() {
        if (!state.dragging) return;
        const id = state.dragId;
        const commit = moved && !!last;
        state.dragging = false;
        state.dragId = null;
        if (commit) {
            const n = net.nodes.find(x => x.id === id);
            if (n) {
                const depth = (Number(n.rim) || 0) - (Number(n.invert) || 0);
                // EIN Commit (eine History-Stufe): Deckel folgt dem Gelände, Tiefe bleibt.
                net.updateNode(id, { x: last.x, y: last.y, rim: last.z, invert: last.z - depth });
            }
        } else if (moved && renderer) {
            renderer.render?.();          // Vorschau ohne Commit → Mesh zurück an den Store-Stand
        }
        last = null;
        startScreen = null;
        moved = false;
    }

    function deactivate() { cursor.hide(); }
    function dispose() { cursor.dispose(); }

    _instance = { state, setRenderer, onMouseDown, onMove, onMouseUp, deactivate, dispose,
                  /** Verbraucht das Klick-Unterdrück-Flag (NetNodeTool.vue map-click-Handler). */
                  consumeSuppressedClick() {
                      const s = state.suppressNextClick;
                      state.suppressNextClick = false;
                      return s;
                  } };
    return _instance;
}
