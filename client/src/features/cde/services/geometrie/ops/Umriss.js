/**
 * Der GRUNDRISS eines Bauteils (Teil XIX, E1b) — Netz → Umriss.
 *
 * Wofür: das Gelände soll sich an ein vorhandenes Bauwerk anpassen. Dafür
 * braucht es dessen Grundfläche im Lageplan — und einen Arbeitsraum darum.
 *
 * WARUM DIE KONVEXE HÜLLE UND NICHT DIE EXAKTE SILHOUETTE. Der Lageplan
 * rechnet die echte, konkave Silhouette (`IfcShapeOutlines`, über
 * `polygon-clipping`) — hier ist sie die falsche Antwort, aus zwei Gründen:
 *
 *  1. FACHLICH: eine Baugrube fährt keine Nische nach. Sie umschliesst das
 *     Bauwerk in einer Form, in der ein Bagger arbeiten kann, und liegt damit
 *     auf der sicheren Seite — lieber etwas mehr Aushub als eine Grube, in
 *     die der Verbau nicht passt.
 *  2. TECHNISCH: `polygon-clipping` gehört ausdrücklich NICHT in den Kernel
 *     (Teil XIV, Landmine 8: es bricht bei fast-entarteter Eingabe, und ein
 *     Bauteilnetz mit tausenden koplanaren Dreiecken ist genau das). Die
 *     konvexe Hülle braucht keine Bibliothek und kann nicht scheitern.
 *
 * Wer die exakte Form braucht, zeichnet den Umriss von Hand — dafür gibt es
 * „Ausheben" mit Zug.
 *
 * Rein: kein three, kein DOM; läuft im Worker. Achsen wie überall (Teil XIV):
 * X und Z waagerecht, Y ist die Höhe.
 */

/** Punkte, die enger als das beieinander liegen, sind derselbe Punkt (m). */
const GLEICH_M = 1e-4;

/**
 * Die konvexe Hülle einer Punktwolke im Grundriss (Andrew's monotone chain).
 * Gegen den Uhrzeigersinn, ohne Doppelpunkte, ohne kollineare Zwischenpunkte.
 * @param {Array<{x, z}>} punkte
 * @returns {Array<{x, z}>} — leer bei weniger als drei echten Ecken
 */
export function konvexeHuelle(punkte) {
    const p = [];
    for (const q of punkte ?? []) {
        if (Number.isFinite(q?.x) && Number.isFinite(q?.z)) p.push({ x: q.x, z: q.z });
    }
    if (p.length < 3) return [];
    p.sort((a, b) => (a.x - b.x) || (a.z - b.z));

    // Kreuzprodukt: > 0 heisst Linksknick (gegen den Uhrzeigersinn).
    const kreuz = (o, a, b) => (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
    const kette = (folge) => {
        const aus = [];
        for (const q of folge) {
            while (aus.length >= 2 && kreuz(aus[aus.length - 2], aus[aus.length - 1], q) <= 0) aus.pop();
            aus.push(q);
        }
        aus.pop();                       // der letzte Punkt beginnt die andere Kette
        return aus;
    };
    const huelle = [...kette(p), ...kette([...p].reverse())];
    if (huelle.length < 3) return [];
    return huelle;
}

/**
 * Der Grundriss eines Netzes: alle Ecken auf die Waagerechte geworfen, davon
 * die konvexe Hülle. Zusätzlich die Höhenspanne — die Unterkante ist die
 * Gründungssohle, an der sich eine Baugrube ausrichtet.
 *
 * @param {{mesh: {positions: Float64Array, triCount: number}}} eingaben
 * @param {{schritt?: number}} parameter  schritt: nur jede n-te Ecke ansehen
 *   (ein Netz mit 200.000 Dreiecken braucht für seine Hülle nicht jeden Punkt)
 * @returns {{ergebnis: {ring, loecher, unterkante, oberkante}|null, warnungen}}
 */
export function grundrissAusMesh({ mesh } = {}, { schritt = 1 } = {}) {
    const warnungen = [];
    const pos = mesh?.positions;
    if (!pos?.length) return { ergebnis: null, warnungen: ['grundriss_ohne_netz'] };

    const s = Math.max(1, Math.floor(schritt));
    const punkte = [];
    let unten = Infinity;
    let oben = -Infinity;
    for (let i = 0; i < pos.length; i += 3 * s) {
        const x = pos[i], y = pos[i + 1], z = pos[i + 2];
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
        punkte.push({ x, z });
        if (y < unten) unten = y;
        if (y > oben) oben = y;
    }
    if (punkte.length < 3) return { ergebnis: null, warnungen: ['grundriss_zu_wenige_punkte'] };

    const ring = konvexeHuelle(punkte);
    if (ring.length < 3) return { ergebnis: null, warnungen: ['grundriss_entartet: alle Punkte auf einer Geraden'] };
    if (s > 1) warnungen.push(`grundriss_stichprobe: jede ${s}. Ecke angesehen`);

    return {
        ergebnis: {
            ring,
            loecher: [],
            unterkante: Number.isFinite(unten) ? unten : null,
            oberkante: Number.isFinite(oben) ? oben : null,
        },
        warnungen,
    };
}

/** Die Fläche eines Grundriss-Rings (Betrag, m²) — für Kennzahlen. */
export function umrissFlaeche(ring) {
    if (!Array.isArray(ring) || ring.length < 3) return 0;
    let a = 0;
    for (let i = 0; i < ring.length; i++) {
        const p = ring[i], q = ring[(i + 1) % ring.length];
        a += p.x * q.z - q.x * p.z;
    }
    return Math.abs(a) / 2;
}

/** Zwei Ringe gleich? — für Prüfmasse und Tests. */
export function ringeGleich(a, b, eps = GLEICH_M) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((p, i) => Math.abs(p.x - b[i].x) < eps && Math.abs(p.z - b[i].z) < eps);
}
