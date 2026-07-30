// Rendert das importierte Kanalnetz (Schächte + Haltungen) in die MapEditor3D-Szene.
// Self-contained wie useLayerRenderer: eigener Group, eigener Watch auf useNetworkStore.
// Nutzt den geteilten Welt→Szene-Transform getLocalPos (aus useLayerRenderer), damit das
// Netz exakt auf Terrain/Nodes ausgerichtet ist.
//
// ── Aufbau (Performance-Audit 2026-07-27) ────────────────────────────────────────────
// Vorher bekam JEDES Element ein eigenes Mesh mit eigenem Material: bei einem echten
// ISYBAU-Netz (3000 Schächte / 2800 Haltungen) waren das 8800 Draw-Calls PRO BILD, und
// jede Store-Änderung — auch ein reiner Auswahl-Klick — baute alles neu auf (~1,2 s).
// Jetzt:
//   • Schächte + Wassersäulen: je EINE InstancedMesh (Einheitszylinder, Matrix und Farbe
//     pro Instanz) → 2 Draw-Calls, Positions-/Farbänderung ist O(1) ohne Neuaufbau.
//   • Haltungen: freie Polylinien lassen sich nicht instanzieren, deshalb in Blöcken zu
//     CHUNK_SIZE zu je einer Geometrie verschmolzen, Farbe über ein Vertex-Attribut.
//     → wenige Draw-Calls, und eine Einzeländerung baut nur ihren Block neu.
//   • Auswahl läuft rein über Farbschreibvorgänge, nie über Geometrie.
// Gegengeprüft von test_network_renderer.mjs.

import * as THREE from 'three';
import { watch } from 'vue';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RENDER_ORDER } from './renderLayers.js';
import { requestRender } from './renderTrigger.js';
// Relativ (nicht per @-Alias) importiert, damit der Node-Test test_network_renderer.mjs
// die Datei ohne Bundler-Alias laden kann — wie in den übrigen editor/-Composables.
import { useNetworkStore } from '../../stores/useNetworkStore.js';
import { useGeoStore } from '../../stores/useGeoStore.js';

const ROLE_COLOR = {
    manhole: 0x3b82f6, inlet: 0x22c55e, outfall: 0xef4444,
    storage: 0xa855f7, junction: 0x38bdf8, weir: 0xf59e0b, orifice: 0xf97316, pump: 0xeab308,
};
const CONDUIT_COLOR = 0x94a3b8;   // Rohr (covered)
const CHANNEL_COLOR = 0x06b6d4;   // offenes Gerinne (open)
const SELECT_COLOR  = 0xa3e635;   // SaintV-Lime
const DEFAULT_NODE_COLOR = 0x64748b;

// Ergebnis-Darstellung (Result-Viewer): Füllgrad-Färbung + Schacht-Wassersäule
const WATER_COLOR     = 0x38bdf8; // teilgefüllt
const SURCHARGE_COLOR = 0xef4444; // Vollfüllung/Überdruck (capacity ≥ 1)
const FLOOD_COLOR     = 0xff7043; // Schacht überstaut (flooding > 0)

// Haltungen je Block. Kompromiss: kleiner = billigere Einzeländerung, größer = weniger
// Draw-Calls. Gemessen an einem 2800-Haltungs-Netz (Änderung EINER Haltung / Draw-Calls):
//   256 → 79 ms / 13   ·   128 → 55 ms / 24   ·   64 → 44 ms / 46   ·   32 → 44 ms / 90
// Ab 64 sinkt die Änderungszeit nicht weiter, die Draw-Calls steigen aber weiter — das
// ist der Umschlagpunkt.
export const CHUNK_SIZE = 64;

const _waterC = new THREE.Color(WATER_COLOR);
const _surchC = new THREE.Color(SURCHARGE_COLOR);
const _tmpC   = new THREE.Color();
const _mat4   = new THREE.Matrix4();
const _pos    = new THREE.Vector3();
const _scl    = new THREE.Vector3();
const _quat   = new THREE.Quaternion();

/**
 * @param {THREE.Scene} scene
 * @param {(x:number,y:number,z:number)=>THREE.Vector3} getLocalPos  aus useLayerRenderer
 */
export function useNetworkRenderer(scene, getLocalPos) {
    const net = useNetworkStore();

    const group = new THREE.Group();
    group.name = 'Layer_Network';
    group.renderOrder = RENDER_ORDER.NETWORK;
    scene.add(group);

    // X-Ray (WIREFRAME-Rasteransicht im Editor): die unsichtbare Terrain-Tiefenmaske
    // (MapEditor3D.terrainDepthMesh) verdeckt dort alles Unterirdische — gewollt für
    // vergrabene Weir-/Brückenteile, aber das Kanalnetz soll als Ausnahme sichtbar bleiben.
    // renderOrder allein reicht nicht: die Schächte sind transparent und laufen im
    // Transparent-Pass IMMER nach der (opaken) Maske → depthTest/depthWrite abschalten.
    let xray = false;
    const applyXray = (mat) => { mat.depthTest = !xray; mat.depthWrite = !xray; };

    // ── Geteilte Einheits-Geometrien (radius 1, höhe 1, um den Ursprung zentriert) ──
    // Die tatsächlichen Maße kommen aus der Instanz-Matrix.
    const unitNodeGeo  = new THREE.CylinderGeometry(1, 1, 1, 12);
    const unitWaterGeo = new THREE.CylinderGeometry(1, 1, 1, 10);

    const nodeMat = new THREE.MeshStandardMaterial({
        roughness: 0.7, metalness: 0.1,
        transparent: true, opacity: 0.85,   // Wassersäule im Schacht bleibt sichtbar
    });
    const waterMat = new THREE.MeshStandardMaterial({
        roughness: 0.3, metalness: 0.0, transparent: true, opacity: 0.9,
    });
    // vertexColors: die Haltungsfarbe steckt im Farb-Attribut der verschmolzenen Geometrie;
    // material.color bleibt weiß, sonst würde es die Vertex-Farbe herunterdimmen.
    const linkMat = new THREE.MeshStandardMaterial({
        roughness: 0.6, metalness: 0.2, side: THREE.DoubleSide, vertexColors: true,
    });
    [nodeMat, waterMat, linkMat].forEach(applyXray);

    let nodeMesh = null;    // InstancedMesh (Schächte)
    let waterMesh = null;   // InstancedMesh (Wassersäulen im Ergebnis-Viewer)
    let nodeCapacity = 0;

    /** id → { idx, botY, h, r, sig, baseColor } (idx = Instanz-Index) */
    const nodeRecs = new Map();
    /** Umkehrung für das Picking: Instanz-Index → Schacht-ID */
    const nodeIdByIndex = [];
    /** id → { chunk, vStart, vCount, fStart, fCount, sig, baseColor } */
    const linkRecs = new Map();
    /** Blöcke verschmolzener Haltungen: { mesh, ids[], sig, faceIndex[] } */
    const linkChunks = [];

    let lastState = null;        // zuletzt angewandter Ergebnis-Zustand (überlebt re-render)
    let _selectedApplied = null; // zuletzt eingefärbte Auswahl (s. applySelection)
    let colorMode = 'capacity';  // 'capacity' | 'flow' | 'velocity'

    // ── Änderungserkennung ────────────────────────────────────────────────────
    // Nur GEOMETRIE-relevante Felder; Farbe (role/conveyance/Auswahl/Ergebnis) wird
    // separat und ohne Neuaufbau gesetzt.
    //
    // Bewusst ZAHLEN statt Zeichenketten: die Signatur wird bei jeder Änderung über ALLE
    // Elemente neu gebildet. Mit Template-Literalen kostete allein das bei 2800 Haltungen
    // ~32 ms (plus je Block ein join() über 256 Strings). Ein 32-bit-Rolling-Hash macht
    // daraus reine Arithmetik ohne Allokation. Kollisionen sind hier folgenlos-unwahr-
    // scheinlich, und der schlimmste Fall wäre ein NICHT neu gebauter Block — kein
    // Datenverlust, sichtbar erst bei exakt gleicher Prüfsumme trotz anderer Geometrie.
    const h32 = (h, v) => {
        // v als Zahl einmischen (FNV-artig, Nachkommastellen über *1e4 erhalten)
        const n = Number.isFinite(v) ? Math.round(v * 1e4) : 0;
        h = (h ^ (n & 0xffff)) * 16777619 | 0;
        h = (h ^ (n >>> 16))  * 16777619 | 0;
        return h;
    };
    const nodeSig = (n) => {
        let h = 0x811c9dc5;
        h = h32(h, n.x); h = h32(h, n.y); h = h32(h, n.rim); h = h32(h, n.invert);
        h = h32(h, n.attrs?.diameter);
        return h;
    };
    // Haltungsgeometrie hängt zusätzlich an den Endknoten-Positionen (gerade Verbindung,
    // wenn keine eigene Polylinie existiert). Stützpunkte werden von Store/Werkzeugen
    // immer als NEUES Array gesetzt (transformCoords/updateLink) — eine laufende Nummer
    // je Array-Identität plus Länge reicht daher; In-Place-Mutation gibt es nicht.
    let _ptsSeq = 0;
    const _ptsIds = new WeakMap();
    const ptsId = (pts) => {
        if (!Array.isArray(pts)) return 0;
        let id = _ptsIds.get(pts);
        if (id === undefined) { id = ++_ptsSeq; _ptsIds.set(pts, id); }
        return id * 1000 + Math.min(pts.length, 999);
    };

    // Rohrsohle am Knoten: attrs.z1/z2 (absolute Haltungssohle, z. B. Einlauf 1.5 m ÜBER
    // der Schachtsohle — SWMM InOffset/OutOffset) gewinnt vor der Knotensohle.
    const linkEndZ = (l, node, key) => {
        const z = Number(l.attrs?.[key]);
        return Number.isFinite(z) ? z : node.invert;
    };
    const strHash = (str) => {
        let h = 0x811c9dc5;
        for (let i = 0; i < str.length; i++) h = ((h ^ str.charCodeAt(i)) * 16777619) | 0;
        return h;
    };
    const linkSig = (l, from, to) => {
        let h = strHash(String(l.id));
        h = h32(h, from.x); h = h32(h, from.y); h = h32(h, to.x); h = h32(h, to.y);
        h = h32(h, linkEndZ(l, from, 'z1')); h = h32(h, linkEndZ(l, to, 'z2'));
        h = h32(h, l.profile?.height);
        h = h32(h, ptsId(l.points));
        return h;
    };

    // ISYBAU-Profile kommen teils in mm (DN600 = 600) — defensiv normalisieren und den
    // Radius klemmen: ein kaputter Wert machte sonst ein hunderte Meter dickes Rohr, in
    // dem die Kamera INNEN steckt (sichtbar als „zwei Schalen" statt rundem Rohr).
    const linkRadius = (l) => {
        let h = Number(l.profile?.height);
        if (!Number.isFinite(h) || h <= 0) h = 0.3;
        if (h > 10) h = h / 1000;                      // mm → m (kein Rohr ist > 10 m)
        return Math.min(Math.max(h / 2, 0.12), 2.5);
    };

    const linkBaseColor = (l, from) => {
        // Sonder-Link: Haltung, die von Pumpe/Wehr/Drossel ABGEHT, wird zum SWMM-
        // Sonderbauwerk (SwmmBuilder) — in der Rollenfarbe des Bauwerks markieren.
        if (['pump', 'weir', 'orifice'].includes(from.role))
            return ROLE_COLOR[from.role] ?? CONDUIT_COLOR;
        return l.conveyance === 'open' ? CHANNEL_COLOR : CONDUIT_COLOR;
    };

    // ── Schächte (InstancedMesh) ──────────────────────────────────────────────

    function ensureNodeCapacity(n) {
        if (nodeMesh && n <= nodeCapacity) return;
        // In Stufen wachsen, damit nicht jedes Hinzufügen neu alloziert.
        const cap = Math.max(32, Math.ceil(n * 1.5));
        disposeNodeMeshes();
        nodeCapacity = cap;

        nodeMesh = new THREE.InstancedMesh(unitNodeGeo, nodeMat, cap);
        nodeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        nodeMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
        nodeMesh.renderOrder = RENDER_ORDER.NETWORK;
        nodeMesh.userData.networkKind = 'node';
        nodeMesh.frustumCulled = false;   // Instanz-BBox wird nicht gepflegt
        group.add(nodeMesh);

        waterMesh = new THREE.InstancedMesh(unitWaterGeo, waterMat, cap);
        waterMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        waterMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
        waterMesh.renderOrder = RENDER_ORDER.NETWORK + 1;
        waterMesh.userData.networkKind = 'node-water';
        waterMesh.frustumCulled = false;
        group.add(waterMesh);
    }


    /** Instanz-Puffer als geändert markieren UND die gecachte Bounding-Sphere verwerfen.
     *  InstancedMesh.raycast() bricht anhand dieser Sphere vorzeitig ab (three-Quelle):
     *  bleibt sie nach einer Instanz-Bewegung stehen, wird der Schacht plötzlich nicht
     *  mehr angeklickt — ein still versagendes Picking. */
    function flushInstances(mesh, withColor = false, recomputeBounds = true) {
        if (!mesh) return;
        mesh.instanceMatrix.needsUpdate = true;
        if (withColor && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        if (recomputeBounds) {
            mesh.boundingSphere = null;
            mesh.computeBoundingSphere();
        }
    }

    function disposeNodeMeshes() {
        for (const m of [nodeMesh, waterMesh]) {
            if (!m) continue;
            group.remove(m);
            m.dispose();       // gibt nur die Instanz-Puffer frei, nicht die geteilte Geometrie
        }
        nodeMesh = waterMesh = null;
        nodeCapacity = 0;
    }

    // ── Haltungs-Blöcke (verschmolzene Geometrie + Vertex-Farben) ─────────────

    /** Tube-Geometrie EINER Haltung (ohne Farbe) — oder null bei entarteter Achse. */
    function buildLinkGeometry(l, from, to) {
        // Polylinie: eigene Stützpunkte (nur mit endlichen Koordinaten), sonst gerade
        // Verbindung der Rohrsohlen (z1/z2-bewusst).
        let pts = null;
        if (Array.isArray(l.points) && l.points.length >= 2) {
            const clean = l.points.filter(p =>
                Number.isFinite(p?.x) && Number.isFinite(p?.y) && Number.isFinite(p?.z));
            if (clean.length >= 2) pts = clean.map(p => getLocalPos(p.x, p.y, p.z));
        }
        if (!pts) {
            pts = [
                getLocalPos(from.x, from.y, linkEndZ(l, from, 'z1')),
                getLocalPos(to.x,   to.y,   linkEndZ(l, to,   'z2')),
            ];
        }
        // GERADE Segmente statt CatmullRom: Rohre laufen gestreckt von Schacht zu Schacht —
        // die Spline hat zwischen den Stützpunkten über-/untergeschwungen (Beulen/Schalen).
        const path = new THREE.CurvePath();
        for (let i = 0; i < pts.length - 1; i++) {
            if (pts[i].distanceToSquared(pts[i + 1]) < 1e-8) continue;  // Doppelpunkt
            path.add(new THREE.LineCurve3(pts[i], pts[i + 1]));
        }
        if (path.curves.length === 0) return null;   // degeneriert (Nulllänge)
        // DoubleSide am Material: die Tube ist an den Enden offen — einseitig gerendert
        // sah man von schräg oben durchs offene Ende die Innenwand als zweite „Schale".
        return new THREE.TubeGeometry(
            path, Math.max(path.curves.length * 2, 2), linkRadius(l), 16, false);
    }

    /** Einen Block neu verschmelzen. `members` = [{ l, from, to, sig }] */
    function buildChunk(slot, members, chunkSig) {
        disposeChunk(slot);

        const geos = [];
        const ids = [];
        const meta = [];   // parallel zu geos
        for (const m of members) {
            const g = buildLinkGeometry(m.l, m.from, m.to);
            if (!g) continue;
            geos.push(g);
            ids.push(m.l.id);
            meta.push(m);
        }
        if (geos.length === 0) {
            linkChunks[slot] = null;
            return;
        }

        const merged = BufferGeometryUtils.mergeGeometries(geos, false);
        // Vertex-Bereiche je Haltung merken (Umfärben ohne Neuaufbau) und Flächenbereiche
        // fürs Picking (raycast liefert faceIndex innerhalb des Blocks).
        const ranges = [];
        let vOff = 0, fOff = 0;
        for (let i = 0; i < geos.length; i++) {
            const vCount = geos[i].attributes.position.count;
            const fCount = (geos[i].index ? geos[i].index.count : vCount) / 3;
            ranges.push({ id: ids[i], vStart: vOff, vCount, fStart: fOff, fCount });
            vOff += vCount;
            fOff += fCount;
            geos[i].dispose();
        }

        const colors = new Float32Array(merged.attributes.position.count * 3);
        merged.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const mesh = new THREE.Mesh(merged, linkMat);
        mesh.renderOrder = RENDER_ORDER.NETWORK;
        mesh.userData.networkKind = 'link-chunk';
        mesh.userData.chunkSlot = slot;
        group.add(mesh);

        const chunk = { mesh, ranges, sig: chunkSig };
        linkChunks[slot] = chunk;

        for (let i = 0; i < ranges.length; i++) {
            const r = ranges[i];
            linkRecs.set(r.id, {
                chunk: slot, vStart: r.vStart, vCount: r.vCount,
                sig: meta[i].sig, baseColor: linkBaseColor(meta[i].l, meta[i].from),
            });
        }
        // Startfarben schreiben. Die AUSWAHL muss hier mit berücksichtigt werden: wird
        // der Block einer gerade gewählten Haltung neu verschmolzen, ginge ihre Markierung
        // sonst verloren (applySelection greift danach nicht mehr, weil sich die Auswahl
        // ja nicht geändert hat). Ergebnisfarben zieht render() am Ende nach.
        for (const r of ranges) {
            writeLinkColor(r.id, net.selectedId === r.id
                ? SELECT_COLOR : linkRecs.get(r.id).baseColor);
        }
    }

    function disposeChunk(slot) {
        const c = linkChunks[slot];
        if (!c) return;
        group.remove(c.mesh);
        c.mesh.geometry.dispose();
        for (const r of c.ranges) linkRecs.delete(r.id);
        linkChunks[slot] = null;
    }

    /** Farbe einer Haltung in den Vertex-Bereich ihres Blocks schreiben. */
    function writeLinkColor(id, colorHex) {
        const rec = linkRecs.get(id);
        if (!rec) return;
        // Unveränderte Farbe nicht neu schreiben: applyResults läuft im Ergebnis-Viewer
        // pro Bild über ALLE Haltungen. Ohne diesen Ausstieg würde jedes Bild den
        // kompletten Farbpuffer jedes Blocks neu zur GPU schieben.
        if (rec.color === colorHex) return;
        const chunk = linkChunks[rec.chunk];
        if (!chunk) return;
        _tmpC.set(colorHex);
        const attr = chunk.mesh.geometry.attributes.color;
        const arr = attr.array;
        const end = (rec.vStart + rec.vCount) * 3;
        for (let i = rec.vStart * 3; i < end; i += 3) {
            arr[i] = _tmpC.r; arr[i + 1] = _tmpC.g; arr[i + 2] = _tmpC.b;
        }
        attr.needsUpdate = true;
        rec.color = colorHex;
    }

    const clear = () => {
        disposeNodeMeshes();
        for (let i = 0; i < linkChunks.length; i++) disposeChunk(i);
        linkChunks.length = 0;
        nodeRecs.clear();
        nodeIdByIndex.length = 0;
        linkRecs.clear();
        _selectedApplied = null;
    };

    // ── Aufbau/Aktualisierung ─────────────────────────────────────────────────

    /**
     * INKREMENTELL: Schächte werden als Instanzen neu geschrieben (billig, reine Matrix-
     * Mathematik), Haltungs-Blöcke nur dann neu verschmolzen, wenn sich in ihnen etwas
     * Geometrisches geändert hat. Die AUSWAHL läuft komplett ohne Rebuild (applySelection).
     */
    function render() {
        if (!net.hasNetwork) { clear(); requestRender(); return; }

        // --- Haltungen: in Blöcke einteilen und nur geänderte neu bauen ---
        const members = [];
        for (const l of net.links) {
            const from = net.nodeById.get(l.fromNodeId);
            const to   = net.nodeById.get(l.toNodeId);
            if (!from || !to) continue;   // dangling — von der Validierung ohnehin gemeldet
            members.push({ l, from, to, sig: linkSig(l, from, to) });
        }
        const chunkCount = Math.ceil(members.length / CHUNK_SIZE);
        for (let slot = 0; slot < chunkCount; slot++) {
            const part = members.slice(slot * CHUNK_SIZE, (slot + 1) * CHUNK_SIZE);
            // Blocksignatur = Faltung der Element-Hashes (inkl. ID-Hash, damit auch eine
            // Umsortierung erkannt wird) — kein String-join über 256 Einträge.
            let sig = 0x811c9dc5 ^ part.length;
            for (const m of part) sig = ((sig ^ m.sig) * 16777619) | 0;
            const existing = linkChunks[slot];
            if (existing && existing.sig === sig) {
                // Geometrie unverändert — nur Basisfarben nachziehen (conveyance/Rolle
                // können sich ohne Geometrie-Änderung ändern).
                for (const m of part) {
                    const rec = linkRecs.get(m.l.id);
                    if (!rec) continue;
                    const base = linkBaseColor(m.l, m.from);
                    if (base !== rec.baseColor) {
                        rec.baseColor = base;
                        if (net.selectedId !== m.l.id) writeLinkColor(m.l.id, base);
                    }
                }
                continue;
            }
            buildChunk(slot, part, sig);
        }
        for (let slot = chunkCount; slot < linkChunks.length; slot++) disposeChunk(slot);
        linkChunks.length = chunkCount;

        // --- Schächte: nur GEÄNDERTE Instanzen neu schreiben ---
        // Sitzt ein Schacht noch auf demselben Instanz-Platz und ist seine Signatur
        // unverändert, bleibt seine Matrix stehen — bei einer Einzeländerung fällt so
        // statt 3000 Matrix-Kompositionen genau eine an.
        ensureNodeCapacity(net.nodes.length);
        const prevRecs = new Map(nodeRecs);
        nodeRecs.clear();
        let idx = 0;
        let instancesTouched = false;
        for (const n of net.nodes) {
            const sig = nodeSig(n);
            const prev = prevRecs.get(n.id);
            const baseColor = ROLE_COLOR[n.role] ?? DEFAULT_NODE_COLOR;
            const wantColor = net.selectedId === n.id ? SELECT_COLOR : baseColor;

            if (prev && prev.sig === sig && nodeIdByIndex[idx] === n.id) {
                // Geometrie und Platz unverändert → Matrix stehen lassen.
                nodeRecs.set(n.id, { ...prev, idx, baseColor });
                if (prev.color !== wantColor) {
                    nodeMesh.setColorAt(idx, _tmpC.set(wantColor));
                    nodeRecs.get(n.id).color = wantColor;
                    nodeMesh.instanceColor.needsUpdate = true;
                }
                idx++;
                continue;
            }

            const top = getLocalPos(n.x, n.y, n.rim);
            const bot = getLocalPos(n.x, n.y, n.invert);
            const h = Math.max(top.y - bot.y, 0.5);
            const r = Math.max((n.attrs?.diameter ?? 1.0) / 2, 0.4);

            _pos.set(top.x, (top.y + bot.y) / 2, top.z);
            _scl.set(r, h, r);
            _mat4.compose(_pos, _quat.identity(), _scl);
            nodeMesh.setMatrixAt(idx, _mat4);
            nodeMesh.setColorAt(idx, _tmpC.set(wantColor));

            // Wassersäule zunächst unsichtbar (Skalierung 0) — applyResults setzt sie.
            _mat4.compose(_pos.set(top.x, bot.y, top.z), _quat.identity(), _scl.set(0, 0, 0));
            waterMesh.setMatrixAt(idx, _mat4);
            waterMesh.setColorAt(idx, _tmpC.set(WATER_COLOR));

            nodeRecs.set(n.id, { idx, botY: bot.y, h, r, sig, baseColor, color: wantColor });
            nodeIdByIndex[idx] = n.id;
            instancesTouched = true;
            idx++;
        }
        nodeIdByIndex.length = idx;
        if (nodeMesh.count !== idx) { nodeMesh.count = idx; waterMesh.count = idx; instancesTouched = true; }
        if (instancesTouched) {
            flushInstances(nodeMesh, true);
            flushInstances(waterMesh, true);
        }

        if (lastState) applyResults(lastState);      // Ergebnis-Färbung übersteht re-render
        _selectedApplied = net.selectedId ?? null;   // Instanzfarben tragen die Auswahl schon
        requestRender();
    }

    // ── Farbe: Auswahl und Ergebnisse ────────────────────────────────────────

    function setNodeColor(id, colorHex) {
        const rec = nodeRecs.get(id);
        if (!rec || !nodeMesh) return;
        if (rec.color === colorHex) return;   // s. writeLinkColor: Pro-Bild-Pfad

        nodeMesh.setColorAt(rec.idx, _tmpC.set(colorHex));
        nodeMesh.instanceColor.needsUpdate = true;
        rec.color = colorHex;
    }

    /** Ergebnis-/Basisfarbe EINER Haltung setzen (ohne Auswahl-Vorrang zu prüfen) —
     *  von applyResults (alle) und applySelection (nur das abgewählte Element) genutzt. */
    function applyLinkColor(id, rec, state) {
        const s = state?.links?.get(id);
        if (!s) { writeLinkColor(id, rec.baseColor); return; }
        if (colorMode === 'flow' || colorMode === 'velocity') {
            const norm = colorMode === 'flow' ? (state?.norms?.Qmax || 0) : (state?.norms?.vMax || 0);
            const val = Math.abs(colorMode === 'flow' ? s.flow : (s.velocity ?? 0));
            const t = norm > 0 ? Math.min(val / norm, 1) : 0;
            if (t < 0.5) _tmpC.set(rec.baseColor).lerp(_waterC, t * 2);
            else         _tmpC.copy(_waterC).lerp(_surchC, (t - 0.5) * 2);
            writeLinkColor(id, _tmpC.getHex());
        } else if (s.surcharged) {
            writeLinkColor(id, SURCHARGE_COLOR);
        } else {
            _tmpC.set(rec.baseColor).lerp(_waterC, Math.min(s.fill / 0.9, 1));
            writeLinkColor(id, _tmpC.getHex());
        }
    }

    /**
     * Auswahl OHNE Neuaufbau: nur die Farbe des vorher und des jetzt gewählten Elements
     * wird geschrieben (O(1) statt O(Netzgröße)). Das war der teuerste Pfad im Editor —
     * ein Klick auf einen Schacht baute vorher das gesamte Netz neu auf.
     */
    function applySelection() {
        const sel = net.selectedId ?? null;
        if (sel === _selectedApplied) return;
        const prev = _selectedApplied;
        _selectedApplied = sel;

        if (prev) {   // vorherige Auswahl auf Basis- bzw. Ergebnisfarbe zurücksetzen
            const nr = nodeRecs.get(prev);
            if (nr) setNodeColor(prev, nr.baseColor);
            const lr = linkRecs.get(prev);
            if (lr) applyLinkColor(prev, lr, lastState);
        }
        if (sel) {
            if (nodeRecs.has(sel)) setNodeColor(sel, SELECT_COLOR);
            else if (linkRecs.has(sel)) writeLinkColor(sel, SELECT_COLOR);
        }
        requestRender();
    }

    /**
     * Ergebnis-Zustand aufs Netz malen (Result-Viewer, pro Frame):
     * Haltungen füllgrad-gefärbt (grau→wasserblau, Vollfüllung rot) bzw. nach
     * Q/v (zweistufige Rampe Basis→wasserblau→rot, global über state.norms skaliert),
     * Schächte mit Wassersäule (invert→Wasserstand) und Überstau-Signalfarbe.
     * @param {{nodes:Map<string,{fill,flooded,depth}>, links:Map<string,{fill,surcharged,flow,velocity}>,
     *          norms?:{Qmax:number,vMax:number}}|null} state
     *        aus useNetworkResults.stateAtFrame(frame); null = zurück zur Basis-Darstellung.
     */
    function applyResults(state) {
        lastState = state;
        if (nodeMesh && waterMesh) {
            for (const [id, rec] of nodeRecs) {
                const s = state?.nodes?.get(id);
                const selected = net.selectedId === id;
                if (!s || s.fill <= 0.01) {
                    // unsichtbar über Skalierung 0 (Instanzen kennen kein `visible`)
                    _mat4.compose(_pos.set(0, 0, 0), _quat.identity(), _scl.set(0, 0, 0));
                    waterMesh.setMatrixAt(rec.idx, _mat4);
                } else {
                    const hW = Math.max(s.fill * rec.h, 0.05);
                    nodeMesh.getMatrixAt(rec.idx, _mat4);
                    _mat4.decompose(_pos, _quat, _scl);   // liefert x/z des Schachts
                    _mat4.compose(
                        _pos.set(_pos.x, rec.botY + hW / 2, _pos.z),
                        _quat.identity(),
                        _scl.set(rec.r * 0.62, hW, rec.r * 0.62));
                    waterMesh.setMatrixAt(rec.idx, _mat4);
                    waterMesh.setColorAt(rec.idx, _tmpC.set(s.flooded ? FLOOD_COLOR : WATER_COLOR));
                }
                // Überstau signalisieren; die Auswahlfarbe hat Vorrang.
                if (!selected) setNodeColor(id, s?.flooded ? FLOOD_COLOR : rec.baseColor);
            }
            // Hülle NICHT neu rechnen: das liefe im Ergebnis-Viewer pro Bild über alle
            // Instanzen. Für das Picking ist es folgenlos — die Wassersäule steckt
            // (Radius 0,62 ×) INNERHALB des Schachtzylinders, dessen Hülle aktuell ist
            // und der ohnehin zuerst getroffen wird.
            flushInstances(waterMesh, true, false);
        }
        for (const [id, rec] of linkRecs) {
            if (net.selectedId === id) continue;     // Auswahl-Farbe gewinnt
            applyLinkColor(id, rec, state);
        }
        requestRender();
    }

    /** Färbmodus der Haltungen im Result-Viewer: 'capacity' | 'flow' | 'velocity'. */
    function setColorMode(mode) {
        if (mode === colorMode) return;
        colorMode = mode;
        if (lastState) applyResults(lastState);
    }

    /** Netz-Layer ein-/ausblenden (Ebenen-Umschalter im Result-Viewer). */
    function setVisible(v) { group.visible = !!v; requestRender(); }

    /** X-Ray fürs ganze Netz an/aus (MapEditor3D.applyLayerMode, nur WIREFRAME). */
    function setXray(v) {
        v = !!v;
        if (v === xray) return;
        xray = v;
        [nodeMat, waterMat, linkMat].forEach(applyXray);
        requestRender();
    }

    /** Drag-Vorschau (NET_NODE): nur die Schacht-Instanz bewegen, ohne Store-Write —
     *  der Commit beim Drop triggert den Store-Watch und zieht die Haltungen nach. */
    function previewNodePosition(id, x, y, zRim) {
        const rec = nodeRecs.get(id);
        if (!rec || !nodeMesh) return;
        const top = getLocalPos(x, y, zRim);
        _mat4.compose(
            _pos.set(top.x, top.y - rec.h / 2, top.z),
            _quat.identity(),
            _scl.set(rec.r, rec.h, rec.r));
        nodeMesh.setMatrixAt(rec.idx, _mat4);
        flushInstances(nodeMesh);
        // Wassersäule während des Ziehens ausblenden (Skalierung 0)
        _mat4.compose(_pos.set(0, 0, 0), _quat.identity(), _scl.set(0, 0, 0));
        waterMesh.setMatrixAt(rec.idx, _mat4);
        flushInstances(waterMesh);
        requestRender();
    }

    /** Aus Raycaster-Intersects den getroffenen Netz-Eintrag lesen (für Picking). */
    function pickFromIntersects(intersects) {
        for (const hit of intersects) {
            const kind = hit.object?.userData?.networkKind;
            if (kind === 'node' || kind === 'node-water') {
                // Instanz-Index → Schacht-ID
                const id = nodeIdAtIndex(hit.instanceId);
                if (id) return { id, kind: 'node' };
            } else if (kind === 'link-chunk') {
                const chunk = linkChunks[hit.object.userData.chunkSlot];
                const id = chunk && linkIdAtFace(chunk, hit.faceIndex);
                if (id) return { id, kind: 'link' };
            }
        }
        return null;
    }

    function nodeIdAtIndex(idx) {
        return (idx == null) ? null : (nodeIdByIndex[idx] ?? null);
    }
    function linkIdAtFace(chunk, faceIndex) {
        if (faceIndex == null) return null;
        for (const r of chunk.ranges)
            if (faceIndex >= r.fStart && faceIndex < r.fStart + r.fCount) return r.id;
        return null;
    }

    // ── Diagnose/Test-API ────────────────────────────────────────────────────
    /** Aktuell gesetzte Farbe eines Elements (Hex) — für Tests und Diagnose. */
    function colorOf(id) {
        return nodeRecs.get(id)?.color ?? linkRecs.get(id)?.color ?? null;
    }
    /** Ist das Element gerendert? */
    function hasElement(id) { return nodeRecs.has(id) || linkRecs.has(id); }
    /** Kennzahlen: gerenderte Elemente + tatsächliche Draw-Calls des Netz-Layers. */
    function getStats() {
        const chunks = linkChunks.filter(Boolean).length;
        return {
            nodes: nodeRecs.size,
            links: linkRecs.size,
            chunks,
            drawCalls: (nodeMesh ? 2 : 0) + chunks,
        };
    }

    // Struktur/Geometrie (Import, Editieren, Terrain-Zentrierung) → inkrementeller Rebuild.
    // BEWUSST an der Revisionsnummer statt an einem deep-Watcher über nodes/links: Vues
    // Deep-Traversal kostete bei 3000 Schächten ~247 ms pro Änderung, allein fürs
    // Nachziehen der Abhängigkeiten (gemessen mit leerem Callback). Der Store meldet jede
    // Mutation über touch() — inklusive der Direktzuweisungen beim Undo-Restore.
    watch(() => net.revision, render, { immediate: true });

    // Terrain ersetzt/zugeschnitten (Import, Crop, Maske, Undo): der Welt→Szene-Transform
    // in getLocalPos (center + minZ) ändert sich, die Element-SIGNATUREN aber nicht — das
    // inkrementelle Rendern ließe alle Positionen stehen und das Netz „schwebte" um
    // Δ minZ überm Gelände (Crop-Fund 2026-07-28). Darum hier ein erzwungener
    // Komplett-Neuaufbau. Array von GETTERN: terrainVersion fängt Crop/Maske/Undo,
    // die terrain-Referenz den Erst-/Neuimport.
    const geoStore = useGeoStore();
    watch([() => geoStore.terrainVersion, () => geoStore.terrain],
          () => { clear(); render(); });
    // Auswahl BEWUSST getrennt und ohne deep: reine Farbänderung, kein Geometrie-Neuaufbau.
    watch(() => net.selectedId, applySelection);

    function dispose() {
        clear();
        unitNodeGeo.dispose();
        unitWaterGeo.dispose();
        nodeMat.dispose(); waterMat.dispose(); linkMat.dispose();
        scene.remove(group);
    }

    /**
     * Kompletter Neuaufbau (clear + render) — für Hosts, deren Welt→Szene-Transform
     * NICHT am geoStore hängt: der Ergebnis-Viewer speist getLocalPos aus seiner
     * terrain-PROP (ResultMap3D), die asynchron eintrifft. Rendert der Renderer davor
     * (Netz-Hydration vor Prop-Propagierung), liegen alle Punkte bei (0,0,0) — ein
     * unsichtbarer Klumpen, den keine Store-Revision je repariert (Viewer-Fund
     * 2026-07-29). Der Host ruft rebuild(), sobald sein Terrain wirklich da ist.
     */
    function rebuild() { clear(); render(); }

    return {
        group, render, rebuild, applyResults, setColorMode, setVisible, setXray,
        previewNodePosition, pickFromIntersects, dispose, getLocalPos,
        colorOf, hasElement, getStats,
    };
}
