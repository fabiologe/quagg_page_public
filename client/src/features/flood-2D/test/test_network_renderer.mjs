// Node-Test für useNetworkRenderer: INKREMENTELLES Rendern, entkoppelte Auswahl und
// die instanzierte/gechunkte Darstellung (Performance-Audit 2026-07-27).
//
// Vorher bekam jedes Element ein eigenes Mesh mit eigenem Material: 8800 Draw-Calls bei
// einem 3000-Schacht-Netz, und JEDE Store-Änderung — auch ein reiner Auswahl-Klick —
// baute alles neu auf (gemessen 1,2 s). Dieser Test nagelt fest, dass
//   1. ein Auswahl-Klick KEINE Geometrie erzeugt (nur Farbe),
//   2. eine Einzeländerung nur den betroffenen Block neu baut,
//   3. Hinzufügen/Löschen weiterhin korrekt greift,
//   4. die Farb-Semantik hält (Auswahl gewinnt, Abwahl stellt Basis-/Ergebnisfarbe her),
//   5. die Draw-Call-Zahl konstant klein bleibt statt mit dem Netz zu wachsen,
//   6. Picking (Instanz-Index bzw. Flächen-Index im Block) die richtige ID liefert.
//
//   node src/features/flood-2D/test/test_network_renderer.mjs

import * as THREE from 'three';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import { useNetworkStore } from '../stores/useNetworkStore.js';
import { useGeoStore } from '../stores/useGeoStore.js';
import { useNetworkRenderer, CHUNK_SIZE } from '../composables/editor/useNetworkRenderer.js';

let failed = 0;
const check = (cond, msg) => {
    console.log((cond ? '  ✅ ' : '  ❌ ') + msg);
    if (!cond) failed++;
};

setActivePinia(createPinia());
const net = useNetworkStore();
const scene = new THREE.Scene();
// getLocalPos wie useLayerRenderer (Welt → Szene). zOffset simuliert terrain.minZ —
// in echt liest getLocalPos das live aus dem Grid; Test 14 verschiebt es wie ein Crop.
let zOffset = 0;
const getLocalPos = (x, y, z) => new THREE.Vector3(x, z - zOffset, -y);

const SELECT = 0xa3e635;
const CONDUIT = 0x94a3b8;
const CHANNEL = 0x06b6d4;

const mkNode = (id, x, opts = {}) => ({
    id, role: opts.role ?? 'manhole', x, y: 0,
    rim: opts.rim ?? 10, invert: opts.invert ?? 8, attrs: { diameter: 1, ...opts.attrs },
});
const mkLink = (id, a, b, opts = {}) => ({
    id, role: 'conduit', conveyance: opts.conveyance ?? 'covered',
    fromNodeId: a, toNodeId: b, points: opts.points ?? null,
    profile: { shape: 'circular', height: 0.3, width: 0 }, attrs: {},
});

net.setArrays(
    [mkNode('S1', 0), mkNode('S2', 20), mkNode('S3', 40, { role: 'outfall' })],
    [mkLink('H1', 'S1', 'S2'), mkLink('H2', 'S2', 'S3', { conveyance: 'open' })],
);

const r = useNetworkRenderer(scene, getLocalPos);
await nextTick();

// NEU erzeugte Geometrien zählen — genau die Arbeit, die vorher bei jedem Klick anfiel.
// Über die UUIDs in der Gruppe (ESM-Namespace ist eingefroren, kein Konstruktor-Patching):
// alles, was nach dem Schnappschuss neu in der Gruppe hängt, wurde neu gebaut.
const geoUuids = () => {
    const s = new Set();
    r.group.traverse((o) => { if (o.geometry) s.add(o.geometry.uuid); });
    return s;
};
const countingFrom = () => {
    const before = geoUuids();
    return () => { let n = 0; for (const u of geoUuids()) if (!before.has(u)) n++; return n; };
};

console.log('1) Erstaufbau');
{
    check(r.hasElement('S1') && r.hasElement('S3'), 'alle Schächte gerendert');
    check(r.hasElement('H1') && r.hasElement('H2'), 'alle Haltungen gerendert');
    check(r.colorOf('H1') === CONDUIT, 'Rohr in Rohr-Farbe');
    check(r.colorOf('H2') === CHANNEL, 'offenes Gerinne in Gerinne-Farbe');
    const st = r.getStats();
    check(st.nodes === 3 && st.links === 2, `Kennzahlen stimmen (${st.nodes} Schächte, ${st.links} Haltungen)`);
}

console.log('2) Auswahl erzeugt KEINE Geometrie (der teure Alt-Pfad)');
{
    const since = countingFrom();
    net.select('S2');
    await nextTick();
    check(since() === 0, `Auswahl-Klick baute 0 Geometrien (war: kompletter Neuaufbau), gezählt ${since()}`);
    check(r.colorOf('S2') === SELECT, 'gewählter Schacht ist lime');
}

console.log('3) Umwahl färbt um, ohne neu zu bauen');
{
    const since = countingFrom();
    net.select('H1');
    await nextTick();
    check(since() === 0, 'Umwahl baute 0 Geometrien');
    check(r.colorOf('S2') !== SELECT, 'vorher gewählter Schacht ist zurückgesetzt');
    check(r.colorOf('H1') === SELECT, 'neu gewählte Haltung ist lime');
}

console.log('4) Abwahl stellt die Basisfarbe wieder her');
{
    net.select(null);
    await nextTick();
    check(r.colorOf('H1') === CONDUIT, 'Rohr hat wieder Rohr-Farbe (nicht Gerinne-/Auswahlfarbe)');
    check(r.colorOf('H2') === CHANNEL, 'Gerinne unverändert');
}

console.log('5) Einzeländerung: Schacht-Instanz ohne jede Geometrie-Erzeugung');
{
    const since = countingFrom();
    net.updateNode('S1', { rim: 12 });   // Schächte sind Instanzen → nur Matrix schreiben
    await nextTick();
    check(since() === 0, `Schacht-Änderung baute 0 Geometrien (${since()})`);
    check(r.hasElement('S1'), 'geänderter Schacht weiterhin vorhanden');
}

console.log('6) Reine Farbänderung (conveyance) ohne Neuaufbau');
{
    const since = countingFrom();
    net.updateLink('H1', { conveyance: 'open' });
    await nextTick();
    check(since() === 0, 'Typwechsel Rohr→Gerinne baute 0 Geometrien');
    check(r.colorOf('H1') === CHANNEL, 'Farbe wurde trotzdem aktualisiert');
    net.updateLink('H1', { conveyance: 'covered' });
    await nextTick();
}

console.log('7) Hinzufügen / Löschen');
{
    net.addNode({ id: 'S4', x: 60, y: 0, rim: 10, invert: 7.4, attrs: { diameter: 1 } });
    await nextTick();
    check(r.hasElement('S4'), 'neuer Schacht erscheint');

    net.deleteNode('S3');    // löscht auch H2 (hängende Haltung)
    await nextTick();
    check(!r.hasElement('S3'), 'gelöschter Schacht ist aus der Szene');
    check(!r.hasElement('H2'), 'zugehörige Haltung mit entfernt');
    check(r.hasElement('S1') && r.hasElement('H1'), 'Rest des Netzes unberührt');
}

console.log('8) Auswahl eines gelöschten Elements bricht nichts');
{
    net.select('S3');        // existiert nicht mehr
    await nextTick();
    net.select(null);
    await nextTick();
    check(true, 'kein Fehler bei Auswahl eines entfernten Elements');
}

console.log('9) Draw-Calls wachsen NICHT mit der Netzgröße');
{
    const nodes = [], links = [];
    for (let i = 0; i < 600; i++) nodes.push(mkNode(`N${i}`, i * 10));
    for (let i = 0; i < 599; i++) links.push(mkLink(`L${i}`, `N${i}`, `N${i + 1}`));
    net.setArrays(nodes, links);
    await nextTick();

    const st = r.getStats();
    check(st.nodes === 600 && st.links === 599, `600/599 Elemente gerendert (${st.nodes}/${st.links})`);
    // 2 Instanz-Meshes + ceil(599/CHUNK_SIZE) Haltungs-Blöcke — statt 1799 Einzel-Meshes
    const erwartet = 2 + Math.ceil(599 / CHUNK_SIZE);
    check(st.drawCalls === erwartet,
        `nur ${st.drawCalls} Draw-Calls statt 1799 (2 Instanzen + ${st.chunks} Blöcke)`);
}

console.log('10) Einzeländerung baut nur IHREN Block neu, nicht alle');
{
    const since = countingFrom();
    net.updateLink('L5', { profile: { height: 0.9 } });   // liegt in Block 0
    await nextTick();
    const built = since();
    check(built === 1, `genau 1 Block neu verschmolzen (${built}), alle anderen blieben stehen`);
    check(r.hasElement('L5') && r.hasElement('L500'), 'Haltungen aus verschiedenen Blöcken weiterhin da');
}

console.log('11) Auswahl im großen Netz bleibt geometriefrei');
{
    const since = countingFrom();
    net.select('L300');
    await nextTick();
    check(since() === 0, 'Auswahl im 600er-Netz baute 0 Geometrien');
    check(r.colorOf('L300') === SELECT, 'gewählte Haltung ist lime');
    net.select(null);
    await nextTick();
    check(r.colorOf('L300') === CONDUIT, 'nach Abwahl wieder Basisfarbe');
}

console.log('11b) Auswahl überlebt den Neuaufbau ihres eigenen Blocks');
{
    // Fallstrick: wird der Block einer GEWÄHLTEN Haltung neu verschmolzen, entsteht ein
    // frischer Farbpuffer. Ohne Berücksichtigung der Auswahl im Aufbau verlöre sie ihre
    // Markierung — applySelection greift danach nicht mehr (die Auswahl änderte sich ja nicht).
    net.select('L10');
    await nextTick();
    check(r.colorOf('L10') === SELECT, 'Ausgangslage: L10 ist lime');

    net.updateLink('L10', { profile: { height: 1.4 } });   // erzwingt Neuaufbau von Block 0
    await nextTick();
    check(r.colorOf('L10') === SELECT, 'nach dem Neuaufbau immer noch lime markiert');

    net.select(null);
    await nextTick();
    check(r.colorOf('L10') === CONDUIT, 'Abwahl stellt die Basisfarbe her');
}

console.log('12) Picking liefert die richtige ID');
{
    // Schacht: Instanz-Index → ID
    const nodeMesh = r.group.children.find(o => o.userData?.networkKind === 'node');
    const hitNode = r.pickFromIntersects([{ object: nodeMesh, instanceId: 7 }]);
    check(hitNode?.id === 'N7' && hitNode.kind === 'node',
        `Instanz 7 → Schacht N7 (bekam ${hitNode?.id})`);

    // Haltung: Flächen-Index im Block → ID. Block 0 gezielt über seinen Slot holen —
    // die Reihenfolge in group.children folgt der Bau-Reihenfolge, nicht dem Slot
    // (ein neu verschmolzener Block hängt sich hinten an).
    const chunk0 = r.group.children.find(o => o.userData?.chunkSlot === 0);
    const hitLink = r.pickFromIntersects([{ object: chunk0, faceIndex: 0 }]);
    check(hitLink?.kind === 'link' && hitLink.id === 'L0',
        `Fläche 0 in Block 0 → Haltung L0 (bekam ${hitLink?.id})`);

    // Und eine Fläche mitten im Block trifft die zugehörige Haltung, nicht die erste.
    const chunk1 = r.group.children.find(o => o.userData?.chunkSlot === 1);
    const hitMid = r.pickFromIntersects([{ object: chunk1, faceIndex: 0 }]);
    const erwarteteId = `L${CHUNK_SIZE}`;   // erste Haltung des zweiten Blocks
    check(hitMid?.id === erwarteteId,
        `erste Fläche in Block 1 → Haltung ${erwarteteId} (bekam ${hitMid?.id})`);

    check(r.pickFromIntersects([]) === null, 'leerer Treffer → null');
}

console.log('13) ECHTER Raycast — auch auf einen verschobenen Schacht');
{
    // InstancedMesh.raycast() bricht anhand einer GECACHTEN Bounding-Sphere vorzeitig ab.
    // Wird die nach einer Instanz-Bewegung nicht verworfen, lässt sich der Schacht
    // plötzlich nicht mehr anklicken — ein still versagendes Picking.
    const rc = new THREE.Raycaster();
    const meshes = r.group.children;
    const pickAt = (wx, wy) => {
        // getLocalPos: Szene-x = Welt-x, Szene-z = −Welt-y; von oben nach unten schießen
        rc.set(new THREE.Vector3(wx, 500, -wy), new THREE.Vector3(0, -1, 0));
        return r.pickFromIntersects(rc.intersectObjects(meshes, false));
    };

    const hit = pickAt(50, 0);        // N5 steht bei x = 5*10 = 50
    check(hit?.id === 'N5', `Strahl auf x=50 trifft N5 (bekam ${hit?.id})`);

    // Schacht weit aus der ursprünglichen Hülle heraus verschieben
    net.updateNode('N5', { x: 99999 });
    await nextTick();
    const moved = pickAt(99999, 0);
    check(moved?.id === 'N5', `nach Verschieben auf x=99999 weiterhin treffbar (bekam ${moved?.id})`);
    // An der alten Stelle steht KEIN Schacht mehr. Eine Haltung darf dort sehr wohl
    // getroffen werden: L4/L5 hängen weiter an N5 und sind bis x=99999 gedehnt.
    const old = pickAt(50, 0);
    check(old?.id !== 'N5', `an der alten Stelle kein Schacht N5 mehr (dort jetzt: ${old?.id ?? 'nichts'})`);

    // Drag-Vorschau bewegt die Instanz ohne Store-Write — muss ebenfalls treffbar bleiben
    r.previewNodePosition('N5', 12345, 0, 10);
    check(pickAt(12345, 0)?.id === 'N5', 'Drag-Vorschau bleibt treffbar');
}

console.log('14) Terrain-Wechsel erzwingt Komplett-Neuaufbau (Crop-Schwebe-Bug 2026-07-28)');
{
    // Nach einem Raster-Zuschnitt ändert sich das Höhen-Datum (minZ) im Welt→Szene-
    // Transform — die Element-SIGNATUREN aber nicht. Ohne den terrainVersion-Watch
    // blieben alle Instanz-Matrizen stehen und das Netz schwebte um Δ minZ überm Gelände.
    const geo = useGeoStore();
    const m4 = new THREE.Matrix4(), p4 = new THREE.Vector3(),
          q4 = new THREE.Quaternion(), s4 = new THREE.Vector3();
    const nodeYAt0 = () => {
        const mesh = r.group.children.find(o => o.userData?.networkKind === 'node');
        mesh.getMatrixAt(0, m4); m4.decompose(p4, q4, s4);
        return p4.y;
    };
    const yBefore = nodeYAt0();
    zOffset = 10;                    // „minZ um 10 m gestiegen" (wie beim Zuschneiden)
    geo.notifyTerrainModified();     // terrainVersion++ — genau das Signal des Crops
    await nextTick();
    const yAfter = nodeYAt0();
    check(Math.abs((yBefore - yAfter) - 10) < 1e-4,
        `Schacht-Instanz folgt dem neuen Höhen-Datum (Δy=${(yBefore - yAfter).toFixed(2)} m, erwartet 10)`);
    check(r.colorOf('L0') !== null && r.hasElement('N0'), 'Register nach Neuaufbau intakt');
    zOffset = 0;
    geo.notifyTerrainModified();
    await nextTick();
}

console.log('15) Ergebnis-Viewer-Szenario: Netz hydriert VOR dem Terrain → rebuild() heilt');
{
    // Im Viewer-Fenster speist getLocalPos sich aus props.terrain (nicht geoStore).
    // Hydration setzt Netz + Terrain im selben Tick — rendert der Renderer vor der
    // Prop-Propagierung, liegen alle Punkte bei (0,0,0) als unsichtbarer Klumpen
    // („Kanalnetz im Ergebnis-Viewer verschwunden", 2026-07-29). ResultMap3D ruft
    // deshalb rebuild(), sobald das Terrain wirklich da ist.
    let viewerTerrainReady = false;                      // simuliert props.terrain
    const viewerGetLocal = (x, y, z) => viewerTerrainReady
        ? new THREE.Vector3(x - 100, z - 5, -(y - 200))  // echter Transform (center/minZ)
        : new THREE.Vector3(0, 0, 0);                    // Prop noch nicht propagiert

    const scene2 = new THREE.Scene();
    const r2 = useNetworkRenderer(scene2, viewerGetLocal);
    // Hydration: setArrays läuft, WÄHREND der Transform noch blind ist.
    net.setArrays(
        [mkNode('V1', 150), mkNode('V2', 180)],
        [mkLink('VH', 'V1', 'V2')],
    );
    await nextTick();
    const mesh2 = () => r2.group.children.find(o => o.userData?.networkKind === 'node');
    const m4b = new THREE.Matrix4(), p4b = new THREE.Vector3(),
          q4b = new THREE.Quaternion(), s4b = new THREE.Vector3();
    mesh2().getMatrixAt(0, m4b); m4b.decompose(p4b, q4b, s4b);
    check(Math.abs(p4b.x) < 1e-6 && Math.abs(p4b.z) < 1e-6,
        'Reproduktion: ohne Terrain landet der Schacht bei (0,0) — der unsichtbare Klumpen');
    check(r2.getStats().links === 0,
        'Haltungen degenerieren zu Nulllängen und fehlen komplett');

    // Terrain-Prop trifft ein → ResultMap3D ruft rebuild()
    viewerTerrainReady = true;
    r2.rebuild();
    await nextTick();
    mesh2().getMatrixAt(0, m4b); m4b.decompose(p4b, q4b, s4b);
    check(Math.abs(p4b.x - 50) < 1e-4 && Math.abs(p4b.z - 200) < 1e-4,
        `rebuild() positioniert korrekt (x=${p4b.x.toFixed(1)}, z=${p4b.z.toFixed(1)})`);
    check(r2.getStats().links === 1, 'Haltung existiert nach rebuild()');

    // Auslastungs-Färbung: applyResults nach rebuild anwendbar (Viewer-Frame-Pfad)
    r2.applyResults({
        nodes: new Map([['V1', { fill: 0.5, flooded: false, depth: 1 }]]),
        links: new Map([['VH', { fill: 0.95, surcharged: true, flow: 0.1, velocity: 0.5 }]]),
    });
    check(r2.colorOf('VH') === 0xef4444, 'Vollfüllung färbt die Haltung rot (Auslastung sichtbar)');
    r2.dispose();
}

console.log(failed === 0 ? '\n✅ NETZ-RENDERER BESTANDEN' : `\n❌ ${failed} FEHLER`);
process.exit(failed === 0 ? 0 : 1);
