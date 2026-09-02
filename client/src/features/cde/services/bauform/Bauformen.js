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
 * WOHER DIE BAUFORM KOMMT — und warum nicht aus Geometrie-Verhältnissen:
 * Sie wird DEKLARIERT (Typprofil, siehe Typprofile.js), nicht aus Kantenlängen
 * erraten. Ein Turm aus Schwellwerten („Länge/Breite > 4 ⇒ linear") ist genau
 * die Inferenz-Heuristik, die sich nie fertig einstellen lässt: Jeder neue
 * Sonderfall verlangt eine feinere Zahl, und keine Zahl stimmt für alle
 * Modelle. Die Geometrie wird nur für die GÜTE befragt — für die Frage, wie
 * belastbar die deklarierte Form im konkreten Modell ist.
 *
 * Der Rückfall ohne Typprofil ist deshalb bewusst grob und hat drei Fälle,
 * nicht dreißig. Wer ihn genauer haben will, schreibt ein Typprofil — das ist
 * ein Datensatz auf der Büro-Ebene, keine neue Programmfassung.
 *
 * SPIEGELBILD: `GeometryResolver` nennt sich selbst „Form-Typsystem" und löst
 * die Frage „welche Form kann ich aus diesem Element LESEN?". Diese Datei
 * beantwortet „als welche Form darf ich es SCHREIBEN?" — mit denselben
 * Formnamen und derselben Provenienz-Ehrlichkeit: kein stilles Scheitern,
 * `netz` ist ein Ergebnis, `undefined` nie.
 */

/** Die sechs Bauformen. Neue Formen hier ergänzen — sonst nirgends. */
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

function _achsGuete(eintrag) {
    if (!eintrag || !eintrag.polyline || eintrag.polyline.length < 2) return null;
    return ACHSE_GEMESSEN.has(eintrag.source) ? 'gemessen' : 'geschaetzt';
}

/**
 * Bauform und Güte eines Elements bestimmen.
 *
 * @param {{modelId, localId, category}} el
 * @param {object} opts
 * @param {object} opts.resolver      GeometryResolver (oder Attrappe im Test)
 * @param {object|null} opts.typprofil  Datensatz aus Typprofile.js, oder null
 * @param {{bauform, regel}|null} opts.ausRegel  Treffer aus Bauformregeln.js
 * @returns {Promise<{bauform, guete, quelle, warnungen: string[]}>}
 *   quelle: 'regel' — von einer Büroregel gesetzt (schlägt alles) ·
 *           'typprofil' — am IFC-Typ deklariert · 'geometrie' — aus vorhandener
 *           Form abgeleitet · 'rueckfall' — nichts ableitbar
 *   Gibt IMMER eine Bauform zurück; `netz` ist das ehrliche Ergebnis für
 *   „lässt sich nicht einordnen", nicht ein Fehler.
 */
export async function bestimme(el, { resolver, typprofil = null, ausRegel = null, ausBauplan = null } = {}) {
    const warnungen = [];

    // ── -1. Ein CDE-BAUPLAN schlägt alles — sogar die Regel. ────────────────
    // Für ein Bauteil, das die CDE selbst gebaut hat, ist die Bauform keine
    // Ableitung und keine Deklaration von aussen: sie steht im Rezept, aus
    // dem das Netz entstand. Güte `gemessen`, weil nichts geschätzt wurde —
    // ohne diesen Schritt fiele ein geformtes Gelände (Kategorie ohne
    // PredefinedType) auf `netz` zurück, und die Gelände-Werkzeuge
    // verschwänden nach der ERSTEN Formung. (Stufe 15)
    if (ausBauplan && istBauform(ausBauplan)) {
        return { bauform: ausBauplan, guete: 'gemessen', quelle: 'bauplan', warnungen };
    }

    if (!el || el.localId == null) {
        return { bauform: 'netz', guete: 'unbekannt', quelle: 'rueckfall', warnungen: ['kein_element'] };
    }
    if (!resolver) {
        return { bauform: 'netz', guete: 'unbekannt', quelle: 'rueckfall', warnungen: ['kein_resolver'] };
    }

    const handle = resolver.forElements([el]);

    // ── 0. Eine REGEL schlägt alles. ────────────────────────────────────────
    // Sie ist die spezifischste Aussage, die es gibt: jemand hat für DIESEN
    // Exporteur festgehalten, was seine Namen bedeuten. Ein Typprofil spricht
    // dagegen über einen IFC-Typ im Allgemeinen — und wo der Exporteur alles
    // `IFCBUILDINGELEMENTPROXY` nennt, sagt der Typ eben nichts.
    if (ausRegel?.bauform && istBauform(ausRegel.bauform)) {
        const guete = await _gueteFuer(ausRegel.bauform, handle, warnungen);
        return { bauform: ausRegel.bauform, guete, quelle: 'regel', warnungen,
                 regel: ausRegel.regel?.name ?? ausRegel.regel?.id ?? null };
    }

    // ── 1. Deklariert? Dann gilt das — die Geometrie sagt nur, wie gut. ──────
    const deklariert = typprofil?.bauform ?? null;
    if (deklariert && !istBauform(deklariert)) {
        warnungen.push(`typprofil_bauform_unbekannt:${deklariert}`);
    }
    if (deklariert && istBauform(deklariert)) {
        const guete = await _gueteFuer(deklariert, handle, warnungen);
        return { bauform: deklariert, guete, quelle: 'typprofil', warnungen };
    }

    // ── 2. Kein Profil: grober, ehrlicher Rückfall in drei Fällen ───────────
    // Bewusst KEINE Kantenlängen-Verhältnisse. Wer es genauer braucht,
    // schreibt ein Typprofil.
    let achse = null;
    try {
        const res = await handle.getForm('axis');
        achse = res?.perElement?.[0] ?? null;
    } catch (fehler) {
        warnungen.push(`achse_fehler:${fehler?.message ?? fehler}`);
    }
    const achsGuete = _achsGuete(achse);

    let geschlossen = false;
    let hatKoerper = false;
    try {
        const res = await handle.getForm('solid');
        geschlossen = !!res?.data?.closed;
        hatKoerper = !!res?.data?.triCount;
        if (res?.warnings?.length) warnungen.push(...res.warnings);
    } catch (fehler) {
        warnungen.push(`koerper_fehler:${fehler?.message ?? fehler}`);
    }

    // Nur eine ECHTE Achs-Repräsentation begründet ohne Deklaration eine
    // lineare Bauform. Eine skelettierte Achse bekommt man auch aus einem
    // Würfel — sie ist Güte-Information, kein Einordnungsgrund.
    //
    // Ob daraus `achse+profil` oder `linie` wird, entscheidet das VOLUMEN:
    // ein Rohr führt Achse UND Körper, eine Trasse (IfcAlignment) nur die
    // Achse. Das ist keine Schätzung über Kantenlängen, sondern die Frage,
    // ob überhaupt etwas Dreidimensionales da ist.
    if (achsGuete === 'gemessen') {
        const bauform = hatKoerper ? 'achse+profil' : 'linie';
        return { bauform, guete: 'gemessen', quelle: 'geometrie', warnungen };
    }

    if (geschlossen) {
        return { bauform: 'koerper', guete: 'gemessen', quelle: 'geometrie', warnungen };
    }

    warnungen.push('bauform_nicht_ableitbar');
    return {
        bauform: 'netz',
        guete: achsGuete === 'geschaetzt' ? 'geschaetzt' : 'unbekannt',
        quelle: 'rueckfall',
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
