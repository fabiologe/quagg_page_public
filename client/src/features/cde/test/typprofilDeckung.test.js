/**
 * Deckung des Typprofil-Satzes (Stufe 9.4c).
 *
 * Der Satz war 23 Einträge gross und deckte 13 % der echten IFC-Produkttypen —
 * und das Schlimmste daran: von 27 gedeckten kamen nur VIER über die
 * Vererbung. Der Mechanismus, der die Skalierbarkeit tragen soll, war gebaut,
 * geprüft und praktisch wirkungslos, weil der Satz überwiegend auf BLATTEBENE
 * benannt war (`IFCPUMP`, `IFCVALVE`, `IFCTANK`) statt an den Verzweigungen.
 *
 * Das fällt ohne Messung nicht auf: jeder einzelne Eintrag ist richtig, jeder
 * Test grün, und trotzdem bekommt ein `IFCBOILER` nichts angeboten.
 *
 * Diese Datei misst deshalb die WIRKUNG, nicht die Einträge:
 *   1. Wie viel des Baums ist gedeckt?
 *   2. Wie viel davon kommt über die Vererbung — trägt der Hebel?
 *   3. Schlägt ein tieferer Eintrag einen höheren, überall wo es drauf ankommt?
 */
import { describe, expect, it } from 'vitest';
import { ENTITY_META } from '../data/entity-schema.js';
import {
    EINGEBAUTE_PROFILE, imWoerterbuch, normalisiereKategorie, profilHerkunft,
} from '../services/bauform/Typprofile.js';
import { herleite } from '../services/Herleitung.js';
import { MITGELIEFERTE_REGELN, bauformAusRegel } from '../services/bauform/Bauformregeln.js';
import { BAUFORMEN } from '../services/bauform/Bauformen.js';

const alle = Object.keys(ENTITY_META);
const kette = t => (ENTITY_META[t]?.hierarchy ?? []).map(h => h.toUpperCase());
const ist = (t, a) => t === a || kette(t).includes(a);
const elternVon = t => { const k = kette(t); return k[k.length - 2] ?? null; };
const hatKinder = new Set(alle.map(elternVon).filter(Boolean));

/**
 * Echte IFC-Entität oder bSDD-Abflachung eines PredefinedType?
 *
 * Das Wörterbuch führt `IFCPIPESEGMENTCULVERT` als eigene Klasse — das ist
 * aber `IfcPipeSegment` mit `PredefinedType = CULVERT` und taucht NIE als
 * Kategorie auf. Ohne diese Trennung misst man gegen 1.240 statt gegen 205
 * und hält 17 % für einen Wert.
 */
const istEcht = (t) => {
    const e = elternVon(t);
    return !e || !(t.startsWith(e) && t !== e && !hatKinder.has(t));
};

const PRODUKTE = alle.filter(t => ist(t, 'IFCPRODUCT') && istEcht(t));
const MIT_FORM = PRODUKTE.filter(t => profilHerkunft(t, EINGEBAUTE_PROFILE).profil?.bauform);

describe('Der Satz deckt den Baum, nicht eine Liste', () => {
    it('deckt mindestens drei Viertel der echten IFC-Produkttypen', () => {
        expect(PRODUKTE.length).toBeGreaterThan(150);      // Grundgesamtheit plausibel
        expect(MIT_FORM.length / PRODUKTE.length).toBeGreaterThan(0.75);
    });

    it('holt die MEHRHEIT davon über die Vererbung — sonst ist es doch nur eine Liste', () => {
        // Der eigentliche Prüfstein. Kämen die Treffer überwiegend aus direkt
        // genannten Schlüsseln, wäre der Satz eine Tabelle mit Extraschritten,
        // und jeder neue IFC-Typ verlangte einen Nachtrag.
        const geerbt = MIT_FORM.filter(t => profilHerkunft(t, EINGEBAUTE_PROFILE).ueberVererbung);
        expect(geerbt.length).toBeGreaterThan(MIT_FORM.length / 2);
    });

    it('bleibt dabei klein — deutlich weniger Einträge als gedeckte Typen', () => {
        // Ein Eintrag je Typ wäre O(Typen) mit Zusatzaufwand. Der Satz muss
        // ein Vielfaches dessen tragen, was er nennt.
        expect(Object.keys(EINGEBAUTE_PROFILE).length * 2).toBeLessThan(MIT_FORM.length);
    });

    it('nennt nur echte Bauformen — oder ausdrücklich keine', () => {
        for (const [typ, p] of Object.entries(EINGEBAUTE_PROFILE)) {
            if (p.bauform === null) continue;             // ausdrücklich undeklariert
            expect(BAUFORMEN[p.bauform], `${typ}: ${p.bauform}`).toBeTruthy();
        }
    });
});

describe('Tiefer im Baum schlägt höher', () => {
    /**
     * Die Falle des Umbaus. `IFCBUILTELEMENT → koerper` und
     * `IFCDISTRIBUTIONFLOWELEMENT → koerper` sind breite Vorgaben; jede
     * Ausnahme darunter muss sie schlagen. Verlöre eine, wäre eine Wand ein
     * Klotz und ein Rohr ein Klotz — und das sieht man dem Modell nicht an,
     * weil beides weiter angezeigt und gemessen wird.
     */
    const VORRANG = [
        ['IFCPIPESEGMENT',      'achse+profil'],
        ['IFCDUCTSEGMENT',      'achse+profil'],
        ['IFCCABLESEGMENT',     'achse+profil'],
        ['IFCWALL',             'flaeche+dicke'],
        ['IFCSLAB',             'flaeche+dicke'],
        ['IFCCOLUMN',           'achse+profil'],
        ['IFCPILE',             'achse+profil'],
        ['IFCBOREHOLE',         'achse+profil'],
        ['IFCREINFORCINGBAR',   'achse+profil'],
        ['IFCEARTHWORKSCUT',    'koerper'],
        ['IFCCOURSE',           'flaeche+dicke'],
        ['IFCKERB',             'achse+profil'],
    ];

    it.each(VORRANG)('%s bleibt %s', (typ, soll) => {
        expect(profilHerkunft(typ, EINGEBAUTE_PROFILE).profil?.bauform).toBe(soll);
    });

    it('lässt die breite Vorgabe dort greifen, wo keine Ausnahme steht', () => {
        expect(profilHerkunft('IFCBOILER', EINGEBAUTE_PROFILE).ausTyp).toBe('IFCDISTRIBUTIONFLOWELEMENT');
        expect(profilHerkunft('IFCCAISSONFOUNDATION', EINGEBAUTE_PROFILE).ausTyp).toBe('IFCBUILTELEMENT');
    });
});

describe('Der Proxy ist AUSDRÜCKLICH nicht deklariert', () => {
    it('erbt kein koerper von IFCBUILTELEMENT', () => {
        // Eine ProVI-Haltung IST ein Proxy mit dem Namen „Haltung". Erbte er
        // `koerper`, wäre sie als Klotz DEKLARIERT — und eine Deklaration
        // schlägt die Geometrie. Fabios Bestandsmodelle bestehen aus nichts
        // anderem; der Fehler hätte sie vollständig getroffen.
        const { profil, ausTyp } = profilHerkunft('IFCBUILDINGELEMENTPROXY', EINGEBAUTE_PROFILE);
        expect(ausTyp).toBe('IFCBUILDINGELEMENTPROXY');   // Sperre greift, keine Vererbung
        expect(profil.bauform).toBe(null);                // sagt nichts — Geometrie/Regel entscheidet
    });

    it('unterscheidet „ausdrücklich nichts" von „kein Eintrag"', () => {
        // Ohne den Unterschied liesse sich die Vererbung nicht abschalten.
        expect(profilHerkunft('IFCBUILDINGELEMENTPROXY', EINGEBAUTE_PROFILE).profil).toBeTruthy();
        expect(profilHerkunft('IFCBUILDING', EINGEBAUTE_PROFILE).profil).toBe(null);
    });
});

describe('Räumliche und statische Elemente bleiben bewusst offen', () => {
    it('gibt einem Geschoss oder Bauwerk keine Bauform', () => {
        // Sie sind BEHÄLTER, keine Bauteile. Eine Bauform lüde dazu ein, ein
        // ganzes Geschoss über seinen Hüllenanker zu verschieben — der
        // Mechanismus bewegt aber genau EIN Element.
        for (const t of ['IFCBUILDING', 'IFCBUILDINGSTOREY', 'IFCSITE', 'IFCROAD', 'IFCBRIDGE']) {
            expect(profilHerkunft(t, EINGEBAUTE_PROFILE).profil?.bauform ?? null, t).toBe(null);
        }
        // Der Raum ist die Ausnahme: sein Umriss IST eine 2D-Region.
        expect(profilHerkunft('IFCSPACE', EINGEBAUTE_PROFILE).profil.bauform).toBe('flaeche');
    });

    it('lässt das statische Modell in Ruhe — es ist eine Idealisierung', () => {
        for (const t of ['IFCSTRUCTURALCURVEMEMBER', 'IFCSTRUCTURALSURFACEMEMBER', 'IFCSTRUCTURALPOINTACTION']) {
            expect(profilHerkunft(t, EINGEBAUTE_PROFILE).profil?.bauform ?? null, t).toBe(null);
        }
    });
});

describe('Ältere Schemata: IFC2x3 und IFC4', () => {
    /**
     * `data/entity-schema.js` ist reines IFC 4.3. Jede Kategorie, die ein
     * älteres Modell anders schreibt, hätte sonst keine Vererbungskette,
     * bekäme kein Typprofil, und die Toolbox zeigte gar nichts — ohne dass
     * irgendwo stünde, dass es am Schema liegt.
     *
     * Die Liste ist GEMESSEN, nicht geraten: aus den in `web-ifc`
     * mitgelieferten Schemata wurden die IfcProduct-Nachfahren gezogen und
     * gegen das Wörterbuch gehalten — 7 instanzierbare Unbekannte aus 2x3,
     * 4 aus IFC4. Die Lücke ist abzählbar, deshalb schliesst eine Tabelle sie
     * ganz statt ungefähr.
     */
    const UMBENANNT = [
        ['IFCBUILDINGELEMENT',           'IFCBUILTELEMENT'],
        ['IFCELECTRICDISTRIBUTIONBOARD', 'IFCDISTRIBUTIONBOARD'],
        ['IFCOPENINGSTANDARDCASE',       'IFCOPENINGELEMENT'],
        ['IFCBUILDINGELEMENTCOMPONENT',  'IFCELEMENTCOMPONENT'],
        ['IFCCHAMFEREDGEFEATURE',        'IFCFEATUREELEMENTSUBTRACTION'],
    ];

    it.each(UMBENANNT)('%s findet über den Altnamen zu %s', (alt, neu) => {
        expect(normalisiereKategorie(alt)).toBe(neu);
        expect(profilHerkunft(alt, EINGEBAUTE_PROFILE).profil?.bauform).toBeTruthy();
    });

    it('schneidet das Suffix NICHT vor dem Altnamen ab', () => {
        // Andersherum ergäbe `IFCOPENINGSTANDARDCASE` das Wort `IFCOPENING`,
        // und das gibt es in keinem Schema.
        expect(normalisiereKategorie('IFCOPENINGSTANDARDCASE')).toBe('IFCOPENINGELEMENT');
        expect(normalisiereKategorie('IFCWALLSTANDARDCASE')).toBe('IFCWALL');
    });

    it('behandelt IFCCIVILELEMENT wie einen Proxy — er sagt über die Form nichts', () => {
        // Sammeltyp des Ingenieurbaus (IFC4/4x1/4x2), in 4.3 gestrichen, in
        // jeder älteren Tiefbau-Lieferung drin. Darunter steckt mal ein
        // Bordstein, mal eine Schutzplanke, mal ein Bauwerk.
        const h = profilHerkunft('IFCCIVILELEMENT', EINGEBAUTE_PROFILE);
        expect(h.profil).toBeTruthy();
        expect(h.profil.bauform).toBe(null);
    });

    it('gibt den IFC2x3-Sammeltypen eine Form — sie sagen sehr wohl „Gerät"', () => {
        for (const t of ['IFCELECTRICALELEMENT', 'IFCEQUIPMENTELEMENT', 'IFCELECTRICDISTRIBUTIONPOINT']) {
            expect(profilHerkunft(t, EINGEBAUTE_PROFILE).profil?.bauform, t).toBe('koerper');
        }
    });

    it('sagt bei einem schemafremden Typ, dass es am SCHEMA liegt', () => {
        // Andere Auskunft als „kein Typprofil": das Modell ist älter oder der
        // Exporteur erfindet Namen. Beides behebbar, aber verschieden.
        expect(imWoerterbuch('IFCPIPESEGMENT')).toBe(true);
        expect(imWoerterbuch('IFCHYPERLOOPTUBE')).toBe(false);
        const h = herleite({
            el: { category: 'IFCHYPERLOOPTUBE' },
            einordnung: { bauform: 'netz', guete: 'unbekannt', quelle: 'rueckfall', warnungen: [] },
            profilSatz: EINGEBAUTE_PROFILE,
        });
        expect(h.imWoerterbuch).toBe(false);
        expect(h.luecke.stufe).toBe('schema');
        expect(h.luecke.text).toMatch(/2x3|IFC4/);
    });
});

describe('Die Zuordnung folgt den UNTERTYPEN, nicht dem Klassennamen', () => {
    /**
     * Beim Durchgehen des Oberklassenbaums (Fabios „geh mal alle Ober-Elemente
     * durch") fielen vier Zuordnungen auf, die nach dem NAMEN plausibel
     * klangen und nach ihrem INHALT falsch waren. Das IFC-Wörterbuch führt die
     * vorgegebenen Untertypen als eigene Klassennamen — dort steht, was eine
     * Klasse wirklich umfasst.
     *
     * Diese Fehlerklasse ist heimtückisch, weil das Ergebnis nie „kaputt"
     * aussieht: ein Streifenfundament als Fläche mit Stärke wird angezeigt,
     * gemessen und gezeichnet wie alles andere — nur die angebotenen
     * Bearbeitungen passen nicht, und das merkt man erst beim Arbeiten.
     */
    const NACH_INHALT = [
        ['IFCTRACKELEMENT', 'koerper',
            'BLOCKINGDEVICE DERAILER FROG SLEEPER — Geräte AN der Strecke, keine Strecke'],
        ['IFCRAIL', 'achse+profil',
            'BLADE CHECKRAIL RACKRAIL STOCKRAIL — die Schiene selbst ist linear'],
        ['IFCFOOTING', 'koerper',
            'STRIP_FOOTING/FOOTING_BEAM linear, PAD_FOOTING/PILE_CAP Klötze — keine Platte'],
        ['IFCGEOTECHNICALSTRATUM', 'koerper',
            'SOLID VOID WATER — Bodenkörper zwischen zwei Flächen, keine Oberfläche'],
        ['IFCNAVIGATIONELEMENT', 'punkt',
            'BEACON BUOY — Seezeichen werden gesetzt, nicht ausgemessen'],
        ['IFCPLATE', 'flaeche+dicke',
            'BASE_PLATE GUSSET_PLATE SHEET WEB_PLATE — echte Bleche'],
        ['IFCCOLUMN', 'achse+profil',
            'COLUMN PIERSTEM PILASTER — durchweg linear'],
        ['IFCCOURSE', 'flaeche+dicke',
            'ARMOUR BALLASTBED FILTER PROTECTION — Schichten'],
    ];

    it.each(NACH_INHALT)('%s ist %s (%s)', (typ, soll) => {
        expect(profilHerkunft(typ, EINGEBAUTE_PROFILE).profil?.bauform).toBe(soll);
    });

    it('lässt den Erdbaukörper hoehenfeld — dort wird wirklich am Raster gearbeitet', () => {
        // Kein Widerspruch zum Bodenkörper: die Frage ist, WORAN man arbeitet.
        // Ein Aushub wird als Rasteroperation geformt (Stufe 10), eine
        // Bodenschicht ist ein Aufschlussergebnis.
        expect(profilHerkunft('IFCEARTHWORKSFILL', EINGEBAUTE_PROFILE).profil.bauform).toBe('koerper');
        expect(profilHerkunft('IFCEARTHWORKSCUT', EINGEBAUTE_PROFILE).profil.bauform).toBe('koerper');
    });
});

describe('Jede spezifische Deklaration muss ihre Begründung mitführen', () => {
    /**
     * FABIOS EINWAND, und er trifft: „muss ich jetzt ernsthaft jedes mit dir
     * durchgehen?" Nein — aber „ich schaue nochmal genauer hin" ist keine Kur,
     * sondern ein Vorsatz. Der Befund dahinter ist strukturell:
     *
     * Die Geometrie kann nur `achse+profil`, `linie`, `koerper` und `netz`
     * liefern (siehe den Rückfall in Bauformen.js). `flaeche`, `flaeche+dicke`,
     * `hoehenfeld` und `punkt` kommen AUSSCHLIESSLICH aus einer Deklaration —
     * dort ist die Deutung eines Klassennamens die einzige Quelle, und eine
     * Deklaration SCHLÄGT die Geometrie. Eine falsche ist damit schlimmer als
     * gar keine: sie überstimmt das Einzige, was Beweiskraft hat.
     *
     * Genau daher kamen alle drei gefundenen Fehler (IFCTRACKELEMENT,
     * IFCFOOTING, IFCGEOGRAPHICELEMENT) — nicht aus Flüchtigkeit, sondern
     * daraus, dass ein plausibler Name für Beleg gehalten wurde.
     *
     * Dieser Test kann Richtigkeit nicht beweisen. Er erzwingt aber, dass der
     * BELEG danebensteht: die vorgegebenen Untertypen, aus denen die Form
     * folgt. Damit lässt sich jede Zeile in Sekunden nachprüfen, statt sie neu
     * herleiten zu müssen — und eine unbelegte Vermutung kann niemand mehr
     * still hinzufügen, ich eingeschlossen.
     */
    const SPEZIFISCH = Object.entries(EINGEBAUTE_PROFILE)
        .filter(([, p]) => p.bauform && p.bauform !== 'koerper');

    it('hat überhaupt spezifische Deklarationen zu prüfen', () => {
        expect(SPEZIFISCH.length).toBeGreaterThan(30);
    });

    it.each(SPEZIFISCH)('%s belegt seine Bauform', (typ, profil) => {
        expect(profil.warum, `${typ}: bauform '${profil.bauform}' ohne Beleg`).toBeTruthy();
        // Ein Halbsatz ist kein Beleg. Verlangt wird, WORAUS die Form folgt.
        expect(profil.warum.length, `${typ}: Beleg zu dünn`).toBeGreaterThan(25);
    });

    it('verlangt für `koerper` KEINEN Beleg — das sagt die Geometrie ohnehin', () => {
        // Der Rückfall liefert `koerper` für jeden geschlossenen Körper. Eine
        // solche Deklaration kann nichts kaputt machen, was die Geometrie nicht
        // ohnehin so gesehen hätte; sie hält nur die Einordnung aufrecht, wenn
        // der Körper unsauber modelliert ist.
        const koerper = Object.entries(EINGEBAUTE_PROFILE).filter(([, p]) => p.bauform === 'koerper');
        expect(koerper.length).toBeGreaterThan(5);
    });

    it('lässt IFCGEOGRAPHICELEMENT undeklariert — der Typ entscheidet dort nicht', () => {
        // TERRAIN ist ein Höhenfeld, VEGETATION ein Baum, SOIL_BORING_POINT ein
        // Aufschlusspunkt. Eine Bauform an der Klasse wäre für zwei von drei
        // falsch. Der Unterschied liegt im PredefinedType — und der gehört zu
        // den Regeln, nicht ins Typprofil.
        expect(EINGEBAUTE_PROFILE.IFCGEOGRAPHICELEMENT.bauform).toBe(null);
        const regel = (pt) => bauformAusRegel(MITGELIEFERTE_REGELN, {
            category: 'IFCGEOGRAPHICELEMENT', attributes: { PredefinedType: pt }, psets: {},
        })?.bauform ?? null;
        expect(regel('TERRAIN')).toBe('hoehenfeld');
        expect(regel('VEGETATION')).toBe('punkt');
        expect(regel('SOIL_BORING_POINT')).toBe(null);   // kein Beleg ⇒ keine Regel
    });
});
