/**
 * Sweep und Extrusion (Teil XIV, G6) — die beiden Wege zu einem KÖRPER aus
 * einer Linie oder einem Umriss.
 *
 * `sweep` zieht ein Querschnittsprofil (u quer, v hoch — im Achsrahmen)
 * entlang einer Polylinie: der Rahmen wird PARALLEL TRANSPORTIERT
 * (rotationsminimierend), damit das Profil an einem Knick nicht um die Achse
 * kippt; am Knick liegt der Ring in der Winkelhalbierenden (Gehrung). Beide
 * Enden bekommen KAPPEN — erst damit ist es ein Körper, an dem `meshVolume`
 * ein Attest ausstellt (Rohr, Schacht: Güte `gemessen` am eigenen Bauteil).
 *
 * `extrudiere` hebt einen Grundriss-Ring (mit Löchern) senkrecht von `von`
 * nach `bis`. Die Deckel trianguliert earcut (npm, kein three).
 *
 * `platte` gibt einem Umriss MIT Punkthöhen eine Dicke — senkrecht, je Punkt
 * (Teil XXIII, A4). Anders als `extrudiere` bleibt eine geneigte Fläche
 * geneigt: dieselbe Regel wie die Fläche der CDE, „jeder Punkt behält seine
 * Höhe".
 *
 * WICKLUNG: alle Flächen zeigen nach aussen. Die Kappen werden je Dreieck
 * gegen die geforderte Richtung geprüft und gedreht — earcut legt seine
 * Orientierung selbst fest. Die Seiten folgen der Profil-/Ringordnung, die
 * hier VORHER normiert wird. Zum Schluss stellt `meshVolume` das Attest aus;
 * ein negatives Volumen (falsch herum) wird gedreht und gemeldet, nie still
 * zurückgegeben.
 *
 * Rein: importiert nur MeshOps (Attest) und earcut.
 */
import earcut from 'earcut';
import { meshVolume } from '../MeshOps.js';

/** Ab diesem Knickwinkel (Grad) überschneiden sich die Ringe eines Sweeps wahrscheinlich. */
export const KNICK_WARNUNG_GRAD = 60;

// ── Vektoren (kein three im Kernel) ────────────────────────────────────────
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const mul = (a, s) => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const len = (a) => Math.hypot(a.x, a.y, a.z);
function norm(a) { const l = len(a); return l > 1e-12 ? mul(a, 1 / l) : { x: 0, y: 0, z: 0 }; }
/** Rodrigues: `v` um die Einheitsachse `k` um `w` drehen. */
function drehe(v, k, w) {
    const c = Math.cos(w), s = Math.sin(w);
    return add(add(mul(v, c), mul(cross(k, v), s)), mul(k, dot(k, v) * (1 - c)));
}

// ── Profile ────────────────────────────────────────────────────────────────

/** Kreisprofil mit Radius r (m), gegen den Uhrzeigersinn in (u, v). */
export function kreisProfil(r, seiten = 12) {
    const punkte = [];
    for (let k = 0; k < seiten; k++) {
        const w = (k / seiten) * Math.PI * 2;
        punkte.push({ u: Math.cos(w) * r, v: Math.sin(w) * r });
    }
    // Was die Zahlen bedeuten (A9): ein Kreis mit diesem Nennmass (mm).
    return { punkte, art: 'kreis', nennmass: Math.round(r * 2000) };
}

/**
 * Rechteckprofil, mittig um die Achse, gegen den Uhrzeigersinn in (u, v) —
 * für Stäbe (Pfosten, Schild) und Rechteckkanäle (Teil XXIII, A4).
 */
export function rechteckProfil(breite, hoehe) {
    const b2 = breite / 2, h2 = hoehe / 2;
    return { punkte: [{ u: -b2, v: -h2 }, { u: b2, v: -h2 }, { u: b2, v: h2 }, { u: -b2, v: h2 }], art: 'rechteck' };
}

/** Trapezprofil: Sohle unten (v = 0), Böschung 1:n nach oben; gegen den Uhrzeigersinn. */
export function trapezProfil({ sohlbreite = 1, hoehe = 1, boeschung = 1 } = {}) {
    const b2 = sohlbreite / 2;
    const o2 = b2 + hoehe * Math.max(0, boeschung);
    return { punkte: [{ u: -b2, v: 0 }, { u: b2, v: 0 }, { u: o2, v: hoehe }, { u: -o2, v: hoehe }], art: 'trapez' };
}

/** Signierte Fläche eines 2D-Rings ([{a, b}] mit Schlüsselnamen ka/kb). */
function _flaeche2d(ring, ka, kb) {
    let s = 0;
    for (let i = 0; i < ring.length; i++) {
        const p = ring[i], q = ring[(i + 1) % ring.length];
        s += p[ka] * q[kb] - q[ka] * p[kb];
    }
    return s / 2;
}

/** Dreiecke eines 2D-Rings (mit Löchern) über earcut → Indexliste in die verkettete Punktliste. */
function _deckelIndizes(ringe, ka, kb) {
    const flach = [];
    const loecher = [];
    for (let r = 0; r < ringe.length; r++) {
        if (r > 0) loecher.push(flach.length / 2);
        for (const p of ringe[r]) flach.push(p[ka], p[kb]);
    }
    return earcut(flach, loecher.length ? loecher : undefined, 2);
}

/**
 * Dreieck so drehen, dass seine Normale in Richtung `soll` zeigt.
 * @returns {[p, p, p]}
 */
function _gerichtet(a, b, c, soll) {
    const n = cross(sub(b, a), sub(c, a));
    return dot(n, soll) >= 0 ? [a, b, c] : [a, c, b];
}

function _koerperAus(dreiecke, warnungen) {
    let positions = new Float64Array(dreiecke.length * 9);
    let o = 0;
    for (const [a, b, c] of dreiecke) {
        positions[o++] = a.x; positions[o++] = a.y; positions[o++] = a.z;
        positions[o++] = b.x; positions[o++] = b.y; positions[o++] = b.z;
        positions[o++] = c.x; positions[o++] = c.y; positions[o++] = c.z;
    }
    let attest = meshVolume(positions, dreiecke.length);
    if (attest.volume < 0) {
        // Falsch herum gewickelt — drehen und SAGEN. Ein negatives Volumen
        // als Betrag zurückzugeben hiesse, den Fehler zu verstecken.
        warnungen.push('wicklung_gedreht: der Körper zeigte nach innen');
        const gedreht = new Float64Array(positions.length);
        for (let i = 0; i < positions.length; i += 9) {
            gedreht.set(positions.subarray(i, i + 3), i);
            gedreht.set(positions.subarray(i + 6, i + 9), i + 3);
            gedreht.set(positions.subarray(i + 3, i + 6), i + 6);
        }
        positions = gedreht;
        attest = meshVolume(positions, dreiecke.length);
    }
    if (!attest.closed) warnungen.push(`nicht_geschlossen: ${attest.boundaryEdgeCount} offene Kanten`);
    return {
        positions, triCount: dreiecke.length,
        closed: !!attest.closed, volumen: Math.max(0, attest.volume),
        warnungen: [...warnungen],
    };
}

// ── Sweep ──────────────────────────────────────────────────────────────────

/**
 * @param {{profil: {punkte: [{u, v}]}, achse: {punkte: [{x, y, z}]}}} eingaben
 * @param {{kappen?: boolean}} parameter
 * @returns {{ergebnis: koerper|null, warnungen: string[]}}
 */
export function sweep({ profil, achse } = {}, { kappen = true } = {}) {
    const warnungen = [];
    const roh = (achse?.punkte ?? []).map(p => ({ x: Number(p?.x), y: Number(p?.y), z: Number(p?.z) }));
    if (roh.some(p => !Number.isFinite(p.y))) {
        return { ergebnis: null, warnungen: ['sweep_achse_ohne_hoehe: ein Achspunkt hat kein y — erst drapen'] };
    }
    // Doppelte Punkte fallen; sie ergäben Nullsegmente ohne Richtung.
    const punkte = [];
    for (const p of roh) {
        const l = punkte[punkte.length - 1];
        if (!l || len(sub(p, l)) > 1e-9) punkte.push(p);
    }
    if (punkte.length < 2) return { ergebnis: null, warnungen: ['sweep_achse_zu_kurz'] };

    // Das Profil gegen den Uhrzeigersinn — davon hängt die Wicklung der Seiten ab.
    let prof = (profil?.punkte ?? []).map(q => ({ u: Number(q.u), v: Number(q.v) }));
    if (prof.length < 3) return { ergebnis: null, warnungen: ['sweep_profil_zu_klein'] };
    if (_flaeche2d(prof, 'u', 'v') < 0) prof = prof.slice().reverse();

    // Tangenten je Segment, Rahmen je Stützpunkt.
    const n = punkte.length;
    const t = [];
    for (let i = 0; i + 1 < n; i++) t.push(norm(sub(punkte[i + 1], punkte[i])));
    const OBEN = { x: 0, y: 1, z: 0 };
    const bezug = Math.abs(dot(t[0], OBEN)) > 0.99 ? { x: 1, y: 0, z: 0 } : OBEN;
    let u = norm(cross(bezug, t[0]));
    let knickMax = 0;
    const ringe = [];
    for (let k = 0; k < n; k++) {
        if (k > 0 && k < n - 1) {
            // Parallel-Transport: u dreht mit der Tangente, nie um sie.
            const achseR = cross(t[k - 1], t[k]);
            const s = len(achseR);
            const c = Math.max(-1, Math.min(1, dot(t[k - 1], t[k])));
            const w = Math.atan2(s, c);
            knickMax = Math.max(knickMax, w);
            if (s > 1e-9) u = drehe(u, mul(achseR, 1 / s), w);
        }
        const dir = k === 0 ? t[0] : k === n - 1 ? t[n - 2] : (len(add(t[k - 1], t[k])) > 1e-9 ? norm(add(t[k - 1], t[k])) : t[k]);
        const uk = norm(sub(u, mul(dir, dot(u, dir))));
        const vk = cross(dir, uk);
        ringe.push({ dir, punkte: prof.map(q => add(add(punkte[k], mul(uk, q.u)), mul(vk, q.v))) });
    }
    if (knickMax * 180 / Math.PI > KNICK_WARNUNG_GRAD) {
        warnungen.push(`sweep_knick: ${(knickMax * 180 / Math.PI).toFixed(0)}° — Ringe überschneiden sich womöglich`);
    }

    // Seiten: bei CCW-Profil und (u, v, dir) rechtshändig zeigt (a, b, c) nach aussen.
    const dreiecke = [];
    const m = prof.length;
    for (let k = 0; k + 1 < n; k++) {
        const r0 = ringe[k].punkte, r1 = ringe[k + 1].punkte;
        for (let j = 0; j < m; j++) {
            const a = r0[j], b = r0[(j + 1) % m], c = r1[j], d = r1[(j + 1) % m];
            dreiecke.push([a, b, c], [b, d, c]);
        }
    }
    if (kappen) {
        const idx = _deckelIndizes([prof], 'u', 'v');
        const anfang = ringe[0], ende = ringe[n - 1];
        for (let i = 0; i < idx.length; i += 3) {
            const [ia, ib, ic] = [idx[i], idx[i + 1], idx[i + 2]];
            dreiecke.push(_gerichtet(anfang.punkte[ia], anfang.punkte[ib], anfang.punkte[ic], mul(anfang.dir, -1)));
            dreiecke.push(_gerichtet(ende.punkte[ia], ende.punkte[ib], ende.punkte[ic], ende.dir));
        }
    }
    const k = _koerperAus(dreiecke, warnungen);
    if (!kappen) k.closed = false;
    return { ergebnis: k, warnungen };
}

// ── Extrusion ──────────────────────────────────────────────────────────────

/**
 * @param {{umriss: {ring: [{x, z}], loecher?: [[{x, z}]]}}} eingaben
 * @param {{von: number, bis: number}} parameter  Welt-Y unten und oben
 * @returns {{ergebnis: koerper|null, warnungen: string[]}}
 */
export function extrudiere({ umriss } = {}, { von, bis } = {}) {
    const warnungen = [];
    if (!Number.isFinite(von) || !Number.isFinite(bis)) return { ergebnis: null, warnungen: ['extrudiere_ohne_hoehe'] };
    if (Math.abs(bis - von) < 1e-9) return { ergebnis: null, warnungen: ['extrudiere_hoehe_null'] };
    const unten = Math.min(von, bis), oben = Math.max(von, bis);

    const normiere = (r, sollPositiv) => {
        const p = (r ?? []).map(q => ({ x: Number(q.x), z: Number(q.z) })).filter(q => Number.isFinite(q.x) && Number.isFinite(q.z));
        // Doppelter Schlusspunkt fällt.
        if (p.length > 1 && Math.hypot(p[0].x - p[p.length - 1].x, p[0].z - p[p.length - 1].z) < 1e-9) p.pop();
        if (p.length < 3) return null;
        const f = _flaeche2d(p, 'x', 'z');
        if (Math.abs(f) < 1e-12) return null;
        return (f > 0) === sollPositiv ? p : p.slice().reverse();
    };
    // Aussenring mit positiver Fläche, Löcher negativ — dann gilt EINE Seitenformel.
    const ring = normiere(umriss?.ring, true);
    if (!ring) return { ergebnis: null, warnungen: ['extrudiere_umriss_entartet'] };
    const loecher = (umriss?.loecher ?? []).map(l => normiere(l, false)).filter(Boolean);

    const dreiecke = [];
    const P = (q, y) => ({ x: q.x, y, z: q.z });
    for (const r of [ring, ...loecher]) {
        for (let j = 0; j < r.length; j++) {
            const a = P(r[j], unten), b = P(r[(j + 1) % r.length], unten);
            const c = P(r[j], oben), d = P(r[(j + 1) % r.length], oben);
            dreiecke.push([a, c, b], [b, c, d]);
        }
    }
    const alle = [ring, ...loecher];
    const flach = alle.flat();
    const idx = _deckelIndizes(alle, 'x', 'z');
    for (let i = 0; i < idx.length; i += 3) {
        const [a, b, c] = [flach[idx[i]], flach[idx[i + 1]], flach[idx[i + 2]]];
        dreiecke.push(_gerichtet(P(a, oben), P(b, oben), P(c, oben), { x: 0, y: 1, z: 0 }));
        dreiecke.push(_gerichtet(P(a, unten), P(b, unten), P(c, unten), { x: 0, y: -1, z: 0 }));
    }
    return { ergebnis: _koerperAus(dreiecke, warnungen), warnungen };
}

// ── Platte ─────────────────────────────────────────────────────────────────

/**
 * Eine Platte: der Umriss mit seinen Höhen ist eine Seite, die Dicke geht
 * senkrecht von ihr weg — `richtung: 'unten'` (Vorgabe) heisst, der Umriss
 * ist die OBERKANTE (Belag, Decke, Fundament von oben gezeichnet).
 *
 * @param {{umriss: {ring: [{x, y, z}]}}} eingaben
 * @param {{dicke: number, richtung?: 'unten'|'oben'}} parameter
 * @returns {{ergebnis: koerper|null, warnungen: string[]}}
 */
export function platte({ umriss } = {}, { dicke, richtung = 'unten' } = {}) {
    const warnungen = [];
    const d = Number(dicke);
    if (!(d > 0)) return { ergebnis: null, warnungen: ['platte_ohne_dicke'] };
    let ring = (umriss?.ring ?? []).map(q => ({ x: Number(q.x), y: Number(q.y), z: Number(q.z) }))
        .filter(q => Number.isFinite(q.x) && Number.isFinite(q.y) && Number.isFinite(q.z));
    if (ring.length > 1 && Math.hypot(ring[0].x - ring[ring.length - 1].x, ring[0].z - ring[ring.length - 1].z) < 1e-9) ring.pop();
    if (ring.length < 3) return { ergebnis: null, warnungen: ['platte_umriss_entartet'] };
    const f = _flaeche2d(ring, 'x', 'z');
    if (Math.abs(f) < 1e-12) return { ergebnis: null, warnungen: ['platte_umriss_entartet'] };
    if (f < 0) ring = ring.slice().reverse();                 // dieselbe Ordnung wie in `extrudiere`

    const versatz = richtung === 'oben' ? d : -d;
    const oben = ring.map(q => (versatz > 0 ? { x: q.x, y: q.y + versatz, z: q.z } : q));
    const unten = ring.map(q => (versatz > 0 ? q : { x: q.x, y: q.y + versatz, z: q.z }));

    const dreiecke = [];
    for (let j = 0; j < ring.length; j++) {
        const k = (j + 1) % ring.length;
        const a = unten[j], b = unten[k], c = oben[j], e = oben[k];
        dreiecke.push([a, c, b], [b, c, e]);
    }
    const idx = _deckelIndizes([ring], 'x', 'z');
    for (let i = 0; i < idx.length; i += 3) {
        const [ia, ib, ic] = [idx[i], idx[i + 1], idx[i + 2]];
        dreiecke.push(_gerichtet(oben[ia], oben[ib], oben[ic], { x: 0, y: 1, z: 0 }));
        dreiecke.push(_gerichtet(unten[ia], unten[ib], unten[ic], { x: 0, y: -1, z: 0 }));
    }
    return { ergebnis: _koerperAus(dreiecke, warnungen), warnungen };
}
