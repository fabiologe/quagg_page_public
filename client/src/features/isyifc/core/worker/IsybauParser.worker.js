import { XMLParser } from 'fast-xml-parser';
import { parseIsyValue } from '../logic/UnitMatrix.js';

/**
 * IsybauParser.worker.js
 * 
 * Hybrid Parser:
 * 1. Core Data: Normalized Geometry & Type info (fast 3D).
 * 2. Meta Data: Raw Object dump (rich UI info).
 */

self.onmessage = async (e) => {
    const { xmlContent, fileName } = e.data;

    try {
        const start = performance.now();
        console.log(`[Worker] Parsing ${fileName} (${xmlContent.length} bytes)...`);

        // 1. Configure Parser
        const parser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: "@_",
            processEntities: false,
            parseTagValue: false,
            removeNsp: true, // <--- CRITICAL FIX: Ignore "isy:" prefixes
            isArray: (name) => {
                return name === 'AbwassertechnischeAnlage' || name === 'Punkt';
            }
        });

        const jsonObj = parser.parse(xmlContent);

        console.log("[Worker Debug] Top Keys:", Object.keys(jsonObj));
        if (jsonObj.Datenkollektive) console.log("[Worker Debug] Datenkollektive Keys:", Object.keys(jsonObj.Datenkollektive));
        // Deep search helper
        const findKey = (obj, key) => {
            if (!obj || typeof obj !== 'object') return null;
            if (key in obj) return obj[key];
            for (const k of Object.keys(obj)) {
                const res = findKey(obj[k], key);
                if (res) return res;
            }
            return null;
        };

        // Aggressive Search for Stammdatenkollektiv
        let stammdaten = jsonObj.Datenkollektive?.Kollektiv?.find?.(k => k.Stammdatenkollektiv)?.Stammdatenkollektiv;
        if (!stammdaten) stammdaten = jsonObj.Stammdatenkollektiv || jsonObj.Datenkollektive?.Stammdatenkollektiv;
        if (!stammdaten) {
            // Try ignoring explicit structure and just find the object
            const found = findKey(jsonObj, 'Stammdatenkollektiv');
            if (found) {
                console.log("[Worker Debug] Found Stammdatenkollektiv via deep search");
                stammdaten = found;
            }
        }

        if (!stammdaten?.AbwassertechnischeAnlage) {
            // Maybe AbwassertechnischeAnlage is direct?
            const direct = findKey(jsonObj, 'AbwassertechnischeAnlage');
            if (direct) {
                console.log("[Worker Debug] Found AbwassertechnischeAnlage via deep search");
                // Mock wrapper
                stammdaten = { AbwassertechnischeAnlage: direct };
            }
        }

        if (!stammdaten?.AbwassertechnischeAnlage) {
            console.error("[Worker Error] Structure Dump (Head):", JSON.stringify(jsonObj).slice(0, 500));
            throw new Error("No 'AbwassertechnischeAnlage' found in XML. Check Console.");
        }

        const rawNodes = [];
        const rawEdges = [];
        const objects = stammdaten.AbwassertechnischeAnlage;

        // Helper to safely clone and remove heavy arrays for 'raw' metadata
        const getMeta = (obj) => {
            const clone = { ...obj };
            if (clone.Geometrie) delete clone.Geometrie; // Remove heavy point arrays
            return clone;
        };

        for (const obj of objects) {
            const id = obj.Objektbezeichnung;
            const objArt = parseInt(obj.Objektart);

            // --- NODES (Objektart 2) ---
            if (objArt === 2) {
                const kType = parseInt(obj.Knoten?.KnotenTyp);

                // CORE GEOMETRY EXTRACTION
                const geo = {
                    shape: 'Cylinder', // Default
                    width: 1.0,
                    length: 1.0,
                    depth: 0,
                    coverZ: null
                };

                // 1. Schacht (Type 0)
                if (kType === 0) {
                    const schacht = obj.Knoten?.Schacht;
                    const aufbau = schacht?.Aufbau;
                    const deckel = schacht?.Deckel;

                    // Helper map
                    const formMap = (f) => (f && (f.includes('E') || f.includes('Q'))) ? 'Box' : 'Cylinder';

                    geo.shape = formMap(aufbau?.Aufbauform || deckel?.Deckelform);
                    geo.width = parseIsyValue('LaengeAufbau', aufbau?.LaengeAufbau) || 1.0;
                    // Square fallback if width missing
                    geo.length = parseIsyValue('BreiteAufbau', aufbau?.BreiteAufbau) || geo.width;

                    geo.depth = parseIsyValue('Schachttiefe', schacht?.Schachttiefe);

                    if (deckel?.Punkthoehe) {
                        geo.coverZ = parseIsyValue('Punkthoehe', deckel.Punkthoehe);
                    }
                }
                // 2. Connector (Type 1)
                else if (kType === 1) {
                    geo.shape = 'Box';
                    geo.width = 0.2;
                    geo.length = 0.2;
                }
                // 3. Structure (Type 2) - Bounding Box Search
                else if (kType === 2) {
                    geo.shape = 'Box';
                    const bau = obj.Knoten?.Bauwerk;
                    let l = 0, b = 0;

                    const check = (sub) => {
                        if (!sub) return;
                        const sl = parseIsyValue('MaxLaenge', sub.MaxLaenge || sub.Laenge);
                        const sb = parseIsyValue('MaxBreite', sub.MaxBreite || sub.Breite);
                        if (sl > l) l = sl;
                        if (sb > b) b = sb;
                    };

                    if (bau) {
                        check(bau.Pumpwerk);
                        check(bau.Becken);
                        check(bau.Auslaufbauwerk);
                        check(bau.Versickerungsanlage?.MuldeTeich);
                        check(bau.Regenueberlauf); // Etc.
                    }

                    geo.width = b || 5.0;
                    geo.length = l || 5.0;
                }

                // Points Extraction (UnitMatrix Normalization happens in logic/GeometryUtils? 
                // Wait, User said "Do not normalize coordinates yet" in PREVIOUS prompt, 
                // but NEW prompt says "Extract and normalize core fields".
                // Points are complex. Let's pass RAW points, but Normalized OBJECT DIMENSIONS.
                // Or normalize points here? 
                // FixData V3 uses `parseNodeGeometry` which calls `parseIsyValue`.
                // So passing RAW points is fine. The GeometryUtils will handle it.
                // We just need to ensure `IsyRawNode` has the normalized dimensions in `geometry`.

                const geoPoints = obj.Geometrie?.Geometriedaten?.Knoten?.Punkt || [];
                const mappedPoints = geoPoints.map(p => ({
                    attr: p.PunktattributAbwasser,
                    x: p.Rechtswert || p.Y,
                    y: p.Hochwert || p.X,
                    z: p.Punkthoehe || p.Z
                }));

                rawNodes.push({
                    id: id,
                    kType: kType,
                    // Core Geometry (Normalized)
                    geometry: geo,
                    // Core Attributes
                    attributes: {
                        material: obj.Knoten?.Schacht?.Aufbau?.MaterialAufbau,
                        subType: obj.Knoten?.Anschlusspunkt?.Punktkennung || obj.Knoten?.Bauwerk?.Bauwerkstyp
                    },
                    // Points (Raw for GeometryUtils)
                    points: mappedPoints,
                    // Full Metadata
                    raw: getMeta(obj)
                });
            }

            // --- EDGES (Objektart 1) ---
            else if (objArt === 1) {
                const kante = obj.Kante; // Or HydraulikObjekt logic? Usually Kante is in Stammdaten.
                const profil = kante?.Profil;

                rawEdges.push({
                    id: id,
                    source: obj.Verlauf?.Anfangsknoten || obj.Verlauf?.StartKnoten,
                    target: obj.Verlauf?.Endknoten || obj.Verlauf?.ZielKnoten,

                    // Core Profile (Normalized)
                    profile: {
                        typeCode: profil?.Profilart, // Keep code, map later? User said "Extract Profilart". FixData maps it.
                        width: parseIsyValue('ProfilBreite', profil?.Profilbreite),
                        height: parseIsyValue('ProfilHoehe', profil?.Profilhoehe),
                    },
                    material: kante?.Material || obj.Material,
                    // Raw Metadata
                    raw: getMeta(obj)
                });
            }
        }

        const end = performance.now();
        console.log(`[Worker] Hybrid Parse Done. Nodes: ${rawNodes.length}, Edges: ${rawEdges.length}`);

        self.postMessage({
            success: true,
            data: {
                rawNodes,
                rawEdges,
                stats: {
                    count: rawNodes.length + rawEdges.length,
                    processingTime: end - start
                }
            }
        });

    } catch (err) {
        console.error("[Worker] Parse Error:", err);
        self.postMessage({ success: false, error: err.message });
    }
};
