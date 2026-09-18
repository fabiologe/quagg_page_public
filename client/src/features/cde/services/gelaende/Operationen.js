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
import { nnAusWelt } from '../Hoehenbezug.js';
import { AUFLOCKERUNG, AUFLOCKERUNG_FELD, auflockerungOder } from './Grabenregeln.js';
import { regeltabelle } from '../regeln/Regelwerk.js';

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
            // `i`/`t` (Teilstrecke und Lage darin) braucht das Gerinne mit
            // STATIONEN: Sohle stückweise linear, Sohlbreite stückweise
            // konstant — beides hängt daran, WELCHE Teilstrecke es ist.
            bester = { abstand: r.abstand, quer: ueberstand > 0 ? r.quer : r.abstand, ueberstand, i, t: r.t };
            station = laenge + r.t * seg;
        }
        laenge += seg;
    }
    return bester ? { ...bester, station, laenge } : null;
}

/**
 * Die STATIONEN eines Gerinnes prüfen (Teil XXI, P2b) — oder null.
 *
 * Eine Station ist ein Punkt der Achse MIT seiner Sohlhöhe (`y`, Welt) und
 * der Sohlbreite der Teilstrecke, die dort BEGINNT. Damit folgt ein
 * Kanalgraben der Haltung: die Tiefe wechselt mit dem Gelände, die Breite
 * nach DIN EN 1610 Tabelle 2 — eine Stufenfunktion, kein Mittelwert.
 *
 * Fehlt einer Station die Breite, gilt die des Ganzen (`sohlbreite`).
 */
function _stationenAus(stationen, sohlbreite) {
    if (!Array.isArray(stationen) || stationen.length < 2) return null;
    const aus = [];
    for (const s of stationen) {
        const x = Number(s?.x), z = Number(s?.z), y = Number(s?.y);
        if (![x, y, z].every(Number.isFinite)) return null;
        const b = Number(s?.sohlbreite);
        aus.push({ x, y, z, sohlbreite: Number.isFinite(b) && b >= 0 ? b : Math.max(0, Number(sohlbreite) || 0) });
    }
    return aus;
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
 * STATIONEN (Teil XXI, P2b — Fabio: „Kanalgraben stimmt nicht mit
 * Geländeverlauf und Neigung der Haltung überein"). Bis dahin kannte diese
 * Operation nur zwei Sohlhöhen und EINE Sohlbreite; der Kanalgraben zerlegte
 * eine Haltung deshalb in ein Gerinne je Segment, und die Grabenbreite kam
 * aus der grössten Tiefe der beiden Segmentenden — über 60 m Haltung eine
 * Stufe zu viel oder zu wenig. Mit `stationen: [{x, y, z, sohlbreite}]`
 * läuft die Sohle stückweise linear durch die gelieferten Höhen und die
 * Breite stückweise konstant je Teilstrecke (DIN EN 1610 Tabelle 2 IST eine
 * Stufenfunktion). Die alte Form bleibt — Alt-Journale bauen unverändert.
 *
 * @returns {{raster, warnungen: string[]}}
 */
export function gerinne(raster, { achse, stationen, sohlbreite, boeschung = 1.5, sohleAnfang, sohleEnde } = {}, { bereich = null } = {}) {
    const warnungen = [];
    const st = _stationenAus(stationen, sohlbreite);
    const pfad = st ?? achse;
    if (!Array.isArray(pfad) || pfad.length < 2) return { raster, warnungen: ['gerinne_ohne_achse'] };
    if (!st && !Number.isFinite(sohleAnfang)) return { raster, warnungen: ['gerinne_ohne_sohle'] };
    const ende = Number.isFinite(sohleEnde) ? sohleEnde : sohleAnfang;
    const b2Fest = Math.max(0, (sohlbreite ?? 0) / 2);
    const n = Math.max(0, Number(boeschung) || 0);

    // Feiner als die Zelle wird es nicht: melden, nicht still vergröbern.
    const schmalste = st ? Math.min(...st.map(s => s.sohlbreite)) : Number(sohlbreite);
    if (schmalste > 0 && raster.cell > schmalste) {
        warnungen.push(`gerinne_feiner_als_zelle: Sohlbreite ${schmalste} m < Zellweite ${raster.cell.toFixed(2)} m`);
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
            const lage = _anAchse(k.x, k.z, pfad);
            if (!lage) continue;
            let sohle, b2;
            if (st) {
                // Stückweise linear zwischen den beiden Stationen der
                // Teilstrecke; die BREITE gehört der Teilstrecke, die dort
                // beginnt. Über die Enden hinaus gilt die Randstation.
                const a = st[lage.i], b = st[lage.i + 1];
                sohle = a.y + (b.y - a.y) * Math.min(1, Math.max(0, lage.t));
                b2 = a.sohlbreite / 2;
            } else {
                sohle = lage.laenge > 0
                    ? sohleAnfang + (ende - sohleAnfang) * (lage.station / lage.laenge)
                    : sohleAnfang;
                b2 = b2Fest;
            }
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
    let aushub = 0;
    let auftrag = 0;
    zellenIntegral(vorher, (i) => {
        const a = vorher.heights[i], b = nachher.heights[i];
        return (Number.isFinite(a) && Number.isFinite(b)) ? b - a : NaN;
    }, (dv) => { if (dv < 0) aushub -= dv; else auftrag += dv; });
    return { aushub, auftrag };
}

/**
 * DIE EINE ZELLFORMEL (Teil XXI, 2026-09-17).
 *
 * Je Zelle das Mittel der vier Eckwerte mal Zellfläche; eine Zelle zählt nur,
 * wenn alle vier Ecken einen Wert tragen. Die Formel stand zweimal im Code —
 * hier und in `_durchAuffuellung` des Ableitungslaufs, dort mit dem Kommentar
 * „dieselbe Zellformel wie `massenAus`". Zwei Abschriften derselben Regel
 * laufen beim ersten Sonderfall auseinander, und dann stünden zwei Massen
 * nebeneinander, deren Differenz nichts bedeutet.
 *
 * @param {object} raster           gibt nx, nz und cell
 * @param {(i: number) => number} wertAn   der Knotenwert (NaN = keine Auskunft)
 * @param {(dv: number) => void} nimm      je gültiger Zelle ihr Volumen (m³, vorzeichenbehaftet)
 */
export function zellenIntegral(raster, wertAn, nimm) {
    const { nx, nz, cell } = raster;
    const flaeche = cell * cell;
    for (let ix = 0; ix + 1 < nx; ix++) {
        for (let iz = 0; iz + 1 < nz; iz++) {
            let summe = 0;
            let gueltig = true;
            for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
                const w = wertAn((ix + dx) * nz + (iz + dz));
                if (!Number.isFinite(w)) { gueltig = false; break; }
                summe += w;
            }
            if (gueltig) nimm((summe / 4) * flaeche);
        }
    }
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
 *
 * Wie weit eine Operation reicht, weiss die Operation selbst (Teil XXIII, A2):
 * ihr Eintrag in `GELAENDE_OPS` liefert Hülle und Saum, hier kommt nur der
 * Mindestrand dazu. Bis dahin stand an dieser Stelle eine Kette `art ===
 * 'gerinne' … else if …` — und dieselbe Kette noch fünfmal woanders.
 *
 * @param {object} [o.ops]  die Registry (Vorgabe `GELAENDE_OPS`) — ein Test
 *                          kann eine eigene hereinreichen
 * @returns {{minX,maxX,minZ,maxZ}|null}  null = nicht eingrenzbar (alles)
 */
export function wirkbereichVon(raster, art, parameter = {}, { ops = GELAENDE_OPS } = {}) {
    const w = ops[art]?.wirkbereich?.(raster, parameter ?? {});
    if (!w?.huelle) return null;
    const rand = RAND_MINDEST_M + Math.max(0, w.saum ?? 0);
    return {
        minX: w.huelle.minX - rand, maxX: w.huelle.maxX + rand,
        minZ: w.huelle.minZ - rand, maxZ: w.huelle.maxZ + rand,
    };
}

// ── Wie fein muss gerechnet werden? (Teil XXI, 2026-09-17) ──────────────────
//
// FABIOS BEFUND: „Gräben können zig Meter lang werden — dort braucht es ein
// smartes Handling." Bis hierher gab es DREI Regeln für dieselbe Frage:
//   - der Erdbau-Korridor rechnete `max(0,5; sqrt(Hüllfläche / Budget))`,
//   - der Kanalgraben nahm FEST 0,5 m ohne jedes Budget,
//   - die Anzeige-Flicken zählten grobe Zellen unter den Wirkbereichen.
// Drei Formeln, ein Ergebnis — und sie stimmten nur zufällig überein. Seit
// Teil XXI müssen sie es aber: Erdkörper und Geländeanzeige sind DIESELBE
// Fläche, und das sind sie nur, wenn beide dasselbe Gitter nehmen.
//
// ZWEI GRÖSSEN entscheiden, nicht eine:
//   FLÄCHE      wie viel Gelände die Operation wirklich anfasst. Für einen
//               langen, schmalen Graben ist das Länge × Breite — NICHT das
//               Hüllrechteck: ein diagonaler 300-m-Graben hat eine Hülle von
//               90.000 m², berührt aber 7.000. Genau daran wurde er grob.
//   KENNWEITE   das SCHMALSTE, was aufgelöst werden muss: die Sohlbreite
//               eines Gerinnes, die Breite einer Böschung. Drei Zellen quer
//               darüber sind das Mindeste, unter dem eine Form verschwindet.
//
// Das Budget ist die harte Schranke gegen Ausreisser. Gewinnt es gegen die
// Kennweite, sagt die Regel es (`knapp`) — die Operation meldet dann selbst
// `gerinne_feiner_als_zelle`.

/** So viele Zellen müssen quer über die schmalste Form liegen. */
export const ZELLEN_JE_KENNWEITE = 3;

const _laengeVon = (pts) => {
    let l = 0;
    for (let i = 0; i + 1 < (pts?.length ?? 0); i++) l += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z);
    return l;
};
/** Fläche eines Rings im Grundriss (Betrag) und sein Umfang. */
function _ringMass(punkte) {
    const p = (punkte ?? []).map(_xz).filter(q => Number.isFinite(q.x) && Number.isFinite(q.z));
    if (p.length < 3) return null;
    let a = 0, u = 0;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
        a += p[j].x * p[i].z - p[i].x * p[j].z;
        u += Math.hypot(p[i].x - p[j].x, p[i].z - p[j].z);
    }
    return { flaeche: Math.abs(a) / 2, umfang: u };
}

/**
 * Die Fläche, die eine Operation WIRKLICH anfasst (m²) — nicht ihr
 * Hüllrechteck. Ohne Angabe: die Fläche des Wirkbereichs (dieselbe Schranke
 * wie bisher).
 */
export function wirkflaecheVon(raster, art, parameter = {}, { ops = GELAENDE_OPS } = {}) {
    const p = parameter ?? {};
    const box = wirkbereichVon(raster, art, p, { ops });
    // Welche FORM die Fläche hat UND wo ihre Punkte stehen, sagt der Eintrag:
    // ein Streifen um eine Achse oder ein Ring mit Saum. Die beiden Formeln
    // bleiben hier — sie sind Geometrie, keine Eigenschaft einer Operation.
    // (Bis A2 las die Streifenformel die Achse fest aus `stationen`/`achse`/
    // `linie` und die Ringformel aus `umriss` — eine neue Operation mit
    // anderem Feldnamen fiele still aufs Hüllrechteck zurück.)
    const wf = ops[art]?.wirkflaeche ?? null;
    const form = wf?.form ?? null;
    const roh = typeof wf?.punkte === 'function' ? wf.punkte(p) : null;
    const ausBox = box ? Math.max(0, (box.maxX - box.minX) * (box.maxZ - box.minZ)) : null;
    const eng = (wert) => (ausBox == null ? wert : Math.min(ausBox, wert));
    if (form === 'streifen') {
        const pts = Array.isArray(roh) ? roh.map(_xz).filter(q => Number.isFinite(q.x) && Number.isFinite(q.z)) : null;
        const h = _huelleXZ(pts);
        if (!pts || pts.length < 2 || !box || !h) return ausBox;
        // DER SAUM, den der Wirkbereich um die Achse legt — er ist die halbe
        // Streifenbreite. Aus dem Unterschied Box zu Hülle gelesen, nicht aus
        // den Parametern nachgerechnet: die Formel steht schon in
        // `wirkbereichVon`, und zweimal dieselbe Rechnung laufen mit dem
        // ersten Sonderfall auseinander. Das funktioniert für JEDE Richtung —
        // ein diagonaler Graben hat eine fast quadratische Hülle, aber
        // denselben schmalen Streifen.
        const saum = Math.max(0, ((box.maxX - box.minX) - (h.maxX - h.minX)) / 2);
        const laenge = _laengeVon(pts);
        return eng(laenge * 2 * saum + Math.PI * saum * saum);   // Streifen plus die zwei Enden
    }
    if (form === 'ring') {
        const m = _ringMass(roh);
        if (!m || !box) return ausBox;
        // Der Ring selbst plus der Saum, den die Böschung nach aussen wirft.
        // Wie breit der Saum ist, sagt der Wirkbereich: er ist genau um ihn
        // grösser als die Hülle des Rings.
        const h = _huelleXZ(roh);
        const saum = h ? Math.max(0, (box.maxX - box.minX) - (h.maxX - h.minX)) / 2 : RAND_MINDEST_M;
        return eng(m.flaeche + m.umfang * Math.max(RAND_MINDEST_M, saum));
    }
    return ausBox;
}

/**
 * Das SCHMALSTE, was diese Operation auflösen muss (m) — oder null, wenn sie
 * keine feine Form hat (dann entscheidet allein die Fläche).
 */
export function kennweiteVon(raster, art, parameter = {}, { ops = GELAENDE_OPS } = {}) {
    const p = parameter ?? {};
    const neigung = Math.max(0, Number(p.boeschung ?? p.neigung) || 0);
    const box = wirkbereichVon(raster, art, p, { ops });
    const masse = (ops[art]?.kennweiten?.(raster, p, { box, neigung }) ?? [])
        .map(Number).filter(z => Number.isFinite(z) && z > 0);
    return masse.length ? Math.min(...masse) : null;
}

/**
 * DIE EINE FEINHEITSREGEL für alle, die ein feines Raster brauchen: der
 * Korridor der Erdkörper UND die Flicken der Anzeige.
 *
 * @param {object} raster   das grobe Ur-Raster (gibt `cell` und die Höhen)
 * @param {Array}  ops      die Operationen des Vorgangs (Welt)
 * @param {object} o
 * @param {number} o.zelle  die feinste erlaubte Zelle (`ERDBAU_ZELLE`)
 * @param {number} o.budget Höchstzahl feiner Zellen im Bereich
 * @returns {{k: number, cell: number, flaeche: number, kennweite: number|null, knapp: boolean}}
 *   `k` ist der GANZZAHLIGE Teiler der groben Zelle — nur so liegen feines
 *   und grobes Gitter aufeinander (Teil XXI, P1b).
 */
export function feinheitFuer(raster, ops = [], { zelle = 0.5, budget = 160000 } = {}) {
    const grob = Number(raster?.cell) || 1;
    if (!raster?.heights?.length || !ops.length) return feinheitAus({ grob, flaeche: 0, zelle, budget });
    let flaeche = 0;
    let kennweite = Infinity;
    for (const op of ops) {
        const f = wirkflaecheVon(raster, op?.art, op?.parameter ?? {});
        if (Number.isFinite(f)) flaeche += Math.max(0, f);
        const w = kennweiteVon(raster, op?.art, op?.parameter ?? {});
        if (Number.isFinite(w) && w > 0) kennweite = Math.min(kennweite, w);
    }
    return feinheitAus({ grob, flaeche, kennweite: Number.isFinite(kennweite) ? kennweite : null, zelle, budget });
}

/**
 * Dieselbe Rechnung für Aufrufer, die ihre Fläche und Kennweite SELBST
 * kennen — der Kanalgraben etwa fragt, BEVOR seine Operationen entstehen
 * (seine Sohlbreite hängt an der Tiefe, die Tiefe am Gelände).
 *
 * @returns {{k, cell, flaeche, kennweite, knapp}}
 */
export function feinheitAus({ grob = 1, flaeche = 0, kennweite = null, zelle = 0.5, budget = 160000 } = {}) {
    const g = Number(grob) || 1;
    if (!(flaeche > 0) || !(zelle > 0) || !(budget > 0)) {
        return { k: 1, cell: g, flaeche: 0, kennweite: null, ueberBudget: false };
    }
    const kMax = Math.max(1, Math.floor(g / zelle + 1e-9));
    // Was das BUDGET erlaubt: so viele Teilungen, dass `flaeche / cell²` unter
    // dem Budget bleibt. Das ist die Regel für die FLÄCHE.
    const ausBudget = Math.max(1, Math.floor(Math.sqrt(Math.max(1, budget) * g * g / flaeche)));
    // Was die FORM braucht: drei Zellen quer über die schmalste Stelle. Das
    // ist KEIN Deckel, sondern ein SCHUTZ — sonst verschwände ein 0,9 m
    // breiter Graben, nur weil er dreihundert Meter lang ist. Genau der Fall,
    // den Fabio nennt.
    const ausForm = kennweite > 0
        ? Math.max(1, Math.ceil(g / Math.max(zelle, kennweite / ZELLEN_JE_KENNWEITE) - 1e-9))
        : 1;
    const k = Math.max(1, Math.min(kMax, Math.max(ausBudget, ausForm)));
    return { k, cell: g / k, flaeche: +flaeche.toFixed(1),
             kennweite: kennweite > 0 ? +Number(kennweite).toFixed(3) : null,
             // Die Form hat das Budget überstimmt: mehr Zellen, als die Fläche
             // sich leisten wollte — bewusst, damit die Form überhaupt entsteht.
             ueberBudget: ausForm > ausBudget && ausForm <= kMax };
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

// ═══ DIE REGISTRY — alles, was eine Geländeoperation ausmacht (Teil XXIII, A2) ═══
//
// Bis hierher wusste ein Eintrag nur `titel` und `wende`. Alles andere stand
// in sechs Verzweigungen über `art`, verteilt auf vier Dateien: Wirkbereich,
// Wirkfläche und Kennweite hier, Vorschau und IFC-Typ in den Ableitungen, die
// ebenen Kennhöhen bei den Böschungskanten, der innere Ring bei den
// Innenecken. Eine neue Operation hiess: sieben Stellen finden. Gezählt am
// 2026-09-18: 38 Verzweigungen auf Op-Namen (Architektur-Wächter, W2).
//
// Jetzt steht alles am Eintrag. Die Leser fragen den Eintrag, nie den Namen:
//
//   wende(raster, p, {bereich, ur})   die Operation selbst
//   wirkbereich(raster, p)            → {huelle, saum}: wie weit sie reicht
//   wirkflaeche                       {form: 'streifen'|'ring', punkte(p)} — Form und Lage der berührten Fläche
//   kennweiten(raster, p, {box, neigung}) → Kandidaten fürs schmalste Mass
//   hoehenfelder / punktfelder        welche Parameter m NN tragen (einzeln / je Punkt)
//   kennhoehen(p)                     → [{art, hoehe}]: ebene Kanten, die sie herstellt
//   innen                             {feld, titel, richtung, gilt(p)}: ihr innerer Ring
//   cutTyp / fillTyp(p)               der IFC-PredefinedType, den sie beisteuert
//   profilfaehig                      ob ein Profilkörper sie exakt nachbauen kann
//   vorschau(op, c)                   ihr Geist vor dem Übernehmen (Hilfen in `c`)
//
// Die Vorschau bekommt ihre Zeichenhilfen HEREINGEREICHT (`c.hilfen`): sie
// wohnen in den Ableitungen, und ein Import von dort wäre ein Griff nach oben.

/** Die Hülle eines Umrisses mit dem Saum, den eine Böschung zur Zielhöhe wirft. */
function _wbUmrissZuZiel(raster, p) {
    const huelle = _huelleXZ(p.umriss);
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
    // Ohne Böschung endet die Fläche am Umriss (Saum null); mit Böschung läuft sie aus.
    return { huelle, saum: spanne * neigung };
}

/** Nach INNEN: nichts ragt über den Umriss hinaus. */
function _wbUmrissInnen(raster, p) {
    const huelle = _huelleXZ(p.umriss);
    return huelle ? { huelle, saum: 0 } : null;
}

/** Stationen, wenn es sie gibt (Teil XXI) — sonst null. */
const _stationenVon = (p) => (Array.isArray(p.stationen) && p.stationen.length >= 2 ? p.stationen : null);
/** Die tiefste Sohle eines Gerinnes: über die Stationen oder die beiden Enden. */
const _gerinneSohle = (p, st) => (st
    ? Math.min(...st.map(s => Number(s?.y)).filter(Number.isFinite))
    : Math.min(Number(p.sohleAnfang), Number(p.sohleEnde)));

/** Die Kennweite einer Umriss-Operation: wie weit ihre Böschung höchstens ausläuft. */
function _kwUmriss(raster, p, { neigung }) {
    const h = _huelleXZ(p.umriss);
    const oben = h ? _hoechsteIn(raster, h) : null;
    const unten = h ? _tiefsteIn(raster, h) : null;
    const ziel = Number(p.sohle ?? p.hoehe);
    if (!(neigung > 0) || !Number.isFinite(ziel)) return [];
    return [Math.max(Number.isFinite(oben) ? Math.abs(oben - ziel) : 0,
                     Number.isFinite(unten) ? Math.abs(ziel - unten) : 0) * neigung];
}

/**
 * Die Vorschau eines Rings (Grube, Schüttung): der gezeichnete Rand liegt AUF
 * dem Gelände (Punkthöhen), der innere Ring auf Sohle bzw. Zielhöhe.
 * @returns {null|{ring, randMittel, n, innenGrat(hoehe)}}
 */
function _ringVorschau(op, c) {
    const q = op.parameter ?? {};
    const ring = (q.umriss ?? []).map(p => ({ x: Number(p.x), y: Number(p.y), z: Number(p.z) }))
        .filter(p => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z));
    if (ring.length < 3) return null;
    const randMittel = ring.reduce((a, p) => a + p.y, 0) / ring.length;
    const n = Number(q.neigung) > 0 ? Number(q.neigung) : 0;
    c.primitive.push({ art: 'umriss', ring, farbe: c.farbe });
    // Der INNERE Ring Ecke für Ecke (Teil XXII, `Innenecken`): dieselbe
    // Regel wie die Rechnung, und genau dort sitzen die Griffe von „Ecken
    // ziehen". Je Ecke die Gratlinie von oben nach innen — sie zeigt, welche
    // Ecken zusammengehören.
    const innenGrat = (hoehe) => {
        const ecken = c.hilfen.innenEcken(op);
        if (!ecken || ecken.some(e => !e)) return null;
        c.primitive.push({ art: 'umriss', ring: ecken.map(e => ({ x: e.x, y: hoehe, z: e.z })), farbe: c.farbe });
        ecken.forEach((e, k) => c.primitive.push({ art: 'linie', gestrichelt: true, farbe: c.farbe,
            punkte: [{ x: ring[k].x, y: ring[k].y, z: ring[k].z }, { x: e.x, y: hoehe, z: e.z }] }));
        return ecken;
    };
    return { ring, randMittel, n, innenGrat };
}

/** Ohne Ecken-Grat: der eingerückte Ring als Näherung — kippt er, entfällt er. */
function _innenNaeherung(c, v, d, hoehe) {
    const innen = v.n ? c.hilfen.innenring(v.ring, Math.max(0, d) * v.n) : v.ring;
    if (innen) c.primitive.push({ art: 'umriss', ring: innen.map(p => ({ x: p.x, y: hoehe, z: p.z })), farbe: c.farbe });
}

/** Die Wirkfläche eines Rings: der Umriss, plus der Saum der Böschung. */
const _RING_UMRISS = Object.freeze({ form: 'ring', punkte: (p) => p.umriss });

// ── Das WERKZEUG einer Operation (Teil XXIII, A6) ───────────────────────────
//
// Ein Geländewerkzeug ist Muster (Zug oder Umriss — aus `wirkflaeche.form`) +
// diese Operation + ihre Felder. `Bearbeitungen.formwerkzeugFuer` baut daraus
// das Werkzeug; hier steht nur, was die Operation weiss: welche Felder, was
// vorbelegt ist und wie aus Werten und gezeichnetem Zug ihre Parameter werden
// (`ausEingabe` → `{ops, titel, auflockerung?}` oder null). Eine neue
// Operation bekommt ihr Werkzeug ohne Zeile in `Bearbeitungen.js`.

/**
 * Die Punkte eines Umrisses bzw. einer Kante MIT Höhe in m NN (Teil XX), um
 * `zusatz` gehoben. Die Höhen kommen aus dem Sampler (`hoehenAus:
 * 'gelaende'`); fehlt sie an EINEM Punkt (ausserhalb des Geländes), gibt es
 * keine Rand- oder Kantenhöhe — dann lieber nichts als geraten.
 */
export function punkteInNn(zug, versatz, zusatz = 0) {
    const aus = [];
    for (const p of zug ?? []) {
        const y = Number(p?.y);
        if (!Number.isFinite(y)) return null;
        // RANDHÖHE ALS VERWEIS (Teil XXIII, A7, Befund S3): `gelaende` sagt
        // „Gelände VOR diesem Vorgang + so viel" — die Ableitung tastet neu ab,
        // wenn ein Vorgänger das Gelände ändert (`aufGelaende`). `y` bleibt als
        // Rückfall: ein Client, der `gelaende` nicht kennt, rechnet wie bisher.
        aus.push({ x: Number(p.x) || 0, y: Math.round((nnAusWelt(y, versatz) + zusatz) * 1000) / 1000, z: Number(p.z) || 0,
                   gelaende: zusatz });
    }
    return aus;
}

/**
 * Punkte, die ihre Höhe vom Gelände nehmen (`gelaende`), auf das Gelände VOR
 * diesem Vorgang setzen — in WELT, nach `_opsInWelt`. Nicht aus dem eigenen
 * Ergebnis (Teil XX A1: Idempotenz): das Gelände davor ändert die eigene
 * Operation nicht. Wo es nichts gibt (ausserhalb), bleibt die gespeicherte Höhe.
 * @param {(x:number, z:number) => number|null} hoeheAn  Welt-Höhe des Geländes davor
 */
export function aufGelaende(operationen, hoeheAn, { ops = GELAENDE_OPS } = {}) {
    if (typeof hoeheAn !== 'function') return operationen;
    return (operationen ?? []).map((op) => {
        const felder = ops[op?.art]?.punktfelder ?? [];
        let p = op.parameter;
        for (const f of felder) {
            if (!Array.isArray(p?.[f]) || !p[f].some(q => Number.isFinite(q?.gelaende))) continue;
            p = { ...p, [f]: p[f].map((q) => {
                if (!Number.isFinite(q?.gelaende)) return q;
                const h = hoeheAn(q.x, q.z);
                return Number.isFinite(h) ? { ...q, y: h + q.gelaende } : q;
            }) };
        }
        return p === op.parameter ? op : { ...op, parameter: p };
    });
}
const _mittelY = (punkte) => punkte.reduce((a, p) => a + p.y, 0) / punkte.length;
const _neigungOderNull = (w) => { const n = Number(w); return Number.isFinite(n) && n > 0 ? n : null; };

export const GELAENDE_OPS = Object.freeze({
    gerinne: {
        titel: 'Gerinne einschneiden', wende: gerinne,
        /**
         * Gerinne einschneiden (Stufe 15) — die erste Geländeoperation. Die
         * Achse wird gezeichnet, Sohlhöhen sind ABSOLUTE NN-Werte, die
         * Operation ist schneidend und damit idempotent.
         */
        werkzeug: {
            id: 'gerinne-einschneiden', titel: 'Gerinne einschneiden', icon: 'gerinne', rang: 1,
            felder: [
                { name: 'sohleAnfang', titel: 'Sohle am Anfang', einheit: 'm NN', typ: 'zahl' },
                { name: 'sohleEnde', titel: 'Sohle am Ende', einheit: 'm NN', typ: 'zahl', leerErlaubt: true },
                { name: 'sohlbreite', titel: 'Sohlbreite', einheit: 'm', typ: 'zahl', vorgabe: 1 },
                { name: 'boeschung', titel: 'Böschung 1 : n', typ: 'zahl', vorgabe: 1.5 },
            ],
            vorbelegung: () => ({ sohlbreite: 1, boeschung: 1.5 }),
            // Teil XIV: der Zug liegt AUF dem Gelände — die Sohlen werden daraus
            // vorbelegt (1 m unter Gelände).
            nachZug: (zug, { versatz }) => {
                const a = zug?.[0]?.y, e = zug?.[zug.length - 1]?.y;
                const nn = (y) => Math.round((nnAusWelt(y, versatz) - 1.0) * 100) / 100;
                return {
                    ...(Number.isFinite(a) ? { sohleAnfang: nn(a) } : {}),
                    ...(Number.isFinite(e) ? { sohleEnde: nn(e) } : {}),
                };
            },
            ausEingabe: (werte, zug) => {
                if (!Number.isFinite(Number(werte?.sohleAnfang))) return null;
                return { titel: 'Gerinne', ops: [{ art: 'gerinne', parameter: {
                    achse: zug.map(p => ({ x: Number(p.x) || 0, z: Number(p.z) || 0 })),
                    sohlbreite: Number(werte.sohlbreite) || 0,
                    boeschung: Number(werte.boeschung) || 1.5,
                    sohleAnfang: Number(werte.sohleAnfang),
                    sohleEnde: Number.isFinite(Number(werte.sohleEnde)) ? Number(werte.sohleEnde) : Number(werte.sohleAnfang),
                } }] };
            },
        },
        hoehenfelder: ['sohleAnfang', 'sohleEnde'],
        // Teil XXI: ein Gerinne darf seine Sohle stationsweise tragen — auch
        // die Stationen sind Punkte mit Höhe in m NN.
        punktfelder: ['stationen'],
        wirkbereich(raster, p) {
            // MIT STATIONEN (Teil XXI): die Achse sind die Stationen, die Breite
            // die GRÖSSTE und die Sohle die TIEFSTE — der Bereich muss alles
            // fassen, was die Operation berührt, sonst rechnet sie ausserhalb
            // ihres Korridors ins Leere.
            const st = _stationenVon(p);
            const huelle = _huelleXZ(st ?? p.achse);
            if (!huelle) return null;
            const neigung = Math.max(0, Number(p.boeschung) || 0);
            const breiten = st ? st.map(s => Number(s?.sohlbreite)).filter(Number.isFinite) : [];
            const breite = Math.max(0, breiten.length ? Math.max(...breiten) : (Number(p.sohlbreite) || 0)) / 2;
            const oben = _hoechsteIn(raster, huelle);
            const sohle = _gerinneSohle(p, st);
            const tiefe = (Number.isFinite(oben) && Number.isFinite(sohle)) ? Math.max(0, oben - sohle) : 0;
            return { huelle, saum: breite + tiefe * neigung };
        },
        wirkflaeche: { form: 'streifen', punkte: (p) => _stationenVon(p) ?? p.achse },
        kennweiten(raster, p, { neigung }) {
            const st = _stationenVon(p);
            const breiten = st ? st.map(s => Number(s?.sohlbreite)).filter(Number.isFinite) : [Number(p.sohlbreite)];
            const schmalste = breiten.filter(b => b > 0);
            const aus = schmalste.length ? [Math.min(...schmalste)] : [];
            const h = _huelleXZ(st ?? p.achse);
            const oben = h ? _hoechsteIn(raster, h) : null;
            const sohle = _gerinneSohle(p, st);
            if (Number.isFinite(oben) && Number.isFinite(sohle) && neigung > 0) aus.push((oben - sohle) * neigung);
            return aus;
        },
        kennhoehen: () => [],                    // keine ebene Fläche
        // Ein reines Gerinne ist ein Graben (TRENCH).
        cutTyp: 'TRENCH',
        // Ein Graben ist ein Trapez aus der Norm: der Profilkörper baut ihn exakt (Teil XXI, P6).
        profilfaehig: true,
        vorschau(op, c) {
            const q = op.parameter ?? {};
            const pts = c.hilfen.sohlPunkte(q.achse, Number(q.sohleAnfang), Number(q.sohleEnde));
            if (pts.length < 2 || !Number.isFinite(pts[0].y)) return;
            const tiefe = c.hilfen.tiefeUeber(c.hoeheAn, pts);
            c.primitive.push(...c.hilfen.grabenGeist(pts, { sohlbreite: Number(q.sohlbreite) || 1, boeschung: Number(q.boeschung) || 1.5, tiefe }, c.farbe));
            c.chips.push({ art: 'vorschau', text: `Gerinne · Sohle ${(pts[0].y + c.hoehenversatz).toFixed(2)} → ${(pts[pts.length - 1].y + c.hoehenversatz).toFixed(2)} m NN · bis ${tiefe.toFixed(1)} m tief` });
        },
    },
    planum: {
        titel: 'Planum herstellen', wende: planum,
        /**
         * Planum herstellen — Umriss zeichnen, Sollhöhe setzen; mit
         * Böschungsneigung schliesst gleich der Anschluss ans gewachsene
         * Gelände an (zwei Operationen, EIN Eintrag).
         */
        werkzeug: {
            id: 'planum-herstellen', titel: 'Planum herstellen', icon: 'planum', rang: 5,
            felder: [
                { name: 'hoehe', titel: 'Planumshöhe', einheit: 'm NN', typ: 'zahl' },
                { name: 'neigung', titel: 'Böschung 1 : n (leer = ohne Anschluss)', typ: 'zahl', leerErlaubt: true },
            ],
            vorbelegung: (el) => ({ hoehe: el?.bezugshoehe ?? null }),
            // Das Planum startet auf der MITTLEREN Geländehöhe des Umrisses —
            // wer tiefer will, tippt es; wer den Wert schon getippt hat, behält ihn.
            nachZug: (zug, { versatz }) => {
                const ys = (zug ?? []).map(p => p?.y).filter(Number.isFinite);
                if (!ys.length) return {};
                const mittel = ys.reduce((a, b) => a + b, 0) / ys.length;
                return { hoehe: Math.round(nnAusWelt(mittel, versatz) * 10) / 10 };
            },
            ausEingabe: (werte, zug) => {
                const hoehe = Number(werte?.hoehe);
                if (!Number.isFinite(hoehe)) return null;
                const umriss = zug.map(p => ({ x: Number(p.x) || 0, z: Number(p.z) || 0 }));
                const ops = [{ art: 'planum', parameter: { umriss, hoehe } }];
                const n = Number(werte?.neigung);
                if (Number.isFinite(n) && n > 0) ops.push({ art: 'boeschung', parameter: { umriss, hoehe, neigung: n } });
                return { titel: 'Planum', ops };
            },
        },
        hoehenfelder: ['hoehe'],
        wirkbereich: _wbUmrissZuZiel,
        wirkflaeche: _RING_UMRISS,
        kennweiten: _kwUmriss,
        // Ein Planum kann beides sein — es schneidet und schüttet; welche Kante
        // entsteht, entscheidet die Maske der Böschungskanten.
        kennhoehen: (p) => [{ art: 'sohlkante', hoehe: p.hoehe }, { art: 'kronenkante', hoehe: p.hoehe }],
        cutTyp: 'EXCAVATION',
        vorschau(op, c) {
            const q = op.parameter ?? {};
            const ring = (q.umriss ?? []).map(p => ({ x: Number(p.x), z: Number(p.z) })).filter(p => Number.isFinite(p.x) && Number.isFinite(p.z));
            const hoehe = Number(q.hoehe);
            if (ring.length < 3 || !Number.isFinite(hoehe)) return;
            // Die Platte reicht von der Sollhöhe bis zum höchsten Geländepunkt des Umrisses.
            let oben = hoehe;
            for (const p of ring) { const h = c.hoeheAn?.(p.x, p.z); if (Number.isFinite(h)) oben = Math.max(oben, h); }
            if (oben - hoehe < 0.05) oben = hoehe + 0.5;
            const ex = c.hilfen.extrudiere({ umriss: { ring, loecher: [] } }, { von: hoehe, bis: oben });
            if (ex.ergebnis) c.primitive.push({ art: 'geist', positions: ex.ergebnis.positions, triCount: ex.ergebnis.triCount, farbe: c.farbe, opacity: 0.3 });
            c.primitive.push({ art: 'umriss', ring: ring.map(p => ({ x: p.x, y: hoehe, z: p.z })), farbe: c.farbe });
            c.chips.push({ art: 'vorschau', text: `Planum ${(hoehe + c.hoehenversatz).toFixed(2)} m NN` });
        },
    },
    boeschung: {
        titel: 'Böschung anschliessen', wende: boeschung,
        hoehenfelder: ['hoehe'],
        wirkbereich: _wbUmrissZuZiel,
        wirkflaeche: _RING_UMRISS,
        kennweiten: _kwUmriss,
        kennhoehen: () => [],
        cutTyp: 'EXCAVATION',
        vorschau(op, c) {
            c.chips.push({ art: 'vorschau', text: `Böschung 1 : ${Number(op.parameter?.neigung) || 1.5} — Anschluss nach Übernehmen` });
        },
    },
    baugrube: {
        titel: 'Baugrube ausheben', wende: baugrube,
        hoehenfelder: ['sohle'],
        wirkbereich(raster, p) {
            const m = p.mitte ? _xz(p.mitte) : null;
            if (!m || !Number.isFinite(m.x)) return null;
            const halb = Math.max(
                Number(p.radius) || 0,
                (Number(p.laenge) || 0) / 2,
                (Number(p.breite) || 0) / 2,
            );
            // Gedreht: die Diagonale ist die sichere Schranke.
            const d = halb * Math.SQRT2;
            const huelle = { minX: m.x - d, maxX: m.x + d, minZ: m.z - d, maxZ: m.z + d };
            const neigung = Math.max(0, Number(p.neigung) || 0);
            const oben = _hoechsteIn(raster, huelle);
            const sohle = Number(p.sohle);
            const tiefe = (Number.isFinite(oben) && Number.isFinite(sohle)) ? Math.max(0, oben - sohle) : 0;
            return { huelle, saum: tiefe * neigung };
        },
        wirkflaeche: null,
        kennweiten(raster, p, { box, neigung }) {
            const aus = [Number(p.laenge), Number(p.breite), 2 * (Number(p.radius) || 0)];
            const oben = box ? _hoechsteIn(raster, box) : null;
            if (Number.isFinite(oben) && Number.isFinite(Number(p.sohle)) && neigung > 0) aus.push((oben - Number(p.sohle)) * neigung);
            return aus;
        },
        kennhoehen: (p) => [{ art: 'sohlkante', hoehe: p.sohle }],
        cutTyp: 'EXCAVATION',
    },
    // Teil XX: Umriss bzw. Kante AUF dem Gelände, Böschung nach innen bzw. zur Seite.
    grube: {
        titel: 'Ausheben', wende: grube,
        /**
         * AUSHEBEN (E1, Teil XX) — Umriss AUF dem Gelände zeichnen, Tiefe angeben.
         *
         * DER UMRISS IST DIE OBERKANTE (Teil XX, Fabio 2026-09-10): man tippt,
         * was man sieht — die Kante der Grube auf dem Gelände. Die Böschung
         * fällt nach INNEN bis zur Sohle (mittlere Randhöhe − Tiefe, absolut
         * gespeichert — die Tiefe ist die Eingabe, nicht der Zielzustand).
         *
         * DIE DATEN BLEIBEN. Nichts am gelieferten Gelände wird verändert oder
         * gelöscht: es wird ausgeblendet, und die Subtraktion entsteht als
         * EIGENES IFC-Element — `IfcEarthworksCut` (Gesetz 8, ISO 19650).
         */
        werkzeug: {
            id: 'graben-ausheben', titel: 'Ausheben', icon: 'ausheben', rang: 2,
            felder: [
                { name: 'mass', titel: 'Tiefe unter dem Rand', einheit: 'm', typ: 'zahl', min: 0.05, max: 60, vorgabe: 2 },
                { name: 'neigung', titel: 'Böschung 1 : n (leer = senkrecht)', typ: 'zahl', min: 0.1, max: 10, leerErlaubt: true },
                AUFLOCKERUNG_FELD,
            ],
            vorbelegung: () => ({ mass: 2, neigung: 1.5, auflockerung: regeltabelle('auflockerung', AUFLOCKERUNG).vorgabe }),
            ausEingabe: (werte, zug, { versatz }) => {
                const tiefe = Number(werte?.mass);
                if (!Number.isFinite(tiefe) || tiefe <= 0) return null;
                const umriss = punkteInNn(zug, versatz);
                if (!umriss) return null;
                return { titel: 'Ausheben', auflockerung: auflockerungOder(werte?.auflockerung), ops: [{ art: 'grube', parameter: {
                    umriss, sohle: Math.round((_mittelY(umriss) - tiefe) * 1000) / 1000, neigung: _neigungOderNull(werte?.neigung),
                } }] };
            },
        },
        hoehenfelder: ['sohle'],
        punktfelder: ['umriss'],
        wirkbereich: _wbUmrissInnen,
        wirkflaeche: _RING_UMRISS,
        kennweiten: _kwUmriss,
        kennhoehen: (p) => [{ art: 'sohlkante', hoehe: p.sohle }],
        // Der innere Ring ist die Sohlkante: jeder Randpunkt fällt mit 1:n auf die Sohle.
        innen: { feld: 'sohle', titel: 'Sohle', richtung: 1, gilt: (p) => Number.isFinite(Number(p.sohle)) },
        cutTyp: 'EXCAVATION',
        vorschau(op, c) {
            const v = _ringVorschau(op, c);
            if (!v) return;
            const sohle = Number(op.parameter?.sohle);
            if (!Number.isFinite(sohle)) return;
            if (!v.innenGrat(sohle)) _innenNaeherung(c, v, v.randMittel - sohle, sohle);
            c.chips.push({ art: 'vorschau', text: `Ausheben · Sohle ${(sohle + c.hoehenversatz).toFixed(2)} m NN · ${(v.randMittel - sohle).toFixed(2)} m unter dem Rand · ${v.n ? `Böschung 1 : ${v.n}` : 'senkrecht'}` });
        },
    },
    schuettung: {
        titel: 'Auffüllen', wende: schuettung,
        /**
         * AUFFÜLLEN (E1, Teil XX) — die umgedrehte Grube. Der Umriss ist der
         * BÖSCHUNGSFUSS auf dem Gelände; Ziel ist eine Höhe über der mittleren
         * Randhöhe — oder „bis GOK", das Ur-Gelände (Rückverfüllung). Wer die
         * KRONE zeichnen will, nimmt „Planum herstellen".
         */
        werkzeug: {
            id: 'auffuellen', titel: 'Auffüllen', icon: 'auffuellen', rang: 3,
            felder: [
                { name: 'ziel', titel: 'Ziel', typ: 'auswahl', optionen: [
                    { wert: 'hoehe', titel: 'Höhe über dem Rand' },
                    { wert: 'ur', titel: 'bis GOK — auf das gelieferte Gelände' },
                ] },
                { name: 'mass', titel: 'Höhe über dem Rand (bei Ziel Höhe)', einheit: 'm', typ: 'zahl', min: 0.05, max: 60, vorgabe: 1 },
                { name: 'neigung', titel: 'Böschung 1 : n (leer = senkrecht)', typ: 'zahl', min: 0.1, max: 10, leerErlaubt: true },
            ],
            vorbelegung: () => ({ ziel: 'hoehe', mass: 1, neigung: 1.5 }),
            ausEingabe: (werte, zug, { versatz }) => {
                const umriss = punkteInNn(zug, versatz);
                if (!umriss) return null;
                if (werte?.ziel === 'ur') {
                    return { titel: 'Auffüllen bis GOK', ops: [{ art: 'schuettung', parameter: { umriss, ziel: 'ur' } }] };
                }
                const mass = Number(werte?.mass);
                if (!Number.isFinite(mass) || mass <= 0) return null;
                return { titel: 'Auffüllen', ops: [{ art: 'schuettung', parameter: {
                    umriss, ziel: 'hoehe', hoehe: Math.round((_mittelY(umriss) + mass) * 1000) / 1000,
                    neigung: _neigungOderNull(werte?.neigung),
                } }] };
            },
        },
        hoehenfelder: ['hoehe'],
        punktfelder: ['umriss'],
        wirkbereich: _wbUmrissInnen,
        wirkflaeche: _RING_UMRISS,
        kennweiten: _kwUmriss,
        // „bis GOK" hat keine ebene Krone — sein Deckel ist das Ur-Gelände.
        kennhoehen: (p) => (p.ziel !== 'ur' ? [{ art: 'kronenkante', hoehe: p.hoehe }] : []),
        // Der innere Ring ist die Krone — nur bei einer Zielhöhe, nicht „bis GOK".
        innen: { feld: 'hoehe', titel: 'Krone', richtung: -1,
                 gilt: (p) => (p.ziel ?? 'hoehe') === 'hoehe' && Number.isFinite(Number(p.hoehe)) },
        cutTyp: 'EXCAVATION',
        // Eine Rückverfüllung bis GOK ist BACKFILL.
        fillTyp: (p) => (p?.ziel === 'ur' ? 'BACKFILL' : null),
        vorschau(op, c) {
            const v = _ringVorschau(op, c);
            if (!v) return;
            const q = op.parameter ?? {};
            if (q.ziel === 'ur') {
                c.chips.push({ art: 'vorschau', text: 'Auffüllen bis GOK — auf das Ur-Gelände, nur auffüllen' });
                return;
            }
            const hoehe = Number(q.hoehe);
            if (!Number.isFinite(hoehe)) return;
            if (!v.innenGrat(hoehe)) _innenNaeherung(c, v, hoehe - v.randMittel, hoehe);
            c.chips.push({ art: 'vorschau', text: `Auffüllen · ${(hoehe + c.hoehenversatz).toFixed(2)} m NN · ${(hoehe - v.randMittel).toFixed(2)} m über dem Rand · ${v.n ? `Böschung 1 : ${v.n}` : 'senkrecht'}` });
        },
    },
    boeschungLinie: {
        titel: 'Böschung an Kante', wende: boeschungLinie,
        /**
         * BÖSCHUNG AN EINER KANTE (E1, Teil XX) — eine OFFENE Linie mit Höhe je
         * Knick (Gelände + Kantenhöhe); auf der gewählten Seite läuft die
         * Böschung 1:n bis zum Gelände — Einschnitt oder Damm ergibt sich.
         */
        werkzeug: {
            id: 'boeschung-anschliessen', titel: 'Böschung an Kante', icon: 'boeschung', rang: 4,
            felder: [
                { name: 'kante', titel: 'Kantenhöhe über Gelände', einheit: 'm', typ: 'zahl', min: -30, max: 30, vorgabe: 1 },
                { name: 'seite', titel: 'Böschung auf der Seite', typ: 'auswahl', optionen: [
                    { wert: 'rechts', titel: 'rechts der Zeichenrichtung' },
                    { wert: 'links', titel: 'links der Zeichenrichtung' },
                ] },
                { name: 'neigung', titel: 'Böschung 1 : n', typ: 'zahl', min: 0.1, max: 10, vorgabe: 1.5 },
            ],
            vorbelegung: () => ({ kante: 1, seite: 'rechts', neigung: 1.5 }),
            ausEingabe: (werte, zug, { versatz }) => {
                const neigung = Number(werte?.neigung);
                if (!(neigung > 0)) return null;
                const kante = Number(werte?.kante);
                const linie = punkteInNn(zug, versatz, Number.isFinite(kante) ? kante : 0);
                if (!linie) return null;
                return { titel: 'Böschung', ops: [{ art: 'boeschungLinie', parameter: {
                    linie, seite: werte?.seite === 'links' ? 'links' : 'rechts', neigung,
                } }] };
            },
        },
        hoehenfelder: [],
        punktfelder: ['linie'],
        wirkbereich(raster, p) {
            const huelle = _huelleXZ(p.linie);
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
            return { huelle, saum: spanne * neigung };
        },
        wirkflaeche: { form: 'streifen', punkte: (p) => p.linie },
        kennweiten: (raster, p, { box, neigung }) => (box && neigung > 0
            ? [Math.min(box.maxX - box.minX, box.maxZ - box.minZ) / 2] : []),
        kennhoehen: () => [],
        cutTyp: 'EXCAVATION',
        // Eine Böschung an einer Kante ist SLOPEFILL („side slope fill").
        fillTyp: () => 'SLOPEFILL',
        vorschau(op, c) {
            const q = op.parameter ?? {};
            const pts = (q.linie ?? []).map(p => ({ x: Number(p.x), y: Number(p.y), z: Number(p.z) }))
                .filter(p => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z));
            if (pts.length < 2) return;
            const n = Number(q.neigung) || 1.5;
            c.primitive.push({ art: 'linie', punkte: pts, farbe: c.farbe });
            // Die SEITE sichtbar: eine gestrichelte Parallele zwei Meter daneben.
            c.primitive.push({ art: 'linie', punkte: c.hilfen.parallele(pts, q.seite === 'links' ? 2 : -2), farbe: c.farbe, gestrichelt: true });
            c.chips.push({ art: 'vorschau', text: `Böschung 1 : ${n} · ${q.seite === 'links' ? 'links' : 'rechts'} der Zeichenrichtung` });
        },
    },
});

/** Rangfolge der Füllungstypen: eine Rückverfüllung schlägt eine Kantenböschung. */
export const FILL_RANG = Object.freeze(['BACKFILL', 'SLOPEFILL']);

/**
 * Der IFC-PredefinedType eines Aushubs aus seinen Operationen: nur Gräben →
 * TRENCH, sonst EXCAVATION. Die Operation sagt, was sie beisteuert (`cutTyp`).
 */
export function cutTypAus(operationen = [], { ops = GELAENDE_OPS } = {}) {
    return (operationen ?? []).every(op => ops[op?.art]?.cutTyp === 'TRENCH') ? 'TRENCH' : 'EXCAVATION';
}

/** Der IFC-PredefinedType einer Füllung: der höchste Rang, den eine Operation nennt, sonst EMBANKMENT. */
export function fillTypAus(operationen = [], { ops = GELAENDE_OPS } = {}) {
    const typen = new Set((operationen ?? []).map(op => ops[op?.art]?.fillTyp?.(op?.parameter ?? {})).filter(Boolean));
    return FILL_RANG.find(t => typen.has(t)) ?? 'EMBANKMENT';
}

/**
 * Die PUNKTLISTEN einer Operationsliste — je Operation und Feld, in Reihenfolge.
 *
 * Wer Ecken zeigt (Griffe) oder zieht (Werkzeug), fragt hier — nicht eine
 * Tabelle, die er dafür kennen müsste. Welche Felder einer Operation
 * Punktlisten mit Höhe sind, weiss ihr Eintrag (`punktfelder`).
 * @returns {Array<{op: number, feld: string, punkte: Array}>}
 */
export function punktlistenVon(operationen = [], { ops = GELAENDE_OPS } = {}) {
    const aus = [];
    (operationen ?? []).forEach((op, j) => {
        for (const feld of ops[op?.art]?.punktfelder ?? []) {
            const punkte = op?.parameter?.[feld];
            if (Array.isArray(punkte)) aus.push({ op: j, feld, punkte });
        }
    });
    return aus;
}

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
            ...(Array.isArray(op.parameter?.stationen) ? { stationen: op.parameter.stationen.map(punktXZ) } : {}),
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
