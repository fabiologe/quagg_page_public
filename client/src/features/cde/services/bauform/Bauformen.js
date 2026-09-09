/**
 * Bauformen — wonach sich ein Bauteil bearbeiten lässt (Stufe 9.0b).
 *
 * DAS PROBLEM: Es gibt unbegrenzt viele IFC-Typen, und mit jeder Schema-Fassung
 * kommen welche dazu. Wer Bearbeitungs-Operationen an TYPEN hängt, schreibt
 * Code in der Größenordnung O(Typen) — und ist immer hinterher.
 *
 * DIE AUFLÖSUNG: Operationen hängen an der BAUFORM. Ein Bauteil ist fürs
 * Bearbeiten nicht „IfcPipeSegment", sondern „Achse mit Profil".
 *
 * Die acht Bauformen sind nach der DIMENSION dessen sortiert, was man zeichnet,
 * mit den „+ Extrusion"-Spielarten:
 *
 *     0D    punkt           Ort (+ Drehung)
 *     1D    linie           Kurve OHNE Querschnitt, 2D oder 3D
 *     1D+   achse+profil    Kurve MIT Querschnitt (Schwelkörper)
 *     2D    flaeche         Region OHNE Dicke
 *     2D+   flaeche+dicke   Region MIT Stärke
 *     2,5D  hoehenfeld      Oberfläche z = f(x,y)
 *     3D    koerper         platziertes Volumen
 *     —     netz            Freiform, Rückfall
 *
 * Das ist eine SYSTEMATIK, keine Beispielsammlung — es gibt keine neunte
 * Dimension. IFC-Fassungen fügen Typen hinzu, aber keine neue Art, wie
 * Geometrie im Raum existieren kann. „Sohlhöhe setzen" hängt an `achse+profil`
 * und bedient damit Rohr, Kanal, Bordstein — und den Typ, den noch niemand
 * gesehen hat.
 *
 * `linie` und `flaeche` sind eigenständig, nicht Sonderfälle mit Maß null.
 * Zwei Belege: IFC selbst führt `IfcAlignment` unter `IfcPositioningElement` —
 * einem ANDEREN Ast als `IfcElement`; eine Trasse ist etwas, das positioniert,
 * kein Bauteil mit Volumen. Und die Geländeoperationen brauchen beide als
 * EINGABE: das Gerinne eine Achse, der Aushub ein Polygon, die Bruchkante eine
 * 3D-Polylinie. Als eigene Bauformen zeichnet man eine Bruchkante einmal, und
 * Gelände wie Lageplan benutzen dieselbe.
 *
 * BEWUSST KEINE eigenen Bauformen: Öffnung/Abzugskörper (ein `koerper` in einer
 * ROLLE — Rolle ist keine Form), Gruppe/Aggregat (eine Beziehung), Beschriftung
 * (Planinhalt aus Stufe 7, lebt auf dem Blatt), und 2D- gegen 3D-Linie (ob
 * Höhen dranhängen, ist eine EIGENSCHAFT der Linie und verdoppelte sonst jede
 * Operation).
 *
 * WOHER DIE BAUFORM KOMMT: Sie wird DEKLARIERT (Bauplan, Auslegung, Regel,
 * Typprofil — siehe `deklarierteBauform`), und die Geometrie sagt dann nur,
 * wie belastbar die Deklaration im konkreten Modell ist (Güte).
 *
 * OHNE Deklaration — und das ist in IFC der Normalfall, nicht die Ausnahme:
 * Sammeltypen (`IfcBuildingElementProxy`, `IfcCivilElement`), gestrichene
 * Typen, exporteureigene Namen — misst die Geometrie eine FORMSIGNATUR
 * (Formsignatur.js) und macht daraus einen VORSCHLAG mit Güte `geschaetzt`.
 * Bis zum 2026-09-07 kannte dieser Rückfall nur „echte Achse", „geschlossen",
 * „sonst netz" — fünf der acht Formen waren ohne Deklaration unerreichbar,
 * und ein Gelände als `IfcCivilElement` bekam kein einziges Werkzeug.
 *
 * Die Sorge dahinter bleibt richtig: ein Turm aus Schwellwerten, der je Modell
 * nachjustiert wird, ist nie fertig. Deshalb sind es vier physikalische
 * Zahlen an einer Stelle, drei davon einheitenfrei — und vor allem: der
 * Vorschlag steht SICHTBAR mit seinem gemessenen Grund in Toolbox und Panel
 * und wird mit einem Klick zur Auslegung oder Regel. Was der Mensch bestätigt,
 * ist ab dann Datum und überstimmt die Messung. Die Geometrie schlägt vor,
 * sie erklärt nicht.
 *
 * SPIEGELBILD: `GeometryResolver` nennt sich selbst „Form-Typsystem" und löst
 * die Frage „welche Form kann ich aus diesem Element LESEN?". Diese Datei
 * beantwortet „als welche Form darf ich es SCHREIBEN?" — mit denselben
 * Formnamen und derselben Provenienz-Ehrlichkeit: kein stilles Scheitern,
 * `netz` ist ein Ergebnis, `undefined` nie.
 */

import { bauformAusNetz } from './Formsignatur.js';

/** Die acht Bauformen. Neue Formen hier ergänzen — sonst nirgends. */
export const BAUFORMEN = Object.freeze({
    punkt: {
        titel: 'Punktobjekt',
        beschreibung: 'Ort (+ Drehung)',
        beispiele: 'Baum, Schild, Leuchte, Ausstattung',
        braucht: null,
    },
    linie: {
        titel: 'Linie',
        beschreibung: 'Kurve ohne Querschnitt, 2D oder 3D',
        beispiele: 'Trasse (IfcAlignment), Bruchkante, Grenze, Absteckung',
        braucht: 'axis',
    },
    'achse+profil': {
        titel: 'Achse mit Profil',
        beschreibung: 'Querschnitt entlang einer Kurve',
        beispiele: 'Rohr, Kanal, Träger, Bordstein, Kabeltrasse',
        /** Welche Form der Resolver liefern muss, damit die Bauform trägt. */
        braucht: 'axis',
    },
    flaeche: {
        titel: 'Fläche',
        beschreibung: 'Region ohne Dicke',
        beispiele: 'Baufeld, Flurstück, Aushubpolygon, IfcSpace-Umriss',
        // Eine Region liefert eine Oberfläche. Eine eigene Form 'polygon' im
        // Resolver wäre ehrlicher — die kommt, wenn die Zeichenwerkzeuge sie
        // wirklich brauchen, nicht auf Vorrat.
        braucht: 'surface',
    },
    'flaeche+dicke': {
        titel: 'Fläche mit Dicke',
        beschreibung: 'ebene Fläche mit Stärke',
        beispiele: 'Wand, Decke, Platte, Fundament, Belag',
        braucht: 'solid',
    },
    hoehenfeld: {
        titel: 'Höhenfeld',
        beschreibung: '2,5D-Oberfläche',
        beispiele: 'Gelände, Planum, Aushubsohle',
        braucht: 'surface',
    },
    koerper: {
        titel: 'Körper',
        beschreibung: 'Volumen an einem Ort',
        beispiele: 'Schacht, Pumpe, Armatur, Ausrüstung',
        braucht: 'solid',
    },
    netz: {
        titel: 'Freiform',
        beschreibung: 'passt in keine andere Form — nur generische Operationen',
        beispiele: 'alles Übrige',
        braucht: null,
    },
});

/**
 * Güte, absteigend. Eine Operation nennt ihre Mindestgüte; was darunter liegt,
 * wird nicht angeboten — statt auf schlechten Daten still Unsinn zu rechnen.
 */
export const GUETE_STUFEN = Object.freeze(['gemessen', 'geschaetzt', 'unbekannt']);

/** true, wenn `guete` mindestens so gut ist wie `mindestens`. */
export function guetegenuegt(guete, mindestens = 'unbekannt') {
    const a = GUETE_STUFEN.indexOf(guete);
    const b = GUETE_STUFEN.indexOf(mindestens);
    if (a < 0 || b < 0) return false;
    return a <= b;
}

/**
 * Ist `name` eine bekannte Bauform?
 * Ein Typprofil kann Unsinn enthalten (es ist Nutzerdatum) — dann gilt es nicht.
 */
export function istBauform(name) {
    return Object.prototype.hasOwnProperty.call(BAUFORMEN, name);
}

// ── Ableitung ───────────────────────────────────────────────────────────────

/**
 * Die Güte einer Achse aus der Provenienz des Resolvers ablesen.
 *
 * `source: 'axisRep'` heißt: das IFC führt eine echte Achs-Repräsentation, die
 * der Planer gezeichnet hat. Alles andere ist Skelettierung aus dem Netz —
 * brauchbar zum Anzeigen, aber keine Grundlage, auf der man eine Sohlhöhe
 * festschreibt, ohne es dazuzusagen.
 */
/**
 * Wie belastbar ist diese Achse?
 *
 * ZWEI Quellen gelten als gemessen: die deklarierte `Axis`-Repräsentation und
 * die `extrusion`. Die zweite ist keine Näherung — Richtung × Tiefe an der
 * Platzierung ergibt die Strecke exakt, und an Fabios Netz stimmt sie auf
 * 0,000 m mit den Sohlhöhen im Merkmalssatz überein (`achseAusExtrusion.test.js`).
 * Sie ist in der Praxis sogar der Regelfall: seine beiden echten Dateien tragen
 * NULL Axis-Repräsentationen.
 *
 * Alles andere ist Skelettierung aus dem Netz — brauchbar, aber geschätzt.
 */
const ACHSE_GEMESSEN = new Set(['axisRep', 'extrusion']);

export function achsGuete(eintrag) { return _achsGuete(eintrag); }
function _achsGuete(eintrag) {
    if (!eintrag || !eintrag.polyline || eintrag.polyline.length < 2) return null;
    return ACHSE_GEMESSEN.has(eintrag.source) ? 'gemessen' : 'geschaetzt';
}

/**
 * Was die Signatur zum Messen braucht: das Netz mit Attest und die Achse —
 * aus dem Resolver, jede Form für sich gefangen. Ein werfender Resolver
 * darf die Einordnung nicht abreissen (siehe „Kein stilles Scheitern").
 */
async function _netzFuerSignatur(handle, warnungen) {
    let achse = null;
    try {
        const res = await handle.getForm('axis');
        achse = _achsGuete(res?.perElement?.[0] ?? null);
    } catch (fehler) {
        warnungen.push(`achse_fehler:${fehler?.message ?? fehler}`);
    }
    let positions = null, triCount = 0, closed = false;
    try {
        const res = await handle.getForm('solid');
        if (res?.warnings?.length) warnungen.push(...res.warnings);
        positions = res?.data?.positions ?? null;
        triCount = res?.data?.triCount ?? 0;
        closed = !!res?.data?.closed;
    } catch (fehler) {
        warnungen.push(`koerper_fehler:${fehler?.message ?? fehler}`);
    }
    return { positions, triCount, closed, achse };
}

/**
 * Die DEKLARIERTE Bauform — rein, synchron, ohne einen Blick auf Geometrie.
 *
 * Hier steht die Rangfolge, und sie steht genau EINMAL. Zwei Stellen, die
 * dieselbe Frage beantworten, laufen auseinander; das ist im Haus oft genug
 * passiert (Dokumentregister, Wasserzeichen, Gelände). `bestimme` hängt nur
 * noch Güte und Geometrie-Rückfall daran, und `GelaendeQuelle` fragt dieselbe
 * Funktion — sie braucht keinen Resolver, weil der Rückfall `hoehenfeld`
 * ohnehin nie liefern kann.
 *
 *   bauplan  >  einzelfall  >  regel  >  typprofil
 *      |           |            |          |
 *   die CDE     der Mensch   der Mensch  das Büro
 *   hat es      über DIESES  über DIESE  über den
 *   gebaut      Bauteil      Klasse      IFC-Typ
 *
 * Der EINZELFALL steht unter dem Bauplan und über der Regel: er ist die
 * spezifischste menschliche Aussage („dieser eine Körper IST mein Gelände"),
 * darf aber ein selbstgebautes Bauteil nicht umdeuten — dessen Form steht im
 * Rezept, aus dem sein Netz entstand.
 *
 * @returns {{bauform, quelle, regel: string|null} | null}
 *   `null` heisst „niemand hat etwas erklärt" — dann entscheidet die Geometrie.
 */
export function deklarierteBauform({ ausBauplan = null, ausEinzelfall = null,
                                     ausRegel = null, typprofil = null } = {}) {
    const stufen = [
        [ausBauplan, 'bauplan'],
        [ausEinzelfall, 'einzelfall'],
        [ausRegel?.bauform ?? null, 'regel'],
        [typprofil?.bauform ?? null, 'typprofil'],
    ];
    for (const [wert, quelle] of stufen) {
        // Unsinn in einem Nutzerdatum überspringt die Stufe, statt zu werfen —
        // die nächsttiefere gilt dann. Gemeldet wird es in `bestimme`.
        if (wert && istBauform(wert)) {
            return {
                bauform: wert,
                quelle,
                regel: quelle === 'regel' ? (ausRegel.regel?.name ?? ausRegel.regel?.id ?? null) : null,
            };
        }
    }
    return null;
}

/**
 * Bauform und Güte eines Elements bestimmen.
 *
 * @param {{modelId, localId, category}} el
 * @param {object} opts
 * @param {object} opts.resolver      GeometryResolver (oder Attrappe im Test)
 * @param {object|null} opts.typprofil  Datensatz aus Typprofile.js, oder null
 * @param {{bauform, regel}|null} opts.ausRegel  Treffer aus Bauformregeln.js
 * @param {string|null} opts.ausBauplan  Bauform aus dem CDE-Rezept
 * @param {string|null} opts.ausEinzelfall  Auslegung für GENAU dieses Bauteil
 *   (Journal-Art `bauform`) — für den Fall, dass eine Regel zu grob wäre:
 *   ein Erdkörper als `IFCCIVILELEMENT` neben Stützwänden derselben Klasse.
 * @returns {Promise<{bauform, guete, quelle, warnungen: string[]}>}
 *   quelle: 'bauplan' — von der CDE selbst gebaut · 'einzelfall' — für dieses
 *           Bauteil ausgelegt · 'regel' — von einer Büroregel gesetzt ·
 *           'typprofil' — am IFC-Typ deklariert · 'geometrie' — aus vorhandener
 *           Form abgeleitet · 'rueckfall' — nichts ableitbar
 *   Gibt IMMER eine Bauform zurück; `netz` ist das ehrliche Ergebnis für
 *   „lässt sich nicht einordnen", nicht ein Fehler.
 */
export async function bestimme(el, { resolver, typprofil = null, ausRegel = null,
                                     ausBauplan = null, ausEinzelfall = null } = {}) {
    const warnungen = [];
    const deklariert = deklarierteBauform({ ausBauplan, ausEinzelfall, ausRegel, typprofil });

    // ── -1. Ein CDE-BAUPLAN schlägt alles — sogar die Regel. ────────────────
    // Für ein Bauteil, das die CDE selbst gebaut hat, ist die Bauform keine
    // Ableitung und keine Deklaration von aussen: sie steht im Rezept, aus
    // dem das Netz entstand. Güte `gemessen`, weil nichts geschätzt wurde —
    // ohne diesen Schritt fiele ein geformtes Gelände (Kategorie ohne
    // PredefinedType) auf `netz` zurück, und die Gelände-Werkzeuge
    // verschwänden nach der ERSTEN Formung. (Stufe 15)
    //
    // Er steht VOR dem Resolver, weil es nichts zu messen gibt: die CDE hat
    // das Netz selbst erzeugt. Jede andere Deklaration wird sehr wohl gemessen.
    if (deklariert?.quelle === 'bauplan') {
        return { bauform: deklariert.bauform, guete: 'gemessen', quelle: 'bauplan', warnungen };
    }

    if (!el || el.localId == null) {
        return { bauform: 'netz', guete: 'unbekannt', quelle: 'rueckfall', warnungen: ['kein_element'] };
    }
    if (!resolver) {
        return { bauform: 'netz', guete: 'unbekannt', quelle: 'rueckfall', warnungen: ['kein_resolver'] };
    }

    const handle = resolver.forElements([el]);

    if (typprofil?.bauform && !istBauform(typprofil.bauform)) {
        warnungen.push(`typprofil_bauform_unbekannt:${typprofil.bauform}`);
    }

    // ── 0. Deklariert? Dann gilt das — die Geometrie sagt nur, wie gut. ──────
    // Einzelfall, Regel und Typprofil unterscheiden sich hier NUR in der
    // Herkunft, nicht in der Behandlung: alle drei sind menschliche Aussagen,
    // alle drei werden gegen die vorhandene Geometrie auf Güte geprüft.
    if (deklariert) {
        const guete = await _gueteFuer(deklariert.bauform, handle, warnungen);
        if (deklariert.quelle === 'einzelfall') {
            // Sonst bleibt eine Auslegung ewig stehen, nachdem der Planer die
            // Kategorie repariert hat — und niemand erfährt, dass sie nichts
            // mehr bewirkt.
            const ohne = deklarierteBauform({ ausRegel, typprofil });
            if (ohne?.bauform === deklariert.bauform) warnungen.push('einzelfall_ueberfluessig');
        }
        const ergebnis = { bauform: deklariert.bauform, guete, quelle: deklariert.quelle, warnungen };
        if (deklariert.quelle === 'regel') ergebnis.regel = deklariert.regel;
        return ergebnis;
    }

    // ── 2. Keine Deklaration: die FORMSIGNATUR schlägt vor ───────────────────
    // Gemessen wird, was das Netz hergibt — Ausdehnung, Lage, Ebenheit,
    // Geschlossenheit, Achse — und daraus wird ein Vorschlag mit Güte
    // `geschaetzt`. Nur eine ECHTE Achse und ein geschlossener Körper bleiben
    // `gemessen`: dort ist nichts geschätzt. Eine skelettierte Achse ist
    // weiterhin kein Einordnungsgrund für sich — sie zählt nur, wenn das
    // Bauteil auch LANG ist (Formsignatur.js). Der Grund wandert mit nach
    // aussen, damit Toolbox und Panel sagen können, WARUM.
    const netz = await _netzFuerSignatur(handle, warnungen);
    const { bauform, guete, grund, signatur } = bauformAusNetz(netz);
    if (bauform === 'netz') warnungen.push('bauform_nicht_ableitbar');
    return {
        bauform, guete, grund, signatur,
        quelle: bauform === 'netz' ? 'rueckfall' : 'geometrie',
        warnungen,
    };
}

/**
 * Wie belastbar ist eine DEKLARIERTE Bauform in diesem Modell?
 *
 * Die Deklaration wird nicht angezweifelt — ein Typprofil ist eine fachliche
 * Aussage des Büros. Gefragt wird nur, ob die Form, die die Operationen
 * brauchen, auch wirklich da ist.
 */
async function _gueteFuer(bauform, handle, warnungen) {
    const braucht = BAUFORMEN[bauform]?.braucht ?? null;
    if (!braucht) return 'gemessen';       // punkt/netz brauchen keine Form

    try {
        if (braucht === 'axis') {
            const res = await handle.getForm('axis');
            const guete = _achsGuete(res?.perElement?.[0] ?? null);
            if (!guete) { warnungen.push('achse_nicht_ableitbar'); return 'unbekannt'; }
            if (guete === 'geschaetzt') warnungen.push('achse_skelettiert');
            return guete;
        }
        if (braucht === 'solid') {
            const res = await handle.getForm('solid');
            if (res?.warnings?.length) warnungen.push(...res.warnings);
            if (!res?.data?.triCount) { warnungen.push('kein_koerper'); return 'unbekannt'; }
            if (!res.data.closed) { warnungen.push('koerper_nicht_geschlossen'); return 'geschaetzt'; }
            return 'gemessen';
        }
        if (braucht === 'surface') {
            const res = await handle.getForm('surface');
            if (res?.warnings?.length) warnungen.push(...res.warnings);
            if (!res?.data?.triCount) { warnungen.push('keine_oberflaeche'); return 'unbekannt'; }
            return 'gemessen';
        }
    } catch (fehler) {
        warnungen.push(`guete_fehler:${fehler?.message ?? fehler}`);
        return 'unbekannt';
    }
    return 'unbekannt';
}
