import { XMLParser } from 'fast-xml-parser';

/**
 * IsybauParser.worker.js
 * 
 * MASTER AUDIT IMPLEMENTATION
 * Porting robust logic from Python xml_parser to JS.
 * STRICTLY categorizes into: Schacht, Anschlusspunkt, Bauwerk, Haltung.
 */

// --- HELPERS ---

const parseGermanFloat = (val) => {
    if (val === undefined || val === null) return null;
    if (typeof val === 'number') return val;
    // Replace German decimal comma with dot
    const str = String(val).replace(',', '.').trim();
    if (str === '') return null;
    const num = parseFloat(str);
    return isNaN(num) ? null : num;
};

// Heuristic Unit Normalization (mm -> m)
const normalizeUnit = (val) => {
    const n = parseGermanFloat(val);
    if (n === null) return 0;
    // Heuristic: If > 50, assume mm or cm. 
    // Pipes are usually < 4.0m diameter.
    if (Math.abs(n) > 50) return n / 1000.0;
    return n;
};

// Helper: Get array of points regardless of XML structure (single obj vs array)
const extractPoints = (geoBlock) => {
    if (!geoBlock) return [];
    // Path: Geometrie -> Geometriedaten -> Knoten -> Punkt
    // Or just check recursively? The standard path is consistent usually.
    const pts = geoBlock.Geometrie?.Geometriedaten?.Knoten?.Punkt;
    if (!pts) return [];
    return Array.isArray(pts) ? pts : [pts];
};

self.onmessage = async (e) => {
    const { xmlContent, fileName } = e.data;

    try {
        const start = performance.now();
        console.log(`[Worker] Parsing ${fileName} with MASTER AUDIT logic...`);

        // 1. Configure Parser (Remove Namespaces is CRITICAL)
        const parser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: "@_",
            processEntities: false,
            parseTagValue: false,
            removeNsp: true,
            isArray: (name) => {
                // Ensure list-like elements are always arrays
                return [
                    'AbwassertechnischeAnlage',
                    'Punkt',
                    'Auftrag',
                    'Segment'
                ].includes(name);
            }
        });

        const jsonObj = parser.parse(xmlContent);

        // 2. LOCATE DATA ROOT
        // Robust search for Stammdatenkollektiv
        let objects = jsonObj.Datenkollektive?.Kollektiv?.find?.(k => k.Stammdatenkollektiv)?.Stammdatenkollektiv?.AbwassertechnischeAnlage;

        // Fallback search
        if (!objects) {
            const findKey = (obj, key) => {
                if (!obj || typeof obj !== 'object') return null;
                if (key in obj) return obj[key];
                for (const k of Object.keys(obj)) {
                    const res = findKey(obj[k], key);
                    if (res) return res;
                }
                return null;
            };
            const col = findKey(jsonObj, 'Stammdatenkollektiv');
            if (col) objects = col.AbwassertechnischeAnlage;
        }

        if (!objects) throw new Error("No 'AbwassertechnischeAnlage' found.");
        if (!Array.isArray(objects)) objects = [objects];

        // 3. STORAGE
        const nodes = [];
        const edges = [];
        const stats = { Schacht: 0, AP: 0, Bauwerk: 0, Haltung: 0, Ignored: 0 };

        console.log(`[Worker] Iterating ${objects.length} objects...`);

        // 4. MAIN LOOP
        for (const obj of objects) {
            const id = obj.Objektbezeichnung;
            const objArt = parseInt(obj.Objektart);

            // --- EDGE (Objektart 1) ---
            if (objArt === 1) {
                stats.Haltung++;
                const kante = obj.Kante || {};
                const profil = kante.Profil || {};
                const pCode = parseGermanFloat(profil.Profilart) || 0;

                // Shape Code Mapping
                const shapeMap = {
                    0: 'Circle', 1: 'Circle', 2: 'Circle', 4: 'Circle',
                    3: 'Rect', 5: 'Rect',
                    8: 'Trapez', 9: 'Trapez'
                };

                // CRITICAL UNIT CHECK
                const w = normalizeUnit(profil.Profilbreite);
                const h = normalizeUnit(profil.Profilhoehe) || w;

                edges.push({
                    id: id,
                    category: 'Haltung',
                    // Correct Mapping based on 6178_A64 XML:
                    // Kante.KnotenZulauf -> Source
                    // Kante.KnotenAblauf -> Target
                    source: kante.KnotenZulauf || obj.Verlauf?.Anfangsknoten || obj.Verlauf?.StartKnoten,
                    target: kante.KnotenAblauf || obj.Verlauf?.Endknoten || obj.Verlauf?.ZielKnoten,
                    shape: {
                        type: shapeMap[pCode] || 'Circle',
                        dim1: w,
                        dim2: h,
                        profileCode: pCode
                    },
                    meta: {
                        material: kante.Material || obj.Material || 'Beton',
                        baujahr: parseGermanFloat(obj.Baujahr)
                    }
                });
            }

            // --- NODE (Objektart 2) ---
            else if (objArt === 2) {
                const kType = parseInt(obj.Knoten?.KnotenTyp); // G300
                const points = extractPoints(obj);

                // Helper to find coords
                const getCoord = (pt) => ({
                    x: parseGermanFloat(pt?.Rechtswert || pt?.Y),
                    y: parseGermanFloat(pt?.Hochwert || pt?.X),
                    z: parseGermanFloat(pt?.Punkthoehe || pt?.Z)
                });

                // A. SCHACHT (Manhole)
                if (kType === 0) {
                    stats.Schacht++;
                    const schacht = obj.Knoten?.Schacht || {};
                    const aufbau = schacht.Aufbau || {};
                    const deckel = schacht.Deckel || {};

                    // Geometrie Logic: Scan for DMP / SMP
                    let dmp = points.find(p => p.PunktattributAbwasser === 'DMP');
                    let smp = points.find(p => p.PunktattributAbwasser === 'SMP');

                    // Fallback to first point if DMP missing
                    if (!dmp && points.length > 0) dmp = points[0];

                    const cDMP = getCoord(dmp);
                    let zDeckel = cDMP.z;
                    let zSohle = getCoord(smp).z;

                    // Fallback Logic: Calc Z using Depth
                    const depth = parseGermanFloat(schacht.Schachttiefe);

                    // If DMP missing but Deckel attribute present
                    if (zDeckel === null && deckel.Punkthoehe) {
                        zDeckel = parseGermanFloat(deckel.Punkthoehe);
                    }

                    if (zDeckel !== null && zSohle === null && depth) {
                        zSohle = zDeckel - depth;
                    }
                    if (zSohle !== null && zDeckel === null && depth) {
                        zDeckel = zSohle + depth;
                    }

                    // Shape Logic
                    const form = aufbau.Aufbauform || 'R';
                    const isBox = (form.includes('E') || form.includes('Q'));
                    const dim1 = normalizeUnit(aufbau.LaengeAufbau) || 1.0;
                    const dim2 = normalizeUnit(aufbau.BreiteAufbau) || dim1;

                    nodes.push({
                        id: id,
                        category: 'Schacht',
                        coords: {
                            x: cDMP.x,
                            y: cDMP.y,
                            z_deckel: zDeckel,
                            z_sohle: zSohle
                        },
                        shape: {
                            type: isBox ? 'Box' : 'Cylinder',
                            dim1: dim1,
                            dim2: dim2
                        },
                        meta: {
                            material: aufbau.MaterialAufbau,
                            baujahr: parseGermanFloat(obj.Baujahr)
                        }
                    });
                }

                // B. ANSCHLUSSPUNKT (Connector)
                else if (kType === 1) {
                    stats.AP++;
                    const ap = obj.Knoten?.Anschlusspunkt || {};
                    const pt = points[0]; // Take first available
                    const c = getCoord(pt);

                    nodes.push({
                        id: id,
                        category: 'Anschlusspunkt',
                        coords: {
                            x: c.x,
                            y: c.y,
                            z_deckel: c.z,
                            z_sohle: c.z ? c.z - 0.5 : null
                        },
                        shape: { type: 'Box', dim1: 0.2, dim2: 0.2 },
                        meta: {
                            kennung: ap.Punktkennung, // RR, SE, GA, NN (Unknown)...
                            subType: ap.Punktkennung
                        }
                    });
                }

                // C. BAUWERK (Structure)
                else if (kType === 2) {
                    stats.Bauwerk++;
                    const bw = obj.Knoten?.Bauwerk || {};
                    const bwType = parseInt(bw.Bauwerkstyp); // G400

                    let l = 0, b = 0, h = 0;

                    // Polymorphic Dimension Scan
                    const check = (tag, lenField, widField) => {
                        if (!tag) return;
                        const tObj = Array.isArray(tag) ? tag[0] : tag; // Handle array quirk
                        const valL = normalizeUnit(tObj[lenField]);
                        const valB = normalizeUnit(tObj[widField]);
                        if (valL) l = Math.max(l, valL);
                        if (valB) b = Math.max(b, valB);
                    };

                    // Specific Rules per Audit
                    // 1=Pumpwerk: MaxLaenge, MaxBreite
                    if (bwType === 1) check(bw.Pumpwerk, 'MaxLaenge', 'MaxBreite');
                    // 2=Becken: MaxLaenge, MaxBreite
                    if (bwType === 2) check(bw.Becken, 'MaxLaenge', 'MaxBreite');
                    // 5=Auslauf: Laenge, Breite (Note name difference)
                    if (bwType === 5) check(bw.Auslaufbauwerk, 'Laenge', 'Breite');
                    // 7=Wehr: Oeffnungsweite as Width?
                    if (bwType === 7) check(bw.Wehr_Ueberlauf, 'Oeffnungsweite', 'Oeffnungsweite');
                    // 12=Versickerung -> MuldeTeich
                    if (bwType === 12) check(bw.Versickerungsanlage?.MuldeTeich, 'Laenge', 'Breite');

                    // Defaults
                    if (!l) l = 5.0;
                    if (!b) b = 5.0;

                    // Coords
                    const c = getCoord(points[0]);

                    // Map Bauwerk Type Code to String
                    const bwTypeMap = {
                        1: 'Pumpwerk', 2: 'Becken', 3: 'Behandlungsanlage', 4: 'Ueberlauf',
                        5: 'Auslauf', 6: 'Einlauf', 7: 'Wehr', 8: 'Schieber',
                        9: 'Rechen', 10: 'Sieb', 11: 'Filter', 12: 'Versickerung',
                        13: 'Pumpensumpf', 14: 'Drossel', 15: 'Sonstiges'
                    };

                    nodes.push({
                        id: id,
                        category: 'Bauwerk',
                        coords: {
                            x: c.x,
                            y: c.y,
                            z_deckel: c.z,
                            z_sohle: c.z ? c.z - 3.0 : null // Default depth
                        },
                        shape: {
                            type: 'Box',
                            dim1: l,
                            dim2: b
                        },
                        meta: {
                            subType: bwTypeMap[bwType] || 'Bauwerk', // Mapped String
                            funktion: bw.Bauwerksfunktion
                        }
                    });
                }
                else {
                    stats.Ignored++;
                }

            } else {
                stats.Ignored++;
            }
        }

        const end = performance.now();
        console.log(`[Worker] Done. Stats:`, stats);
        console.log(`[Worker] FINAL COUNTS: Schächte: ${stats.Schacht} | Anschlüsse: ${stats.AP} | Bauwerke: ${stats.Bauwerk} | Haltungen: ${stats.Haltung}`);
        console.log(`[Worker] Processing Time: ${(end - start).toFixed(2)}ms`);

        self.postMessage({
            success: true,
            data: {
                nodes,
                edges,
                stats: { counts: stats, time: end - start }
            }
        });

    } catch (err) {
        console.error("[Worker] CRASH:", err);
        self.postMessage({ success: false, error: err.message });
    }
};
