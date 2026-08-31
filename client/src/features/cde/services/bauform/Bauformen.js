/**
 * Bauformen — wonach sich ein Bauteil bearbeiten lässt (Stufe 9.0b).
 *
 * DAS PROBLEM: Es gibt unbegrenzt viele IFC-Typen, und mit jeder Schema-Fassung
 * kommen welche dazu. Wer Bearbeitungs-Operationen an TYPEN hängt, schreibt
 * Code in der Größenordnung O(Typen) — und ist immer hinterher.
 *
 * DIE AUFLÖSUNG: Operationen hängen an der BAUFORM. Ein Bauteil ist fürs
 * Bearbeiten nicht „IfcPipeSegment", sondern „Achse mit Profil" — und davon
 * gibt es sechs. Diese Liste ist stabil: IFC-Fassungen fügen Typen hinzu, aber
 * keine siebte Art, wie ein Körper im Raum existieren kann. „Sohlhöhe setzen"
 * hängt an `achse+profil` und bedient damit Rohr, Kanal, Bordstein — und den
 * Typ, den noch niemand gesehen hat.
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
    'achse+profil': {
        titel: 'Achse mit Profil',
        beschreibung: 'Querschnitt entlang einer Kurve',
        beispiele: 'Rohr, Kanal, Träger, Bordstein, Kabeltrasse',
        /** Welche Form der Resolver liefern muss, damit die Bauform trägt. */
        braucht: 'axis',
    },
    'flaeche+dicke': {
        titel: 'Fläche mit Dicke',
        beschreibung: 'ebene Fläche mit Stärke',
        beispiele: 'Wand, Decke, Platte, Fundament, Belag',
        braucht: 'solid',
    },
    koerper: {
        titel: 'Körper',
        beschreibung: 'Volumen an einem Ort',
        beispiele: 'Schacht, Pumpe, Armatur, Ausrüstung',
        braucht: 'solid',
    },
    hoehenfeld: {
        titel: 'Höhenfeld',
        beschreibung: '2,5D-Oberfläche',
        beispiele: 'Gelände, Planum, Aushubsohle',
        braucht: 'surface',
    },
    punkt: {
        titel: 'Punktobjekt',
        beschreibung: 'Ort mit Symbol',
        beispiele: 'Baum, Schild, Leuchte',
        braucht: null,
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
function _achsGuete(eintrag) {
    if (!eintrag || !eintrag.polyline || eintrag.polyline.length < 2) return null;
    return eintrag.source === 'axisRep' ? 'gemessen' : 'geschaetzt';
}

/**
 * Bauform und Güte eines Elements bestimmen.
 *
 * @param {{modelId, localId, category}} el
 * @param {object} opts
 * @param {object} opts.resolver      GeometryResolver (oder Attrappe im Test)
 * @param {object|null} opts.typprofil  Datensatz aus Typprofile.js, oder null
 * @returns {Promise<{bauform, guete, quelle, warnungen: string[]}>}
 *   quelle: 'typprofil' — deklariert · 'geometrie' — aus vorhandener Form
 *           abgeleitet · 'rueckfall' — nichts ableitbar
 *   Gibt IMMER eine Bauform zurück; `netz` ist das ehrliche Ergebnis für
 *   „lässt sich nicht einordnen", nicht ein Fehler.
 */
export async function bestimme(el, { resolver, typprofil = null } = {}) {
    const warnungen = [];

    if (!el || el.localId == null) {
        return { bauform: 'netz', guete: 'unbekannt', quelle: 'rueckfall', warnungen: ['kein_element'] };
    }
    if (!resolver) {
        return { bauform: 'netz', guete: 'unbekannt', quelle: 'rueckfall', warnungen: ['kein_resolver'] };
    }

    const handle = resolver.forElements([el]);

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

    // Nur eine ECHTE Achs-Repräsentation begründet ohne Deklaration eine
    // lineare Bauform. Eine skelettierte Achse bekommt man auch aus einem
    // Würfel — sie ist Güte-Information, kein Einordnungsgrund.
    if (achsGuete === 'gemessen') {
        return { bauform: 'achse+profil', guete: 'gemessen', quelle: 'geometrie', warnungen };
    }

    let geschlossen = false;
    try {
        const res = await handle.getForm('solid');
        geschlossen = !!res?.data?.closed;
        if (res?.warnings?.length) warnungen.push(...res.warnings);
    } catch (fehler) {
        warnungen.push(`koerper_fehler:${fehler?.message ?? fehler}`);
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
