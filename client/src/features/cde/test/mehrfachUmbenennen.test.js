// @vitest-environment jsdom
/**
 * Mehrfachbearbeitung und Umbenennen (Stufe 14.10).
 *
 * Die Rahmenauswahl gab es seit jeher — sie wählte mehrere Bauteile aus, hob
 * sie hervor und sagte es der Konsole. Mehrfachbearbeitung war also nicht
 * schwierig, sondern schlicht nicht verdrahtet.
 *
 * Der gefährlichste Vorgabewert, den dieses Feature haben könnte, wäre ein
 * stillschweigendes „gilt für alle": fünf Schächte auf denselben Rechtswert zu
 * schieben legt sie übereinander, fünf Haltungen dieselbe Sohlhöhe zu geben
 * ebnet den Strang ein. Deshalb sagt der KATALOG, was auf viele darf.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { useAenderungen, standAus, AENDERUNGS_ARTEN } from '../stores/useAenderungen.js';
import { nachId, nameAusMuster, BEARBEITUNGEN } from '../services/Bearbeitungen.js';

beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    useBearbeitung().modusSetzen(true);
});

const resolver = {
    forElements: () => ({
        async getForm(form) {
            if (form === 'axis') {
                return { form, perElement: [{ polyline: [[0, 18, 0], [100, 2, 0]], source: 'extrusion', warnings: [] }] };
            }
            if (form === 'solid') return { form, data: { closed: true, triCount: 12 }, perElement: [], warnings: [] };
            return { form, data: null, perElement: [], warnings: [] };
        },
    }),
};

const rohr = (n) => ({
    modelId: 'm1', localId: n, category: 'IFCPIPESEGMENT', globalId: `H${n}`,
    name: `alt-${n}`, hoehenversatz: 300,
    anker: { x: 0, y: 10, z: 0 }, bezugshoehe: 2, oberkante: 18,
});

describe('Das Muster', () => {
    it('setzt die laufende Nummer ein, mit und ohne Auffüllen', () => {
        expect(nameAusMuster('H-{n}', { nummer: 7 })).toBe('H-7');
        expect(nameAusMuster('H-{n:3}', { nummer: 7 })).toBe('H-007');
        expect(nameAusMuster('{alt} / neu', { alt: 'FK003' })).toBe('FK003 / neu');
        expect(nameAusMuster('KR-{n:2}-{alt}', { nummer: 4, alt: 'x' })).toBe('KR-04-x');
    });

    it('ohne Muster kein Name — lieber nichts als „undefined"', () => {
        expect(nameAusMuster('')).toBe('');
        expect(nameAusMuster(null)).toBe('');
    });

    it('lässt Text ohne Platzhalter unangetastet', () => {
        expect(nameAusMuster('Hauptsammler', { nummer: 9 })).toBe('Hauptsammler');
    });
});

describe('Der Katalog sagt, was auf viele darf', () => {
    it('Werte-Werkzeuge dürfen, ortsgebundene nicht', () => {
        const darf = (id) => !!nachId(id).mehrfach;
        for (const id of ['kg-setzen', 'din277-setzen', 'umbenennen',
                          'profilgroesse-setzen', 'fliessrichtung-setzen']) {
            expect(darf(id), id).toBe(true);
        }
        for (const id of ['schacht-verschieben', 'sohlhoehen-setzen',
                          'haltung-teilen', 'schacht-einfuegen', 'strang-gefaelle-setzen']) {
            expect(darf(id), id).toBe(false);
        }
    });

    it('die Vorgabe ist „eines" — Mehrfach muss angesagt werden', () => {
        const ohne = BEARBEITUNGEN.filter(b => b.mehrfach === undefined);
        expect(ohne.length).toBeGreaterThan(0);
        for (const b of ohne) expect(!!b.mehrfach, b.id).toBe(false);
    });
});

describe('Mehrfach anwenden', () => {
    async function waehle(n) {
        const b = useBearbeitung();
        const alle = Array.from({ length: n }, (_, i) => rohr(i + 1));
        await b.einordne(alle[0], resolver, { weitere: alle.slice(1) });
        return b;
    }

    it('trifft jedes Bauteil der Auswahl — unter EINEM Vorgang', async () => {
        const b = await waehle(4);
        expect(b.bauteile).toHaveLength(4);
        b.starte('kg-setzen');
        b.setzeWert('kg', '322');

        const e = await b.ausfuehren({ wer: 'Fabio' });
        expect(e).toHaveLength(4);
        expect(new Set(e.map(x => x.vorgang)).size).toBe(1);
        expect(new Set(e.map(x => x.globalId)).size).toBe(4);
        expect(standAus(useAenderungen().eintraege, 'kg').size).toBe(4);
    });

    it('zählt beim Umbenennen hoch', async () => {
        const b = await waehle(3);
        b.starte('umbenennen');
        b.setzeWert('muster', 'H-{n:3}');
        b.setzeWert('beginnBei', 10);

        const e = await b.ausfuehren({ wer: 'Fabio' });
        expect(e.map(x => x.nachher)).toEqual(['H-010', 'H-011', 'H-012']);
        expect(e.every(x => x.art === 'bezeichnung')).toBe(true);
    });

    it('lässt eine NICHT gekennzeichnete Bearbeitung nur das erste treffen', async () => {
        // Die eigentliche Zusage. Ohne sie legte ein Klick fünf Schächte
        // übereinander.
        const b = await waehle(3);
        b.starte('bezugshoehe-setzen');
        b.setzeWert('hoehe', 305);
        const e = await b.ausfuehren({ wer: 'Fabio' });
        expect(Array.isArray(e)).toBe(false);
        expect(e.globalId).toBe('H1');
        expect(useAenderungen().eintraege).toHaveLength(1);
    });

    it('mit nur EINEM Bauteil bleibt der Rückgabewert einteilig', async () => {
        // Die bisherigen Aufrufer merken von der Erweiterung nichts.
        const b = await waehle(1);
        b.starte('kg-setzen');
        b.setzeWert('kg', '322');
        const e = await b.ausfuehren({ wer: 'Fabio' });
        expect(Array.isArray(e)).toBe(false);
        expect(e.art).toBe('kg');
    });

    it('„zurück" nimmt die ganze Massenänderung zurück', async () => {
        const ae = useAenderungen();
        const b = await waehle(5);
        b.starte('umbenennen');
        b.setzeWert('muster', 'X-{n}');
        await b.ausfuehren({ wer: 'Fabio' });
        expect(standAus(ae.eintraege, 'bezeichnung').size).toBe(5);

        expect(await ae.zurueck('Fabio')).toHaveLength(5);
        expect(standAus(ae.eintraege, 'bezeichnung').size).toBe(0);
    });

    it('MELDET, was übersprungen wurde — statt es zu verschweigen', async () => {
        // Ein Bauteil ohne GlobalId lässt sich nicht eintragen. „Auf 2
        // angewandt, 1 übersprungen" ist eine Auskunft; stilles Überspringen
        // wäre eine Behauptung.
        const b = useBearbeitung();
        const alle = [rohr(1), { ...rohr(2), globalId: '' }, rohr(3)];
        await b.einordne(alle[0], resolver, { weitere: alle.slice(1) });
        b.starte('umbenennen');
        b.setzeWert('muster', 'X-{n}');

        const e = await b.ausfuehren({ wer: 'Fabio' });
        expect(e).toHaveLength(2);
        expect(b.letzterGrund).toMatch(/übersprungen/);
    });
});

describe('Strang durchnummerieren', () => {
    const STRANG = [
        { globalId: 'H1', name: 'a', laenge: 50, anfang: { x: 0, y: 10, z: 0 }, ende: { x: 50, y: 9, z: 0 } },
        { globalId: 'H2', name: 'b', laenge: 50, anfang: { x: 50, y: 9, z: 0 }, ende: { x: 100, y: 8, z: 0 } },
        { globalId: 'H3', name: 'c', laenge: 50, anfang: { x: 100, y: 8, z: 0 }, ende: { x: 150, y: 7, z: 0 } },
    ];

    it('nummeriert in FLIESSRICHTUNG, nicht in Auswahlreihenfolge', () => {
        // Ein Rahmen liefert seine Treffer in beliebiger Folge; „H-001, H-002"
        // wäre dann eine Nummerierung nach Zufall. Die Kette hat eine
        // Reihenfolge, die etwas bedeutet.
        const e = nachId('strang-umbenennen')
            .anwenden({ strang: STRANG }, { muster: 'KR-{n:2}', beginnBei: 1 });
        expect(e.map(x => x.globalId)).toEqual(['H1', 'H2', 'H3']);
        expect(e.map(x => x.nachher)).toEqual(['KR-01', 'KR-02', 'KR-03']);
    });

    it('kann den alten Namen mitführen', () => {
        const e = nachId('strang-umbenennen')
            .anwenden({ strang: STRANG }, { muster: '{n}-{alt}', beginnBei: 1 });
        expect(e[1].nachher).toBe('2-b');
    });

    it('ohne Strang gibt es nichts zu nummerieren', () => {
        expect(nachId('strang-umbenennen').anwenden({ strang: [] }, { muster: 'H-{n}' })).toBeNull();
        expect(nachId('strang-umbenennen').anwenden({}, { muster: 'H-{n}' })).toBeNull();
    });
});

describe('Die Bezeichnung ist eine eigene Art', () => {
    it('berührt das Modell nicht', () => {
        // `Name` ist in IFC ein ATTRIBUT, kein Pset-Eintrag — und der
        // Änderungsbericht soll „Bezeichnung" sagen, nicht „Merkmalssatz".
        expect(AENDERUNGS_ARTEN.bezeichnung).toBeTruthy();
        expect(AENDERUNGS_ARTEN.bezeichnung.beruehrtModell).toBeFalsy();
    });
});
