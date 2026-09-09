/**
 * Fangpunkte — der FACHLICHE Fang im Raum (Teil XVI, S1).
 *
 * Zwei Sorten Fang gibt es, und sie bleiben getrennt:
 *
 *   • Ecken und Kanten der Geometrie fängt die BIBLIOTHEK
 *     (`raycastWithSnapping`, SnappingClass POINT/LINE) — sie kennt die
 *     Dreiecke, wir nicht.
 *   • Schachtmitten, Achsenden, Stützpunkte fängt DIESE Datei — die
 *     Bibliothek weiss nicht, was ein Schacht ist.
 *
 * Rein: kein three, kein DOM, kein Vue. Der Fang ist eine Frage in
 * BILDSCHIRM-Pixeln („liegt der Zeiger nah genug an einem Kandidaten?"),
 * deshalb kommt die Projektion als Funktion herein — dieselbe, die auch das
 * HUD benutzt (`engine.projectToScreen`). Zwei Wege zur Projektion wären
 * der Anfang eines zweiten Wahrheitsstrangs.
 *
 * KEIN ZWEITER WEG ZU `Fanglinien.js`: die fängt in Ost/Nord an LINIEN
 * (Verlängerung, Quer, Flucht) und gehört den Griffen im Grundriss. Hier
 * werden nur PUNKTE gefangen, im Raum.
 */

/** Wie nah der Zeiger einem Kandidaten kommen muss — Bildschirm-Pixel. */
export const FANG_RADIUS_PX = 14;

/**
 * Rangfolge bei gleichem Abstand: ein Schacht ist der fachlich stärkere
 * Fang als ein Achsende, das wiederum stärker als ein Stützpunkt.
 */
const RANG = { schacht: 0, achsende: 1, stuetzpunkt: 2, ecke: 3, kante: 4 };

/**
 * Kandidaten sammeln.
 *
 * @param {object}   q
 * @param {Array<{x,y,z,name?,globalId?}>} q.schaechte  Schachtmitten (Welt)
 * @param {Array<{punkte:Array<{x,y,z}>,name?,globalId?}>} q.achsen  Achsen —
 *        ihre ENDEN werden Kandidaten, die Stützpunkte dazwischen nicht
 * @param {Array<{x,y,z,name?}>} q.stuetzpunkte  eigene Stützpunkte (Welt)
 * @returns {Array<{punkt:{x,y,z}, art:'schacht'|'achsende'|'stuetzpunkt', name:string, globalId?:string}>}
 */
export function fangkandidaten({ schaechte = [], achsen = [], stuetzpunkte = [] } = {}) {
    const aus = [];
    for (const s of schaechte) {
        if (!_endlich(s)) continue;
        aus.push({ punkt: { x: s.x, y: s.y, z: s.z }, art: 'schacht', name: s.name ?? 'Schacht', globalId: s.globalId ?? null });
    }
    for (const a of achsen) {
        const p = a?.punkte ?? [];
        if (p.length < 2) continue;
        const ersten = p[0]; const letzten = p[p.length - 1];
        for (const [e, welches] of [[ersten, 'Anfang'], [letzten, 'Ende']]) {
            if (!_endlich(e)) continue;
            aus.push({ punkt: { x: e.x, y: e.y, z: e.z }, art: 'achsende',
                       name: `${a.name ?? 'Achse'} · ${welches}`, globalId: a.globalId ?? null });
        }
    }
    for (const s of stuetzpunkte) {
        if (!_endlich(s)) continue;
        aus.push({ punkt: { x: s.x, y: s.y, z: s.z }, art: 'stuetzpunkt', name: s.name ?? 'Stützpunkt', globalId: s.globalId ?? null });
    }
    return aus;
}

/**
 * Den Zeigerpunkt auf den nächsten Kandidaten ziehen — oder ihn lassen.
 *
 * @param {object}   q
 * @param {{x,y,z}}  q.punkt        der rohe Treffer im Raum
 * @param {Array}    q.kandidaten   aus `fangkandidaten`
 * @param {(p:{x,y,z}) => ({x,y}|null)} q.projiziere  Welt → Bildschirm-Pixel
 * @param {number}   [q.radiusPx]
 * @returns {{ punkt:{x,y,z}, fang: null | {art, name, punkt, globalId, abstandPx} }}
 */
export function fangePunkt({ punkt, kandidaten = [], projiziere, radiusPx = FANG_RADIUS_PX } = {}) {
    if (!_endlich(punkt)) return { punkt: punkt ?? null, fang: null };
    if (typeof projiziere !== 'function' || !kandidaten.length) return { punkt, fang: null };
    const z = projiziere(punkt);
    if (!z) return { punkt, fang: null };
    let bester = null;
    for (const k of kandidaten) {
        const s = projiziere(k.punkt);
        if (!s) continue;
        const d = Math.hypot(s.x - z.x, s.y - z.y);
        if (d > radiusPx) continue;
        // Näher gewinnt; bei (fast) gleichem Abstand der fachlich stärkere.
        if (!bester || d < bester.abstandPx - 0.5
            || (Math.abs(d - bester.abstandPx) <= 0.5 && (RANG[k.art] ?? 9) < (RANG[bester.art] ?? 9))) {
            bester = { art: k.art, name: k.name, punkt: { ...k.punkt }, globalId: k.globalId ?? null, abstandPx: d };
        }
    }
    return bester ? { punkt: { ...bester.punkt }, fang: bester } : { punkt, fang: null };
}

/**
 * Die Station eines Punktes auf einer Achse — für die Geste „Punkt auf der
 * Achse" (Haltung teilen, Schacht einfügen).
 *
 * Gemessen im GRUNDRISS (XZ), wie die Stationierung im Kanalbau: ein Punkt,
 * der 3 m über der Achse liegt, hat dieselbe Station wie sein Lot. Die Höhe
 * des Ergebnispunkts wird auf der Achse interpoliert.
 *
 * @param {{punkte:Array<{x,y,z}>}} achse
 * @param {{x,z}} punkt
 * @returns {{station:number, punkt:{x,y,z}, segment:number, abstand:number}|null}
 */
export function stationAuf(achse, punkt) {
    const p = achse?.punkte ?? [];
    if (p.length < 2 || !punkt || !Number.isFinite(punkt.x) || !Number.isFinite(punkt.z)) return null;
    let bester = null;
    let laufend = 0;
    for (let i = 0; i < p.length - 1; i++) {
        const a = p[i], b = p[i + 1];
        const dx = b.x - a.x, dz = b.z - a.z;
        const laenge = Math.hypot(dx, dz);
        if (!(laenge > 0)) continue;
        let t = ((punkt.x - a.x) * dx + (punkt.z - a.z) * dz) / (laenge * laenge);
        t = Math.max(0, Math.min(1, t));
        const fx = a.x + t * dx, fz = a.z + t * dz;
        const abstand = Math.hypot(punkt.x - fx, punkt.z - fz);
        if (!bester || abstand < bester.abstand) {
            const ay = Number.isFinite(a.y) ? a.y : 0;
            const by = Number.isFinite(b.y) ? b.y : ay;
            bester = {
                station: laufend + t * laenge,
                punkt: { x: fx, y: ay + t * (by - ay), z: fz },
                segment: i,
                abstand,
            };
        }
        laufend += laenge;
    }
    return bester;
}

function _endlich(p) {
    return !!p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
}
