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
