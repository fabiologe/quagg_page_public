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
import { ALTNAMEN, ENDUNGEN } from '../../data/altnamen.js';

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
        warum: 'Abschnitt ist definitionsgemäss ein Lauf; deckt Rohr, Kanal, Kabel, Förderer',
        // DIE ROLLE IM NETZ (Teil XXIII, AE): eine Kante. Welche Familien Knoten
        // und Kanten sind, stand bis hierher fest in der Engine
        // (`IFCDISTRIBUTIONCHAMBERELEMENT`, `AXIS_CATEGORIES_DEFAULT`).
        netzrolle: 'kante',
        felder: {
            profilGroesse: { label: 'Nennweite', einheit: 'mm', typ: 'zahl', min: 50, max: 4000 },
            sohlhoehe: { label: 'Sohlhöhe', einheit: 'm NN', typ: 'zahl' },
            // ZWEI ENDEN, nicht eine Höhe (Stufe 14.2).
            //
            // Ein Lauf hat einen Anfang und ein Ende, und die Differenz IST
            // das Gefälle — die tägliche Arbeit im Kanalbau. `sohlhoehe`
            // daneben bleibt für „das Ganze heben oder senken"; sie kommt aus
            // der Hülle und weiss nichts über die Richtung.
            //
            // Die beiden hier kommen aus der ACHSE. Erst seit die echt ist
            // (Stufe 14.1), gibt es sie überhaupt.
            sohlhoeheAnfang: { label: 'Sohle Anfang', einheit: 'm NN', typ: 'zahl' },
            sohlhoeheEnde:   { label: 'Sohle Ende',   einheit: 'm NN', typ: 'zahl' },
            // PROFILFORM ALS ROLLE (Stufe 16). Der Querschnitt ist keine
            // Nennweite: 16 ENQUIER-Rohre tragen `Description='Trapezoid'`
            // mit Breite/Höhe im Pset und sind als Kreis GESCHRIEBEN. Die
            // Form festzulegen ist die Kur des Befunds
            // `profilform_widerspruch` — als Forderung an den Planer
            // (geliefert = Forderung; der fertige Sweep lässt sich nicht
            // umformen).
            profilform: {
                label: 'Profilform', typ: 'auswahl',
                optionen: [
                    { wert: 'kreis',      titel: 'Kreis' },
                    { wert: 'eiprofil',   titel: 'Eiprofil' },
                    { wert: 'maulprofil', titel: 'Maulprofil' },
                    { wert: 'rechteck',   titel: 'Rechteck' },
                    { wert: 'trapez',     titel: 'Trapez' },
                ],
            },
        },
    },
    // Nur, wo der Typ die Dinge WIRKLICH anders nennt, steht ein eigener Satz.
    IFCPIPESEGMENT: {
        bauform: 'achse+profil',
        warum: 'CULVERT FLEXIBLESEGMENT GUTTER RIGIDSEGMENT SPOOL — alles Läufe',
        // Das genauere Profil gewinnt — also muss es die Rolle selbst nennen.
        netzrolle: 'kante',
        felder: {
            profilGroesse: {
                label: 'DN', einheit: 'mm', typ: 'zahl', min: 50, max: 4000,
                quelle: 'Pset_PipeSegmentTypeCommon.NominalDiameter',
            },
            sohlhoehe: { label: 'Sohlhöhe', einheit: 'm NN', typ: 'zahl' },
            // Am Rohr heissen sie so, wie der Kanalbau sie nennt.
            sohlhoeheAnfang: { label: 'Sohle oben',  einheit: 'm NN', typ: 'zahl' },
            sohlhoeheEnde:   { label: 'Sohle unten', einheit: 'm NN', typ: 'zahl' },
        },
    },
    IFCBEAM: {
        bauform: 'achse+profil',
        warum: 'BEAM EDGEBEAM GIRDER_SEGMENT JOIST LINTEL PURLIN; DIAPHRAGM und HATSTONE fallen heraus',
        felder: { profilGroesse: { label: 'Profilreihe', typ: 'text' } },
    },
    IFCMEMBER: {
        bauform: 'achse+profil',
        warum: 'ARCH_SEGMENT BRACE CHORD MULLION POST PURLIN RAFTER STRINGER; PLATE fällt heraus',
        felder: { profilGroesse: { label: 'Profilreihe', typ: 'text' } },
    },
    IFCCOLUMN: {
        bauform: 'achse+profil',
        warum: 'COLUMN PIERSTEM PIERSTEM_SEGMENT PILASTER STANDCOLUMN — durchweg linear',
        felder: { profilGroesse: { label: 'Profilreihe', typ: 'text' } },
    },
    IFCKERB: {
        bauform: 'achse+profil',
        warum: 'ohne Untertypen; ein Bordstein ist ein Lauf mit Querschnitt',
        felder: { sohlhoehe: { label: 'Oberkante', einheit: 'm NN', typ: 'zahl' } },
    },
    IFCRAILING: {
        bauform: 'achse+profil',
        warum: 'BALUSTRADE FENCE GUARDRAIL HANDRAIL — durchweg Läufe',
        felder: { sohlhoehe: { label: 'Oberkante', einheit: 'm NN', typ: 'zahl' } },
    },
    // Der Pfahl ist ein LINEARES Bauteil, kein Klotz — deshalb steht er hier
    // und nicht unter der Gründung, von der er erbt.
    IFCPILE: {
        bauform: 'achse+profil',
        warum: 'BORED COHESION DRIVEN FRICTION JETGROUTING SUPPORT — Herstellarten, alle linear',
        felder: {
            profilGroesse: { label: 'Durchmesser', einheit: 'mm', typ: 'zahl', min: 50, max: 4000 },
            sohlhoehe: { label: 'Fußpunkt', einheit: 'm NN', typ: 'zahl' },
        },
    },
    // Die Bohrung ist eine senkrechte Achse mit Durchmesser — dieselbe Form
    // wie ein Rohr, nur anders benannt. Genau dafür sind Rollen da.
    IFCBOREHOLE: {
        bauform: 'achse+profil',
        warum: 'ohne Untertypen; eine Bohrung ist eine Achse mit Durchmesser',
        felder: {
            profilGroesse: { label: 'Bohrdurchmesser', einheit: 'mm', typ: 'zahl', min: 20, max: 3000 },
            sohlhoehe: { label: 'Endteufe', einheit: 'm NN', typ: 'zahl' },
        },
    },
    IFCRAIL: {
        bauform: 'achse+profil',
        warum: 'BLADE CHECKRAIL GUARDRAIL RACKRAIL STOCKRAIL — die Schiene selbst, im Gegensatz zu IFCTRACKELEMENT',
        felder: {},
    },
    // IFCTRACKELEMENT steht bewusst NICHT hier: seine Untertypen sind
    // BLOCKINGDEVICE, DERAILER, FROG, SLEEPER, SPEEDREGULATOR, VEHICLESTOP —
    // Geräte AN der Strecke, keine Strecke. Es erbt `koerper` von
    // IFCBUILTELEMENT. Die Schiene selbst (IFCRAIL) ist dagegen linear.

    IFCCABLECARRIERSEGMENT: {

        bauform: 'achse+profil',

        warum: 'CABLELADDERSEGMENT CABLETRAYSEGMENT CONDUITSEGMENT CATENARYWIRE; CABLEBRACKET und DROPPER fallen heraus',

        felder: {},

    },
    IFCREINFORCINGBAR: {
        bauform: 'achse+profil',
        warum: 'ANCHORING EDGE LIGATURE MAIN PUNCHING RING SHEAR STUD — Stäbe',
        felder: { profilGroesse: { label: 'Stabdurchmesser', einheit: 'mm', typ: 'zahl', min: 4, max: 60 } },
    },
    IFCTENDON: {
        bauform: 'achse+profil',
        warum: 'BAR COATED STRAND WIRE — Spannglieder, linear',
        felder: { profilGroesse: { label: 'Spanngliedgröße', typ: 'text' } },
    },

    // ═══ 2D+ — Fläche mit Stärke ════════════════════════════════════════════
    IFCWALL: {
        bauform: 'flaeche+dicke',
        warum: 'ELEMENTEDWALL MOVABLE PARAPET PARTITIONING RETAININGWALL SHEAR SOLIDWALL — Scheiben',
        felder: {
            dicke: {
                label: 'Wandstärke', einheit: 'm', typ: 'zahl', min: 0.02, max: 3,
                quelle: 'Qto_WallBaseQuantities.Width',
            },
        },
    },
    IFCSLAB: {
        bauform: 'flaeche+dicke',
        warum: 'APPROACH_SLAB BASESLAB FLOOR LANDING PAVING SIDEWALK TRACKSLAB WEARING — Platten',
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
        warum: 'ARMOUR BALLASTBED CORE FILTER PAVEMENT PROTECTION — Schichten',
        felder: { dicke: { label: 'Schichtdicke', einheit: 'm', typ: 'zahl', min: 0.01, max: 2 } },
    },
    IFCPAVEMENT: {
        bauform: 'flaeche+dicke',
        warum: 'FLEXIBLE RIGID — Fahrbahnaufbau',
        felder: { dicke: { label: 'Belagsdicke', einheit: 'm', typ: 'zahl', min: 0.01, max: 2 } },
    },
    IFCROOF: {
        bauform: 'flaeche+dicke',
        warum: 'BARREL_ROOF DOME_ROOF FLAT_ROOF GABLE_ROOF HIP_ROOF … — Dachflächen mit Aufbau',
        felder: { dicke: { label: 'Aufbaudicke', einheit: 'm', typ: 'zahl', min: 0.02, max: 3 } },
    },
    IFCPLATE: {
        bauform: 'flaeche+dicke',
        warum: 'BASE_PLATE COVER_PLATE GUSSET_PLATE SHEET SPLICE_PLATE WEB_PLATE — Bleche',
        felder: {},
    },
    // IFCFOOTING steht bewusst NICHT bei den Flächen: STRIP_FOOTING und
    // FOOTING_BEAM sind linear, PAD_FOOTING und PILE_CAP sind Klötze — keiner
    // seiner Untertypen ist eine Region mit Stärke. Es erbt `koerper`. Die
    // Bodenplatte ist ein IFCSLAB und steht dort richtig.

    IFCCOVERING: {

        bauform: 'flaeche+dicke',

        warum: 'CEILING CLADDING FLOORING INSULATION MEMBRANE ROOFING TOPPING; SLEEVING und WRAPPING fallen heraus',

        felder: {},

    },
    IFCCURTAINWALL: {
        bauform: 'flaeche+dicke',
        warum: 'ohne Untertypen; eine Fassade ist eine Fläche mit Aufbau',
        felder: {},
    },
    IFCSHADINGDEVICE: {
        bauform: 'flaeche+dicke',
        warum: 'AWNING JALOUSIE SHUTTER — Flächen',
        felder: {},
    },
    IFCDOOR: {
        bauform: 'flaeche+dicke',
        warum: 'DOOR GATE TRAPDOOR — Füllungen einer Öffnung; BOOM_BARRIER und TURNSTILE fallen heraus',
        felder: {},
    },
    IFCWINDOW: {
        bauform: 'flaeche+dicke',
        warum: 'LIGHTDOME SKYLIGHT WINDOW — Füllungen einer Öffnung',
        felder: {},
    },
    IFCREINFORCINGMESH: {
        bauform: 'flaeche+dicke',
        warum: 'ohne Untertypen; eine Matte ist eine Fläche',
        felder: {},
    },

    // ═══ 3D — platziertes Volumen ═══════════════════════════════════════════
    // DER GRÖSSTE HEBEL im ganzen Satz: EIN Eintrag deckt rund 60 Typen —
    // Formstücke, Armaturen, Pumpen, Kessel, Auslässe, Abscheider. Sie sind
    // alle dasselbe: ein Gerät, das irgendwo im Netz sitzt. Der Fließ-ABSCHNITT
    // ist die Ausnahme, und er steht weiter oben — tiefer im Baum schlägt höher.
    IFCDISTRIBUTIONFLOWELEMENT: {
        bauform: 'koerper',
        felder: { sohlhoehe: { label: 'Bezugshöhe', einheit: 'm NN', typ: 'zahl' } },
    },
    // Formstück, Bogen, Abzweig — im Kanalbau überall, und mit eigener DN.
    IFCFLOWFITTING: {
        bauform: 'koerper',
        felder: {
            profilGroesse: { label: 'DN', einheit: 'mm', typ: 'zahl', min: 50, max: 4000 },
            sohlhoehe: { label: 'Sohlhöhe', einheit: 'm NN', typ: 'zahl' },
        },
    },
    IFCDISTRIBUTIONCHAMBERELEMENT: {
        bauform: 'koerper',
        warum: 'Schacht, Kammer, Absetzbecken — ein platziertes Volumen',
        netzrolle: 'knoten',
        felder: {
            sohlhoehe: { label: 'Sohlhöhe', einheit: 'm NN', typ: 'zahl' },
            // Die zweite Höhe am Schacht. Sohle und Deckel zusammen ergeben
            // die Schachttiefe — und die entscheidet über Einstieg,
            // Absturzbauwerk und Überdeckung der abgehenden Haltung. In
            // Fabios Dateien stehen beide im Merkmalssatz `QG_ISYBAU_Data`
            // und meinen dort, anders als am Rohr, wirklich Sohle und Deckel.
            deckelhoehe: { label: 'Deckelhöhe', einheit: 'm NN', typ: 'zahl' },
        },
    },
    IFCFLOWTREATMENTDEVICE: {
        bauform: 'koerper',
        felder: { sohlhoehe: { label: 'Sohlhöhe', einheit: 'm NN', typ: 'zahl' } },
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
    IFCDISTRIBUTIONCONTROLELEMENT: {
        bauform: 'punkt',
        warum: 'Kinder ACTUATOR ALARM CONTROLLER FLOWINSTRUMENT SENSOR — MSR-Geräte werden gesetzt, nicht ausgemessen',
        felder: {},
    },
    // BEACON und BUOY — Seezeichen. Sie werden GESETZT, nicht ausgemessen.
    IFCNAVIGATIONELEMENT: {
        bauform: 'punkt',
        warum: 'BEACON BUOY — Seezeichen werden gesetzt, nicht ausgemessen',
        felder: {},
    },
    IFCSIGN: {
        bauform: 'punkt',
        warum: 'MARKER MIRROR PICTORAL — Marken',
        felder: {},
    },
    IFCSIGNAL: {
        bauform: 'punkt',
        warum: 'AUDIO MIXED VISUAL — Signalgeber',
        felder: {},
    },
    IFCDISTRIBUTIONPORT: {
        bauform: 'punkt',
        warum: 'CABLE CABLECARRIER DUCT PIPE WIRELESS — Anschlussstellen',
        felder: {},
    },
    IFCREFERENT: {
        bauform: 'punkt',
        warum: 'BOUNDARY INTERSECTION KILOPOINT MILEPOINT STATION — Punkte auf einer Achse',
        felder: {},
    },

    // ═══ 1D — Kurve ohne Querschnitt ════════════════════════════════════════
    IFCALIGNMENT: {
        bauform: 'linie',
        warum: 'ohne Untertypen; eine Trasse positioniert, sie hat kein Volumen',
        felder: {},
    },
    IFCLINEARPOSITIONINGELEMENT: {
        bauform: 'linie',
        warum: 'Oberklasse der Trasse, gleiche Begründung',
        felder: {},
    },
    IFCLINEARELEMENT: {
        bauform: 'linie',
        warum: 'definitionsgemäss eine Kurve',
        felder: {},
    },
    IFCANNOTATION: {
        bauform: 'linie',
        warum: 'CONTOURLINE DIMENSION ISOBAR ISOLUX LEADER SURVEY; SYMBOL und TEXT sind punktartig und fallen heraus',
        felder: {},
    },
    IFCGRID: {
        bauform: 'linie',
        warum: 'IRREGULAR RADIAL RECTANGULAR TRIANGULAR — Achsnetze',
        felder: {},
    },

    // ═══ 2D — Region ohne Dicke ═════════════════════════════════════════════
    IFCSPACE: {
        bauform: 'flaeche',
        warum: 'BERTH EXTERNAL GFA INTERNAL PARKING — Regionen ohne Dicke',
        felder: {},
    },
    IFCGEOSLICE: {
        bauform: 'flaeche',
        warum: 'ohne Untertypen; ein Schnitt durch das Baugrundmodell ist eine Fläche',
        felder: {},
    },
    IFCSURFACEFEATURE: {
        bauform: 'flaeche',
        warum: 'HATCHMARKING LINEMARKING NONSKIDSURFACING RUMBLESTRIP — Markierungen AUF einer Fläche',
        felder: {},
    },

    // ═══ 2,5D — Oberfläche z = f(x,y) ═══════════════════════════════════════
    /**
     * DER TYP ENTSCHEIDET HIER NICHT — und deshalb sagt er nichts.
     *
     * `IfcGeographicElement` hat drei vorgegebene Untertypen, und sie haben
     * drei verschiedene Formen: TERRAIN ist ein Höhenfeld, VEGETATION ein Baum
     * (also ein Punkt), SOIL_BORING_POINT ein Aufschlusspunkt. Eine Bauform an
     * der Klasse wäre für zwei von drei falsch — und weil eine Deklaration die
     * Geometrie SCHLÄGT, wäre sie schlimmer als keine.
     *
     * Der Unterschied liegt im `PredefinedType`, und der ist keine Sache des
     * Typprofils, sondern der Bauformregeln (die matchen auf Attribute). Zwei
     * mitgelieferte Regeln erledigen es dort — siehe `MITGELIEFERTE_REGELN`.
     */
    IFCGEOGRAPHICELEMENT: { bauform: null, felder: {} },
    IFCEARTHWORKSELEMENT: {
        bauform: 'hoehenfeld',
        warum: 'ohne Untertypen; Erdbau wird als Raster geformt (Stufe 10)',
        felder: {},
    },
    // Teil XIV: Aushub und Auftrag sind KÖRPER — der Raum zwischen zwei
    // Geländeständen, mit Attest und Masse. Als Höhenfeld gedacht (Stufe 10)
    // waren sie eine Oberfläche ohne Inhalt; seit der Ableitung `erdbau`
    // entstehen sie als geschlossene Volumenkörper.
    IFCEARTHWORKSFILL: {
        bauform: 'koerper',
        warum: 'BACKFILL EMBANKMENT SLOPEFILL SUBGRADE SUBGRADEBED — der Auftragskörper zwischen Gelände und Planum',
        felder: {},
    },
    IFCEARTHWORKSCUT: {
        bauform: 'koerper',
        warum: 'BASE_EXCAVATION DREDGING EXCAVATION STEPEXCAVATION TOPSOILREMOVAL TRENCH — der Aushubkörper zwischen Ur-Gelände und Sohle',
        felder: {},
    },
    // IFCGEOTECHNICALSTRATUM steht bewusst NICHT hier: seine Untertypen sind
    // SOLID, VOID und WATER — BodenKÖRPER zwischen zwei Flächen, keine
    // Oberfläche z = f(x,y). Es erbt `koerper` von IFCGEOTECHNICALELEMENT.
    //
    // Der Unterschied zum Erdbaukörper darüber ist kein Widerspruch, sondern
    // die Frage, WORAN man arbeitet: ein Aushub wird als Rasteroperation
    // geformt (Stufe 10), eine Bodenschicht ist ein Aufschlussergebnis und
    // wird nicht bearbeitet.


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
     * gibt". In 4.3 ist er abgekündigt — im Schema ADD2 steht er noch
     * (nachgemessen 2026-09-11; hier stand „ersatzlos gestrichen") — und er
     * taucht in jeder älteren Tiefbau-Lieferung auf, genau in Fabios Lage.
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
 * Namen älterer Schemata und wie sie in IFC 4.3 heissen — ERZEUGT.
 *
 * Bis 2026-09-11 stand die Tabelle hier von Hand, „gemessen aus den
 * web-ifc-Schemata". Sie lebt jetzt in `backend/app/ifc/schema.py`; dort
 * verlangt ein Test, dass JEDE Produkt-Waise aus IFC4/IFC2x3 eine Antwort hat
 * (die zwei `IfcStructural…ActionVarying` fehlten hier). In den Client kommt
 * sie über `data/altnamen.js`, und `test/woerterbuch.test.js` hält die
 * Normierung unten gegen die Tabelle `NORMIERT`, die der Schreiber erzeugt.
 *
 * Seitdem führt auch das Wörterbuch selbst die Waisen (`schema: ['IFC4']`) —
 * `IFCCIVILELEMENT` hatte nie gefehlt, weil es gestrichen wäre, sondern weil
 * der alte bSDD-Export abgekündigte Klassen weglässt. Im Schema ADD2 steht es.
 */
export { ALTNAMEN };

/** Kennt das Wörterbuch diesen Namen (IFC 4.3 ADD2 oder eine Waise aus IFC4/IFC2x3)? */
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
    const ohneSuffix = k.replace(ENDUNG_AM_SCHLUSS, '');
    return ALTNAMEN[ohneSuffix] ?? ohneSuffix;
}
// Aus der erzeugten Tabelle (data/altnamen.js), nicht noch einmal von Hand.
const ENDUNG_AM_SCHLUSS = new RegExp(`(${ENDUNGEN.join('|')})$`);

/**
 * Die IFC-Vererbungskette einer Kategorie, vom Typ selbst aufwärts.
 *
 * Quelle ist `data/entity-schema.js` — jede Klasse aus IFC4X3_ADD2 und die
 * Produkt-Waisen aus IFC4/IFC2x3, jede mit ihrer vollen `hierarchy`, erzeugt
 * aus dem Schema selbst (backend/app/ifc/schema.py). Ein Typ, den der Katalog
 * nicht kennt, hat trotzdem eine Kette.
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
/**
 * Die Familien, die im Netz eine ROLLE spielen (Teil XXIII, AE) — Untertyp vor
 * Obertyp, damit eine Achse unter ihrem GENAUEREN Namen gezählt wird (die
 * Leser dedupen nach Id und behalten den ersten).
 *
 * Gelesen von der Engine, wenn sie Knoten und Kanten eines Modells sammelt:
 * wer ein Büro-Typprofil mit `netzrolle` anlegt, bringt damit eine neue
 * Familie ins Netz — ohne Programmfassung.
 * @param {'knoten'|'kante'} rolle
 * @returns {string[]}
 */
export function netzrollenWurzeln(rolle, satz = EINGEBAUTE_PROFILE) {
    return Object.entries(satz ?? {})
        .filter(([, p]) => p?.netzrolle === rolle)
        .map(([k]) => k)
        .sort((a, b) => vererbungskette(b).length - vererbungskette(a).length || a.localeCompare(b));
}

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
export async function ladeSatz(repo, { pruefe = null, befunde = null } = {}) {
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
        // GEPRÜFT (Teil XXIII, A5): die Prüfung reicht der Katalog herein —
        // diese Schicht importiert die Katalogschicht nicht (Wächter W1). Ein
        // ungültiges Profil bleibt draussen und wird gemeldet; das eingebaute
        // derselben Kategorie gilt weiter.
        if (pruefe) {
            const r = pruefe({ kategorie, ...profil });
            if (!r.ok) { befunde?.push({ art: 'typprofil', id: kategorie, ebene: null, fehler: r.fehler }); continue; }
        }
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
