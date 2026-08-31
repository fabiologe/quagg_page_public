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
function flaechenGeometrie(punkte, hoehe = 0) {
    if (punkte.length < 3) return null;
    const umriss = punkte.map(p => new THREE.Vector2(p[0], p[2]));
    const dreiecke = THREE.ShapeUtils.triangulateShape(umriss, []);
    if (!dreiecke.length) return null;

    const ecken = [];
    for (const p of umriss) ecken.push(p.x, hoehe, p.y);
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
export const REZEPTE = Object.freeze({
    linie: {
        id: 'linie',
        titel: 'Linie',
        icon: 'measure',
        bauform: 'linie',
        kategorieVorgabe: 'IFCANNOTATION',
        mindestPunkte: 2,
        geschlossen: false,
        felder: [
            { name: 'name', titel: 'Bezeichnung', typ: 'text', leerErlaubt: true },
            { name: 'kategorie', titel: 'IFC-Typ', typ: 'text' },
            { name: 'hoehe', titel: 'Höhe', einheit: 'm', typ: 'zahl', leerErlaubt: true },
        ],
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
        baue: (parameter) => flaechenGeometrie(punkteAus(parameter), Number(parameter?.hoehe) || 0),
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
