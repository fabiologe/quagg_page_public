// Unified Geometry Engine — Netz → SGC-Kanäle. Reiner Compiler (kein Vue/Store-Bezug), analog
// zu couplingDetector.js/couplingExport.js: NetworkModel + optionaler Terrain-Sampler rein,
// Channel-Werkzeug-kompatible Kanal-Objekte raus (s. useChannelStructureTool.js/SgcGenerator.js).
//
// Bewusst KEINE Methode auf NetworkModel selbst — die Channel-Werkzeug-Form ist ein UI-Werkzeug-
// Datenformat, keine Kernform des Modells (gleiche Trennung wie toSwmmStore() vs. alles andere).

// Default-Böschungsneigung für Trapez-Gerinne ohne eigene Angabe — identisch zum Default in
// SgcGenerator.buildSgcChanPramsFile(), damit es genau EINEN dokumentierten Ort für diesen
// Fallback gibt (kein zweiter, abweichender Default irgendwo anders im Code).
const DEFAULT_SIDE_SLOPE = 1.5;
// SGC-Standardrauheit, wenn keine Haltungs-Rauheit vorliegt — identisch zum Default, den
// ChannelSectionModal.vue für neu gezeichnete Kanäle vorschlägt.
const DEFAULT_MANNING_N = 0.03;

/** kSt (Strickler) → Manning n. Gleiche Heuristik wie SwmmBuilder.js (Zeile ~745-757):
 * Werte > 1.0 gelten als kSt (n=1/kSt), Werte <= 1.0 als bereits Manning n. */
function manningNFromRoughness(raw) {
    const kst = Number(raw);
    if (!Number.isFinite(kst) || kst <= 0) return DEFAULT_MANNING_N;
    return kst > 1.0 ? 1.0 / kst : kst;
}

/**
 * Kompiliert alle `conveyance:'open'`-Links eines NetworkModel (z.B. ISYBAU-Rinnen/-Gerinne) in
 * Channel-Werkzeug-kompatible Objekte, die zusammen mit den manuell gezeichneten Kanälen über
 * SgcGenerator.generateMultiSgcRasters()/buildSgcChanPramsFile() ins SGC-Raster gestempelt werden.
 * @param {import('./NetworkModel.js').NetworkModel} model
 * @param {{ terrainSampler?: { sampleZ:(x,y)=>number|null } }} [opts]
 * @returns {{ channels: Array, warnings: string[] }}
 */
export function toSgcChannels(model, { terrainSampler = null } = {}) {
    const channels = [];
    const warnings = [];

    for (const l of model.linkList) {
        if (l.conveyance !== 'open') continue;

        const from = l.refs.fromNodeId ? model.nodes.get(l.refs.fromNodeId) : null;
        const to = l.refs.toNodeId ? model.nodes.get(l.refs.toNodeId) : null;
        if (!from || !to) {
            warnings.push(`Gerinne ${l.id}: Anfangs-/Endknoten fehlt im Netzmodell — übersprungen.`);
            continue;
        }

        const profile = l.geom.profile || {};
        const shape = profile.shape === 'trapezoid' ? 'trapezoid' : 'rect';
        const bedWidth = (profile.bedWidth ?? profile.width) > 0 ? (profile.bedWidth ?? profile.width) : 1.0;

        let sideSlope = 0;
        if (shape === 'trapezoid') {
            if (profile.sideSlope !== undefined) {
                sideSlope = profile.sideSlope;
            } else {
                sideSlope = DEFAULT_SIDE_SLOPE;
                warnings.push(`Gerinne ${l.id}: keine Böschungsneigung im ISYBAU-Import gefunden — Standard ${DEFAULT_SIDE_SLOPE} verwendet.`);
            }
        }

        // Sohlhöhen: z1/z2-Offsets (falls im Import gesetzt) bevorzugt, sonst Knoten-Invert —
        // gleiche Fallback-Reihenfolge wie NetworkModel.validate()'s Gegengefälle-Check.
        const z1 = Number.isFinite(Number(l.attrs.z1)) ? Number(l.attrs.z1) : from.geom.invert;
        const z2 = Number.isFinite(Number(l.attrs.z2)) ? Number(l.attrs.z2) : to.geom.invert;

        const terrainAt = (x, y) => (terrainSampler ? terrainSampler.sampleZ(x, y) : null);
        const terrainZFrom = terrainAt(from.geom.x, from.geom.y) ?? z1;
        const terrainZTo = terrainAt(to.geom.x, to.geom.y) ?? z2;

        channels.push({
            id: `net_${l.id}`,
            polyline: [
                { x: from.geom.x, y: from.geom.y, terrainZ: terrainZFrom },
                { x: to.geom.x, y: to.geom.y, terrainZ: terrainZTo },
            ],
            shape,
            bedWidth,
            bedMode: 'absolute',
            bedZStart: z1,
            bedZEnd: z2,
            sideSlope,
            manningN: manningNFromRoughness(l.attrs.kSt ?? l.attrs.roughness),
        });
    }

    return { channels, warnings };
}
