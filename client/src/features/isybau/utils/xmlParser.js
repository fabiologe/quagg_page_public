/**
 * Parses ISYBAUXML content.
 * @param {string} xmlString - The raw XML string.
 * @returns {Object} Parsed data structure (metadata, network, inspections, hydraulics).
 */
export const parseIsybauXML = (xmlString) => {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, "application/xml");

    const parseError = xmlDoc.querySelector("parsererror");
    if (parseError) {
        throw new Error("XML Parsing Error: " + parseError.textContent);
    }

    const metadata = parseMetadata(xmlDoc);
    const network = parseNetwork(xmlDoc);
    const inspections = parseInspections(xmlDoc);
    const hydraulics = parseHydraulics(xmlDoc);

    return {
        metadata,
        network,
        inspections,
        hydraulics
    };
};

const parseMetadata = (doc) => {
    const ident = doc.getElementsByTagName("Identifikation")[0];
    if (!ident) return null;

    const version = ident.getElementsByTagName("Version")[0]?.textContent;
    const created = ident.getElementsByTagName("Erstellungsdatum")[0]?.textContent;

    // Try to extract CRS info if available (placeholder logic)
    // In U.xml, Admindaten is empty, so we might need to look elsewhere or defaults
    const admindaten = ident.getElementsByTagName("Admindaten")[0];
    const crs = {
        location: "Unknown", // E.g., ETRS89
        height: "Unknown"  // E.g., DHHN2016
    };

    return {
        fileName: "Unknown", // Passed from file input usually
        version,
        created,
        crs
    };
};

const parseNetwork = (doc) => {
    const nodes = new Map();
    const edges = new Map();

    const objects = doc.getElementsByTagName("AbwassertechnischeAnlage");

    for (let i = 0; i < objects.length; i++) {
        const obj = objects[i];
        const id = obj.getElementsByTagName("Objektbezeichnung")[0]?.textContent;
        if (!id) continue;

        const knoten = obj.getElementsByTagName("Knoten")[0];
        // Check for Kante (Edge) - note that Kante can be inside Geometrie too, so check direct child or specific structure
        const kante = Array.from(obj.children).find(child => child.tagName === "Kante");

        if (knoten && !kante) {
            const nodeData = parseNode(obj, id);
            if (nodeData) nodes.set(id, nodeData);
        } else if (kante) {
            const edgeData = parseEdge(obj, id);
            if (edgeData) edges.set(id, edgeData);
        }
    }

    // Interpolate missing Z values
    interpolateZ(nodes, edges);

    return { nodes, edges };
};

/**
 * Interpolates missing Z values (Sohlhöhe) linearly based on network topology.
 * @param {Map} nodes 
 * @param {Map} edges 
 */
const interpolateZ = (nodes, edges) => {
    // 1. Identify nodes with missing Z (assuming 0 is missing, or specific flag)
    // In ISYBAU, 0 might be valid (sea level), but usually unlikely for sewer bottom in many places.
    // However, we should check if it was explicitly parsed as 0 vs missing.
    // Our parser sets default 0 if missing.
    // Let's assume Z=0 AND Depth=0 means missing? Or just Z=0?
    // Safer: If Z=0, try to interpolate.

    const missingNodes = [];
    nodes.forEach((n, id) => {
        if (n.z === 0) missingNodes.push(id);
    });

    if (missingNodes.length === 0) return;

    // 2. Build Adjacency List (Undirected for traversal, but we need flow direction for slope?)
    // Actually, we just want to fill gaps between known Zs.
    const adj = new Map();
    edges.forEach(e => {
        if (!adj.has(e.from)) adj.set(e.from, []);
        if (!adj.has(e.to)) adj.set(e.to, []);
        adj.get(e.from).push({ to: e.to, len: e.length });
        adj.get(e.to).push({ to: e.from, len: e.length });
    });

    // 3. For each missing node, find nearest known Z upstream/downstream
    // This is a graph search.
    // Simplified approach: Iterative relaxation?
    // Or BFS to find nearest knowns.

    // Let's use a simple iterative averaging (Laplace smoothing) for the missing values
    // until convergence.
    // Z_new = Average(Z_neighbors_weighted_by_distance)
    // But sewer networks have slope. Linear interpolation is better.
    // Z = Z_start + (Z_end - Z_start) * (dist / total_dist)

    // Let's try to find "Boundary Conditions" for each connected component of missing nodes.

    let changed = true;
    let iterations = 0;
    while (changed && iterations < 50) {
        changed = false;
        iterations++;

        missingNodes.forEach(id => {
            const node = nodes.get(id);
            // Look at neighbors
            const neighbors = adj.get(id) || [];
            let sumZ = 0;
            let count = 0;

            // If we have neighbors with known Z (non-zero), use them.
            // But we should respect slope? 
            // If we just average, we might create local depressions.
            // Ideally we want constant slope between two known points.

            // If we are a middle node in a chain: A(10) -> B(?) -> C(8). B should be 9.
            // Average of 10 and 8 is 9. Correct.
            // If A(10) -> B(?) -> C(?) -> D(7).
            // Iteration 1: B = (10+0)/1 -> 10? No.
            // Only use neighbors that are NOT in the missing set (or have been updated).

            neighbors.forEach(nb => {
                const nbNode = nodes.get(nb.to);
                if (nbNode.z !== 0) {
                    sumZ += nbNode.z;
                    count++;
                }
            });

            if (count > 0) {
                const newZ = sumZ / count;
                if (Math.abs(newZ - node.z) > 0.01) {
                    node.z = newZ;
                    // Also update coverZ if it was based on depth
                    if (node.depth > 0) node.coverZ = node.z + node.depth;
                    changed = true;
                }
            }
        });
    }
};


const parseNode = (obj, id) => {
    const geom = obj.getElementsByTagName("Geometrie")[0];
    if (!geom) return null;

    const points = geom.getElementsByTagName("Punkt");
    if (points.length === 0) return null;

    let x = 0, y = 0, z = 0;
    let coverZ = null;
    let foundSMP = false;

    for (let i = 0; i < points.length; i++) {
        const p = points[i];
        const attr = p.getElementsByTagName("PunktattributAbwasser")[0]?.textContent;
        const px = parseFloat(p.getElementsByTagName("Rechtswert")[0]?.textContent);
        const py = parseFloat(p.getElementsByTagName("Hochwert")[0]?.textContent);
        const pz = parseFloat(p.getElementsByTagName("Punkthoehe")[0]?.textContent);

        // Ensure valid numbers
        const validX = !isNaN(px) ? px : 0;
        const validY = !isNaN(py) ? py : 0;
        const validZ = !isNaN(pz) ? pz : 0;

        if (attr === "SMP") { // Schachtmittelpunkt (Sohlhöhe)
            x = validX;
            y = validY;
            z = validZ;
            foundSMP = true;
        } else if (attr === "DMP") { // Deckelmittelpunkt (Deckelhöhe)
            coverZ = validZ;
        } else if (!foundSMP && i === 0) {
            // Fallback to first point if no SMP found yet
            x = validX;
            y = validY;
            z = validZ;
        }
    }

    const schacht = obj.getElementsByTagName("Schacht")[0];
    const bauwerk = obj.getElementsByTagName("Bauwerk")[0];

    let type = "Unknown";
    if (schacht) type = "Schacht";
    else if (bauwerk) type = "Bauwerk";

    const depth = schacht ? parseFloat(schacht.getElementsByTagName("Schachttiefe")[0]?.textContent) : 0;
    const status = parseInt(obj.getElementsByTagName("Status")[0]?.textContent || 0);

    // Extract Diameter (LaengeAufbau)
    let diameter = 0; // Default 0 (implies missing)
    if (schacht) {
        const aufbau = schacht.getElementsByTagName("Aufbau")[0];
        if (aufbau) {
            const l = parseFloat(aufbau.getElementsByTagName("LaengeAufbau")[0]?.textContent);
            if (!isNaN(l) && l > 0) diameter = l;
        }
    }

    // If coverZ is missing but we have depth, calculate it
    if (coverZ === null && depth > 0) {
        coverZ = z + depth;
    }

    return {
        id,
        type,
        x,
        y,
        z,
        coverZ,
        depth,
        status,
        diameter
    };
};

const parseEdge = (obj, id) => {
    const kante = Array.from(obj.children).find(child => child.tagName === "Kante");
    if (!kante) return null;

    const fromNode = kante.getElementsByTagName("KnotenZulauf")[0]?.textContent;
    const toNode = kante.getElementsByTagName("KnotenAblauf")[0]?.textContent;

    const geom = obj.getElementsByTagName("Geometrie")[0];
    const coords = [];

    if (geom) {
        // Strategy 1: Check for explicit "Punkt" sequence (Linienzug)
        const points = geom.getElementsByTagName("Punkt");
        if (points.length > 0) {
            for (let i = 0; i < points.length; i++) {
                const p = points[i];
                coords.push({
                    x: parseFloat(p.getElementsByTagName("Rechtswert")[0]?.textContent),
                    y: parseFloat(p.getElementsByTagName("Hochwert")[0]?.textContent),
                    z: parseFloat(p.getElementsByTagName("Punkthoehe")[0]?.textContent)
                });
            }
        } else {
            // Strategy 2: Check for "Kante" segments (Polykante)
            const polyKantes = geom.getElementsByTagName("Kante");
            if (polyKantes.length > 0) {
                // Iterate over all segments
                for (let i = 0; i < polyKantes.length; i++) {
                    const kante = polyKantes[i];
                    const startRaw = kante.getElementsByTagName("Start")[0];
                    const endRaw = kante.getElementsByTagName("Ende")[0];

                    if (startRaw) {
                        const sx = parseFloat(startRaw.getElementsByTagName("Rechtswert")[0]?.textContent);
                        const sy = parseFloat(startRaw.getElementsByTagName("Hochwert")[0]?.textContent);
                        const sz = parseFloat(startRaw.getElementsByTagName("Punkthoehe")[0]?.textContent);

                        // Prevent duplicate if matches last point
                        const last = coords[coords.length - 1];
                        if (!last || Math.abs(last.x - sx) > 0.001 || Math.abs(last.y - sy) > 0.001) {
                            coords.push({ x: sx, y: sy, z: sz });
                        }
                    }
                    if (endRaw) {
                        const ex = parseFloat(endRaw.getElementsByTagName("Rechtswert")[0]?.textContent);
                        const ey = parseFloat(endRaw.getElementsByTagName("Hochwert")[0]?.textContent);
                        const ez = parseFloat(endRaw.getElementsByTagName("Punkthoehe")[0]?.textContent);
                        coords.push({ x: ex, y: ey, z: ez });
                    }
                }
            }
        }
    }

    const haltung = kante.getElementsByTagName("Haltung")[0];
    const length = parseFloat(obj.getElementsByTagName("Laenge")[0]?.textContent) || 0;
    const material = obj.getElementsByTagName("Material")[0]?.textContent;
    const status = parseInt(obj.getElementsByTagName("Status")[0]?.textContent || 0);

    // Profil info
    const profil = obj.getElementsByTagName("Profil")[0];
    const profile = {
        type: parseInt(profil?.getElementsByTagName("Profilart")[0]?.textContent || 0),
        id: profil?.getElementsByTagName("Profilbezeichnung")[0]?.textContent || profil?.getElementsByTagName("ProfilID")[0]?.textContent || "",
        height: parseFloat(profil?.getElementsByTagName("Profilhoehe")[0]?.textContent || 300) / 1000,
        width: parseFloat(profil?.getElementsByTagName("Profilbreite")[0]?.textContent || 300) / 1000
    };

    return {
        id,
        type: haltung ? "Haltung" : "Leitung",
        from: fromNode,
        to: toNode,
        coords,
        length,
        material,
        status,
        profile
    };
};

const parseInspections = (doc) => {
    const inspections = [];
    const untersuchungen = doc.getElementsByTagName("Untersuchung");

    for (let i = 0; i < untersuchungen.length; i++) {
        const u = untersuchungen[i];
        const id = u.getElementsByTagName("InspektionsID")[0]?.textContent || Math.random().toString(36).substr(2, 9);
        const ref = u.getElementsByTagName("Referenz")[0]?.textContent; // Link to Haltung/Leitung

        const observations = [];
        const obsNodes = u.getElementsByTagName("Beobachtung");
        for (let j = 0; j < obsNodes.length; j++) {
            const obs = obsNodes[j];
            observations.push({
                station: parseFloat(obs.getElementsByTagName("Streckencodierung")[0]?.textContent) || 0,
                code: obs.getElementsByTagName("Code")[0]?.textContent,
                char1: obs.getElementsByTagName("Charakterisierung1")[0]?.textContent,
                char2: obs.getElementsByTagName("Charakterisierung2")[0]?.textContent,
                rating: parseInt(obs.getElementsByTagName("Bewertungsklasse")[0]?.textContent) || 0
            });
        }

        inspections.push({
            id,
            edgeId: ref,
            date: u.getElementsByTagName("Datum")[0]?.textContent,
            observations
        });
    }
    return inspections;
};

const parseHydraulics = (doc) => {
    const catchments = [];
    const gebiete = doc.getElementsByTagName("Einzugsgebiet");

    for (let i = 0; i < gebiete.length; i++) {
        const g = gebiete[i];
        catchments.push({
            id: g.getElementsByTagName("GebietsID")[0]?.textContent,
            nodeId: g.getElementsByTagName("KnotenID")[0]?.textContent, // Discharge point
            area: parseFloat(g.getElementsByTagName("Flaeche")[0]?.textContent) || 0, // ha
            runoffCoeff: parseFloat(g.getElementsByTagName("Abflussbeiwert")[0]?.textContent) || 0
        });
    }

    // Parse Flaechen (Areas/Polygons)
    const areas = [];
    const flaechen = doc.getElementsByTagName("Flaeche");

    for (let i = 0; i < flaechen.length; i++) {
        const f = flaechen[i];
        const id = f.getElementsByTagName("Flaechenbezeichnung")[0]?.textContent;
        const geom = f.getElementsByTagName("Flaechengeometrie")[0];

        if (geom) {
            const polygon = geom.getElementsByTagName("Polygon")[0];
            if (polygon) {
                const points = [];
                const kanten = polygon.getElementsByTagName("Kante");

                // Extract points from edges. 
                // Assuming ordered edges, we can take Start point of each edge.
                // Or Start and End. If connected, End of i == Start of i+1.
                for (let j = 0; j < kanten.length; j++) {
                    const start = kanten[j].getElementsByTagName("Start")[0];
                    if (start) {
                        points.push({
                            x: parseFloat(start.getElementsByTagName("Rechtswert")[0]?.textContent),
                            y: parseFloat(start.getElementsByTagName("Hochwert")[0]?.textContent)
                        });
                    }
                }

                if (points.length > 0) {
                    // Helper to parse float with comma support
                    const parseNum = (str) => {
                        if (!str) return 0;
                        return parseFloat(str.replace(',', '.'));
                    };

                    // Try to find reference in HydraulikObjekt (User specified schema)
                    // <HydraulikObjekt><Objektbezeichnung>...</Objektbezeichnung></HydraulikObjekt>
                    let ref = f.getElementsByTagName("HydraulikObjekt")[0]?.getElementsByTagName("Objektbezeichnung")[0]?.textContent;

                    // Fallback 1: AbflusswirksameFlaeche -> Referenz
                    if (!ref) {
                        ref = f.getElementsByTagName("AbflusswirksameFlaeche")[0]?.getElementsByTagName("Referenz")[0]?.textContent;
                    }

                    // Fallback 2: Direct Referenz tag
                    if (!ref) {
                        ref = f.getElementsByTagName("Referenz")[0]?.textContent;
                    }

                    areas.push({
                        id,
                        points,
                        type: parseInt(f.getElementsByTagName("Flaechenart")[0]?.textContent || 0),
                        property: parseInt(f.getElementsByTagName("Flaecheneigenschaft")[0]?.textContent || 0),
                        function: parseInt(f.getElementsByTagName("Flaechenfunktion")[0]?.textContent || 0),
                        usage: parseInt(f.getElementsByTagName("Flaechennutzung")[0]?.textContent || 0),
                        pollution: parseInt(f.getElementsByTagName("Verschmutzungsklasse")[0]?.textContent || 0),
                        slope: parseInt(f.getElementsByTagName("Neigungsklasse")[0]?.textContent || 0),
                        size: parseNum(f.getElementsByTagName("Flaechengroesse")[0]?.textContent), // In hectares (ha)
                        runoffCoeff: parseNum(f.getElementsByTagName("Abflussbeiwert")[0]?.textContent),
                        edgeId: ref
                    });
                }
            }
        }
    }

    return {
        catchments,
        areas,
        params: {} // Simulation parameters placeholder
    };
};
