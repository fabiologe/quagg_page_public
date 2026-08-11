/**
 * LaengsschnittPdf — Kanal-Längsschnitt und Querprofile als PDF (Sprint T2).
 *
 * Der klassische Bandschnitt: überhöhtes Profil (L z. B. 1:500, H 1:100)
 * mit Geländelinie, Haltungssohle, Schächten als Balken, Bezugshorizont —
 * darunter das Band mit Schachtname, Deckel-/Sohlhöhe, Station und den
 * Haltungsdaten (DN · Länge · Gefälle).
 *
 * Eigene Papier-Transform (sx/sy) — die Lageplan-Transform des Plotters ist
 * bewusst top-view-only; hier ist die X-Achse die STATION, nicht Welt-X.
 */

import { jsPDF } from 'jspdf';
import { pointAt, sohleAt } from './Laengsschnitt.js';
import { formatGefaelle } from './AxisAnnotations.js';

const PAPER = { A0: [841, 1189], A1: [594, 841], A2: [420, 594], A3: [297, 420], A4: [210, 297] };
const M = 10;          // Blattrand mm
const TB = 40;         // Schriftfeld mm (Layout wie IfcPdfExporter)
const BAND_ROWS = [    // Bandzeilen unter dem Profil
    { key: 'schacht', label: 'Schacht',      h: 7 },
    { key: 'deckel',  label: 'Deckel [m]',   h: 9 },
    { key: 'sohle',   label: 'Sohle [m]',    h: 9 },
    { key: 'station', label: 'Station [m]',  h: 9 },
    { key: 'haltung', label: 'Haltung',      h: 8 },
];
const BAND_H = BAND_ROWS.reduce((s, r) => s + r.h, 0);
const LABEL_COL = 26;  // linke Beschriftungsspalte des Bands

const H_SCALES = [100, 250, 500, 1000, 2000, 5000];
const V_SCALES = [50, 100, 200, 500];

const fmtH = (v) => Number(v).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * @param {object} opts
 * @param {object} opts.data        aus buildLaengsschnitt: { strang, terrain, manholes, yMin, yMax }
 * @param {object} opts.titleBlock
 * @param {string|null} opts.logo
 * @param {string} [opts.format='A3']
 * @param {number|null} [opts.scaleH=null]  null = automatisch blattfüllend
 * @param {number} [opts.scaleV=100]
 * @param {number} [opts.heightOffsetY=0]   Welt-Y → Rohhöhe (m NN): roh = y + offset
 */
export function exportLaengsschnittPDF({
    data, titleBlock = {}, logo = null, format = 'A3',
    scaleH = null, scaleV = 100, heightOffsetY = 0,
} = {}) {
    if (!data?.strang) return false;
    const { strang, terrain, manholes } = data;

    const [baseW, baseH] = PAPER[format] ?? PAPER.A3;
    const [pw, ph] = [Math.max(baseW, baseH), Math.min(baseW, baseH)]; // immer quer
    const doc = new jsPDF({ unit: 'mm', format: format.toLowerCase(), orientation: 'landscape' });
    const dw = pw - 2 * M;
    const dh = ph - 2 * M - TB;

    // ── Zeichenbereich ──────────────────────────────────────────────────────
    const x0 = M + LABEL_COL;
    const areaW = dw - LABEL_COL - 4;
    const bandTop = M + dh - BAND_H;
    const profTop = M + 12;
    const areaH = bandTop - profTop - 4;

    // Maßstäbe: H automatisch blattfüllend, V notfalls vergröbern
    const usedScaleH = scaleH
        ?? H_SCALES.find(s => (strang.length * 1000) / s <= areaW)
        ?? H_SCALES[H_SCALES.length - 1];
    const nn = (y) => y + heightOffsetY;               // Welt-Y → Höhe (m NN)
    const yMinNN = nn(data.yMin), yMaxNN = nn(data.yMax);
    // V-Maßstab: gewünschter Wert, notfalls vergröbern bis das Profil passt
    let usedScaleV = scaleV;
    const neededMm = ((yMaxNN - yMinNN) + 1.5) * 1000;
    while (neededMm / usedScaleV > areaH) {
        const next = V_SCALES.find(v => v > usedScaleV);
        if (!next) break;
        usedScaleV = next;
    }
    const bezug = Math.floor((yMinNN - 0.5) * 2) / 2;  // Bezugshorizont auf 0,5 m gerundet

    const sx = (s) => x0 + (s * 1000) / usedScaleH;
    const sy = (yNN) => bandTop - 6 - ((yNN - bezug) * 1000) / usedScaleV;

    // ── Rahmen + Bezugshorizont ─────────────────────────────────────────────
    doc.setDrawColor(0); doc.setLineWidth(0.5);
    doc.line(x0, sy(bezug), x0 + Math.min(areaW, (strang.length * 1000) / usedScaleH), sy(bezug));
    doc.setFontSize(7); doc.setTextColor(0);
    doc.text(`Bezugshorizont ${fmtH(bezug)} m`, x0 + 1, sy(bezug) + 3.2);

    doc.setFontSize(9);
    doc.text(
        `Kanal-Längsschnitt · L 1:${usedScaleH} / H 1:${usedScaleV} (${(usedScaleH / usedScaleV).toLocaleString('de-DE')}-fach überhöht)`,
        M + 2, M + 6,
    );

    // ── Geländelinie ────────────────────────────────────────────────────────
    if (terrain.length > 1) {
        doc.setDrawColor(109, 76, 65); doc.setLineWidth(0.35);
        for (let i = 0; i + 1 < terrain.length; i++) {
            doc.line(sx(terrain[i].s), sy(nn(terrain[i].y)), sx(terrain[i + 1].s), sy(nn(terrain[i + 1].y)));
        }
    }

    // ── Haltungssohle ───────────────────────────────────────────────────────
    doc.setDrawColor(0); doc.setLineWidth(0.5);
    const pts = strang.points;
    for (let i = 0; i + 1 < pts.length; i++) {
        doc.line(sx(pts[i].s), sy(nn(pts[i].y)), sx(pts[i + 1].s), sy(nn(pts[i + 1].y)));
    }

    // ── Schächte: Balken Sohle→Deckel + Stationslinie ins Band ─────────────
    doc.setFontSize(6.5);
    for (const mh of manholes) {
        const x = sx(mh.s);
        const yS = Number.isFinite(mh.sohle) ? sy(nn(mh.sohle)) : sy(bezug);
        const yD = Number.isFinite(mh.deckel) ? sy(nn(mh.deckel)) : yS - 5;
        doc.setFillColor(235, 235, 235);
        doc.setDrawColor(60, 60, 60); doc.setLineWidth(0.3);
        doc.rect(x - 1, yD, 2, Math.max(1, yS - yD), 'FD');
        // Stationslinie bis zur Band-Unterkante
        doc.setDrawColor(150, 150, 150); doc.setLineWidth(0.13);
        doc.setLineDashPattern([1, 1], 0);
        doc.line(x, yD, x, M + dh);
        doc.setLineDashPattern([], 0);
    }

    // ── Band ────────────────────────────────────────────────────────────────
    doc.setDrawColor(0); doc.setLineWidth(0.3);
    let rowY = bandTop;
    doc.setFontSize(6.5);
    for (const row of BAND_ROWS) {
        doc.line(M, rowY, M + dw, rowY);
        doc.setTextColor(60);
        doc.text(row.label, M + 1.5, rowY + row.h / 2 + 1);
        rowY += row.h;
    }
    doc.line(M + LABEL_COL - 2, bandTop, M + LABEL_COL - 2, bandTop + BAND_H);

    const rowBase = (key) => {
        let y = bandTop;
        for (const r of BAND_ROWS) {
            if (r.key === key) return { y, h: r.h };
            y += r.h;
        }
        return { y: bandTop, h: 7 };
    };

    // Schacht-Spaltenwerte (Höhen vertikal — klassische Banddarstellung)
    doc.setTextColor(0);
    for (const mh of manholes) {
        const x = sx(mh.s);
        const rSchacht = rowBase('schacht');
        doc.setFontSize(6.5);
        doc.text(String(mh.name ?? ''), x, rSchacht.y + rSchacht.h - 1.5, { align: 'center' });
        const vert = (key, val) => {
            if (!Number.isFinite(val)) return;
            const r = rowBase(key);
            doc.setFontSize(6);
            doc.text(fmtH(val), x + 1.6, r.y + r.h - 1, { angle: 90 });
        };
        vert('deckel', Number.isFinite(mh.deckel) ? nn(mh.deckel) : NaN);
        vert('sohle',  Number.isFinite(mh.sohle) ? nn(mh.sohle) : NaN);
        const rSt = rowBase('station');
        doc.setFontSize(6);
        doc.text(fmtH(mh.s), x + 1.6, rSt.y + rSt.h - 1, { angle: 90 });
    }

    // Haltungszeile: DN · Länge · Gefälle mittig zwischen den Stationen
    const rH = rowBase('haltung');
    doc.setFontSize(6.5);
    for (const pipe of strang.pipes) {
        const cx = sx((pipe.s0 + pipe.s1) / 2);
        const parts = [];
        if (pipe.item?.dn) parts.push(`DN ${pipe.item.dn}`);
        parts.push(`L=${(pipe.s1 - pipe.s0).toLocaleString('de-DE', { maximumFractionDigits: 1 })} m`);
        const gef = pipe.item?.gefaelle ?? null;
        if (gef != null) parts.push(formatGefaelle(gef));
        doc.text(parts.join(' · '), cx, rH.y + rH.h / 2 + 1, { align: 'center' });
    }

    _titleBlock(doc, dw, dh, {
        ...titleBlock,
        massstab: `L 1:${usedScaleH} / H 1:${usedScaleV}`,
    }, logo);

    const safeName = (titleBlock.projekt || 'laengsschnitt').replace(/[^\w\-]/g, '-');
    doc.save(`${safeName}-laengsschnitt.pdf`);
    return true;
}

/**
 * Querprofile in Serie: an jeder Station Gelände quer zur Achse abtasten,
 * Haltung als Kreis (DN) auf Sohlhöhe. Mehrseitig, 2×3 Profile je Blatt.
 */
export function exportQuerprofilePDF({
    data, sampler, titleBlock = {}, logo = null, format = 'A3',
    interval = 25, halfWidth = 10, scale = 100, heightOffsetY = 0,
} = {}) {
    if (!data?.strang || !sampler?.sample) return false;
    const { strang } = data;
    const nn = (y) => y + heightOffsetY;

    const [baseW, baseH] = PAPER[format] ?? PAPER.A3;
    const [pw, ph] = [Math.max(baseW, baseH), Math.min(baseW, baseH)];
    const doc = new jsPDF({ unit: 'mm', format: format.toLowerCase(), orientation: 'landscape' });
    const dw = pw - 2 * M;
    const dh = ph - 2 * M - TB;

    const COLS = 2, ROWS = 3;
    const cellW = dw / COLS, cellH = (dh - 8) / ROWS;

    // Stationen: 0, interval, …, Ende
    const stations = [];
    for (let s = 0; s <= strang.length + 1e-6; s += interval) stations.push(Math.min(s, strang.length));
    if (stations[stations.length - 1] < strang.length - 1e-6) stations.push(strang.length);

    let cell = 0;
    doc.setFontSize(9);
    doc.text(`Querprofile · 1:${scale} · alle ${interval} m`, M + 2, M + 6);

    for (const s of stations) {
        if (cell >= COLS * ROWS) {
            _titleBlock(doc, dw, dh, { ...titleBlock, massstab: `1:${scale}` }, logo);
            doc.addPage(format.toLowerCase(), 'landscape');
            doc.setFontSize(9);
            doc.text(`Querprofile · 1:${scale} · alle ${interval} m`, M + 2, M + 6);
            cell = 0;
        }
        const col = cell % COLS, row = Math.floor(cell / COLS);
        const cx0 = M + col * cellW, cy0 = M + 8 + row * cellH;
        _drawQuerprofil(doc, { strang, sampler, s, halfWidth, scale, nn }, cx0, cy0, cellW - 6, cellH - 6);
        cell++;
    }

    _titleBlock(doc, dw, dh, { ...titleBlock, massstab: `1:${scale}` }, logo);
    const safeName = (titleBlock.projekt || 'querprofile').replace(/[^\w\-]/g, '-');
    doc.save(`${safeName}-querprofile.pdf`);
    return true;
}

function _drawQuerprofil(doc, { strang, sampler, s, halfWidth, scale, nn }, x0, y0, w, h) {
    const p = pointAt(strang, s);
    if (!p) return;
    // Querrichtung = Achsnormale
    const nx = -p.dirZ, nzv = p.dirX;

    // Gelände quer abtasten
    const samples = [];
    for (let d = -halfWidth; d <= halfWidth + 1e-9; d += 0.5) {
        const y = sampler.sample(p.x + nx * d, p.z + nzv * d);
        if (y != null) samples.push({ d, y: nn(y) });
    }
    const ySohleW = sohleAt(strang, s);
    const ySohle = ySohleW != null ? nn(ySohleW) : null;

    let yMin = ySohle ?? Infinity, yMax = -Infinity;
    for (const q of samples) { yMin = Math.min(yMin, q.y); yMax = Math.max(yMax, q.y); }
    if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) return;
    const bezug = Math.floor((yMin - 0.5) * 2) / 2;

    const px = (d) => x0 + w / 2 + (d * 1000) / scale;
    const py = (y) => y0 + h - 8 - ((y - bezug) * 1000) / scale;

    // Rahmen + Titel
    doc.setDrawColor(180); doc.setLineWidth(0.15);
    doc.rect(x0, y0, w, h, 'S');
    doc.setFontSize(7); doc.setTextColor(0);
    const stationLabel = `Station ${Math.floor(s / 1000)}+${String(Math.round(s % 1000)).padStart(3, '0')}`;
    doc.text(stationLabel, x0 + 2, y0 + 4);

    // Bezugshorizont
    doc.setDrawColor(0); doc.setLineWidth(0.3);
    doc.line(px(-halfWidth), py(bezug), px(halfWidth), py(bezug));
    doc.setFontSize(5.5);
    doc.text(`BH ${fmtH(bezug)} m`, px(-halfWidth), py(bezug) + 2.4);

    // Geländelinie
    doc.setDrawColor(109, 76, 65); doc.setLineWidth(0.35);
    for (let i = 0; i + 1 < samples.length; i++) {
        doc.line(px(samples[i].d), py(samples[i].y), px(samples[i + 1].d), py(samples[i + 1].y));
    }

    // Haltung als Kreis (DN, sonst 300 mm Platzhalter) auf der Sohle
    if (ySohle != null) {
        const pipe = strang.pipes.find(pp => s >= pp.s0 - 1e-6 && s <= pp.s1 + 1e-6);
        const dnM = pipe?.item?.dn ? Number(pipe.item.dn) / 1000 : 0.3;
        const rMm = Math.max(0.8, (dnM / 2 * 1000) / scale);
        doc.setDrawColor(0); doc.setLineWidth(0.4);
        doc.circle(px(0), py(ySohle) - rMm, rMm, 'S');
        doc.setFontSize(5.5);
        doc.text(`Sohle ${fmtH(ySohle)}`, px(0) + rMm + 1, py(ySohle));
    }
}

/** Schriftfeld — Layout identisch zu IfcPdfExporter._drawTitleBlock (bewusst dupliziert schlank). */
function _titleBlock(doc, dw, dh, titleBlock, logo) {
    doc.setLineWidth(0.7); doc.setDrawColor(0);
    doc.rect(M, M, dw, dh + TB);
    const ty = M + dh;
    doc.setLineWidth(0.3);
    doc.line(M, ty, M + dw, ty);
    doc.line(M, ty + 20, M + dw, ty + 20);
    const cols = [0.40, 0.65, 0.82];
    cols.forEach(f => doc.line(M + dw * f, ty, M + dw * f, ty + TB));
    const writeCell = (lbl, val, f, baseY) => {
        doc.setFontSize(6); doc.setTextColor(130); doc.text(lbl, M + dw * f + 1.5, baseY);
        doc.setFontSize(9); doc.setTextColor(0);   doc.text(String(val ?? ''), M + dw * f + 1.5, baseY + 7);
    };
    writeCell('Projekt',      titleBlock.projekt,      0,    ty + 4);
    writeCell('Auftraggeber', titleBlock.auftraggeber, 0.40, ty + 4);
    writeCell('Bearbeiter',   titleBlock.bearbeiter,   0.65, ty + 4);
    const logoX = M + dw * 0.82;
    if (logo) doc.addImage(logo, logoX + 2, ty + 2, dw * 0.18 - 4, TB - 4, '', 'FAST');
    else writeCell('Firma', titleBlock.firma, 0.82, ty + 4);
    writeCell('Nr.',     titleBlock.nummer,   0,    ty + 24);
    writeCell('Datum',   titleBlock.datum || new Date().toLocaleDateString('de-DE'), 0.40, ty + 24);
    writeCell('Maßstab', titleBlock.massstab, 0.65, ty + 24);
}
