// @vitest-environment jsdom
/**
 * Sanierungsabschnitt und Mengenauszug (Stufe 14.11).
 *
 * Eine Maßnahme ist eine ENTSCHEIDUNG, kein Messwert — deshalb ein
 * geschlossenes Vokabular wie bei der Kostengruppe und kein Freitext. Und sie
 * wird fast nie an einer Haltung getroffen, sondern an einem Abschnitt.
 *
 * Der Mengenauszug ist der Grund, warum das mehr ist als eine Farbe: aus
 * „dieser Strang bekommt einen Liner" wird erst dann etwas, wenn danebensteht,
 * wie viele Meter DN 300 Beton das sind.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { useAenderungen, standAus, AENDERUNGS_ARTEN } from '../stores/useAenderungen.js';
import { nachId } from '../services/Bearbeitungen.js';
import { MASSNAHMEN, massnahmeNach, istMassnahme, mengenNachMassnahme }
    from '../services/Sanierung.js';

beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    useBearbeitung().modusSetzen(true);
});

const resolver = {
    forElements: () => ({
        async getForm(form) {
            if (form === 'axis') {
                return { form, perElement: [{ polyline: [[0, 10, 0], [50, 9, 0]], source: 'extrusion', warnings: [] }] };
            }
            if (form === 'solid') return { form, data: { closed: true, triCount: 12 }, perElement: [], warnings: [] };
            return { form, data: null, perElement: [], warnings: [] };
        },
    }),
};

const STRANG = [
    { globalId: 'H1', name: 'a', laenge: 50, dn: 300, anfang: { x: 0, y: 10, z: 0 }, ende: { x: 50, y: 9, z: 0 } },
    { globalId: 'H2', name: 'b', laenge: 30, dn: 300, anfang: { x: 50, y: 9, z: 0 }, ende: { x: 80, y: 8, z: 0 } },
    { globalId: 'H3', name: 'c', laenge: 20, dn: 500, anfang: { x: 80, y: 8, z: 0 }, ende: { x: 100, y: 7, z: 0 } },
];
const HALTUNG = {
    modelId: 'm1', localId: 1, category: 'IFCPIPESEGMENT', globalId: 'H1', name: 'a',
    hoehenversatz: 300, anker: { x: 25, y: 9.5, z: 0 }, bezugshoehe: 9, oberkante: 10,
    achse: { anfang: { x: 0, y: 10, z: 0 }, ende: { x: 50, y: 9, z: 0 }, laenge: 50, dn: 300, quelle: 'extrusion' },
    strang: STRANG,
};

describe('Die Maßnahmen sind Daten', () => {
    it('ein geschlossenes Vokabular, kein Freitext', () => {
        expect(MASSNAHMEN.map(m => m.wert)).toEqual([
            'keine', 'inspektion', 'reparatur', 'renovierung', 'erneuerung',
        ]);
        expect(massnahmeNach('renovierung').titel).toMatch(/Liner/);
        expect(massnahmeNach('gibtsnicht')).toBeNull();
    });

    it('„keine" ist keine Maßnahme — sie gehört in keinen Auszug', () => {
        expect(istMassnahme('erneuerung')).toBe(true);
        expect(istMassnahme('keine')).toBe(false);
        expect(istMassnahme(null)).toBe(false);
        expect(istMassnahme('erfunden')).toBe(false);
    });

    it('ist eine eigene Änderungsart, die das Modell nicht berührt', () => {
        expect(AENDERUNGS_ARTEN.massnahme).toBeTruthy();
        expect(AENDERUNGS_ARTEN.massnahme.beruehrtModell).toBeFalsy();
    });
});

describe('Der Abschnitt, nicht die Haltung', () => {
    it('legt die Maßnahme für die ganze Kette fest', async () => {
        const b = useBearbeitung();
        await b.einordne({ ...HALTUNG }, resolver);
        expect(b.starte('strang-massnahme')).toBe(true);
        b.setzeWert('massnahme', 'renovierung');

        const e = await b.ausfuehren({ wer: 'Fabio' });
        expect(e).toHaveLength(3);
        expect(e.map(x => x.globalId)).toEqual(['H1', 'H2', 'H3']);
        expect(new Set(e.map(x => x.vorgang)).size).toBe(1);
        expect(standAus(useAenderungen().eintraege, 'massnahme').get('H2')).toBe('renovierung');
    });

    it('„zurück" hebt den ganzen Abschnitt auf', async () => {
        const ae = useAenderungen();
        const b = useBearbeitung();
        await b.einordne({ ...HALTUNG }, resolver);
        b.starte('strang-massnahme');
        b.setzeWert('massnahme', 'erneuerung');
        await b.ausfuehren({ wer: 'Fabio' });

        await ae.zurueck('Fabio');
        expect(standAus(ae.eintraege, 'massnahme').size).toBe(0);
    });

    it('die Einzel-Maßnahme wirkt auf viele — man saniert Abschnitte', () => {
        expect(nachId('massnahme-setzen').mehrfach).toBe(true);
        expect(nachId('massnahme-setzen').anwenden({ globalId: 'X' }, { massnahme: 'reparatur' }))
            .toEqual({ art: 'massnahme', globalId: 'X', nachher: 'reparatur' });
    });

    it('eine leere Auswahl hebt die Maßnahme auf, statt „keine" zu schreiben', () => {
        // `null` löscht den Eintrag aus dem Stand — so wie bei der
        // Kostengruppe. Ein Wort „keine" im Journal wäre ein Zustand mehr, den
        // jeder Leser unterscheiden müsste.
        expect(nachId('massnahme-setzen').anwenden({ globalId: 'X' }, { massnahme: '' }).nachher)
            .toBeNull();
    });
});

describe('Der Mengenauszug', () => {
    const bauteile = STRANG.map(k => ({ globalId: k.globalId, laenge: k.laenge, dn: k.dn }));
    const merkmale = new Map([
        ['H1', { Material: 'Beton' }],
        ['H2', { Material: 'Beton' }],
        ['H3', { Material: 'Steinzeug' }],
    ]);

    it('gruppiert nach Maßnahme, Nennweite und Material', () => {
        const stand = new Map([['H1', 'renovierung'], ['H2', 'renovierung'], ['H3', 'erneuerung']]);
        const { zeilen, summe } = mengenNachMassnahme({ bauteile, stand, merkmale });

        expect(zeilen).toHaveLength(2);
        expect(zeilen[0]).toEqual({
            massnahme: 'renovierung', dn: 300, material: 'Beton', anzahl: 2, laenge: 80,
        });
        expect(zeilen[1]).toEqual({
            massnahme: 'erneuerung', dn: 500, material: 'Steinzeug', anzahl: 1, laenge: 20,
        });
        expect(summe).toEqual({ anzahl: 3, laenge: 100 });
    });

    it('trennt nach Material, auch bei gleicher Nennweite', () => {
        const stand = new Map([['H1', 'reparatur'], ['H2', 'reparatur']]);
        const gemischt = new Map([['H1', { Material: 'Beton' }], ['H2', { Material: 'PVC' }]]);
        const { zeilen } = mengenNachMassnahme({ bauteile, stand, merkmale: gemischt });
        expect(zeilen).toHaveLength(2);
        expect(zeilen.map(z => z.material).sort()).toEqual(['Beton', 'PVC']);
    });

    it('fehlendes Material wird „unbekannt" — nicht unter ein anderes gemischt', () => {
        // Eine eigene Zeile ist ehrlicher: 460 Schächte im A64-Netz haben gar
        // keine Materialangabe.
        const stand = new Map([['H1', 'erneuerung']]);
        const { zeilen } = mengenNachMassnahme({ bauteile, stand, merkmale: new Map() });
        expect(zeilen[0].material).toBe('unbekannt');
    });

    it('zählt „keine" und Unbelegtes NICHT mit', () => {
        const stand = new Map([['H1', 'keine'], ['H2', null]]);
        expect(mengenNachMassnahme({ bauteile, stand, merkmale }).summe)
            .toEqual({ anzahl: 0, laenge: 0 });
    });

    it('die grösste Position steht oben — der Auszug liest sich von oben', () => {
        const stand = new Map([['H1', 'erneuerung'], ['H2', 'erneuerung'], ['H3', 'erneuerung']]);
        const { zeilen } = mengenNachMassnahme({ bauteile, stand, merkmale });
        expect(zeilen[0].laenge).toBeGreaterThanOrEqual(zeilen[1].laenge);
    });

    it('erträgt eine leere Grundlage, ohne zu werfen', () => {
        expect(mengenNachMassnahme()).toEqual({ zeilen: [], summe: { anzahl: 0, laenge: 0 } });
    });

    it('rundet auf Zentimeter — Rohrlängen brauchen nicht mehr', () => {
        const krumm = [{ globalId: 'H1', laenge: 12.3456789, dn: 300 }];
        const { zeilen, summe } = mengenNachMassnahme({
            bauteile: krumm, stand: new Map([['H1', 'reparatur']]), merkmale,
        });
        expect(zeilen[0].laenge).toBe(12.35);
        expect(summe.laenge).toBe(12.35);
    });
});
