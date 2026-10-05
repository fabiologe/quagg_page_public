/**
 * Geometrie-Bausteine der Rezepte (Teil XXIII, A4) — aus `Bauteilrezepte.js`
 * hierher gezogen, damit der Rezeptbau sie nutzen kann, ohne den Katalog zu
 * importieren (sonst ein Kreis: der Katalog baut sich aus dem Rezeptbau).
 *
 * Jede Funktion ist REIN: Punkte und Masse hinein, Geometrie heraus. Welcher
 * Baustein zu welchem Rezept gehört, sagt die Deklaration
 * (`geometrie.art`), nicht diese Datei.
 */
import * as THREE from 'three';
import { sweep, kreisProfil, rechteckProfil, platte, extrudiere, ringstueck, topf } from '../geometrie/hilfen.js';
// Default-Import wie in Bauteilrezepte (CJS-Interop im Build).
import polygonClipping from 'polygon-clipping';

/**
 * Anzeigebreite einer Linie in Metern.
 *
 * Eine Linie HAT keine Breite — das hier ist Darstellung, damit sie in der
 * Raumansicht überhaupt sichtbar ist (fragments zeichnet Netze, keine Striche).
 * Bewusst KEIN Parameter: wäre es einer, hielte ihn jemand für eine Bauteil-
 * breite und rechnete damit Massen. Der Lageplan zeichnet die Linie ohnehin
 * als echten Strich, ohne dieses Band.
 */
export const LINIEN_BAND_M = 0.06;

/** Ein Punkt aus dem Journal ist `[x, y, z]` — hier wird er three-tauglich. */
function alsVec3(p) {
    return new THREE.Vector3(Number(p?.[0]) || 0, Number(p?.[1]) || 0, Number(p?.[2]) || 0);
}

/** Punkte lesen und dabei aussortieren, was keiner ist. */
export function punkteAus(parameter) {
    const roh = parameter?.punkte;
    if (!Array.isArray(roh)) return [];
    return roh
        .filter(p => Array.isArray(p) && p.length >= 2 && p.every(v => Number.isFinite(Number(v))))
        .map(p => [Number(p[0]), Number(p[1] ?? 0), Number(p[2] ?? 0)]);
}

/**
 * Ein Band entlang einer Polylinie — die Darstellung einer Linie im Raum.
 *
 * Waagerecht gelegt, weil eine Trasse, Bruchkante oder Grenze von oben gelesen
 * wird. Je Abschnitt zwei Dreiecke; die Breite steht senkrecht auf dem
 * Abschnitt in der XZ-Ebene.
 */
export function bandGeometrie(punkte, breite = LINIEN_BAND_M) {
    if (punkte.length < 2) return null;
    const halb = breite / 2;
    const ecken = [];
    const indizes = [];

    for (let i = 0; i < punkte.length; i++) {
        const hier = alsVec3(punkte[i]);
        // Die Richtung am Punkt: gemittelt zwischen den anliegenden
        // Abschnitten, damit die Ecken nicht aufklaffen.
        const vor = i > 0 ? alsVec3(punkte[i - 1]) : null;
        const nach = i < punkte.length - 1 ? alsVec3(punkte[i + 1]) : null;
        const richtung = new THREE.Vector3();
        if (vor) richtung.add(new THREE.Vector3(hier.x - vor.x, 0, hier.z - vor.z).normalize());
        if (nach) richtung.add(new THREE.Vector3(nach.x - hier.x, 0, nach.z - hier.z).normalize());
        if (richtung.lengthSq() < 1e-12) richtung.set(1, 0, 0);
        richtung.normalize();
        // Senkrechte in der XZ-Ebene.
        const quer = new THREE.Vector3(-richtung.z, 0, richtung.x).multiplyScalar(halb);
        ecken.push(hier.x - quer.x, hier.y, hier.z - quer.z);
        ecken.push(hier.x + quer.x, hier.y, hier.z + quer.z);
    }

    for (let i = 0; i < punkte.length - 1; i++) {
        const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
        indizes.push(a, c, b, b, c, d);
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(ecken, 3));
    g.setIndex(indizes);
    g.computeVertexNormals();
    return g;
}

/**
 * Ein waagerechtes Polygon — die Fläche.
 *
 * Trianguliert über `THREE.ShapeUtils`, das auch konkave Umrisse trägt; ein
 * eigener Ohrenschneider wäre eine vierte Kopie einer gelösten Aufgabe.
 * Die Höhe kommt aus dem Feld `hoehe`, nicht aus den Punkten: im Lageplan
 * klickt man in XZ, die Höhe ist eine Angabe.
 */
export function flaechenGeometrie(punkte) {
    if (punkte.length < 3) return null;
    // Trianguliert wird im GRUNDRISS (x/z) — die Höhe darf die Zerlegung nicht
    // beeinflussen, sonst zerfällt eine geneigte Fläche anders als dieselbe
    // waagerecht.
    const umriss = punkte.map(p => new THREE.Vector2(p[0], p[2]));
    const dreiecke = THREE.ShapeUtils.triangulateShape(umriss, []);
    if (!dreiecke.length) return null;

    // JEDER PUNKT BEHÄLT SEINE HÖHE. Hier stand eine feste `hoehe`, die der
    // Aufrufer immer als 0 übergab — die im Formular eingetragene Höhe steckt
    // längst in den Punkten (`alsRaumpunkte` backt sie in y). Eine auf 305 m
    // gezeichnete Fläche landete dadurch auf 0. Im Lageplan fiel es nicht auf,
    // weil der direkt aus dem Journal zeichnet und die Geometrie gar nicht
    // ansieht.
    const ecken = [];
    for (const p of punkte) ecken.push(p[0], p[1], p[2]);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(ecken, 3));
    g.setIndex(dreiecke.flat());
    g.computeVertexNormals();
    return g;
}

/**
 * Dreiecksliste (Welt) → BufferGeometry mit Normalen — INDIZIERT.
 *
 * DER INDEX IST PFLICHT, nicht Kosmetik. `representationFromGeometry` der
 * Bibliothek liest `geometry.index.array` ohne Prüfung
 * (`@thatopen/fragments/dist/index.mjs`); eine unindizierte Geometrie lässt
 * `createElements` mit „Cannot read properties of null (reading 'array')"
 * abbrechen. Der Fehler kommt aus dem Editor zurück und landet in
 * `misserfolge` — das Bauteil entsteht schlicht nicht, und im Raum fehlt es
 * ohne Meldung an der Oberfläche. Genau daran kam KEIN Erdkörper je an
 * (2026-09-09), während Linie und Fläche funktionierten: die beiden Bauer
 * darüber setzen ihren Index von sich aus.
 *
 * Der Index ist trivial (0,1,2,…) und schweisst NICHTS zusammen: die Ecken
 * bleiben je Dreieck eigen, damit `computeVertexNormals` flache Facetten
 * liefert. Ein Erdkörper mit gemittelten Normalen sähe an der Böschungskante
 * weich aus, wo eine Kante ist.
 */
export function dreiecksGeometrie(positions) {
    if (!positions?.length) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(positions), 3));
    const n = Math.floor(positions.length / 3);
    // Über 65.535 Ecken trägt ein Uint16-Index nicht mehr — ein Gelände hat
    // regelmässig Hunderttausende.
    const index = n > 65535 ? new Uint32Array(n) : new Uint16Array(n);
    for (let i = 0; i < n; i++) index[i] = i;
    geo.setIndex(new THREE.BufferAttribute(index, 1));
    geo.computeVertexNormals();
    return geo;
}


// ── Körper aus dem Kernel ──────────────────────────────────────────────────

/** Punkt aus dem Journal (`[x, y, z]` oder `{x, y, z}`) → `{x, y, z}`. */
export function punktXYZ(p) {
    if (Array.isArray(p)) return { x: p[0] ?? 0, y: p[1] ?? 0, z: p[2] ?? 0 };
    return { x: p?.x ?? 0, y: p?.y ?? 0, z: p?.z ?? 0 };
}

/**
 * Höhen LINEAR über die waagerechte Länge eines Zugs: der erste Punkt bekommt
 * `a`, der letzte `e`, die Zwischenpunkte folgen der Strecke (Stufe 14.12,
 * 17.3b — die Zwischenpunkte einer Haltung tragen keine eigene Höhenaussage).
 * Die EINE Regel für „Sohlhöhen festlegen", den Sohlzug im Längsschnitt und
 * das Zeichnen einer Trasse (Teil XXIV, K4).
 *
 * @param {Array} punkte  [[x,y,z]|{x,y,z}, …]
 * @returns {number[]}    eine Höhe je Punkt
 */
export function hoehenUeberLaenge(punkte, a, e) {
    const p = (punkte ?? []).map(punktXYZ);
    if (p.length < 2) return p.map(() => a);
    const abschnitt = [];
    let gesamt = 0;
    for (let i = 0; i + 1 < p.length; i++) {
        const d = Math.hypot(p[i + 1].x - p[i].x, p[i + 1].z - p[i].z);
        abschnitt.push(d);
        gesamt += d;
    }
    let gelaufen = 0;
    return p.map((_, i) => {
        if (i > 0) gelaufen += abschnitt[i - 1];
        const t = gesamt > 0 ? gelaufen / gesamt : (i / (p.length - 1));
        return a + (e - a) * t;
    });
}

/** Einheiten der Masse in einer Deklaration — geteilt wird, damit mm exakt bleibt. */
export const EINHEITEN = Object.freeze({ mm: 1000, cm: 100, m: 1 });

/**
 * Ein Mass aus den Parametern lesen: Feld nennt die Deklaration, fehlt der
 * Wert, gilt die Vorgabe des Feldes. In Metern.
 */
export function massAus(parameter, feld, { einheit = 'm', rueckfall = null } = {}) {
    const roh = Number(parameter?.[feld]) || Number(rueckfall) || 0;
    return roh / (EINHEITEN[einheit] ?? 1);
}

/**
 * Das Querschnittsprofil einer Deklaration — `{art: 'kreis', durchmesser,
 * einheit, ecken}` oder `{art: 'rechteck', breite, tiefe, einheit}`.
 * @param {(feld: string) => number|null} vorgabe  Rückfall je Feld (Formularvorgabe)
 * @returns {{punkte: [{u, v}]} | null}
 */
export function profilAus(dekl, parameter, vorgabe = () => null) {
    const einheit = dekl?.einheit ?? 'm';
    // DER VERSATZ (Teil XXV, V2): ein Profil muss nicht auf seiner Achse
    // sitzen. Ein Bordstein steht NEBEN der Linie, die man zeichnet, eine
    // Rinne darunter. Bis hierher war jedes Profil um den Ursprung zentriert,
    // und ein Rezept konnte das nicht sagen.
    const versetzt = (profil) => _versetze(
        profil,
        _ausDeklaration(dekl?.versatzU, parameter, vorgabe, einheit),
        _ausDeklaration(dekl?.versatzV, parameter, vorgabe, einheit));
    if (dekl?.art === 'kreis') {
        const d = massAus(parameter, dekl.durchmesser, { einheit, rueckfall: vorgabe(dekl.durchmesser) });
        return d > 0 ? versetzt(kreisProfil(d / 2, dekl.ecken ?? 12)) : null;
    }
    // EIN KREIS MIT WAND (BIMFY I2): ohne Wanddicke ein voller Kreis — so bleibt
    // jedes Rohr ohne Angabe bitgleich, wie es war.
    if (dekl?.art === 'kreisring') {
        const d = massAus(parameter, dekl.durchmesser, { einheit, rueckfall: vorgabe(dekl.durchmesser) });
        const t = massAus(parameter, dekl.wanddicke, { einheit, rueckfall: vorgabe(dekl.wanddicke) });
        if (!(d > 0)) return null;
        const ecken = dekl.ecken ?? 12;
        if (!(t > 0)) return versetzt(kreisProfil(d / 2, ecken));
        // Der Bezug ist fest ('innen' | 'aussen') oder der Name eines Feldes.
        const bezug = ['innen', 'aussen'].includes(dekl.bezug) ? dekl.bezug
            : (parameter?.[dekl.bezug] || vorgabe(dekl.bezug) || 'innen');
        const innen = bezug === 'aussen' ? d / 2 - t : d / 2;
        const aussen = bezug === 'aussen' ? d / 2 : d / 2 + t;
        if (!(innen > 0)) return null;
        const voll = versetzt(kreisProfil(aussen, ecken));
        return { ...voll, art: 'kreisring', loch: versetzt(kreisProfil(innen, ecken)) };
    }
    if (dekl?.art === 'rechteck') {
        const b = massAus(parameter, dekl.breite, { einheit, rueckfall: vorgabe(dekl.breite) });
        const t = massAus(parameter, dekl.tiefe, { einheit, rueckfall: vorgabe(dekl.tiefe) });
        return b > 0 && t > 0 ? versetzt(rechteckProfil(b, t)) : null;
    }
    // EIN FREI BESCHRIEBENES PROFIL (V2): Hochbord mit Fase, Eiprofil, Rinne.
    // Die Umlaufrichtung muss niemand beachten — `sweep` dreht sie sich hin.
    if (dekl?.art === 'polygon') {
        const p = _polygon(dekl.punkte, einheit);
        return p ? versetzt(p) : null;
    }
    return null;
}

/**
 * Ein Mass, das die DEKLARATION nennt: entweder eine feste Zahl in ihrer
 * Einheit oder der Name eines Feldes, dessen Wert aus den Parametern kommt.
 *
 * Anders als `massAus` kein `||`-Rückfall: ein Versatz von 0 ist eine
 * Aussage („sitzt doch auf der Achse"), kein fehlender Wert.
 */
function _ausDeklaration(roh, parameter, vorgabe, einheit) {
    const teiler = EINHEITEN[einheit] ?? 1;
    if (typeof roh === 'number') return Number.isFinite(roh) ? roh / teiler : 0;
    if (typeof roh !== 'string' || !roh) return 0;
    const wert = Number(parameter?.[roh]);
    if (Number.isFinite(wert)) return wert / teiler;
    const v = Number(vorgabe(roh));
    return Number.isFinite(v) ? v / teiler : 0;
}

/** Die Punkte eines Polygonprofils, in Metern — `[[u, v], …]` oder `[{u, v}, …]`. */
function _polygon(punkte, einheit) {
    const teiler = EINHEITEN[einheit] ?? 1;
    const aus = (Array.isArray(punkte) ? punkte : []).map((p) => {
        const u = Number(Array.isArray(p) ? p[0] : p?.u);
        const v = Number(Array.isArray(p) ? p[1] : p?.v);
        return (Number.isFinite(u) && Number.isFinite(v)) ? { u: u / teiler, v: v / teiler } : null;
    }).filter(Boolean);
    return aus.length >= 3 ? { punkte: aus, art: 'polygon' } : null;
}

/** Das Profil verschieben — die Achse bleibt, wo sie ist. */
function _versetze(profil, u, v) {
    if (!profil || (u === 0 && v === 0)) return profil;
    return { ...profil, punkte: profil.punkte.map(p => ({ u: p.u + u, v: p.v + v })) };
}

/** Ein Profil entlang der Punkte — geschlossen, mit Kappen. */
export function sweepKoerper(punkte, profil) {
    if (!Array.isArray(punkte) || punkte.length < 2 || !profil) return null;
    const { ergebnis } = sweep({ profil, achse: { punkte: punkte.map(punktXYZ) }, loch: profil.loch ?? null });
    return ergebnis ?? null;
}

/** Ein senkrechter Stab: vom ersten Punkt `laenge` Meter nach oben. */
export function stabKoerper(punkte, profil, laenge) {
    if (!Array.isArray(punkte) || !punkte.length || !(laenge > 0)) return null;
    const f = punktXYZ(punkte[0]);
    return sweepKoerper([f, { x: f.x, y: f.y + laenge, z: f.z }], profil);
}

/** Ein Umriss mit Dicke — der Umriss behält seine Punkthöhen. */
export function platteKoerper(punkte, dicke, richtung = 'unten') {
    if (!Array.isArray(punkte) || punkte.length < 3) return null;
    const { ergebnis } = platte({ umriss: { ring: punkte.map(punktXYZ) } }, { dicke, richtung });
    return ergebnis ?? null;
}

/** Der Rohrkörper als Kernel-Form `koerper` — null, wenn kein Körper entsteht. */
export function rohrKoerper(punkte, dnMm = 300, seiten = 12) {
    if (!Array.isArray(punkte) || punkte.length < 2) return null;
    const r = (Number(dnMm) || 300) / 2000;          // mm Durchmesser → m Radius
    if (!(r > 0)) return null;
    return sweepKoerper(punkte, kreisProfil(r, seiten));
}


// ── Muffen (BIMFY I8) ───────────────────────────────────────────────────────

/** Die Punkte der Achse zwischen den Stationen a und e (Meter ab dem ersten Punkt). */
function _achsstueck(xyz, a, e) {
    const aus = [];
    let s0 = 0;
    for (let i = 0; i + 1 < xyz.length; i++) {
        const p = xyz[i], q = xyz[i + 1];
        const l = Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z);
        const s1 = s0 + l;
        const bei = (s) => { const f = l > 0 ? (s - s0) / l : 0; return { x: p.x + f * (q.x - p.x), y: p.y + f * (q.y - p.y), z: p.z + f * (q.z - p.z) }; };
        if (s1 >= a && s0 <= e) {
            if (!aus.length) aus.push(bei(Math.max(a, s0)));
            if (s1 < e) aus.push(q);
            else { aus.push(bei(e)); break; }
        }
        s0 = s1;
    }
    return aus;
}

/**
 * Das Rohr MIT SEINEN MUFFEN: an jedem Stoss (alle `baulaenge` Meter ab dem
 * ersten Punkt) ein Ring von `innen` bis `aussen` (Durchmesser, m), `tiefe`
 * lang. Die Muffe zeigt gegen die Fliessrichtung — sie sitzt am oberen Ende
 * des Rohres, das am Stoss beginnt; die Punkte laufen vom Zulauf zum Ablauf.
 * Ohne Baulänge oder mit einer Muffe, die nicht über das Rohr ragt: das Rohr allein.
 */
export function rohrMitMuffen(rohr, punkte, { baulaenge, aussen, innen, tiefe } = {}, ecken = 12) {
    if (!rohr || !(baulaenge > 0) || !(tiefe > 0) || !(aussen > innen) || !(innen > 0)) return rohr;
    const xyz = punkte.map(punktXYZ);
    // Die Stationen der Knicke: eine Muffe bricht nicht um die Ecke (dort sässe
    // ein Formstück) — reicht sie über einen Knick, rückt sie hinter ihn.
    const knicke = [];
    let laenge = 0;
    for (let i = 0; i + 1 < xyz.length; i++) {
        laenge += Math.hypot(xyz[i + 1].x - xyz[i].x, xyz[i + 1].y - xyz[i].y, xyz[i + 1].z - xyz[i].z);
        if (i + 2 < xyz.length) knicke.push(laenge);
    }
    const ring = { ...kreisProfil(aussen / 2, ecken), loch: kreisProfil(innen / 2, ecken) };
    const muffen = [];
    for (let stoss = baulaenge; stoss < laenge - 1e-6; stoss += baulaenge) {
        let s = stoss;
        const knick = knicke.find(k => k > s + 1e-6 && k < s + tiefe - 1e-6);
        if (knick !== undefined) s = knick;
        const e = Math.min(s + tiefe, laenge);
        if (knicke.some(k => k > s + 1e-6 && k < e - 1e-6)) continue;   // Schenkel kürzer als die Muffe
        const stueck = _achsstueck(xyz, s, e);
        if (stueck.length >= 2) muffen.push(sweepKoerper(stueck, ring));
    }
    return muffen.length ? _vereinige([rohr, ...muffen]) : rohr;
}

/** Wie viele Stösse ein Rohr dieser Achse bei dieser Baulänge hat. */
export function stossZahl(punkte, baulaenge) {
    if (!(baulaenge > 0)) return 0;
    const xyz = punkte.map(punktXYZ);
    let laenge = 0;
    for (let i = 0; i + 1 < xyz.length; i++) laenge += Math.hypot(xyz[i + 1].x - xyz[i].x, xyz[i + 1].y - xyz[i].y, xyz[i + 1].z - xyz[i].z);
    return Math.max(0, Math.ceil(laenge / baulaenge - 1e-9) - 1);
}


// ── Schachtbauteile (BIMFY I2) ─────────────────────────────────────────────

/** Mehrere Körper zu einem — die Dreiecke hintereinander; geschlossen, wenn jeder es ist. */
function _vereinige(koerper) {
    const k = koerper.filter(Boolean);
    if (!k.length) return null;
    if (k.length === 1) return k[0];
    const n = k.reduce((a, b) => a + b.positions.length, 0);
    const positions = new Float64Array(n);
    let o = 0;
    for (const x of k) { positions.set(x.positions, o); o += x.positions.length; }
    return { positions, triCount: n / 9, closed: k.every(x => x.closed), volumen: k.reduce((a, b) => a + (b.volumen ?? 0), 0),
             warnungen: k.flatMap(x => x.warnungen ?? []) };
}

/**
 * Ein Ringstück um die Achse punkte[0] → punkte[1] (Welt, y oben). Masse als
 * DURCHMESSER in Metern: `aussen`/`innen` unten, `aussenOben`/`innenOben` oben
 * (0 = wie unten). `innen` = 0 heisst voll. `boden` schliesst unten (Topf),
 * `deckel` oben (Abdeckung) — jeweils eine Platte dieser Dicke INNERHALB der Höhe.
 */
export function ringstueckKoerper(punkte, { aussen, innen = 0, aussenOben = 0, innenOben = 0, boden = 0, deckel = 0,
                                            spitzende = 0, spitzendeHoehe = 0, muffe = 0, muffeTiefe = 0 } = {}, ecken = 32) {
    if (!Array.isArray(punkte) || punkte.length < 2 || !(aussen > 0)) return null;
    const u = punktXYZ(punkte[0]), o = punktXYZ(punkte[punkte.length - 1]);
    if (!(o.y > u.y)) return null;
    const raU = aussen / 2, raO = (aussenOben > 0 ? aussenOben : aussen) / 2;
    const riU = innen / 2, riO = (innenOben > 0 ? innenOben : innen) / 2;
    const h = o.y - u.y;
    const lerp = (a, b, y) => a + (b - a) * ((y - u.y) / h);
    const yB = u.y + Math.min(Math.max(0, boden), h), yD = o.y - Math.min(Math.max(0, deckel), h);
    // DER STOSS (BIMFY I8): das Spitzende ragt UNTER die Bauhöhe — es greift in
    // die Muffe des Teils darunter, die oben INNERHALB der Bauhöhe liegt. So
    // stehen die Teile mit ihren Bauhöhen aufeinander und greifen ineinander.
    const ySp = u.y - spitzendeHoehe;
    const sp = spitzende > 0 && spitzendeHoehe > 0 && spitzende / 2 > riU && spitzende / 2 < raU && !(boden > 0);
    const yMu = o.y - muffeTiefe;
    const mu = muffe > 0 && muffeTiefe > 0 && muffe / 2 > riO && muffe / 2 < raO && !(deckel > 0) && yMu > u.y;
    // Der Querschnitt gegen den Uhrzeigersinn in (r, y): aussen hoch, innen runter.
    const q = [];
    if (riU > 0 && boden > 0) q.push({ r: 0, y: u.y });
    else if (sp) q.push({ r: riU, y: ySp }, { r: spitzende / 2, y: ySp }, { r: spitzende / 2, y: u.y });
    else q.push({ r: riU, y: u.y });
    q.push({ r: raU, y: u.y });
    q.push({ r: raO, y: o.y });
    if (riO > 0 && deckel > 0) q.push({ r: 0, y: o.y }, { r: 0, y: yD }, { r: lerp(riU, riO, yD), y: yD });
    else if (mu) q.push({ r: muffe / 2, y: o.y }, { r: muffe / 2, y: yMu }, { r: lerp(riU, riO, yMu), y: yMu });
    else q.push({ r: riO, y: o.y });
    if (riU > 0 && boden > 0) q.push({ r: lerp(riU, riO, yB), y: yB }, { r: 0, y: yB });
    else if (sp) q.push({ r: riU, y: u.y });                    // innen senkrecht bis unter die Bauhöhe
    // Ohne Loch (innen = 0) fallen die Achspunkte zusammen — der Querschnitt ist ein Trapez an der Achse.
    const sauber = q.filter((p, i) => i === 0 || Math.abs(p.r - q[i - 1].r) > 1e-9 || Math.abs(p.y - q[i - 1].y) > 1e-9);
    const { ergebnis } = ringstueck({ achse: { unten: u, oben: o }, querschnitt: sauber }, { ecken: ecken ?? 32 });
    return ergebnis ?? null;
}

/**
 * Die Berme: der Innenkreis (Durchmesser) von der Sohle bis zur Auftrittshöhe,
 * ausgespart die Gerinne — je eines von der Mitte zu jedem weiteren Punkt, so
 * breit wie `breite`. Das Gerinne ist im Grundriss genau; seine Sohle ist eben
 * (die Halbschale ist eine Vereinfachung und steht so in der Herleitung).
 */
export function bermeKoerper(punkte, { durchmesser, hoehe, breite } = {}, ecken = 32) {
    if (!Array.isArray(punkte) || !punkte.length || !(durchmesser > 0) || !(hoehe > 0)) return null;
    const m = punktXYZ(punkte[0]);
    const r = durchmesser / 2;
    const kreis = [];
    for (let j = 0; j < ecken; j++) { const w = (j / ecken) * Math.PI * 2; kreis.push([m.x + Math.cos(w) * r, m.z + Math.sin(w) * r]); }
    kreis.push(kreis[0]);
    const streifen = [];
    for (const p of punkte.slice(1).map(punktXYZ)) {
        const dx = p.x - m.x, dz = p.z - m.z, l = Math.hypot(dx, dz);
        if (l < 1e-6 || !(breite > 0)) continue;
        const ux = dx / l, uz = dz / l, nx = -uz * breite / 2, nz = ux * breite / 2;
        // Über die Mitte hinaus bis jenseits der Wand — so schliessen sich die Gerinne in der Mitte.
        const a = { x: m.x - ux * breite / 2, z: m.z - uz * breite / 2 }, b = { x: m.x + ux * (r + 0.1), z: m.z + uz * (r + 0.1) };
        streifen.push([[[a.x + nx, a.z + nz], [b.x + nx, b.z + nz], [b.x - nx, b.z - nz], [a.x - nx, a.z - nz], [a.x + nx, a.z + nz]]]);
    }
    const flaechen = streifen.length ? polygonClipping.difference([[kreis]], ...streifen) : [[kreis]];
    const koerper = flaechen.map(([aussen, ...loecher]) => extrudiere({
        umriss: { ring: aussen.map(([x, z]) => ({ x, z })), loecher: loecher.map(l => l.map(([x, z]) => ({ x, z }))) },
    }, { von: m.y, bis: m.y + hoehe }).ergebnis);
    return _vereinige(koerper);
}

/**
 * Tritte (Steigeisen) an der Wand: Punkt 1 ist die Achse, jeder weitere die
 * Mitte eines Tritts AN der Wand. Der Tritt ragt `tiefe` zur Achse hin, ist
 * `breite` breit (quer) und `dicke` stark.
 */
export function trittKoerper(punkte, { breite, tiefe, dicke } = {}) {
    if (!Array.isArray(punkte) || punkte.length < 2 || !(breite > 0) || !(tiefe > 0) || !(dicke > 0)) return null;
    const a = punktXYZ(punkte[0]);
    const koerper = punkte.slice(1).map(punktXYZ).map((p) => {
        const dx = a.x - p.x, dz = a.z - p.z, l = Math.hypot(dx, dz) || 1;
        const ux = dx / l, uz = dz / l, nx = -uz * breite / 2, nz = ux * breite / 2;
        const ring = [
            { x: p.x + nx, z: p.z + nz }, { x: p.x + ux * tiefe + nx, z: p.z + uz * tiefe + nz },
            { x: p.x + ux * tiefe - nx, z: p.z + uz * tiefe - nz }, { x: p.x - nx, z: p.z - nz },
        ];
        return extrudiere({ umriss: { ring } }, { von: p.y, bis: p.y + dicke }).ergebnis;
    });
    return _vereinige(koerper);
}


// ── Kasten (BIMFY I9) ───────────────────────────────────────────────────────

/**
 * Ein RECHTECKIGER HOHLKÖRPER: punkte[0] die Mitte unten, punkte[1] die Mitte
 * oben, punkte[2] (wenn da) ein Punkt in Richtung der Längsachse auf Höhe von
 * punkte[0] — so dreht er mit, wenn das Bauwerk gedreht wird. Masse in m:
 * `laenge`/`breite` LICHT, `wand` drumherum. `boden` > 0 schliesst unten (über
 * die volle Aussenfläche), `deckel` > 0 oben — mit einer runden `oeffnung`
 * (Durchmesser). Eine Platte ist ein Kasten, dessen Deckel die ganze Höhe hat.
 */
export function kastenKoerper(punkte, { laenge, breite, wand = 0, boden = 0, deckel = 0, oeffnung = 0 } = {}, ecken = 32) {
    if (!Array.isArray(punkte) || punkte.length < 2 || !(laenge > 0) || !(breite > 0)) return null;
    const u = punktXYZ(punkte[0]), o = punktXYZ(punkte[1]);
    if (!(o.y > u.y)) return null;
    const r = punkte[2] ? punktXYZ(punkte[2]) : { x: u.x + 1, y: u.y, z: u.z };
    let ex = r.x - u.x, ez = r.z - u.z;
    const le = Math.hypot(ex, ez) || 1;
    ex /= le; ez /= le;
    const nx = -ez, nz = ex;                                       // quer zur Längsachse
    const rechteck = (l, b) => [[-l / 2, -b / 2], [l / 2, -b / 2], [l / 2, b / 2], [-l / 2, b / 2]]
        .map(([a, q]) => ({ x: u.x + a * ex + q * nx, z: u.z + a * ez + q * nz }));
    const kreis = (d) => Array.from({ length: ecken }, (_, i) => {
        const w = (2 * Math.PI * i) / ecken;
        return { x: u.x + (d / 2) * Math.cos(w), z: u.z + (d / 2) * Math.sin(w) };
    });
    const t = Math.max(0, wand);
    const aussen = rechteck(laenge + 2 * t, breite + 2 * t), innen = rechteck(laenge, breite);
    const h = o.y - u.y;
    const b = Math.min(Math.max(0, boden), h), d = Math.min(Math.max(0, deckel), h - b);
    // Boden und Wand ohne Deckel: EIN Körper (ein Topf) — zwei stiessen an einer Fläche zusammen.
    if (b > 0 && t > 0 && !(d > 0)) return topf({ umriss: { ring: aussen, innen } }, { von: u.y, bis: o.y, boden: b }).ergebnis ?? null;
    const teile = [];
    if (b > 0) teile.push(extrudiere({ umriss: { ring: aussen } }, { von: u.y, bis: u.y + b }).ergebnis);
    if (t > 0 && h - b - d > 1e-9) teile.push(extrudiere({ umriss: { ring: aussen, loecher: [innen] } }, { von: u.y + b, bis: o.y - d }).ergebnis);
    if (d > 0) {
        const loch = oeffnung > 0 && oeffnung < Math.min(laenge, breite) + 2 * t ? [kreis(oeffnung)] : [];
        teile.push(extrudiere({ umriss: { ring: aussen, loecher: loch } }, { von: o.y - d, bis: o.y }).ergebnis);
    }
    return _vereinige(teile);
}
