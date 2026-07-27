/**
 * ScenarioValidator.js — zentraler „Fehlercatcher" der Solver-Pipeline.
 *
 * Zweck: ALLE Plausibilitäts-/Konsistenz-Probleme an EINER Stelle sammeln, mit
 * Schweregrad versehen und einheitlich formatieren — statt verstreuter
 * `console.warn`/`alert`-Aufrufe. Wird an drei Stellen genutzt:
 *
 *   1. InputGenerator  → `this.issues` (IssueCollector) während der Generierung
 *      (z. B. Brücke ragt über das SGC-Gerinne hinaus → ERROR/WARN).
 *   2. Pre-Run-Gate    → der Runner liest `generator.issues`; gibt es ERROR,
 *      wird vor dem Upload ein Bestätigungsdialog gezeigt (kein verbrannter Job).
 *   3. Editor-Panels   → reine Regel-Funktionen (z. B. validateBridgeChannelFit)
 *      liefern live denselben Befund schon beim Zeichnen.
 *
 * Reine Regeln haben KEINE Seiteneffekte und kennen weder Vue noch DOM, damit
 * sie überall (Worker, Test, UI) laufen.
 */

import { cellEdge, mergeCellsToIntervals } from '../utils/boundarySegments.js';
import { BoundaryTools } from './BoundaryTools.js';
import { openingSoffit, openingWidth, crestZAt } from '../utils/weirGeometry.js';

/** Schweregrade, aufsteigend. */
export const Severity = Object.freeze({ INFO: 'info', WARN: 'warn', ERROR: 'error' });

const RANK = { info: 0, warn: 1, error: 2 };

/**
 * Sammelt Issues mit Schweregrad und entdoppelt sie (per code bzw. message).
 * @typedef {{ severity: string, message: string, code: string|null, context: any }} Issue
 */
export class IssueCollector {
    constructor() {
        /** @type {Issue[]} */
        this.issues = [];
        this._seen = new Set();
    }

    /** Generisches Hinzufügen; gibt `this` zurück (chainbar). */
    add(severity, message, { code = null, context = null } = {}) {
        const key = `${severity}|${code ?? message}`;
        if (this._seen.has(key)) return this;          // Duplikate unterdrücken
        this._seen.add(key);
        this.issues.push({ severity, message, code, context });
        return this;
    }

    info(message, opts)  { return this.add(Severity.INFO,  message, opts); }
    warn(message, opts)  { return this.add(Severity.WARN,  message, opts); }
    error(message, opts) { return this.add(Severity.ERROR, message, opts); }

    /** Übernimmt die Issues eines anderen Collectors (mit Dedup). */
    merge(other) {
        if (!other?.issues) return this;
        for (const i of other.issues) this.add(i.severity, i.message, { code: i.code, context: i.context });
        return this;
    }

    has(severity)        { return this.issues.some(i => i.severity === severity); }
    bySeverity(severity) { return this.issues.filter(i => i.severity === severity); }
    get count()          { return this.issues.length; }

    /** Höchster vorhandener Schweregrad (oder null bei keinem Issue). */
    get maxSeverity() {
        return this.issues.reduce(
            (m, i) => (m === null || RANK[i.severity] > RANK[m]) ? i.severity : m,
            /** @type {string|null} */ (null),
        );
    }

    /** Rückwärtskompatibel: nur die Nachrichten als String[] (alte Log-Konsumenten). */
    get messages() { return this.issues.map(i => i.message); }
}

// ─────────────────────────────────────────────────────────────────────────────
// Reine Regeln — überall einsetzbar (UI live, Pipeline, Test)
// ─────────────────────────────────────────────────────────────────────────────

const shortId = (id) => String(id ?? '??').substring(0, 8);

/** Spannweite (Querausdehnung) einer Brücke aus ihrer Achse [m]. */
export function bridgeSpan(bridge) {
    const axis = bridge?.axis;
    if (Array.isArray(axis) && axis.length >= 2) {
        let len = 0;
        for (let i = 0; i < axis.length - 1; i++) {
            len += Math.hypot(axis[i + 1].x - axis[i].x, axis[i + 1].y - axis[i].y);
        }
        return len;
    }
    // Fallback: BBox-Diagonale der Footprint-Zellen (Alt-Projekte ohne Achse)
    const cells = bridge?.cells;
    if (Array.isArray(cells) && cells.length) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const c of cells) {
            if (c.x < minX) minX = c.x; if (c.x > maxX) maxX = c.x;
            if (c.y < minY) minY = c.y; if (c.y > maxY) maxY = c.y;
        }
        return Math.hypot(maxX - minX, maxY - minY);
    }
    return 0;
}

/**
 * Leichter Live-Check fürs SGC-Panel: Passt die Brücke quer in das gezeichnete
 * Gerinne? Reine Heuristik aus Achslänge vs. Gerinnebreite — die maßgebliche
 * Prüfung (Raster-Überlappung) macht später generateWeirFile beim Clippen.
 *
 * @param {Array} bridges            geoStore.bridges
 * @param {{width:number}} channelParams  bathyStore.channelParams
 * @param {IssueCollector} [collector]
 * @returns {IssueCollector}
 */
export function validateBridgeChannelFit(bridges, channelParams, collector = new IssueCollector()) {
    const chW = channelParams?.width ?? 0;
    if (!chW || !Array.isArray(bridges) || !bridges.length) return collector;

    for (const b of bridges) {
        const span = bridgeSpan(b);
        if (span > chW * 1.05) {
            collector.warn(
                `Brücke ${shortId(b.id)} ist ~${span.toFixed(1)} m breit, das Gerinne nur ${chW.toFixed(1)} m — ` +
                `die über die Ufer ragenden Brückenzellen liegen nicht über dem Sub-Grid-Gerinne und werden beim Export verworfen. ` +
                `Gerinnebreite erhöhen oder Brücke kürzen.`,
                { code: `bridge-fit-${b.id}`, context: { bridgeId: b.id, span, channelWidth: chW } },
            );
        }
    }
    return collector;
}

/**
 * Validiert die Zufluss-/Abfluss-Hydraulik im Kanten-Segment-Modell:
 *  - Segment als Kante markiert (properties.edge), liegt aber nicht auf dem Rasterrand → WARN
 *    (Ablauf-Typen bekommen die schärfere Formulierung, s.u.)
 *  - innenliegender Ablauf (edge=null): OUTFLOW_FREE mit literalEdgeArc → keine Meldung
 *    (garantiert gültige Kantenzellen); mit nearFront (kein literalEdgeArc) → INFO (bekommt
 *    beim Export normalerweise eine DIREKTE Punkt-FREE mit Richtungs-Token an genau dieser
 *    Zelle, quagg-outflow-free-direction.patch — nur eine reine Diagonal-Eckzelle fällt auf
 *    eine Projektion auf die nächste Kante zurück; s. useOutflowPickerTool.js); weder noch →
 *    ERROR (unklare Snap-Ziel-Kante). WATERLEVEL_FIX → INFO bei nearFront/literalEdgeArc
 *    (bewusst unterstützte Platzierung bei irregulärem/geclipptem Gelände), sonst WARN
 *    (HVAR/HFIX funktionieren technisch als Innen-Punktquelle, reine Modell-Konsistenz-
 *    Abweichung, kein Solver-Risiko)
 *  - zwei Segmente überlappen auf derselben Kante → WARN (erstes gewinnt, zweites verliert Zellen)
 *  - outflowSlope ≤ 0 → ERROR (kein Höchstwert — der Solver kennt kein Sf-Limit)
 *
 * Reine Regel ohne Seiteneffekte; `header` optional (nur für Kanten-/Überlappungsprüfung).
 *
 * @param {Object<string,object>} assignments  hydStore.assignments
 * @param {Array<object>} boundaries           geoStore.boundaries.features
 * @param {object} [header]                     Raster-Header (ncols/nrows/cellsize/xll/yll)
 * @param {IssueCollector} [collector]
 * @returns {IssueCollector}
 */
export function validateBoundaryHydraulics(assignments, boundaries, header = null, collector = new IssueCollector()) {
    const byId = new Map((boundaries || []).map(b => [b.id, b]));
    const xll = header ? (header.xll !== undefined ? header.xll : header.xllcorner) : 0;
    const yll = header ? (header.yll !== undefined ? header.yll : header.yllcorner) : 0;

    // Für Überlappungsprüfung: belegte Intervalle je Kante sammeln.
    const edgeIntervals = { N: [], S: [], E: [], W: [] };

    for (const [id, assign] of Object.entries(assignments || {})) {
        if (!assign) continue;
        const b = byId.get(id);
        const declaredEdge = b?.properties?.edge;

        // ── Boundary außerhalb des Rasters? (gilt für Zu- UND Auslauf) ────────
        if (header && b?.geometry) {
            const allCells = boundaryCellsOf(b, header, xll, yll);
            if (allCells.length) {
                const outside = allCells.filter(
                    c => c.x < 0 || c.x >= header.ncols || c.y < 0 || c.y >= header.nrows,
                ).length;
                if (outside === allCells.length) {
                    collector.error(
                        `Boundary ${shortId(id)} liegt vollständig außerhalb des Rasters — wird ignoriert. ` +
                        `Innerhalb des Geländes (neu) zeichnen.`,
                        { code: `bnd-outside-${id}`, context: { boundaryId: id } },
                    );
                } else if (outside > 0) {
                    collector.warn(
                        `Boundary ${shortId(id)}: ${outside} von ${allCells.length} Zellen liegen außerhalb des ` +
                        `Rasters und werden abgeschnitten.`,
                        { code: `bnd-clip-${id}`, context: { boundaryId: id, outside, total: allCells.length } },
                    );
                }
            }
        }

        // ── Kanten-Segment: liegt es wirklich auf der Kante? ─────────────────
        if (declaredEdge && header && b?.geometry?.type === 'LineString') {
            const cells = BoundaryTools.discretizePolyline(b.geometry.coordinates, header.cellsize, xll, yll);
            const onEdge = cells.filter(c => cellEdge(header, c.x, c.y) === declaredEdge);
            if (cells.length > 0 && onEdge.length === 0) {
                const isAblauf = assign.type === 'OUTFLOW_FREE' || assign.type === 'WATERLEVEL_FIX';
                const label = isAblauf ? 'Ablauf' : 'Segment';
                const consequence = isAblauf
                    ? (assign.type === 'OUTFLOW_FREE'
                        ? 'wird automatisch auf die nächste Rasterkante verschoben (Lage weicht ggf. von der Zeichnung ab)'
                        : 'wird als interne Punktquelle behandelt')
                    : 'wird als interne Punktquelle behandelt (Impuls bleibt über die Fließrichtung erhalten, falls gesetzt)';
                collector.warn(
                    `${label} ${shortId(id)} ist als Kante '${declaredEdge}' markiert, liegt aber nicht auf dem Rasterrand — ` +
                    `${consequence}. Näher an den Rand zeichnen.`,
                    { code: `seg-off-edge-${id}`, context: { boundaryId: id, edge: declaredEdge } },
                );
            } else if (onEdge.length > 0) {
                edgeIntervals[declaredEdge].push({ id, intervals: mergeCellsToIntervals(onEdge, declaredEdge, header) });
            }
        }

        // ── Innenliegender Ablauf ─────────────────────────────────────────────
        // FREE ist solverseitig NUR als echte Rand-Bedingung gültig (Punktquelle wird vom
        // LISFLOOD-Parser verworfen) — ABER seit dem Ablauf-Picker (literalEdgeArc/
        // perimeterCells+nearFront, useOutflowPickerTool.js) projiziert InputGenerator.js
        // jede Front-Innenzelle EINZELN auf ihre nächste gültige Kantenzelle
        // (_accumulateFreeAtNearestEdge) — das ist der NORMALE, beabsichtigte Pfad für ein
        // schiefes/rotiertes DGM, keine Rettungsaktion für einen seltenen Sonderfall mehr.
        // Dreistufig wie outflowEligibility in BoundaryConfig.vue/AssignmentModal.vue:
        // literalEdgeArc vorhanden ⇒ exakter Randbogen, gar keine Meldung nötig; nearFront
        // ohne literalEdgeArc ⇒ funktioniert, landet aber ggf. an anderer Stelle (INFO);
        // weder noch ⇒ echte Abweichung vom Ablauf-Modell (ERROR — hier weiß InputGenerator.js
        // nicht mal, auf welche Kante projizieren, Snap kann beliebig weit/instabil ausfallen).
        // WATERLEVEL_FIX (HVAR/HFIX) funktioniert ohnehin technisch als Innen-Punktquelle,
        // unverändert dreistufig wie zuvor.
        if ((assign.type === 'OUTFLOW_FREE' || assign.type === 'WATERLEVEL_FIX') && (declaredEdge === null || declaredEdge === undefined)) {
            const nearFront = !!b?.properties?.nearFront;
            const hasLiteralEdgeArc = !!b?.properties?.literalEdgeArc?.length;
            if (assign.type === 'OUTFLOW_FREE' && hasLiteralEdgeArc) {
                // Randbogen aufgelöst — garantiert gültige Kantenzellen, keine Abweichung.
            } else if (assign.type === 'OUTFLOW_FREE' && nearFront) {
                collector.info(
                    `Auslauf ${shortId(id)}: liegt nahe der (ggf. irregulären) Geländegrenze statt der Rasterkante — ` +
                    `wird beim Export direkt an dieser Stelle als Punkt-Randbedingung mit Richtung gesetzt. Nur eine ` +
                    `reine Diagonal-Eckzelle ohne direkten Geländeabschluss würde stattdessen auf die nächste ` +
                    `Rasterkante ausweichen. Bei schiefem/geclipptem Gelände eine unterstützte, beabsichtigte Platzierung.`,
                    { code: `ablauf-interior-${id}`, context: { boundaryId: id, type: assign.type, nearFront } },
                );
            } else if (assign.type === 'OUTFLOW_FREE') {
                collector.error(
                    `Auslauf ${shortId(id)}: innenliegend — FREE ist nur als echter Modellrand oder nahe der ` +
                    `Geländegrenze gültig und wird beim Export automatisch auf die nächste Rasterkante verschoben ` +
                    `(Lage weicht ggf. stark von der Zeichnung ab). Auf den Rasterrand/die Geländegrenze zeichnen, ` +
                    `um die Lage selbst zu kontrollieren.`,
                    { code: `ablauf-interior-${id}`, context: { boundaryId: id, type: assign.type, nearFront } },
                );
            } else if (nearFront) {
                collector.info(
                    `Ablauf ${shortId(id)} (Pegel): liegt nahe der (ggf. irregulären) Geländegrenze statt der ` +
                    `Rasterkante — wird als interne Punktquelle simuliert. Bei geclipptem/irregulärem Gelände eine ` +
                    `unterstützte, beabsichtigte Platzierung.`,
                    { code: `ablauf-interior-${id}`, context: { boundaryId: id, type: assign.type, nearFront } },
                );
            } else {
                collector.warn(
                    `Ablauf ${shortId(id)} (Pegel): innenliegend — wird als interne Punktquelle simuliert (technisch ` +
                    `gültig), weicht aber vom Ablauf-Modell (nur Modellkante/Geländegrenze) ab. Auf den Rasterrand ` +
                    `zeichnen oder Zufluss nutzen.`,
                    { code: `ablauf-interior-${id}`, context: { boundaryId: id, type: assign.type, nearFront } },
                );
            }
        }

        // ── Abfluss-Sohlgefälle ──────────────────────────────────────────────
        if (assign.type === 'OUTFLOW_FREE' && assign.outflowSlope !== undefined && assign.outflowSlope !== null) {
            const sf = Number(assign.outflowSlope);
            if (!Number.isFinite(sf) || sf <= 0) {
                collector.error(
                    `Auslauf ${shortId(id)}: Sohlgefälle Sf=${assign.outflowSlope} ist ungültig (muss > 0 sein). ` +
                    `Wert korrigieren oder leer lassen (Standard: steiles Sicherheitsgefälle, verhindert Rückstau).`,
                    { code: `outflow-slope-${id}`, context: { boundaryId: id, outflowSlope: assign.outflowSlope } },
                );
            }
        }
    }

    // ── Überlappende Segmente auf derselben Kante ────────────────────────────
    for (const edge of ['N', 'S', 'E', 'W']) {
        const segs = edgeIntervals[edge];
        for (let i = 0; i < segs.length; i++) {
            for (let j = i + 1; j < segs.length; j++) {
                if (intervalsOverlap(segs[i].intervals, segs[j].intervals)) {
                    collector.warn(
                        `Segmente ${shortId(segs[i].id)} und ${shortId(segs[j].id)} überlappen auf der Kante '${edge}' — ` +
                        `das zuerst verarbeitete gewinnt, das andere verliert die geteilten Zellen.`,
                        { code: `edge-overlap-${edge}-${segs[i].id}-${segs[j].id}`, context: { edge } },
                    );
                }
            }
        }
    }

    return collector;
}

/**
 * Prüft, ob jeder aktive Zu-/Wasserstand-Rand auch eine Datenquelle hat. Ohne
 * zugewiesene Ganglinie UND ohne konstanten Wert würde der Rand im Export still
 * verworfen (InputGenerator: warn + continue) — der Nutzer zeichnet eine Boundary,
 * die nie simuliert wird. Diese Regel hebt das als ERROR ins Pre-Run-Gate.
 *
 * Spiegelt die Quell-Auflösung von generateBoundaryFiles:
 *   - OUTFLOW_FREE / NONE      → keine Quelle nötig
 *   - INFLOW_* / WATERLEVEL_*  → konstanter Wert (→ synthetische Ganglinie) ODER
 *                                profileId mit echten Stützstellen
 *
 * @param {Object<string,object>} assignments
 * @param {Array<object>} boundaries   geoStore.boundaries.features
 * @param {Object<string,object>} ganglinien
 * @param {IssueCollector} [collector]
 * @returns {IssueCollector}
 */
export function validateBoundaryProfiles(assignments, boundaries, ganglinien = {}, collector = new IssueCollector()) {
    const byId = new Map((boundaries || []).map(b => [b.id, b]));
    for (const [id, assign] of Object.entries(assignments || {})) {
        if (!assign || !assign.type) continue;
        const t = assign.type;
        if (t === 'NONE' || t === 'OUTFLOW_FREE') continue;     // braucht keine Quelle
        if (!byId.has(id)) continue;                            // verwaiste Zuweisung (Boundary gelöscht)
        const needsSource = t.startsWith('INFLOW') || t.includes('WATERLEVEL');
        if (!needsSource) continue;

        const val = assign.value;
        const hasConstValue = val !== undefined && val !== null && Number.isFinite(parseFloat(val));
        const prof = assign.profileId ? (ganglinien || {})[assign.profileId] : null;
        const hasProfileData = Array.isArray(prof?.data) && prof.data.length > 0;

        if (!hasConstValue && !hasProfileData) {
            collector.error(
                `Boundary ${shortId(id)} (${t}): keine Ganglinie und kein konstanter Wert zugewiesen — ` +
                `sie würde NICHT simuliert. Im Boundary-Panel eine Ganglinie wählen oder einen Wert eintragen.`,
                { code: `bnd-no-source-${id}`, context: { boundaryId: id, type: t } },
            );
        }
    }
    return collector;
}

/** Überlappen zwei Listen von Welt-Intervallen [a,b]? */
function intervalsOverlap(ivA, ivB) {
    for (const a of ivA) for (const b of ivB) {
        if (a.a < b.b && b.a < a.b) return true;
    }
    return false;
}

// ─── Geometrie-Helfer (geteilt zwischen den Boundary-Regeln) ──────────────────

/** Gelände-Höhe an Weltkoordinate (x,y) aus dem DEM-Raster (row 0 = Süd), oder null. */
function demZAt(demGrid, header, x, y) {
    if (!demGrid || !header) return null;
    const xll = header.xll !== undefined ? header.xll : header.xllcorner;
    const yll = header.yll !== undefined ? header.yll : header.yllcorner;
    const col = Math.round((x - xll) / header.cellsize);
    const row = Math.round((y - yll) / header.cellsize);   // bottom-up wie worldToCell
    if (col < 0 || col >= header.ncols || row < 0 || row >= header.nrows) return null;
    const z = demGrid[row * header.ncols + col];
    return (z != null && z > -9000) ? z : null;
}

/** Rasterzellen einer Boundary (LineString → Bresenham, Point → eine Zelle), bottom-up. */
function boundaryCellsOf(b, header, xll, yll) {
    if (!b?.geometry || !header) return [];
    if (b.geometry.type === 'LineString') {
        return BoundaryTools.discretizePolyline(b.geometry.coordinates, header.cellsize, xll, yll);
    }
    if (b.geometry.type === 'Point') {
        const c = b.geometry.coordinates;
        return [{ x: Math.floor((c[0] - xll) / header.cellsize), y: Math.floor((c[1] - yll) / header.cellsize) }];
    }
    return [];
}

/** Welt-Azimut eines gerichteten Zuflusses (0=Ost,90=Nord) oder null (nicht gerichtet/kein Inflow). */
function inflowAzimuth(assign) {
    if (!assign || (assign.type !== 'INFLOW_CONSTANT' && assign.type !== 'INFLOW_DYNAMIC')) return null;
    const a = assign.flowAngleDeg;
    if (Number.isFinite(a)) return ((a % 360) + 360) % 360;
    const LEGACY = { E: 0, N: 90, W: 180, S: 270 };
    return (assign.flowDir in LEGACY) ? LEGACY[assign.flowDir] : null;
}

/** Kleinste Winkeldifferenz zweier Azimute in Grad (0..180). */
function angleDiff(a, b) {
    const d = Math.abs(((a - b) % 360 + 360) % 360);
    return Math.min(d, 360 - d);
}

/**
 * Nozzle-Tauglichkeit gerichteter Zuläufe prüfen (s. buildInflowBackBarriers).
 * Erkennt die geometrischen Konstellationen, bei denen die 3-seitige Düsen-Wand
 * sinnlos/unbrauchbar wird — BEVOR ein Run verbrannt wird:
 *   1. Segment läuft längs zur Fließrichtung → Wand degeneriert zum Korridor.
 *   2. zwei benachbarte Zuläufe mit gegensätzlicher Richtung → Wand dazwischen entfällt.
 *   3. geschlossene/Ring-Polylinie → eingeschlossene Tasche.
 * Reine Regel, keine Seiteneffekte.
 */
export function validateInflowNozzles(assignments, boundaries, header = null, collector = new IssueCollector()) {
    const byId = new Map((boundaries || []).map(b => [b.id, b]));
    const xll = header ? (header.xll !== undefined ? header.xll : header.xllcorner) : 0;
    const yll = header ? (header.yll !== undefined ? header.yll : header.yllcorner) : 0;
    const cs = header?.cellsize ?? 1;

    const cellOwner = new Map(); // "x,y" → { id, az }

    for (const [id, assign] of Object.entries(assignments || {})) {
        const az = inflowAzimuth(assign);
        if (az === null) continue;              // nur GERICHTETE Zuläufe haben eine Nozzle-Wand
        const b = byId.get(id);
        if (!b?.geometry) continue;

        if (b.geometry.type === 'LineString') {
            const coords = b.geometry.coordinates;
            const fx = Math.cos(az * Math.PI / 180), fy = Math.sin(az * Math.PI / 180);

            // 1. längs zur Fließrichtung? align = |t·flow| (0=⟂ ideal, 1=∥ schlecht)
            let worst = 0;
            for (let i = 0; i < coords.length - 1; i++) {
                const dx = coords[i + 1][0] - coords[i][0], dy = coords[i + 1][1] - coords[i][1];
                const len = Math.hypot(dx, dy);
                if (len < 1e-9) continue;
                worst = Math.max(worst, Math.abs((dx * fx + dy * fy) / len));
            }
            if (worst > 0.707) { // Winkel zur Strömung < 45°
                collector.warn(
                    `Zulauf ${shortId(id)}: läuft längs zur Fließrichtung (Winkel < 45°) — die Nozzle-Wand ` +
                    `degeneriert zum Korridor (Wasser staut sich, tritt nur an der Spitze aus). Zulauflinie quer ` +
                    `zur Strömung zeichnen oder Richtung anpassen.`,
                    { code: `nozzle-parallel-${id}`, context: { boundaryId: id, azimuth: az } },
                );
            }

            // 3. geschlossener Ring?
            const a0 = coords[0], aN = coords[coords.length - 1];
            if (coords.length >= 4 && Math.hypot(a0[0] - aN[0], a0[1] - aN[1]) < cs * 0.5) {
                collector.warn(
                    `Zulauf ${shortId(id)}: Polylinie ist geschlossen (Ring) — die Nozzle-Wand schließt eine ` +
                    `Innentasche ein, gerichteter Austritt ist nicht möglich. Offene Linie quer zur Strömung verwenden.`,
                    { code: `nozzle-closed-${id}`, context: { boundaryId: id } },
                );
            }
        }

        if (header) {
            for (const c of boundaryCellsOf(b, header, xll, yll)) cellOwner.set(`${c.x},${c.y}`, { id, az });
        }
    }

    // 2. benachbarte Zuläufe mit gegensätzlicher Richtung (globaler Inflow-Set öffnet die Wand dazwischen)
    if (header) {
        const reported = new Set();
        const NB = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        for (const [key, owner] of cellOwner) {
            const [cx, cy] = key.split(',').map(Number);
            for (const [dx, dy] of NB) {
                const n = cellOwner.get(`${cx + dx},${cy + dy}`);
                if (!n || n.id === owner.id) continue;
                if (angleDiff(owner.az, n.az) <= 45) continue;
                const pair = [owner.id, n.id].sort().join('|');
                if (reported.has(pair)) continue;
                reported.add(pair);
                collector.warn(
                    `Zuläufe ${shortId(owner.id)} und ${shortId(n.id)} grenzen aneinander, zeigen aber in ` +
                    `unterschiedliche Richtungen (Δ≈${Math.round(angleDiff(owner.az, n.az))}°) — die Wand zwischen ` +
                    `ihnen entfällt (intern), Wasser leckt/kollidiert. Abstand lassen oder gleiche Richtung wählen.`,
                    { code: `nozzle-conflict-${pair}`, context: { a: owner.id, b: n.id } },
                );
            }
        }
    }
    return collector;
}

/**
 * Validiert Wehr-Öffnungen (Durchlässe/Rohre) gegen Krone und Gelände, BEVOR der
 * Run startet. Die Editor-Geometrie (clampOpening) hält die Öffnung beim Ziehen im
 * Wehr, aber importierte/alte Daten können verletzen:
 *   - Soffitte über der Krone → kein Durchlass mehr (Wasser ginge über das Wehr) → ERROR
 *   - Soffitte ≤ Gelände      → kein lichter Querschnitt → Orifice-Instabilität → ERROR
 *   - Breite ≤ 0              → degenerierte Öffnung → WARN
 *
 * Reine Regel ohne Seiteneffekte; `header`/`demGrid` optional (ohne sie entfällt nur
 * die Gelände-Prüfung).
 *
 * @param {Array<object>} weirLines  geoStore.weirLines (mit points + openings)
 * @param {object} [header]          Raster-Header (für Gelände-Sampling)
 * @param {Float32Array|Array|null} [demGrid]  Terrain (row 0 = Süd) oder null
 * @param {IssueCollector} [collector]
 * @returns {IssueCollector}
 */
export function validateWeirOpenings(weirLines, header = null, demGrid = null, collector = new IssueCollector()) {
    for (const line of (weirLines || [])) {
        const openings = line?.openings || [];
        if (!openings.length || !Array.isArray(line.points) || line.points.length < 2) continue;
        for (let k = 0; k < openings.length; k++) {
            const o = openings[k];
            if (!o) continue;
            const soffit = openingSoffit(o);
            const crest = crestZAt(line.points, o.x, o.y) ?? line.hc;
            const terrainZ = demZAt(demGrid, header, o.x, o.y);
            const tag = `${shortId(line.id)}#${k + 1}`;

            if (Number.isFinite(crest) && soffit > crest + 1e-6) {
                collector.error(
                    `Wehr-Öffnung ${tag}: Soffitte ${soffit.toFixed(2)} m liegt über der Krone ${crest.toFixed(2)} m — ` +
                    `das ist kein Durchlass (Wasser ginge über das Wehr). Soffitte absenken.`,
                    { code: `weir-open-above-crest-${line.id}-${k}`, context: { lineId: line.id, opening: k } },
                );
            }
            if (terrainZ !== null && soffit <= terrainZ + 1e-6) {
                collector.error(
                    `Wehr-Öffnung ${tag}: Soffitte ${soffit.toFixed(2)} m liegt auf/unter Gelände ${terrainZ.toFixed(2)} m — ` +
                    `kein lichter Querschnitt (Orifice-Instabilität). Soffitte anheben.`,
                    { code: `weir-open-below-terrain-${line.id}-${k}`, context: { lineId: line.id, opening: k } },
                );
            }
            if (!(openingWidth(o) > 0)) {
                collector.warn(
                    `Wehr-Öffnung ${tag}: Breite ist 0 — degenerierte Öffnung, wird vom Solver ignoriert.`,
                    { code: `weir-open-zero-width-${line.id}-${k}`, context: { lineId: line.id, opening: k } },
                );
            }
        }
    }
    return collector;
}
