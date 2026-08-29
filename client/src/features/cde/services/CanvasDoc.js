/**
 * CanvasDoc — jsPDF-Teilmenge auf einem 2D-Canvas (Sprint P, AP-3).
 *
 * WARUM DAS SO GEBAUT IST
 * Der Vektor-Plotter (`IfcVectorPlotter.drawVectorPlan`) importiert jsPDF nicht;
 * er bekommt `doc` als Parameter und nutzt nur elf Methoden. Genau diese elf
 * bietet dieser Adapter an — plus die vier, die Plankopf und Wasserzeichen
 * brauchen. Damit zeichnet der Bildschirmplan durch DIESELBE Routine wie der
 * PDF-Export.
 *
 * Das ist keine Bequemlichkeit, sondern der Kern der Sache: Strichstärken nach
 * DIN 1356-1, Schraffurabstände, Halo-Technik, Label-Kollisionsvermeidung und
 * die 0,55-Zeichenbreiten-Schätzung sind Fachlogik. Eine zweite Zeichenroutine
 * für den Bildschirm wäre eine Kopie davon — und Kopien driften. Der bisherige
 * HTML-Plankopf in der Export-Vorschau ist genau so gedriftet (die Rev.-Spalte
 * saß woanders als im echten PDF). Was hier gezeichnet wird, IST der Plan.
 *
 * Einheiten: Der Plotter rechnet durchweg in Papier-Millimetern. Der Adapter
 * skaliert am Rand nach Pixeln (`pxProMm`) — nicht über `ctx.scale()`, weil
 * das auch die Linienbreiten mitskalieren würde und die Haarlinien-Klemme
 * unwirksam machte.
 */

/** jsPDF-Farbargumente → CSS. Ein Argument = Graustufe, drei = RGB. */
function zuCss(...args) {
    if (args.length === 0) return '#000';
    if (args.length === 1) {
        const v = typeof args[0] === 'number' ? Math.round(args[0]) : 0;
        return `rgb(${v},${v},${v})`;
    }
    const [r, g, b] = args;
    return `rgb(${Math.round(r ?? 0)},${Math.round(g ?? 0)},${Math.round(b ?? 0)})`;
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} opts
 * @param {number} opts.pxProMm    Bildschirmzoom: Pixel je Papier-Millimeter
 * @param {number} [opts.minStrichPx=1]  Haarlinien-Klemme (siehe unten)
 */
export function erstelleCanvasDoc(ctx, { pxProMm, minStrichPx = 1 } = {}) {
    const s = (mm) => mm * pxProMm;              // Papier-mm → Pixel

    let zeichenFarbe = '#000';
    let fuellFarbe = '#000';
    let textFarbe = '#000';
    let strichMm = 0.25;
    let schriftMm = 2.2;
    let deckkraft = 1;

    // ── Linienpuffer ────────────────────────────────────────────────────────
    // Der Plotter zeichnet jede Ringkante als eigenen `line()`-Aufruf
    // (IfcVectorPlotter.js:888) — im PDF ist das gleichgültig, auf Canvas wären
    // das bei einem mittleren Modell schnell sechsstellig viele `stroke()`.
    // Hier laufen alle Linien gleichen Stils in EINEN Pfad; gestrichen wird
    // erst beim Stilwechsel, beim nächsten anderen Primitiv oder am Bildende.
    let offen = false;
    let letzterX = NaN, letzterY = NaN;

    function flush() {
        if (!offen) return;
        ctx.strokeStyle = zeichenFarbe;
        ctx.lineWidth = Math.max(s(strichMm), minStrichPx);
        ctx.stroke();
        offen = false;
        letzterX = NaN; letzterY = NaN;
    }

    /** Vor jedem Nicht-Linien-Primitiv und jeder Stiländerung. */
    function unterbrich() { flush(); }

    function setzeSchrift() {
        ctx.font = `${s(schriftMm)}px Helvetica, Arial, sans-serif`;
    }
    setzeSchrift();

    const doc = {
        // ── Stil ────────────────────────────────────────────────────────────
        setDrawColor(...a) { unterbrich(); zeichenFarbe = zuCss(...a); },
        setFillColor(...a) { unterbrich(); fuellFarbe = zuCss(...a); },
        setTextColor(...a) { unterbrich(); textFarbe = zuCss(...a); },

        setLineWidth(mm) {
            unterbrich();
            strichMm = mm;
        },

        setLineDashPattern(arr, phase = 0) {
            unterbrich();
            ctx.setLineDash(Array.isArray(arr) ? arr.map(v => s(v)) : []);
            ctx.lineDashOffset = s(phase ?? 0);
        },

        setFontSize(pt) {
            unterbrich();
            schriftMm = pt * 0.3528;             // jsPDF rechnet in Punkt
            setzeSchrift();
        },

        // ── Linien ──────────────────────────────────────────────────────────
        line(x1, y1, x2, y2) {
            const px1 = s(x1), py1 = s(y1), px2 = s(x2), py2 = s(y2);
            if (!offen) { ctx.beginPath(); offen = true; letzterX = NaN; }
            // Anschluss an die vorige Kante → durchgehender Pfad (saubere Ecken).
            // Das per-Kante-Clipping unterbricht die Kette von selbst; der
            // Endpunktvergleich fängt das ohne Sonderfall ab.
            if (px1 !== letzterX || py1 !== letzterY) ctx.moveTo(px1, py1);
            ctx.lineTo(px2, py2);
            letzterX = px2; letzterY = py2;
        },

        // ── Flächen ─────────────────────────────────────────────────────────
        circle(x, y, r, art = 'S') {
            unterbrich();
            ctx.beginPath();
            ctx.arc(s(x), s(y), s(r), 0, Math.PI * 2);
            male(art);
        },

        rect(x, y, w, h, art = 'S') {
            unterbrich();
            ctx.beginPath();
            ctx.rect(s(x), s(y), s(w), s(h));
            male(art);
        },

        /**
         * Polygonzug aus Deltas — jsPDFs `lines()`.
         *
         * Signatur wie dort: (deltas, startX, startY, skalierung, art,
         * geschlossen). Der Rotstift zeichnet damit seinen Strichumriss als
         * gefüllte Fläche; ohne diese Methode käme er im PDF an und am
         * Bildschirm nicht — genau die Art von Abweichung, die der
         * CanvasDoc-Adapter verhindern soll.
         */
        lines(deltas, x, y, skalierung = [1, 1], art = 'S', geschlossen = false) {
            unterbrich();
            if (!deltas?.length) return;
            const [sx, sy] = skalierung;
            ctx.beginPath();
            let cx = x, cy = y;
            ctx.moveTo(s(cx), s(cy));
            for (const d of deltas) {
                cx += d[0] * sx;
                cy += d[1] * sy;
                ctx.lineTo(s(cx), s(cy));
            }
            if (geschlossen) ctx.closePath();
            male(art);
        },

        triangle(x1, y1, x2, y2, x3, y3, art = 'S') {
            unterbrich();
            ctx.beginPath();
            ctx.moveTo(s(x1), s(y1));
            ctx.lineTo(s(x2), s(y2));
            ctx.lineTo(s(x3), s(y3));
            ctx.closePath();
            male(art);
        },

        // ── Text ────────────────────────────────────────────────────────────
        text(str, x, y, opts = {}) {
            unterbrich();
            const zeilen = opts.maxWidth ? umbrich(String(str), opts.maxWidth) : [String(str)];

            ctx.save();
            ctx.globalAlpha = deckkraft;
            ctx.fillStyle = textFarbe;
            ctx.textAlign = opts.align === 'center' ? 'center'
                          : opts.align === 'right' ? 'right' : 'left';
            ctx.textBaseline = opts.baseline === 'middle' ? 'middle' : 'alphabetic';

            ctx.translate(s(x), s(y));
            // VORZEICHEN: jsPDF dreht gegen den Uhrzeigersinn, Canvas mit dem
            // Uhrzeigersinn (weil Y nach unten zeigt). Der Plotter übergibt
            // durchweg `angle: -winkel` — ohne diese Negation steht jedes
            // gedrehte Label spiegelverkehrt zur Linie, an der es klebt.
            if (opts.angle) ctx.rotate(-opts.angle * Math.PI / 180);

            const zeilenHoehe = s(schriftMm * 1.15);
            zeilen.forEach((z, i) => ctx.fillText(z, 0, i * zeilenHoehe));
            ctx.restore();
        },

        // ── Blatt-Primitive (Plankopf, Wasserzeichen) ───────────────────────
        /**
         * Bild aufs Blatt. Signatur wie jsPDF in seiner LANGEN Form:
         * (bild, format, x, y, w, h). Das Format ignoriert der Canvas —
         * es steht nur da, damit Aufrufer nicht zwei Formen kennen muessen.
         *
         * `bild` muss etwas Zeichenbares sein (HTMLImageElement, ImageBitmap,
         * Canvas). Eine Data-URL kann `drawImage` NICHT — sie muesste erst
         * geladen werden, und Zeichnen ist hier synchron. Der Aufrufer loest
         * sie deshalb vorher auf (siehe IfcPlanCanvas).
         */
        addImage(bild, _format, x, y, w, h) {
            unterbrich();
            if (!bild || typeof bild === 'string') return;
            try {
                ctx.save();
                ctx.globalAlpha = deckkraft;
                ctx.drawImage(bild, s(x), s(y), s(w), s(h));
                ctx.restore();
            } catch {
                // Ein noch nicht fertig geladenes Bild darf den Plan nicht abbrechen.
            }
        },

        // jsPDF-Deckkraft: `doc.setGState(doc.GState({opacity}))`. Ohne diesen
        // Pfad greift im Exporter der Ersatzweg „helles Grau" und der Bildschirm
        // zeigte ein anderes Wasserzeichen als das PDF.
        GState: (o) => ({ ...o }),
        setGState(g) { unterbrich(); if (typeof g?.opacity === 'number') deckkraft = g.opacity; },
        saveGraphicsState() { unterbrich(); ctx.save(); },
        restoreGraphicsState() { unterbrich(); ctx.restore(); deckkraft = 1; },

        // ── Rahmenwerk ──────────────────────────────────────────────────────
        /** Am Ende des Bildes aufrufen — streicht den letzten offenen Pfad. */
        beende: flush,
    };

    function male(art) {
        ctx.globalAlpha = deckkraft;
        if (art === 'F' || art === 'FD') {
            ctx.fillStyle = fuellFarbe;
            ctx.fill();
        }
        if (art !== 'F') {                      // 'S' und 'FD' bekommen einen Rand
            ctx.strokeStyle = zeichenFarbe;
            ctx.lineWidth = Math.max(s(strichMm), minStrichPx);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
    }

    /**
     * Zeilenumbruch nach derselben 0,55-Schätzung, die der Plotter für die
     * Label-Kollision benutzt — NICHT nach `measureText`. Sonst bräche der
     * Bildschirm an anderen Stellen um als das PDF, und die Vorschau wäre
     * wieder nur ungefähr richtig. Der Preis: ein paar Zeichen Ungenauigkeit
     * bei sehr breiten Glyphen.
     */
    function umbrich(str, maxWidthMm) {
        const proZeile = Math.max(1, Math.floor(maxWidthMm / (0.55 * schriftMm)));
        if (str.length <= proZeile) return [str];
        const zeilen = [];
        let rest = str;
        while (rest.length > proZeile) {
            let schnitt = rest.lastIndexOf(' ', proZeile);
            if (schnitt <= 0) schnitt = proZeile;
            zeilen.push(rest.slice(0, schnitt).trimEnd());
            rest = rest.slice(schnitt).trimStart();
        }
        if (rest) zeilen.push(rest);
        return zeilen;
    }

    return doc;
}
