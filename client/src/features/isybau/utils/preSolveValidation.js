/**
 * Vorab-Validierung gegen die häufigsten harten SWMM-Solver-Fehler (ERR_*), BEVOR
 * überhaupt ein .inp gebaut und der WASM-Solver gestartet wird. Ziel: der User
 * bekommt sofort eine deutschsprachige, auf das betroffene Element zeigende
 * Meldung statt des rohen SWMM-Fehlertexts (z.B. "ERROR 122: startup depth not
 * higher than shutoff depth for Pump H_1635").
 *
 * Jede check*-Funktion prüft GENAU die Bedingung, die im tatsächlich kompilierten
 * Solver (solver/src/solver/link.c, node.c, table.c) zum jeweiligen ERR_-Code führt
 * — nicht mehr, damit hier keine Fehlalarme entstehen, die der Solver selbst gar
 * nicht werfen würde.
 */
import { getEffectiveBauwerkstyp, LINK_SECTION_BY_BTYP } from './mappings.js';

/** ERR_122 (link.c): Pumpe mit Anspringtiefe <= Abschalttiefe springt nie an. */
export function checkPumpDepths(node) {
    if (LINK_SECTION_BY_BTYP[getEffectiveBauwerkstyp(node)] !== '[PUMPS]') return null;
    if (node.onDepth > 0 && node.onDepth <= node.offDepth) {
        return {
            id: node.id,
            elementType: 'node',
            severity: 'error',
            code: 'ERR_122',
            message: `Anspringtiefe (${node.onDepth} m) muss größer als Abschalttiefe (${node.offDepth} m) sein`
        };
    }
    return null;
}

/**
 * ERR_171 (table.c, indirekt über die PUMP3-Kennlinie): eine negative Förderhöhe
 * macht computePumpCurvePoints()' Head-Reihenfolge (0 → H_d → 1.3×H_d) nicht mehr
 * streng aufsteigend, sobald H_d < 0 — der Solver bricht dieselbe "curve out of
 * sequence"-Prüfung wie bei der Speicherkurve (checkStorageCurveSequence) ab.
 */
export function checkPumpHead(node) {
    if (LINK_SECTION_BY_BTYP[getEffectiveBauwerkstyp(node)] !== '[PUMPS]') return null;
    if (node.pumpHead < 0) {
        return {
            id: node.id,
            elementType: 'node',
            severity: 'error',
            code: 'ERR_171',
            message: `Förderhöhe (${node.pumpHead} m) darf nicht negativ sein`
        };
    }
    return null;
}

/** ERR_138 (node.c): Anfangstiefe darf die Maximaltiefe des Knotens nicht überschreiten. */
export function checkNodeInitDepth(node) {
    const maxDepth = node.maxDepth > 0 ? node.maxDepth : node.depth;
    if (node.initDepth > 0 && maxDepth > 0 && node.initDepth > maxDepth) {
        return {
            id: node.id,
            elementType: 'node',
            severity: 'error',
            code: 'ERR_138',
            message: `Anfangstiefe (${node.initDepth} m) größer als Maximaltiefe (${maxDepth} m)`
        };
    }
    return null;
}

/** ERR_171 (table.c): TABULAR-Speicherkurve braucht streng aufsteigende Tiefenwerte. */
export function checkStorageCurveSequence(node) {
    if (node.storageShape !== 'TABULAR' || !Array.isArray(node.storageCurve)) return null;
    const pts = node.storageCurve.filter(p => Number.isFinite(p?.depth) && Number.isFinite(p?.area));
    if (pts.length < 2) return null;

    for (let i = 1; i < pts.length; i++) {
        if (pts[i].depth <= pts[i - 1].depth) {
            return {
                id: node.id,
                elementType: 'node',
                severity: 'error',
                code: 'ERR_171',
                message: `Speicherkurve nicht streng aufsteigend (Tiefe ${pts[i - 1].depth} m → ${pts[i].depth} m)`
            };
        }
    }
    return null;
}

/**
 * WARN08 (link.c conduit_getSlope): Sohlgefälle >= Haltungslänge — nicht fatal,
 * der Solver rechnet trotzdem weiter (Ersatzgefälle = delta/length), aber die
 * Trasse ist damit hydraulisch praktisch senkrecht. Repliziert exakt, wie
 * SwmmBuilder.addLinks() die Offsets bildet: inOffset/outOffset werden dort auf
 * >= 0 geklemmt (Zeile 774-775), d.h. die am Solver ankommende Invert-Höhe ist
 * max(Knoten-Sohle, Haltungs-Sohle) an jedem Ende — NICHT roh edge.z1/z2.
 */
export function checkConduitElevationDrop(edge, nodeById) {
    const n1 = nodeById.get(edge.fromNodeId);
    const n2 = nodeById.get(edge.toNodeId);
    if (!n1 || !n2 || !(edge.length > 0)) return null;

    const z1 = Number.isFinite(edge.z1) ? Math.max(n1.z, edge.z1) : n1.z;
    const z2 = Number.isFinite(edge.z2) ? Math.max(n2.z, edge.z2) : n2.z;
    const delta = Math.abs(z1 - z2);

    if (delta >= edge.length) {
        return {
            id: edge.id,
            elementType: 'edge',
            severity: 'warning',
            code: 'WARN08',
            message: `Sohlgefälle (${delta.toFixed(2)} m) ≥ Haltungslänge (${edge.length.toFixed(2)} m) — Solver erzwingt ein rechnerisches Ersatzgefälle`
        };
    }
    return null;
}

/**
 * Nicht fatal, aber irreführend: SwmmBuilder.addStorage() schaltet nur auf die
 * TABULAR-Kurve um, wenn nach dem Filtern (depth>=0, area>=0, endlich) noch
 * >= 2 Punkte übrig sind (SwmmBuilder.js:430-433). Sonst fällt der Solver
 * still auf eine FUNCTIONAL-Näherung (PRISMATIC/CONICAL/PYRAMIDAL) zurück —
 * OHNE Warnung. Der User sieht "TABULAR" ausgewählt, bekommt aber etwas ganz
 * anderes simuliert.
 */
export function checkStorageCurveHasEnoughPoints(node) {
    if (node.storageShape !== 'TABULAR') return null;
    const pts = Array.isArray(node.storageCurve)
        ? node.storageCurve.filter(p => Number.isFinite(p?.depth) && Number.isFinite(p?.area) && p.depth >= 0 && p.area >= 0)
        : [];
    if (pts.length < 2) {
        return {
            id: node.id,
            elementType: 'node',
            severity: 'warning',
            code: 'TABULAR_FALLBACK',
            message: `Speicherform TABULAR gewählt, aber nur ${pts.length} gültige(r) Kurvenpunkt(e) — Solver nutzt automatisch eine FUNCTIONAL-Näherung statt der Kurve`
        };
    }
    return null;
}

/**
 * ERR_119 (link.c conduit_validate: `xsect.aFull <= 0.0`): eine Haltung mit
 * Höhe/Breite 0 hat eine Querschnittsfläche von 0 — der Solver bricht sofort ab
 * ("ERROR 119: invalid cross section"). PreprocessingModal.vue markiert das
 * Feld zwar schon rot (Zeilen 588/591), blockiert den Lauf bisher aber nicht.
 */
export function checkConduitProfile(edge) {
    const profile = edge.profile;
    if (!profile) return null;
    const isCircular = profile.type === 0;
    const heightOk = Number(profile.height) > 0;
    const widthOk = isCircular || Number(profile.width) > 0;
    if (!heightOk || !widthOk) {
        return {
            id: edge.id,
            elementType: 'edge',
            severity: 'error',
            code: 'ERR_119',
            message: isCircular
                ? `Profil ungültig: Durchmesser (${profile.height} m) muss > 0 sein`
                : `Profil ungültig: Höhe (${profile.height} m) und Breite (${profile.width} m) müssen > 0 sein`
        };
    }
    return null;
}

const NODE_RULES = [checkPumpDepths, checkPumpHead, checkNodeInitDepth, checkStorageCurveSequence, checkStorageCurveHasEnoughPoints];
const EDGE_RULES = [checkConduitElevationDrop, checkConduitProfile];

/**
 * Prüft das gesamte Netz und liefert alle gefundenen Verstöße (nicht nur den ersten),
 * damit runSimulation() im Store VOR dem Solver-Aufruf abbrechen kann (severity
 * 'error') bzw. den User informieren kann, ohne den Lauf zu blockieren (severity
 * 'warning').
 * @param {Array} nodes - Node-Instanzen oder POJOs (nodeArray-Format)
 * @param {Array} edges - Edge-Instanzen oder POJOs (edgeArray-Format)
 * @returns {Array<{id, elementType, severity, code, message}>}
 */
export function validateNetwork(nodes = [], edges = []) {
    const findings = [];
    for (const node of nodes) {
        for (const rule of NODE_RULES) {
            const finding = rule(node);
            if (finding) findings.push(finding);
        }
    }
    if (edges.length) {
        const nodeById = new Map(nodes.map(n => [n.id, n]));
        for (const edge of edges) {
            for (const rule of EDGE_RULES) {
                const finding = rule(edge, nodeById);
                if (finding) findings.push(finding);
            }
        }
    }
    return findings;
}
