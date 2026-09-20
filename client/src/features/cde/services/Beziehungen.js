/**
 * Beziehungen — welche Objekte einander berühren (Teil XVII, B1).
 *
 * WARUM EIN INDEX. Bis hierher gab es die Frage „wer hängt an wem?" viermal,
 * jedes Mal anders beantwortet: die XY-Koinzidenz in `Netztopologie` (der
 * Viewer hängt `el.anschluesse` ans Subjekt), eine eigene Hüllenschleife in
 * der Kollisionsprüfung, das Sampling im Kanalgraben-Rezept für die
 * Überdeckung, und der Rückwärtsindex der Ableitungen aus dem Journal. Vier
 * Kandidatensuchen, vier Toleranzen — die Fehlerklasse „zwei Wege zu
 * derselben Frage", vierfach. Dieser Dienst ist die EINE Ableitung, aus der
 * alle lesen.
 *
 * DIE ARTEN SIND GESCHLOSSEN, weil die Dimensionen es sind: eine Beziehung
 * ist eine Frage an zwei Bauformen, und davon gibt es acht. Aus den
 * Dimensionspaaren folgen acht geometrische Arten (`ARTEN`), dazu zwei
 * erklärte (Journal, IFC). Eine neue Disziplin bringt neue PAARE derselben
 * Arten mit — Gleis `station` Signal, Pfeiler `auflage` Gelände —, nie eine
 * neue Art.
 *
 * JEDE BEZIEHUNG HAT DIESELBE FORM: `{ art, a, b, mass, guete, herkunft }`.
 * Gerichtet, wo die Art es sagt (`auflage`: a liegt auf b; `enthalten`: a in
 * b; `ableitung`: Teil → Quelle), sonst symmetrisch. `mass` ist, was
 * Werkzeug und Befund brauchen (Ende, Station, Abstand, Überdeckung);
 * `guete` sagt, wie genau geprüft wurde: `form` (Achse, Knoten, Sampler —
 * für alles mit einer Achse rechnet der Index den ECHTEN Abstand Lauf zu
 * Lauf bzw. Lauf zu Körper; die Bounding-Box eines schrägen Rohrs ist so
 * gross wie das halbe Baufeld und taugt nicht als Beleg) oder `huelle` (Box
 * gegen Box, nur noch Körper zu Körper — ein Kandidat, kein Beweis). Die dritte Stufe `koerper` (Server-Boolean)
 * setzt die Kollisionsprüfung auf die `schnitt`-Kandidaten dieses Index —
 * sie wird hier nie gerechnet.
 *
 * ABGELEITET, NIE GESPEICHERT (Gesetz 5). Im Journal bleibt eine Beziehung
 * ein eingefrorenes Prüfmass (`bezug.zielBasis`), kein Verweis hierher: der
 * Index ist nach jedem Zug frisch, das Journal nicht.
 *
 * KANDIDATEN ÜBER SORT-AND-SWEEP der Hüllen in X, nie O(n²). Ein
 * Dirty-Aufbau (`vorher` + `dirty`) rechnet nur die Paare neu, an denen ein
 * bewegtes Objekt beteiligt ist — ein Zug am Schacht kostet ein Dutzend
 * Paare, nicht fünfhundert.
 *
 * TOPOLOGISCH NAHES fällt aus Nähe/Schnitt/Enthalten heraus: das Rohr, das
 * am Schacht hängt, „schneidet" ihn nicht — es ist angeschlossen. Sonst
 * meldete jedes Netz so viele Kollisionen, wie es Anschlüsse hat.
 *
 * Reines Modul: kein Vue, kein three, kein WebGL, keine Engine.
 */
import { baueNetz } from './Netztopologie.js';
import { scheitelAnAchse } from './Achsbezug.js';

/** Die Arten — eine Systematik aus Dimensionspaaren, keine Beispielsammlung. */
export const ARTEN = Object.freeze({
    anschluss: { titel: 'Anschluss', gerichtet: true,  paarung: '0D ↔ 0D',   text: 'Ende von A liegt auf dem Knoten von B' },
    station:   { titel: 'Station',   gerichtet: true,  paarung: '0D ↔ 1D',   text: 'A liegt an der Achse von B' },
    kreuzung:  { titel: 'Kreuzung',  gerichtet: false, paarung: '1D × 1D',   text: 'die Achsen schneiden sich im Grundriss' },
    naehe:     { titel: 'Nähe',      gerichtet: false, paarung: 'beliebig',  text: 'die Hüllen liegen näher als die Schwelle' },
    auflage:   { titel: 'Auflage',   gerichtet: true,  paarung: 'xD ↔ 2,5D', text: 'A liegt über oder unter dem Höhenfeld B' },
    enthalten: { titel: 'Enthalten', gerichtet: true,  paarung: '3D ⊂ 3D',   text: 'die Hülle von A liegt in der Hülle von B' },
    schnitt:   { titel: 'Schnitt',   gerichtet: false, paarung: '3D ∩ 3D',   text: 'die Körper überschneiden sich' },
    stapel:    { titel: 'Stapel',    gerichtet: true,  paarung: '2D+ ↔ 2D+', text: 'Schicht A liegt auf Schicht B' },
    ableitung: { titel: 'Ableitung', gerichtet: true,  paarung: 'Verlauf',   text: 'Teil A ist aus Quelle B abgeleitet' },
    gruppe:    { titel: 'Gruppe',    gerichtet: true,  paarung: 'IFC',       text: 'A gehört zur Gruppe B' },
});

/** Was dieser Aufbau rechnet. `stapel` wartet auf das erste Straßenmodell (B4). */
export const ARTEN_GEBAUT = Object.freeze([
    'anschluss', 'station', 'kreuzung', 'naehe', 'auflage', 'enthalten', 'schnitt', 'ableitung', 'gruppe',
]);

/** Arten, die je PAAR aus der Geometrie kommen — beim Dirty-Aufbau nur für berührte Paare neu. */
const PAARWEISE = new Set(['station', 'kreuzung', 'naehe', 'enthalten', 'schnitt']);

/**
 * Vorgaben. Toleranzen sind DATEN (Gesetz 2): das `REGELWERK` der Befunde
 * überstimmt sie (`netzToleranzM`, `naeheSchwelleM`, `stationAbstandM`),
 * und das Büro überstimmt das Regelwerk.
 */
export const VORGABEN = Object.freeze({
    /** m; Rohrende auf Schachtknoten — in ISYBAU-Exporten exakt 0. */
    anschlussToleranzM: 0.001,
    /** m; ein Punktobjekt gilt als „an der Achse", wenn es näher liegt. */
    stationAbstandM: 0.5,
    /** m; zwei Hüllen näher als das sind „nah" (nur topologisch Fremde). */
    naeheSchwelleM: 0.5,
    /** m; Spiel beim Hüllenvergleich (Enthalten/Schnitt). */
    huellenToleranzM: 0.01,
    /** m; unterhalb davon liegt etwas „auf" dem Gelände, nicht darüber/darunter. */
    auflageToleranzM: 0.05,
});

/** Pseudo-Kennung der Geländeseite, wenn kein DGM eine GlobalId hat. */
export const GELAENDE_ID = 'gelaende';
export const GRUPPE_PRAEFIX = 'gruppe:';
const istPseudo = (id) => id === GELAENDE_ID || String(id).startsWith(GRUPPE_PRAEFIX);

// ── Geometrie-Helfer ────────────────────────────────────────────────────────

const fin = (v) => Number.isFinite(v);
const punktGut = (p) => !!p && fin(p.x) && fin(p.y) && fin(p.z);

function _boxAus(punkte) {
    let b = null;
    for (const p of punkte ?? []) {
        if (!punktGut(p)) continue;
        if (!b) b = { min: { x: p.x, y: p.y, z: p.z }, max: { x: p.x, y: p.y, z: p.z } };
        else {
            b.min.x = Math.min(b.min.x, p.x); b.min.y = Math.min(b.min.y, p.y); b.min.z = Math.min(b.min.z, p.z);
            b.max.x = Math.max(b.max.x, p.x); b.max.y = Math.max(b.max.y, p.y); b.max.z = Math.max(b.max.z, p.z);
        }
    }
    return b;
}
const boxGut = (b) => !!b?.min && !!b?.max
    && [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z].every(fin)
    && b.min.x <= b.max.x && b.min.y <= b.max.y && b.min.z <= b.max.z;

/** Abstand zweier Boxen (0 bei Überlappung). */
function _boxAbstand(a, b) {
    const dx = Math.max(0, b.min.x - a.max.x, a.min.x - b.max.x);
    const dy = Math.max(0, b.min.y - a.max.y, a.min.y - b.max.y);
    const dz = Math.max(0, b.min.z - a.max.z, a.min.z - b.max.z);
    return Math.hypot(dx, dy, dz);
}
function _xzNah(a, b, reich) {
    return a.min.x <= b.max.x + reich && b.min.x <= a.max.x + reich
        && a.min.z <= b.max.z + reich && b.min.z <= a.max.z + reich;
}
function _enthaelt(aussen, innen, tol) {
    return innen.min.x >= aussen.min.x - tol && innen.max.x <= aussen.max.x + tol
        && innen.min.y >= aussen.min.y - tol && innen.max.y <= aussen.max.y + tol
        && innen.min.z >= aussen.min.z - tol && innen.max.z <= aussen.max.z + tol;
}
function _ueberlappungsVolumen(a, b) {
    const dx = Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x);
    const dy = Math.min(a.max.y, b.max.y) - Math.max(a.min.y, b.min.y);
    const dz = Math.min(a.max.z, b.max.z) - Math.max(a.min.z, b.min.z);
    return dx > 0 && dy > 0 && dz > 0 ? dx * dy * dz : 0;
}
const _mitte = (b) => ({ x: (b.min.x + b.max.x) / 2, y: (b.min.y + b.max.y) / 2, z: (b.min.z + b.max.z) / 2 });

/** Nächster Punkt auf einer Polylinie IM GRUNDRISS — Station, Querabstand, Höhe dort. */
export function stationAn(punkte, p) {
    let best = null;
    let laufend = 0;
    for (let i = 0; i + 1 < punkte.length; i++) {
        const a = punkte[i], b = punkte[i + 1];
        const dx = b.x - a.x, dz = b.z - a.z;
        const l2 = dx * dx + dz * dz;
        const l = Math.sqrt(l2);
        let t = l2 > 0 ? ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2 : 0;
        t = Math.max(0, Math.min(1, t));
        const qx = a.x + t * dx, qz = a.z + t * dz;
        const quer = Math.hypot(p.x - qx, p.z - qz);
        if (!best || quer < best.quer) {
            best = { quer, station: laufend + t * l, segment: i, t,
                     punkt: { x: qx, y: a.y + t * (b.y - a.y), z: qz } };
        }
        laufend += l;
    }
    return best ? { ...best, laenge: laufend } : null;
}

/** Kleinster Abstand zweier Strecken im Raum (Ericson, Real-Time Collision Detection 5.1.9). */
function _abstandStreckeStrecke(p1, q1, p2, q2) {
    const d1 = { x: q1.x - p1.x, y: q1.y - p1.y, z: q1.z - p1.z };
    const d2 = { x: q2.x - p2.x, y: q2.y - p2.y, z: q2.z - p2.z };
    const r = { x: p1.x - p2.x, y: p1.y - p2.y, z: p1.z - p2.z };
    const dot = (u, v) => u.x * v.x + u.y * v.y + u.z * v.z;
    const a = dot(d1, d1), e = dot(d2, d2), f = dot(d2, r);
    const EPS = 1e-12;
    let sN, tN;
    if (a <= EPS && e <= EPS) { sN = 0; tN = 0; }
    else if (a <= EPS) { sN = 0; tN = Math.max(0, Math.min(1, f / e)); }
    else {
        const c = dot(d1, r);
        if (e <= EPS) { tN = 0; sN = Math.max(0, Math.min(1, -c / a)); }
        else {
            const b = dot(d1, d2);
            const denom = a * e - b * b;
            sN = denom !== 0 ? Math.max(0, Math.min(1, (b * f - c * e) / denom)) : 0;
            tN = (b * sN + f) / e;
            if (tN < 0) { tN = 0; sN = Math.max(0, Math.min(1, -c / a)); }
            else if (tN > 1) { tN = 1; sN = Math.max(0, Math.min(1, (b - c) / a)); }
        }
    }
    const c1 = { x: p1.x + d1.x * sN, y: p1.y + d1.y * sN, z: p1.z + d1.z * sN };
    const c2 = { x: p2.x + d2.x * tN, y: p2.y + d2.y * tN, z: p2.z + d2.z * tN };
    return { abstand: Math.hypot(c1.x - c2.x, c1.y - c2.y, c1.z - c2.z), punkt: { x: (c1.x + c2.x) / 2, y: (c1.y + c2.y) / 2, z: (c1.z + c2.z) / 2 } };
}
function _abstandPunktBox(p, b) {
    return Math.hypot(Math.max(0, b.min.x - p.x, p.x - b.max.x), Math.max(0, b.min.y - p.y, p.y - b.max.y), Math.max(0, b.min.z - p.z, p.z - b.max.z));
}
/** Kleinster Abstand einer Strecke zu einer Box — der Abstand ist konvex in t, darum reicht die Dreiteilung. */
function _abstandStreckeBox(p, q, b) {
    const an = (t) => _abstandPunktBox({ x: p.x + t * (q.x - p.x), y: p.y + t * (q.y - p.y), z: p.z + t * (q.z - p.z) }, b);
    let lo = 0, hi = 1;
    for (let i = 0; i < 40; i++) {
        const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
        if (an(m1) <= an(m2)) hi = m2; else lo = m1;
    }
    const t = (lo + hi) / 2;
    return { abstand: an(t), punkt: { x: p.x + t * (q.x - p.x), y: p.y + t * (q.y - p.y), z: p.z + t * (q.z - p.z) } };
}
function _abstandPolylinien(pa, pb) {
    let best = null;
    for (let i = 0; i + 1 < pa.length; i++) for (let j = 0; j + 1 < pb.length; j++) {
        const r = _abstandStreckeStrecke(pa[i], pa[i + 1], pb[j], pb[j + 1]);
        if (!best || r.abstand < best.abstand) best = r;
    }
    return best;
}
function _abstandPolylinieBox(pa, b) {
    let best = null;
    for (let i = 0; i + 1 < pa.length; i++) {
        const r = _abstandStreckeBox(pa[i], pa[i + 1], b);
        if (!best || r.abstand < best.abstand) best = r;
    }
    return best;
}
/** Der Radius eines Laufs: aus dem DN (mm), sonst aus der halben Hüllenhöhe. */
function _radius(o) {
    if (fin(o.achse?.dn) && o.achse.dn > 0) return o.achse.dn / 2000;
    return o.huelle ? Math.max(0, (o.huelle.max.y - o.huelle.min.y) / 2) : 0;
}

/** Schnitt zweier Strecken im Grundriss — strikt innen, mit Parametern und Höhen beider. */
function _streckenSchnittXZ(a1, a2, b1, b2, eps = 1e-9) {
    const rx = a2.x - a1.x, rz = a2.z - a1.z;
    const sx = b2.x - b1.x, sz = b2.z - b1.z;
    const kreuz = rx * sz - rz * sx;
    if (Math.abs(kreuz) < eps) return null;                       // parallel oder kollinear
    const qx = b1.x - a1.x, qz = b1.z - a1.z;
    const t = (qx * sz - qz * sx) / kreuz;
    const u = (qx * rz - qz * rx) / kreuz;
    if (t <= eps || t >= 1 - eps || u <= eps || u >= 1 - eps) return null;
    const winkel = Math.abs(Math.atan2(kreuz, rx * sx + rz * sz)) * 180 / Math.PI;
    return {
        t, u,
        x: a1.x + t * rx, z: a1.z + t * rz,
        yA: a1.y + t * (a2.y - a1.y), yB: b1.y + u * (b2.y - b1.y),
        winkelGrad: winkel > 90 ? 180 - winkel : winkel,
    };
}

// ── Objekte normieren ───────────────────────────────────────────────────────

/**
 * Ein Objekt des Index: `{ globalId, name, kategorie, herkunft, bauform,
 * huelle, achse:{punkte, dn}|null, knoten:{x,y,z}|null, ort }`. Wer keine
 * Hülle mitbringt, bekommt eine aus Achse oder Knoten — dann läuft es
 * trotzdem durch den Sweep.
 */
function _normiere(o) {
    if (!o?.globalId) return null;
    const punkte = o.achse?.punkte ?? o.achse?.polyline
        ?? (o.achse?.anfang && o.achse?.ende ? [o.achse.anfang, o.achse.ende] : null);
    const achse = Array.isArray(punkte) && punkte.filter(punktGut).length >= 2
        ? { punkte: punkte.filter(punktGut), dn: fin(o.achse?.dn) ? o.achse.dn : null,
            // Was die Höhen SIND (K4) — die Überdeckung misst am Scheitel.
            achsbezug: o.achse?.achsbezug ?? null, quelle: o.achse?.quelle ?? null,
            sohlabstand: fin(o.achse?.sohlabstand) ? o.achse.sohlabstand : null,
            profilhoehe: fin(o.achse?.profilhoehe) ? o.achse.profilhoehe : null }
        : null;
    const knoten = punktGut(o.knoten) ? { x: o.knoten.x, y: o.knoten.y, z: o.knoten.z } : null;
    let huelle = boxGut(o.huelle) ? o.huelle : null;
    if (!huelle && achse) huelle = _boxAus(achse.punkte);
    if (!huelle && knoten) huelle = _boxAus([knoten]);
    if (!huelle && !achse && !knoten) return null;
    return {
        globalId: String(o.globalId),
        name: o.name ?? '',
        kategorie: o.kategorie ?? '',
        herkunft: o.herkunft ?? 'geliefert',
        bauform: o.bauform ?? null,
        huelle, achse, knoten,
        ort: o.ort ?? null,
        volumenHuelle: huelle ? (huelle.max.x - huelle.min.x) * (huelle.max.y - huelle.min.y) * (huelle.max.z - huelle.min.z) : 0,
    };
}

// ── Der Aufbau ──────────────────────────────────────────────────────────────

/**
 * Den Index bauen.
 *
 * @param {object} opts
 * @param {Array} opts.objekte        siehe `_normiere`
 * @param {{globalId?:string, hoeheAn?:(x:number,z:number)=>number}|null} [opts.gelaende]
 *        die Geländeseite der `auflage` — `hoeheAn` kommt vom Sampler
 * @param {Array<{teil:string, quelle:string}>} [opts.ableitungen]  aus dem Journal (der Viewer weiss es, die Engine nicht)
 * @param {Map<string, string[]>|null} [opts.gruppen]  GlobalId → Gruppennamen (IFC-Systeme, Kanalart)
 * @param {object} [opts.regeln]      Regelwerk (netzToleranzM, naeheSchwelleM, stationAbstandM)
 * @param {object|null} [opts.vorher] der vorige Index — mit `dirty` wird nur Berührtes neu gerechnet
 * @param {Set<string>|null} [opts.dirty]  bewegte/neue/verschwundene GlobalIds; null = alles neu
 */
export function baueBeziehungen({
    objekte = [], gelaende = null, ableitungen = [], gruppen = null, regeln = {}, vorher = null, dirty = null,
} = {}) {
    const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const tolAnschluss = fin(regeln?.netzToleranzM) && regeln.netzToleranzM > 0 ? regeln.netzToleranzM : VORGABEN.anschlussToleranzM;
    const naeheSchwelle = fin(regeln?.naeheSchwelleM) ? regeln.naeheSchwelleM : VORGABEN.naeheSchwelleM;
    const stationAbstand = fin(regeln?.stationAbstandM) ? regeln.stationAbstandM : VORGABEN.stationAbstandM;
    const tolHuelle = VORGABEN.huellenToleranzM;
    const tolAuflage = VORGABEN.auflageToleranzM;

    const karte = new Map();
    for (const roh of objekte) {
        const o = _normiere(roh);
        if (o) karte.set(o.globalId, o);
    }
    const teilweise = !!(vorher && dirty instanceof Set);
    const beruehrt = (gid) => !teilweise || dirty.has(gid);
    const relationen = [];
    const rel = (art, a, b, mass, guete = 'form') => {
        relationen.push({ art, a: a.globalId ?? a, b: b.globalId ?? b, an: a.name ?? '', bn: b.name ?? '', mass, guete, herkunft: 'geometrie' });
    };

    // 1 · ANSCHLUSS über die XY-Koinzidenz — derselbe Zulieferer wie das Netz.
    const kanten = [], knoten = [];
    for (const o of karte.values()) {
        if (o.achse) kanten.push({ id: o.globalId, anfang: o.achse.punkte[0], ende: o.achse.punkte[o.achse.punkte.length - 1], dn: o.achse.dn });
        if (o.knoten) knoten.push({ id: o.globalId, punkt: o.knoten });
    }
    const netz = baueNetz({ kanten, knoten, toleranz: tolAnschluss });
    const nah = new Map();                     // gid → Set<gid>, topologisch nah
    const merkeNah = (x, y) => {
        if (!nah.has(x)) nah.set(x, new Set());
        if (!nah.has(y)) nah.set(y, new Set());
        nah.get(x).add(y); nah.get(y).add(x);
    };
    for (const k of netz.kanten.values()) {
        const rohr = karte.get(k.id);
        for (const [knotenId, ende, punkt] of [[k.von, 'anfang', k.anfang], [k.nach, 'ende', k.ende]]) {
            if (!knotenId) continue;
            const s = karte.get(knotenId);
            rel('anschluss', rohr, s, { ende, dz: punkt.y - s.knoten.y, punkt: { x: punkt.x, y: punkt.y, z: punkt.z } });
            merkeNah(rohr.globalId, s.globalId);
        }
    }
    for (const s of netz.knoten.values()) {
        const alle = [...s.kantenAn, ...s.kantenAb];
        for (let i = 0; i < alle.length; i++) for (let j = i + 1; j < alle.length; j++) merkeNah(alle[i], alle[j]);
    }
    const topologischNah = (a, b) => nah.get(a)?.has(b) ?? false;

    // 2 · PAARWEISE über den Sweep der Hüllen in X.
    const reich = Math.max(naeheSchwelle, stationAbstand, tolHuelle);
    const sortiert = [...karte.values()].filter(o => o.huelle).sort((p, q) => p.huelle.min.x - q.huelle.min.x);
    for (let i = 0; i < sortiert.length; i++) {
        const A = sortiert[i];
        for (let j = i + 1; j < sortiert.length; j++) {
            const B = sortiert[j];
            if (B.huelle.min.x > A.huelle.max.x + reich) break;
            if (teilweise && !dirty.has(A.globalId) && !dirty.has(B.globalId)) continue;
            if (!_xzNah(A.huelle, B.huelle, reich)) continue;
            if (topologischNah(A.globalId, B.globalId)) continue;

            // KREUZUNG — nur der Grundriss zählt; die Höhe ist das Mass.
            let gekreuzt = false;
            if (A.achse && B.achse) {
                const pa = A.achse.punkte, pb = B.achse.punkte;
                for (let s = 0; s + 1 < pa.length; s++) {
                    for (let u = 0; u + 1 < pb.length; u++) {
                        const x = _streckenSchnittXZ(pa[s], pa[s + 1], pb[u], pb[u + 1]);
                        if (!x) continue;
                        const stA = stationAn(pa, { x: x.x, z: x.z }), stB = stationAn(pb, { x: x.x, z: x.z });
                        rel('kreuzung', A, B, {
                            hoehenabstand: x.yA - x.yB, winkelGrad: x.winkelGrad,
                            stationA: stA?.station ?? null, stationB: stB?.station ?? null,
                            punkt: { x: x.x, y: (x.yA + x.yB) / 2, z: x.z },
                        });
                        gekreuzt = true;
                    }
                }
            }

            // STATION — ein Punktobjekt an der Achse eines anderen (nicht an dessen Enden).
            for (const [P, L] of [[A, B], [B, A]]) {
                if (P.achse || !L.achse) continue;
                const p = P.knoten ?? _mitte(P.huelle);
                const st = stationAn(L.achse.punkte, p);
                if (!st || st.quer > stationAbstand) continue;
                if (st.station <= tolAnschluss || st.station >= st.laenge - tolAnschluss) continue;
                rel('station', P, L, { station: st.station, quer: st.quer, punkt: st.punkt, laenge: st.laenge });
            }

            // ENTHALTEN / SCHNITT / NÄHE — mit ACHSE der echte Abstand (Güte
            // `form`), sonst Hülle gegen Hülle (Güte `huelle`).
            if (A.achse || B.achse) {
                const [L, X] = A.achse ? [A, B] : [B, A];          // L ist ein Lauf
                let d, punkt, koerperAbstand;
                if (X.achse) {
                    const r = _abstandPolylinien(L.achse.punkte, X.achse.punkte);
                    d = r.abstand; punkt = r.punkt; koerperAbstand = d - _radius(L) - _radius(X);
                } else {
                    const r = _abstandPolylinieBox(L.achse.punkte, X.huelle);
                    d = r.abstand; punkt = r.punkt; koerperAbstand = d - _radius(L);
                }
                if (koerperAbstand <= tolHuelle) {
                    // Liegt der ganze Lauf in der Hülle des Körpers, ist er ENTHALTEN
                    // (Rohr im Graben), sonst SCHNITT (Rohr durchs Fundament).
                    const drin = !X.achse && L.achse.punkte.every(q => _abstandPunktBox(q, X.huelle) <= tolHuelle)
                        && _enthaelt(X.huelle, L.huelle, Math.max(tolHuelle, _radius(L)));
                    if (drin) rel('enthalten', L, X, { anteil: 1 }, 'form');
                    else rel('schnitt', A, B, { abstand: Math.max(0, d), punkt, volumenHuelle: _ueberlappungsVolumen(A.huelle, B.huelle) }, 'form');
                } else if (!gekreuzt && koerperAbstand <= naeheSchwelle) {
                    // Eine Kreuzung trägt ihr Mass selbst (Höhenabstand) — sie
                    // ist keine „Nähe" obendrein; sonst meldete jede Kreuzung
                    // zweimal.
                    rel('naehe', A, B, { abstand: koerperAbstand, punkt }, 'form');
                }
                continue;
            }
            const d = _boxAbstand(A.huelle, B.huelle);
            if (d === 0) {
                const aInB = _enthaelt(B.huelle, A.huelle, tolHuelle);
                const bInA = _enthaelt(A.huelle, B.huelle, tolHuelle);
                if (aInB && !bInA) rel('enthalten', A, B, { anteil: 1 }, 'huelle');
                else if (bInA && !aInB) rel('enthalten', B, A, { anteil: 1 }, 'huelle');
                else {
                    const v = _ueberlappungsVolumen(A.huelle, B.huelle);
                    const anteil = v / Math.max(1e-9, Math.min(A.volumenHuelle, B.volumenHuelle));
                    rel('schnitt', A, B, { volumenHuelle: v, anteil: Math.min(1, anteil) }, 'huelle');
                }
            } else if (d <= naeheSchwelle) {
                rel('naehe', A, B, { abstand: d }, 'huelle');
            }
        }
    }

    // 3 · AUFLAGE — jedes Objekt gegen das Höhenfeld (Sampler).
    const hoeheAn = typeof gelaende?.hoeheAn === 'function' ? gelaende.hoeheAn : null;
    const gelaendeGid = gelaende?.globalId ?? GELAENDE_ID;
    const gelaendeName = gelaende?.name ?? 'Gelände';
    if (hoeheAn) {
        for (const o of karte.values()) {
            if (!beruehrt(o.globalId) || o.globalId === gelaendeGid) continue;
            let mass = null;
            if (o.achse) {
                // Rohrscheitel gegen das Gelände, an Stützpunkten und Segmentmitten
                // — dasselbe Mass wie im Kanalgraben-Rezept. Der Scheitel mit
                // dem BEZUG der Achse (K4): eine Achse auf Sohlniveau hat ihn
                // 2r darüber, nicht r — die Überdeckung war dort um r zu gross.
                const scheitelVon = (y) => scheitelAnAchse(y, { ...o.achse, dn: fin(o.achse.dn) ? o.achse.dn : 0 });
                let min = Infinity, wo = null;
                const probe = (x, y, z) => {
                    const h = hoeheAn(x, z);
                    if (!fin(h)) return;
                    const s = scheitelVon(y);
                    const u = h - s;
                    if (u < min) { min = u; wo = { x, y: s, z }; }
                };
                const pts = o.achse.punkte;
                for (let i = 0; i < pts.length; i++) {
                    probe(pts[i].x, pts[i].y, pts[i].z);
                    if (i + 1 < pts.length) probe((pts[i].x + pts[i + 1].x) / 2, (pts[i].y + pts[i + 1].y) / 2, (pts[i].z + pts[i + 1].z) / 2);
                }
                if (fin(min)) mass = { ueberdeckung: min, lage: min > tolAuflage ? 'unter' : (min < -tolAuflage ? 'ueber' : 'auf'), punkt: wo };
            } else {
                const m = o.knoten ?? _mitte(o.huelle);
                const h = hoeheAn(m.x, m.z);
                if (fin(h)) {
                    const oben = o.huelle ? o.huelle.max.y : m.y;
                    const unten = o.huelle ? o.huelle.min.y : m.y;
                    const u = h - oben;
                    // „auf": die Oberseite liegt am Gelände (Schachtdeckel) oder das
                    // Objekt durchstösst es (Bauwerk im Boden mit Deckel darüber).
                    const lage = u > tolAuflage ? 'unter' : (unten > h + tolAuflage ? 'ueber' : 'auf');
                    mass = { ueberdeckung: u, lage, punkt: { x: m.x, y: h, z: m.z } };
                }
            }
            if (mass) rel('auflage', o, { globalId: gelaendeGid, name: gelaendeName }, mass);
        }
    }

    // 4 · ABLEITUNG (Journal) und GRUPPE (IFC) — erklärt, immer frisch.
    for (const ab of ableitungen ?? []) {
        if (!ab?.teil || !ab?.quelle) continue;
        const t = karte.get(ab.teil) ?? { globalId: ab.teil, name: ab.teilName ?? '' };
        const q = karte.get(ab.quelle) ?? { globalId: ab.quelle, name: ab.quelleName ?? '' };
        relationen.push({ art: 'ableitung', a: t.globalId, b: q.globalId, an: t.name ?? '', bn: q.name ?? '',
                          mass: {}, guete: 'erklaert', herkunft: 'journal' });
    }
    if (gruppen instanceof Map) {
        for (const [gid, namen] of gruppen) {
            const o = karte.get(gid) ?? { globalId: gid, name: '' };
            for (const n of namen ?? []) {
                if (!n) continue;
                relationen.push({ art: 'gruppe', a: o.globalId, b: `${GRUPPE_PRAEFIX}${n}`, an: o.name ?? '', bn: String(n),
                                  mass: {}, guete: 'erklaert', herkunft: 'ifc' });
            }
        }
    }

    // 5 · Beim Dirty-Aufbau: was niemand berührt hat, bleibt.
    if (teilweise) {
        for (const r of vorher.relationen ?? []) {
            if (!(PAARWEISE.has(r.art) || r.art === 'auflage')) continue;
            if (dirty.has(r.a) || dirty.has(r.b)) continue;
            if (!karte.has(r.a)) continue;
            if (!karte.has(r.b) && !istPseudo(r.b)) continue;
            if (r.art === 'auflage' && (!hoeheAn || r.b !== gelaendeGid)) continue;
            relationen.push(r);
        }
    }

    const dauerMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
    return _index(relationen, karte, {
        anzahl: relationen.length, objekte: karte.size, dauerMs,
        teilweise, dirty: teilweise ? dirty.size : null,
        arten: Object.fromEntries(ARTEN_GEBAUT.map(a => [a, relationen.filter(r => r.art === a).length])),
        loseEnden: netz.loseEnden.length, ohneAnschluss: netz.ohneAnschluss.length,
    });
}

function _index(relationen, karte, stand) {
    const je = new Map();
    for (const r of relationen) {
        if (!je.has(r.a)) je.set(r.a, []);
        je.get(r.a).push(r);
        if (r.b !== r.a) {
            if (!je.has(r.b)) je.set(r.b, []);
            je.get(r.b).push(r);
        }
    }
    const von = (gid) => je.get(gid) ?? [];
    const partner = (gid, art = null) => von(gid)
        .filter(r => !art || r.art === art)
        .map(r => {
            const ich = r.a === gid;
            return { gid: ich ? r.b : r.a, name: ich ? r.bn : r.an, rolle: ich ? 'a' : 'b', art: r.art, mass: r.mass, guete: r.guete };
        });
    const verbund = (gid, arten = ['anschluss']) => {
        const gewollt = new Set(arten);
        const gesehen = new Set([gid]);
        const offen = [gid];
        while (offen.length) {
            const g = offen.pop();
            for (const r of von(g)) {
                if (!gewollt.has(r.art)) continue;
                const andere = r.a === g ? r.b : r.a;
                if (!gesehen.has(andere)) { gesehen.add(andere); offen.push(andere); }
            }
        }
        gesehen.delete(gid);
        for (const g of [...gesehen]) if (!karte.has(g)) gesehen.delete(g);
        return gesehen;
    };
    return {
        relationen, stand,
        objekt: (gid) => karte.get(gid) ?? null,
        objekte: () => [...karte.values()],
        von, partner, verbund,
        paare: (art) => relationen.filter(r => r.art === art),
    };
}

// ── Für die Oberfläche ──────────────────────────────────────────────────────

const _m = (v) => `${Number(v).toFixed(2).replace('.', ',')} m`;
const _namen = (liste, max = 3) => {
    const n = liste.map(p => p.name || p.gid).filter(Boolean);
    return n.length > max ? `${n.slice(0, max).join(', ')} …` : n.join(', ');
};

/**
 * Die Beziehungen EINES Objekts als Chips — „2 Anschlüsse (S1, S2) ·
 * Überdeckung 1,20 m · in Graben G1 · kreuzt W3 (Δh 0,35 m)".
 *
 * @param {Array} relationen   `index.von(gid)` — oder `el.beziehungen` am Subjekt
 * @param {string} gid
 * @returns {Array<{art:string, text:string, warnung?:boolean}>}
 */
export function fasseZusammen(relationen = [], gid) {
    const chips = [];
    const nimm = (art) => relationen.filter(r => r.art === art).map(r => {
        const ich = r.a === gid;
        return { gid: ich ? r.b : r.a, name: ich ? r.bn : r.an, rolle: ich ? 'a' : 'b', mass: r.mass ?? {} };
    });

    const an = nimm('anschluss');
    if (an.length) chips.push({ art: 'anschluss', text: `${an.length} ${an.length === 1 ? 'Anschluss' : 'Anschlüsse'} (${_namen(an)})` });

    const auf = nimm('auflage').filter(p => p.rolle === 'a');
    for (const p of auf) {
        const u = p.mass.ueberdeckung;
        if (p.mass.lage === 'unter') chips.push({ art: 'auflage', text: `Überdeckung ${_m(u)}` });
        else if (p.mass.lage === 'ueber') chips.push({ art: 'auflage', text: `${_m(-u)} über dem Gelände` });
        else chips.push({ art: 'auflage', text: 'auf dem Gelände' });
    }

    const drin = nimm('enthalten');
    const inWas = drin.filter(p => p.rolle === 'a');
    const enthaelt = drin.filter(p => p.rolle === 'b');
    if (inWas.length) chips.push({ art: 'enthalten', text: `in ${_namen(inWas)}` });
    if (enthaelt.length) chips.push({ art: 'enthalten', text: `enthält ${enthaelt.length} (${_namen(enthaelt)})` });

    const sch = relationen.filter(r => r.art === 'schnitt');
    const sicher = sch.filter(r => r.guete !== 'huelle').map(r => ({ gid: r.a === gid ? r.b : r.a, name: r.a === gid ? r.bn : r.an }));
    const kandidat = sch.filter(r => r.guete === 'huelle').map(r => ({ gid: r.a === gid ? r.b : r.a, name: r.a === gid ? r.bn : r.an }));
    if (sicher.length) chips.push({ art: 'schnitt', warnung: true, text: `schneidet ${_namen(sicher)}` });
    if (kandidat.length) chips.push({ art: 'schnitt', text: `Hülle berührt ${_namen(kandidat)}` });

    for (const p of nimm('kreuzung')) {
        const dh = p.mass.hoehenabstand;
        chips.push({ art: 'kreuzung', text: `kreuzt ${p.name || p.gid}${fin(dh) ? ` (Δh ${_m(Math.abs(dh))})` : ''}` });
    }

    const nahe = nimm('naehe');
    if (nahe.length) {
        const nächster = nahe.reduce((b, p) => (!b || p.mass.abstand < b.mass.abstand ? p : b), null);
        chips.push({ art: 'naehe', text: `${_namen([nächster])} in ${_m(nächster.mass.abstand)}${nahe.length > 1 ? ` (+${nahe.length - 1})` : ''}` });
    }

    const st = nimm('station');
    const anAchse = st.filter(p => p.rolle === 'a');
    const aufMir = st.filter(p => p.rolle === 'b');
    for (const p of anAchse) chips.push({ art: 'station', text: `an ${p.name || p.gid}, St. ${_m(p.mass.station)}` });
    if (aufMir.length) chips.push({ art: 'station', text: `${aufMir.length} an der Achse (${_namen(aufMir)})` });

    const abl = nimm('ableitung');
    const meineQuellen = abl.filter(p => p.rolle === 'a');
    const meineTeile = abl.filter(p => p.rolle === 'b');
    if (meineQuellen.length) chips.push({ art: 'ableitung', text: `aus ${_namen(meineQuellen)}` });
    if (meineTeile.length) chips.push({ art: 'ableitung', text: `${meineTeile.length} ${meineTeile.length === 1 ? 'Ableitung' : 'Ableitungen'}` });

    const gr = nimm('gruppe').filter(p => p.rolle === 'a');
    if (gr.length) chips.push({ art: 'gruppe', text: `Gruppe ${_namen(gr)}` });

    return chips;
}
