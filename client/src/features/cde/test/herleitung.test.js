/**
 * Herleitung (Stufe 9.4b) — woher die CDE weiß, was an einem Bauteil geht.
 *
 * Diese Datei ist die Prüfung der Antwort auf „es gibt immer neue IFC-Typen".
 * Sie ist deshalb bewusst mit Typen geschrieben, die im Katalog NICHT stehen:
 * ein `IFCCABLESEGMENT`, das nie jemand eingetragen hat, und ein frei
 * erfundener `IFCQUATSCHXYZ`. Ginge die Skalierbarkeit verloren, fielen genau
 * diese Fälle zuerst — und zwar still, weil ein Bauteil ohne angebotene
 * Bearbeitung aussieht wie ein Bauteil, an dem es nichts zu tun gibt.
 */
import { describe, expect, it } from 'vitest';
import { herleite, warumNicht } from '../services/Herleitung.js';
import { EINGEBAUTE_PROFILE } from '../services/bauform/Typprofile.js';
import { nachId } from '../services/Bearbeitungen.js';

function h(kategorie, einordnung, el = {}) {
    return herleite({
        el: { category: kategorie, globalId: 'X', ...el },
        einordnung, profilSatz: EINGEBAUTE_PROFILE,
    });
}

const LINEAR   = { bauform: 'achse+profil', guete: 'gemessen', quelle: 'typprofil', warnungen: [] };
const KOERPER  = { bauform: 'koerper',      guete: 'gemessen', quelle: 'typprofil', warnungen: [] };
const NICHTS   = { bauform: 'netz',         guete: 'unbekannt', quelle: 'rueckfall', warnungen: [] };

/** Alle angebotenen Ids, über alle Herkunftsgruppen hinweg. */
function ids(herleitung) {
    return herleitung.gruppen.flatMap(g => g.eintraege.map(e => e.id));
}
/** Die Beschriftung, die ein Typ einem Feld gibt. */
function label(herleitung, id) {
    const e = herleitung.gruppen.flatMap(g => g.eintraege).find(x => x.id === id);
    return e?.felder?.[0]?.label ?? null;
}

describe('Ein Typ, den niemand eingetragen hat, ist trotzdem bedienbar', () => {
    it('erbt sein Vokabular die IFC-Hierarchie hinauf', () => {
        // IFCCABLESEGMENT steht in KEINEM Typprofil. Es hängt aber unter
        // IFCFLOWSEGMENT — und dort steht eins. Das ist die ganze Antwort auf
        // „es gibt immer neue IFC-Elemente": nicht eine längere Tabelle,
        // sondern eine Tabelle an der richtigen HÖHE im Baum.
        const k = h('IFCCABLESEGMENT', LINEAR);
        expect(k.profilAus).toBe('IFCFLOWSEGMENT');
        expect(k.profilUeberVererbung).toBe(true);
        expect(ids(k)).toContain('profilgroesse-setzen');
    });

    it('nennt das Feld so, wie der geerbte Typ es nennt', () => {
        expect(label(h('IFCCABLESEGMENT', LINEAR), 'profilgroesse-setzen')).toBe('Nennweite');
    });

    it('lässt einen erfundenen Typ nicht abstürzen und erfindet nichts dazu', () => {
        const k = h('IFCQUATSCHXYZ', NICHTS);
        expect(k.profilAus).toBe(null);
        expect(ids(k)).toEqual(['kg-setzen', 'din277-setzen']);   // nur die allgemeinen
        expect(k.kategorie).toBe('IFCQUATSCHXYZ');
    });

    it('sagt bei einem unbekannten Typ, WAS zu tun wäre — und dass es Daten sind', () => {
        // Eine Fehlermeldung wäre falsch: „unbekannter Typ" ist in IFC der
        // Normalfall, und die richtige Reaktion ist fast nie Programmarbeit.
        // Ein Geschoss steht im Wörterbuch und hat mit Absicht kein Profil —
        // damit prüft der Fall die Lücke „Form" und nicht die Schema-Lücke.
        const k = h('IFCBUILDINGSTOREY', NICHTS);
        expect(k.luecke.stufe).toBe('form');
        expect(k.luecke.text).toMatch(/Typprofil/);
        expect(k.luecke.text).toMatch(/keine Programmänderung/);
    });

    it('meldet die Lücke „Vokabular", wenn nur das Profil fehlt', () => {
        // Die Form steht (aus der Geometrie), nur die typeigenen Größen fehlen.
        const k = h('IFCBUILDINGSTOREY', { bauform: 'koerper', guete: 'gemessen', quelle: 'geometrie', warnungen: [] });
        expect(k.luecke.stufe).toBe('vokabular');
    });

    it('meldet die SCHEMA-Lücke zuerst — sie ist die andere Frage', () => {
        // Ein Name, den kein IFC-Schema kennt, hat keine Vererbungskette. Ihm
        // ein fehlendes Typprofil vorzuwerfen führte in die Irre: auch mit
        // Profil erbte nichts von ihm.
        const k = h('IFCQUATSCHXYZ', NICHTS);
        expect(k.imWoerterbuch).toBe(false);
        expect(k.luecke.stufe).toBe('schema');
    });
});

describe('Dieselbe Operation, verschiedene Namen — das Vokabular ist DATEN', () => {
    it('heißt am Rohr „Sohlhöhe" und am Bordstein „Oberkante"', () => {
        // EIN Katalogeintrag, EIN Programmcode. Stünde „Sohlhöhe" im Katalog,
        // bekäme der Bordstein die falsche Beschriftung — und man schriebe
        // eine zweite Operation dafür. Das ist der Anfang von O(Typen).
        expect(label(h('IFCPIPESEGMENT', LINEAR), 'bezugshoehe-setzen')).toBe('Sohlhöhe');
        expect(label(h('IFCKERB', LINEAR), 'bezugshoehe-setzen')).toBe('Oberkante');
    });

    it('heißt am Rohr „DN" und am Träger „Profilreihe"', () => {
        expect(label(h('IFCPIPESEGMENT', LINEAR), 'profilgroesse-setzen')).toBe('DN');
        expect(label(h('IFCBEAM', LINEAR), 'profilgroesse-setzen')).toBe('Profilreihe');
    });
});

describe('Drei Herkünfte, drei Fragen — mehr gibt es nicht', () => {
    it('trennt „immer", „wegen der Form" und „wegen der Größe"', () => {
        const k = h('IFCPIPESEGMENT', LINEAR);
        const nach = Object.fromEntries(k.gruppen.map(g => [g.art, g.eintraege.map(e => e.id)]));
        expect(nach.immer).toEqual(['kg-setzen', 'din277-setzen']);
        expect(nach.rolle).toEqual(['bezugshoehe-setzen', 'profilgroesse-setzen']);
    });

    it('bietet dem Schacht die Bezugshöhe, aber keine Querschnittsgröße', () => {
        // Der Schacht kennt die Rolle `sohlhoehe`, nicht `profilGroesse` — und
        // genau daran, nicht an seinem Typnamen, hängt das Angebot.
        const k = h('IFCDISTRIBUTIONCHAMBERELEMENT', KOERPER);
        expect(ids(k)).toContain('bezugshoehe-setzen');
        expect(ids(k)).not.toContain('profilgroesse-setzen');
    });
});

describe('Was NICHT geht, sagt warum', () => {
    it('nennt die fehlende Rolle beim Namen', () => {
        const k = h('IFCQUATSCHXYZ', NICHTS);
        const nein = k.gesperrt.find(g => g.id === 'bezugshoehe-setzen');
        expect(nein.warum).toMatch(/sohlhoehe/);
        expect(nein.warum).toMatch(/Typprofil/);
    });

    it('nennt die zu niedrige Güte, wenn die Form stimmt', () => {
        expect(warumNicht(
            { id: 'x', bauform: 'achse+profil', mindestGuete: 'gemessen', gruppe: 'lage' },
            { bauform: 'achse+profil', guete: 'unbekannt', typprofil: null },
        )).toMatch(/Güte/);
    });

    it('führt die Zeichenwerkzeuge NICHT als gesperrt', () => {
        // Sie sind nicht blockiert, sie leben nur woanders. Sie hier zu listen
        // hiesse, jedem Bauteil zwei falsche Absagen anzuhängen.
        const k = h('IFCPIPESEGMENT', LINEAR);
        expect(k.gesperrt.map(g => g.id)).not.toContain('linie-zeichnen');
    });
});

describe('Die Bezugshöhe verschiebt um die DIFFERENZ', () => {
    const ROHR = {
        globalId: 'H12',
        anker: { x: 5, y: 10.15, z: 2 },   // Hüllenmitte
        bezugshoehe: 10.0,                 // Unterkante — DN 300, also 15 cm tiefer
    };

    it('rechnet die Differenz auf den Anker, statt ihn auf den Wert zu setzen', () => {
        // Der Anker ist die Hüllenmitte, die Bezugshöhe die Unterkante. Wer die
        // Mitte auf die Sohle setzt, senkt das Rohr um seinen halben
        // Durchmesser zu weit — bei DN 300 sind das 15 cm, und beim Hinsehen
        // sieht es nach „stimmt ungefähr" aus.
        const b = nachId('bezugshoehe-setzen');
        const eintrag = b.anwenden(ROHR, { hoehe: 12.4 });

        expect(eintrag.art).toBe('lage');
        expect(eintrag.nachher.y).toBeCloseTo(12.55, 6);   // 12,40 + halbe Höhe
        expect(eintrag.nachher.x).toBe(5);                 // seitlich unberührt
        expect(eintrag.nachher.z).toBe(2);
    });

    it('lässt die Lage in Ruhe, wenn der Wert schon stimmt', () => {
        const eintrag = nachId('bezugshoehe-setzen').anwenden(ROHR, { hoehe: 10.0 });
        expect(eintrag.nachher).toEqual(ROHR.anker);
    });

    it('legt ohne Anker gar nichts fest, statt gegen null zu rechnen', () => {
        // Ein Bauteil ohne Hülle hat keine Bezugshöhe. Daraus 0 zu machen
        // schriebe eine Festlegung auf Höhe null ins Journal — und die
        // überlebte jedes Neuladen.
        expect(nachId('bezugshoehe-setzen').anwenden({ globalId: 'X' }, { hoehe: 12.4 })).toBe(null);
    });

    it('führt die Querschnittsgröße als Festlegung, nicht als Geometrieänderung', () => {
        const b = nachId('profilgroesse-setzen');
        expect(b.nurFestlegung).toBe(true);
        expect(b.anwenden({ globalId: 'H12' }, { groesse: 300 }))
            .toEqual({ art: 'parametrik', globalId: 'H12', nachher: { rolle: 'profilGroesse', wert: 300 } });
    });
});
