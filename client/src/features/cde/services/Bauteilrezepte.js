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

import { formeNach, verschiebeOperationen, kopienAlsVerweise } from './gelaende/Operationen.js';
import { dreieckeAusRaster, dreieckeMitFlicken } from './geometrie/SurfaceOps.js';
import { ENTITY_META } from '../data/entity-schema.js';
import { ABLEITUNGEN } from './ableitung/Ableitungen.js';
import { EINGEBAUTE_REZEPTE } from './rezept/Eingebaut.js';
import { rezeptAusDeklaration } from './rezept/Rezeptbau.js';
import { registriertNach } from './rezept/Register.js';
import { symbolNach } from './PlanSymbols.js';
import { LINIEN_BAND_M, dreiecksGeometrie, punkteAus, rohrKoerper } from './rezept/Geometriebau.js';
import { versetztePunkte, ringFlaeche } from './geometrie/hilfen.js';
// Default-Import: der benannte lief im Dev-Server und brach im vite build
// (CJS-Interop) — derselbe Weg wie in IfcShapeOutlines.
import polygonClipping from 'polygon-clipping';
import { abhaengige, erdbauStapelVon, quellenVon, urGelaendeVon } from './ableitung/Bezuege.js';

// Die Beziehungen zwischen Teilen sind Schnittstelle des Katalogs — die Oberfläche
// fragt hier, nicht in `ableitung/` (Teil XXIII A8, Wächter W1b).
export { abhaengige, quellenVon };
// Die Geometrie-Bausteine leben seit A4 in `rezept/Geometriebau.js` — die
// Schnittstelle dieses Moduls bleibt (Leitplanke 3).
export { LINIEN_BAND_M, punkteAus, rohrKoerper };

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
        // Im GRUNDRISS, wie die Geste „Ort auf der Achse zeigen" (2026-09-19).
        const d = Math.hypot(b[0] - a[0], b[2] - a[2]);
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

/**
 * Spiegeln (Teil XXIII, A6) — an einer Achse durch den Schwerpunkt, deren
 * Richtung `grad` in XZ angibt (gemessen wie beim Drehen: 0° = Ost). Die Höhen
 * bleiben. Ein gespiegelter Umriss läuft andersherum — die Flächen- und
 * Plattenrechnung normiert die Richtung selbst.
 */
export function spiegelePunktliste(parameter, grad, zentrum = null) {
    const punkte = parameter?.punkte;
    if (!Array.isArray(punkte) || !Number.isFinite(Number(grad))) return parameter;
    const c = zentrum ?? schwerpunktXZ(punkte);
    if (!c) return parameter;
    const w = (Number(grad) * Math.PI) / 180;
    const ax = Math.cos(w), az = Math.sin(w);
    return {
        ...parameter,
        punkte: punkte.map(p => {
            if (!Array.isArray(p) || p.length < 3) return p;
            const vx = p[0] - c.x, vz = p[2] - c.z;
            const t = vx * ax + vz * az;                   // Anteil längs der Achse
            return [c.x + 2 * t * ax - vx, p[1], c.z + 2 * t * az - vz];
        }),
    };
}

/** Gelände: die Operationsliste hebt `verschiebeOperationen` (Operationen.js). */
function _verschiebeGelaende(parameter, delta) {
    if (!Array.isArray(parameter?.operationen)) return parameter;
    return { ...parameter, operationen: verschiebeOperationen(parameter.operationen, delta) };
}


// ── Der Katalog (Teil XXIII, A4) ───────────────────────────────────────────
//
// Die Rezepte sind DATEN (`rezept/Eingebaut.js`); `rezeptAusDeklaration`
// macht daraus die Schnittstelle, die jeder Leser kennt. Neue Rezepte dort
// ergänzen — oder, ab A5, in der Bibliothek. Hier bleibt nur, was Code ist.

/**
 * Das Altrezept `gelaende` bleibt CODE (Entscheidung E1): es BRAUCHT etwas,
 * das kein Parameter sein darf — das Höhenraster des GELIEFERTEN Geländes.
 * Es ins Journal zu legen wäre Gesetz-5-Bruch (Gerechnetes gespeichert — und
 * veraltet still mit der nächsten Revision). Deshalb deklariert das Rezept
 * seinen Bedarf, und `baueErzeugte` reicht die Ableitung herein — die
 * Parameter bleiben rein deklarativ: Quelle + Operationsliste.
 */
const GELAENDE_REZEPT = Object.freeze({
    id: 'gelaende',
    art: 'code',
    titel: 'Geformtes Gelände',
    icon: 'terrain',
    bauform: 'hoehenfeld',
    kategorieVorgabe: 'IFCGEOGRAPHICELEMENT',
    mindestPunkte: 0,
    geschlossen: false,
    felder: [],
    // Ein GELÄNDE, keine Menge: gehört in den Mengen-Reiter neben die Erdbauten.
    gelaendeform: true,
    braucht: 'quellraster',
    baue: null,
    verschiebe: _verschiebeGelaende,
    baueMit: (parameter, quellraster) => {
        const { raster, warnungen } = formeNach(quellraster, parameter?.operationen ?? []);
        const { positions } = dreieckeAusRaster(raster);
        const geo = dreiecksGeometrie(positions);
        return { geometrie: geo, warnungen };
    },
});

/**
 * Die Quellen des Katalogs in ihrer Reihenfolge — Deklarationen und das eine
 * Code-Rezept. Der Architektur-Wächter (W5) zählt HIER die Funktionen: was
 * im Rezeptbau entsteht, ist einmal geschriebener Code, nicht je Rezept.
 */
export const REZEPT_QUELLEN = Object.freeze([
    ...EINGEBAUTE_REZEPTE.slice(0, 2),          // linie, flaeche
    GELAENDE_REZEPT,
    ...EINGEBAUTE_REZEPTE.slice(2),             // rohr, schacht, pfosten, platte
]);

export const REZEPTE = Object.freeze(Object.fromEntries(
    REZEPT_QUELLEN.map(d => [d.id, rezeptAusDeklaration(d)])));

/**
 * Das Rezept für ein Netzelement dieser Rolle (Teil XXIII, AE).
 *
 * Wer eine GELIEFERTE Kante teilt, verschiebt oder zusammenlegt, ersetzt sie
 * durch eigene Bauteile — aus WELCHEM Rezept, sagt der Katalog: das erste mit
 * dieser Netzrolle. Bis hierher stand `rezept: 'rohr'` bzw. `'schacht'` in
 * sechs Werkzeugen (Architektur-Wächter W3b).
 *
 * Wer ein EIGENES Bauteil teilt, behält dessen Rezept — sonst würde aus einem
 * Kanal der Bibliothek beim Teilen ein Rohr.
 * @param {'kante'|'knoten'} rolle
 * @param {object|null} [bauplan]  der Bauplan des Bauteils, das ersetzt wird
 */
export function rezeptFuerNetzrolle(rolle, bauplan = null) {
    if (bauplan?.rezept && rezeptNach(bauplan.rezept)?.netzrolle === rolle) return bauplan.rezept;
    return Object.values(REZEPTE).find(r => r.netzrolle === rolle)?.id ?? null;
}

/**
 * Ein Rezept nach Id. Nie `undefined` durchreichen — `null` ist die Antwort.
 *
 * Eingebaut zuerst, dann die Bibliothek (A5) — eine Bibliothek kann ein
 * eingebautes Rezept nicht überschreiben.
 */
export function rezeptNach(id) {
    const k = String(id ?? '');
    return REZEPTE[k] ?? registriertNach(k) ?? ABLEITUNGEN[k] ?? null;
}

/**
 * Wie ein erzeugtes Bauteil im LAGEPLAN erscheint — oder null (Teil XXIII, A5).
 *
 * Ein Zug aus seinen Punkten; nennt das Rezept ein Plansymbol, ein Symbol am
 * Ort — dann genügt ein Punkt (Pfosten), und zwei übereinander (Schacht) sind
 * kein unsichtbarer Nullstrich mehr. Der Lageplan zeichnet direkt aus dem
 * Journal; diese Regel steht hier, damit Canvas und Test dieselbe fragen.
 */
export function planbildVon(bauplan) {
    const punkte = bauplan?.parameter?.punkte;
    const rezept = rezeptNach(bauplan?.rezept);
    const symbol = rezept?.symbol && symbolNach(rezept.symbol) ? rezept.symbol : null;
    if (!Array.isArray(punkte) || punkte.length < (symbol ? 1 : 2)) return null;
    return { punkte, name: bauplan.name, geschlossen: !!rezept?.geschlossen, symbol };
}

/**
 * Der PredefinedType eines Bauteils — bei einem Ableitungsteil ABGELEITET aus
 * Rezept, Rolle und Parametern, nie aus dem Journal (Teil XXIII, A7, B15): ein
 * gespeicherter Wert veraltete still, sobald ein Werkzeug die Parameter ändert,
 * ohne ihn nachzurechnen. Ein gespeicherter Wert ist nur noch Rückfall
 * (Altbestand ohne Regel).
 */
export function predefinedTypeVon(bauplan) {
    const r = ABLEITUNGEN[bauplan?.rezept];
    const teil = r?.teile?.find(t => t.rolle === bauplan?.rolle);
    if (teil && teil.predefinedType !== undefined) {
        return typeof teil.predefinedType === 'function'
            ? (teil.predefinedType(bauplan.parameter ?? {}) ?? null) : (teil.predefinedType ?? null);
    }
    return bauplan?.predefinedType ?? null;
}

/** Eine Ableitung rechnet aus anderen Objekten (`leite`); ein Rezept baut aus Parametern (`baue`). */
export function istAbleitung(rezept) {
    return typeof rezept?.leite === 'function';
}

/** Kennung einer Ableitung — die Klammer um ihre Teile im Journal. */
export function neueAbleitungsId() {
    return `ab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

// ── Kennungen der Operationen (Teil XXIV, K2b — Fabios E3) ─────────────────
//
// Eine Operation eines Vorgangs (Planum, Grube, Schüttung …) ist bis hier die
// Nummer j in einer Liste — „fülle bis zum Planum P" konnte kein Ziel nennen,
// und ein Kommando, das eine Ecke zieht, hätte die Nummer tragen müssen. Jetzt
// trägt jede Operation eine Kennung `op-…`.

/** Eine neue Operationskennung — vom Aufrufer über die Kennungsquelle (E2), sonst Zufall. */
export function neueOperationsId() {
    return _kennungsquelle ? _kennungsquelle('operation') : zufallsKennung('operation');
}

/** FNV-1a über einen Text → Base36. Für abgeleitete Kennungen, nicht für Sicherheit. */
function _hash(text) {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(36);
}

/**
 * Die Operationen einer Liste MIT Kennung.
 *
 * Gespeicherte Kennungen gelten. Eine Operation aus der Zeit vor K2b hat keine;
 * sie bekommt eine aus ihrem INHALT abgeleitete (`op-alt-<hash>`). Die ist
 * stabil, solange sich die Operation nicht ändert — und ändern kann sie sich
 * nur durch einen Schreibvorgang, der ihr dann genau diese Kennung mitgibt
 * (`ableitungsSchritte`). Zwei gleiche Altoperationen in einer Liste werden
 * durchgezählt, damit keine Kennung doppelt ist.
 */
export function operationenMitKennung(liste) {
    const gesehen = new Map();
    return (liste ?? []).map((op) => {
        if (!op || typeof op !== 'object') return op;
        if (op.id) return op;
        const basis = `op-alt-${_hash(JSON.stringify({ art: op.art ?? null, parameter: op.parameter ?? null }))}`;
        const n = (gesehen.get(basis) ?? 0) + 1;
        gesehen.set(basis, n);
        return { ...op, id: n === 1 ? basis : `${basis}-${n}` };
    });
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
 *   operationen  alle Operationen des Stapels mit GESPEICHERTER Kennung, in
 *              Stapelreihenfolge, je mit `vorgang` — das, worauf ein Kommando
 *              über seinen Vorgang hinaus zeigen darf (Durchstich 2, E3)
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
        // Nur mit gespeicherter Kennung: eine Operation von vor K2b hätte hier
        // eine aus ihrem Inhalt abgeleitete (`op-alt-…`), und die kennt der
        // Lauf nicht — er rechnet in Welt, der Inhalt steht in NN. Adressierbar
        // wird sie, sobald ihr Vorgang einmal neu geschrieben ist.
        operationen: vorgaenge.flatMap(v => (v.bauplan?.parameter?.operationen ?? [])
            .filter(op => op?.id).map(op => ({ ...op, vorgang: v.ableitung }))),
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
                                     operationen = [], name = '', bestehend = null, vorgaenge = null,
                                     auflockerung = null } = {}) {
    const r = ABLEITUNGEN[rezept];
    if (!r) throw new Error(`Ableitung „${rezept}" gibt es nicht`);
    const ableitung = bestehend?.ableitung ?? neueAbleitungsId();
    const vorhanden = bestehend?.teile instanceof Map ? bestehend.teile : new Map(Object.entries(bestehend?.teile ?? {}));
    // JEDE OPERATION TRÄGT EINE KENNUNG (Teil XXIV, K2b — E3). Eine neue
    // bekommt ihre vom Aufrufer (Kennungsquelle); eine aus der Zeit vor K2b,
    // die an derselben Stelle der bisherigen Liste stand, behält die aus ihrem
    // bisherigen Inhalt abgeleitete — die, mit der ein Kommando sie eben
    // angesprochen hat. Die Stelle zählt hier nur beim Schreiben, gespeichert
    // wird die Kennung.
    const bisher = [...vorhanden.values()].find(t => Array.isArray(t?.bauplan?.parameter?.operationen))?.bauplan.parameter.operationen ?? [];
    const bisherMitKennung = operationenMitKennung(bisher);
    operationen = (operationen ?? []).map((op, j) => {
        if (!op || typeof op !== 'object' || op.id) return op;
        const alt = bisher[j] && !bisher[j].id ? bisherMitKennung[j].id : null;
        return { ...op, id: alt ?? neueOperationsId() };
    });
    // EINE KOPIE WIRD EIN VERWEIS (Teil XXIV-4): wird ein Vorgang neu
    // geschrieben, bekommt eine Operation, die bisher die Höhe ihrer
    // Vorgängerin kopiert hat, einen Verweis auf deren Fläche. Nur beim
    // Anfassen — ein Journal, das niemand schreibt, bleibt, wie es ist.
    if (bestehend) operationen = kopienAlsVerweise(bisherMitKennung, operationen);
    // `vorgaenge` trägt nur die Anzeige (Stufe 1): die Reihenfolge der
    // Erdbau-Vorgänge — eine Entscheidung, nichts Gerechnetes.
    // `auflockerung` gehört dem VORGANG, nicht einer Operation: sie ändert
    // keine Geometrie, nur die Menge, die abgefahren wird (Teil XXI, P4).
    const parameter = { quellen, quellBasis, raster, operationen,
                        ...(vorgaenge ? { vorgaenge } : {}),
                        ...(Number.isFinite(Number(auflockerung)) ? { auflockerung: Number(auflockerung) } : {}) };
    const vorhandene = vorhanden;
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
                // Abgeleitet — Leser fragen `predefinedTypeVon`; in die DATEI
                // kommt er ab Schreibstufe 3 nicht mehr (`JournalFormat`).
                predefinedType: pt,
                name: typeof teil.name === 'function' ? teil.name(name || r.titel) : (teil.name ?? name),
                parameter,
            },
        };
    }).concat(nachgezogen);
}

/** Dieselben Punkte, um `d` tiefer — eine Kopie, die Kernel-Form bleibt unberührt. */
function _abgesenkt(positions, d) {
    const p = Float64Array.from(positions);
    for (let i = 1; i < p.length; i += 3) p[i] -= d;
    return p;
}

/**
 * Die Kernel-Form eines gebauten Teils → BufferGeometry, Float32 erst hier.
 * Raster werden trianguliert (Löcher bleiben Löcher), Körper und Netze
 * gehen so, wie sie sind.
 *
 * `absenkung` ist eine DARSTELLUNGSgrösse (Teil XXI, `ERDKOERPER_ABSENKUNG`):
 * ein Erdkörper, dessen Deckel die Geländeanzeige IST, liegt im Raum zwei
 * Zentimeter tiefer, damit nicht jeder Bildpunkt neu entscheidet, welche der
 * beiden Flächen vorn liegt. Der Export ruft ohne — im IFC steht, was
 * gerechnet wurde.
 */
export function geometrieAusTeil(teil, { absenkung = 0 } = {}) {
    if (!teil) return null;
    const fertig = (positions, triCount) => {
        if (!triCount) return null;
        return dreiecksGeometrie(absenkung ? _abgesenkt(positions, absenkung) : positions);
    };
    if (teil.form === 'raster') {
        // Die Geländeanzeige als Lieferung mit Aussparung (Teil XXII) — das
        // Raster steht daneben für Leser, die ein Raster brauchen.
        if (teil.anzeigeNetz?.triCount) return fertig(teil.anzeigeNetz.positions, teil.anzeigeNetz.triCount);
        // Feine Flicken (Teil XX): die Anzeige wird dort fein, wo Operationen wirken.
        const { positions, triCount } = teil.flicken?.length
            ? dreieckeMitFlicken(teil.daten, teil.flicken)
            : dreieckeAusRaster(teil.daten);
        return fertig(positions, triCount);
    }
    if (teil.form === 'koerper' || teil.form === 'mesh') {
        return fertig(teil.daten?.positions, teil.daten?.triCount);
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
    // Ein Rezept aus einer BIBLIOTHEK, die hier nicht geladen ist (A5): das
    // Bauteil wird übersprungen und gemeldet, nie gelöscht.
    if (!r) return [`Rezept „${rezept}" gibt es nicht — stammt es aus einer Bibliothek, die hier nicht geladen ist?`];

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
 *
 * WER DIE KENNUNG VERGIBT (Teil XXIV, K1 — Fabios Entscheidung E2): der
 * AUFRUFER, im Kommando (`neu`). Das Werkzeug fragt hier weiter nach einer
 * Kennung, beantwortet wird die Frage aber von der Kennungsquelle, die die
 * Auswertung eines Kommandos setzt (`mitKennungen`). Ohne Kommando — ein Test
 * oder die Vorschau ruft `anwenden` direkt — gilt die Zufallskennung; ein
 * solches Ergebnis wird nie eingetragen.
 */
let _kennungsquelle = null;
export function neueGlobalId() {
    return _kennungsquelle ? _kennungsquelle('bauteil') : zufallsGlobalId();
}

/** Eine frische Zufallskennung `cde-<Zeit>-<Zufall>` — der Kennungsgeber der Oberfläche. */
export function zufallsGlobalId() {
    const zufall = Math.random().toString(36).slice(2, 10);
    return `cde-${Date.now().toString(36)}-${zufall}`;
}

/** Die Präfixe der Kennungsarten — `neu` in einem Kommando trägt beide (E2, E3). */
export const KENNUNGS_PRAEFIX = Object.freeze({ bauteil: 'cde-', operation: 'op-' });

/** Eine frische Zufallskennung der Art `bauteil` oder `operation`. */
export function zufallsKennung(art = 'bauteil') {
    if (art === 'operation') return `op-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    return zufallsGlobalId();
}

/**
 * `fn` auswerten, während neue Kennungen aus `quelle` kommen.
 *
 * NUR SYNCHRON: die Quelle ist Modulzustand und gilt genau für die Dauer des
 * Aufrufs. Eine Auswertung, die ein Versprechen zurückgäbe, liefe nach dem
 * Zurücksetzen weiter und zöge Zufallskennungen — das wäre ein stiller Bruch
 * von E2. Deshalb wirft es dann, statt es hinzunehmen.
 */
export function mitKennungen(quelle, fn) {
    const vorher = _kennungsquelle;
    _kennungsquelle = quelle;
    try {
        const aus = fn();
        if (aus && typeof aus.then === 'function') throw new Error('mitKennungen: die Auswertung muss synchron sein');
        return aus;
    } finally {
        _kennungsquelle = vorher;
    }
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

/**
 * Einen ERDBAU-VORGANG wieder loswerden (Abnahme 2026-09-12, A6: „können
 * nichts ausgeblendet oder gelöscht werden").
 *
 * „Löschen" am Aushub blendete nur den Körper aus — die Grube steckt in der
 * Anzeige des Geländes (`parameter.vorgaenge`), und der geformte Boden blieb.
 * Das hier ist die Umkehrung dessen, was ein Erdbau-Werkzeug schreibt
 * (`Bearbeitungen._gelaendeSchritte`): jedes Teil der Klammer zurücknehmen,
 * die Anzeige ohne den Vorgang neu schreiben — und war er ihr letzter, die
 * Anzeige zurücknehmen und das Ur-Gelände wieder zeigen. Spätere Vorgänge
 * rechnet der nächste Aufbau über den kürzeren Stapel neu.
 *
 * @param {Map<string, object>} stand     wirksamer Stand `erzeugt`
 * @param {string} ableitung              die Klammer des Vorgangs
 * @param {object} [o]
 * @param {Map<string, *>} [o.geloescht]  wirksamer Stand `geloescht` — ist das Ur verborgen?
 * @returns {Array<object>} Einträge für EINEN Vorgang; leer, wenn es die Klammer nicht gibt
 */
export function vorgangEntfernenSchritte(stand, ableitung, { geloescht = new Map() } = {}) {
    if (!ableitung || !stand?.size) return [];
    const out = [];
    for (const [gid, wert] of stand) {
        if (wert?.ableitung === ableitung && wert?.rezept !== 'anzeige') out.push(zuruecknahmeEintrag(gid));
    }
    if (!out.length) return [];
    for (const [gid, wert] of stand) {
        if (wert?.rezept !== 'anzeige') continue;
        const liste = wert.parameter?.vorgaenge ?? [];
        if (!liste.some(v => v?.ableitung === ableitung)) continue;
        const rest = liste.filter(v => v?.ableitung !== ableitung);
        if (rest.length) {
            out.push({ art: 'erzeugt', globalId: gid, modell: 'cde',
                       nachher: { ...wert, parameter: { ...wert.parameter, vorgaenge: rest } } });
            continue;
        }
        out.push(zuruecknahmeEintrag(gid));
        const ur = wert.parameter?.quellen?.gelaende ?? null;
        if (ur && geloescht?.has?.(ur)) {
            out.push({ art: 'geloescht', globalId: ur, nachher: null, ...(modellVon(ur) === 'cde' ? { modell: 'cde' } : {}) });
        }
    }
    return out;
}
