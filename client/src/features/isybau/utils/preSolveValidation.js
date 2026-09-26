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
import { getEffectiveBauwerkstyp, LINK_SECTION_BY_BTYP, classifyPreview } from './mappings.js';

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

/** Haltungen je Knoten, getrennt nach Zulauf und Ablauf. */
function knotenGrade(edges) {
    const ein = new Map(), aus = new Map();
    for (const e of edges) {
        const von = e.fromNodeId ?? e.from, nach = e.toNodeId ?? e.to;
        aus.set(von, (aus.get(von) || 0) + 1);
        ein.set(nach, (ein.get(nach) || 0) + 1);
    }
    return { ein: (id) => ein.get(id) || 0, aus: (id) => aus.get(id) || 0 };
}

/**
 * Ersatz-Auslass für ein Netz ohne Auslass (SwmmBuilder und Vorab-Prüfung nutzen
 * dieselbe Wahl). SWMM erlaubt an einem Auslass genau EINE Haltung
 * (flowrout.c:316, sonst ERROR 141). Vorher: der tiefste Schacht — in
 * 9161_IGBWEST ein Knoten mit z = 0 und zwei Haltungen → ERROR 141 + 145.
 * Jetzt: ein Endknoten (eine Haltung, die hineinläuft), davon der tiefste;
 * sonst irgendein Knoten mit genau einer Haltung; ohne jede Haltung der tiefste
 * Knoten; sonst keiner (ein verwaister Knoten als Auslass ließe das Netz volllaufen).
 * @param {Array} kandidaten  gewöhnliche Knoten (keine Bauwerke, die zum Link werden)
 * @returns {object|null}
 */
export function waehleErsatzAuslass(kandidaten, edges) {
    const g = knotenGrade(edges);
    const tiefster = (liste) => liste.reduce((m, n) => (m === null || Number(n.z) < Number(m.z) ? n : m), null);
    return tiefster(kandidaten.filter(n => g.ein(n.id) === 1 && g.aus(n.id) === 0))
        ?? tiefster(kandidaten.filter(n => g.ein(n.id) + g.aus(n.id) === 1))
        // Netz ganz ohne Haltungen: SWMM nimmt auch einen Auslass ohne Haltung
        ?? (edges.length === 0 ? tiefster(kandidaten) : null);
}

/** Kandidaten für den Ersatz-Auslass: Knoten, die als [JUNCTIONS] ohne eigenen Link gerechnet würden. */
export const ersatzAuslassKandidaten = (nodes) =>
    nodes.filter(n => { const k = classifyPreview(n); return k.section === '[JUNCTIONS]' && !k.linkSection; });

/**
 * ERROR 141/145 vorab: Auslass mit mehr als einer Haltung, oder gar kein möglicher Auslass.
 * SWMM brach sonst ab; die Meldung nannte nur den englischen Fehlertext.
 */
export function checkAuslaesse(nodes, edges) {
    const g = knotenGrade(edges);
    const auslaesse = nodes.filter(n => classifyPreview(n).section === '[OUTFALLS]');
    const funde = [];
    for (const n of auslaesse) {
        const zahl = g.ein(n.id) + g.aus(n.id);
        if (zahl > 1) {
            const namen = edges.filter(e => (e.fromNodeId ?? e.from) === n.id || (e.toNodeId ?? e.to) === n.id).map(e => e.id);
            funde.push({
                id: n.id, elementType: 'node', severity: 'error', code: 'ERR_141',
                message: `Auslass mit ${zahl} Haltungen (${namen.join(', ')}). SWMM erlaubt an einem Auslass genau eine — `
                    + 'den Auslass hinter einen Schacht setzen, an dem die Haltungen zusammenlaufen, oder den Knotentyp ändern.'
            });
        }
    }
    if (auslaesse.length === 0 && nodes.length && !waehleErsatzAuslass(ersatzAuslassKandidaten(nodes), edges)) {
        funde.push({
            id: null, elementType: null, severity: 'error', code: 'ERR_145',
            message: 'Das Netz hat keinen Auslass, und kein Knoten eignet sich als Ersatz (genau eine Haltung). '
                + 'Bitte einen Knoten als Auslaufbauwerk festlegen.'
        });
    }
    return funde;
}

const endlich = (v) => typeof v === 'number' && Number.isFinite(v);
const fehler = (id, elementType, code, message) => ({ id, elementType, severity: 'error', code, message });

/** Zahlfelder eines Knotens (P2.1): ohne Sohlhöhe schrieb der Builder 0 m bzw. eine leere Spalte. */
export function checkNodeZahlen(node) {
    if (!endlich(node.z)) return fehler(node.id, 'node', 'ERR_Z', 'Sohlhöhe fehlt oder ist keine Zahl');
    if (node.coverZ != null && !endlich(node.coverZ)) return fehler(node.id, 'node', 'ERR_Z', 'Deckelhöhe ist keine Zahl');
    return null;
}

/** Zahlfelder einer Haltung (P2.1). */
export function checkEdgeZahlen(edge) {
    for (const [f, name] of [['z1', 'Sohlhöhe oben'], ['z2', 'Sohlhöhe unten'], ['length', 'Länge']]) {
        if (edge[f] != null && !endlich(edge[f])) return fehler(edge.id, 'edge', 'ERR_ZAHL', `${name} ist keine Zahl`);
    }
    if (edge.roughness != null && !(endlich(edge.roughness) && edge.roughness > 0)) {
        return fehler(edge.id, 'edge', 'ERR_ZAHL', `Rauheit muss > 0 sein (${edge.roughness})`);
    }
    return null;
}

/**
 * Flächen (P2.4): Größe > 0, Abflussbeiwert 0–1, Aufteilung 0–100 %, Anschlussknoten vorhanden.
 * Ohne Anschluss bzw. mit unbekanntem Knoten rechnete SWMM die Fläche nicht oder brach ab.
 */
export function checkAreas(areas, nodeById) {
    const funde = [];
    for (const a of areas) {
        if (!(endlich(a.size) && a.size > 0)) funde.push(fehler(a.id, 'area', 'ERR_FLAECHE', `Flächengröße muss > 0 ha sein (${a.size ?? 'leer'})`));
        if (a.runoffCoeff != null && !(endlich(a.runoffCoeff) && a.runoffCoeff >= 0 && a.runoffCoeff <= 1)) {
            funde.push(fehler(a.id, 'area', 'ERR_FLAECHE', `Abflussbeiwert muss zwischen 0 und 1 liegen (${a.runoffCoeff})`));
        }
        if (a.nodeId2 && !(endlich(a.splitRatio) && a.splitRatio >= 0 && a.splitRatio <= 100)) {
            funde.push(fehler(a.id, 'area', 'ERR_FLAECHE', `Aufteilung muss zwischen 0 und 100 % liegen (${a.splitRatio})`));
        }
        for (const k of [a.nodeId, a.nodeId2].filter(Boolean)) {
            if (!nodeById.has(k)) funde.push(fehler(a.id, 'area', 'ERR_ANSCHLUSS', `Anschlussknoten „${k}" gibt es nicht`));
        }
    }
    return funde;
}

/**
 * Namen (P2.4): SWMM trennt Spalten an Leerzeichen, „;" beginnt einen Kommentar, und
 * Namen gelten ohne Groß-/Kleinschreibung (hash.c: samestr) — „R1" und „r1" wären
 * derselbe Knoten. Geprüft je Objektart (Knoten, Haltungen, Flächen), wie SWMM zählt.
 */
export function checkNamen(nodes, edges, areas) {
    const funde = [];
    for (const [liste, art, label] of [[nodes, 'node', 'Knoten'], [edges, 'edge', 'Haltung'], [areas, 'area', 'Fläche']]) {
        const gesehen = new Map();
        for (const el of liste) {
            const id = String(el.id ?? '');
            if (/\s|;|"/.test(id)) funde.push(fehler(el.id, art, 'ERR_NAME', `Name enthält Leerzeichen, „;" oder Anführungszeichen — SWMM kann ihn nicht lesen`));
            const schluessel = id.toUpperCase();
            if (gesehen.has(schluessel) && gesehen.get(schluessel) !== id) {
                funde.push(fehler(el.id, art, 'ERR_NAME', `${label} „${gesehen.get(schluessel)}" und „${id}" sind für SWMM derselbe Name (Groß-/Kleinschreibung zählt nicht)`));
            }
            gesehen.set(schluessel, id);
        }
    }
    return funde;
}

/** Verteiler (P2.4): braucht zwei Abgänge — sonst ließ der Builder den Knoten still weg (SWMM: ERROR 203). */
export function checkVerteiler(nodes, edges) {
    const aus = new Map();
    for (const e of edges) { const v = e.fromNodeId ?? e.from; aus.set(v, (aus.get(v) || 0) + 1); }
    return nodes
        .filter(n => classifyPreview(n).section === '[DIVIDERS]' && (aus.get(n.id) || 0) < 2)
        .map(n => fehler(n.id, 'node', 'ERR_DIVIDER', `Verteiler mit ${aus.get(n.id) || 0} abgehenden Haltungen — er braucht zwei`));
}

const NODE_RULES = [checkNodeZahlen, checkPumpDepths, checkPumpHead, checkNodeInitDepth, checkStorageCurveSequence, checkStorageCurveHasEnoughPoints];
const EDGE_RULES = [checkEdgeZahlen, checkConduitElevationDrop, checkConduitProfile];

/**
 * Prüft das gesamte Netz und liefert alle gefundenen Verstöße (nicht nur den ersten),
 * damit runSimulation() im Store VOR dem Solver-Aufruf abbrechen kann (severity
 * 'error') bzw. den User informieren kann, ohne den Lauf zu blockieren (severity
 * 'warning').
 * @param {Array} nodes - Node-Instanzen oder POJOs (nodeArray-Format)
 * @param {Array} edges - Edge-Instanzen oder POJOs (edgeArray-Format)
 * @returns {Array<{id, elementType, severity, code, message}>}
 */
export function validateNetwork(nodes = [], edges = [], areas = []) {
    const findings = [];
    findings.push(...checkNamen(nodes, edges, areas));
    findings.push(...checkVerteiler(nodes, edges));
    if (areas.length) findings.push(...checkAreas(areas, new Map(nodes.map(n => [n.id, n]))));
    for (const node of nodes) {
        for (const rule of NODE_RULES) {
            const finding = rule(node);
            if (finding) findings.push(finding);
        }
    }
    findings.push(...checkAuslaesse(nodes, edges));
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
