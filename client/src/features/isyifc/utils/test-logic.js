
import fs from 'fs';
import path from 'path';
import { XMLParser } from 'fast-xml-parser';
import { normalizeGraph } from '../core/worker/FixData.js';
import { parseIsyValue } from '../core/logic/UnitMatrix.js';

// Mock Worker Logic (Hybrid Extraction)
const runWorkerLogic = (xmlContent) => {
    const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: "@_",
        processEntities: false,
        parseTagValue: false,
        isArray: (name) => name === 'AbwassertechnischeAnlage' || name === 'Punkt'
    });
    const jsonObj = parser.parse(xmlContent);
    let stammdaten = jsonObj.Datenkollektive?.Kollektiv?.find(k => k.Stammdatenkollektiv)?.Stammdatenkollektiv;
    if (!stammdaten) stammdaten = jsonObj.Stammdatenkollektiv || jsonObj.Datenkollektive?.Stammdatenkollektiv;

    if (!stammdaten?.AbwassertechnischeAnlage) throw new Error("No Data");

    const rawNodes = [];
    const rawEdges = [];
    const getMeta = (obj) => { const c = { ...obj }; delete c.Geometrie; return c; };

    for (const obj of stammdaten.AbwassertechnischeAnlage) {
        const id = obj.Objektbezeichnung;
        const objArt = parseInt(obj.Objektart);

        if (objArt === 2) {
            const kType = parseInt(obj.Knoten?.KnotenTyp);
            const geo = { shape: 'Cylinder', width: 1.0, length: 1.0, depth: 0, coverZ: null };

            if (kType === 0) {
                const s = obj.Knoten?.Schacht;
                geo.width = parseIsyValue('LaengeAufbau', s?.Aufbau?.LaengeAufbau) || 1.0;
                geo.depth = parseIsyValue('Schachttiefe', s?.Schachttiefe);
                if (s?.Deckel?.Punkthoehe) geo.coverZ = parseIsyValue('Punkthoehe', s.Deckel.Punkthoehe);
            }

            const points = (obj.Geometrie?.Geometriedaten?.Knoten?.Punkt || []).map(p => ({
                attr: p.PunktattributAbwasser,
                x: p.Rechtswert || p.Y, y: p.Hochwert || p.X, z: p.Punkthoehe || p.Z
            }));

            rawNodes.push({
                id, kType, geometry: geo,
                attributes: { material: obj.Material },
                points, raw: getMeta(obj)
            });
        } else if (objArt === 1) {
            rawEdges.push({
                id, source: obj.Verlauf?.Anfangsknoten, target: obj.Verlauf?.Endknoten,
                profile: { typeCode: obj.Kante?.Profil?.Profilart, width: 0, height: 0 },
                raw: getMeta(obj)
            });
        }
    }
    return { rawNodes, rawEdges };
};

const file = path.resolve('../6178_A64-2BA_0.xml');
console.log(`Testing with file: ${file}`);
try {
    const xml = fs.readFileSync(file, 'utf8');

    // 1. Run Worker Logic
    const rawData = runWorkerLogic(xml);
    console.log(`Worker Extracted: ${rawData.rawNodes.length} nodes`);

    // 2. Run FixData Logic
    const result = normalizeGraph(rawData);
    console.log(`FixData Result: ${result.nodes.size} nodes`);

    // 3. Verify specific node
    const node = result.nodes.get('A064-Anfang');
    if (node) {
        console.log("Node A064-Anfang Geometry:", JSON.stringify(node.geometry, null, 2));
        console.log("Raw Meta:", node.data.raw?.Baujahr);
    }

} catch (e) {
    console.error(e);
}
