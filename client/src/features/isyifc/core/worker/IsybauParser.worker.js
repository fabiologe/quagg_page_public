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

// Context-Aware Normalization
const normalizePipeDim = (val) => {
    const n = parseGermanFloat(val);
    if (n === null) return 0;
    // Pipes/Manhole Comps are rarely > 10m. If > 10, assume mm.
    if (Math.abs(n) > 10) return n / 1000.0;
    return n;
};

const normalizeDepth = (val) => {
    const n = parseGermanFloat(val);
    if (n === null) return null; // Keep null if missing
    // Depths can be 20m. But 20000mm = 20m.
    // Cutoff: 100m. If > 100, must be mm.
    if (Math.abs(n) > 100) return n / 1000.0;
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
            const id = String(obj.Objektbezeichnung).trim();
            const objArt = parseInt(obj.Objektart);

            // STATUS PARSING (Objektstatus vs Status)
            let status = parseInt(obj.Objektstatus || obj.Status);
            if (isNaN(status)) status = 0;

            // Heuristic: IDs starting with "FK" (Fiktiver Knoten) -> Status 2
            if (status === 0 && (id.startsWith('FK') || id.startsWith('VIRT'))) {
                status = 2;
            }

            // --- EDGE (Objektart 1) ---
            // --- EDGE (Objektart 1) ---
            if (objArt === 1) {
                // 1. SUB-TYPE DETECTION
                let edgeData = null;
                let edgeType = 'Haltung';

                if (obj.Haltung) { edgeData = obj.Haltung; edgeType = 'Haltung'; }
                else if (obj.Leitung) { edgeData = obj.Leitung; edgeType = 'Leitung'; }
                else if (obj.Rinne) { edgeData = obj.Rinne; edgeType = 'Rinne'; }
                else if (obj.Gerinne) { edgeData = obj.Gerinne; edgeType = 'Gerinne'; }
                else {
                    // Fallback for older formats
                    edgeData = obj.Kante || {};
                    edgeType = 'Unbekannt';
                }

                stats.Haltung++; // We count all edges as "Haltungen" in stats for now

                // 2. DATA POINTERS
                // Data is nested inside the subtype tag!
                const verlauf = edgeData.Verlauf || {};
                const profil = edgeData.Profil || {};
                const material = edgeData.Material || obj.Material; // Fallback to main

                // 3. TOPOLOGY (Connectivity)
                // "von" -> Verlauf.Anfangsknoten (Priority) OR Verlauf.StartKnoten
                // "bis" -> Verlauf.Endknoten (Priority) OR Verlauf.ZielKnoten
                // Safely extract and trim
                // Safely extract and trim
                const getVal = (v) => v ? String(v).trim() : null;

                let src = getVal(verlauf.Anfangsknoten || verlauf.StartKnoten);
                let tgt = getVal(verlauf.Endknoten || verlauf.ZielKnoten);

                // Fallback: Check Direct Properties
                if (!src) src = getVal(edgeData.KnotenZulauf);
                if (!tgt) tgt = getVal(edgeData.KnotenAblauf);

                if (!src || !tgt) {
                    // DEBUG: Inspect structure of failing edge
                    console.warn(`[Worker] Edge ${id} missing topology. Keys in edgeData:`, Object.keys(edgeData));
                }

                // 4. PROFILE LOGIC
                const pCode = parseGermanFloat(profil.Profilart) || 0;

                // Strict Unit Check (> 9 means mm -> m)
                const strictNormalize = (val) => {
                    const n = parseGermanFloat(val);
                    if (n === null) return null;
                    if (Math.abs(n) > 9) return n / 1000.0;
                    return n;
                };

                const w = strictNormalize(profil.Profilbreite) || 0;
                const h = strictNormalize(profil.Profilhoehe) || w; // Fallback Circle

                // Profile Mapping G205
                const shapeMap = {
                    0: 'Circle', 1: 'Circle', 2: 'Circle', 4: 'Circle', 23: 'Circle',
                    3: 'Rect', 5: 'Rect',
                    8: 'Trapez', 9: 'Trapez'
                };

                // Ei/Maul Fallback (Code 1, 2)
                // If only width is given, estimate height
                let finalH = h;
                if ((pCode === 1 || pCode === 2) && w > 0 && (!profil.Profilhoehe)) {
                    finalH = w * 1.5; // 3:2 Ratio assumption
                }


                // 5. GEOMETRY (Knickpunkte)
                // Path: Geometrie.Geometriedaten.Kante.Knickpunkt
                const geoKante = edgeData.Geometrie?.Geometriedaten?.Kante;
                const rawPoints = geoKante?.Knickpunkt;
                let waypoints = [];

                if (rawPoints) {
                    const kpList = Array.isArray(rawPoints) ? rawPoints : [rawPoints];
                    waypoints = kpList.map(pk => ({
                        x: parseGermanFloat(pk.Rechtswert || pk.Y),
                        y: parseGermanFloat(pk.Hochwert || pk.X),
                        z: parseGermanFloat(pk.Punkthoehe || pk.Z)
                    })).filter(p => p.x !== null && p.y !== null);
                }

                // 6. HYDRAULIC ATTRIBUTES
                // Sohlhöhen oben/unten
                // CRITICAL: Elevations (Z) can be > 9m. Do not use strictNormalize (Pipe logic).
                // Use normalizeElevation (Threshold ~8000m)
                const normalizeElevation = (val) => {
                    const n = parseGermanFloat(val);
                    if (n === null) return null;
                    // If > 8000 (Everest), assume mm.
                    if (Math.abs(n) > 8000) return n / 1000.0;
                    return n;
                };

                const zZulauf = normalizeElevation(verlauf.SohleKnotenZulauf || edgeData.SohlhoeheZulauf);
                const zAblauf = normalizeElevation(verlauf.SohleKnotenAblauf || edgeData.SohlhoeheAblauf);

                // SYSTEM TYPE (G101/Kanalart)
                // Try multiple sources: Direct 'Kanalart', 'Entwaesserungsart'
                // Values might be 'KR', 'KS', 'KM' or Codes
                const sysType = String(obj.Kanalart || obj.Entwaesserungsart || edgeData.Kanalart || '').trim();

                edges.push({
                    id: id,
                    category: edgeType, // Stores specific type now
                    source: src,
                    target: tgt,
                    shape: {
                        type: shapeMap[pCode] || 'Circle',
                        dim1: w,
                        dim2: finalH,
                        profileCode: pCode
                    },
                    geometry: {
                        waypoints: waypoints
                    },
                    meta: {
                        Status: status,
                        material: material || 'Beton',
                        baujahr: parseGermanFloat(obj.Baujahr),
                        sohleZulauf: zZulauf,
                        sohleAblauf: zAblauf,
                        kanalart: sysType // New Field
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

                    // CRITICAL: Use normalizeDepth (covers 100m cutoff)
                    const depth = normalizeDepth(schacht.Schachttiefe);

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

                    // Shape Logic (G305)
                    const form = aufbau.Aufbauform || 'R';
                    // G305: R=Run, E=Eckig, Z=Andere
                    const isBox = (form === 'E' || form === 'Q' || form.includes('Eck') || form.includes('Quad'));
                    const dim1 = normalizePipeDim(aufbau.LaengeAufbau) || 1.0;
                    const dim2 = normalizePipeDim(aufbau.BreiteAufbau) || dim1;

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
                            Status: status,
                            material: aufbau.MaterialAufbau,
                            baujahr: parseGermanFloat(obj.Baujahr),
                            kanalart: String(obj.Kanalart || obj.Entwaesserungsart || '').trim() // System Type for Nodes
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
                            Status: status,
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
                        // Use normalizePipeDim logic (threshold 10 is risky for structures > 10m)
                        // Bauwerke are large. Let's assume Meters unless > 1000? 
                        // If 20m -> 20. If 20000mm -> 20.
                        // Let's use a custom check here.
                        const rawL = parseGermanFloat(tObj[lenField]);
                        const rawB = parseGermanFloat(tObj[widField]);

                        const norm = (v) => (v && Math.abs(v) > 200) ? v / 1000.0 : v;

                        const valL = norm(rawL);
                        const valB = norm(rawB);

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
                            Status: status,
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
