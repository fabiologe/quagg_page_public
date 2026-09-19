/**
 * ECKEN, DIE EIN MASS SIND (Teil XXII, Rest — 2026-09-19).
 *
 * Fabio (2026-09-18): „das Ziehen von Ecken … dann an ALLEN Ecken eines
 * Körpers." Gebaut waren Umriss und Linie (im Journal) und die Sohl- bzw.
 * Kronenecken von Grube und Schüttung (aus Umriss, Neigung und Sohle). Es
 * fehlten die Körper, deren Ecken NICHT als Punkte im Journal stehen:
 *
 *   Gerinne             Achse (Punkte), Sohlkanten, Böschungsoberkanten
 *   Böschung an Kante   der Böschungsfuss
 *   Kanalgraben         Sohlkanten, Böschungsoberkanten (folgt der Haltung)
 *   Baugrube ums Bauwerk Sohlecken, Böschungsoberkanten (folgt dem Bauwerk)
 *
 * Bei ihnen ist eine Ecke kein Punkt, sondern die Folge EINES Masses: die
 * Sohlkante liegt eine halbe Sohlbreite neben der Achse, die Oberkante dort,
 * wo die Böschung 1 : n das Gelände trifft, die Sohlecke der Baugrube einen
 * Arbeitsraum neben dem Bauwerk. Wer so eine Ecke zieht, zieht das Mass:
 * gemessen wird QUER — auf der Linie, auf der die Ecke mit ihrem Mass wandert
 * (`richtung`, vom `ursprung` aus) —, und daraus der neue Wert. Die Ecke
 * landet dort, wo sie abgelegt wurde; alles andere bleibt.
 *
 *   linear    wert = w0 + k · (t − t0)            Sohlbreite (k = 2), Arbeitsraum
 *   neigung   wert = w0 · (t − s) / (t0 − s)      Böschung 1 : n (s = Beginn der Böschung)
 *   winkel    wie neigung, aber in Grad           Böschungswinkel der Norm-Gruben
 *   hoehe     wert = Höhe des Griffs (m NN)       Sohle
 *
 * Die Oberkante (der Fuss) steht nicht in den Parametern — sie ist die Linie,
 * an der die Böschung auf das Gelände trifft, und die rechnet der Lauf
 * (`Boeschungskanten.js`, dieselben Linien, die im Raum gezeichnet werden).
 * Die Ecke sitzt deshalb auf der gezeichneten Linie; das neue Mass ist auf
 * ebenem Gelände genau, am Hang eine Näherung — nach dem Neubau steht die
 * Linie dort, wo die Böschung das Gelände wirklich trifft.
 *
 * Rein, ohne Import aus dem Katalog: Welt-x/z; Höhen wie angegeben.
 */

const GRAD = 180 / Math.PI;

/** Wie weit neben dem Ursprung ein Treffer mindestens liegen muss — die Kante selbst ist keiner (m). */
export const TREFFER_AB_M = 0.1;

/** t: wie weit `pos` vom Ursprung entlang der Richtung liegt (m). */
export function querlage(mass, pos) {
    const u = mass?.ursprung, r = mass?.richtung;
    if (!u || !r || !Number.isFinite(pos?.x) || !Number.isFinite(pos?.z)) return NaN;
    return (pos.x - u.x) * r.x + (pos.z - u.z) * r.z;
}

/** Den Punkt auf der Linie des Masses, der `pos` am nächsten liegt (Höhe bleibt). */
export function aufMasslinie(mass, pos) {
    const t = querlage(mass, pos);
    if (!Number.isFinite(t)) return pos;
    return { x: mass.ursprung.x + mass.richtung.x * t, y: pos.y, z: mass.ursprung.z + mass.richtung.z * t };
}

const _klemme = (w, m) => {
    if (!Number.isFinite(w)) return NaN;
    if (Number.isFinite(m?.min) && w < m.min) return m.min;
    if (Number.isFinite(m?.max) && w > m.max) return m.max;
    return w;
};

/**
 * Der Wert des Masses bei Querlage t — oder NaN (die Ecke liegt auf der
 * falschen Seite ihres Anfangs: eine Böschung, die vor der Sohle begänne).
 */
export function massWert(mass, t) {
    if (!mass || !Number.isFinite(t)) return NaN;
    switch (mass.art) {
        case 'linear':
            return _klemme(mass.w0 + mass.k * (t - mass.t0), mass);
        case 'neigung': {
            const a = t - mass.s, b = mass.t0 - mass.s;
            if (!(a > 1e-3) || !(b > 1e-3)) return NaN;
            return _klemme(mass.w0 * a / b, mass);
        }
        case 'winkel': {
            const a = t - mass.s, b = mass.t0 - mass.s;
            if (!(a > 1e-3) || !(b > 1e-3)) return NaN;
            const n0 = 1 / Math.tan(mass.w0 / GRAD);
            return _klemme(Math.atan(1 / (n0 * a / b)) * GRAD, mass);
        }
        default:
            return NaN;
    }
}

/** 1 : n aus einem Böschungswinkel in Grad (senkrecht → 0). */
export function neigungAusWinkel(grad) {
    const w = Number(grad);
    return Number.isFinite(w) && w > 0 && w < 90 ? 1 / Math.tan(w / GRAD) : 0;
}

/** Ein Böschungswinkel in Grad aus 1 : n. */
export function winkelAusNeigung(n) {
    return Number(n) > 0 ? Math.atan(1 / Number(n)) * GRAD : 90;
}

const _xz = (p) => (Array.isArray(p) ? { x: Number(p[0]), z: Number(p[2]) } : { x: Number(p?.x), z: Number(p?.z) });

function _einheit(x, z) {
    const l = Math.hypot(x, z);
    return l > 1e-9 ? { x: x / l, z: z / l } : null;
}

/**
 * Die Quer-Richtung an Punkt k einer Linie — links der Laufrichtung (`seite`
 * +1) oder rechts (−1). An den Enden senkrecht zum Endstück, dazwischen die
 * Winkelhalbierende; `faktor` ist 1/cos des halben Knickwinkels: um so viel
 * weiter liegt ein Punkt, der von BEIDEN Stücken denselben Abstand hat.
 * @returns {{x:number, z:number, faktor:number}|null}
 */
export function querrichtung(punkte, k, seite = 1) {
    const p = (punkte ?? []).map(_xz);
    const m = p.length;
    if (m < 2 || !p[k]) return null;
    const stueck = (i) => (i < 0 || i + 1 >= m ? null : _einheit(p[i + 1].x - p[i].x, p[i + 1].z - p[i].z));
    // „Links" wie in `Operationen._anLinie`: (dz, −dx) — links im Grundriss
    // (Ost = x, Nord = −z) der Laufrichtung.
    const normale = (d) => (d ? { x: d.z * seite, z: -d.x * seite } : null);
    const a = normale(stueck(k - 1)), b = normale(stueck(k));
    if (!a && !b) return null;
    if (!a || !b) return { ...(a ?? b), faktor: 1 };
    const h = _einheit(a.x + b.x, a.z + b.z);
    if (!h) return { ...b, faktor: 1 };
    const c = h.x * b.x + h.z * b.z;
    return { ...h, faktor: c > 0.2 ? 1 / c : 5 };
}

/**
 * Die Richtung NACH AUSSEN an Ecke k eines geschlossenen Rings — die
 * Winkelhalbierende der beiden äusseren Normalen, „aussen" an der Fläche
 * abgelesen, nicht an der Wicklung. `faktor` wie bei `querrichtung`: eine
 * Parallele im Abstand a verschiebt die Ecke um a · faktor.
 * @returns {{x:number, z:number, faktor:number}|null}
 */
export function aussenrichtung(ring, k) {
    const p = (ring ?? []).map(_xz);
    const m = p.length;
    if (m < 3 || !p[k]) return null;
    let a2 = 0;
    for (let i = 0; i < m; i++) a2 += p[i].x * p[(i + 1) % m].z - p[(i + 1) % m].x * p[i].z;
    // Positive Fläche (x/z mathematisch): innen links der Kanten — aussen rechts.
    const vz = a2 >= 0 ? 1 : -1;
    const normale = (i) => {
        const d = _einheit(p[(i + 1) % m].x - p[i].x, p[(i + 1) % m].z - p[i].z);
        return d ? { x: d.z * vz, z: -d.x * vz } : null;
    };
    const a = normale((k - 1 + m) % m), b = normale(k);
    if (!a || !b) return a ?? b ? { ...(a ?? b), faktor: 1 } : null;
    const h = _einheit(a.x + b.x, a.z + b.z);
    if (!h) return { ...b, faktor: 1 };
    const c = h.x * b.x + h.z * b.z;
    return { ...h, faktor: c > 0.2 ? 1 / c : 5 };
}

/**
 * Der erste Treffer eines Strahls mit einer der Linien, weiter als `ab` vom
 * Ursprung — oder null. Die Linien in Welt-x/z, mit Höhe (die gibt der
 * Treffer mit).
 */
export function strahlTreffer(ursprung, richtung, linien, { ab = TREFFER_AB_M, bis = 500 } = {}) {
    let bester = null;
    for (const l of linien ?? []) {
        const pk = l?.punkte ?? [];
        const n = pk.length;
        const bisI = l?.geschlossen ? n : n - 1;
        for (let i = 0; i < bisI; i++) {
            const a = pk[i], b = pk[(i + 1) % n];
            if (!a || !b) continue;
            const ex = b.x - a.x, ez = b.z - a.z;
            const det = richtung.x * (-ez) - richtung.z * (-ex);
            if (Math.abs(det) < 1e-12) continue;
            const rx = a.x - ursprung.x, rz = a.z - ursprung.z;
            const t = (rx * (-ez) - rz * (-ex)) / det;
            const s = (richtung.x * rz - richtung.z * rx) / det;
            if (s < -1e-9 || s > 1 + 1e-9 || !(t > ab) || t > bis) continue;
            if (!bester || t < bester.t) {
                const y = Number.isFinite(a.y) && Number.isFinite(b.y) ? a.y + (b.y - a.y) * s : NaN;
                bester = { t, punkt: { x: ursprung.x + richtung.x * t, y, z: ursprung.z + richtung.z * t } };
            }
        }
    }
    return bester;
}

/** Die Kanten eines Laufs, die Böschungsoberkante oder -fuss sind (die Linien, auf denen eine Böschung endet). */
export function aussenkanten(kanten, arten = ['oberkante', 'fuss']) {
    return (kanten ?? []).filter(k => arten.includes(k?.art) && (k?.punkte?.length ?? 0) >= 2);
}

/**
 * DIE ECKEN EINES GERINNES (eigener Vorgang „Gerinne einschneiden").
 *
 * Gespeichert sind die Achse (Grundriss), Sohle am Anfang und Ende (m NN),
 * Sohlbreite und Böschung. Daraus:
 *   - je Achspunkt eine Ecke auf der Sohle: zieht die Achse (Lage); Anfang
 *     und Ende haben dazu einen Höhengriff für ihre Sohle;
 *   - an Anfang und Ende je Seite die Sohlkante: zieht die Sohlbreite
 *     (beide Seiten gleich — die Achse bleibt die Mitte);
 *   - an Anfang und Ende je Seite die Böschungsoberkante: zieht die Böschung.
 * Die Sohle läuft linear über die Weglänge im Grundriss — wie `gerinne`.
 *
 * @param {object} p              Parameter der Operation (achse, sohleAnfang, sohleEnde, sohlbreite, boeschung)
 * @param {object} ctx
 * @param {(nn:number)=>number} ctx.welt   m NN → Welt-Y
 * @param {Array} [ctx.kanten]    die Kanten des Laufs (Welt)
 * @returns {Array<object>}  Eckbeschreibungen (siehe `Griffe.eckgriffe`)
 */
export function gerinneEcken(p, { welt, kanten = [] } = {}) {
    const achse = (p?.achse ?? []).map(_xz);
    if (achse.length < 2 || !achse.every(q => Number.isFinite(q.x) && Number.isFinite(q.z))) return [];
    const sa = Number(p.sohleAnfang), se = Number.isFinite(Number(p.sohleEnde)) ? Number(p.sohleEnde) : sa;
    if (!Number.isFinite(sa)) return [];
    const wege = [0];
    for (let i = 1; i < achse.length; i++) wege.push(wege[i - 1] + Math.hypot(achse[i].x - achse[i - 1].x, achse[i].z - achse[i - 1].z));
    const gesamt = wege.at(-1);
    const sohleBei = (k) => (gesamt > 0 ? sa + (se - sa) * (wege[k] / gesamt) : sa);
    const b = Math.max(0, Number(p.sohlbreite) || 0);
    const n = Math.max(0, Number(p.boeschung) || 0);
    const letzte = achse.length - 1;
    const aus = [];
    achse.forEach((q, k) => {
        const ende = k === 0 ? 'sohleAnfang' : k === letzte ? 'sohleEnde' : null;
        aus.push({ schluessel: `achse:${k}`, titel: k === 0 ? 'Achse Anfang' : k === letzte ? 'Achse Ende' : `Achse ${k + 1}`,
                   pos: { x: q.x, y: welt(sohleBei(k)), z: q.z }, feld: 'achse', index: k, bezug: 'achse',
                   ring: achse, geschlossen: false,
                   ...(ende ? { hoehe: { feld: ende, titel: ende === 'sohleAnfang' ? 'Sohle am Anfang' : 'Sohle am Ende' } } : {}) });
    });
    const oberkanten = aussenkanten(kanten, ['oberkante']);
    for (const [k, wo] of [[0, 'Anfang'], [letzte, 'Ende']]) {
        for (const [seite, name] of [[1, 'links'], [-1, 'rechts']]) {
            const r = querrichtung(achse, k, seite);
            if (!r) continue;
            const u = achse[k];
            const y = welt(sohleBei(k));
            aus.push({ schluessel: `sohlkante:${k}:${seite}`, titel: `Sohlkante ${wo} ${name}`,
                       pos: { x: u.x + r.x * b / 2, y, z: u.z + r.z * b / 2 },
                       mass: { feld: 'sohlbreite', titel: 'Sohlbreite', einheit: 'm', art: 'linear', ursprung: u, richtung: { x: r.x, z: r.z },
                               t0: b / 2, w0: b, k: 2, min: 0, max: 50 } });
            if (!(n > 0)) continue;
            const treffer = strahlTreffer(u, r, oberkanten, { ab: b / 2 + TREFFER_AB_M });
            if (!treffer) continue;
            aus.push({ schluessel: `oberkante:${k}:${seite}`, titel: `Böschungsoberkante ${wo} ${name}`,
                       pos: { x: treffer.punkt.x, y: Number.isFinite(treffer.punkt.y) ? treffer.punkt.y : y, z: treffer.punkt.z },
                       mass: { feld: 'boeschung', titel: 'Böschung 1 :', art: 'neigung', ursprung: u, richtung: { x: r.x, z: r.z },
                               t0: treffer.t, s: b / 2, w0: n, min: 0.1, max: 10 } });
        }
    }
    return aus;
}

/**
 * DER FUSS EINER BÖSCHUNG AN EINER KANTE: je Knick der Kante die Stelle, an
 * der die Böschung auf das Gelände trifft — auf der gewählten Seite, quer zur
 * Kante (am Knick auf der Winkelhalbierenden). Zieht die Neigung.
 * Liegt das Gelände höher als die Kante, ist es die Oberkante eines
 * Einschnitts — dieselbe Ecke, dieselbe Regel.
 */
export function boeschungsFussEcken(p, { kanten = [] } = {}) {
    const linie = (p?.linie ?? []).map(q => ({ ..._xz(q) }));
    const n = Number(p?.neigung);
    if (linie.length < 2 || !(n > 0)) return [];
    const seite = p?.seite === 'links' ? 1 : -1;
    const linien = aussenkanten(kanten);
    const aus = [];
    linie.forEach((u, k) => {
        const r = querrichtung(linie, k, seite);
        if (!r || !Number.isFinite(u.x) || !Number.isFinite(u.z)) return;
        const treffer = strahlTreffer(u, r, linien);
        if (!treffer || !Number.isFinite(treffer.punkt.y)) return;
        aus.push({ schluessel: `fuss:${k}`, titel: `Böschungsfuß ${k + 1}`, pos: treffer.punkt,
                   mass: { feld: 'neigung', titel: 'Böschung 1 :', art: 'neigung', ursprung: u, richtung: { x: r.x, z: r.z },
                           t0: treffer.t, s: 0, w0: n, min: 0.1, max: 10 } });
    });
    return aus;
}
