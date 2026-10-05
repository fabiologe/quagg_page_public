/**
 * BIMFY · Körperform — was ein Netz über sich verrät, ohne Netz zu bleiben.
 *
 * Ein Körper aus OBJ, STL oder DXF-3DFACE ist eine Punktwolke. Ins Journal
 * darf er so nicht (`Bauteilrezepte.js`: Parameter, niemals Netz). Gelesen
 * werden deshalb die Grössen, aus denen ein Rezept ihn wieder BAUEN kann:
 *
 *   umriss   konvexe Hülle in der Draufsicht (Ost/Nord)
 *   achse    Mittellinie des kleinsten umschliessenden Rechtecks, entlang
 *            seiner langen Seite
 *   laenge, breite   Seiten dieses Rechtecks (laenge ≥ breite)
 *   unten, oben      Höhenspanne
 *
 * Das ist eine NÄHERUNG und heisst so: ein L-förmiger Körper wird als seine
 * Hülle gebaut. Was ein Rezept daraus macht, entscheidet der Übersetzer.
 *
 * Rein: kein Vue, kein Store, keine Engine.
 */

const EPS = 1e-9;

/** Konvexe Hülle (Andrew) in Ost/Nord, gegen den Uhrzeigersinn, ohne Wiederholung. */
export function konvexeHuelle(punkte) {
    const p = [...punkte].map(q => [q.ost, q.nord])
        .sort((a, b) => a[0] - b[0] || a[1] - b[1])
        .filter((q, i, l) => i === 0 || Math.abs(q[0] - l[i - 1][0]) > EPS || Math.abs(q[1] - l[i - 1][1]) > EPS);
    if (p.length < 3) return p.map(([ost, nord]) => ({ ost, nord }));
    const kreuz = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const unten = [], oben = [];
    for (const q of p) {
        while (unten.length >= 2 && kreuz(unten[unten.length - 2], unten[unten.length - 1], q) <= EPS) unten.pop();
        unten.push(q);
    }
    for (let i = p.length - 1; i >= 0; i--) {
        const q = p[i];
        while (oben.length >= 2 && kreuz(oben[oben.length - 2], oben[oben.length - 1], q) <= EPS) oben.pop();
        oben.push(q);
    }
    return [...unten.slice(0, -1), ...oben.slice(0, -1)].map(([ost, nord]) => ({ ost, nord }));
}

/**
 * Kleinstes umschliessendes Rechteck einer konvexen Hülle (eine Seite liegt
 * auf einer Hüllkante — der Satz von Freeman & Shapira).
 * @returns {{mitte: {ost, nord}, richtung: {ost, nord}, laenge: number, breite: number}|null}
 */
export function kleinstesRechteck(huelle) {
    if (huelle.length === 0) return null;
    if (huelle.length === 1) return { mitte: { ...huelle[0] }, richtung: { ost: 1, nord: 0 }, laenge: 0, breite: 0 };
    let best = null;
    for (let i = 0; i < huelle.length; i++) {
        const a = huelle[i], b = huelle[(i + 1) % huelle.length];
        const l = Math.hypot(b.ost - a.ost, b.nord - a.nord);
        if (l < EPS) continue;
        const ux = (b.ost - a.ost) / l, uy = (b.nord - a.nord) / l;
        let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
        for (const q of huelle) {
            const u = q.ost * ux + q.nord * uy;
            const v = -q.ost * uy + q.nord * ux;
            minU = Math.min(minU, u); maxU = Math.max(maxU, u);
            minV = Math.min(minV, v); maxV = Math.max(maxV, v);
        }
        const flaeche = (maxU - minU) * (maxV - minV);
        if (!best || flaeche < best.flaeche - EPS) best = { flaeche, ux, uy, minU, maxU, minV, maxV };
    }
    if (!best) return null;
    const { ux, uy, minU, maxU, minV, maxV } = best;
    const mu = (minU + maxU) / 2, mv = (minV + maxV) / 2;
    const mitte = { ost: mu * ux - mv * uy, nord: mu * uy + mv * ux };
    const su = maxU - minU, sv = maxV - minV;
    // Die lange Seite ist die Richtung.
    return su >= sv
        ? { mitte, richtung: { ost: ux, nord: uy }, laenge: su, breite: sv }
        : { mitte, richtung: { ost: -uy, nord: ux }, laenge: sv, breite: su };
}

/**
 * Die Form eines Körpers aus seinen Eckpunkten.
 * @param {Array<{ost, nord, hoehe?}>} punkte
 */
export function koerperform(punkte) {
    const hoehen = punkte.map(p => p.hoehe).filter(h => Number.isFinite(h));
    const unten = hoehen.length ? Math.min(...hoehen) : 0;
    const oben = hoehen.length ? Math.max(...hoehen) : 0;
    const umriss = konvexeHuelle(punkte);
    const r = kleinstesRechteck(umriss) ?? { mitte: { ost: 0, nord: 0 }, richtung: { ost: 1, nord: 0 }, laenge: 0, breite: 0 };
    const h = r.laenge / 2;
    const achse = [
        { ost: r.mitte.ost - r.richtung.ost * h, nord: r.mitte.nord - r.richtung.nord * h },
        { ost: r.mitte.ost + r.richtung.ost * h, nord: r.mitte.nord + r.richtung.nord * h },
    ];
    return { umriss, achse, mitte: r.mitte, laenge: r.laenge, breite: r.breite, unten, oben, hoehe: oben - unten };
}

/**
 * Wie sieht der Körper aus? Eine FORMKLASSE aus den Verhältnissen — kein
 * IFC-Typ. Welche Klasse daraus wird, sagt der Übersetzer.
 *
 *   scheibe   hoch, dünn, lang       → Wand
 *   stab      hoch, im Grundriss klein → Stütze, Pfosten
 *   balken    lang, flach, schmal    → Träger, Fundamentstreifen
 *   platte    flach im Verhältnis zur Fläche
 *   block     alles andere
 */
export function formklasse(f) {
    const { laenge: l, breite: b, hoehe: h } = f;
    if (l <= EPS) return 'block';
    if (b > EPS && l >= 3 * b && h >= 2 * b) return 'scheibe';
    if (h >= 2 * l) return 'stab';
    if (b > EPS && l >= 4 * b && l >= 4 * h) return 'balken';
    if (h <= Math.min(l, Math.max(b, EPS)) / 3) return 'platte';
    return 'block';
}
