/**
 * PdfLibAnnotDoc — Export-Backend des Annotations-Adapters (pdf-lib).
 *
 * Der Painter zeichnet im ANZEIGERAUM einer Seite (Ursprung oben links,
 * y nach unten, /Rotate bereits eingerechnet — exakt wie am Bildschirm).
 * pdf-lib zeichnet dagegen im PDF-Nutzerraum (Ursprung unten links, y nach
 * oben, unrotiert, relativ zur CropBox). Dieses Modul rechnet um:
 *
 *   Anzeige (dx, dy) → PDF (x, y), je nach /Rotate der Seite:
 *     0°:   x = x1 + dx        y = y2 − dy
 *     90°:  x = x1 + dy        y = y1 + dx
 *     180°: x = x2 − dx        y = y1 + dy
 *     270°: x = x2 − dy        y = y2 − dx
 *   (x1..y2 = CropBox; hergeleitet aus der pdf.js-PageViewport-Transform,
 *   deren Anzeige dieselbe Konvention nutzt.)
 *
 * Pfade laufen über drawSvgPath mit Ursprung (x1, y2): dessen y-invertierte
 * SVG-Konvention entspricht genau dem UNROTIERTEN Anzeigeraum — die Punkte
 * werden also erst nach PDF, dann in diesen Rahmen zurückgerechnet.
 * Textwinkel: Anzeige-Winkel + Seitenrotation (Viewer drehen die Seite beim
 * Anzeigen um /Rotate im Uhrzeigersinn zurück).
 */

import { rgb, degrees, BlendMode, LineCapStyle } from 'pdf-lib';

/** Zeichen, die Standard-Helvetica (WinAnsi) nicht kennt, → '?'. */
function _winAnsiSicher(text, font) {
    try {
        font.widthOfTextAtSize(text, 10);
        return text;
    } catch {
        return [...text].map((z) => {
            try { font.widthOfTextAtSize(z, 10); return z; }
            catch { return '?'; }
        }).join('');
    }
}

function farbeZuRgb(hex) {
    const h = (hex ?? '#000000').replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/**
 * @param {import('pdf-lib').PDFPage} page
 * @param {import('pdf-lib').PDFFont} font
 * @param {{bilder?: Map<string, import('pdf-lib').PDFImage>|null}} [opts]
 *   eingebettete Bilder je bildKey (der Exporter bettet EINMAL je Dokument ein)
 */
export function erstellePdfLibAnnotDoc(page, font, { bilder = null } = {}) {
    const rot = ((page.getRotation().angle % 360) + 360) % 360;
    let crop;
    try { crop = page.getCropBox(); } catch { crop = page.getMediaBox(); }
    const x1 = crop.x, y1 = crop.y;
    const x2 = crop.x + crop.width, y2 = crop.y + crop.height;

    /** Anzeigepunkt → PDF-Nutzerraum. */
    function zuPdf(dx, dy) {
        switch (rot) {
            case 90:  return [x1 + dy, y1 + dx];
            case 180: return [x2 - dx, y1 + dy];
            case 270: return [x2 - dy, y2 - dx];
            default:  return [x1 + dx, y2 - dy];
        }
    }

    /** Anzeigepunkt → unrotierter Anzeigerahmen (für drawSvgPath, Ursprung x1/y2). */
    function zuUnrotiert(dx, dy) {
        const [px, py] = zuPdf(dx, dy);
        return [px - x1, y2 - py];
    }

    function pfadAus(punkte, geschlossen) {
        if (!punkte.length) return '';
        const teile = punkte.map(([dx, dy], i) => {
            const [ux, uy] = zuUnrotiert(dx, dy);
            return `${i === 0 ? 'M' : 'L'} ${ux.toFixed(2)} ${uy.toFixed(2)}`;
        });
        return teile.join(' ') + (geschlossen ? ' Z' : '');
    }

    const winkelKorrektur = rot;

    return {
        fuellePfad(punkte, stil = {}) {
            if (punkte.length < 3) return;
            page.drawSvgPath(pfadAus(punkte, true), {
                x: x1, y: y2,
                color: farbeZuRgb(stil.farbe),
                opacity: stil.deckkraft ?? 1,
                blendMode: stil.blend === 'multiply' ? BlendMode.Multiply : BlendMode.Normal,
            });
        },

        linienzug(punkte, stil = {}) {
            if (punkte.length < 2) return;
            page.drawSvgPath(pfadAus(punkte, false), {
                x: x1, y: y2,
                borderColor: farbeZuRgb(stil.farbe),
                borderWidth: stil.breitePt ?? 1,
                borderOpacity: stil.deckkraft ?? 1,
                borderLineCap: LineCapStyle.Round,
                ...(stil.dashPt?.length ? { borderDashArray: stil.dashPt } : {}),
            });
        },

        fuelleRechteck(x, y, b, h, stil = {}) {
            const [ax, ay] = zuPdf(x, y);
            const [bx, by] = zuPdf(x + b, y + h);
            page.drawRectangle({
                x: Math.min(ax, bx), y: Math.min(ay, by),
                width: Math.abs(bx - ax), height: Math.abs(by - ay),
                color: farbeZuRgb(stil.farbe),
                opacity: stil.deckkraft ?? 1,
                blendMode: stil.blend === 'multiply' ? BlendMode.Multiply : BlendMode.Normal,
            });
        },

        kreis(x, y, r, stil = {}) {
            const [px, py] = zuPdf(x, y);
            page.drawCircle({
                x: px, y: py, size: r,
                ...(stil.fuellFarbe ? { color: farbeZuRgb(stil.fuellFarbe) } : {}),
                ...(stil.farbe ? {
                    borderColor: farbeZuRgb(stil.farbe),
                    borderWidth: stil.breitePt ?? 1,
                } : {}),
                opacity: stil.deckkraft ?? 1,
            });
        },

        /**
         * Textzeile linksbündig; (x, y) = obere linke Ecke der Zeile im
         * Anzeigeraum. Bei gedrehten Seiten dreht die Winkelkorrektur den
         * Text mit, sodass er am Bildschirm wie im Export gleich liegt.
         * Zeichen außerhalb von WinAnsi (Standard-Helvetica) werden durch
         * '?' ersetzt statt den Export zu werfen.
         */
        text(x, y, text, stil = {}) {
            const groesse = stil.groessePt ?? 12;
            const sicher = _winAnsiSicher(text, font);
            const winkel = winkelKorrektur;
            const rad = (winkel * Math.PI) / 180;
            // Grundlinienpunkt: 0,78 em unter der Oberkante, entlang der
            // (rotierten) lokalen Abwärtsrichtung.
            const [bx, by] = zuPdf(x, y);
            const hochX = -Math.sin(rad), hochY = Math.cos(rad);
            page.drawText(sicher, {
                x: bx - 0.78 * groesse * hochX,
                y: by - 0.78 * groesse * hochY,
                size: groesse, font,
                rotate: degrees(winkel),
                color: farbeZuRgb(stil.farbe),
                opacity: stil.deckkraft ?? 1,
            });
        },

        messeTextBreite(text, groessePt) {
            return font.widthOfTextAtSize(_winAnsiSicher(text, font), groessePt);
        },

        /**
         * Bild in die Anzeigebox (x, y, b, h). pdf-lib verankert die UNTERE
         * LINKE Bildecke und dreht gegen den Uhrzeigersinn um diesen Anker:
         * Anker = Anzeigepunkt (x, y+h) → zuPdf; rotate = /Rotate der Seite
         * (wie winkelKorrektur beim Text). Breite/Höhe bleiben in ALLEN vier
         * Fällen b/h — den Achsentausch erledigt die Rotationsmatrix.
         * Fehlt das Bild (Bytes nicht geladen), bleibt eine Lücke statt
         * eines Export-Abbruchs.
         */
        bild(x, y, b, h, bildKey, stil = {}) {
            const img = bilder?.get(bildKey);
            if (!img) return;
            const [ax, ay] = zuPdf(x, y + h);
            page.drawImage(img, {
                x: ax, y: ay, width: b, height: h,
                rotate: degrees(winkelKorrektur),
                opacity: stil.deckkraft ?? 1,
            });
        },

        textMitHalo(x, y, text, stil = {}) {
            const groesse = stil.groessePt ?? 9;
            const winkel = (stil.winkel ?? 0) + winkelKorrektur;
            const rad = (winkel * Math.PI) / 180;
            const dirX = Math.cos(rad), dirY = Math.sin(rad);        // PDF-Raum, y-oben
            const hochX = -Math.sin(rad), hochY = Math.cos(rad);
            const breite = font.widthOfTextAtSize(text, groesse);
            const [cx, cy] = zuPdf(x, y);
            // Adapter-Vertrag: (x, y) ist die TEXTMITTE; pdf-lib will die
            // Grundlinie links → Mitte um halbe Breite und ~0,35 em versetzen.
            const bx = cx - (breite / 2) * dirX - 0.35 * groesse * hochX;
            const by = cy - (breite / 2) * dirY - 0.35 * groesse * hochY;
            const halo = { size: groesse, font, rotate: degrees(winkel), color: farbeZuRgb(stil.haloFarbe ?? '#ffffff') };
            const o = Math.max(0.25, groesse * 0.06);
            for (const [ox, oy] of [[-o, 0], [o, 0], [0, -o], [0, o]]) {
                page.drawText(text, { ...halo, x: bx + ox, y: by + oy });
            }
            page.drawText(text, {
                x: bx, y: by, size: groesse, font,
                rotate: degrees(winkel), color: farbeZuRgb(stil.farbe),
            });
        },

        // Für Tests: die Kernabbildung offenlegen.
        _zuPdf: zuPdf,
    };
}
