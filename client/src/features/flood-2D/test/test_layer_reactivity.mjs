// Node-Test für die Reaktivitäts-Kette Store → Renderer nach der Umstellung von
// deep-Watchern auf Revisionszähler (Performance-Audit 2026-07-27).
//
// test_geostore_revisions.mjs prüft, dass der Store MELDET. Dieser Test prüft die andere
// Hälfte: dass die Verbraucher auf die Meldung auch REAGIEREN — und zwar zielgerichtet
// (eine Brückenänderung darf nicht die Gebäude neu bauen). Beides zusammen ersetzt die
// Sicherheit, die vorher der pauschale deep-Watcher gab.
//
// Bewusst ohne three.js: nachgebildet werden die Watch-Muster aus useLayerRenderer.js,
// useSgcRasterPreview.js und useChannelGhostPreview.js.
//
//   node src/features/flood-2D/test/test_layer_reactivity.mjs

import { createPinia, setActivePinia } from 'pinia';
import { watch, nextTick } from 'vue';
import { useGeoStore } from '../stores/useGeoStore.js';

let failed = 0;
const check = (cond, msg) => {
    console.log((cond ? '  ✅ ' : '  ❌ ') + msg);
    if (!cond) failed++;
};

setActivePinia(createPinia());
const geo = useGeoStore();

// Zähler je Layer — exakt die Watch-Ausdrücke der echten Renderer.
// ARRAY VON GETTERN (nicht Getter-auf-Array): ein Getter, der ein Array-Literal liefert,
// gibt jedes Mal eine neue Referenz zurück und gilt damit IMMER als geändert — genau
// dieser Unterschied entscheidet, ob die Layer-Trennung überhaupt greift.
const n = { buildings: 0, weirs: 0, bridges: 0, hydraulics: 0, sgcCells: 0, sgcGhost: 0 };
watch([() => geo.revisions.mod, () => geo.revisions.boundary], () => { n.buildings++; }, { immediate: true });
watch(() => geo.revisions.weir,   () => { n.weirs++; },   { immediate: true });
watch(() => geo.revisions.bridge, () => { n.bridges++; }, { immediate: true });
watch(() => geo.revisions.boundary, () => { n.hydraulics++; });
watch([() => geo.revisions.sgc, () => geo.revisions.bridge], () => { n.sgcCells++; }, { immediate: true });
watch(() => geo.revisions.sgc,    () => { n.sgcGhost++; }, { immediate: true });
await nextTick();

const snap = () => ({ ...n });
const diff = (a, b) => Object.fromEntries(Object.keys(b).map(k => [k, b[k] - a[k]]));

const poly = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] };

console.log('1) Gebäude anlegen weckt NUR den Gebäude-Layer');
{
    const a = snap();
    geo.addModification('BUILDING', poly, { height: 8 });
    await nextTick();
    const d = diff(a, snap());
    check(d.buildings === 1, `Gebäude-Layer 1× neu (${d.buildings})`);
    check(d.weirs === 0 && d.bridges === 0 && d.sgcCells === 0,
        'Wehre/Brücken/SGC-Zellen unberührt');
}

console.log('2) Brücke weckt Brücken-Layer UND SGC-Zellen (Pfeiler sperren Gerinnezellen)');
{
    const a = snap();
    geo.addBridge3D({ id: 'BR1', kind: 'mesh3d', footprint: [{ x: 0, y: 0 }], lattice: null, cells: [] });
    await nextTick();
    const d = diff(a, snap());
    check(d.bridges === 1, `Brücken-Layer 1× neu (${d.bridges})`);
    check(d.sgcCells === 1, 'SGC-Zellvorschau folgt (Pfeiler-Sperren)');
    check(d.buildings === 0 && d.weirs === 0, 'Gebäude/Wehre unberührt');
}

console.log('3) SGC-Kanal per push() weckt beide SGC-Vorschauen');
{
    // Der Fall, an dem die Zellvorschau vorher scheiterte: addSgcChannel ersetzt das
    // Array nicht, ein flacher Watcher auf die Referenz feuerte deshalb nicht.
    const a = snap();
    geo.addSgcChannel({ id: 'C1', polyline: [{ x: 0, y: 0, terrainZ: 0 }, { x: 9, y: 0, terrainZ: 0 }],
                        shape: 'rect', bedWidth: 2, bedMode: 'depth', bedDepth: 1, sideSlope: 0, manningN: 0.03 });
    await nextTick();
    const d = diff(a, snap());
    check(d.sgcCells === 1, `SGC-Zellvorschau 1× neu (${d.sgcCells}) — vorher: 0`);
    check(d.sgcGhost === 1, `3D-Trog-Vorschau 1× neu (${d.sgcGhost})`);
    check(d.buildings === 0 && d.bridges === 0, 'übrige Layer unberührt');
}

console.log('4) Kanal bearbeiten (In-Place) weckt die Vorschauen ebenfalls');
{
    const a = snap();
    geo.updateSgcChannel('C1', { bedWidth: 5 });
    await nextTick();
    const d = diff(a, snap());
    check(d.sgcCells === 1 && d.sgcGhost === 1, 'beide Vorschauen folgen der In-Place-Änderung');
}

console.log('5) Grenze weckt Gebäude-Footprints UND Hydraulik-Pfeile');
{
    const a = snap();
    geo.addBoundary({ type: 'Feature', id: 'BD1', properties: {}, geometry: poly });
    await nextTick();
    const d = diff(a, snap());
    check(d.buildings === 1, 'Footprint-Layer folgt');
    check(d.hydraulics === 1, 'Hydraulik-Pfeile folgen');
}

console.log('6) Eigenschaft in-place ändern (Gebäudehöhe) weckt den Layer');
{
    const id = geo.modifications[0].id;
    const a = snap();
    geo.updateFeatureProperty(id, 'height', 33);
    await nextTick();
    const d = diff(a, snap());
    check(d.buildings === 1, 'Gebäude-Layer folgt der In-Place-Eigenschaftsänderung');
}

console.log('7) Undo-Restore (Zuweisung am Store vorbei) weckt ALLE Layer');
{
    const a = snap();
    geo.modifications = [];          // wie restoreGeo: direkte Zuweisung
    geo.touch();                     // …gefolgt vom Sammel-Signal
    await nextTick();
    const d = diff(a, snap());
    check(d.buildings === 1 && d.weirs === 1 && d.bridges === 1 && d.sgcCells === 1,
        'jeder Layer genau 1× neu');
}

console.log('8) Ohne Änderung passiert nichts');
{
    const a = snap();
    geo.removeBoundary('gibt-es-nicht');
    geo.addBridgeBatch([]);
    await nextTick();
    const d = diff(a, snap());
    check(Object.values(d).every(v => v === 0), 'kein Layer unnötig neu gebaut');
}

console.log(failed === 0 ? '\n✅ LAYER-REAKTIVITÄT BESTANDEN' : `\n❌ ${failed} FEHLER`);
process.exit(failed === 0 ? 0 : 1);
