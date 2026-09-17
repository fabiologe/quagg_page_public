/**
 * Der Grabenkörper — das Trapez, nicht die Treppe (Teil XXI, P6).
 *
 * `koerperZwischenRastern` baut den Aushub aus zwei Rastern. Für eine Grube
 * ist das richtig: ihre Form STECKT im Raster. Für einen Kanalgraben ist es
 * falsch, denn seine Form steht in der NORM, nicht im Gelände — eine Sohle
 * von 1,00 m Breite, Wände 1 : n, Stationen entlang der Haltung.
 *
 * Was ein Knotenraster daraus macht, ist am 2026-09-17 gemessen worden:
 *   - Böschung (n > 0): die Masse stimmt (833,89 gegen 834,15 m³, −0,03 %),
 *     die FORM wackelt — an einer Station ist die Sohle 0,5 m breit, an der
 *     nächsten 1,5 m, je nachdem wo die Knoten fallen.
 *   - SENKRECHT (n = 0, `wandform: 'verbau'` — die VORGABE): die Masse ist
 *     unbrauchbar. Ein senkrechter Graben ist im Raster eine Sprungfunktion;
 *     seine gemessene Breite ist rund `Sohlbreite + Zellweite`. Am echten
 *     Rezept: 141,83 m³ statt 102,30 m³ Handrechnung, +38,6 % bei 0,5 m
 *     Zellweite. Die bisherige Gegenprobe sieht das NICHT — sie vergleicht
 *     den Rasterkörper mit der Rastermasse, also zweimal denselben Fehler.
 *
 * Hier entsteht der Körper deshalb aus QUERPROFILEN, wie im Tiefbau gerechnet
 * wird: je Station ein Trapez, dessen Stützpunkte auf den KNICKEN sitzen
 * (Sohlkanten, Böschungsoberkanten) statt auf einem Gitter. Der Deckel ist
 * das Gelände zwischen den beiden Oberkanten.
 *
 * DIESELBE REGEL WIE `gerinne` (Operationen.js), sonst wären Körper und Masse
 * zwei Aussagen:
 *   - innen (quer ≤ b/2): Sohle, stückweise linear zwischen den Stationen
 *   - aussen: Sohle + hypot(Abstand, Überstand)/n — die Hypotenuse rundet die
 *     vier Ecken hinter den Stirnseiten ab; ohne sie fehlen 2,7 %
 *   - hinter den Enden: eine Rampe, die mit 1 : n ansteigt, bis sie das
 *     Gelände erreicht («ausstreichen»)
 *   - NUR SCHNEIDEN: wo das Gelände unter dem Ziel liegt, gibt es keinen
 *     Körper.
 *
 * Gemessen gegen ein 0,0625-m-Raster (eben, längs geneigt, quer geneigt,
 * n = 1,5, Breitenstufen, diagonal, wellig): überall −0,03 % bis −0,01 %.
 * Senkrecht trifft er die Handrechnung auf 0,00 %.
 *
 * Alle Flächen zeigen nach AUSSEN. Die Wicklung ist unten hergeleitet; wer
 * eine ändert, prüft `closed` im Test.
 */
import { meshVolume } from '../../geometry/MeshOps.js';
import { rasterAbtasten } from './Raster.js';

/** Stationsabstand des Körpers (m) — feiner als die Stationen der Haltung. */
export const GRABEN_SCHRITT = 0.5;
/** Abstand der Deckelpunkte quer zur Achse (m). */
export const GRABEN_QUER = 0.5;
/** Wieviele Stützpunkte eine Wand höchstens trägt (gleiche Zahl je Profil). */
export const GRABEN_KETTE_MAX = 12;
/**
 * Mit dieser Resttiefe streicht der Graben hinter seinem Ende aus (m).
 *
 * Nicht kleiner: an der Rampenspitze verteilen sich die Stützpunkte der Wand
 * über `Resttiefe · n`, und wer sie auf fünf Millimeter zusammendrückt, legt
 * zwölf Punkte in weniger als einen Millimeter — die Millimeter-Rasterung von
 * `meshVolume` macht daraus einen Punkt, und der Körper ist nicht mehr
 * mannigfaltig (gemessen 2026-09-17: 56 bzw. 72 Kanten bei Quergefälle und
 * welligem Gelände). Die fehlende Masse der letzten fünf Zentimeter liegt
 * unter 0,01 m³.
 */
export const GRABEN_KEIL = 0.05;
/** Ab hier gilt ein Profil als vorhanden — dieselbe Schwelle wie `DUENN`. */
export const GRABEN_DUENN = 0.005;
/**
 * Näher als das dürfen zwei Profile nicht stehen (m).
 *
 * `meshVolume` fasst Punkte auf den Millimeter zusammen. Zwei Profile, die
 * numerisch aufeinanderfallen — eine Station bei 2,0000000000000004 m neben
 * dem Schritt bei 2,0 m —, geben dann einen Streifen aus Nullflächen, und die
 * Kante dazwischen zählt viermal: „nicht mannigfaltig", Volumen unbrauchbar.
 * Gemessen am geneigten Gelände: 312 solche Kanten, 3 % Massenfehler.
 */
export const GRABEN_MIN_ABSTAND = 0.01;

const EPS = 1e-9;

/** Einheitsrichtung im Grundriss — oder null bei Länge 0. */
function _einheit(dx, dz) {
    const l = Math.hypot(dx, dz);
    return l > EPS ? { x: dx / l, z: dz / l } : null;
}

/**
 * Die Stationen prüfen und ihre Weglängen aufsummieren.
 * @returns {{st: Array, kum: number[], laenge: number}|null}
 */
function _bahn(stationen) {
    if (!Array.isArray(stationen) || stationen.length < 2) return null;
    const st = [];
    for (const s of stationen) {
        const x = Number(s?.x), y = Number(s?.y), z = Number(s?.z);
        const b = Number(s?.sohlbreite);
        if (![x, y, z].every(Number.isFinite)) return null;
        st.push({ x, y, z, sohlbreite: Number.isFinite(b) && b >= 0 ? b : 0 });
    }
    const kum = [0];
    for (let i = 0; i + 1 < st.length; i++) {
        const l = Math.hypot(st[i + 1].x - st[i].x, st[i + 1].z - st[i].z);
        if (!(l > EPS)) return null;                    // zwei Stationen am selben Ort
        kum.push(kum[i] + l);
    }
    return { st, kum, laenge: kum[kum.length - 1] };
}

/**
 * Ein Ort auf der Bahn bei Weglänge `d` — auch VOR dem Anfang und HINTER dem
 * Ende (dann steigt die Sohle mit 1 : n, wie `gerinne` es tut).
 */
function _ortBei(bahn, d) {
    const { st, kum, laenge } = bahn;
    if (d < 0) {
        const u = _einheit(st[1].x - st[0].x, st[1].z - st[0].z);
        const e = -d;
        return { x: st[0].x - u.x * e, z: st[0].z - u.z * e, u,
                 sohleRoh: st[0].y, e, b2: st[0].sohlbreite / 2 };
    }
    if (d > laenge) {
        const m = st.length - 1;
        const u = _einheit(st[m].x - st[m - 1].x, st[m].z - st[m - 1].z);
        const e = d - laenge;
        return { x: st[m].x + u.x * e, z: st[m].z + u.z * e, u,
                 sohleRoh: st[m].y, e, b2: st[m - 1].sohlbreite / 2 };
    }
    let i = 0;
    while (i + 2 < kum.length && kum[i + 1] < d) i++;
    const t = (d - kum[i]) / (kum[i + 1] - kum[i]);
    const u = _einheit(st[i + 1].x - st[i].x, st[i + 1].z - st[i].z);
    return {
        x: st[i].x + (st[i + 1].x - st[i].x) * t,
        z: st[i].z + (st[i + 1].z - st[i].z) * t,
        u, e: 0,
        sohleRoh: st[i].y + (st[i + 1].y - st[i].y) * t,
        // Die Breite gehört der Teilstrecke, die dort BEGINNT — Stufenfunktion
        // (DIN EN 1610 Tab. 2), genau wie im Raster-Zweig.
        b2: st[i].sohlbreite / 2,
    };
}

/**
 * Die Sollhöhe eines Profils in Abhängigkeit vom seitlichen Abstand `a` zum
 * Sohlstreifen — WÖRTLICH die Formel aus `gerinne`:
 *
 *     ziel = sohle + hypot(a, ueberstand) / n
 *
 * Die Hypotenuse ist kein Schmuck: sie rundet die vier Ecken hinter den
 * Stirnseiten ab und macht den Aushub dort TIEFER als die Summe der beiden
 * Wege. Wer sie weglässt, baut einen Körper, der 2,7 % kleiner ist als die
 * Masse, die daneben steht (gemessen 2026-09-17: 386,5 statt 397,3 m³).
 * Senkrecht (n = 0) schneidet `gerinne` ausserhalb des Sohlstreifens gar
 * nicht — das Profil endet dort an der Sohlkante.
 */
function _zielFn(p, n) {
    if (n > 0) return (a) => p.sohleRoh + Math.hypot(Math.max(0, a), p.e) / n;
    return (a) => (a > EPS || p.e > EPS ? Infinity : p.sohleRoh);
}

/**
 * Wo die Wand das Gelände trifft: vom Sohlstreifen nach aussen marschieren,
 * bis `ziel(a)` das Gelände einholt. Der erste Schnitt gilt — eine Mulde
 * weiter draussen gehört nicht mehr zum Graben.
 *
 * @returns {number|null}  Abstand zur Sohlkante; null = Gelände nicht ablesbar
 */
function _wandOben({ hoehe, p, qx, qz, seite, ziel, n, schritt, grenze }) {
    const punkt = (a) => hoehe(p.x + qx * seite * (p.b2 + a), p.z + qz * seite * (p.b2 + a));
    const h0 = punkt(0);
    if (!Number.isFinite(h0)) return null;
    if (!(n > 0)) return 0;                                    // senkrecht: die Wand steht an der Sohlkante
    let aVor = 0, fVor = ziel(0) - h0;                         // f = Ziel − Gelände
    if (fVor >= 0) return 0;
    for (let a = schritt; ; a += schritt) {
        const aa = Math.min(a, grenze);
        const h = punkt(aa);
        const f = ziel(aa) - (Number.isFinite(h) ? h : -Infinity);
        if (f >= 0) return f - fVor > EPS ? aVor + (aa - aVor) * (-fVor) / (f - fVor) : aa;
        if (aa >= grenze) return grenze;
        aVor = aa; fVor = f;
    }
}

/**
 * Wie weit die Endrampe reicht: hinter dem Ende steigt die Sohle mit 1 : n, bis
 * sie das Gelände erreicht. Gesucht ist die Stelle, an der nur noch `DUENN`
 * Tiefe übrig ist — dort endet der Körper mit einem Fünf-Millimeter-Keil,
 * genau wie `koerperZwischenRastern` es am Rand tut.
 */
function _rampenEnde({ hoehe, x, z, ux, uz, sohle, n, schritt, grenze }) {
    if (!(n > 0)) return 0;
    let eVor = 0, dVor = (hoehe(x, z) || 0) - sohle;
    if (!(dVor > GRABEN_KEIL)) return 0;
    for (let e = schritt; ; e += schritt) {
        const ee = Math.min(e, grenze);
        const h = hoehe(x + ux * ee, z + uz * ee);
        const d = (Number.isFinite(h) ? h : -Infinity) - (sohle + ee / n);
        if (d <= GRABEN_KEIL) {
            return dVor - d > EPS ? eVor + (ee - eVor) * (dVor - GRABEN_KEIL) / (dVor - d) : eVor;
        }
        if (ee >= grenze) return grenze;
        eVor = ee; dVor = d;
    }
}

/** Weglängen zusammenlegen, die dichter als `GRABEN_MIN_ABSTAND` liegen. */
function _wegeSieben(roh) {
    const aus = [];
    for (const w of [...roh].sort((a, b) => a.d - b.d)) {
        const l = aus[aus.length - 1];
        if (l && w.d - l.d < GRABEN_MIN_ABSTAND) {
            if (w.fest && !l.fest) aus[aus.length - 1] = w;   // die Station gewinnt: sie trägt die Breitenstufe
            continue;
        }
        aus.push(w);
    }
    return aus.map(w => w.d);
}

/**
 * Der Grabenkörper aus Stationsprofilen.
 *
 * @param {{raster: raster}} eingaben          Gelände VOR dem Graben (der Deckel)
 * @param {object} parameter
 * @param {Array<{x,y,z,sohlbreite}>} parameter.stationen  Sohlpunkte in Welt
 * @param {number} [parameter.boeschung]       Wandneigung 1 : n (0 = senkrecht)
 * @param {number} [parameter.schritt]         Profilabstand längs (m)
 * @param {number} [parameter.quer]            Punktabstand des Deckels (m)
 * @returns {{ergebnis: koerper|null, warnungen: string[]}}
 */
export function grabenkoerper({ raster } = {}, { stationen, boeschung = 1.5, schritt = GRABEN_SCHRITT, quer = GRABEN_QUER } = {}) {
    if (!raster?.heights) throw new Error('grabenkoerper: `raster` ist Pflicht');
    const warnungen = [];
    const bahn = _bahn(stationen);
    if (!bahn) return { ergebnis: null, warnungen: ['grabenkoerper_ohne_stationen'] };
    const n = Math.max(0, Number(boeschung) || 0);
    const dl = Math.max(0.05, Number(schritt) || GRABEN_SCHRITT);
    const dq = Math.max(0.05, Number(quer) || GRABEN_QUER);
    const hoehe = (x, z) => rasterAbtasten(raster, x, z);

    // ── Die Weglängen: jede Station, dazwischen alle `dl` — und die Rampen an
    //    beiden Enden, so weit sie reichen können. ──────────────────────────
    let tiefeMax = 0;
    for (const s of bahn.st) {
        const h = hoehe(s.x, s.z);
        if (Number.isFinite(h)) tiefeMax = Math.max(tiefeMax, h - s.y);
    }
    if (!(tiefeMax > GRABEN_DUENN)) return { ergebnis: null, warnungen: ['grabenkoerper_ohne_tiefe: Sohle liegt über dem Gelände'] };
    const grenze = n > 0 ? tiefeMax * n + 2 * dq : 0;    // so weit greift eine Böschung höchstens

    // Die Rampen: ihre Länge steht im GELÄNDE, nicht in der Schrittweite. Wer
    // sie auf das Schrittraster legt, lässt den Graben mit einer halben Stufe
    // enden (gemessen: 239,75 statt 265,05 m³ bei Schritt 5 m).
    const m = bahn.st.length - 1;
    const uA = _einheit(bahn.st[0].x - bahn.st[1].x, bahn.st[0].z - bahn.st[1].z);
    const uB = _einheit(bahn.st[m].x - bahn.st[m - 1].x, bahn.st[m].z - bahn.st[m - 1].z);
    const eA = _rampenEnde({ hoehe, x: bahn.st[0].x, z: bahn.st[0].z, ux: uA.x, uz: uA.z, sohle: bahn.st[0].y, n, schritt: Math.min(dl, dq), grenze });
    const eB = _rampenEnde({ hoehe, x: bahn.st[m].x, z: bahn.st[m].z, ux: uB.x, uz: uB.z, sohle: bahn.st[m].y, n, schritt: Math.min(dl, dq), grenze });

    const kandidaten = [{ d: 0, fest: true }, { d: bahn.laenge, fest: true }];
    for (const k of bahn.kum) kandidaten.push({ d: k, fest: true });
    for (let d = dl; d < bahn.laenge; d += dl) kandidaten.push({ d, fest: false });
    for (let e = dl; e < eA; e += dl) kandidaten.push({ d: -e, fest: false });
    for (let e = dl; e < eB; e += dl) kandidaten.push({ d: bahn.laenge + e, fest: false });
    if (eA > 0) kandidaten.push({ d: -eA, fest: true });
    if (eB > 0) kandidaten.push({ d: bahn.laenge + eB, fest: true });
    const sortiert = _wegeSieben(kandidaten);

    // ── Erster Durchgang: je Weglänge ein Profil mit seinen beiden
    //    Böschungsoberkanten. Profile ohne Tiefe fallen weg. ────────────────
    const roh = [];
    for (const d of sortiert) {
        const o = _ortBei(bahn, d);
        if (!o?.u) continue;
        const q = { x: o.u.z, z: -o.u.x };                // ŷ × u — „rechts" der Fahrtrichtung
        const ziel = _zielFn(o, n);
        const sohle = ziel(0);
        const hAchse = hoehe(o.x, o.z);
        // Kein Profil OHNE Tiefe. Die Schwelle ist die Null, nicht `DUENN`:
        // die Spitze der Endrampe trägt genau `DUENN` und gehört dazu — sie
        // ist der Keil, mit dem der Körper ausstreicht.
        if (!Number.isFinite(hAchse) || !Number.isFinite(sohle) || hAchse - sohle <= 0) { roh.push(null); continue; }
        const rechts = _wandOben({ hoehe, p: o, qx: q.x, qz: q.z, seite: 1, ziel, n, schritt: dq, grenze });
        const links = _wandOben({ hoehe, p: o, qx: q.x, qz: q.z, seite: -1, ziel, n, schritt: dq, grenze });
        if (rechts == null || links == null) { roh.push(null); continue; }
        roh.push({ ...o, q, ziel, sohle, aR: rechts, aL: links });
    }
    // Die Profile müssen EINEN Strang bilden: ein Loch in der Mitte hiesse zwei
    // Körper, und zwei Körper sind keine Menge mehr. Dann lieber ehrlich nichts.
    const erste = roh.findIndex(p => p);
    const letzte = roh.length - 1 - [...roh].reverse().findIndex(p => p);
    if (erste < 0) return { ergebnis: null, warnungen: ['grabenkoerper_leer: kein Profil mit Tiefe'] };
    const profile = roh.slice(erste, letzte + 1);
    if (profile.some(p => !p)) return { ergebnis: null, warnungen: ['grabenkoerper_unterbrochen: das Gelände steigt zwischendurch unter die Sohle'] };
    if (profile.length < 2) return { ergebnis: null, warnungen: ['grabenkoerper_zu_kurz'] };

    // ── Zweiter Durchgang: die Ringe. GLEICH VIELE Punkte je Profil — nur so
    //    passen sie zu einem Streifen zusammen.
    //
    //    Die Querlage `o` wird NICHT gleichmässig abgetastet, sondern an den
    //    KNICKEN aufgehängt: Sohlkante links, Sohlstreifen, Sohlkante rechts,
    //    dann die Wände bis zur Böschungsoberkante. Innerhalb des Grabens ist
    //    die Wand in `o` linear — die Stützpunkte liegen also EXAKT darauf,
    //    und genau das ist der Gewinn gegenüber dem Raster. ─────────────────
    const K = n > 0 ? Math.max(1, Math.min(GRABEN_KETTE_MAX, Math.ceil(Math.max(...profile.map(p => Math.max(p.aR, p.aL))) / dq))) : 0;
    const J = Math.max(0, Math.ceil(Math.max(...profile.map(p => 2 * p.b2)) / dq) - 1);
    const P = 2 * K + J + 2;
    const ringe = profile.map(p => {
        const pkt = (o, y) => ({ x: p.x + p.q.x * o, y, z: p.z + p.q.z * o });
        const os = [];
        for (let k = 0; k <= K; k++) os.push(-(p.b2 + (K ? p.aL * (K - k) / K : 0)));
        for (let j = 1; j <= J; j++) os.push(-p.b2 + 2 * p.b2 * j / (J + 1));
        for (let k = 0; k <= K; k++) os.push(p.b2 + (K ? p.aR * k / K : 0));
        const unten = os.map(o => p.ziel(Math.abs(o) - p.b2));
        const ring = os.map((o, i) => pkt(o, unten[i]));
        // NUR SCHNEIDEN: der Deckel liegt nie unter der Sollfläche — und nie
        // weniger als DUENN darüber, sonst fiele die Kante zusammen und
        // `meshVolume` fände sie viermal („nicht mannigfaltig").
        for (let i = os.length - 1; i >= 0; i--) {
            const h = hoehe(p.x + p.q.x * os[i], p.z + p.q.z * os[i]);
            ring.push(pkt(os[i], Math.max(Number.isFinite(h) ? h : unten[i], unten[i] + GRABEN_DUENN)));
        }
        return ring;
    });

    // ── Der Körper: Streifen zwischen den Profilen, Stirnseiten an den Enden. ──
    const M = 2 * P;
    const tris = [];
    const schiebe = (a, b, c) => tris.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    for (let i = 0; i + 1 < ringe.length; i++) {
        const A = ringe[i], B = ringe[i + 1];
        for (let k = 0; k < M; k++) {
            const k2 = (k + 1) % M;
            // (A[k], A[k+1], B[k+1]) + (A[k], B[k+1], B[k]): die Normale ist
            // Ringrichtung × Fahrtrichtung — unten −y, oben +y, an den Wänden
            // nach aussen. Hergeleitet aus q × ŷ = u.
            schiebe(A[k], A[k2], B[k2]);
            schiebe(A[k], B[k2], B[k]);
        }
    }
    // Die Stirnseite als Fächer AUS DER SOHLECKE, nicht aus dem Schwerpunkt:
    // an der Rampenspitze ist das Profil nur noch `DUENN` hoch, und dort fällt
    // der Schwerpunkt rechnerisch GENAU auf die Deckellinie — zwölf Dreiecke
    // je Kappe mit Fläche null, und der Körper schliesst nicht mehr (gemessen
    // 2026-09-17: 24 entartete Dreiecke, 4 Kanten „nicht mannigfaltig").
    // Die Sohlecke liegt immer unter dem Deckel, und die beiden Kanten an ihr
    // sind der Rand des Fächers, nicht sein Inhalt.
    const kappe = (ring, vorwaerts) => {
        const s = K;                                   // die linke Sohlkante
        for (let k = 1; k + 1 < M; k++) {
            const a = ring[(s + k) % M], b = ring[(s + k + 1) % M];
            if (vorwaerts) schiebe(ring[s], a, b); else schiebe(ring[s], b, a);
        }
    };
    kappe(ringe[0], false);                       // Stirnseite am Anfang: Normale nach hinten
    kappe(ringe[ringe.length - 1], true);

    const triCount = tris.length / 9;
    const positions = new Float64Array(tris);
    const attest = meshVolume(positions, triCount);
    if (!attest.closed) warnungen.push(...attest.warnings);
    return {
        ergebnis: {
            positions, triCount,
            closed: attest.closed,
            volumen: attest.volume,
            profile: ringe.length,
            warnungen: attest.warnings,
        },
        warnungen,
    };
}
