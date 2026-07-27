// Unified Geometry Engine — Adapter (G0). Speisen bestehende Datenformen in das
// NetworkModel, ohne die alten Stores zu brechen. Migration statt Big-Bang.

import { NetworkModel } from './NetworkModel.js';

const roleFromNodeType = (t) => {
    const s = String(t ?? '').toLowerCase();
    if (s.includes('sink') || s.includes('auslauf') || s.includes('outfall')) return 'outfall';
    if (s.includes('inlet') || s.includes('einlauf') || s.includes('ablauf')) return 'inlet';
    return 'manhole';
};

// (fromGeoStore entfernt 2026-07 — der Legacy-geoStore-Pfad nodes/culvertLinks existiert nicht mehr.)

/**
 * ISYBAU-/Sewer-Domäne (reiche Node/Edge-Objekte) → NetworkModel.
 * node: {id,x,y,z=invert,coverZ,depth,isManhole,canOverflow,type,bauwerkstyp,volume,constantInflow}
 * edge: {id,fromNodeId,toNodeId,length,roughness=kSt,z1,z2,profile:{type,height,width},kantenTyp}
 */
export function fromSewerNodesEdges(nodes = [], edges = [], model = new NetworkModel()) {
    for (const n of nodes) {
        model.addNode({
            id: n.id, x: n.x, y: n.y,
            invert: n.z ?? n.invert ?? n.bottom_level ?? 0,
            rim: n.coverZ ?? n.cover_level ?? n.rim ?? n.z ?? 0,
            role: n.is_sink ? 'outfall' : roleFromNodeType(n.type),
            attrs: {
                type: n.type, isManhole: n.isManhole ?? true, canOverflow: n.canOverflow ?? true,
                bauwerkstyp: n.bauwerkstyp ?? null, volume: n.volume ?? 0,
                constantInflow: n.constantInflow ?? 0,
            },
        });
    }
    // ISYBAU-Konvention: eine Haltung trägt oft die Objektbezeichnung ihres Oberlieger-
    // Knotens → Kante-ID kollidiert mit Knoten-ID (Kante BW001 = BW001→BW002). Eine
    // kollidierende Link-ID würde in Store/Tabelle Knoten UND Haltung zugleich selektieren
    // und die Haltung als Schacht anzeigen. Darum Link-IDs global eindeutig machen (die
    // Endpunkt-Referenzen fromNodeId/toNodeId bleiben unverändert → Topologie intakt).
    const usedIds = new Set(model.nodeList.map(n => n.id));
    for (const e of edges) {
        // kantenTyp Rinne(2)/Gerinne(3) → offenes Gerinne (2D/SGC), sonst Rohr (SWMM 1D).
        // QUAGG-FIX: kantenTyp ist der numerische ISYBAU-Code (xmlParser.js: kantenTypRaw,
        // 0=Haltung/1=Leitung/2=Rinne/3=Gerinne), kein String — ein String.includes()-Check
        // ("rinne"/"gerinne") konnte hier NIE zutreffen. Jede importierte Rinne/Gerinne wurde
        // dadurch bisher fälschlich als conveyance:'covered' (Rohr) klassifiziert.
        const ktNum = Number(e.kantenTyp);
        const ktStr = String(e.kantenTyp ?? '').toLowerCase();
        const open = ktNum === 2 || ktNum === 3 || ktStr.includes('rinne') || ktStr.includes('gerinne');
        let lid = String(e.id ?? `H_${e.fromNodeId}_${e.toNodeId}`);
        if (usedIds.has(lid)) lid = `${lid}_${e.toNodeId ?? ''}`;   // ASCII-sicher (SWMM-tauglich)
        while (usedIds.has(lid)) lid = `${lid}_`;
        usedIds.add(lid);
        model.addLink({
            id: lid, fromNodeId: e.fromNodeId, toNodeId: e.toNodeId,
            role: open ? 'channel' : 'conduit',
            conveyance: open ? 'open' : 'covered',
            profile: e.profile ?? { shape: 'circular', height: 0.3 },
            length: e.length ?? null,
            attrs: { z1: e.z1, z2: e.z2, kSt: e.roughness, material: e.material },
        });
    }
    return model;
}
