/**
 * AnnotationPainter — DIE eine Zeichenroutine je Annotationstyp.
 *
 * Zeichnet gegen den Adapter-Vertrag (CanvasAnnotDoc am Bildschirm,
 * PdfLibAnnotDoc im Export ab Stufe 6). Was hier gezeichnet wird, IST der
 * Export — eine zweite Routine gäbe Drift (Kernlektion aus CanvasDoc.js).
 *
 * Reihenfolge: erst alle Marker (multiply unter der Tinte wirkt natürlicher),
 * dann Tinte, dann der Rest — innerhalb der Gruppe nach z.
 */

import { strichUmriss, strichUmrissGecacht } from '@/services/tinte/InkGeometry';
import { messwertLabel, labelWinkel, polygonSchwerpunkt } from './MeasureMath';
import { volumenAusPolygon, versetzePolygon, rechenwegZeilen } from './VolumenMath';
import { textboxZeilen, TEXTBOX_POLSTER_PT, TEXTBOX_ZEILENHOEHE } from './TextboxMasse';

const MESS_FARBE = '#b91c1c';

const MARKER_DECKKRAFT = 0.4;

/** Referenzbreite einer Signatur: Strichbreiten skalieren relativ dazu. */
export const SIGNATUR_REFERENZ_BREITE_PT = 200;

function _zeichneInk(doc, a) {
    const umriss = strichUmrissGecacht(a);
    if (a.tool === 'textmarker') {
        doc.fuellePfad(umriss, {
            farbe: a.farbe,
            deckkraft: a.deckkraft ?? MARKER_DECKKRAFT,
            blend: 'multiply',
        });
        return;
    }
    if (a.stiftArt === 'bleistift') {
        // Grafit-Optik OHNE Zufall (Export-Parität, Cache): weicher Saum
        // (breiterer Umriss, schwach) unter einem leicht transparenten Kern.
        doc.fuellePfad(strichUmrissGecacht(a, 'rand'), { farbe: a.farbe, deckkraft: 0.12 });
        doc.fuellePfad(umriss, { farbe: a.farbe, deckkraft: 0.82 });
        return;
    }
    doc.fuellePfad(umriss, { farbe: a.farbe, deckkraft: a.deckkraft ?? 1 });
}

/**
 * Signatur: Strokes liegen im lokalen 0..1-Raum und werden in die Zielbox
 * (x, y, w, h) der Seite abgebildet — Vektor bleibt Vektor, Skalieren ist
 * verlustfrei. Wenige Strokes je Signatur → Umrisse hier ohne Cache.
 */
function _zeichneSignatur(doc, a) {
    const skala = a.w / SIGNATUR_REFERENZ_BREITE_PT;
    for (const strokePunkte of a.strokes) {
        const points = strokePunkte.map(([nx, ny, p]) => [a.x + nx * a.w, a.y + ny * a.h, p]);
        const umriss = strichUmriss({
            points,
            breitePt: (a.strichBreitePt ?? 2) * skala,
            tool: 'stift',
            echterDruck: a.echterDruck ?? true,
        });
        doc.fuellePfad(umriss, { farbe: a.farbe ?? '#1e3a8a', deckkraft: 1 });
    }
}

function _zeichneTextHighlight(doc, a) {
    for (const r of a.rects) {
        doc.fuelleRechteck(r.x, r.y, r.w, r.h, {
            farbe: a.farbe,
            deckkraft: a.deckkraft ?? MARKER_DECKKRAFT,
            blend: 'multiply',
        });
    }
}

/**
 * Messung: Linien/Polygon + Wert-Label mit Weiß-Halo. Der Wert kommt LIVE
 * aus der Kalibrierung (opts.messKontext) — nie aus der Annotation.
 */
/**
 * Rechenweg-Block unter dem Volumen-Label: weißer, halbtransparenter Kasten
 * mit kleinen Textzeilen. Läuft über den Adapter — Bildschirm = Export.
 */
function _zeichneRechenweg(doc, sx, sy, zeilen) {
    if (!zeilen.length) return;
    const g = 5.5, zh = g * 1.3, polster = 2;
    let maxBreite = 0;
    for (const z of zeilen) maxBreite = Math.max(maxBreite, doc.messeTextBreite(z, g));
    const breite = maxBreite + 2 * polster;
    const hoehe = zeilen.length * zh + 2 * polster;
    const x = sx - breite / 2, y = sy + 6;
    doc.fuelleRechteck(x, y, breite, hoehe, { farbe: '#ffffff', deckkraft: 0.85 });
    zeilen.forEach((z, i) => {
        doc.text(x + polster, y + polster + i * zh + (zh - g) / 2, z, { groessePt: g, farbe: '#374151' });
    });
}

function _zeichneMeasure(doc, a, opts) {
    const stil = { farbe: MESS_FARBE, breitePt: 0.8 };
    const label = messwertLabel(a, opts?.messKontext ?? null);

    if (a.kind === 'volumen') {
        // Baugrube (Stufe 17): Sohle wie eine Fläche, dazu die gestrichelte
        // Gegenkontur (Oberkante bzw. Sohle) mit Böschungskanten, das
        // Volumen-Label und der Rechenweg — alles live aus der Kalibrierung.
        doc.fuellePfad(a.points, { farbe: MESS_FARBE, deckkraft: 0.08 });
        doc.linienzug([...a.points, a.points[0]], stil);
        for (const [x, y] of a.points) {
            doc.kreis(x, y, 1.6, { fuellFarbe: MESS_FARBE });
        }
        const kal = opts?.messKontext ?? null;
        const e = kal ? volumenAusPolygon({
            points: a.points, realProPt: kal.realProPt,
            tiefeM: a.tiefeM, neigungN: a.neigungN, modus: a.modus,
        }) : null;
        if (e && e.b > 0 && !e.schliesstSich) {
            const gegen = versetzePolygon(a.points, e.modus === 'oberkante' ? -e.bPt : e.bPt);
            doc.linienzug([...gegen, gegen[0]], { farbe: MESS_FARBE, breitePt: 0.6, dashPt: [3, 2] });
            for (let i = 0; i < a.points.length; i++) {
                doc.linienzug([a.points[i], gegen[i]], { farbe: MESS_FARBE, breitePt: 0.4, dashPt: [1, 1.5] });
            }
        }
        const [sx, sy] = polygonSchwerpunkt(a.points);
        doc.textMitHalo(sx, sy, label, { groessePt: 8, farbe: MESS_FARBE });
        if (e && a.rechenwegAnzeigen !== false) {
            _zeichneRechenweg(doc, sx, sy, rechenwegZeilen(e, { auflockerung: a.auflockerung }));
        }
        return;
    }

    if (a.kind === 'area') {
        doc.fuellePfad(a.points, { farbe: MESS_FARBE, deckkraft: 0.08 });
        doc.linienzug([...a.points, a.points[0]], stil);
        for (const [x, y] of a.points) {
            doc.kreis(x, y, 1.6, { fuellFarbe: MESS_FARBE });
        }
        const [sx, sy] = polygonSchwerpunkt(a.points);
        doc.textMitHalo(sx, sy, label, { groessePt: 8, farbe: MESS_FARBE });
        return;
    }

    doc.linienzug(a.points, stil);
    for (const [x, y] of a.points) {
        doc.kreis(x, y, 1.6, { fuellFarbe: MESS_FARBE });
    }
    const p0 = a.points[0], p1 = a.points[a.points.length - 1];
    const mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2;
    doc.textMitHalo(mx, my - 4, label, {
        groessePt: 8, farbe: MESS_FARBE, winkel: labelWinkel(p0, p1),
    });
}

/**
 * Textfeld: Hintergrund-Rechteck (außer 'transparent') + Zeilen linksbündig.
 * Die Boxbreite misst das jeweilige Backend selbst (doc.messeTextBreite) —
 * Canvas und pdf-lib messen minimal verschieden, die Abweichung bleibt
 * unter dem Polster.
 */
function _zeichneTextbox(doc, a) {
    const zeilen = textboxZeilen(a.text);
    const g = a.schriftGroessePt ?? 12;
    const zh = g * TEXTBOX_ZEILENHOEHE;
    if (a.hintergrundFarbe && a.hintergrundFarbe !== 'transparent') {
        let maxBreite = 0;
        for (const z of zeilen) maxBreite = Math.max(maxBreite, doc.messeTextBreite(z, g));
        doc.fuelleRechteck(
            a.x, a.y,
            Math.max(maxBreite, g) + 2 * TEXTBOX_POLSTER_PT,
            zeilen.length * zh + 2 * TEXTBOX_POLSTER_PT,
            { farbe: a.hintergrundFarbe },
        );
    }
    zeilen.forEach((zeile, i) => {
        doc.text(
            a.x + TEXTBOX_POLSTER_PT,
            a.y + TEXTBOX_POLSTER_PT + i * zh + (zh - g) / 2,
            zeile,
            { groessePt: g, farbe: a.textFarbe ?? '#111827' },
        );
    });
}

/** Stempelmaße (Rahmenbox um den Text) — auch für Treffer-Tests genutzt. */
export function stempelMasse(a, messeBreite) {
    const g = a.groessePt ?? 18;
    const textBreite = messeBreite(a.text, g);
    const datumsZeile = a.mitDatum && a.datum ? g * 0.75 : 0;
    return {
        breite: textBreite + g * 1.2,
        hoehe: g * 1.6 + datumsZeile,
        datumsZeile,
    };
}

/**
 * Stempel: gedrehter Rahmen + Text (+ Datumszeile) um den Mittelpunkt (x, y).
 * Halbtransparent wie ein echter Stempelabdruck; alles über den
 * Adapter-Vertrag → Export automatisch deckungsgleich.
 */
function _zeichneStempel(doc, a) {
    const g = a.groessePt ?? 18;
    const winkel = a.winkelGrad ?? 12;
    const { breite, hoehe, datumsZeile } = stempelMasse(a, (t, gr) => doc.messeTextBreite(t, gr));
    const rad = (winkel * Math.PI) / 180;
    // Anzeigeraum (y nach unten): CSS-Rotation = Uhrzeigersinn positiv,
    // unser Winkel ist als Lese-Winkel (gegen Uhrzeiger) gemeint → -rad.
    const dx = Math.cos(-rad), dy = Math.sin(-rad);
    const px = -dy, py = dx;   // lokale „nach unten"-Achse
    const ecke = (ex, ey) => [
        a.x + ex * dx + ey * px,
        a.y + ex * dy + ey * py,
    ];
    const hb = breite / 2, hh = hoehe / 2;
    const rahmen = [ecke(-hb, -hh), ecke(hb, -hh), ecke(hb, hh), ecke(-hb, hh), ecke(-hb, -hh)];
    const stil = { farbe: a.farbe, deckkraft: 0.85 };
    doc.linienzug(rahmen, { ...stil, breitePt: 1.4 });
    const textVersatz = datumsZeile ? -datumsZeile / 2 : 0;
    const [tx, ty] = ecke(0, textVersatz);
    doc.textMitHalo(tx, ty, a.text, {
        groessePt: g, farbe: a.farbe, winkel, haloFarbe: '#ffffff',
    });
    if (datumsZeile) {
        const [dxp, dyp] = ecke(0, textVersatz + g * 0.95);
        doc.textMitHalo(dxp, dyp, a.datum, {
            groessePt: g * 0.5, farbe: a.farbe, winkel, haloFarbe: '#ffffff',
        });
    }
}

/**
 * Eingefügtes Bild: der Adapter kennt die Quelle (Canvas: Bitmap aus dem
 * BildCache, Export: eingebettetes PDFImage) — hier nur Geometrie + Key.
 */
function _zeichneBild(doc, a) {
    doc.bild?.(a.x, a.y, a.w, a.h, a.bildKey, { deckkraft: a.deckkraft ?? 1 });
}

const ZEICHNER = {
    ink: _zeichneInk,
    signature: _zeichneSignatur,
    textHighlight: _zeichneTextHighlight,
    measure: _zeichneMeasure,
    textbox: _zeichneTextbox,
    stempel: _zeichneStempel,
    bild: _zeichneBild,
    // 'note' zeichnet am Bildschirm das HTML-Overlay (interaktiver Pin);
    // der Export bekommt einen eigenen Pin-Zeichner in Stufe 6.
};

function _gruppenRang(a) {
    // Bilder liegen UNTER allem — ein eingefügter Screenshot muss mit Stift
    // und Marker annotierbar sein.
    if (a.type === 'bild') return -1;
    if (a.type === 'textHighlight') return 0;
    if (a.type === 'ink' && a.tool === 'textmarker') return 0;
    if (a.type === 'ink') return 1;
    return 2;
}

/**
 * Zeichnet alle Annotationen einer Seite.
 * @param {object} doc     Adapter (CanvasAnnotDoc / PdfLibAnnotDoc)
 * @param {Array}  items   Annotationen (bereits auf die Seite gefiltert)
 * @param {object} [opts]  { ausgenommen: Set<id>, ohneTypen: Set<string> }
 *   ausgenommen: z. B. die gerade per Lasso bewegte Auswahl
 *   ohneTypen:   z. B. 'note' am Bildschirm (Pin ist dort HTML)
 */
export function zeichneAnnotationen(doc, items, opts = {}) {
    const { ausgenommen, ohneTypen } = opts;
    const sortiert = [...items].sort((a, b) => {
        const g = _gruppenRang(a) - _gruppenRang(b);
        return g !== 0 ? g : (a.z ?? 0) - (b.z ?? 0);
    });
    for (const a of sortiert) {
        if (ausgenommen?.has(a.id)) continue;
        if (ohneTypen?.has(a.type)) continue;
        ZEICHNER[a.type]?.(doc, a, opts);
    }
}
