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
import { formeNach } from './gelaende/Operationen.js';
import { dreieckeAusRaster } from './geometry/SurfaceOps.js';
import { ENTITY_META } from '../data/entity-schema.js';

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

/** Kennt das IFC-4.3-Wörterbuch diesen Typ? */
export function istKategorie(name) {
    return !!ENTITY_META[String(name ?? '').toUpperCase().trim()];
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
function rohrGeometrie(punkte, dnMm = 300, seiten = 12) {
    if (punkte.length < 2) return null;
    const r = (Number(dnMm) || 300) / 2000;          // mm Durchmesser → m Radius
    if (!(r > 0)) return null;

    const ecken = [];
    const indizes = [];
    const OBEN = new THREE.Vector3(0, 1, 0);

    for (let i = 0; i < punkte.length; i++) {
        const hier = alsVec3(punkte[i]);
        const vor = i > 0 ? alsVec3(punkte[i - 1]) : null;
        const nach = i < punkte.length - 1 ? alsVec3(punkte[i + 1]) : null;
        const richtung = new THREE.Vector3();
        if (vor) richtung.add(hier.clone().sub(vor).normalize());
        if (nach) richtung.add(nach.clone().sub(hier).normalize());
        if (richtung.lengthSq() < 1e-12) richtung.set(1, 0, 0);
        richtung.normalize();

        // Ein Rahmen senkrecht zur Achse. Läuft die Achse fast senkrecht,
        // taugt „oben" nicht als Bezug — dann wird die X-Achse genommen.
        const bezug = Math.abs(richtung.dot(OBEN)) > 0.99
            ? new THREE.Vector3(1, 0, 0)
            : OBEN;
        const u = new THREE.Vector3().crossVectors(bezug, richtung).normalize();
        const v = new THREE.Vector3().crossVectors(richtung, u).normalize();

        for (let k = 0; k < seiten; k++) {
            const w = (k / seiten) * Math.PI * 2;
            ecken.push(
                hier.x + (u.x * Math.cos(w) + v.x * Math.sin(w)) * r,
                hier.y + (u.y * Math.cos(w) + v.y * Math.sin(w)) * r,
                hier.z + (u.z * Math.cos(w) + v.z * Math.sin(w)) * r,
            );
        }
    }

    for (let i = 0; i < punkte.length - 1; i++) {
        for (let k = 0; k < seiten; k++) {
            const a = i * seiten + k;
            const b = i * seiten + ((k + 1) % seiten);
            const c = a + seiten;
            const d = b + seiten;
            indizes.push(a, c, b, b, c, d);
        }
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(ecken, 3));
    g.setIndex(indizes);
    g.computeVertexNormals();
    return g;
}

/** Nicht-indizierte Dreiecksliste (Welt) → BufferGeometry mit Normalen. */
function dreiecksGeometrie(positions) {
    if (!positions?.length) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(positions), 3));
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

/** Gelände: Achse/Umriss sind Grundriss-{x,z}; Sohlen/Höhen sind m NN und
 *  hängen NICHT am Rahmen — sie bleiben stehen. */
function _verschiebeGelaende(parameter, delta) {
    const ops = parameter?.operationen;
    if (!Array.isArray(ops)) return parameter;
    const punktXZ = (p) => (p && Number.isFinite(p.x) && Number.isFinite(p.z)
        ? { ...p, x: p.x + delta.x, z: p.z + delta.z } : p);
    return {
        ...parameter,
        operationen: ops.map(op => ({
            ...op,
            parameter: {
                ...op.parameter,
                ...(Array.isArray(op.parameter?.achse) ? { achse: op.parameter.achse.map(punktXZ) } : {}),
                ...(Array.isArray(op.parameter?.umriss) ? { umriss: op.parameter.umriss.map(punktXZ) } : {}),
            },
        })),
    };
}

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
            { name: 'hoehe', titel: 'Höhe', einheit: 'm', typ: 'zahl', leerErlaubt: true },
        ],
        verschiebe: _verschiebePunktliste,
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
        baue: (parameter) => rohrGeometrie(punkteAus(parameter), parameter?.dn, 16),
    },
});

/** Ein Rezept nach Id. Nie `undefined` durchreichen — `null` ist die Antwort. */
export function rezeptNach(id) {
    return REZEPTE[String(id ?? '')] ?? null;
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
    if (!istKategorie(typ)) fehler.push(`„${typ}" ist kein IFC-Typ`);
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
    const raster = await holeQuellraster?.(quelle);
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
