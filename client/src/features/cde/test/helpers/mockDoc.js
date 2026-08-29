/**
 * Aufnahmegerät für jsPDF-Zeichenaufrufe (Sprint P, AP-0).
 *
 * Der Vektor-Plotter importiert jsPDF nicht — er bekommt `doc` als Parameter
 * und nutzt nur eine kleine Teilmenge der Schnittstelle. Genau das macht ihn
 * prüfbar: Wir schieben ein Aufnahmegerät hinein und vergleichen die Aufrufe.
 *
 * Hochgezogen aus `test/planSymbols.test.js`, um zwei Dinge zu ergänzen, die
 * dort fehlten und beim Umbau zur Falle würden:
 *
 *  1. Die **Ein-Argument-Graustufenform**. jsPDF erlaubt `setDrawColor(0)`
 *     (= Schwarz) neben `setDrawColor(r,g,b)`; der Plotter nutzt beides
 *     (`IfcVectorPlotter.js:472` bzw. `:481`). Ein Adapter, der nur die
 *     Drei-Argument-Form kennt, malt lautlos in Weiß.
 *  2. Den **Stilzustand**. Ob eine Linie 0,13 mm oder 0,5 mm dick ist, steht
 *     nicht am `line()`-Aufruf, sondern in dem `setLineWidth()` davor. Ohne
 *     mitgeführten Zustand prüft man Geometrie, aber nie die Darstellung.
 *
 * Dieselbe Schnittstelle bedient später der CanvasDoc-Adapter (AP-3) — was
 * hier aufgezeichnet wird, muss dort gezeichnet werden.
 */

/** jsPDF-Farbargumente → {r,g,b}. Ein Argument = Graustufe, drei = RGB. */
export function normalisiereFarbe(...args) {
    if (args.length === 0) return { r: 0, g: 0, b: 0 };
    if (args.length === 1) {
        const v = typeof args[0] === 'number' ? args[0] : 0;
        return { r: v, g: v, b: v };
    }
    return { r: args[0] ?? 0, g: args[1] ?? 0, b: args[2] ?? 0 };
}

export function erstelleMockDoc() {
    const calls = [];

    // Laufender Stilzustand — wird bei jedem Zeichenaufruf mit eingefroren,
    // damit man hinterher fragen kann „wie dick war diese Linie?".
    const stil = {
        draw: { r: 0, g: 0, b: 0 },
        fill: { r: 0, g: 0, b: 0 },
        text: { r: 0, g: 0, b: 0 },
        breite: 0,
        dash: [],
        dashPhase: 0,
        fontPt: 0,
        alpha: 1,
    };

    const merken = (name, ...args) => {
        calls.push({ nr: calls.length, name, args, stil: momentaufnahme() });
    };
    const momentaufnahme = () => ({
        draw: { ...stil.draw }, fill: { ...stil.fill }, text: { ...stil.text },
        breite: stil.breite, dash: [...stil.dash], fontPt: stil.fontPt, alpha: stil.alpha,
    });

    const doc = {
        calls,

        // ── Stil-Setzer ──────────────────────────────────────────────────────
        setDrawColor: (...a) => { stil.draw = normalisiereFarbe(...a); merken('setDrawColor', ...a); },
        setFillColor: (...a) => { stil.fill = normalisiereFarbe(...a); merken('setFillColor', ...a); },
        setTextColor: (...a) => { stil.text = normalisiereFarbe(...a); merken('setTextColor', ...a); },
        setLineWidth: (w) => { stil.breite = w; merken('setLineWidth', w); },
        setLineDashPattern: (arr, phase) => {
            stil.dash = Array.isArray(arr) ? [...arr] : [];
            stil.dashPhase = phase ?? 0;
            merken('setLineDashPattern', arr, phase);
        },
        setFontSize: (pt) => { stil.fontPt = pt; merken('setFontSize', pt); },

        // ── Zeichner ─────────────────────────────────────────────────────────
        line: (x1, y1, x2, y2) => merken('line', x1, y1, x2, y2),
        circle: (x, y, r, art) => merken('circle', x, y, r, art),
        rect: (x, y, w, h, art) => merken('rect', x, y, w, h, art),
        triangle: (x1, y1, x2, y2, x3, y3, art) => merken('triangle', x1, y1, x2, y2, x3, y3, art),
        // Polygonzug aus Deltas — der Rotstift zeichnet damit seinen
        // Strichumriss als gefüllte Fläche (Sprint I, Stufe 7). Dass ein neues
        // Primitiv hier eingetragen werden MUSS, ist der Zweck dieser Datei:
        // sie ist der Vertrag darüber, welche jsPDF-Schnittstelle der Plotter
        // benutzt — und dieselbe muss der CanvasDoc-Adapter bedienen.
        lines: (deltas, x, y, skalierung, art, geschlossen) =>
            merken('lines', deltas, x, y, skalierung, art, geschlossen),
        text: (s, x, y, opts) => merken('text', s, x, y, opts),

        // ── Blatt-Primitive (Plankopf/Wasserzeichen, außerhalb drawVectorPlan) ─
        addImage: (...a) => merken('addImage', ...a),
        saveGraphicsState: () => merken('saveGraphicsState'),
        restoreGraphicsState: () => merken('restoreGraphicsState'),
        GState: (o) => { if (typeof o?.opacity === 'number') stil.alpha = o.opacity; return { ...o }; },
        setGState: (g) => merken('setGState', g),

        // ── Auswertung ───────────────────────────────────────────────────────
        /** Alle Aufrufe eines Primitivs. */
        nur: (name) => calls.filter(c => c.name === name),
        /** Anzahl der Aufrufe eines Primitivs. */
        zaehl: (name) => calls.filter(c => c.name === name).length,
        /** Index des ersten Aufrufs, der das Prädikat erfüllt (−1 = nie). */
        ersterIndex: (pred) => calls.findIndex(pred),
        /** Kompakte Form für Momentaufnahmen: ['line', 1, 2, 3, 4]. */
        knapp: (n = calls.length, ab = 0) =>
            calls.slice(ab, ab + n).map(c => [c.name, ...c.args.map(runden)]),
        /** Nur die Namen, in Aufrufreihenfolge. */
        namen: () => calls.map(c => c.name),
    };
    return doc;
}

/** Fließkomma-Rauschen aus Vergleichen halten (Papier-mm auf µm genau reicht). */
function runden(v) {
    if (typeof v === 'number') return Math.round(v * 1000) / 1000;
    if (Array.isArray(v)) return v.map(runden);
    return v;
}
