/**
 * Stationierung — die Weglänge entlang einer Achse, EINMAL (Teil XXIII, AE).
 *
 * Vorher drei Nachbauten derselben Rechnung: `_stationenEntlang` im
 * Kanalgraben, `pointAt`/`sohleAt` im Längsschnitt, `_ortBei` im Profilkörper.
 * Alle drei zählten gleich — in der DRAUFSICHT (x/z), so wie der Tiefbau
 * stationiert — und wählten an einer Knickstation denselben Abschnitt: den,
 * der dort ENDET (`s ≤ kum[i+1]`). Das bleibt die Regel; der Profilkörper
 * hängt daran, welche Sohlbreite an der Stufe gilt (DIN EN 1610 Tab. 2).
 *
 * Kern (L0), nicht Fachregel: es ist Geometrie, und der Profilkörper im Kern
 * braucht sie — der Kern importiert nicht nach oben (Wächter W1).
 *
 * NICHT hier: `MeshOps.profileAtStation` misst die Bogenlänge im RAUM. Das ist
 * Absicht — ein senkrechtes Fallrohr hat in der Draufsicht keine Länge.
 */

/**
 * Eine Polylinie stationieren.
 * @param {Array<{x:number, y?:number, z:number}>} punkte
 * @param {{ kum?: number[] }} [opt]  vorhandene Stationen übernehmen (Längsschnitt:
 *        die Schachtlücke zwischen zwei Haltungen zählt mit)
 * @returns {{ punkte, kum: number[], laenge: number }}
 */
export function stationiere(punkte, { kum = null } = {}) {
    if (kum) return { punkte, kum, laenge: kum.length ? kum[kum.length - 1] : 0 };
    const k = [0];
    for (let i = 0; i + 1 < punkte.length; i++) {
        k.push(k[i] + Math.hypot(punkte[i + 1].x - punkte[i].x, punkte[i + 1].z - punkte[i].z));
    }
    return { punkte, kum: k, laenge: k[k.length - 1] };
}

/**
 * Der Ort bei Station `s`.
 *
 * `ausserhalb`: 'klemmen' (Vorgabe) bleibt am ersten/letzten Punkt stehen;
 * 'verlaengern' läuft in Richtung des End-Abschnitts weiter — die Höhe bleibt
 * die des Endpunkts, `ueber` sagt, wie weit darüber hinaus (≥ 0).
 *
 * @returns {{ x, y, z, i: number, t: number, richtung: {x, z}, ueber: number } | null}
 *          `i`/`t`: Abschnitt und Anteil darin; `richtung`: Einheitsvektor des
 *          Abschnitts in der Draufsicht ({0,0} bei einem Abschnitt ohne Länge).
 */
export function ortBei(st, s, { ausserhalb = 'klemmen' } = {}) {
    const { punkte, kum, laenge } = st;
    const n = punkte.length;
    if (!n) return null;
    if (n === 1) return { x: punkte[0].x, y: punkte[0].y ?? 0, z: punkte[0].z, i: 0, t: 0, richtung: { x: 0, z: 0 }, ueber: 0 };
    const verl = ausserhalb === 'verlaengern';

    if (s <= kum[0]) {
        const r = richtungVon(punkte, 0), e = verl ? kum[0] - s : 0;
        return { x: punkte[0].x - r.x * e, y: punkte[0].y ?? 0, z: punkte[0].z - r.z * e, i: 0, t: 0, richtung: r, ueber: e };
    }
    if (s > laenge) {
        const m = n - 1, r = richtungVon(punkte, m - 1), e = verl ? s - laenge : 0;
        return { x: punkte[m].x + r.x * e, y: punkte[m].y ?? 0, z: punkte[m].z + r.z * e, i: m - 1, t: 1, richtung: r, ueber: e };
    }
    let i = 0;
    while (i + 2 < kum.length && kum[i + 1] < s) i++;
    const a = punkte[i], b = punkte[i + 1];
    const t = (s - kum[i]) / Math.max(1e-9, kum[i + 1] - kum[i]);
    return {
        x: a.x + (b.x - a.x) * t,
        y: (a.y ?? 0) + ((b.y ?? 0) - (a.y ?? 0)) * t,
        z: a.z + (b.z - a.z) * t,
        i, t, richtung: richtungVon(punkte, i), ueber: 0,
    };
}

/**
 * Die Punkte einer ACHSE, gleich woher sie kommt: die Engine liefert
 * `polyline`, eine Netzkante aus dem Bauplan `punkte`, ein Strangglied
 * mindestens Anfang und Ende.
 */
export function punkteDerAchse(a) {
    if (Array.isArray(a?.polyline) && a.polyline.length >= 2) return a.polyline;
    if (Array.isArray(a?.punkte) && a.punkte.length >= 2) return a.punkte;
    return a?.anfang && a?.ende ? [a.anfang, a.ende] : [];
}

/**
 * DAS GEFÄLLE, EINMAL (Teil XXIV, K5).
 *
 * Bis K5 rechneten fünf Stellen selbst — Befund, Achsbeschriftung,
 * Längsschnitt-Sicht, Vorschau, „Strang-Gefälle setzen" —, und nicht gegen
 * dieselbe Länge: die einen gegen die Weglänge in der Draufsicht, die anderen
 * gegen die gerade Sehne vom Anfang zum Ende, „Strang-Gefälle setzen" gegen die
 * räumliche Länge. Bei einer geraden Haltung ist das dasselbe; bei einer mit
 * Knick ist die Sehne kürzer, das Gefälle erscheint steiler, und ein zu
 * flaches Rohr fiel durch.
 *
 * Ein Gefälle ist Höhe je WAAGERECHTER Strecke entlang der Achse — dieselbe
 * Weglänge, mit der stationiert wird. Positiv heisst: fällt vom Anfang zum Ende.
 *
 * @param {Array<{x, y?, z}>} punkte  die Achse
 * @param {{anfang?: number, ende?: number}} [hoehen]  Höhen an Anfang und Ende,
 *        wenn nicht die der Punkte gelten (die Sohle statt der Achshöhe, eine
 *        Forderung statt der Lieferung) — dieselbe Einheit kommt zurück
 * @returns {{ fall: number, laenge2d: number, promille: number|null }}
 *          `promille` null, wenn die Achse keine waagerechte Länge oder keine Höhe hat
 */
export function gefaelle(punkte, { anfang = null, ende = null } = {}) {
    const p = (punkte ?? []).filter(Boolean);
    if (p.length < 2) return { fall: NaN, laenge2d: 0, promille: null };
    const hA = Number.isFinite(anfang) ? anfang : (p[0].y == null ? NaN : Number(p[0].y));
    const hE = Number.isFinite(ende) ? ende : (p[p.length - 1].y == null ? NaN : Number(p[p.length - 1].y));
    const fall = hA - hE;
    const { laenge } = stationiere(p);
    return { fall, laenge2d: laenge, promille: laenge > 1e-9 && Number.isFinite(fall) ? (fall / laenge) * 1000 : null };
}

/** Nur die Zahl: ‰, positiv = fällt; null ohne Länge oder Höhe. */
export function gefaellePromille(punkte, hoehen) {
    return gefaelle(punkte, hoehen).promille;
}

/** Einheitsrichtung des Abschnitts i in der Draufsicht ({0,0} ohne Länge). */
export function richtungVon(punkte, i) {
    const a = punkte[i], b = punkte[i + 1];
    if (!a || !b) return { x: 0, z: 0 };
    const l = Math.hypot(b.x - a.x, b.z - a.z);
    return l > 0 ? { x: (b.x - a.x) / l, z: (b.z - a.z) / l } : { x: 0, z: 0 };
}

/**
 * Eine Polylinie in Stationen zerlegen: jeder Knickpunkt bleibt, dazwischen
 * höchstens `schritt` Meter. Die Höhe läuft linear im Abschnitt mit.
 */
export function stationenEntlang(punkte, schritt) {
    const aus = [];
    for (let i = 0; i + 1 < punkte.length; i++) {
        const a = punkte[i], b = punkte[i + 1];
        const l = Math.hypot(b.x - a.x, b.z - a.z);
        aus.push({ x: a.x, y: a.y, z: a.z });
        if (!(l > 0)) continue;
        const teile = Math.max(1, Math.ceil(l / Math.max(0.01, schritt)));
        for (let k = 1; k < teile; k++) {
            const t = k / teile;
            aus.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
        }
    }
    const letzter = punkte[punkte.length - 1];
    aus.push({ x: letzter.x, y: letzter.y, z: letzter.z });
    return aus;
}
