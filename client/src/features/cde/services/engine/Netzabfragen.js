/**
 * Netzabfragen — aus der IfcEngine ausgelagert (Teil XXIII, A8; Befund B13).
 *
 * Das Netz je Modell, Anschlüsse eines Knotens, Griffpunkte der Knoten.
 *
 * Jede Funktion bekommt die Engine als ersten Parameter (`engine`) und liest
 * nur, was sie braucht; die Engine behält eine einzeilige Weiterleitung, damit
 * ihre Aufrufer (Viewer, Tests) unverändert bleiben.
 */
import { CDE_MODELL_ID } from '../IfcAutor.js';
import { anschluesseMitAchsen, baueNetz } from '../Netztopologie.js';
import { achsbezugDerAchse } from '../Achsbezug.js';

/**
 * Das Netz eines Modells — wer hängt an wem (Stufe 14.5).
 *
 * Aus der XY-Koinzidenz, nicht aus erklärten IFC-Beziehungen: die gibt es
 * in den echten Dateien nicht (null Ports, null Connects). Gebaut wird auf
 * Anfrage, nicht beim Laden — es ist eine Auskunft, kein Zustand.
 */
export function netzVon(engine, modelId, { toleranz } = {}) {
    const achsen = engine.achsenVon(modelId);
    const knoten = engine._knoten?.get(modelId) ?? new Map();
    const verdeckt = engine._verdeckt ?? new Set();

    const kanten = [];
    for (const [id, a] of achsen) {
        // Verdeckte bleiben draussen: ein ausgeblendetes Bauteil, das
        // weiter verkettet und Befunde trägt, ist ein Geist im Netz.
        if (a.globalId && verdeckt.has(a.globalId)) continue;
        kanten.push({ id, anfang: a.anfang, ende: a.ende, dn: a.dn, laenge: a.laenge,
                      achsbezug: achsbezugDerAchse(a), sohlabstand: a.sohlabstand ?? null });
    }
    for (const [gid, k] of engine._cdeKanten ?? new Map()) {
        if (verdeckt.has(gid)) continue;
        kanten.push({ id: `cde:${gid}`, anfang: k.anfang, ende: k.ende, dn: k.dn, laenge: k.laenge,
                      achsbezug: k.achsbezug ?? 'mitte', sohlabstand: k.sohlabstand ?? null,
                      anschluss: k.anschluss ?? null });
    }

    const knotenListe = [];
    for (const [id, k] of knoten) {
        if (k.globalId && verdeckt.has(k.globalId)) continue;
        knotenListe.push({ id, punkt: k.punkt, globalId: k.globalId ?? null });
    }
    for (const [gid, k] of engine._cdeKnoten ?? new Map()) {
        if (verdeckt.has(gid)) continue;
        knotenListe.push({ id: `cde:${gid}`, punkt: k.punkt, globalId: gid });
    }

    return baueNetz({ kanten, knoten: knotenListe, toleranz });
}

/**
 * Die Anschlüsse eines Bauwerks — welche Haltung mit welchem Ende (14.8).
 *
 * Gebraucht fürs Schachtverschieben: die angeschlossenen Haltungen können
 * sich NICHT starr mitbewegen, denn nur EIN Ende wandert; das andere bleibt
 * am Nachbarschacht. Das ist eine Formänderung, und darum muss der Aufrufer
 * wissen, welches Ende gemeint ist.
 *
 * Wie überall in dieser Ecke aus der XY-Koinzidenz — es gibt in den echten
 * Dateien keine erklärten Anschlüsse.
 */
export function anschluesseVon(engine, modelId, localId) {
    return anschluesseMitAchsen(engine.netzVon(modelId), localId, (id) => engine.achseVon(modelId, id));
}

/**
 * Die Anschlüsse eines Schachts, nach ENDEN sortiert (G1): `nah` ist das
 * Ende an DIESEM Schacht (es wandert mit), `fern` das andere (es bleibt).
 * Genau die Form, die die Fanglinien und die Anschluss-Vorschau brauchen —
 * `anschluesseVon` liefert dieselben Daten, aber der Aufrufer müsste die
 * Enden selbst auseinanderhalten, und das ist die Sorte Zuordnung, die
 * irgendwann EIN Aufrufer falsch macht.
 */
/**
 * Die Anschlüsse eines Bauwerks über seine GLOBALID — geliefert oder
 * selbst gesetzt (Teil XVII, B2). Ein CDE-Schacht wohnt im Netz unter
 * `cde:<gid>`; `anschluesseVon` verlangte bisher den Ort eines
 * gelieferten Knotens, und ein eigener Schacht bekam so nie den
 * Mitführen-Regler. EIN Weg: dasselbe Netz, derselbe Eintrag.
 */
export function anschluesseFuer(engine, globalId) {
    if (!globalId) return [];
    const ort = engine.schachtOrt(globalId);
    if (ort) return engine.anschluesseVon(ort.modelId, ort.localId);
    if (engine._cdeKnoten?.has(globalId) && !engine._verdeckt?.has(globalId)) {
        return engine.anschluesseVon(_netzModellFuerEigene(engine), `cde:${globalId}`);
    }
    return [];
}

/**
 * Das Modell, dessen Netz die EIGENEN Kanten und Knoten mitführt: das Netz
 * eines beliebigen Modells trägt die CDE-Teile; ohne geliefertes Modell reicht
 * das leere Achsenband. EINE Regel für Anschlüsse und Netzauskunft.
 */
function _netzModellFuerEigene(engine) {
    return [...(engine._achsen?.keys() ?? [])][0] ?? CDE_MODELL_ID;
}

/**
 * Die NETZAUSKUNFT für ein eigenes Subjekt (Teil XXIV, K3): das Netz samt
 * gelieferter Kanten, die Achse je Kanten-Id und alle Knoten. `subjektAusStand`
 * nimmt sie im Viewer; ohne Oberfläche baut es dieselbe Auskunft aus dem
 * Journal (`CdeAchsen.eigeneNetzauskunft`). Die Felder am Subjekt entstehen so
 * an EINER Stelle, nur der Umfang des Netzes unterscheidet sich.
 */
export function netzAuskunft(engine) {
    const modelId = _netzModellFuerEigene(engine);
    return {
        netz: engine.netzVon(modelId),
        achseVon: (id) => engine.achseVon(modelId, id),
        knoten: [...schachtPunkteVon(engine, modelId)]
            .map(([globalId, pk]) => ({ globalId, punkt: { x: pk.x, y: pk.y, z: pk.z }, name: pk.name ?? '',
                                         // Ein eigener Knoten steht auf seiner Sohle (K8).
                                         ...(engine._cdeKnoten?.has(globalId) ? { hoehenbezug: 'sohle', hoeheFest: true } : {}) })),
    };
}

/**
 * Der Strang ab diesem Bauteil — die Kette stromab (Stufe 14.6).
 *
 * Angereichert um GlobalId und Achse, damit der Katalog rein bleiben kann:
 * `anwenden(el, werte)` bekommt die fertige Kette am Bauteil und muss
 * weder Netz noch Engine kennen. Dasselbe Vorgehen wie bei `achse`.
 *
 * Die Kette endet am Abzweig — welche Haltung dort gemeint ist, kann nur
 * ein Mensch entscheiden (siehe `strangAb` in Netztopologie.js).
 */
/**
 * Alle Schachtknoten eines Modells: GlobalId → Punkt (+Name).
 *
 * ZWEI Verbraucher, EIN Mass (Stufe 16): das Anschliessen (nächster
 * Schacht zum Tipp) und das Nachführen beim Nachspielen (hat der Planer
 * den Schacht bewegt?). `zielBasis` am Journaleintrag und der
 * eingefrorene Vergleichswert kommen BEIDE hier heraus — zwei
 * verschiedene Masse (Knoten vs. Hüllen-Anker) hätten still „bewegt"
 * gemeldet, wo nur zweierlei gemessen wurde.
 */
export function schachtPunkteVon(engine, modelId) {
    const knoten = engine._knoten?.get(modelId) ?? new Map();
    const verdeckt = engine._verdeckt ?? new Set();
    const karte = new Map();
    for (const [, k] of knoten) {
        if (!k.globalId || verdeckt.has(k.globalId)) continue;
        karte.set(k.globalId, { x: k.punkt.x, y: k.punkt.y, z: k.punkt.z, name: k.name ?? '' });
    }
    // Selbst gesetzte Schächte sind Anschluss- und Bezugsziele wie
    // gelieferte — dasselbe Mass, dieselbe Karte.
    for (const [gid, k] of engine._cdeKnoten ?? new Map()) {
        if (verdeckt.has(gid)) continue;
        karte.set(gid, { x: k.punkt.x, y: k.punkt.y, z: k.punkt.z, name: k.name ?? '' });
    }
    return karte;
}

/**
 * Alle Schacht-Griffe für den Lageplan (G1) — über ALLE Modelle.
 *
 * Dieselben Knoten wie `schachtPunkteVon`, aber mit Modell- und
 * Herkunftskennung: Gelieferte Schächte bekommen einen Griff
 * (verschieben = Forderung an den Planer), CDE-eigene NICHT — deren Ort
 * lebt im `erzeugt`-Bauplan, und eine `lage` darauf würde vom Fachmodell
 * nie gelesen (17.3: Kanten und Knoten kommen aus den Bauplan-Parametern).
 * Sie hier trotzdem anzubieten hieße, einen Griff zu zeigen, der nichts
 * bewegt.
 */
export function knotenGriffe(engine) {
    const verdeckt = engine._verdeckt ?? new Set();
    const out = [];
    for (const [modelId, knoten] of engine._knoten ?? new Map()) {
        for (const [localId, k] of knoten) {
            if (!k.globalId || verdeckt.has(k.globalId)) continue;
            out.push({
                globalId: k.globalId, name: k.name ?? '', modelId, localId,
                punkt: { x: k.punkt.x, y: k.punkt.y, z: k.punkt.z },
                herkunft: 'geliefert',
            });
        }
    }
    for (const [gid, k] of engine._cdeKnoten ?? new Map()) {
        if (verdeckt.has(gid)) continue;
        out.push({
            globalId: gid, name: k.name ?? '', modelId: null, localId: null,
            punkt: { x: k.punkt.x, y: k.punkt.y, z: k.punkt.z },
            herkunft: 'cde',
        });
    }
    return out;
}
