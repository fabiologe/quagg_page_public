// Reaktiver Store für das importierte Entwässerungsnetz (Unified Geometry Engine).
// Hält das NetworkModel als flache, reaktive nodes/links-Arrays (für Renderer + UI) plus
// Import-Metadaten. Single Source of Truth für Kanalnetz-Anzeige/-Selektion.
//
// Bewusst getrennt vom geoStore: das Kanalnetz ist ein eigenes, in sich geschlossenes
// Modell (G0). Kopplungs-Export/Editor docken später hier an.

import { defineStore } from 'pinia';
import { ref, computed, markRaw } from 'vue';
import { NetworkModel } from '../services/geometry/NetworkModel.js';
import { makeNode, makeLink } from '../services/geometry/entities.js';
import { notifyPreMutate } from '../composables/historyBridge.js';

export const useNetworkStore = defineStore('flood2dNetwork', () => {
    const nodes = ref([]);       // [{ id, role, x, y, rim, invert, attrs }]
    const links = ref([]);       // [{ id, role, conveyance, fromNodeId, toNodeId, points, profile, attrs }]
    const model = ref(null);     // markRaw(NetworkModel) — nicht reaktiv tief machen
    const format = ref(null);    // 'isybau-xml' | 'ifc' | …
    const warnings = ref([]);
    const selectedId = ref(null);
    // Vorfüllfaktor [%]: Netz-Auslastung vor dem Regen (0 = leer). Wird beim Kopplungs-
    // Export unter der Haube in SWMM-Basisabfluss + Teilfüllung übersetzt (prefill.js) —
    // der Nutzer pflegt KEINE Tagesganglinien. Getrennt vom Initialzustand einzelner Becken.
    const prefillPercent = ref(0);
    /**
     * Zählt JEDE strukturelle Änderung an nodes/links. Renderer/Verbraucher hängen sich
     * daran statt an einen deep-Watcher über die Arrays: Vues Deep-Traversal kostete bei
     * einem 3000-Schacht-Netz ~247 ms PRO Änderung, allein fürs Neuaufbauen der
     * Abhängigkeiten (gemessen mit leerem Callback, Performance-Audit 2026-07-27).
     * Wer nodes/links am Store vorbei setzt (z. B. Undo-Restore), muss touch() rufen.
     */
    const revision = ref(0);
    /** Änderung an nodes/links melden — NACH der Mutation aufrufen. */
    function touch() { revision.value++; }

    const hasNetwork = computed(() => nodes.value.length > 0 || links.value.length > 0);
    const nodeById = computed(() => new Map(nodes.value.map(n => [n.id, n])));

    /** Übernimmt ein NetworkModel (aus importDrainageNetwork) in den Store. */
    function setModel(m, { format: fmt = null, warnings: warn = [] } = {}) {
        model.value = m ? markRaw(m) : null;
        format.value = fmt;
        warnings.value = Array.isArray(warn) ? warn : [];
        selectedId.value = null;
        if (!m) { nodes.value = []; links.value = []; touch(); return; }
        nodes.value = m.nodeList.map(n => ({
            id: n.id, role: n.role,
            x: n.geom.x, y: n.geom.y, rim: n.geom.rim, invert: n.geom.invert,
            attrs: n.attrs,
        }));
        links.value = m.linkList.map(l => ({
            id: l.id, role: l.role, conveyance: l.conveyance,
            fromNodeId: l.refs.fromNodeId, toNodeId: l.refs.toNodeId,
            points: l.geom.points, profile: l.geom.profile, attrs: l.attrs,
            // Vermessene Haltungslänge (ISYBAU) — ging vorher im Roundtrip Model→Array→Model
            // verloren, der SWMM-Export fiel dann still auf die Luftlinie zurück.
            length: l.geom.length ?? null,
        }));
        touch();
    }

    function clear() { setModel(null); prefillPercent.value = 0; }
    function select(id) { selectedId.value = id; }

    /** Direkt aus serialisierten Arrays befüllen (Ergebnis-Viewer-Fenster / Projekt-Load). */
    function setArrays(ns, ls) {
        nodes.value = Array.isArray(ns) ? ns : [];
        links.value = Array.isArray(ls) ? ls : [];
        selectedId.value = null;
        touch();
    }

    // ── CRUD (G3): die reaktiven Arrays sind die editierbare Wahrheit; toModel() baut bei
    //    Bedarf ein NetworkModel (für Kopplungs-Export/Validierung). ─────────────────────
    function applyNodePatch(id, patch) {
        const n = nodes.value.find(x => x.id === id);
        if (!n) return;
        const { attrs, ...rest } = patch;
        Object.assign(n, rest);
        if (attrs) n.attrs = { ...n.attrs, ...attrs };
    }
    function updateNode(id, patch = {}) {
        if (!nodes.value.some(x => x.id === id)) return;
        notifyPreMutate(`Schacht ${id} ändern`, 'net');
        applyNodePatch(id, patch);
        touch();
    }
    /** Mehrere Knoten in EINEM Undo-Schritt patchen (z. B. Raster-Abgleich „alle Deckel") —
     *  updateNode pro Element würde die History fluten (MAX_SNAPSHOTS-Eviction). */
    function updateNodesBatch(patches, label = 'Schächte ändern') {
        if (!Array.isArray(patches) || patches.length === 0) return;
        notifyPreMutate(label, 'net');
        for (const { id, ...patch } of patches) applyNodePatch(id, patch);
        touch();
    }
    function updateLink(id, patch = {}) {
        const l = links.value.find(x => x.id === id);
        if (!l) return;
        notifyPreMutate(`Haltung ${id} ändern`, 'net');
        const { attrs, profile, ...rest } = patch;
        Object.assign(l, rest);
        if (attrs) l.attrs = { ...l.attrs, ...attrs };
        if (profile) l.profile = { ...l.profile, ...profile };
        touch();
    }
    function deleteNode(id) {
        notifyPreMutate(`Schacht ${id} löschen`, 'net');
        nodes.value = nodes.value.filter(n => n.id !== id);
        links.value = links.value.filter(l => l.fromNodeId !== id && l.toNodeId !== id);
        if (selectedId.value === id) selectedId.value = null;
        touch();
    }
    function deleteLink(id) {
        notifyPreMutate(`Haltung ${id} löschen`, 'net');
        links.value = links.value.filter(l => l.id !== id);
        if (selectedId.value === id) selectedId.value = null;
        touch();
    }
    function addNode(spec = {}) {
        notifyPreMutate('Schacht setzen', 'net');
        const id = spec.id ?? `MH_${Date.now()}`;
        nodes.value.push({
            id, role: spec.role ?? 'manhole',
            x: Number(spec.x) || 0, y: Number(spec.y) || 0,
            rim: Number(spec.rim) || 0, invert: Number(spec.invert) || 0,
            attrs: spec.attrs ?? {},
        });
        // Auto-Reset des Werkzeugs (Muster geoStore.notifyObjectPlaced). Nur im Browser;
        // Node-Tests (kein window) bleiben unberührt.
        touch();
        if (typeof window !== 'undefined')
            window.dispatchEvent(new CustomEvent('flood2d-object-placed', { detail: { type: 'NET_NODE' } }));
        return id;
    }
    function addLink(spec = {}) {
        notifyPreMutate('Haltung ziehen', 'net');
        const id = spec.id ?? `H_${Date.now()}`;
        links.value.push({
            id, role: spec.role ?? 'conduit', conveyance: spec.conveyance ?? 'covered',
            fromNodeId: spec.fromNodeId ?? null, toNodeId: spec.toNodeId ?? null,
            points: spec.points ?? null,
            profile: spec.profile ?? { shape: 'circular', height: 0.3, width: 0 },
            attrs: spec.attrs ?? {},
            length: spec.length ?? null,
        });
        touch();
        return id;
    }

    /**
     * Registriert das Netz auf das Raster: verschiebt (dx,dy) + skaliert (scale um pivot) ALLE
     * Knoten- und Haltungs-Koordinaten. Für „nackte Zahlen" (CAD/ISYBAU vs. Raster-Werte) ohne
     * echtes CRS — reines Offset/Scale-Matching. Höhen (z/rim/invert) bleiben unberührt.
     */
    function transformCoords({ dx = 0, dy = 0, scale = 1, pivotX = 0, pivotY = 0 } = {}) {
        notifyPreMutate('Netz auf Raster registrieren', 'net');
        const tx = (x) => (x - pivotX) * scale + pivotX + dx;
        const ty = (y) => (y - pivotY) * scale + pivotY + dy;
        nodes.value = nodes.value.map(n => ({ ...n, x: tx(n.x), y: ty(n.y) }));
        links.value = links.value.map(l => ({
            ...l,
            points: Array.isArray(l.points) ? l.points.map(p => ({ x: tx(p.x), y: ty(p.y), z: p.z })) : l.points,
            // Vermessene Länge skaliert mit — sonst passt sie nach „Auto: einpassen" nicht
            // mehr zur Geometrie und der SWMM-Export rechnet mit falschem Gefälle.
            length: Number.isFinite(l.length) ? l.length * scale : l.length,
        }));
        touch();
    }

    /**
     * Netz auf einen Geltungsbereich zuschneiden (Raster-Crop/-Maske): löscht alle
     * Schächte, für die insideFn(x, y) false liefert, plus alle Haltungen, die an einem
     * gelöschten Knoten hängen — in EINEM Undo-Schritt. Liefert die Anzahl gelöschter
     * Schächte (0 = nichts zu tun, dann auch kein History-Eintrag).
     * @param {(x:number, y:number) => boolean} insideFn  Weltkoordinaten-Test
     */
    function cropOutside(insideFn, label = 'Netz zugeschnitten') {
        const doomed = new Set();
        for (const n of nodes.value) if (!insideFn(n.x, n.y)) doomed.add(n.id);
        if (doomed.size === 0) return 0;
        notifyPreMutate(`${label} (${doomed.size} Schächte außerhalb)`, 'net');
        nodes.value = nodes.value.filter(n => !doomed.has(n.id));
        links.value = links.value.filter(l => !doomed.has(l.fromNodeId) && !doomed.has(l.toNodeId));
        if (selectedId.value && doomed.has(selectedId.value)) selectedId.value = null;
        touch();
        return doomed.size;
    }

    /** Übernimmt die Elemente eines NetworkModels additiv (Duplikate per ID übersprungen).
     *  Für die Migration von Legacy-Daten (geoStore.nodes/culvertLinks) ins Netz. */
    function mergeModel(m) {
        if (!m) return;
        const eN = new Set(nodes.value.map(n => n.id));
        for (const n of m.nodeList) if (!eN.has(n.id)) {
            nodes.value.push({ id: n.id, role: n.role, x: n.geom.x, y: n.geom.y, rim: n.geom.rim, invert: n.geom.invert, attrs: n.attrs });
        }
        const eL = new Set(links.value.map(l => l.id));
        for (const l of m.linkList) if (!eL.has(l.id)) {
            links.value.push({ id: l.id, role: l.role, conveyance: l.conveyance, fromNodeId: l.refs.fromNodeId, toNodeId: l.refs.toNodeId, points: l.geom.points, profile: l.geom.profile, attrs: l.attrs, length: l.geom.length ?? null });
        }
        touch();
    }

    /** Baut aus den aktuellen (editierten) Arrays ein NetworkModel für Export/Validierung. */
    function toModel() {
        const m = new NetworkModel();
        for (const n of nodes.value)
            m.addNode(makeNode({ id: n.id, x: n.x, y: n.y, rim: n.rim, invert: n.invert, role: n.role, attrs: n.attrs }));
        for (const l of links.value)
            m.addLink(makeLink({ id: l.id, fromNodeId: l.fromNodeId, toNodeId: l.toNodeId, role: l.role,
                                 conveyance: l.conveyance, profile: l.profile, points: l.points,
                                 length: l.length, attrs: l.attrs }));
        return m;
    }
    const selected = computed(() => {
        if (!selectedId.value) return null;
        return nodes.value.find(n => n.id === selectedId.value)
            || links.value.find(l => l.id === selectedId.value) || null;
    });

    return { nodes, links, model, format, warnings, selectedId, selected, prefillPercent,
             revision, touch,
             hasNetwork, nodeById, setModel, clear, select,
             setArrays, updateNode, updateNodesBatch, updateLink, deleteNode, deleteLink, addNode, addLink, toModel, transformCoords, cropOutside, mergeModel };
});
