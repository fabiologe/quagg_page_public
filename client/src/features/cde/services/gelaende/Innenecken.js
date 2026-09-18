/**
 * DIE INNEREN ECKEN EINES ERDKÖRPERS (Teil XXII, 2026-09-18).
 *
 * Fabio: „das Ziehen von Ecken … dann an ALLEN Ecken eines Körpers." Eine
 * Grube hat zwei Ringe: die gezeichnete Böschungsoberkante (im Journal, mit
 * Höhe je Ecke) und die Sohlkante, die daraus FOLGT — jeder Punkt fällt mit
 * 1:n von der Oberkante, bis er die Sohle erreicht. Eine Schüttung ebenso:
 * der gezeichnete Fuss und die Krone auf der Zielhöhe.
 *
 * Die innere Kante einer Seite A→B ist eine Gerade: der Abstand zur Seite
 * wächst linear mit der Randhöhe, (h(t) − Sohle)·n bei der Grube, (Ziel −
 * h(t))·n bei der Schüttung — genau die Regel von `grube`/`schuettung` in
 * `Operationen.js` (nächster Randpunkt, dessen Höhe, Abstand/n). Die Ecke ist
 * der Schnitt der beiden inneren Kanten, die an ihr zusammenlaufen.
 *
 * Gespeichert wird weiter NUR der äussere Ring. Wer eine innere Ecke zieht,
 * verschiebt die äussere so, dass die innere am Ziel landet — die Neigung
 * bleibt, die Sohle (Krone) auch (`randFuerInnenecke`).
 *
 * Rein, in den Koordinaten der Operation (Welt-x/z, Höhen in m NN).
 */

/** Welche Operationen einen inneren Ring haben, und wie weit er innen liegt. */
function _abstand(op) {
    const p = op?.parameter ?? {};
    const n = Number(p.neigung) > 0 ? Number(p.neigung) : 0;
    if (op?.art === 'grube' && Number.isFinite(Number(p.sohle))) {
        const sohle = Number(p.sohle);
        return { hoehe: sohle, d: (h) => Math.max(0, (h - sohle) * n) };
    }
    if (op?.art === 'schuettung' && (p.ziel ?? 'hoehe') === 'hoehe' && Number.isFinite(Number(p.hoehe))) {
        const ziel = Number(p.hoehe);
        return { hoehe: ziel, d: (h) => Math.max(0, (ziel - h) * n) };
    }
    return null;
}

/** Hat diese Operation einen inneren Ring (Sohle bzw. Krone)? */
export function hatInnenring(op) {
    return !!_abstand(op) && Array.isArray(op?.parameter?.umriss) && op.parameter.umriss.length >= 3;
}

/** Wie der innere Ring heisst — für Griffe und Hinweise. */
export function innenringName(op) {
    return op?.art === 'schuettung' ? 'Krone' : 'Sohle';
}

function _flaeche(ring) {
    let a = 0;
    for (let i = 0; i < ring.length; i++) {
        const p = ring[i], q = ring[(i + 1) % ring.length];
        a += p.x * q.z - q.x * p.z;
    }
    return a / 2;
}

/**
 * Die inneren Ecken — je Ecke des Umrisses eine, in derselben Reihenfolge.
 * `null` an einer Ecke, die nicht entsteht (der Ring kippt, zu tief für den
 * Umriss). Höhe: die Sohle bzw. Krone (m NN).
 * @returns {Array<{x:number, z:number, y:number}|null>|null}
 */
export function innenEcken(op) {
    const a = _abstand(op);
    const ring = (op?.parameter?.umriss ?? []).map(p => ({ x: Number(p.x), z: Number(p.z), y: Number(p.y) }));
    if (!a || ring.length < 3 || !ring.every(p => [p.x, p.z, p.y].every(Number.isFinite))) return null;
    const m = ring.length;
    const vz = _flaeche(ring) >= 0 ? 1 : -1;          // innen links (1) oder rechts (−1) der Laufrichtung
    // Je Seite i→i+1: Punkt P0 und Richtung D der inneren Kante.
    const seiten = ring.map((A, i) => {
        const B = ring[(i + 1) % m];
        const ux = B.x - A.x, uz = B.z - A.z, l = Math.hypot(ux, uz);
        if (l < 1e-9) return null;
        const vx = (-uz / l) * vz, vzz = (ux / l) * vz;       // Normale nach innen
        const dA = a.d(A.y), dB = a.d(B.y);
        return { p0: { x: A.x + dA * vx, z: A.z + dA * vzz },
                 d: { x: ux + (dB - dA) * vx, z: uz + (dB - dA) * vzz }, v: { x: vx, z: vzz }, dA, dB };
    });
    const aus = [];
    for (let i = 0; i < m; i++) {
        const s1 = seiten[(i - 1 + m) % m], s2 = seiten[i];
        if (!s1 || !s2) { aus.push(null); continue; }
        // s1.p0 + s·s1.d = s2.p0 + t·s2.d
        const det = s1.d.x * (-s2.d.z) - s1.d.z * (-s2.d.x);
        let e;
        if (Math.abs(det) < 1e-12) {
            // Gerade durchlaufende Seiten: die Ecke rückt senkrecht ein.
            e = { x: ring[i].x + s2.dA * s2.v.x, z: ring[i].z + s2.dA * s2.v.z };
        } else {
            const rx = s2.p0.x - s1.p0.x, rz = s2.p0.z - s1.p0.z;
            const s = (rx * (-s2.d.z) - rz * (-s2.d.x)) / det;
            e = { x: s1.p0.x + s * s1.d.x, z: s1.p0.z + s * s1.d.z };
        }
        aus.push({ x: e.x, z: e.z, y: a.hoehe });
    }
    // Kippt der Ring (Umlauf dreht sich um, oder er schrumpft auf fast nichts),
    // gibt es keine Innenecken — die Rechnung zeichnet dann eine Spitze, keine Sohle.
    const f0 = _flaeche(ring), f1 = _flaeche(aus);
    if (!(Math.sign(f1) === Math.sign(f0) && Math.abs(f1) > Math.abs(f0) * 0.01 && Math.abs(f1) <= Math.abs(f0) * 1.0001)) {
        return aus.map(() => null);
    }
    return aus;
}

/**
 * Die ÄUSSERE Ecke k so verschieben, dass die innere am Ziel liegt — Neigung,
 * Sohle (Krone) und die Randhöhe der Ecke bleiben. Die Abbildung äussere →
 * innere Ecke ist fast eine Verschiebung; eine Handvoll Schritte trifft auf
 * den Millimeter.
 * @returns {{x:number, z:number}|null}  die neue äussere Ecke, oder null (kein Ring)
 */
export function randFuerInnenecke(op, k, ziel) {
    if (!hatInnenring(op) || !Number.isFinite(ziel?.x) || !Number.isFinite(ziel?.z)) return null;
    const umriss = op.parameter.umriss.map(p => ({ ...p }));
    if (!umriss[k]) return null;
    for (let schritt = 0; schritt < 30; schritt++) {
        const e = innenEcken({ ...op, parameter: { ...op.parameter, umriss } })?.[k];
        if (!e) return null;
        const dx = ziel.x - e.x, dz = ziel.z - e.z;
        if (Math.hypot(dx, dz) < 1e-4) return { x: umriss[k].x, z: umriss[k].z };
        umriss[k] = { ...umriss[k], x: umriss[k].x + dx, z: umriss[k].z + dz };
    }
    const e = innenEcken({ ...op, parameter: { ...op.parameter, umriss } })?.[k];
    return e && Math.hypot(ziel.x - e.x, ziel.z - e.z) < 1e-2 ? { x: umriss[k].x, z: umriss[k].z } : null;
}
