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
import { EINGEBAUTE_PROFILE, profilHerkunft } from '../services/bauform/Typprofile.js';
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
        ['IFCEARTHWORKSCUT',    'hoehenfeld'],
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
