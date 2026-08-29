/**
 * DxfExporter — Vektor-Planinhalt als DXF R12 (Sprint T2).
 *
 * Warum DXF: Lagepläne müssen ins CAD/GIS des Auftraggebers — als
 * WEITERBEARBEITBARE Geometrie, nicht als PDF-Bild. R12-ASCII ist das
 * kompatibelste Format (AutoCAD, BricsCAD, QGIS lesen es alle).
 *
 * Koordinaten: DXF wird in ROH-Koordinaten geschrieben (E/N, Meter):
 *   E = welt.x + offset.x        N = −(welt.z + offset.z)
 * — dieselbe Konvention wie UtmGrid. Ein georeferenziertes Modell fällt damit
 * lagerichtig auf den amtlichen Lageplan; ohne Georeferenz (Offset 0) ist es
 * schlicht der Plan in Metern mit Nord oben.
 *
 * Texthöhen: Papier-mm × Maßstab / 1000 → plottet in der Zielgröße.
 *
 * Reines Modul — erzeugt einen String, keine DOM-Abhängigkeit.
 */

// ── ACI-Farbzuordnung (DXF R12 kennt nur Farbindizes) ───────────────────────
const ACI_PALETTE = [
    { i: 1, r: 255, g: 0, b: 0 },     { i: 2, r: 255, g: 255, b: 0 },
    { i: 3, r: 0, g: 255, b: 0 },     { i: 4, r: 0, g: 255, b: 255 },
    { i: 5, r: 0, g: 0, b: 255 },     { i: 6, r: 255, g: 0, b: 255 },
    { i: 7, r: 0, g: 0, b: 0 },       { i: 8, r: 128, g: 128, b: 128 },
    { i: 9, r: 192, g: 192, b: 192 }, { i: 30, r: 255, g: 128, b: 0 },
    { i: 34, r: 139, g: 87, b: 66 },  { i: 94, r: 0, g: 128, b: 64 },
    { i: 254, r: 80, g: 80, b: 80 },
];

export function nearestAci(r, g, b) {
    let best = 7, bestD = Infinity;
    for (const c of ACI_PALETTE) {
        const d = (c.r - r) ** 2 + (c.g - g) ** 2 + (c.b - b) ** 2;
        if (d < bestD) { bestD = d; best = c.i; }
    }
    return best;
}

const _n = (v) => Number(v.toFixed(3));

/**
 * DXF-Dokument-Builder: Layer registrieren, Entities anhängen, String bauen.
 */
export class DxfBuilder {
    constructor() {
        this._layers = new Map(); // name → aci
        this._ents = [];
    }

    layer(name, aci = 7) {
        const safe = String(name).replace(/[^A-Za-z0-9_\-ÄÖÜäöüß]/g, '_').slice(0, 31) || 'LAYER';
        if (!this._layers.has(safe)) this._layers.set(safe, aci);
        return safe;
    }

    line(layer, x1, y1, x2, y2) {
        this._ents.push(['0', 'LINE', '8', layer,
            '10', _n(x1), '20', _n(y1), '30', 0,
            '11', _n(x2), '21', _n(y2), '31', 0]);
    }

    /** 2D-Polylinie (R12: POLYLINE/VERTEX/SEQEND). points: [[x,y],…] */
    polyline(layer, points, closed = false) {
        if (!points || points.length < 2) return;
        const e = ['0', 'POLYLINE', '8', layer, '66', 1, '70', closed ? 1 : 0];
        for (const [x, y] of points) {
            e.push('0', 'VERTEX', '8', layer, '10', _n(x), '20', _n(y), '30', 0);
        }
        e.push('0', 'SEQEND', '8', layer);
        this._ents.push(e);
    }

    circle(layer, cx, cy, r) {
        this._ents.push(['0', 'CIRCLE', '8', layer, '10', _n(cx), '20', _n(cy), '30', 0, '40', _n(r)]);
    }

    /** Text, optional rotiert (Grad, CCW) und mittig ausgerichtet. */
    text(layer, x, y, height, value, rotationDeg = 0, centered = false) {
        const e = ['0', 'TEXT', '8', layer,
            '10', _n(x), '20', _n(y), '30', 0,
            '40', _n(height), '1', String(value)];
        if (rotationDeg) e.push('50', _n(rotationDeg));
        if (centered) e.push('72', 1, '11', _n(x), '21', _n(y), '31', 0);
        this._ents.push(e);
    }

    toString() {
        const out = [];
        // TABLES → LAYER
        out.push('0', 'SECTION', '2', 'TABLES', '0', 'TABLE', '2', 'LAYER', '70', this._layers.size);
        for (const [name, aci] of this._layers) {
            out.push('0', 'LAYER', '2', name, '70', 0, '62', aci, '6', 'CONTINUOUS');
        }
        out.push('0', 'ENDTAB', '0', 'ENDSEC');
        // ENTITIES
        out.push('0', 'SECTION', '2', 'ENTITIES');
        for (const e of this._ents) out.push(...e);
        out.push('0', 'ENDSEC', '0', 'EOF');
        return out.join('\n') + '\n';
    }
}

/**
 * Gesammelten Vektor-Planinhalt (collectVectorContent) in DXF wandeln.
 *
 * @param {object} content  { outlines, slopeSegments, contourLevels, axisItems,
 *                            sectionSegments, styleFor(category)→legacy }
 * @param {object} opts
 * @param {{x,z}} [opts.offset]      Koordinations-Offset (Welt → Roh)
 * @param {boolean} [opts.flipNorth=false]
 * @param {number} [opts.scaleRatio=100]  für Texthöhen (Papier-mm → Weltmeter)
 * @returns {string} DXF-Inhalt
 */
export function vectorContentToDxf(content, opts = {}) {
    const off = opts.offset ?? { x: 0, z: 0 };
    const flip = opts.flipNorth ?? false;
    const scale = opts.scaleRatio ?? 100;
    const E = (wx) => wx + off.x;
    const N = (wz) => (flip ? (wz + off.z) : -(wz + off.z));
    const th = (mm) => (mm * scale) / 1000; // Texthöhe Welt

    const dxf = new DxfBuilder();
    const styleFor = content.styleFor ?? (() => ({ r: 0, g: 0, b: 0 }));

    // Element-Konturen: Layer je IFC-Kategorie, Farbe aus dem Stil
    for (const o of (content.outlines ?? [])) {
        const st = styleFor(o.category) ?? {};
        if (st.enabled === false) continue;
        const layer = dxf.layer(o.category.replace(/^IFC/, ''), nearestAci(st.r ?? 0, st.g ?? 0, st.b ?? 0));
        for (const ring of (o.rings ?? [])) {
            if (ring.length < 2) continue;
            dxf.polyline(layer, ring.map(([u, v]) => [E(u), N(v)]), true);
        }
        const label = Array.isArray(o.label) ? o.label.join(' ') : o.label;
        if (label && o.bbox) {
            const cx = (o.bbox.minU + o.bbox.maxU) / 2;
            const cy = (o.bbox.minV + o.bbox.maxV) / 2;
            dxf.text(dxf.layer('BESCHRIFTUNG', 7), E(cx), N(cy), th(2.2), label, 0, true);
        }
    }

    // Schnittkontur
    if (content.sectionSegments?.length) {
        const layer = dxf.layer('SCHNITTKONTUR', 7);
        for (const s of content.sectionSegments) dxf.line(layer, E(s.x1), N(s.z1), E(s.x2), N(s.z2));
    }

    // Böschungsschraffur: getrennte Layer für Kanten und Striche
    if (content.slopeSegments?.length) {
        const layers = {
            oberkante:  dxf.layer('BOESCHUNG_OK', 34),
            unterkante: dxf.layer('BOESCHUNG_UK', 34),
            tick:       dxf.layer('BOESCHUNG_SCHRAFFUR', 94),
            tickHalf:   dxf.layer('BOESCHUNG_SCHRAFFUR', 94),
        };
        for (const s of content.slopeSegments) {
            dxf.line(layers[s.kind] ?? layers.tick, E(s.x1), N(s.z1), E(s.x2), N(s.z2));
        }
    }

    // Höhenlinien: Haupt/Neben getrennt, Kote als Text
    for (const lvl of (content.contourLevels ?? [])) {
        const layer = dxf.layer(lvl.major ? 'HOEHENLINIEN_HAUPT' : 'HOEHENLINIEN', 34);
        for (const chain of lvl.polylines) {
            dxf.polyline(layer, chain.map(p => [E(p.x), N(p.z)]), false);
        }
        if (lvl.major && lvl.polylines[0]?.length) {
            const p = lvl.polylines[0][Math.floor(lvl.polylines[0].length / 2)];
            dxf.text(dxf.layer('HOEHENLINIEN_KOTEN', 34), E(p.x), N(p.z), th(1.8), lvl.level.toFixed(2), 0, true);
        }
    }

    // Achs-Beschriftungen: Achse als Polylinie + rotierter Text
    for (const it of (content.axisItems ?? [])) {
        const layer = dxf.layer('HALTUNGSACHSEN', 30);
        dxf.polyline(layer, it.polyline.map(p => [E(p.x), N(p.z)]), false);
        if (it.label) {
            // längstes Segment für die Textlage
            let best = null, bestLen = 0;
            for (let i = 0; i + 1 < it.polyline.length; i++) {
                const a = it.polyline[i], b = it.polyline[i + 1];
                const len = Math.hypot(b.x - a.x, b.z - a.z);
                if (len > bestLen) { bestLen = len; best = [a, b]; }
            }
            if (best) {
                const mx = (best[0].x + best[1].x) / 2, mz = (best[0].z + best[1].z) / 2;
                let ang = Math.atan2(N(best[1].z) - N(best[0].z), E(best[1].x) - E(best[0].x)) * 180 / Math.PI;
                if (ang > 90) ang -= 180;
                if (ang <= -90) ang += 180;
                dxf.text(dxf.layer('HALTUNGSTEXT', 30), E(mx), N(mz), th(it.fontMm ?? 2.0), it.label, ang, true);
            }
        }
    }

    return dxf.toString();
}
