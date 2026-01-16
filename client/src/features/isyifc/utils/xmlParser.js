import { normalizeGraph } from '../core/worker/FixData.js';

/**
 * Parses ISYBAUXML content.
 * @param {string} xmlString - The raw XML string.
 * @returns {Object} Parsed data structure (metadata, network, inspections, hydraulics).
 */
export const parseIsyIfcXML = (xmlString) => {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, "application/xml");

    const parseError = xmlDoc.querySelector("parsererror");
    if (parseError) {
        throw new Error("XML Parsing Error: " + parseError.textContent);
    }

    const metadata = parseMetadata(xmlDoc);

    // --- New Graph Parsing via FixData Sanitizer ---
    // 1. Convert DOM to JSON structure expected by FixData
    const rawJson = convertDomToFixDataJson(xmlDoc);

    // 2. Normalize and Clean
    const normalized = normalizeGraph(rawJson);

    console.log("FixData Validation:", normalized.stats);
    if (normalized.errors.length > 0) {
        console.warn("FixData Errors:", normalized.errors);
    }

    const network = {
        nodes: normalized.nodes, // Array (Store handles Array)
        edges: normalized.edges
    };

    const inspections = parseInspections(xmlDoc);
    const hydraulics = parseHydraulics(xmlDoc);

    // Attach validation info to metadata for UI
    metadata.validation = {
        stats: normalized.stats,
        errors: normalized.errors
    };

    return {
        metadata,
        network,
        inspections,
        hydraulics
    };
};

/**
 * Converts specific parts of the XML DOM to the simple JSON structure 
 * required by FixData.js (Stammdaten & Hydraulikdaten).
 */
/**
 * Converts specific parts of the XML DOM to the simple JSON structure 
 * required by FixData.js.
 * Now generic to support Haltung, Leitung, Bauwerk, Anschlusspunkt.
 */
const convertDomToFixDataJson = (doc) => {
    const json = {
        Stammdatenkollektiv: { AbwassertechnischeAnlage: [] },
        Hydraulikdatenkollektiv: { HydraulikObjekt: [] }
    };

    // Helper to get text content safely
    const txt = (el, tag) => {
        if (!el) return null;
        const found = el.getElementsByTagName(tag)[0];
        return found ? found.textContent.trim() : null;
    };

    // Helper: Find first matching child from list
    const findFirst = (parent, tags) => {
        for (const t of tags) {
            const el = parent.getElementsByTagName(t)[0];
            if (el) return { el, tag: t };
        }
        return null;
    };

    // --- Nodes (Stammdaten) ---
    // Extract: Schacht, Anschluss, Bauwerk
    const stammdaten = doc.getElementsByTagName("AbwassertechnischeAnlage");
    for (let i = 0; i < stammdaten.length; i++) {
        const el = stammdaten[i];

        // 1. Geometrie
        const points = [];
        const ptTags = el.getElementsByTagName("Punkt");
        for (let j = 0; j < ptTags.length; j++) {
            const p = ptTags[j];
            points.push({
                PunktattributAbwasser: txt(p, "PunktattributAbwasser"),
                Rechtswert: txt(p, "Rechtswert"),
                Hochwert: txt(p, "Hochwert"),
                Punkthoehe: txt(p, "Punkthoehe"),
                X: txt(p, "X"), Y: txt(p, "Y"), Z: txt(p, "Z")
            });
        }

        // 2. Type Specific Data
        // Schacht
        const schachtEl = el.getElementsByTagName("Schacht")[0];
        const schacht = schachtEl ? {
            Schachttiefe: txt(schachtEl, "Schachttiefe"),
            Aufbau: {
                LaengeAufbau: txt(schachtEl.getElementsByTagName("Aufbau")[0], "LaengeAufbau"),
                BreiteAufbau: txt(schachtEl.getElementsByTagName("Aufbau")[0], "BreiteAufbau")
            }
        } : null;

        // Bauwerk
        const bauwerkEl = el.getElementsByTagName("Bauwerk")[0];
        const bauwerk = bauwerkEl ? {
            Bauwerkstyp: txt(bauwerkEl, "Bauwerkstyp"),
            Pumpwerk: bauwerkEl.getElementsByTagName("Pumpwerk")[0] ? {
                MaxLaenge: txt(bauwerkEl.getElementsByTagName("Pumpwerk")[0], "MaxLaenge"),
                MaxBreite: txt(bauwerkEl.getElementsByTagName("Pumpwerk")[0], "MaxBreite")
            } : null
        } : null;

        // Anschlusspunkt
        const anschlussEl = el.getElementsByTagName("Anschlusspunkt")[0];
        const anschluss = anschlussEl ? {
            Punktkennung: txt(anschlussEl, "Punktkennung")
        } : null;

        // Kante (Direct in Stammdaten?)
        // Sometimes Kanten are in Stammdaten too!
        const kanteTags = ["Kante", "Haltung", "Leitung", "Rinne", "Gerinne"];
        const foundKante = findFirst(el, kanteTags);
        let kanteObj = null;
        if (foundKante) {
            kanteObj = {
                TagName: foundKante.tag,
                KnotenZulauf: txt(foundKante.el, "KnotenZulauf"),
                KnotenAblauf: txt(foundKante.el, "KnotenAblauf"),
                SohlhoeheZulauf: txt(foundKante.el, "SohlhoeheZulauf"),
                SohlhoeheAblauf: txt(foundKante.el, "SohlhoeheAblauf"),
                KantenTyp: txt(foundKante.el, "KantenTyp"),
                Laenge: txt(foundKante.el, "Laenge"),
                Material: txt(foundKante.el, "Material"),
                Profil: {
                    Profilart: txt(foundKante.el.getElementsByTagName("Profil")[0], "Profilart"),
                    Profilbreite: txt(foundKante.el.getElementsByTagName("Profil")[0], "Profilbreite"),
                    Profilhoehe: txt(foundKante.el.getElementsByTagName("Profil")[0], "Profilhoehe")
                }
            };
        }

        json.Stammdatenkollektiv.AbwassertechnischeAnlage.push({
            Objektbezeichnung: txt(el, "Objektbezeichnung"),
            Objektart: txt(el, "Objektart"), // G100
            Geometrie: { Geometriedaten: { Knoten: { Punkt: points } } },
            Schacht: schacht,
            Bauwerk: bauwerk,
            Anschlusspunkt: anschluss,
            Kante: kanteObj
        });
    }

    // --- Edges (Hydraulikdaten) ---
    // Extract: Haltung, Leitung, Rinne, Gerinne
    const hydraulik = doc.getElementsByTagName("HydraulikObjekt");
    for (let i = 0; i < hydraulik.length; i++) {
        const el = hydraulik[i];

        // Find the Edge Definition Element
        const edgeTags = ["Kante", "Haltung", "Leitung", "Rinne", "Gerinne"];
        const found = findFirst(el, edgeTags);

        let kanteObj = null;
        if (found) {
            // Extract core topology & geometry
            kanteObj = {
                TagName: found.tag,
                KnotenZulauf: txt(found.el, "KnotenZulauf"),
                KnotenAblauf: txt(found.el, "KnotenAblauf"),
                SohlhoeheZulauf: txt(found.el, "SohlhoeheZulauf"),
                SohlhoeheAblauf: txt(found.el, "SohlhoeheAblauf"),
                KantenTyp: txt(found.el, "KantenTyp"),
                Laenge: txt(found.el, "Laenge"),
                Material: txt(found.el, "Material")
            };

            // Extract Profile
            // Profil can be direct child of Haltung OR sibling in Kante wrapper?
            // Usually internal to Haltung/Kante
            const pEl = found.el.getElementsByTagName("Profil")[0] || el.getElementsByTagName("Profil")[0];
            if (pEl) {
                kanteObj.Profil = {
                    Profilart: txt(pEl, "Profilart"),
                    Profilhoehe: txt(pEl, "Profilhoehe"),
                    Profilbreite: txt(pEl, "Profilbreite")
                };
            }
        }

        json.Hydraulikdatenkollektiv.HydraulikObjekt.push({
            Objektbezeichnung: txt(el, "Objektbezeichnung"),
            Laenge: txt(el, "Laenge"),
            Material: txt(el, "Material"), // Fallback top level
            Kante: kanteObj, // Pass generic Kante object
            Profil: null // Handled inside KanteObj
        });
    }

    return json;
};

const parseMetadata = (doc) => {
    const ident = doc.getElementsByTagName("Identifikation")[0];
    if (!ident) return { fileName: "Unknown" };

    return {
        fileName: "Unknown",
        version: ident.getElementsByTagName("Version")[0]?.textContent,
        created: ident.getElementsByTagName("Erstellungsdatum")[0]?.textContent,
        crs: { location: "Unknown", height: "Unknown" }
    };
};

const parseInspections = (doc) => {
    const inspections = [];
    const untersuchungen = doc.getElementsByTagName("Untersuchung");

    for (let i = 0; i < untersuchungen.length; i++) {
        const u = untersuchungen[i];
        const id = u.getElementsByTagName("InspektionsID")[0]?.textContent || Math.random().toString(36).substr(2, 9);
        const ref = u.getElementsByTagName("Referenz")[0]?.textContent;

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
    // Keep Catchment/Area parsing if needed, or rely on Graph?
    // FixData doesn't parse Areas (Polygons). 
    // We should keep the original Area parsing or migrate it to FixData later.
    // For now, retaining original logic for Areas.

    // Parse Flaechen (Areas/Polygons)
    const areas = [];
    const flaechen = doc.getElementsByTagName("Flaeche");
    const parseNum = (str) => str ? parseFloat(str.replace(',', '.')) : 0;

    for (let i = 0; i < flaechen.length; i++) {
        const f = flaechen[i];
        const id = f.getElementsByTagName("Flaechenbezeichnung")[0]?.textContent;
        const geom = f.getElementsByTagName("Flaechengeometrie")[0];

        if (geom) {
            const polygon = geom.getElementsByTagName("Polygon")[0];
            if (polygon) {
                const points = [];
                const kanten = polygon.getElementsByTagName("Kante");

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
                    let ref = f.getElementsByTagName("HydraulikObjekt")[0]?.getElementsByTagName("Objektbezeichnung")[0]?.textContent;
                    if (!ref) ref = f.getElementsByTagName("AbflusswirksameFlaeche")[0]?.getElementsByTagName("Referenz")[0]?.textContent;
                    if (!ref) ref = f.getElementsByTagName("Referenz")[0]?.textContent;

                    areas.push({
                        id,
                        points,
                        size: parseNum(f.getElementsByTagName("Flaechengroesse")[0]?.textContent),
                        runoffCoeff: parseNum(f.getElementsByTagName("Abflussbeiwert")[0]?.textContent),
                        edgeId: ref
                    });
                }
            }
        }
    }

    return {
        catchments: [],
        areas
    };
};
