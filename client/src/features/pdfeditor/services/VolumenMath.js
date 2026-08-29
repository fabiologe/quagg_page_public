/**
 * VolumenMath — Baugrubenaushub mit Böschung (Stufe 17). Pur, Blatt-Modul
 * (importiert nichts aus MeasureMath — MeasureMath importiert VON HIER).
 *
 * Das gezeichnete Polygon ist die SOHLE (Böschungen laufen nach außen und
 * oben) oder wahlweise die OBERKANTE (Böschungen nach innen). Mit
 * Kalibrierung r = realProPt [m/pt]:
 *   A = Fläche [m²], U = geschlossener Umfang [m],
 *   K = Eckfaktor = Σ cot(θᵢ/2) über alle Innenwinkel θᵢ
 *       (= Σ tan(φᵢ/2) über die orientierten Außenwinkel — konvexe Ecken
 *        zählen positiv, konkave negativ; Rechteck: K = 4).
 * Böschungsbreite b = n·t. Querschnittsfläche in Höhe z über der Sohle
 * (gerade, „gemiterte" Böschungen): A(z) = A ± U·n·z + K·n²·z². Exakt
 * integriert:
 *   V = A·t ± U·n·t²/2 + K·n²·t³/3
 *     = Kernprisma + Böschungskeile entlang der Kanten + Eckpyramiden.
 * Identisch zur Prismoid-Formel t/6·(A + 4·A(t/2) + A_o). Werte werden wie
 * alle Messungen LIVE aus der Kalibrierung gerechnet — nie eingefroren.
 *
 * Alle Texte hier landen auch im PDF-Export (pdf-lib Standard-Helvetica,
 * WinAnsi): nur ², ³, ·, ×, Umlaute — keine Pfeile, kein θ, keine
 * Subskripte, kein U+2212-Minus.
 */

const DE = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });
const DE1 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });
const DE2 = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const SPITZ_KAPPE = (170 * Math.PI) / 180;   // |Außenwinkel| darüber = „sehr spitze Ecke"
const MITER_LIMIT = 4;

/** Shoelace MIT Vorzeichen (Orientierung), pt². */
export function signierteFlaechePt2(points) {
    let s = 0;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        s += (points[j][0] + points[i][0]) * (points[j][1] - points[i][1]);
    }
    return s / 2;
}

/** Geschlossener Umfang (inkl. Schlusskante), pt. */
export function polygonUmfangPt(points) {
    let u = 0;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        u += Math.hypot(points[i][0] - points[j][0], points[i][1] - points[j][1]);
    }
    return u;
}

/**
 * Orientierte Außenwinkel je Ecke (null bei entarteter Kante) und die
 * Umlaufrichtung (+1/−1) — die Summe der Außenwinkel ist ±2π.
 */
function _aussenwinkel(points) {
    const n = points.length;
    const phis = [];
    let summe = 0;
    for (let i = 0; i < n; i++) {
        const p0 = points[(i - 1 + n) % n], p1 = points[i], p2 = points[(i + 1) % n];
        const e1x = p1[0] - p0[0], e1y = p1[1] - p0[1];
        const e2x = p2[0] - p1[0], e2y = p2[1] - p1[1];
        if (Math.hypot(e1x, e1y) < 1e-9 || Math.hypot(e2x, e2y) < 1e-9) { phis.push(null); continue; }
        const phi = Math.atan2(e1x * e2y - e1y * e2x, e1x * e2x + e1y * e2y);
        phis.push(phi);
        summe += phi;
    }
    return { phis, orient: summe >= 0 ? 1 : -1 };
}

/**
 * Eckfaktor K = Σ tan(φ/2) mit φ = orientierter Außenwinkel (konvex > 0).
 * Sehr spitze Ecken (|φ| > 170°) werden gekappt und gemeldet — dort läuft
 * cot(θ/2) gegen unendlich.
 */
export function eckfaktor(points) {
    if (!points || points.length < 3) return { K: 0, spitzeEcke: false };
    const { phis, orient } = _aussenwinkel(points);
    let K = 0, spitzeEcke = false;
    for (const phi of phis) {
        if (phi == null) continue;
        let a = orient * phi;
        if (Math.abs(a) > SPITZ_KAPPE) { spitzeEcke = true; a = Math.sign(a) * SPITZ_KAPPE; }
        K += Math.tan(a / 2);
    }
    return { K, spitzeEcke };
}

/**
 * Gerader („gemiterter") Polygon-Versatz um dPt (> 0 nach außen, < 0 nach
 * innen), Seitenpunkte. Ecke: p + d·(n1+n2)/(1+n1·n2); Miter-Limit gegen
 * Spitzen. Keine Selbstschnitt-Bereinigung (v1).
 */
export function versetzePolygon(points, dPt) {
    const n = points.length;
    if (n < 3 || !dPt) return points.map(p => [p[0], p[1]]);
    const { orient } = _aussenwinkel(points);
    const normale = (a, b) => {
        const ex = b[0] - a[0], ey = b[1] - a[1];
        const l = Math.hypot(ex, ey);
        if (l < 1e-9) return [0, 0];
        return [orient * ey / l, -orient * ex / l];   // Auswärtsnormale
    };
    const aus = [];
    for (let i = 0; i < n; i++) {
        const p0 = points[(i - 1 + n) % n], p1 = points[i], p2 = points[(i + 1) % n];
        const n1 = normale(p0, p1), n2 = normale(p1, p2);
        const dot = n1[0] * n2[0] + n1[1] * n2[1];
        let mx = n1[0] + n2[0], my = n1[1] + n2[1];
        const nenner = 1 + dot;
        if (nenner > 1e-6) { mx /= nenner; my /= nenner; }
        else { mx = n1[0] || n2[0]; my = n1[1] || n2[1]; }   // 180°-Spitze: eine Normale
        const laenge = Math.hypot(mx, my);
        if (laenge > MITER_LIMIT) { mx *= MITER_LIMIT / laenge; my *= MITER_LIMIT / laenge; }
        aus.push([p1[0] + dPt * mx, p1[1] + dPt * my]);
    }
    return aus;
}

/**
 * @returns {null | {A,U,K,t,n,b,bPt,modus,gegenFlaeche,vKern,vKeile,vEcken,V,
 *   maxTiefeM,schliesstSich,warnungen}} — null, wenn unkalibriert oder
 *   Eingaben unbrauchbar (< 3 Punkte, t ≤ 0, n < 0).
 */
export function volumenAusPolygon({ points, realProPt, tiefeM, neigungN, modus = 'sohle' }) {
    if (!(realProPt > 0) || !points || points.length < 3) return null;
    const t = Number(tiefeM), n = Number(neigungN);
    if (!(t > 0) || !(n >= 0)) return null;
    const r = realProPt;
    const A = Math.abs(signierteFlaechePt2(points)) * r * r;
    const U = polygonUmfangPt(points) * r;
    const { K, spitzeEcke } = eckfaktor(points);
    const sign = modus === 'oberkante' ? -1 : 1;
    const b = n * t;

    const vKern = A * t;
    const vKeile = sign * U * n * t * t / 2;
    const vEcken = K * n * n * t * t * t / 3;
    const V = vKern + vKeile + vEcken;
    const gegenFlaeche = A + sign * U * b + K * b * b;

    const warnungen = [];
    let maxTiefeM = null;
    let schliesstSich = false;
    if (sign < 0 && n > 0) {
        // Kleinste positive Wurzel von A − U·b + K·b² = 0: dort ist die Sohle weg.
        let bMax = null;
        if (K > 1e-12) {
            const disk = U * U - 4 * K * A;
            if (disk >= 0) bMax = (U - Math.sqrt(disk)) / (2 * K);
        } else if (U > 0) {
            bMax = A / U;
        }
        if (bMax != null && bMax > 0) {
            maxTiefeM = bMax / n;
            if (b >= bMax - 1e-9) schliesstSich = true;
        }
    }
    if (gegenFlaeche <= 0) schliesstSich = true;
    if (schliesstSich) {
        warnungen.push(maxTiefeM != null
            ? `Baugrube schließt sich vor der Sohle — maximale Tiefe bei dieser Böschung: ${DE.format(maxTiefeM)} m`
            : 'Baugrube schließt sich vor der Sohle');
    }
    if (spitzeEcke) warnungen.push('Sehr spitze Ecke — die Böschungsformel wird dort ungenau');

    return {
        A, U, K, t, n, b, bPt: b / r, modus, gegenFlaeche,
        vKern, vKeile, vEcken, V, maxTiefeM, schliesstSich, warnungen,
    };
}

/** m³ lesbar: 2 Nachkommastellen, ab 1 000 m³ eine. */
export function formatVolumen(m3) {
    if (!isFinite(m3)) return '—';
    if (m3 >= 1000) return `${DE1.format(m3)} m³`;
    return `${DE.format(m3)} m³`;
}

export function neigungText(n) {
    return n === 0 ? 'senkrecht (n = 0)' : `Böschung 1:${DE.format(n)}`;
}

/**
 * Der Rechenweg als Zeilen — EINE Quelle für Dialog, Bildschirm und Export.
 * @param {ReturnType<typeof volumenAusPolygon>} e
 */
export function rechenwegZeilen(e, { auflockerung = 1 } = {}) {
    if (!e) return [];
    const f2 = (v) => DE2.format(v);
    const ober = e.modus === 'oberkante';
    const basis = ober ? 'Oberkante' : 'Sohle';
    const gegen = ober ? 'Sohle As' : 'Oberkante Ao';
    const pm = ober ? '-' : '+';
    const zeilen = [`${basis} A = ${f2(e.A)} m² · U = ${f2(e.U)} m · K = ${f2(e.K)}`];
    if (e.n === 0) {
        zeilen.push(`Tiefe t = ${f2(e.t)} m · ${neigungText(0)} · b = ${f2(0)} m`);
        zeilen.push(`${gegen} = A = ${f2(e.A)} m²`);
        zeilen.push(`V = A·t = ${f2(e.A)} · ${f2(e.t)} = ${f2(e.V)} m³`);
    } else {
        zeilen.push(`Tiefe t = ${f2(e.t)} m · ${neigungText(e.n)} · b = n·t = ${f2(e.b)} m`);
        zeilen.push(`${gegen} = A ${pm} U·b + K·b² = ${f2(e.A)} ${pm} ${f2(e.U * e.b)} + ${f2(e.K * e.b * e.b)} = ${f2(e.gegenFlaeche)} m²`);
        zeilen.push(`V = A·t ${pm} U·n·t²/2 + K·n²·t³/3`);
        zeilen.push(`  = ${f2(e.vKern)} ${pm} ${f2(Math.abs(e.vKeile))} + ${f2(e.vEcken)} = ${f2(e.V)} m³`);
    }
    if (auflockerung && Math.abs(auflockerung - 1) > 1e-9) {
        zeilen.push(`aufgelockert × ${DE.format(auflockerung)} = ${f2(e.V * auflockerung)} m³`);
    }
    return zeilen;
}
