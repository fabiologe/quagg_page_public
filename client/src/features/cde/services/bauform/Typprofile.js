/**
 * Typprofile — was am IFC-TYP hängt, ist Vokabular und Grenzen, kein Verhalten.
 *
 * Ein Rohr nennt seine Querschnittsgröße „DN" und darf nicht negativ sein; ein
 * Träger nennt sie „Profilreihe" und wählt aus einer Liste. Das ist ein
 * Datensatz — keine Verzweigung im Programm. Nur so bleibt das Modul für die
 * unbegrenzte und wachsende Menge der IFC-Typen ausgelegt:
 *
 *   neuer Typ, passt in eine Bauform     → nichts zu tun, sofort bedienbar
 *   neuer Typ, eigenes Vokabular         → ein Typprofil (DATEN)
 *   wirklich neue Bauform                → Programmänderung, und das ist ~nie
 *
 * ABLAGE über `repo.mitVorrang` (Stufe 6): **Projekt schlägt Büro schlägt
 * eingebauten Satz.** Ein Büro erweitert das System damit für neue Typen, ohne
 * dass eine neue Programmfassung nötig wäre — projektübergreifend.
 *
 * Der eingebaute Satz unten ist bewusst KNAPP. Er deckt, was im Tiefbau täglich
 * vorkommt, und ist kein Versuch, IFC abzubilden — dieser Versuch wäre genau
 * der Fehler, den die Bauform-Schicht vermeidet.
 *
 * Feldbeschreibung:
 *   { bauform, felder: { <rolle>: { label, einheit, typ, min?, max?, quelle? } } }
 * `rolle` ist der Name, unter dem eine Bearbeitung das Feld ANFRAGT
 * (z. B. 'profilGroesse'); `label` ist, wie der Typ es NENNT (z. B. 'DN').
 * `quelle` benennt das Pset-Feld, aus dem der Wert kommt.
 */

import { waehleMitVorrang } from '../RepoFacade.js';
import { ENTITY_META } from '../../data/entity-schema.js';

export const REPO_KEY = 'typprofile';

/**
 * Eingebauter Satz. Schlüssel sind IFC-Kategorien in GROSSSCHRIFT ohne
 * Unterfassung (siehe `normalisiereKategorie`).
 */
export const EINGEBAUTE_PROFILE = Object.freeze({
    // ═══ 1D+ — Achse mit Querschnitt ════════════════════════════════════════
    // An der richtigen HÖHE im Baum: IFCFLOWSEGMENT deckt Rohr, Kanal, Kabel
    // und jeden künftigen Fließabschnitt über die Vererbung mit ab.
    IFCFLOWSEGMENT: {
        bauform: 'achse+profil',
        felder: {
            profilGroesse: { label: 'Nennweite', einheit: 'mm', typ: 'zahl', min: 50, max: 4000 },
            sohlhoehe: { label: 'Sohlhöhe', einheit: 'm', typ: 'zahl' },
        },
    },
    // Nur, wo der Typ die Dinge WIRKLICH anders nennt, steht ein eigener Satz.
    IFCPIPESEGMENT: {
        bauform: 'achse+profil',
        felder: {
            profilGroesse: {
                label: 'DN', einheit: 'mm', typ: 'zahl', min: 50, max: 4000,
                quelle: 'Pset_PipeSegmentTypeCommon.NominalDiameter',
            },
            sohlhoehe: { label: 'Sohlhöhe', einheit: 'm', typ: 'zahl' },
        },
    },
    IFCBEAM: {
        bauform: 'achse+profil',
        felder: { profilGroesse: { label: 'Profilreihe', typ: 'text' } },
    },
    IFCMEMBER: {
        bauform: 'achse+profil',
        felder: { profilGroesse: { label: 'Profilreihe', typ: 'text' } },
    },
    IFCCOLUMN: {
        bauform: 'achse+profil',
        felder: { profilGroesse: { label: 'Profilreihe', typ: 'text' } },
    },
    IFCKERB: {
        bauform: 'achse+profil',
        felder: { sohlhoehe: { label: 'Oberkante', einheit: 'm', typ: 'zahl' } },
    },
    IFCRAILING: {
        bauform: 'achse+profil',
        felder: { sohlhoehe: { label: 'Oberkante', einheit: 'm', typ: 'zahl' } },
    },
    // Der Pfahl ist ein LINEARES Bauteil, kein Klotz — deshalb steht er hier
    // und nicht unter der Gründung, von der er erbt.
    IFCPILE: {
        bauform: 'achse+profil',
        felder: {
            profilGroesse: { label: 'Durchmesser', einheit: 'mm', typ: 'zahl', min: 50, max: 4000 },
            sohlhoehe: { label: 'Fußpunkt', einheit: 'm', typ: 'zahl' },
        },
    },
    // Die Bohrung ist eine senkrechte Achse mit Durchmesser — dieselbe Form
    // wie ein Rohr, nur anders benannt. Genau dafür sind Rollen da.
    IFCBOREHOLE: {
        bauform: 'achse+profil',
        felder: {
            profilGroesse: { label: 'Bohrdurchmesser', einheit: 'mm', typ: 'zahl', min: 20, max: 3000 },
            sohlhoehe: { label: 'Endteufe', einheit: 'm', typ: 'zahl' },
        },
    },
    IFCRAIL: { bauform: 'achse+profil', felder: {} },
    IFCTRACKELEMENT: { bauform: 'achse+profil', felder: {} },
    IFCCABLECARRIERSEGMENT: { bauform: 'achse+profil', felder: {} },
    IFCREINFORCINGBAR: {
        bauform: 'achse+profil',
        felder: { profilGroesse: { label: 'Stabdurchmesser', einheit: 'mm', typ: 'zahl', min: 4, max: 60 } },
    },
    IFCTENDON: {
        bauform: 'achse+profil',
        felder: { profilGroesse: { label: 'Spanngliedgröße', typ: 'text' } },
    },

    // ═══ 2D+ — Fläche mit Stärke ════════════════════════════════════════════
    IFCWALL: {
        bauform: 'flaeche+dicke',
        felder: {
            dicke: {
                label: 'Wandstärke', einheit: 'm', typ: 'zahl', min: 0.02, max: 3,
                quelle: 'Qto_WallBaseQuantities.Width',
            },
        },
    },
    IFCSLAB: {
        bauform: 'flaeche+dicke',
        felder: {
            dicke: {
                label: 'Plattenstärke', einheit: 'm', typ: 'zahl', min: 0.02, max: 3,
                quelle: 'Qto_SlabBaseQuantities.Width',
            },
        },
    },
    // Straßenbau: die Schicht IST eine Fläche mit Dicke, und ihre Dicke ist
    // die Größe, um die es geht.
    IFCCOURSE: {
        bauform: 'flaeche+dicke',
        felder: { dicke: { label: 'Schichtdicke', einheit: 'm', typ: 'zahl', min: 0.01, max: 2 } },
    },
    IFCPAVEMENT: {
        bauform: 'flaeche+dicke',
        felder: { dicke: { label: 'Belagsdicke', einheit: 'm', typ: 'zahl', min: 0.01, max: 2 } },
    },
    IFCROOF: {
        bauform: 'flaeche+dicke',
        felder: { dicke: { label: 'Aufbaudicke', einheit: 'm', typ: 'zahl', min: 0.02, max: 3 } },
    },
    IFCPLATE: { bauform: 'flaeche+dicke', felder: {} },
    IFCFOOTING: { bauform: 'flaeche+dicke', felder: {} },
    IFCCOVERING: { bauform: 'flaeche+dicke', felder: {} },
    IFCCURTAINWALL: { bauform: 'flaeche+dicke', felder: {} },
    IFCSHADINGDEVICE: { bauform: 'flaeche+dicke', felder: {} },
    IFCDOOR: { bauform: 'flaeche+dicke', felder: {} },
    IFCWINDOW: { bauform: 'flaeche+dicke', felder: {} },
    IFCREINFORCINGMESH: { bauform: 'flaeche+dicke', felder: {} },

    // ═══ 3D — platziertes Volumen ═══════════════════════════════════════════
    // DER GRÖSSTE HEBEL im ganzen Satz: EIN Eintrag deckt rund 60 Typen —
    // Formstücke, Armaturen, Pumpen, Kessel, Auslässe, Abscheider. Sie sind
    // alle dasselbe: ein Gerät, das irgendwo im Netz sitzt. Der Fließ-ABSCHNITT
    // ist die Ausnahme, und er steht weiter oben — tiefer im Baum schlägt höher.
    IFCDISTRIBUTIONFLOWELEMENT: {
        bauform: 'koerper',
        felder: { sohlhoehe: { label: 'Bezugshöhe', einheit: 'm', typ: 'zahl' } },
    },
    // Formstück, Bogen, Abzweig — im Kanalbau überall, und mit eigener DN.
    IFCFLOWFITTING: {
        bauform: 'koerper',
        felder: {
            profilGroesse: { label: 'DN', einheit: 'mm', typ: 'zahl', min: 50, max: 4000 },
            sohlhoehe: { label: 'Sohlhöhe', einheit: 'm', typ: 'zahl' },
        },
    },
    IFCDISTRIBUTIONCHAMBERELEMENT: {
        bauform: 'koerper',
        felder: { sohlhoehe: { label: 'Sohlhöhe', einheit: 'm', typ: 'zahl' } },
    },
    IFCFLOWTREATMENTDEVICE: {
        bauform: 'koerper',
        felder: { sohlhoehe: { label: 'Sohlhöhe', einheit: 'm', typ: 'zahl' } },
    },
    IFCPUMP: { bauform: 'koerper', felder: {} },
    IFCVALVE: { bauform: 'koerper', felder: {} },
    IFCTANK: { bauform: 'koerper', felder: {} },

    // Zweiter grosser Hebel: alles Gebaute ist im Zweifel ein Körper. Die
    // Ausnahmen (Stütze, Geländer, Schicht, Belag, Tür …) stehen oben und
    // gewinnen, weil sie tiefer im Baum sitzen.
    IFCBUILTELEMENT: { bauform: 'koerper', felder: {} },
    // Bauteilkomponenten: Verbindungsmittel, Anbauteile, Dämpfer.
    IFCELEMENTCOMPONENT: { bauform: 'koerper', felder: {} },
    // Öffnung, Aussparung, Vorsprung: ein KÖRPER IN EINER ROLLE. Die Rolle
    // (abziehend/hinzufügend) ist keine Form — die Geometrie bleibt ein
    // Volumen, nur seine Wirkung ist subtraktiv.
    IFCFEATUREELEMENT: { bauform: 'koerper', felder: {} },
    IFCGEOTECHNICALELEMENT: { bauform: 'koerper', felder: {} },
    IFCFURNISHINGELEMENT: { bauform: 'koerper', felder: {} },
    IFCTRANSPORTATIONDEVICE: { bauform: 'koerper', felder: {} },

    // ═══ 0D — Ort (+ Drehung) ═══════════════════════════════════════════════
    // Mess-, Steuer- und Regeltechnik: ein Fühler wird PLATZIERT, nicht
    // ausgemessen. `punkt` braucht keine Form und ist deshalb immer belastbar —
    // `koerper` verlangte ein Volumen, das oft gar nicht modelliert ist.
    IFCDISTRIBUTIONCONTROLELEMENT: { bauform: 'punkt', felder: {} },
    IFCSIGN: { bauform: 'punkt', felder: {} },
    IFCSIGNAL: { bauform: 'punkt', felder: {} },
    IFCDISTRIBUTIONPORT: { bauform: 'punkt', felder: {} },
    IFCREFERENT: { bauform: 'punkt', felder: {} },

    // ═══ 1D — Kurve ohne Querschnitt ════════════════════════════════════════
    IFCALIGNMENT: { bauform: 'linie', felder: {} },
    IFCLINEARPOSITIONINGELEMENT: { bauform: 'linie', felder: {} },
    IFCLINEARELEMENT: { bauform: 'linie', felder: {} },
    IFCANNOTATION: { bauform: 'linie', felder: {} },
    IFCGRID: { bauform: 'linie', felder: {} },

    // ═══ 2D — Region ohne Dicke ═════════════════════════════════════════════
    IFCSPACE: { bauform: 'flaeche', felder: {} },
    IFCGEOSLICE: { bauform: 'flaeche', felder: {} },
    IFCSURFACEFEATURE: { bauform: 'flaeche', felder: {} },

    // ═══ 2,5D — Oberfläche z = f(x,y) ═══════════════════════════════════════
    IFCGEOGRAPHICELEMENT: { bauform: 'hoehenfeld', felder: {} },
    IFCEARTHWORKSELEMENT: { bauform: 'hoehenfeld', felder: {} },
    IFCEARTHWORKSFILL: { bauform: 'hoehenfeld', felder: {} },
    IFCEARTHWORKSCUT: { bauform: 'hoehenfeld', felder: {} },
    IFCGEOTECHNICALSTRATUM: { bauform: 'hoehenfeld', felder: {} },

    // ═══ AUSDRÜCKLICH NICHT DEKLARIERT ══════════════════════════════════════
    /**
     * `bauform: null` heisst „hier sagt der Typ NICHTS — frag die Geometrie".
     * Das ist etwas anderes als ein fehlender Eintrag: es ist eine SPERRE gegen
     * die Vererbung. Ohne sie erbte der Proxy das `koerper` von
     * `IFCBUILTELEMENT`, und eine ProVI-Haltung — die nichts weiter ist als ein
     * Proxy mit dem Namen „Haltung" — wäre damit als Klotz deklariert statt
     * über ihre Geometrie oder eine Namensregel als Leitung erkannt zu werden.
     * Genau Fabios Bestandsmodelle hätten das getroffen.
     */
    IFCBUILDINGELEMENTPROXY: { bauform: null, felder: {} },
    /**
     * `IfcCivilElement` (IFC4 / 4x1 / 4x2) ist der Sammeltyp des Infrastruktur-
     * baus: „ein Bauteil des Ingenieurbaus, für das es keinen eigenen Typ
     * gibt". In 4.3 wurde er ersatzlos gestrichen, taucht aber in jeder
     * älteren Tiefbau-Lieferung auf — genau in Fabios Lage.
     *
     * Er sagt über die Form GENAUSO WENIG wie ein Proxy: darunter steckt mal
     * ein Bordstein, mal eine Schutzplanke, mal ein Entwässerungsbauwerk.
     * Deshalb dieselbe Behandlung — `null`, und die Geometrie oder eine
     * Namensregel entscheidet.
     */
    IFCCIVILELEMENT: { bauform: null, felder: {} },
    /** `IfcProxy` — der Sammeltyp aus IFC2x3. Sagt ebenso wenig. */
    IFCPROXY: { bauform: null, felder: {} },
    /** Ein virtuelles Element hat keine Geometrie — es gibt nichts zu formen. */
    IFCVIRTUALELEMENT: { bauform: null, felder: {} },

    // ═══ IFC2x3-Sammeltypen, in IFC4 gestrichen ═════════════════════════════
    // Anders als Proxy und CivilElement sagen sie sehr wohl etwas: es ist ein
    // Gerät. Ein Körper ist die richtige Antwort.
    IFCELECTRICALELEMENT: { bauform: 'koerper', felder: {} },
    IFCEQUIPMENTELEMENT: { bauform: 'koerper', felder: {} },
    IFCELECTRICDISTRIBUTIONPOINT: { bauform: 'koerper', felder: {} },
});

/**
 * Namen, die es in IFC 4.3 nicht mehr gibt — und wie sie dort heissen.
 *
 * DER ANLASS: `data/entity-schema.js` ist reines IFC 4.3. Jede Kategorie, die
 * ein älteres Modell anders schreibt, fällt sonst durch den Rost — sie hat
 * keine Vererbungskette, bekommt kein Typprofil, und die Toolbox zeigt einem
 * `IFCCIVILELEMENT` genau nichts. Fabio arbeitet mit Fremdlieferungen; welches
 * Schema die haben, bestimmt er nicht.
 *
 * DIE LISTE IST NICHT GERATEN, SONDERN GEMESSEN: aus den in `web-ifc`
 * mitgelieferten Schemata IFC2X3, IFC4 und IFC4X3 wurden je die
 * `IfcProduct`-Nachfahren gezogen und gegen das Wörterbuch gehalten. Ergebnis:
 * 11 unbekannte Namen aus 2x3 (davon 7 instanzierbar), 5 aus IFC4 (4
 * instanzierbar). Mehr ist es nicht — die Lücke ist abzählbar, und deshalb
 * schliesst eine Tabelle sie vollständig statt nur ungefähr.
 *
 * Hier stehen nur die UMBENENNUNGEN. Namen, die es in 4.3 gar nicht mehr gibt
 * (`IfcCivilElement`, `IfcProxy`, `IfcEquipmentElement`), sind keine
 * Umbenennung — sie bekommen unten im Satz ein eigenes Profil.
 */
export const ALTNAMEN = Object.freeze({
    // IFC4 → IFC4.3: umbenannt.
    IFCBUILDINGELEMENT:           'IFCBUILTELEMENT',
    IFCELECTRICDISTRIBUTIONBOARD: 'IFCDISTRIBUTIONBOARD',
    // Das Suffix-Abschneiden allein ergäbe `IFCOPENING` — das gibt es nicht.
    IFCOPENINGSTANDARDCASE:       'IFCOPENINGELEMENT',
    // IFC2x3 → IFC4: umbenannt bzw. zusammengefasst.
    IFCBUILDINGELEMENTCOMPONENT:  'IFCELEMENTCOMPONENT',
    IFCEDGEFEATURE:               'IFCFEATUREELEMENTSUBTRACTION',
    IFCCHAMFEREDGEFEATURE:        'IFCFEATUREELEMENTSUBTRACTION',
    IFCROUNDEDEDGEFEATURE:        'IFCFEATUREELEMENTSUBTRACTION',
});

/** Kennt das IFC-4.3-Wörterbuch diesen Namen (nach Normierung)? */
export function imWoerterbuch(kategorie) {
    const roh = String(kategorie ?? '').toUpperCase().trim();
    return !!(ENTITY_META[roh] ?? ENTITY_META[normalisiereKategorie(kategorie)]);
}

/**
 * Kategorie auf den Profilschlüssel normieren.
 *
 * `IFCWALLSTANDARDCASE` ist eine WAND — das Suffix beschreibt, wie sie
 * modelliert ist, nicht was sie ist. Ohne diese Normierung fiele jede
 * Unterfassung durch den Rost und bekäme kein Profil, obwohl eines dasteht.
 * Das ist die Fehlerklasse, wegen der Typ-Strings nicht als Hauptweg taugen —
 * hier ist sie eingegrenzt auf EINE Stelle.
 *
 * Die Altnamen werden ZUERST geprüft, dann das Suffix geschnitten: bei
 * `IFCOPENINGSTANDARDCASE` ergäbe die andere Reihenfolge `IFCOPENING`, und
 * das gibt es in keinem Schema.
 */
export function normalisiereKategorie(kategorie) {
    if (!kategorie) return '';
    const k = String(kategorie).toUpperCase().trim();
    if (ALTNAMEN[k]) return ALTNAMEN[k];
    const ohneSuffix = k.replace(/(STANDARDCASE|ELEMENTEDCASE)$/, '');
    return ALTNAMEN[ohneSuffix] ?? ohneSuffix;
}

/**
 * Die IFC-Vererbungskette einer Kategorie, vom Typ selbst aufwärts.
 *
 * Quelle ist `data/entity-schema.js` — 1.418 IFC-4.3-Klassen, jede mit ihrer
 * vollen `hierarchy`, erzeugt aus dem buildingSMART-Wörterbuch. Ein Typ, den
 * der Katalog nicht kennt, hat trotzdem eine Kette.
 *
 * @returns {string[]} GROSSSCHRIFT, spezifisch zuerst: ['IFCPIPESEGMENT',
 *   'IFCFLOWSEGMENT', 'IFCDISTRIBUTIONFLOWELEMENT', …]
 */
export function vererbungskette(kategorie) {
    const norm = normalisiereKategorie(kategorie);
    const meta = ENTITY_META[String(kategorie).toUpperCase().trim()] ?? ENTITY_META[norm];
    const kette = meta?.hierarchy ?? [];
    return kette.map(n => n.toUpperCase()).reverse();
}

/**
 * Profil für eine Kategorie aus einem Satz holen.
 *
 * Reihenfolge: genauer Schlüssel → normierter Schlüssel → **IFC-Vererbung**.
 *
 * Die Vererbung ist die eigentliche Antwort auf „es gibt immer neue
 * IFC-Elemente". `IFCPIPESEGMENT` und `IFCDUCTSEGMENT` hängen beide unter
 * `IfcFlowSegment` — EIN Profil dort deckt beide und jeden künftigen
 * Fließabschnitt, ohne dass jemand etwas nachträgt. Die Lösung ist nicht eine
 * längere Tabelle, sondern eine Tabelle an der richtigen HÖHE im Baum.
 *
 * Kein Treffer → `null`; dann übernimmt die Bauform-Ableitung (Bauformen.js).
 */
export function profilFuer(kategorie, satz = EINGEBAUTE_PROFILE) {
    return profilHerkunft(kategorie, satz).profil;
}

/**
 * Dasselbe, aber es sagt auch, AUF WELCHER HÖHE im Baum es fündig wurde.
 *
 * Für die Toolbox (Stufe 9.4b): „woher weiß die CDE, was hier geht?" lässt
 * sich nur beantworten, wenn die Antwort ihre Herkunft mitbringt. Ein Nutzer,
 * der sieht, dass sein `IFCCABLESEGMENT` sein Vokabular von `IFCFLOWSEGMENT`
 * erbt, versteht das System in einem Blick — und weiß beim nächsten
 * unbekannten Typ selbst, wo er ein Profil hinschreiben müsste.
 *
 * @returns {{profil: object|null, ausTyp: string|null, ueberVererbung: boolean}}
 */
export function profilHerkunft(kategorie, satz = EINGEBAUTE_PROFILE) {
    const leer = { profil: null, ausTyp: null, ueberVererbung: false };
    if (!kategorie || !satz) return leer;
    const roh = String(kategorie).toUpperCase().trim();
    if (satz[roh]) return { profil: satz[roh], ausTyp: roh, ueberVererbung: false };
    const norm = normalisiereKategorie(kategorie);
    if (satz[norm]) return { profil: satz[norm], ausTyp: norm, ueberVererbung: false };

    // Aufwärts durch die Vererbung — das erste Profil gewinnt. Der erste
    // Eintrag der Kette ist der Typ selbst und wurde oben schon geprüft.
    for (const vorfahr of vererbungskette(kategorie)) {
        if (satz[vorfahr]) return { profil: satz[vorfahr], ausTyp: vorfahr, ueberVererbung: true };
    }
    return leer;
}

/**
 * Den wirksamen Satz laden: Projekt schlägt Büro schlägt eingebaut.
 *
 * Die Sätze werden NICHT tief gemischt. Ein Büro, das `IFCWALL` neu belegt,
 * belegt es ganz — sonst entstünde eine halb eingebaute, halb eigene Wand, und
 * niemand könnte sagen, woher eine Grenze stammt. Gemischt wird nur je
 * Kategorie: eine Kategorie, die der Büro-Satz nicht nennt, kommt weiter aus
 * dem eingebauten.
 */
export async function ladeSatz(repo) {
    if (!repo?.mitVorrang) return { ...EINGEBAUTE_PROFILE };
    let eigene = null;
    try {
        eigene = await repo.mitVorrang(REPO_KEY, null);
    } catch (fehler) {
        console.warn('cde: typprofile laden', fehler?.message ?? fehler);
    }
    if (!eigene || typeof eigene !== 'object') return { ...EINGEBAUTE_PROFILE };

    const satz = { ...EINGEBAUTE_PROFILE };
    for (const [kategorie, profil] of Object.entries(eigene)) {
        if (!profil || typeof profil !== 'object') continue;
        satz[String(kategorie).toUpperCase().trim()] = profil;
    }
    return satz;
}

/**
 * Ein Feld für eine Bearbeitung auflösen.
 *
 * Der Katalogeintrag nennt eine ROLLE (`ausTypprofil: 'profilGroesse'`) und
 * einen Rückfall. Findet sich im Profil ein Feld dieser Rolle, gewinnt dessen
 * Beschriftung, Einheit und Grenze — sonst der Rückfall. So kann derselbe
 * Katalogeintrag am Rohr „DN" heißen und am Träger „Profilreihe", ohne dass
 * eine Verzweigung nach Typ nötig wäre.
 */
export function feldAusProfil(rolle, profil, rueckfall = null) {
    const ausProfil = rolle && profil?.felder ? profil.felder[rolle] : null;
    return waehleMitVorrang(ausProfil, null, rueckfall);
}
