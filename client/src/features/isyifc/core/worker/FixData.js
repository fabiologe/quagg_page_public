import { KnotenTyp, ProfilGeometrie, PunktAttribut } from '../types.js';

// FixData.js - Logic Version 2.0 (Strict & Detailed)
export const normalizeGraph = (rawData) => {
    /** @type {Map<string, import('../types.js').INode>} */
    const nodes = new Map();
    /** @type {import('../types.js').IEdge[]} */
    const edges = [];
    const stats = { nodesTotal: 0, edgesTotal: 0, badGeometryCount: 0 };
    const globalErrors = [];

    // Helper: Ensure array
    const asArray = (x) => (Array.isArray(x) ? x : (x ? [x] : []));

    // 1. Coordinate Parsing (The "Comma" Trap)
    const parseNum = (value, fallback = 0) => {
        if (value === null || value === undefined || value === '') return fallback;
        if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
        if (typeof value === 'string') {
            let clean = value.trim();
            if (!clean) return fallback;
            // German vs US format heuristic
            const lastComma = clean.lastIndexOf(',');
            const lastDot = clean.lastIndexOf('.');
            if (lastComma > lastDot) clean = clean.replace(/\./g, '').replace(',', '.');
            else clean = clean.replace(/,/g, '');
            const num = parseFloat(clean);
            return Number.isFinite(num) ? num : fallback;
        }
        return fallback;
    };

    // 3. Dimension Units (The "Giant Pipe" prevention)
    const normalizeUnit = (val, defaultVal = 1.0) => {
        let n = parseNum(val, null);
        if (n === null) return defaultVal;
        // Heuristic: If > 10, assume mm -> convert to m
        if (Math.abs(n) > 10) return n / 1000.0;
        return n;
    };

    // --- Aggregation ---
    let rawObjects = [];
    try {
        const stammdaten = rawData?.Stammdatenkollektiv || rawData?.data?.Stammdatenkollektiv;
        if (stammdaten?.AbwassertechnischeAnlage) rawObjects = rawObjects.concat(asArray(stammdaten.AbwassertechnischeAnlage));
    } catch (e) { }
    try {
        const hydro = rawData?.Hydraulikdatenkollektiv || rawData?.data?.Hydraulikdatenkollektiv;
        if (hydro?.HydraulikObjekt) rawObjects = rawObjects.concat(asArray(hydro.HydraulikObjekt));
    } catch (e) { }

    if (rawObjects.length === 0) {
        globalErrors.push("No Objects found in XML.");
        // Return empty stats/graph
        return { nodes, edges, stats, globalErrors };
    }

    // --- Processing Loop ---
    for (const obj of rawObjects) {
        const id = obj.Objektbezeichnung;
        if (!id) continue;

        try {
            // --- EDGE DETECTION ---
            const edgeCand = [obj, obj.Kante, obj.Haltung, obj.Leitung, obj.Rinne, obj.Gerinne].find(c => c && c.KnotenZulauf && c.KnotenAblauf);

            if (edgeCand) {
                stats.edgesTotal++;
                // 5. Profille Mapping (G205)
                let pData = edgeCand.Profil;
                // Fallback search
                if (!pData && obj.Kante?.Profil) pData = obj.Kante.Profil;
                if (!pData && obj.Profil) pData = obj.Profil;
                pData = pData || {};

                const pCode = parseNum(pData.Profilart, 0);
                let pType = ProfilGeometrie.Unbekannt;

                // XML 0, 1, 2, 4, 6, 7, 23 -> Circle
                if ([0, 1, 2, 4, 6, 7, 23].includes(pCode)) pType = ProfilGeometrie.Kreis;
                // XML 3, 5 -> Rect
                else if ([3, 5].includes(pCode)) pType = ProfilGeometrie.Rechteck;
                // XML 8, 9 -> Trapez
                else if ([8, 9].includes(pCode)) pType = ProfilGeometrie.Trapez;
                // Text fallback
                else if (String(pData.Profilart).toLowerCase().includes('rechteck')) pType = ProfilGeometrie.Rechteck;
                else if (String(pData.Profilart).toLowerCase().includes('trapez')) pType = ProfilGeometrie.Trapez;
                else pType = ProfilGeometrie.Kreis; // Ultimate Fallback

                // Dimensions
                const pWidth = normalizeUnit(pData.Profilbreite, 0.3);
                const pHeight = normalizeUnit(pData.Profilhoehe, 0.3);

                edges.push({
                    id: String(id),
                    sourceId: edgeCand.KnotenZulauf,
                    targetId: edgeCand.KnotenAblauf,
                    profile: {
                        type: pType,
                        width: pWidth,
                        height: pHeight,
                        diameter: pHeight // simplified
                    },
                    material: edgeCand.Material || 'Concrete',
                    warnings: []
                });
                continue;
            }

            // --- NODE DETECTION ---
            stats.nodesTotal++;
            const pts = asArray(obj.Geometrie?.Geometriedaten?.Knoten?.Punkt);
            const warnings = [];

            // 2. Manhole Z-Axis Logic
            let coverZ = null; // DMP
            let bottomZ = null; // SMP
            let realX = 0, realY = 0; // World Coords

            // Step 1: Scan Geometry
            pts.forEach(p => {
                const attr = p.PunktattributAbwasser;
                const vz = parseNum(p.Punkthoehe || p.Z, null);
                const vx = parseNum(p.Rechtswert || p.Y, 0);
                const vy = parseNum(p.Hochwert || p.X, 0);

                if (attr === PunktAttribut.DMP && vz !== null) {
                    coverZ = vz; realX = vx; realY = vy;
                } else if ((attr === PunktAttribut.SMP || attr === PunktAttribut.SBW) && vz !== null) {
                    bottomZ = vz;
                    if (!realX) { realX = vx; realY = vy; }
                } else if (vz !== null && !bottomZ) {
                    // Fallback using first z
                }
                if (!realX && vx && vy) { realX = vx; realY = vy; }
            });

            // Step 2: Check Schacht/Bauwerk Data
            let depth = 0;
            let type = 'Structure';
            let shape = 'Cylinder';
            let dim = { width: 1.0, length: 1.0 };
            let subType = null;

            if (obj.Schacht) {
                type = 'Manhole';
                depth = normalizeUnit(obj.Schacht.Schachttiefe, 0); // Convert mm->m if needed

                // Case A (Ideal): Have deckel, calculate bottom
                if (coverZ !== null && bottomZ === null && depth > 0) bottomZ = coverZ - depth;
                // Case B (Sohle only): Have bottom, calculate cover
                if (bottomZ !== null && coverZ === null && depth > 0) coverZ = bottomZ + depth;

                // Fallback defaults later
                const aufbau = obj.Schacht.Aufbau || {};
                const len = normalizeUnit(aufbau.LaengeAufbau, 1.0);
                const wid = normalizeUnit(aufbau.BreiteAufbau, len); // Default to circle
                dim = { width: wid, length: len };

                const form = obj.Schacht.Deckel?.Deckelform || aufbau.Aufbauform || 'R';
                shape = (form.includes('E') || form.includes('Q')) ? 'Box' : 'Cylinder';

            } else if (obj.Bauwerk) {
                type = 'Structure';
                shape = 'Box';

                // 4. Structure Dimensions (G400)
                let bDim = { l: 0, b: 0 };
                const check = (sub) => {
                    if (!sub) return;
                    const l = normalizeUnit(sub.MaxLaenge || sub.Laenge, 0);
                    const b = normalizeUnit(sub.MaxBreite || sub.Breite, 0);
                    if (l > bDim.l) bDim.l = l;
                    if (b > bDim.b) bDim.b = b;
                };

                check(obj.Bauwerk.Pumpwerk);
                check(obj.Bauwerk.Becken);
                check(obj.Bauwerk.Auslaufbauwerk);
                check(obj.Bauwerk.Versickerungsanlage?.MuldeTeich);

                // Fallback 5x5m
                dim.width = bDim.b || 5.0;
                dim.length = bDim.l || 5.0;

            } else if (obj.Anschlusspunkt) {
                type = 'Connector';
                shape = 'Box';
                dim = { width: 0.2, length: 0.2 };
                subType = obj.Anschlusspunkt.Punktkennung ? 'RR' : null;
            }

            // Case C (Missing Z)
            if (bottomZ === null && coverZ === null) {
                bottomZ = 0;
                coverZ = 2.5;
                warnings.push("Missing Elevation - Used Defaults");
                stats.badGeometryCount++;
            } else if (bottomZ === null) {
                bottomZ = coverZ - 2.5;
            } else if (coverZ === null) {
                coverZ = bottomZ + 2.5;
            }

            const zHeight = Math.abs(coverZ - bottomZ);

            // Three.js Coordinate Systems: Y is UP
            // RealWorld: X=East, Y=North, Z=Elevation
            // Three: x=X, y=Z(Elevation), z=-Y(North)
            const node = {
                id: String(id),
                type: type,
                pos: {
                    x: realX,
                    y: bottomZ, // Base of object at Sohle
                    z: -realY
                },
                geometry: {
                    coverZ: coverZ,
                    bottomZ: bottomZ,
                    height: zHeight, // Calculated physical height
                    shape: shape,
                    dimensions: dim
                },
                attributes: {
                    material: obj.Material,
                    subType: subType
                },
                warnings: warnings
            };

            nodes.set(node.id, node);

        } catch (err) {
            globalErrors.push(`Obj ${id} Error: ${err.message}`);
        }
    }

    console.log(`FixData V2: Nodes ${nodes.size}, Edges ${edges.length}, Errors ${globalErrors.length}`);
    return { nodes, edges, stats, errors: globalErrors };
};
