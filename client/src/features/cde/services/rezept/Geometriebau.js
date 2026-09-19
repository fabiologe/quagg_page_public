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
import { sweep, kreisProfil, rechteckProfil, platte } from '../geometrie/hilfen.js';

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
    if (dekl?.art === 'kreis') {
        const d = massAus(parameter, dekl.durchmesser, { einheit, rueckfall: vorgabe(dekl.durchmesser) });
        return d > 0 ? kreisProfil(d / 2, dekl.ecken ?? 12) : null;
    }
    if (dekl?.art === 'rechteck') {
        const b = massAus(parameter, dekl.breite, { einheit, rueckfall: vorgabe(dekl.breite) });
        const t = massAus(parameter, dekl.tiefe, { einheit, rueckfall: vorgabe(dekl.tiefe) });
        return b > 0 && t > 0 ? rechteckProfil(b, t) : null;
    }
    return null;
}

/** Ein Profil entlang der Punkte — geschlossen, mit Kappen. */
export function sweepKoerper(punkte, profil) {
    if (!Array.isArray(punkte) || punkte.length < 2 || !profil) return null;
    const { ergebnis } = sweep({ profil, achse: { punkte: punkte.map(punktXYZ) } });
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

