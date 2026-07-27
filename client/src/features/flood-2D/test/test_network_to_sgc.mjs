// Test: Netz (ISYBAU-Rinnen/-Gerinne) → SGC-Kanäle (services/geometry/networkToSgc.js).
// Prüft die Channel-Werkzeug-kompatible Konvertierung, die Flood2DSolverRunner.vue als
// dritte Quelle neben Bathymetrie-Legacy-Kanal + Channel-Werkzeug anhängt.
// Ausführen: node src/features/flood-2D/test/test_network_to_sgc.mjs   (aus client/)

import { fromSewerNodesEdges } from '../services/geometry/adapters.js';
import { toSgcChannels } from '../services/geometry/networkToSgc.js';
import { makeTerrainSampler } from '../services/geometry/terrainSample.js';

let failures = 0;
const assert = (cond, msg) => {
    if (cond) console.log(`  ✅ ${msg}`);
    else { console.error(`  ❌ ${msg}`); failures++; }
};

console.log('── nur conveyance:open wird konvertiert, covered wird ausgeschlossen ──');
{
    const model = fromSewerNodesEdges(
        [{ id: 'K1', x: 0, y: 0, z: 5 }, { id: 'K2', x: 10, y: 0, z: 4.8 }, { id: 'K3', x: 20, y: 0, z: 4.5 }],
        [
            { id: 'H1', fromNodeId: 'K1', toNodeId: 'K2', kantenTyp: 0, profile: { type: 0, height: 0.3 } },
            { id: 'RI1', fromNodeId: 'K2', toNodeId: 'K3', kantenTyp: 2, profile: { type: 5, shape: 'rect', width: 1.2 } },
        ]
    );
    const { channels, warnings } = toSgcChannels(model);
    assert(channels.length === 1, `genau 1 Kanal erzeugt (covered-Haltung ausgeschlossen), war ${channels.length}`);
    assert(channels[0].id === 'net_RI1', `Kanal-ID trägt Link-ID (net_RI1), war "${channels[0].id}"`);
    assert(channels[0].shape === 'rect', `Rechteck-Profil (Profilart 5) → shape:'rect', war "${channels[0].shape}"`);
    assert(channels[0].bedWidth === 1.2, `bedWidth aus profile.width übernommen, war ${channels[0].bedWidth}`);
    assert(warnings.length === 0, `keine Warnung für Rechteck-Kanal (keine Böschungsneigung nötig), war [${warnings}]`);
}

console.log('── Trapez MIT eigener Böschungsneigung: kein Default, keine Warnung ──');
{
    const model = fromSewerNodesEdges(
        [{ id: 'K1', x: 0, y: 0, z: 5 }, { id: 'K2', x: 10, y: 0, z: 4.8 }],
        [{ id: 'GE1', fromNodeId: 'K1', toNodeId: 'K2', kantenTyp: 3,
           profile: { type: 8, shape: 'trapezoid', width: 2.0, sideSlope: 2.0 } }]
    );
    const { channels, warnings } = toSgcChannels(model);
    assert(channels[0].shape === 'trapezoid', 'Trapez (Profilart 8) → shape:trapezoid');
    assert(channels[0].sideSlope === 2.0, `eigene Böschungsneigung 2.0 übernommen, war ${channels[0].sideSlope}`);
    assert(warnings.length === 0, `keine Warnung, wenn Böschungsneigung vorhanden war, war [${warnings}]`);
}

console.log('── Trapez OHNE Böschungsneigung: Default 1.5 + Warnung (defensives Verhalten) ──');
{
    const model = fromSewerNodesEdges(
        [{ id: 'K1', x: 0, y: 0, z: 5 }, { id: 'K2', x: 10, y: 0, z: 4.8 }],
        [{ id: 'GE2', fromNodeId: 'K1', toNodeId: 'K2', kantenTyp: 3,
           profile: { type: 9, shape: 'trapezoid', width: 1.5 } }]  // kein sideSlope im XML gefunden
    );
    const { channels, warnings } = toSgcChannels(model);
    assert(channels[0].sideSlope === 1.5, `Default-Böschungsneigung 1.5 verwendet, war ${channels[0].sideSlope}`);
    assert(warnings.some(w => w.includes('GE2') && w.includes('1.5')),
        `Warnung nennt Link-ID und Default-Wert, war [${warnings}]`);
}

console.log('── Sohlhöhen aus z1/z2 (falls gesetzt), sonst Knoten-Invert ──');
{
    const model = fromSewerNodesEdges(
        [{ id: 'K1', x: 0, y: 0, z: 5.0 }, { id: 'K2', x: 10, y: 0, z: 4.0 }],
        [{ id: 'RI2', fromNodeId: 'K1', toNodeId: 'K2', kantenTyp: 2, z1: 5.2, z2: 4.1,
           profile: { type: 5, shape: 'rect', width: 1.0 } }]
    );
    const { channels } = toSgcChannels(model);
    assert(channels[0].bedMode === 'absolute', 'bedMode:absolute (ISYBAU liefert absolute Höhen)');
    assert(channels[0].bedZStart === 5.2, `bedZStart aus z1-Offset (5.2), war ${channels[0].bedZStart}`);
    assert(channels[0].bedZEnd === 4.1, `bedZEnd aus z2-Offset (4.1), war ${channels[0].bedZEnd}`);

    // Ohne z1/z2-Offset: Fallback auf Knoten-Invert
    const model2 = fromSewerNodesEdges(
        [{ id: 'K1', x: 0, y: 0, z: 5.0 }, { id: 'K2', x: 10, y: 0, z: 4.0 }],
        [{ id: 'RI3', fromNodeId: 'K1', toNodeId: 'K2', kantenTyp: 2, profile: { type: 5, shape: 'rect', width: 1.0 } }]
    );
    const { channels: ch2 } = toSgcChannels(model2);
    assert(ch2[0].bedZStart === 5.0 && ch2[0].bedZEnd === 4.0, 'ohne z1/z2 → Knoten-Invert als Fallback');
}

console.log('── Terrain-Sampling: terrainZ aus Sampler, sonst Fallback auf Sohlhöhe ──');
{
    const ncols = 10, nrows = 10, cellsize = 1;
    const gridData = new Float32Array(ncols * nrows).fill(10.0);
    const terrain = { gridData, center: { x: (ncols - 1) * cellsize / 2, y: (nrows - 1) * cellsize / 2 }, cellsize, ncols, nrows };
    const sampler = makeTerrainSampler(terrain);

    const model = fromSewerNodesEdges(
        [{ id: 'K1', x: 2, y: 2, z: 8.0 }, { id: 'K2', x: 5, y: 2, z: 7.5 }],
        [{ id: 'RI4', fromNodeId: 'K1', toNodeId: 'K2', kantenTyp: 2, profile: { type: 5, shape: 'rect', width: 1.0 } }]
    );
    const { channels } = toSgcChannels(model, { terrainSampler: sampler });
    assert(channels[0].polyline[0].terrainZ === 10.0, `terrainZ aus Sampler (10.0), war ${channels[0].polyline[0].terrainZ}`);

    // Ohne Sampler: Fallback auf Sohlhöhe (kein Absturz, kein null)
    const { channels: chNoSampler } = toSgcChannels(model);
    assert(Number.isFinite(chNoSampler[0].polyline[0].terrainZ), 'ohne Sampler: terrainZ fällt auf Sohlhöhe zurück (endlich, kein null)');
}

console.log('── Rauheit: kSt → Manning n (gleiche Heuristik wie SwmmBuilder.js) ──');
{
    const model = fromSewerNodesEdges(
        [{ id: 'K1', x: 0, y: 0, z: 5 }, { id: 'K2', x: 10, y: 0, z: 4.8 }],
        [{ id: 'RI5', fromNodeId: 'K1', toNodeId: 'K2', kantenTyp: 2, roughness: 80, profile: { type: 5, shape: 'rect', width: 1.0 } }]
    );
    const { channels } = toSgcChannels(model);
    assert(Math.abs(channels[0].manningN - 1 / 80) < 1e-9, `kSt=80 → Manning n=1/80, war ${channels[0].manningN}`);

    // fehlende Rauheit → SGC-Standard 0.03
    const model2 = fromSewerNodesEdges(
        [{ id: 'K1', x: 0, y: 0, z: 5 }, { id: 'K2', x: 10, y: 0, z: 4.8 }],
        [{ id: 'RI6', fromNodeId: 'K1', toNodeId: 'K2', kantenTyp: 2, profile: { type: 5, shape: 'rect', width: 1.0 } }]
    );
    const { channels: ch2 } = toSgcChannels(model2);
    assert(ch2[0].manningN === 0.03, `fehlende Rauheit → SGC-Standard 0.03, war ${ch2[0].manningN}`);
}

console.log('── fehlender Endknoten: Kanal wird übersprungen + Warnung statt Absturz ──');
{
    const model = fromSewerNodesEdges(
        [{ id: 'K1', x: 0, y: 0, z: 5 }],   // K2 existiert nicht
        [{ id: 'RI7', fromNodeId: 'K1', toNodeId: 'K2', kantenTyp: 2, profile: { type: 5, shape: 'rect', width: 1.0 } }]
    );
    const { channels, warnings } = toSgcChannels(model);
    assert(channels.length === 0, 'kein Kanal erzeugt, wenn ein Endknoten fehlt');
    assert(warnings.some(w => w.includes('RI7')), `Warnung nennt die betroffene Link-ID, war [${warnings}]`);
}

console.log(failures === 0 ? '\n✅ Alle network-to-SGC-Tests bestanden.' : `\n❌ ${failures} Test(s) fehlgeschlagen.`);
process.exit(failures === 0 ? 0 : 1);
