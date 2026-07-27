// Test des format-agnostischen Entwässerungsnetz-Imports (ein Button, mehrere Formate).
//   node test_network_import.mjs
// Node-frei von DOM: registriert einen Fake-ISYBAU-Parser; der echte DOM-Parser wird in
// der App verdrahtet (isybauImporter.js). ifcImporter.js ist Node-sicher (nur Registry).

import { detectFormat } from '../services/geometry/import/detectFormat.js';
import { importDrainageNetwork, registerNetworkImporter, hasNetworkImporter } from '../services/geometry/import/importDrainageNetwork.js';
import '../services/geometry/import/ifcImporter.js';   // registriert 'ifc' (Platzhalter), Node-sicher

let fails = 0;
const ok = (c, m) => { if (c) console.log('  ✅ ' + m); else { console.error('  ❌ ' + m); fails++; } };

console.log('1) detectFormat');
ok(detectFormat('netz.xml', '<Stammdatenkollektiv>') === 'isybau-xml', '.xml + ISYBAU-Inhalt → isybau-xml');
ok(detectFormat('modell.ifc', '') === 'ifc', '.ifc → ifc');
ok(detectFormat('x.xml', 'ISO-10303-21; IFCPROJECT') === 'ifc', 'ifcXML-Inhalt in .xml → ifc');
ok(detectFormat('', 'FILE_SCHEMA((\'IFC4\'))') === 'ifc', 'STEP-Header → ifc');
ok(detectFormat('', '<AbwassertechnischeAnlage>') === 'isybau-xml', 'ISYBAU-Inhalt ohne Endung → isybau-xml');
ok(detectFormat('x.dat', 'hallo') === 'unknown', 'unbekannt → unknown');

console.log('2) Import-Routing (Fake-ISYBAU-Parser)');
registerNetworkImporter('isybau-xml', () => ({
    nodes: [
        { id: 'K1', x: 10, y: 10, z: 8, coverZ: 10, isManhole: true, type: 'Schacht' },
        { id: 'K2', x: 60, y: 10, z: 7.5, coverZ: 9, isManhole: true, type: 'Schacht' },
        { id: 'AUS', x: 90, y: 10, z: 7, coverZ: 8, is_sink: true, type: 'Auslaufbauwerk' },
    ],
    edges: [
        { id: 'H1', fromNodeId: 'K1', toNodeId: 'K2', length: 50, roughness: 80, profile: { type: 0, height: 0.3 } },
        { id: 'H2', fromNodeId: 'K2', toNodeId: 'AUS', length: 40, roughness: 80, profile: { type: 0, height: 0.3 } },
    ],
    warnings: ['1 Sohlhöhe interpoliert'],
}));
const r = importDrainageNetwork({ name: 'netz.xml', content: '<Stammdatenkollektiv/>' });
ok(r.ok && r.format === 'isybau-xml', 'ISYBAU-Import ok');
ok(r.model.nodeList.length === 3 && r.model.linkList.length === 2, '3 Knoten + 2 Haltungen im Modell');
ok(r.model.nodes.get('AUS').role === 'outfall', 'Auslaufbauwerk → outfall');
ok(r.model.neighbors('K2').includes('AUS'), 'Topologie K2→AUS');
ok(r.warnings.includes('1 Sohlhöhe interpoliert'), 'Parser-Warnungen durchgereicht');

console.log('2b) kantenTyp Rinne/Gerinne → conveyance:open (Regression: numerischer Code, kein String)');
{
    registerNetworkImporter('isybau-xml', () => ({
        nodes: [
            { id: 'K1', x: 0, y: 0, z: 5, coverZ: 6 },
            { id: 'K2', x: 10, y: 0, z: 4.8, coverZ: 5.8 },
            { id: 'K3', x: 20, y: 0, z: 4.5, coverZ: 5.5 },
        ],
        edges: [
            { id: 'H1', fromNodeId: 'K1', toNodeId: 'K2', kantenTyp: 0, profile: { type: 0, height: 0.3 } },
            { id: 'RI1', fromNodeId: 'K2', toNodeId: 'K3', kantenTyp: 2, profile: { type: 5, shape: 'rect', width: 1, height: 0.5 } },
        ],
        warnings: [],
    }));
    const r2 = importDrainageNetwork({ name: 'netz2.xml', content: '<Stammdatenkollektiv/>' });
    const haltung = r2.model.linkList.find(l => l.id === 'H1');
    const rinne = r2.model.linkList.find(l => l.id === 'RI1');
    ok(haltung.conveyance === 'covered', 'kantenTyp=0 (Haltung) → conveyance:covered');
    ok(rinne.conveyance === 'open', 'kantenTyp=2 (Rinne) → conveyance:open (vorher: nie erkannt, da numerisch statt String)');
    ok(rinne.geom.profile.shape === 'rect', 'Profilform (rect) wird durchgereicht');
}

console.log('3) IFC-Platzhalter + Unbekannt');
ok(hasNetworkImporter('ifc'), 'IFC ist registriert (Button nimmt IFC an)');
const ifc = importDrainageNetwork({ name: 'm.ifc', content: 'ISO-10303-21;' });
ok(ifc.ok === false && ifc.warnings.some(w => w.includes('IFC-Import folgt')), 'IFC → freundlicher "folgt"-Hinweis');
const unk = importDrainageNetwork({ name: 'x.dat', content: 'hallo' });
ok(unk.ok === false && unk.warnings.some(w => w.includes('nicht (noch) unterstützt') || w.includes('nicht')), 'unbekanntes Format → abgelehnt');

console.log(fails === 0 ? '\n✅ NETWORK-IMPORT BESTANDEN' : `\n❌ ${fails} Fehler`);
process.exit(fails === 0 ? 0 : 1);
