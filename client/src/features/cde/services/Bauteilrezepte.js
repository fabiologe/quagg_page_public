/**
 * Bauteilrezepte — aus Parametern wird Geometrie (Stufe 9.4).
 *
 * DIE ENTSCHEIDUNG, DIE ALLES TRÄGT: Ein `erzeugt`-Journaleintrag speichert
 * die PARAMETER, niemals das Netz.
 *
 * Der Grund ist Stufe 11. Ein Rohr, das in „Variante Nord" angelegt wird, darf
 * in „Süd" nicht auftauchen — das CDE-eigene Modell ist aber EINES. Aufgelöst
 * wird das, indem dieses Modell bei jedem Laden und jedem Satzwechsel aus dem
 * Journal NEU AUFGEBAUT wird, statt fortgeschrieben. Damit entscheidet der
 * Modellsatz allein durch seinen Journalinhalt, was im Raum steht; es braucht
 * kein Löschen beim Wechsel, und der Aufbau ist idempotent — dieselbe
 * Eigenschaft, auf der schon das Nachspielen ruht.
 *
 * Ein Bauteil, das nur als `BufferGeometry` existierte, liesse sich so nicht
 * wieder aufbauen. Deshalb geht Geometrie NIE ins Journal.
 *
 * REZEPT IST CODE, BIBLIOTHEKSEINTRAG SIND DATEN. Diese Liste ist kurz,
 * geschlossen und liegt im Feature. Ein Bibliothekseintrag (Stufe 9.8) nennt
 * ein Rezept BEIM NAMEN und legt Vorgabewerte dazu — er enthält nie
 * ausführbaren Code, sonst läge Code in der RepoFacade.
 *
 * DAS REZEPT BESTIMMT DIE FORM, NICHT DIE BEDEUTUNG. Welcher IFC-Typ
 * herauskommt, ist ein FELD mit Vorgabe: dieselbe Polylinie ist als
 * `IFCALIGNMENT` eine Trasse, als `IFCANNOTATION` eine Bruchkante und als
 * `IFCGEOGRAPHICELEMENT` eine Grenze. Eine feste Typliste hier wäre genau die
 * O(Typen)-Falle, gegen die die Bauform-Schicht angetreten ist — geprüft wird
 * darum nur, ob der Typ im IFC-4.3-Wörterbuch überhaupt existiert.
 *
 * ACHSKONVENTION — hier steht sie, und nur hier: **three.js**. X und Z liegen
 * waagerecht, **Y ist die Höhe**. Der Lageplan arbeitet in Welt-XZ
 * (`zeigerZuWelt` in `IfcPlanCanvas`), `SurfaceOps` rastert über X/Z. Ein
 * Punkt ist `[x, y, z]`. Wer das mit der flood-3D-Konvention (z ist Höhe)
 * verwechselt, baut Gelände um 90° gekippt — deshalb steht es an genau einer
 * Stelle und wird nirgends noch einmal entschieden.
 */

import * as THREE from 'three';
import { formeNach, verschiebeOperationen } from './gelaende/Operationen.js';
import { dreieckeAusRaster, dreieckeMitFlicken } from './geometry/SurfaceOps.js';
import { ENTITY_META } from '../data/entity-schema.js';
import { ABLEITUNGEN } from './ableitung/Ableitungen.js';
import { sweep, kreisProfil } from './geometrie/ops/Sweep.js';
import { versetztePunkte, ringFlaeche } from './geometrie/ops/Linien.js';
// Default-Import: der benannte lief im Dev-Server und brach im vite build
// (CJS-Interop) — derselbe Weg wie in IfcShapeOutlines.
import polygonClipping from 'polygon-clipping';
import { erdbauStapelVon, quellenVon, urGelaendeVon } from './ableitung/Bezuege.js';

export { quellenVon };

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

/** Kennt das Wörterbuch diesen Typ (IFC 4.3 ADD2 oder eine Waise älterer Schemata)? */
export function istKategorie(name) {
    return !!ENTITY_META[String(name ?? '').toUpperCase().trim()];
}

/**
 * Darf der Eigenbau diesen Typ SCHREIBEN? Im Zielschema IFC4X3_ADD2, nicht
 * abstrakt, ein IfcProduct — dieselbe Regel wie `schema.ist_schreibbar` im
 * Backend, aus demselben Schnappschuss erzeugt.
 *
 * Bis 2026-09-11 genügte „steht im Wörterbuch": damit ging auch
 * `IFCPIPESEGMENTCULVERT` durch (eine bSDD-Abflachung, keine Klasse) oder ein
 * abstraktes `IFCFEATUREELEMENT` — und erst der Schreiber im Backend lehnte ab,
 * nachdem der Eintrag längst im Journal stand.
 */
export function istSchreibbar(name) {
    const e = ENTITY_META[String(name ?? '').toUpperCase().trim()];
    return !!e && e.schema.includes('IFC4X3_ADD2') && !e.abstract && e.hierarchy.includes('IfcProduct');
}

// ── Die Rezepte ─────────────────────────────────────────────────────────────

/**
 * Ein Band entlang einer Polylinie — die Darstellung einer Linie im Raum.
 *
 * Waagerecht gelegt, weil eine Trasse, Bruchkante oder Grenze von oben gelesen
 * wird. Je Abschnitt zwei Dreiecke; die Breite steht senkrecht auf dem
 * Abschnitt in der XZ-Ebene.
 */
function bandGeometrie(punkte, breite = LINIEN_BAND_M) {
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
function flaechenGeometrie(punkte) {
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
 * Der Katalog. Neue Rezepte hier ergänzen — sonst nirgends.
 *
 * Reihenfolge nach NUTZEN, nicht nach Schwierigkeit: `linie` zuerst, weil sie
 * Trasse, Bruchkante, Grenze und Absteckung auf einmal bedient — und weil
 * Stufe 10 sie als Achse fürs Gerinne braucht. `flaeche` gleich danach, weil
 * das Aushubpolygon dieselbe Eingabe ist.
 *
 * Eintrag:
 *   id, titel, icon      Darstellung
 *   bauform              Schlüssel aus BAUFORMEN — bestimmt, was danach an dem
 *                        Bauteil möglich ist (Ziehen, Operationen, Mengen)
 *   kategorieVorgabe     nur die VORGABE; der Typ ist ein Feld
 *   mindestPunkte        weniger ist kein Bauteil
 *   geschlossen          Umriss (Fläche) oder offener Zug (Linie)
 *   felder               wie im Bearbeitungs-Katalog
 *   baue(parameter)      → BufferGeometry | null. REIN: keine Engine, kein Vue.
 */
/**
 * Ein Rohr: Kreisquerschnitt entlang der Achse.
 *
 * Warum ein eigenes Rezept und nicht das Band der `linie`: Eine geteilte
 * Haltung besteht aus zwei HALTUNGEN, nicht aus zwei flachen Streifen. Wer im
 * Kanalbau zwei Bänder im Raum liegen sieht, hat kein Modell, sondern eine
 * Skizze — und die Bauform wäre `linie` statt `achse+profil`, womit auch alle
 * Werkzeuge dieser Form ausfielen.
 *
 * Die Richtung an jedem Stützpunkt wird zwischen den anliegenden Abschnitten
 * gemittelt, damit die Ringe an Knicken nicht aufklaffen — dasselbe Vorgehen
 * wie beim Band. Der Ring liegt in der Ebene senkrecht zur Richtung.
 *
 * PARAMETRISCH GEDACHT: Was hier ein Netz wird, kennt die Bibliothek auch als
 * `editor.createCircleExtrusion({radius[], axes})`. Das Journal speichert
 * ohnehin nur PUNKTE und DN — der Umstieg auf die parametrische Form ändert
 * dann nichts am Journal, nur an dieser Funktion.
 */
/**
 * Rohr und Schacht — seit G6 ein GESCHLOSSENER Sweep mit Kappen aus dem
 * Kernel: daran stellt `meshVolume` ein Attest aus, und die Bauform-Schicht
 * kann am eigenen Bauteil `gemessen` sagen. Vorher ein offener Schlauch aus
 * Ringen ohne Enden — kein Körper, kein Volumen.
 */
function rohrGeometrie(punkte, dnMm = 300, seiten = 12) {
    const k = rohrKoerper(punkte, dnMm, seiten);
    return k ? dreiecksGeometrie(k.positions) : null;
}

/** Der Rohrkörper als Kernel-Form `koerper` — null, wenn kein Körper entsteht. */
export function rohrKoerper(punkte, dnMm = 300, seiten = 12) {
    if (!Array.isArray(punkte) || punkte.length < 2) return null;
    const r = (Number(dnMm) || 300) / 2000;          // mm Durchmesser → m Radius
    if (!(r > 0)) return null;
    const { ergebnis } = sweep({ profil: kreisProfil(r, seiten), achse: { punkte: punkte.map(_p) } });
    return ergebnis ?? null;
}

/**
 * Die Kernel-Form eines Rohrs/Schachts AUS DEM BAUPLAN (G6): der
 * Ableitungslauf fragt so nach der Achse eines eigenen Rohrs, ohne dass das
 * Rohr eine Ableitung sein müsste.
 */
function _formAusRohr(parameter, form, seiten) {
    const punkte = punkteAus(parameter);
    if (punkte.length < 2) return null;
    if (form === 'linie') return { punkte: punkte.map(_p), dn: Number(parameter?.dn) || null };
    if (form === 'koerper' || form === 'mesh') return rohrKoerper(punkte, parameter?.dn, seiten);
    return null;
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
function dreiecksGeometrie(positions) {
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

/**
 * Rahmenwechsel (Lücke ⑤): jedes Rezept deklariert, wie seine Parameter in
 * einen neuen Ladeversatz gehoben werden — WELCHE Felder Punkte sind, weiss
 * nur das Rezept selbst. Ein Rezept ohne `verschiebe` fällt im Wächtertest
 * (`journalVersatz.test.js`), nicht erst an einer verschobenen Revision.
 */
function _verschiebePunktliste(parameter, delta) {
    const punkte = parameter?.punkte;
    if (!Array.isArray(punkte)) return parameter;
    return {
        ...parameter,
        punkte: punkte.map(p => (Array.isArray(p) && p.length >= 3
            ? [p[0] + delta.x, p[1] + delta.y, p[2] + delta.z]
            : p)),
    };
}

/** Der Schwerpunkt einer Punktliste in XZ (Welt), oder null. */
export function schwerpunktXZ(punkte) {
    const gut = (punkte ?? []).filter(p => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[2]));
    if (!gut.length) return null;
    let x = 0, z = 0;
    for (const p of gut) { x += p[0]; z += p[2]; }
    return { x: x / gut.length, z: z / gut.length };
}

/**
 * Eine Punktliste um `grad` in der Waagerechten drehen (S8).
 *
 * Um `zentrum` (Vorgabe: Schwerpunkt), positiv = gegen den Uhrzeigersinn von
 * oben (Nord). Die Höhe bleibt — gedreht wird der Grundriss, wie beim
 * Ausrichten eines Bauteils. Rein.
 */
/** Bauplan-Tripel [x, y, z] → Grundriss {x, z} für den Kernel. */
const _xz = (punkte) => punkte.map(p => ({ x: p[0], z: p[2] }));

/**
 * Eine Polylinie oder einen Ring im Grundriss um `abstand` versetzen (S9):
 * DIESELBE Gehrung wie der Offset des Kernels (`versetztePunkte`), die Höhe
 * je Stützpunkt bleibt am Index. Offen: positiv = links in Laufrichtung
 * (three, Blick von oben). Ring: positiv = NACH AUSSEN — die Wicklung wird
 * nicht vorausgesetzt, sondern an der Fläche abgelesen (sie muss wachsen).
 * Punkte sind Tripel [x, y, z] wie im Bauplan.
 */
export function versetzePunktliste(punkte, abstand, { geschlossen = false } = {}) {
    const d = Number(abstand);
    if (!Array.isArray(punkte) || punkte.length < 2 || !Number.isFinite(d) || d === 0) return null;
    const grund = _xz(punkte);
    const zurueck = (xz) => xz.map((q, i) => [q.x, punkte[i][1], q.z]);
    if (!geschlossen) return zurueck(versetztePunkte(grund, d));
    // Welches Vorzeichen führt NACH AUSSEN? Eine Probe mit dem Betrag: wächst
    // die Fläche, ist es +; sonst −. Der gewünschte Abstand folgt dann diesem
    // Vorzeichen (negativ = nach innen), unabhängig von der Wicklung.
    const betrag = Math.abs(d);
    const a0 = ringFlaeche(grund);
    const probe = versetztePunkte(grund, betrag, { geschlossen: true });
    const nachAussen = ringFlaeche(probe) >= a0 ? betrag : -betrag;
    return zurueck(versetztePunkte(grund, d > 0 ? nachAussen : -nachAussen, { geschlossen: true }));
}

/** Ein Ende einer Polylinie entlang seines Segments verlängern (> 0) oder kürzen (< 0). */
export function trimmePunktliste(punkte, ende = 'ende', laenge = 0) {
    const l = Number(laenge);
    if (!Array.isArray(punkte) || punkte.length < 2 || !Number.isFinite(l) || Math.abs(l) < 1e-4) return null;
    const pts = punkte.map(p => [p[0], p[1], p[2]]);
    const [i, j] = ende === 'anfang' ? [0, 1] : [pts.length - 1, pts.length - 2];
    const a = pts[i], b = pts[j];
    const seg = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    if (seg < 1e-9 || l <= -seg + 0.01) return null;         // das Segment darf nicht verschwinden
    const f = (seg + l) / seg;
    pts[i] = [b[0] + (a[0] - b[0]) * f, b[1] + (a[1] - b[1]) * f, b[2] + (a[2] - b[2]) * f];
    return pts;
}

/**
 * Zwei Ringe (Bauplan-Tripel) im Grundriss VEREINIGEN (S9) — polygon-clipping,
 * wie `IfcShapeOutlines` es für die Umrisse tut. Ergebnis ist EIN Ring ohne
 * Löcher, sonst ein Grund: zwei Flächen, die sich nicht berühren, bleiben
 * zwei; ein Ring um ein Loch ist keine Fläche dieses Rezepts. Höhen: jeder
 * Ergebnispunkt nimmt die Höhe des nächsten Ausgangspunkts (Schnittpunkte
 * liegen auf einer Kante und bekommen die Höhe des näheren Endes).
 * @returns {{punkte: number[][]}|{grund: string}}
 */
export function vereinigeRinge(a, b) {
    const ok = (r) => Array.isArray(r) && r.length >= 3 && r.every(p => Array.isArray(p) && p.length >= 3);
    if (!ok(a) || !ok(b)) return { grund: 'Beide Flächen brauchen mindestens drei Punkte.' };
    const ring = (r) => [[...r.map(p => [p[0], p[2]]), [r[0][0], r[0][2]]]];
    let aus;
    try { aus = polygonClipping.union(ring(a), ring(b)); }
    catch (fehler) { return { grund: `Vereinigung nicht möglich: ${fehler?.message ?? fehler}` }; }
    if (!Array.isArray(aus) || aus.length !== 1) {
        return { grund: aus?.length > 1 ? 'Die Flächen berühren sich nicht — es blieben zwei.' : 'Die Vereinigung ist leer.' };
    }
    if (aus[0].length !== 1) return { grund: 'Die Vereinigung hätte ein Loch — das kann diese Fläche nicht tragen.' };
    const quelle = [...a, ...b];
    const hoehe = (x, z) => {
        let best = quelle[0][1], d0 = Infinity;
        for (const p of quelle) {
            const d = Math.hypot(p[0] - x, p[2] - z);
            if (d < d0) { d0 = d; best = p[1]; }
        }
        return best;
    };
    let ergebnis = aus[0][0].map(([x, z]) => [x, hoehe(x, z), z]);
    // polygon-clipping schliesst den Ring (letzter = erster); das Rezept hält ihn offen.
    const l = ergebnis.length;
    if (l > 1 && Math.hypot(ergebnis[0][0] - ergebnis[l - 1][0], ergebnis[0][2] - ergebnis[l - 1][2]) < 1e-9) ergebnis = ergebnis.slice(0, -1);
    if (ergebnis.length < 3) return { grund: 'Die Vereinigung ist entartet.' };
    return { punkte: ergebnis };
}

/** Eine Polylinie an einer Station teilen — beide Teile enthalten den Teilpunkt. */
export function teilePunktlisteAnStation(punkte, station) {
    const s = Number(station);
    if (!Array.isArray(punkte) || punkte.length < 2 || !Number.isFinite(s) || s <= 0.01) return null;
    let gelaufen = 0;
    for (let i = 1; i < punkte.length; i++) {
        const a = punkte[i - 1], b = punkte[i];
        const d = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
        if (d < 1e-9) continue;
        if (s < gelaufen + d - 0.01) {
            const t = (s - gelaufen) / d;
            const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
            return [[...punkte.slice(0, i), p], [p, ...punkte.slice(i)]];
        }
        gelaufen += d;
    }
    return null;
}

/**
 * Einen Ring mit einer Geraden (zwei Grundrisspunkte) in zwei Ringe teilen —
 * Halbebenen-Zuschnitt (Sutherland–Hodgman) auf beiden Seiten, Höhen an den
 * Schnittpunkten interpoliert. `null`, wenn die Gerade den Ring nicht trennt.
 */
export function teileRingMitGerade(punkte, p1, p2) {
    if (!Array.isArray(punkte) || punkte.length < 3 || !p1 || !p2) return null;
    const dx = p2.x - p1.x, dz = p2.z - p1.z;
    const l = Math.hypot(dx, dz);
    if (l < 1e-9) return null;
    const seite = (p) => ((p[0] - p1.x) * dz - (p[2] - p1.z) * dx) / l;   // signierter Abstand zur Geraden
    const schneide = (vorzeichen) => {
        const aus = [];
        const n = punkte.length;
        for (let i = 0; i < n; i++) {
            const a = punkte[i], b = punkte[(i + 1) % n];
            const sa = seite(a) * vorzeichen, sb = seite(b) * vorzeichen;
            if (sa >= 0) aus.push([a[0], a[1], a[2]]);
            if ((sa >= 0) !== (sb >= 0)) {
                const t = sa / (sa - sb);
                aus.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
            }
        }
        // Doppelpunkte am Schnitt entfernen
        return aus.filter((p, i) => i === 0 || Math.hypot(p[0] - aus[i - 1][0], p[2] - aus[i - 1][2]) > 1e-6);
    };
    const links = schneide(1), rechts = schneide(-1);
    if (links.length < 3 || rechts.length < 3) return null;
    if (ringFlaeche(_xz(links)) < 1e-6 || ringFlaeche(_xz(rechts)) < 1e-6) return null;
    return [links, rechts];
}

export function drehePunktliste(parameter, grad, zentrum = null) {
    const punkte = parameter?.punkte;
    if (!Array.isArray(punkte) || !Number.isFinite(Number(grad))) return parameter;
    const c = zentrum ?? schwerpunktXZ(punkte);
    if (!c) return parameter;
    const w = (Number(grad) * Math.PI) / 180;
    const cos = Math.cos(w), sin = Math.sin(w);
    return {
        ...parameter,
        punkte: punkte.map(p => {
            if (!Array.isArray(p) || p.length < 3) return p;
            const dx = p[0] - c.x, dz = p[2] - c.z;
            // Standard-Drehung in XZ (y-Achse zeigt nach oben); Nord = −z.
            return [c.x + dx * cos - dz * sin, p[1], c.z + dx * sin + dz * cos];
        }),
    };
}

/** Gelände: die Operationsliste hebt `verschiebeOperationen` (Operationen.js). */
function _verschiebeGelaende(parameter, delta) {
    if (!Array.isArray(parameter?.operationen)) return parameter;
    return { ...parameter, operationen: verschiebeOperationen(parameter.operationen, delta) };
}


// ── Fachmodell-Projektion (Stufe 17.3 → Teil XIV): jedes Rezept sagt selbst,
//    was es dem Fachmodell gibt — Kanten, Knoten, Gelände, Körper. ────────
function _p(p) {
    if (Array.isArray(p)) return { x: p[0] ?? 0, y: p[1] ?? 0, z: p[2] ?? 0 };
    return { x: p?.x ?? 0, y: p?.y ?? 0, z: p?.z ?? 0 };
}
function _laengeVon(punkte) {
    let l = 0;
    for (let i = 0; i + 1 < punkte.length; i++) {
        l += Math.hypot(punkte[i + 1].x - punkte[i].x, punkte[i + 1].y - punkte[i].y, punkte[i + 1].z - punkte[i].z);
    }
    return l;
}
/** Nur ROHRE werden Kanten: eine gezeichnete Linie ist eine Trasse, kein Kanal. */
function _fachmodellRohr(globalId, plan) {
    const roh = plan?.parameter?.punkte;
    if (!Array.isArray(roh) || roh.length < 2) return {};
    const punkte = roh.map(_p);
    return { kanten: [{
        globalId, name: plan.name ?? '', kategorie: plan.kategorie ?? 'IFCPIPESEGMENT',
        anfang: punkte[0], ende: punkte[punkte.length - 1], punkte,
        laenge: _laengeVon(punkte), dn: Number(plan.parameter?.dn) || null, quelle: 'bauplan',
    }] };
}
/** Der Netz-Knoten eines Schachts ist die SOHLE (dieselbe Konvention wie die Platzierung). */
function _fachmodellSchacht(globalId, plan) {
    const roh = plan?.parameter?.punkte;
    if (!Array.isArray(roh) || !roh.length) return {};
    return { knoten: [{ globalId, name: plan.name ?? '', punkt: _p(roh[0]) }] };
}
const _fachmodellNichts = () => ({});
const _fachmodellGelaende = (globalId) => ({ gelaende: [globalId] });

export const REZEPTE = Object.freeze({
    linie: {
        id: 'linie',
        titel: 'Linie',
        icon: 'route',
        bauform: 'linie',
        kategorieVorgabe: 'IFCANNOTATION',
        mindestPunkte: 2,
        geschlossen: false,
        felder: [
            { name: 'name', titel: 'Bezeichnung', typ: 'text', leerErlaubt: true },
            { name: 'kategorie', titel: 'IFC-Typ', typ: 'text' },
            { name: 'hoehe', titel: 'Höhe (leer = auf dem Gelände)', einheit: 'm', typ: 'zahl', leerErlaubt: true },
        ],
        // Teil XIV, G5: eine Linie ohne eigene Höhe ist eine BRUCHKANTE — sie
        // liegt auf dem Gelände. Wer eine Höhe tippt, zeichnet eine Trasse.
        hoehenAus: 'gelaende',
        verschiebe: _verschiebePunktliste,
        fachmodell: _fachmodellNichts,
        baue: (parameter) => bandGeometrie(punkteAus(parameter)),
    },
    flaeche: {
        id: 'flaeche',
        titel: 'Fläche',
        icon: 'areas',
        bauform: 'flaeche',
        kategorieVorgabe: 'IFCANNOTATION',
        mindestPunkte: 3,
        geschlossen: true,
        felder: [
            { name: 'name', titel: 'Bezeichnung', typ: 'text', leerErlaubt: true },
            { name: 'kategorie', titel: 'IFC-Typ', typ: 'text' },
            { name: 'hoehe', titel: 'Höhe', einheit: 'm', typ: 'zahl', leerErlaubt: true },
        ],
        verschiebe: _verschiebePunktliste,
        fachmodell: _fachmodellNichts,
        baue: (parameter) => flaechenGeometrie(punkteAus(parameter)),
    },
    gelaende: {
        id: 'gelaende',
        titel: 'Geformtes Gelände',
        icon: 'terrain',
        bauform: 'hoehenfeld',
        kategorieVorgabe: 'IFCGEOGRAPHICELEMENT',
        mindestPunkte: 0,
        geschlossen: false,
        felder: [],
        /**
         * Dieses Rezept BRAUCHT etwas, das kein Parameter sein darf: das
         * Höhenraster des GELIEFERTEN Geländes. Es ins Journal zu legen wäre
         * Gesetz-5-Bruch (Gerechnetes gespeichert — und veraltet still mit
         * der nächsten Revision). Deshalb deklariert das Rezept seinen
         * Bedarf, und `baueErzeugte` reicht die Ableitung herein — die
         * Parameter bleiben rein deklarativ: Quelle + Operationsliste.
         */
        verschiebe: _verschiebeGelaende,
        fachmodell: _fachmodellGelaende,
        braucht: 'quellraster',
        baue: null,
        baueMit: (parameter, quellraster) => {
            const { raster, warnungen } = formeNach(quellraster, parameter?.operationen ?? []);
            const { positions } = dreieckeAusRaster(raster);
            const geo = dreiecksGeometrie(positions);
            return { geometrie: geo, warnungen };
        },
    },
    rohr: {
        id: 'rohr',
        titel: 'Rohr',
        icon: 'laengsschnitt',
        bauform: 'achse+profil',
        kategorieVorgabe: 'IFCPIPESEGMENT',
        mindestPunkte: 2,
        geschlossen: false,
        felder: [
            { name: 'name', titel: 'Bezeichnung', typ: 'text', leerErlaubt: true },
            { name: 'kategorie', titel: 'IFC-Typ', typ: 'text' },
            { name: 'hoehe', titel: 'Höhe', einheit: 'm', typ: 'zahl', leerErlaubt: true },
            { name: 'dn', titel: 'DN', einheit: 'mm', typ: 'zahl', min: 50, max: 4000, vorgabe: 300 },
        ],
        verschiebe: _verschiebePunktliste,
        fachmodell: _fachmodellRohr,
        formAus: (parameter, form) => _formAusRohr(parameter, form, 12),
        baue: (parameter) => rohrGeometrie(punkteAus(parameter), parameter?.dn),
    },
    schacht: {
        id: 'schacht',
        titel: 'Schacht',
        icon: 'schacht',
        bauform: 'koerper',
        kategorieVorgabe: 'IFCDISTRIBUTIONCHAMBERELEMENT',
        // ZWEI Punkte: Sohle und Deckel. Ein Schacht ist geometrisch ein
        // senkrechtes Rohr — deshalb braucht er keine eigene Routine, nur
        // eine andere Achse. Die Tiefe ist der Abstand der beiden Punkte,
        // nicht ein drittes Feld daneben: zwei Wege zu derselben Grösse
        // liefen auseinander.
        mindestPunkte: 2,
        geschlossen: false,
        felder: [
            { name: 'name', titel: 'Bezeichnung', typ: 'text', leerErlaubt: true },
            { name: 'kategorie', titel: 'IFC-Typ', typ: 'text' },
            { name: 'hoehe', titel: 'Sohlhöhe', einheit: 'm', typ: 'zahl', leerErlaubt: true },
            { name: 'dn', titel: 'Durchmesser', einheit: 'mm', typ: 'zahl',
              min: 300, max: 4000, vorgabe: 1000 },
        ],
        verschiebe: _verschiebePunktliste,
        fachmodell: _fachmodellSchacht,
        formAus: (parameter, form) => _formAusRohr(parameter, form, 16),
        baue: (parameter) => rohrGeometrie(punkteAus(parameter), parameter?.dn, 16),
    },
});

/** Ein Rezept nach Id. Nie `undefined` durchreichen — `null` ist die Antwort. */
export function rezeptNach(id) {
    const k = String(id ?? '');
    return REZEPTE[k] ?? ABLEITUNGEN[k] ?? null;
}

/** Eine Ableitung rechnet aus anderen Objekten (`leite`); ein Rezept baut aus Parametern (`baue`). */
export function istAbleitung(rezept) {
    return typeof rezept?.leite === 'function';
}

/** Kennung einer Ableitung — die Klammer um ihre Teile im Journal. */
export function neueAbleitungsId() {
    return `ab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Die Teile einer Ableitung im wirksamen Stand: Rolle → {globalId, bauplan}.
 * Gebraucht bei der Folgeformung — dieselben GlobalIds, volle Liste.
 */
export function teileVon(erzeugtStand, ableitungId) {
    const teile = new Map();
    if (!ableitungId) return teile;
    for (const [globalId, plan] of erzeugtStand ?? []) {
        if (plan?.ableitung === ableitungId && plan?.rolle) teile.set(plan.rolle, { globalId, bauplan: plan });
    }
    return teile;
}

/**
 * DER ERDBAU-STAND eines Geländes (Stufe 1) — was die Bearbeitung wissen
 * muss, bevor sie einen Vorgang anhängt. Rein, aus dem erzeugt-Stand; der
 * Viewer hängt es ans Subjekt (`el.erdbau`) und an jeden Gelände-Kandidaten
 * (`gelaendeQuellen[i].erdbau`), weil `anwenden` synchron ist.
 *
 *   ur         das gelieferte Gelände hinter `gid` (gid selbst, wenn es geliefert ist)
 *   anzeige    die Anzeige-Ableitung des Ur (globalId + bauplan) oder null
 *   vorgaenge  der Stapel in Vorgangsreihenfolge [{ableitung, art, titel}]
 *   letzter    der letzte Vorgang mit seinen Teilen und Operationen — an ihn
 *              hängt eine Erdbau-Folgeformung, wenn er selbst `erdbau` ist
 *   altDgm     dgm-Teile aus der Zeit vor Stufe 1 (werden beim Anfassen verborgen)
 *   quellBasis / cell   Prüfmass und Zellweite des Ur aus dem Journal
 *
 * Bis Stufe 0 hiess das `ableitungAuf` und kannte nur die eine erdbau-
 * Ableitung — Graben und Grube ketteten sich daneben mit eigener Kopie.
 */
export function erdbauStandVon(erzeugtStand, gid, { historie = null } = {}) {
    if (!gid) return null;
    const stand = erzeugtStand instanceof Map ? erzeugtStand : new Map(Object.entries(erzeugtStand ?? {}));
    // Die Historie trägt die Kette durch Zurückgenommenes (Fahrplan
    // Erdbau-Container, Stufe 1): wer in eine veraltete Anzeige tippt, bekommt
    // trotzdem das Ur-Gelände — nicht die tote Kennung als „Ur".
    const ur = urGelaendeVon(stand, gid, { rezeptNach, historie });
    const { anzeige, vorgaenge, altDgm } = erdbauStapelVon(stand, ur, { rezeptNach, historie });
    const l = vorgaenge.at(-1) ?? null;
    const basis = anzeige?.bauplan
        ?? vorgaenge.find(v => v.bauplan?.parameter?.quellen?.gelaende === ur)?.bauplan
        ?? vorgaenge[0]?.bauplan ?? null;
    return {
        ur, anzeige, altDgm,
        vorgaenge: vorgaenge.map(({ ableitung, art, titel }) => ({ ableitung, art, titel })),
        letzter: l ? { ableitung: l.ableitung, art: l.art, teile: teileVon(stand, l.ableitung),
                       operationen: l.bauplan?.parameter?.operationen ?? [] } : null,
        quellBasis: basis?.parameter?.quellBasis?.gelaende ?? null,
        cell: basis?.parameter?.raster?.cell ?? null,
    };
}

/**
 * Ist dieser Bauplan eine ANZEIGEFORM — die geformte Flaeche, die der Raum
 * zeigt, weil fragments nicht schneiden kann?
 *
 * Sie ist kein Bauteil: in IFC 4.3 ist der Aushub ein `IfcEarthworksCut`, der
 * das Ur-Gelaende aushoehlt; ein zweites TERRAIN am selben Ort waere eine
 * Dopplung (bSI: „no CSG operation is expected to be performed on import").
 * Bis Stufe 1 heisst sie im Journal `dgm` und gehoert einer Ableitung; ab
 * Stufe 1 traegt sie die Rolle `anzeige` und `export: false`.
 */
export function istAnzeigeform(bauplan) {
    if (!bauplan) return false;
    if (bauplan.rolle === 'anzeige') return true;
    return bauplan.rolle === 'dgm' && istAbleitung(rezeptNach(bauplan.rezept));
}

/**
 * Die MENGEN eines Bauteils für den IFC-Export (Stufe 2, Paket v2): aus den
 * Kennzahlen seines Aufbaus, nach der Deklaration am Rezeptteil (`menge`).
 *
 * Das Rezept sagt, welche Kennzahl welcher Qto-Wert ist — nicht der
 * Schreiber. Sonst stünde im IFC eine andere Zahl als im Mengenreiter, und
 * niemand merkte es, bis ein Leistungsverzeichnis nicht aufgeht.
 *
 * @returns {{undisturbedVolume?, compactedVolume?, length?}}  nur, was gerechnet ist
 */
export function mengenVon(bauplan, kennzahlen) {
    const teil = rezeptNach(bauplan?.rezept)?.teile?.find?.(t => t.rolle === bauplan?.rolle);
    const out = {};
    for (const [feld, kennzahl] of Object.entries(teil?.menge ?? {})) {
        const v = kennzahlen?.[kennzahl];
        if (typeof v === 'number' && Number.isFinite(v) && v >= 0) out[feld] = v;
    }
    return out;
}

/**
 * Die Journaleinträge einer Ableitung — je Teil EIN `erzeugt`-Eintrag mit
 * eigener GlobalId, derselben Klammer `ableitung` und den VOLLEN Parametern
 * (absoluter Zielzustand je Bauteil, Gesetz 4). Bei `bestehend` bleiben die
 * GlobalIds stehen; die Faltung „letzter gewinnt" ersetzt dann den Bauplan.
 *
 * Der Aufrufer legt die Einträge in EINEN Vorgang (ausfuehren tut das für
 * Listen von selbst) — ein Teil allein wäre ein halbes Ding.
 */
export function ableitungsSchritte({ rezept, quellen = {}, quellBasis = {}, raster = {},
                                     operationen = [], name = '', bestehend = null, vorgaenge = null } = {}) {
    const r = ABLEITUNGEN[rezept];
    if (!r) throw new Error(`Ableitung „${rezept}" gibt es nicht`);
    const ableitung = bestehend?.ableitung ?? neueAbleitungsId();
    // `vorgaenge` trägt nur die Anzeige (Stufe 1): die Reihenfolge der
    // Erdbau-Vorgänge — eine Entscheidung, nichts Gerechnetes.
    const parameter = { quellen, quellBasis, raster, operationen, ...(vorgaenge ? { vorgaenge } : {}) };
    const vorhandene = bestehend?.teile instanceof Map ? bestehend.teile : new Map(Object.entries(bestehend?.teile ?? {}));
    // NACHGEZOGENE Teile: Rollen, die das Rezept nicht mehr kennt (der
    // `dgm`-Teil aus der Zeit vor Stufe 1), aber die Klammer noch trägt. Sie
    // bekommen dieselben Parameter — eine Klammer, EIN Parametersatz; sonst
    // meldete der Lauf „uneinheitlich" und baute nichts.
    const nachgezogen = [...vorhandene]
        .filter(([rolle, alt]) => alt?.globalId && alt?.bauplan && !r.teile.some(t => t.rolle === rolle))
        .map(([, alt]) => ({ art: 'erzeugt', globalId: alt.globalId, modell: 'cde',
                             nachher: { ...alt.bauplan, ableitung, parameter } }));
    return r.teile.map(teil => {
        const alt = vorhandene.get(teil.rolle);
        const pt = typeof teil.predefinedType === 'function' ? teil.predefinedType(parameter) : (teil.predefinedType ?? null);
        // Der IFC-Typ folgt aus der ROLLE — oder, wo das Teil es sagt, aus den
        // Parametern (die Aussparung bleibt, was das Bauwerk war).
        const kat = typeof teil.kategorie === 'function' ? teil.kategorie(parameter) : teil.kategorie;
        return {
            art: 'erzeugt',
            globalId: alt?.globalId ?? neueGlobalId(),
            modell: 'cde',
            nachher: {
                rezept, rolle: teil.rolle, ableitung,
                bauform: teil.bauform,
                kategorie: String(kat).toUpperCase(),
                predefinedType: pt,
                name: typeof teil.name === 'function' ? teil.name(name || r.titel) : (teil.name ?? name),
                parameter,
            },
        };
    }).concat(nachgezogen);
}

/**
 * Die Kernel-Form eines gebauten Teils → BufferGeometry, Float32 erst hier.
 * Raster werden trianguliert (Löcher bleiben Löcher), Körper und Netze
 * gehen so, wie sie sind.
 */
export function geometrieAusTeil(teil) {
    if (!teil) return null;
    if (teil.form === 'raster') {
        // Feine Flicken (Teil XX): die Anzeige wird dort fein, wo Operationen wirken.
        const { positions, triCount } = teil.flicken?.length
            ? dreieckeMitFlicken(teil.daten, teil.flicken)
            : dreieckeAusRaster(teil.daten);
        return triCount ? dreiecksGeometrie(positions) : null;
    }
    if (teil.form === 'koerper' || teil.form === 'mesh') {
        return teil.daten?.triCount ? dreiecksGeometrie(teil.daten.positions) : null;
    }
    return null;
}

/**
 * Taugt dieser Bauplan?
 *
 * Geprüft wird VOR dem Eintragen ins Journal. Ein Eintrag, der sich nicht
 * bauen lässt, wäre der schlimmste Fall: er überlebt jedes Neuladen, meldet
 * jedes Mal denselben Fehler und lässt sich nur über „zurück" wieder los.
 *
 * @returns {string[]} leere Liste heißt „in Ordnung"
 */
export function pruefeBauplan({ rezept, kategorie, parameter } = {}) {
    const fehler = [];
    const r = rezeptNach(rezept);
    if (!r) return [`Rezept „${rezept}" gibt es nicht`];

    const punkte = punkteAus(parameter);
    if (punkte.length < r.mindestPunkte) {
        fehler.push(`${r.titel}: mindestens ${r.mindestPunkte} Punkte, ${punkte.length} gesetzt`);
    }
    const typ = kategorie ?? r.kategorieVorgabe;
    if (!istSchreibbar(typ)) {
        fehler.push(`„${typ}" ist kein IFC-Typ, den der Eigenbau schreiben kann (IFC 4.3, konkret, ein Bauteil)`);
    }
    return fehler;
}

/**
 * Aus einem Bauplan die Geometrie.
 *
 * @returns {{ok: true, geometrie, kategorie, name}|{ok: false, fehler: string[]}}
 */
export function baueAusBauplan(bauplan) {
    const fehler = pruefeBauplan(bauplan);
    if (fehler.length) return { ok: false, fehler };
    const r = rezeptNach(bauplan.rezept);
    const geometrie = r.baue(bauplan.parameter ?? {});
    if (!geometrie) return { ok: false, fehler: [`${r.titel}: Geometrie liess sich nicht bauen`] };
    return {
        ok: true,
        geometrie,
        kategorie: (bauplan.kategorie ?? r.kategorieVorgabe).toUpperCase(),
        name: bauplan.name ?? '',
    };
}

/**
 * Wie `baueAusBauplan`, aber für Rezepte mit deklariertem Bedarf: die
 * Ableitung kommt als Getter-Closure herein (Hausvertrag). Dieselbe
 * Rückgabeform — der Aufrufer in `baueErzeugte` behandelt beide gleich.
 */
export async function baueMitAbleitung(bauplan, holeQuellraster) {
    const fehler = pruefeBauplan(bauplan);
    if (fehler.length) return { ok: false, fehler };
    const r = rezeptNach(bauplan.rezept);
    const quelle = bauplan.parameter?.quelle;
    if (!quelle) return { ok: false, fehler: [`${r.titel}: keine Quelle angegeben`] };
    if (!(bauplan.parameter?.operationen?.length)) {
        return { ok: false, fehler: [`${r.titel}: keine Operationen`] };
    }
    // Die Zellweite steht im Bauplan (`raster.cell`), sobald einer sie
    // festlegt — sonst rechnet die Automatik je Quelle eine andere, und zwei
    // Raster derselben Ableitung hätten keinen gemeinsamen Bezug.
    const raster = await holeQuellraster?.(quelle, { cell: bauplan.parameter?.raster?.cell ?? null });
    if (!raster) return { ok: false, fehler: [`${r.titel}: Quellraster zu „${quelle}" nicht ableitbar`] };
    const { geometrie, warnungen } = r.baueMit(bauplan.parameter, raster);
    if (!geometrie) return { ok: false, fehler: [`${r.titel}: Geometrie liess sich nicht bauen`] };
    return {
        ok: true,
        geometrie,
        warnungen,
        kategorie: (bauplan.kategorie ?? r.kategorieVorgabe).toUpperCase(),
        name: bauplan.name ?? '',
    };
}

// ── Der Journaleintrag ──────────────────────────────────────────────────────

/**
 * Eine GlobalId für ein Bauteil, das kein Autor je vergeben hat.
 *
 * Ein erzeugtes Bauteil hat keine GlobalId aus dem Lieferstand — die CDE muss
 * selbst eine vergeben. Das Präfix `cde-` ist kein Zierrat: es ist die
 * Notbremse, falls irgendwo doch im gelieferten Modell danach gesucht wird.
 * (Der eigentliche Schutz ist `modell: 'cde'` am Eintrag — `betroffeneGlobalIds`
 * und `planeNachspielen` verzweigen darüber.)
 *
 * Kein IFC-konformer 22-Zeichen-Base64-Wert: das Bauteil steht nicht im
 * gelieferten IFC, und eine echte GUID vorzutäuschen wäre eine Behauptung
 * über Herkunft, die nicht stimmt.
 */
export function neueGlobalId() {
    const zufall = Math.random().toString(36).slice(2, 10);
    return `cde-${Date.now().toString(36)}-${zufall}`;
}

/**
 * Wo ein Bauteil LEBT, aus seiner Kennung gelesen.
 *
 * `modell: 'cde'` am Eintrag ist die AUSSAGE, das Präfix `cde-` ihr BEWEIS —
 * beide entstehen an derselben Stelle (`neueGlobalId`, `erzeugtEintrag`).
 * Fehlt die Aussage, gilt der Beweis. Der Anlass (Stufe 0 Aushub-Fachmodell,
 * 2026-09-10): 13 Stellen im Katalog schreiben `geloescht`-Schritte OHNE
 * `modell`; `ausfuehren` reicht dann das `modell` des Aufrufers durch — und
 * der Zeichenweg (`useEingabe`, also Gerinne und Ausheben mit gezeichnetem
 * Zug) reicht keins. Ein verborgenes eigenes DGM stand damit als `geliefert`
 * im Journal, das Nachspielen suchte es im Lieferstand („fehlt"), der Autor
 * baute es weiter — ZWEI Gelände lagen übereinander. Die Aussage an dreizehn
 * Stellen nachzutragen wäre die vierzehnte Gelegenheit, sie zu vergessen.
 */
export function modellVon(globalId) {
    return String(globalId ?? '').startsWith('cde-') ? 'cde' : 'geliefert';
}

/**
 * Ist dieser Eintrag (oder diese Kennung) ein EIGENES Bauteil?
 *
 * Die eine Leseseite fuer alle, die verzweigen muessen (Nachspielen,
 * Autor, Verdeckung). Ein Eintrag zaehlt als eigen, wenn er es SAGT oder
 * seine Kennung es BEWEIST — so heilen auch Journale von vor Stufe 0, die
 * die Aussage nicht tragen.
 */
export function istEigen(eintragOderGlobalId) {
    if (eintragOderGlobalId && typeof eintragOderGlobalId === 'object') {
        return eintragOderGlobalId.modell === 'cde' || modellVon(eintragOderGlobalId.globalId) === 'cde';
    }
    return modellVon(eintragOderGlobalId) === 'cde';
}

/**
 * Der Journaleintrag für ein erzeugtes Bauteil.
 *
 * `modell: 'cde'` ist das tragende Feld: daran erkennt das Nachspielen, dass
 * es dieses Bauteil NICHT im gelieferten Modell suchen darf — sonst meldete es
 * „fehlt" für alles, was man selbst angelegt hat, und der Konfliktzähler wäre
 * von der ersten Linie an unbrauchbar.
 *
 * Es gibt bewusst KEINE `basis`: Ein erzeugtes Bauteil hat keinen Lieferstand,
 * gegen den es sich vergleichen liesse. Der Drei-Wege-Vergleich greift bei ihm
 * gar nicht — es kann mit dem Planer nicht kollidieren, weil der Planer es
 * nicht kennt.
 */
export function erzeugtEintrag({ rezept, kategorie = null, name = '', parameter = {}, globalId = null }) {
    const r = rezeptNach(rezept);
    return {
        art: 'erzeugt',
        globalId: globalId ?? neueGlobalId(),
        modell: 'cde',
        nachher: {
            rezept,
            kategorie: (kategorie ?? r?.kategorieVorgabe ?? 'IFCBUILDINGELEMENTPROXY').toUpperCase(),
            name,
            bauform: r?.bauform ?? 'netz',
            parameter,
        },
    };
}

/**
 * Ein erzeugtes Bauteil wieder loswerden.
 *
 * `nachher: null` — dieselbe Sprache, die `standMitEintrag` schon spricht
 * („zurück zur Regel", der Eintrag fällt aus dem Stand). Kein zweiter
 * Mechanismus, keine eigene Art: `geloescht` bleibt dem GELIEFERTEN Bauteil
 * vorbehalten, wo tatsächlich etwas aus einem fremden Modell verschwindet.
 */
export function zuruecknahmeEintrag(globalId) {
    return { art: 'erzeugt', globalId, modell: 'cde', nachher: null };
}
