/**
 * Geländeoperationen — Raster → Raster, rein und deklarativ (Stufe 15).
 *
 * Jede Operation nimmt ein Höhenraster (aus `heightfieldRaster`) und die
 * PARAMETER der Formung und gibt ein NEUES Raster zurück. Drei Gesetze aus
 * dem Journal gelten hier wörtlich:
 *
 *  - ABSOLUTE ZIELZUSTÄNDE (Gesetz 4): Sohlen und Planumshöhen sind
 *    NN-Höhen, nie Zuwächse. Jede Operation ist idempotent — zweimal
 *    angewandt ändert sich nichts. Deshalb gibt es hier auch keinen
 *    „Pinsel": heben/senken um einen Betrag ist NICHT idempotent und
 *    braucht eine eigene Antwort, wenn er gebaut wird.
 *  - NICHTS GERECHNETES SPEICHERN (Gesetz 5): der Journaleintrag trägt die
 *    Parameter, nie das Raster. Der Stand entsteht durch Nachspielen der
 *    Operationsliste auf dem GELIEFERTEN Gelände.
 *  - NaN bleibt NaN: „kein Treffer" ist eine Auskunft. Eine Operation, die
 *    daraus 0 machte, risse Löcher auf Höhe null (Landmine aus Teil III).
 *
 * Achsen: three-Konvention wie überall in der CDE — X/Z ist der Grundriss,
 * Y die Höhe. Die Achse einer Operation ist eine Folge von {x, y, z}- oder
 * [x,y,z]-Punkten; gerechnet wird im Grundriss (XY der Punkte wird NICHT
 * gedeutet — Höhen kommen aus den Sohlparametern).
 *
 * AUSNAHME seit Teil XX (2026-09-10): `grube`, `schuettung` und
 * `boeschungLinie` tragen ihre Rand- bzw. Kantenhöhe JE PUNKT (y). Aus dem
 * Raster gelesen, sänke sie unter der eigenen Operation, und ein zweiter Lauf
 * grübe tiefer — die Höhe gehört deshalb in die Parameter, wie jede Sohle.
 *
 * Reines Modul: kein Vue, kein three, kein WebGL.
 */
import { punktInPolygon } from '@/services/tinte/InkGeometry';
import { rasterKnoten } from '../geometry/SurfaceOps.js';

/** Ein Punkt kommt je nach Quelle als {x,z} oder [x,y,z]. */
function _xz(p) {
    if (Array.isArray(p)) return { x: p[0] ?? 0, z: p[2] ?? 0 };
    return { x: p?.x ?? 0, z: p?.z ?? 0 };
}

/**
 * Abstand Punkt→Strecke im Grundriss, plus Station des Fusspunkts — und die
 * ZERLEGUNG in längs und quer: `tRoh` ist der ungeklemmte Parameter (< 0 vor
 * dem Anfang, > 1 hinter dem Ende), `quer` der senkrechte Abstand zur
 * Geraden. Daraus kennt das Gerinne seine Stirnseiten.
 */
function _anStrecke(px, pz, a, b) {
    const dx = b.x - a.x, dz = b.z - a.z;
    const l2 = dx * dx + dz * dz;
    const tRoh = l2 > 0 ? ((px - a.x) * dx + (pz - a.z) * dz) / l2 : 0;
    const t = Math.max(0, Math.min(1, tRoh));
    const fx = a.x + t * dx, fz = a.z + t * dz;
    const quer = l2 > 0 ? Math.abs((px - a.x) * dz - (pz - a.z) * dx) / Math.sqrt(l2) : Math.hypot(px - a.x, pz - a.z);
    return { abstand: Math.hypot(px - fx, pz - fz), t, tRoh, quer };
}

/**
 * Fusspunkt eines Rasterknotens auf der ganzen Achse: kleinster Abstand,
 * Station = Weg entlang der Achse bis zum Fusspunkt — und der ÜBERSTAND:
 * wie weit der Knoten in Achsrichtung VOR dem Anfang oder HINTER dem Ende
 * liegt (0 im Inneren). Mit `quer` dazu kann das Gerinne die Stirnseite
 * abböschen, statt sie rund um den Endpunkt zu drehen.
 */
function _anAchse(px, pz, achse) {
    let bester = null;
    let station = 0;
    let laenge = 0;
    const n = achse.length - 1;
    for (let i = 0; i < n; i++) {
        const a = _xz(achse[i]);
        const b = _xz(achse[i + 1]);
        const seg = Math.hypot(b.x - a.x, b.z - a.z);
        const r = _anStrecke(px, pz, a, b);
        if (!bester || r.abstand < bester.abstand) {
            let ueberstand = 0;
            if (i === 0 && r.tRoh < 0) ueberstand = -r.tRoh * seg;
            else if (i === n - 1 && r.tRoh > 1) ueberstand = (r.tRoh - 1) * seg;
            bester = { abstand: r.abstand, quer: ueberstand > 0 ? r.quer : r.abstand, ueberstand };
            station = laenge + r.t * seg;
        }
        laenge += seg;
    }
    return bester ? { ...bester, station, laenge } : null;
}

/**
 * Punkte MIT Höhe (Teil XX): {x, y, z} in Welt — oder null, sobald einer
 * keine trägt. Geraten wird nicht: ohne Randhöhe keine Grube.
 */
function _mitHoehe(punkte) {
    const aus = [];
    for (const p of punkte ?? []) {
        const q = Array.isArray(p) ? { x: p[0], y: p[1], z: p[2] } : { x: p?.x, y: p?.y, z: p?.z };
        if (![q.x, q.y, q.z].every(Number.isFinite)) return null;
        aus.push(q);
    }
    return aus;
}

/**
 * Der nächste Punkt auf einem GESCHLOSSENEN Ring: Abstand, Kante, Parameter
 * und die dort interpolierte Randhöhe — aus den Punkthöhen, nie aus dem Raster.
 */
function _amRing(px, pz, ring) {
    let bester = null;
    const n = ring.length;
    for (let i = 0; i < n; i++) {
        const a = ring[i], b = ring[(i + 1) % n];
        const r = _anStrecke(px, pz, a, b);
        if (!bester || r.abstand < bester.abstand) bester = { abstand: r.abstand, i, t: r.t, hoehe: a.y + (b.y - a.y) * r.t };
    }
    return bester;
}

/**
 * Der nächste Punkt auf einer OFFENEN Linie, mit Höhe und SEITE (Teil XX).
 *
 * Seite wie im Lageplan (Nord oben): links der Zeichenrichtung ist positiv.
 * In Welt-XZ liegt Nord auf −z, die Linksnormale einer Strecke d steht
 * deshalb bei (d.z, −d.x). An einem INNEREN Knick entscheidet die
 * Winkelhalbierende der beiden Normalen — sonst fiele ein Punkt im
 * Knickwinkel je nach Segment auf beide Seiten. Jenseits der Enden zählt die
 * Verlängerung der End-Strecke: dort läuft die Böschung als auf die Seite
 * begrenzter Kegel aus, statt um das Ende herum auf die andere Seite.
 */
function _anLinie(px, pz, linie) {
    const n = linie.length - 1;
    let bester = null;
    for (let i = 0; i < n; i++) {
        const r = _anStrecke(px, pz, linie[i], linie[i + 1]);
        if (!bester || r.abstand < bester.abstand) bester = { ...r, i };
    }
    if (!bester) return null;
    const links = (s) => {
        const dx = linie[s + 1].x - linie[s].x, dz = linie[s + 1].z - linie[s].z;
        const l = Math.hypot(dx, dz) || 1;
        return { x: dz / l, z: -dx / l };
    };
    const { i, t } = bester;
    const a = linie[i], b = linie[i + 1];
    let normale = links(i);
    let ursprung = a;
    if (t <= 1e-9 && i > 0) {
        const m = links(i - 1);
        normale = { x: normale.x + m.x, z: normale.z + m.z };
    } else if (t >= 1 - 1e-9 && i < n - 1) {
        const m = links(i + 1);
        normale = { x: normale.x + m.x, z: normale.z + m.z };
        ursprung = b;
    }
    return {
        abstand: bester.abstand,
        hoehe: a.y + (b.y - a.y) * t,
        seite: (px - ursprung.x) * normale.x + (pz - ursprung.z) * normale.z,
    };
}

/** Gleicher Rasterbezug? Ein Delta/Vergleich über fremde Raster ist Unsinn. */
export function gleicherBezug(a, b) {
    return !!a && !!b
        && a.nx === b.nx && a.nz === b.nz
        && Math.abs(a.cell - b.cell) < 1e-9
        && Math.abs(a.x0 - b.x0) < 1e-9
        && Math.abs(a.z0 - b.z0) < 1e-9;
}

/** Neues Raster mit kopierten Höhen — die Eingabe bleibt unangetastet. */
function _kopie(raster) {
    return { ...raster, heights: Float64Array.from(raster.heights) };
}

/**
 * Gerinne: Trapezquerschnitt entlang einer Achse, NUR SCHNEIDEND.
 *
 * Sohlhöhe läuft linear von `sohleAnfang` (NN) zu `sohleEnde` über die
 * Stationierung. `boeschung` ist die Neigung 1:n als n — waagerechte Meter
 * je Höhenmeter; **n = 0 heisst senkrecht (verbaut)**. Ausserhalb der Sohle
 * steigt die Zielhöhe mit dem Abstand; wo sie das Gelände erreicht, endet
 * der Einfluss VON SELBST (min).
 *
 * DIE STIRNSEITEN (Fabio, B3-Nachtrag: „Grabenaushub ohne Verbau — Rechteck,
 * dann Trapez im Längsschnitt"): die Sohle endet an den Achsenden; hinter
 * dem Ende steigt die Böschung mit demselben n auch in Achsrichtung —
 * abgeböscht wird der Graben im Längsschnitt ein Trapez, verbaut (n = 0)
 * ein Rechteck. Vorher drehte sich die Böschung rund um den Endpunkt und
 * die Sohle ragte um die halbe Breite über das Ende hinaus.
 *
 * @returns {{raster, warnungen: string[]}}
 */
export function gerinne(raster, { achse, sohlbreite, boeschung = 1.5, sohleAnfang, sohleEnde } = {}, { bereich = null } = {}) {
    const warnungen = [];
    if (!Array.isArray(achse) || achse.length < 2) return { raster, warnungen: ['gerinne_ohne_achse'] };
    if (!Number.isFinite(sohleAnfang)) return { raster, warnungen: ['gerinne_ohne_sohle'] };
    const ende = Number.isFinite(sohleEnde) ? sohleEnde : sohleAnfang;
    const b2 = Math.max(0, (sohlbreite ?? 0) / 2);
    const n = Math.max(0, Number(boeschung) || 0);

    // Feiner als die Zelle wird es nicht: melden, nicht still vergröbern.
    if (sohlbreite > 0 && raster.cell > sohlbreite) {
        warnungen.push(`gerinne_feiner_als_zelle: Sohlbreite ${sohlbreite} m < Zellweite ${raster.cell.toFixed(2)} m`);
    }

    const neu = _kopie(raster);
    const { nx, nz, heights } = neu;
    // Nur die Zellen im Wirkbereich — ausserhalb kann sich nichts ändern.
    const _b = _zellbereich(raster, bereich);
    for (let ix = _b.ix0; ix <= _b.ix1; ix++) {
        for (let iz = _b.iz0; iz <= _b.iz1; iz++) {
            const i = ix * nz + iz;
            const h = heights[i];
            if (!Number.isFinite(h)) continue;                    // NaN bleibt NaN
            const k = rasterKnoten(raster, ix, iz);
            const lage = _anAchse(k.x, k.z, achse);
            if (!lage) continue;
            const sohle = lage.laenge > 0
                ? sohleAnfang + (ende - sohleAnfang) * (lage.station / lage.laenge)
                : sohleAnfang;
            // Abstand zum SOHLSTREIFEN: quer über die halbe Breite hinaus,
            // längs über das Ende hinaus — beides zusammen als Hypotenuse.
            const d = Math.hypot(Math.max(0, lage.quer - b2), lage.ueberstand);
            let ziel;
            if (d === 0) ziel = sohle;
            else if (n > 0) ziel = sohle + d / n;
            else continue;                                        // senkrecht: aussen nichts
            heights[i] = Math.min(h, ziel);                       // nur schneiden
        }
    }
    return { raster: neu, warnungen };
}

/**
 * Planum: innerhalb des Umrisses auf Sollhöhe — Aushub UND Auftrag.
 * Der Umriss ist ein Grundriss-Polygon aus {x,z}- oder [x,y,z]-Punkten.
 */
export function planum(raster, { umriss, hoehe } = {}, { bereich = null } = {}) {
    const warnungen = [];
    if (!Array.isArray(umriss) || umriss.length < 3) return { raster, warnungen: ['planum_ohne_umriss'] };
    if (!Number.isFinite(hoehe)) return { raster, warnungen: ['planum_ohne_hoehe'] };
    const poly = umriss.map(p => { const q = _xz(p); return [q.x, q.z]; });

    const neu = _kopie(raster);
    const { nx, nz, heights } = neu;
    // Nur die Zellen im Wirkbereich — ausserhalb kann sich nichts ändern.
    const _b = _zellbereich(raster, bereich);
    for (let ix = _b.ix0; ix <= _b.ix1; ix++) {
        for (let iz = _b.iz0; iz <= _b.iz1; iz++) {
            const i = ix * nz + iz;
            if (!Number.isFinite(heights[i])) continue;
            const k = rasterKnoten(raster, ix, iz);
            if (punktInPolygon(k.x, k.z, poly)) heights[i] = hoehe;
        }
    }
    return { raster: neu, warnungen };
}

/**
 * Böschung: der Anschluss eines Planums ans gewachsene Gelände.
 *
 * AUSSERHALB des Umrisses läuft von dessen Rand eine Böschung 1:n zur
 * Planumshöhe — nach oben (Einschnitt) wie nach unten (Damm). Wo sie das
 * Gelände erreicht, endet ihr Einfluss von selbst. Innerhalb tut sie
 * nichts — das ist die Arbeit des Planums.
 */
export function boeschung(raster, { umriss, hoehe, neigung = 1.5 } = {}, { bereich = null } = {}) {
    const warnungen = [];
    if (!Array.isArray(umriss) || umriss.length < 3) return { raster, warnungen: ['boeschung_ohne_umriss'] };
    if (!Number.isFinite(hoehe)) return { raster, warnungen: ['boeschung_ohne_hoehe'] };
    const poly = umriss.map(p => { const q = _xz(p); return [q.x, q.z]; });
    const n = Math.max(0.1, neigung);

    // Abstand zum Polygonrand (aussen): kleinster Streckenabstand.
    const rand = [];
    for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length];
        rand.push([{ x: a[0], z: a[1] }, { x: b[0], z: b[1] }]);
    }
    const abstandZumRand = (x, z) => {
        let d = Infinity;
        for (const [a, b] of rand) d = Math.min(d, _anStrecke(x, z, a, b).abstand);
        return d;
    };

    const neu = _kopie(raster);
    const { nx, nz, heights } = neu;
    // Nur die Zellen im Wirkbereich — ausserhalb kann sich nichts ändern.
    const _b = _zellbereich(raster, bereich);
    for (let ix = _b.ix0; ix <= _b.ix1; ix++) {
        for (let iz = _b.iz0; iz <= _b.iz1; iz++) {
            const i = ix * nz + iz;
            const h = heights[i];
            if (!Number.isFinite(h)) continue;
            const k = rasterKnoten(raster, ix, iz);
            if (punktInPolygon(k.x, k.z, poly)) continue;         // innen: Sache des Planums
            const d = abstandZumRand(k.x, k.z);
            if (h > hoehe) heights[i] = Math.min(h, hoehe + d / n);   // Einschnitt
            else if (h < hoehe) heights[i] = Math.max(h, hoehe - d / n); // Damm
        }
    }
    return { raster: neu, warnungen };
}

/**
 * GRUBE (Teil XX, Fabio 2026-09-10): der gezeichnete Umriss ist die
 * BÖSCHUNGSOBERKANTE auf dem Gelände, die Böschung fällt nach INNEN bis zur
 * Sohle. Bis hierher war es umgekehrt (Planum als Sohle, Böschung nach
 * aussen): die gezeichneten Ecken lagen danach am Grubenboden — „2 m tiefer".
 *
 * NUR SCHNEIDEND (`min`), wie Gerinne und Baugrube: eine Grube füllt nie auf.
 * Die Randhöhe kommt aus den Umrisspunkten, deshalb ist die Operation
 * idempotent. `neigung` leer oder 0 heisst senkrecht (verbaut).
 */
export function grube(raster, { umriss, sohle, neigung = null } = {}, { bereich = null } = {}) {
    const warnungen = [];
    const ring = _mitHoehe(umriss);
    if (!ring || ring.length < 3) return { raster, warnungen: ['grube_ohne_umriss: jeder Umrisspunkt braucht seine Höhe'] };
    if (!Number.isFinite(sohle)) return { raster, warnungen: ['grube_ohne_sohle'] };
    const n = Number(neigung) > 0 ? Number(neigung) : 0;
    const poly = ring.map(p => [p.x, p.z]);
    const neu = _kopie(raster);
    const { nz, heights } = neu;
    let getroffen = 0;
    const _b = _zellbereich(raster, bereich);
    for (let ix = _b.ix0; ix <= _b.ix1; ix++) {
        for (let iz = _b.iz0; iz <= _b.iz1; iz++) {
            const i = ix * nz + iz;
            const h = heights[i];
            if (!Number.isFinite(h)) continue;                    // NaN bleibt NaN
            const k = rasterKnoten(raster, ix, iz);
            if (!punktInPolygon(k.x, k.z, poly)) continue;        // aussen: nichts
            const r = _amRing(k.x, k.z, ring);
            const ziel = n > 0 ? Math.max(sohle, r.hoehe - r.abstand / n) : sohle;
            if (ziel < h) { heights[i] = ziel; getroffen++; }
        }
    }
    if (!getroffen) warnungen.push('grube_ohne_treffer: kein Rasterpunkt im Umriss liegt über der Grube');
    return { raster: neu, warnungen };
}

/**
 * SCHÜTTUNG — die umgedrehte Grube (Teil XX): der Umriss ist der
 * BÖSCHUNGSFUSS auf dem Gelände, die Böschung steigt nach INNEN bis zur
 * Zielhöhe. Ziel `'hoehe'`: eine absolute Höhe (m NN an der Grenze, hier
 * Welt). Ziel `'ur'` („bis GOK"): das URSPRÜNGLICHE Gelände — eine
 * Rückverfüllung; sie braucht das Ur-Raster (`ur`, derselbe Rasterbezug).
 *
 * NUR FÜLLEND (`max`): eine Schüttung trägt nie ab. Idempotent aus
 * denselben Gründen wie die Grube.
 */
export function schuettung(raster, { umriss, ziel = 'hoehe', hoehe, neigung = null } = {}, { bereich = null, ur = null } = {}) {
    const warnungen = [];
    const ring = _mitHoehe(umriss);
    if (!ring || ring.length < 3) return { raster, warnungen: ['schuettung_ohne_umriss: jeder Umrisspunkt braucht seine Höhe'] };
    const bisUr = ziel === 'ur';
    if (bisUr && !gleicherBezug(ur, raster)) return { raster, warnungen: ['schuettung_ohne_ur: das Ur-Gelände liegt nicht auf diesem Raster'] };
    if (!bisUr && !Number.isFinite(hoehe)) return { raster, warnungen: ['schuettung_ohne_hoehe'] };
    const n = Number(neigung) > 0 ? Number(neigung) : 0;
    const poly = ring.map(p => [p.x, p.z]);
    const neu = _kopie(raster);
    const { nz, heights } = neu;
    let getroffen = 0;
    const _b = _zellbereich(raster, bereich);
    for (let ix = _b.ix0; ix <= _b.ix1; ix++) {
        for (let iz = _b.iz0; iz <= _b.iz1; iz++) {
            const i = ix * nz + iz;
            const h = heights[i];
            if (!Number.isFinite(h)) continue;
            const k = rasterKnoten(raster, ix, iz);
            if (!punktInPolygon(k.x, k.z, poly)) continue;
            let soll;
            if (bisUr) {
                soll = ur.heights[i];
                if (!Number.isFinite(soll)) continue;
            } else {
                const r = _amRing(k.x, k.z, ring);
                soll = n > 0 ? Math.min(hoehe, r.hoehe + r.abstand / n) : hoehe;
            }
            if (soll > h) { heights[i] = soll; getroffen++; }
        }
    }
    if (!getroffen) warnungen.push('schuettung_ohne_treffer: kein Rasterpunkt im Umriss liegt unter der Zielhöhe');
    return { raster: neu, warnungen };
}

/**
 * BÖSCHUNG AN EINER KANTE (Teil XX): eine OFFENE Linie mit Höhe je Knick
 * ist die Böschungskante; auf der gewählten Seite läuft die Böschung 1:n
 * bis zum Gelände — liegt das Gelände höher, als Einschnitt, liegt es
 * tiefer, als Damm. Wo sie das Gelände erreicht, endet sie von selbst. Die
 * andere Seite bleibt, wie sie ist (liegt die Kante nicht auf dem Gelände,
 * entsteht dort eine Stufe — das sagt der Hinweis im Werkzeug).
 */
export function boeschungLinie(raster, { linie, seite = 'rechts', neigung = 1.5 } = {}, { bereich = null } = {}) {
    const warnungen = [];
    const pts = _mitHoehe(linie);
    if (!pts || pts.length < 2) return { raster, warnungen: ['boeschung_linie_ohne_punkte: jeder Knick braucht seine Höhe'] };
    const n = Math.max(0.1, Number(neigung) || 0);
    const richtung = seite === 'links' ? 1 : -1;
    const neu = _kopie(raster);
    const { nz, heights } = neu;
    const _b = _zellbereich(raster, bereich);
    for (let ix = _b.ix0; ix <= _b.ix1; ix++) {
        for (let iz = _b.iz0; iz <= _b.iz1; iz++) {
            const i = ix * nz + iz;
            const h = heights[i];
            if (!Number.isFinite(h)) continue;
            const k = rasterKnoten(raster, ix, iz);
            const r = _anLinie(k.x, k.z, pts);
            if (!r || r.seite * richtung < 0) continue;           // die andere Seite bleibt
            if (h > r.hoehe) heights[i] = Math.min(h, r.hoehe + r.abstand / n);        // Einschnitt
            else if (h < r.hoehe) heights[i] = Math.max(h, r.hoehe - r.abstand / n);   // Damm
        }
    }
    return { raster: neu, warnungen };
}

/**
 * Erdmassen zwischen zwei Ständen DESSELBEN Rasters — Aushub und Auftrag
 * getrennt (m³). Je Zelle das Mittel der vier Eckdifferenzen mal Zellfläche;
 * eine Zelle zählt nur, wenn alle vier Ecken in BEIDEN Ständen Höhen tragen
 * (NaN ist eine Auskunft, keine Null). Fremder Bezug → null, nicht 0: eine
 * Null wäre eine Behauptung.
 */
export function massenAus(vorher, nachher) {
    if (!gleicherBezug(vorher, nachher)) return null;
    const { nx, nz, cell } = vorher;
    const flaeche = cell * cell;
    let aushub = 0;
    let auftrag = 0;
    for (let ix = 0; ix + 1 < nx; ix++) {
        for (let iz = 0; iz + 1 < nz; iz++) {
            let summe = 0;
            let gueltig = true;
            for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
                const i = (ix + dx) * nz + (iz + dz);
                const a = vorher.heights[i];
                const b = nachher.heights[i];
                if (!Number.isFinite(a) || !Number.isFinite(b)) { gueltig = false; break; }
                summe += b - a;
            }
            if (!gueltig) continue;
            const dv = (summe / 4) * flaeche;
            if (dv < 0) aushub -= dv;
            else auftrag += dv;
        }
    }
    return { aushub, auftrag };
}

/**
 * Der Katalog der Geländeoperationen — für Nachspielen und Bedienung EIN
 * Nachschlagewerk (dieselbe Form wie AENDERUNGS_ARTEN: neue hier, sonst
 * nirgends).
 */
/**
 * Baugrube: eine ECKIGE Grube um einen Punkt — Fabio: „Schachtgruben sind
 * niemals rund, immer eckig." Ein Rechteck (Länge × Breite) um `mitte`,
 * gedreht in `richtung` (Grundriss, z. B. die anschliessende Haltung); Sohle
 * innen, aussen eine Böschung 1:n vom Rechteckrand bis ans gewachsene
 * Gelände (n = 0: senkrecht). NUR SCHNEIDEND wie das Gerinne: `Math.min` —
 * sie füllt nie auf, und zweimal angewandt ändert sich nichts (Gesetz 4).
 * `planum` taugt dafür nicht, es SETZT die Höhe und würde einen tieferen
 * Graben daneben wieder auffüllen. (Ein früherer Entwurf war rund; ein
 * `radius` wird noch als Quadrat der Seite 2·r gelesen.)
 */
export function baugrube(raster, { mitte, laenge, breite, radius, richtung = null, sohle, neigung = 0 } = {}, { bereich = null } = {}) {
    const warnungen = [];
    const m = mitte ? _xz(mitte) : null;
    if (!m || !Number.isFinite(m.x) || !Number.isFinite(m.z)) return { raster, warnungen: ['baugrube_ohne_mitte'] };
    let L = Number(laenge), B = Number(breite);
    if (!(L > 0) && Number.isFinite(radius) && radius > 0) { L = 2 * radius; B = 2 * radius; }
    if (!(B > 0) && L > 0) B = L;
    if (!(L > 0) || !(B > 0)) return { raster, warnungen: ['baugrube_ohne_mass'] };
    if (!Number.isFinite(sohle)) return { raster, warnungen: ['baugrube_ohne_sohle'] };
    const n = Math.max(0, Number(neigung) || 0);
    // Die Richtung: Einheitsvektor im Grundriss; ohne Angabe liegt die Länge auf Ost.
    let ux = 1, uz = 0;
    if (richtung && Number.isFinite(richtung.x) && Number.isFinite(richtung.z)) {
        const l = Math.hypot(richtung.x, richtung.z);
        if (l > 1e-9) { ux = richtung.x / l; uz = richtung.z / l; }
    }
    const a = L / 2, b = B / 2;
    if (Math.min(L, B) < raster.cell) warnungen.push(`baugrube_feiner_als_zelle: Seite ${Math.min(L, B).toFixed(2)} m < Zelle ${raster.cell.toFixed(2)} m`);
    const neu = _kopie(raster);
    const { nx, nz, heights } = neu;
    let getroffen = 0;
    // Nur die Zellen im Wirkbereich — ausserhalb kann sich nichts ändern.
    const _b = _zellbereich(raster, bereich);
    for (let ix = _b.ix0; ix <= _b.ix1; ix++) {
        for (let iz = _b.iz0; iz <= _b.iz1; iz++) {
            const i = ix * nz + iz;
            const h = heights[i];
            if (!Number.isFinite(h)) continue;
            const k = rasterKnoten(raster, ix, iz);
            const dx = k.x - m.x, dz = k.z - m.z;
            // In den Rahmen des Rechtecks drehen: u längs, v quer.
            const u = dx * ux + dz * uz;
            const v = -dx * uz + dz * ux;
            const du = Math.max(0, Math.abs(u) - a), dv = Math.max(0, Math.abs(v) - b);
            const d = Math.hypot(du, dv);                          // Abstand zum Rechteckrand (0 = innen)
            let ziel;
            if (d === 0) ziel = sohle;
            else if (n > 0) ziel = sohle + d / n;                   // Böschung steigt mit 1:n
            else continue;                                          // senkrecht: aussen nichts
            if (ziel < h) { heights[i] = ziel; getroffen++; }
        }
    }
    if (!getroffen) warnungen.push('baugrube_ohne_treffer: kein Rasterpunkt tiefer als das Gelände');
    return { raster: neu, warnungen };
}

/**
 * DER WIRKBEREICH: welche Zellen eine Operation überhaupt anfassen kann.
 *
 * WARUM. Eine Formung lief bisher über JEDE Zelle des Geländes — bei einem
 * DGM am Zellbudget sind das 250.000, und ein Gerinne von 200 × 60 m
 * berührt davon rund 3.000. Gemessen kostete `formeNach` auf dem vollen
 * Raster etwa eine Sekunde je Operation; mit dem Bereich sind es
 * Millisekunden. Fabios Wort dafür war „extrem heavy 3D".
 *
 * DIE GEFAHR IST DAS STILLE ABSCHNEIDEN. Ein zu enger Bereich schneidet die
 * Böschung ab, und das Ergebnis sieht plausibel aus. Deshalb zwei Dinge:
 * der Rand wird aus den Parametern GERECHNET (Sohlbreite, Neigung, Tiefe),
 * und nach dem Lauf wird am Rand des Bereichs geprüft, ob dort noch etwas
 * passiert ist — wenn ja, sagt es die Warnung `wirkbereich_zu_klein`.
 *
 * Ohne Bereich bleibt alles wie zuvor: `null` heisst „das ganze Raster".
 */
const RAND_MINDEST_M = 4;

/** Die XZ-Hülle einer Punktliste. */
function _huelleXZ(punkte) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of punkte ?? []) {
        const q = _xz(p);
        if (!Number.isFinite(q?.x) || !Number.isFinite(q?.z)) continue;
        if (q.x < minX) minX = q.x; if (q.x > maxX) maxX = q.x;
        if (q.z < minZ) minZ = q.z; if (q.z > maxZ) maxZ = q.z;
    }
    return Number.isFinite(minX) ? { minX, maxX, minZ, maxZ } : null;
}

/** Die grösste Höhe des Rasters in einer XZ-Hülle — für die Tiefenschätzung. */
function _hoechsteIn(raster, h) {
    let max = -Infinity;
    const a = _zellbereich(raster, h);
    for (let ix = a.ix0; ix <= a.ix1; ix++) {
        for (let iz = a.iz0; iz <= a.iz1; iz++) {
            const v = raster.heights[ix * raster.nz + iz];
            if (Number.isFinite(v) && v > max) max = v;
        }
    }
    return Number.isFinite(max) ? max : null;
}

/** Die kleinste Höhe des Rasters in einer XZ-Hülle — Gegenstück zu `_hoechsteIn` (ein Damm reicht nach unten). */
function _tiefsteIn(raster, h) {
    let min = Infinity;
    const a = _zellbereich(raster, h);
    for (let ix = a.ix0; ix <= a.ix1; ix++) {
        for (let iz = a.iz0; iz <= a.iz1; iz++) {
            const v = raster.heights[ix * raster.nz + iz];
            if (Number.isFinite(v) && v < min) min = v;
        }
    }
    return Number.isFinite(min) ? min : null;
}

/**
 * Der Wirkbereich EINER Operation, in Weltkoordinaten.
 * @returns {{minX,maxX,minZ,maxZ}|null}  null = nicht eingrenzbar (alles)
 */
export function wirkbereichVon(raster, art, parameter = {}) {
    const p = parameter ?? {};
    let huelle = null;
    let rand = RAND_MINDEST_M;

    if (art === 'gerinne') {
        huelle = _huelleXZ(p.achse);
        if (!huelle) return null;
        const neigung = Math.max(0, Number(p.boeschung) || 0);
        const breite = Math.max(0, Number(p.sohlbreite) || 0) / 2;
        const oben = _hoechsteIn(raster, huelle);
        const sohle = Math.min(Number(p.sohleAnfang), Number(p.sohleEnde));
        const tiefe = (Number.isFinite(oben) && Number.isFinite(sohle)) ? Math.max(0, oben - sohle) : 0;
        rand += breite + tiefe * neigung;
    } else if (art === 'planum' || art === 'boeschung') {
        huelle = _huelleXZ(p.umriss);
        if (!huelle) return null;
        const neigung = Math.max(0, Number(p.neigung) || 0);
        const oben = _hoechsteIn(raster, huelle);
        const unten = _tiefsteIn(raster, huelle);
        const ziel = Number(p.hoehe);
        // Nach OBEN (Einschnitt) wie nach UNTEN (Damm) — bis Teil XX zählte
        // nur der höchste Punkt, und ein Damm lief über den Bereich hinaus.
        const spanne = Number.isFinite(ziel)
            ? Math.max(Number.isFinite(oben) ? Math.abs(oben - ziel) : 0, Number.isFinite(unten) ? Math.abs(ziel - unten) : 0)
            : 0;
        // Ein Planum ohne Böschung endet am Umriss; mit Böschung läuft es aus.
        rand += (art === 'boeschung' || neigung > 0) ? spanne * neigung : 0;
    } else if (art === 'grube' || art === 'schuettung') {
        // Nach INNEN: nichts ragt über den Umriss hinaus.
        huelle = _huelleXZ(p.umriss);
        if (!huelle) return null;
    } else if (art === 'boeschungLinie') {
        huelle = _huelleXZ(p.linie);
        if (!huelle) return null;
        const neigung = Math.max(0.1, Number(p.neigung) || 0);
        const umher = { minX: huelle.minX - RAND_MINDEST_M, maxX: huelle.maxX + RAND_MINDEST_M,
                        minZ: huelle.minZ - RAND_MINDEST_M, maxZ: huelle.maxZ + RAND_MINDEST_M };
        const oben = _hoechsteIn(raster, umher), unten = _tiefsteIn(raster, umher);
        const ys = (p.linie ?? []).map(q => (Array.isArray(q) ? q[1] : q?.y)).filter(Number.isFinite);
        const kMin = ys.length ? Math.min(...ys) : null, kMax = ys.length ? Math.max(...ys) : null;
        const spanne = Number.isFinite(kMin)
            ? Math.max(0, Number.isFinite(oben) ? oben - kMin : 0, Number.isFinite(unten) ? kMax - unten : 0)
            : 0;
        rand += spanne * neigung;
    } else if (art === 'baugrube') {
        const m = p.mitte ? _xz(p.mitte) : null;
        if (!m || !Number.isFinite(m.x)) return null;
        const halb = Math.max(
            Number(p.radius) || 0,
            (Number(p.laenge) || 0) / 2,
            (Number(p.breite) || 0) / 2,
        );
        // Gedreht: die Diagonale ist die sichere Schranke.
        const d = halb * Math.SQRT2;
        huelle = { minX: m.x - d, maxX: m.x + d, minZ: m.z - d, maxZ: m.z + d };
        const neigung = Math.max(0, Number(p.neigung) || 0);
        const oben = _hoechsteIn(raster, huelle);
        const sohle = Number(p.sohle);
        const tiefe = (Number.isFinite(oben) && Number.isFinite(sohle)) ? Math.max(0, oben - sohle) : 0;
        rand += tiefe * neigung;
    } else {
        return null;
    }
    return {
        minX: huelle.minX - rand, maxX: huelle.maxX + rand,
        minZ: huelle.minZ - rand, maxZ: huelle.maxZ + rand,
    };
}

/** Indexgrenzen zu einer Weltausdehnung — geklemmt aufs Raster. */
function _zellbereich(raster, bereich) {
    const { nx, nz, x0, z0, cell } = raster;
    if (!bereich) return { ix0: 0, ix1: nx - 1, iz0: 0, iz1: nz - 1 };
    const klemme = (v, hoch) => Math.max(0, Math.min(hoch, v));
    return {
        ix0: klemme(Math.floor((bereich.minX - x0) / cell), nx - 1),
        ix1: klemme(Math.ceil((bereich.maxX - x0) / cell), nx - 1),
        iz0: klemme(Math.floor((bereich.minZ - z0) / cell), nz - 1),
        iz1: klemme(Math.ceil((bereich.maxZ - z0) / cell), nz - 1),
    };
}

/**
 * Hat die Operation den Rand ihres Bereichs erreicht? Dann wurde
 * abgeschnitten — und das muss gesagt werden, nicht gehofft.
 */
function _randBeruehrt(vorher, nachher, a, eps = 0.01) {
    const { nx, nz } = nachher;
    const pruefe = (ix, iz) => {
        const i = ix * nz + iz;
        const v = vorher.heights[i], n = nachher.heights[i];
        return Number.isFinite(v) && Number.isFinite(n) && Math.abs(n - v) > eps;
    };
    // Eine Seite, die auf dem RASTERRAND liegt, kann nichts abschneiden —
    // dahinter gibt es keine Zellen (Teil XX: eine Böschung am Rand des DGM
    // meldete sonst „zu klein", obwohl alles gerechnet war).
    const unten = a.iz0 > 0, oben = a.iz1 < nz - 1, links = a.ix0 > 0, rechts = a.ix1 < nx - 1;
    for (let ix = a.ix0; ix <= a.ix1; ix++) if ((unten && pruefe(ix, a.iz0)) || (oben && pruefe(ix, a.iz1))) return true;
    for (let iz = a.iz0; iz <= a.iz1; iz++) if ((links && pruefe(a.ix0, iz)) || (rechts && pruefe(a.ix1, iz))) return true;
    return false;
}

export const GELAENDE_OPS = Object.freeze({
    gerinne:   { titel: 'Gerinne einschneiden', wende: gerinne },
    planum:    { titel: 'Planum herstellen',    wende: planum },
    boeschung: { titel: 'Böschung anschliessen', wende: boeschung },
    baugrube:  { titel: 'Baugrube ausheben',    wende: baugrube },
    // Teil XX: Umriss bzw. Kante AUF dem Gelände, Böschung nach innen bzw. zur Seite.
    grube:          { titel: 'Ausheben',            wende: grube },
    schuettung:     { titel: 'Auffüllen',           wende: schuettung },
    boeschungLinie: { titel: 'Böschung an Kante',   wende: boeschungLinie },
});

/**
 * Eine Operationsliste (Journalstand) auf das gelieferte Raster anwenden —
 * in Reihenfolge, gesammelte Warnungen, unbekannte Arten werden gemeldet
 * statt verschluckt.
 */
/**
 * Operationsliste in einen anderen Welt-Rahmen heben (Rahmen-Nachführung,
 * Teil XIII/⑤). Achse und Umriss sind Grundriss-Punkte {x,z}; Sohlen und
 * Höhen sind m NN und hängen NICHT am Rahmen — sie bleiben stehen.
 * Hier, weil die Op-Parameter hier definiert sind; Rezept UND Ableitung
 * rufen dieselbe Funktion (ein Weg).
 */
export function verschiebeOperationen(operationen, delta) {
    if (!Array.isArray(operationen)) return operationen;
    const punktXZ = (p) => (p && Number.isFinite(p.x) && Number.isFinite(p.z)
        ? { ...p, x: p.x + delta.x, z: p.z + delta.z } : p);
    return operationen.map(op => ({
        ...op,
        parameter: {
            ...op.parameter,
            ...(Array.isArray(op.parameter?.achse) ? { achse: op.parameter.achse.map(punktXZ) } : {}),
            ...(Array.isArray(op.parameter?.umriss) ? { umriss: op.parameter.umriss.map(punktXZ) } : {}),
            ...(Array.isArray(op.parameter?.linie) ? { linie: op.parameter.linie.map(punktXZ) } : {}),
            ...(op.parameter?.mitte ? { mitte: punktXZ(op.parameter.mitte) } : {}),
        },
    }));
}

/**
 * @param {object} [o]
 * @param {object} [o.ur]  das Ur-Gelände auf DEMSELBEN Raster — für „bis GOK"
 *                         (`schuettung`). Vorgabe: das Raster, mit dem die
 *                         Kette beginnt; wer auf einem schon gefalteten Stand
 *                         anfängt (Stapel), nennt es ausdrücklich.
 */
export function formeNach(raster, operationen = [], { bereich = null, ganzesRaster = false, ur = raster } = {}) {
    const warnungen = [];
    let stand = raster;
    for (const op of operationen) {
        const eintrag = GELAENDE_OPS[op?.art];
        if (!eintrag) { warnungen.push(`unbekannte_operation: ${op?.art ?? '—'}`); continue; }
        const p = op.parameter ?? {};
        // Der Wirkbereich wird je Operation GERECHNET, wenn ihn niemand
        // vorgibt (`ganzesRaster` schaltet ihn ab — für den Zweifelsfall).
        const b = ganzesRaster ? null : (bereich ?? wirkbereichVon(stand, op.art, p));
        const vor = stand;
        const r = eintrag.wende(stand, p, { bereich: b, ur });
        stand = r.raster;
        warnungen.push(...r.warnungen);
        // ABGESCHNITTEN? Wenn am Rand des Bereichs noch etwas passiert ist,
        // reichte er nicht — das darf nicht still bleiben.
        if (b && _randBeruehrt(vor, stand, _zellbereich(vor, b))) {
            warnungen.push(`wirkbereich_zu_klein: „${eintrag.titel}" wirkt bis an den Rand des gerechneten Bereichs`);
        }
    }
    return { raster: stand, warnungen };
}
