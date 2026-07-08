// ISYBAU-XML-Adapter für den Entwässerungsnetz-Import. Registriert sich in der Registry;
// nutzt den bestehenden kanonischen Parser (Z-Interpolation) und normalisiert dessen
// Ausgabe auf die Sewer-Zwischenform {nodes, edges}, die fromSewerNodesEdges erwartet.
//
// (Browser-Pfad: parseIsybauXML nutzt DOMParser. Die Registry/Mapping-Logik selbst ist
// in importDrainageNetwork Node-testbar; dieser Adapter ist die App-Verdrahtung.)

import { parseIsybauXML } from '@/features/isybau/utils/xmlParser.js';
import { registerNetworkImporter } from './importDrainageNetwork.js';

const toArr = (v) => (v instanceof Map ? [...v.values()] : Array.isArray(v) ? v : []);
// ISYBAU-Profilmaße sind in mm (z. B. 600 = DN600). mm→m (kein Rohr > 10 m). Mirror isyifc.
const toMeters = (v) => { const n = Number(v); if (!Number.isFinite(n) || n <= 0) return n; return n > 10 ? n / 1000 : n; };
const normProfile = (p) => (p ? { type: p.type, height: toMeters(p.height), width: toMeters(p.width) } : p);

registerNetworkImporter('isybau-xml', (content) => {
    const parsed = parseIsybauXML(content) || {};
    const net = parsed.network ?? parsed;
    const nodes = toArr(net.nodes);   // {id,x,y,z,coverZ,depth,type,bauwerkstyp,volume,isManhole}
    const edges = toArr(net.edges).map(e => ({
        id: e.id,
        fromNodeId: e.from ?? e.fromNodeId,
        toNodeId:   e.to   ?? e.toNodeId,
        length: e.length,
        roughness: e.roughness,     // kSt
        z1: e.z1, z2: e.z2,
        profile: normProfile(e.profile),
        kantenTyp: e.kantenTyp,
        material: e.material,
    }));
    return { nodes, edges, warnings: [] };
});
