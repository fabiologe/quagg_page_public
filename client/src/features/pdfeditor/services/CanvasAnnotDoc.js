/**
 * CanvasAnnotDoc — Bildschirm-Backend des Annotations-Adapters.
 *
 * Das Muster stammt aus ifc-viewer/services/CanvasDoc.js: skaliert wird JE
 * KOORDINATE (Seitenpunkte → Pixel), NICHT über ctx.scale() — sonst würden
 * auch Linienbreiten mitskaliert und die Haarlinien-Klemme griffe nicht.
 *
 * Adapter-Vertrag (implementiert auch von PdfLibAnnotDoc, Stufe 6):
 *   fuellePfad(punkte, stil)      geschlossener Umriss, gefüllt (Tinte)
 *   linienzug(punkte, stil)       offene Polyline (Messlinien)
 *   fuelleRechteck(x,y,b,h,stil)  (Text-Highlight)
 *   kreis(x,y,r,stil)             (Messpunkte, Pins)
 *   textMitHalo(x,y,text,stil)    Label mit Weiß-Halo (Messwerte)
 *   text(x,y,text,stil)           linksbündige Zeile, (x,y) = obere linke Ecke
 *   messeTextBreite(text,pt)      Zeilenbreite in Punkten (backend-eigen)
 * Stil: { farbe, deckkraft, blend: 'normal'|'multiply', breitePt, haloFarbe, groessePt, winkel }
 * Alle Koordinaten/Breiten in Seitenpunkten.
 */

export function erstelleCanvasAnnotDoc(ctx, { skala, minStrichPx = 0.75 } = {}) {
    const s = (pt) => pt * skala;

    function _stil(stil = {}) {
        ctx.globalAlpha = stil.deckkraft ?? 1;
        ctx.globalCompositeOperation = stil.blend === 'multiply' ? 'multiply' : 'source-over';
    }

    function _zuruecksetzen() {
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
    }

    return {
        fuellePfad(punkte, stil = {}) {
            if (punkte.length < 3) return;
            _stil(stil);
            ctx.fillStyle = stil.farbe ?? '#000';
            ctx.beginPath();
            ctx.moveTo(s(punkte[0][0]), s(punkte[0][1]));
            for (let i = 1; i < punkte.length; i++) {
                ctx.lineTo(s(punkte[i][0]), s(punkte[i][1]));
            }
            ctx.closePath();
            ctx.fill();
            _zuruecksetzen();
        },

        linienzug(punkte, stil = {}) {
            if (punkte.length < 2) return;
            _stil(stil);
            ctx.strokeStyle = stil.farbe ?? '#000';
            ctx.lineWidth = Math.max(s(stil.breitePt ?? 1), minStrichPx);
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            ctx.setLineDash((stil.dashPt ?? []).map(s));
            ctx.beginPath();
            ctx.moveTo(s(punkte[0][0]), s(punkte[0][1]));
            for (let i = 1; i < punkte.length; i++) {
                ctx.lineTo(s(punkte[i][0]), s(punkte[i][1]));
            }
            ctx.stroke();
            ctx.setLineDash([]);
            _zuruecksetzen();
        },

        fuelleRechteck(x, y, b, h, stil = {}) {
            _stil(stil);
            ctx.fillStyle = stil.farbe ?? '#000';
            ctx.fillRect(s(x), s(y), s(b), s(h));
            _zuruecksetzen();
        },

        kreis(x, y, r, stil = {}) {
            _stil(stil);
            ctx.beginPath();
            ctx.arc(s(x), s(y), s(r), 0, Math.PI * 2);
            if (stil.fuellFarbe) { ctx.fillStyle = stil.fuellFarbe; ctx.fill(); }
            if (stil.farbe) {
                ctx.strokeStyle = stil.farbe;
                ctx.lineWidth = Math.max(s(stil.breitePt ?? 1), minStrichPx);
                ctx.stroke();
            }
            _zuruecksetzen();
        },

        /** Textzeile linksbündig; (x, y) = obere linke Ecke, Grundlinie ~0,78 em tiefer. */
        text(x, y, text, stil = {}) {
            _stil(stil);
            const px = s(stil.groessePt ?? 12);
            ctx.font = `${px}px Helvetica, Arial, sans-serif`;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';
            ctx.fillStyle = stil.farbe ?? '#000';
            ctx.fillText(text, s(x), s(y) + px * 0.78);
            _zuruecksetzen();
        },

        messeTextBreite(text, groessePt) {
            ctx.font = `${s(groessePt)}px Helvetica, Arial, sans-serif`;
            return ctx.measureText(text).width / skala;
        },

        textMitHalo(x, y, text, stil = {}) {
            _stil(stil);
            const px = s(stil.groessePt ?? 9);
            ctx.font = `600 ${px}px 'Segoe UI', system-ui, sans-serif`;
            ctx.textAlign = stil.ausrichtung ?? 'center';
            ctx.textBaseline = 'middle';
            ctx.save();
            ctx.translate(s(x), s(y));
            // jsPDF/pdf-lib drehen gegen den Uhrzeigersinn, Canvas mit —
            // das Vorzeichen kippt hier (Lektion aus CanvasDoc.js).
            if (stil.winkel) ctx.rotate(-(stil.winkel * Math.PI) / 180);
            // Halo: 4 versetzte Kopien, dann der eigentliche Text
            // (bewährt aus IfcPdfExporter._drawDimensions).
            const halo = stil.haloFarbe ?? '#ffffff';
            const versatz = Math.max(1, px * 0.09);
            ctx.fillStyle = halo;
            for (const [dx, dy] of [[-versatz, 0], [versatz, 0], [0, -versatz], [0, versatz]]) {
                ctx.fillText(text, dx, dy);
            }
            ctx.fillStyle = stil.farbe ?? '#000';
            ctx.fillText(text, 0, 0);
            ctx.restore();
            _zuruecksetzen();
        },
    };
}
