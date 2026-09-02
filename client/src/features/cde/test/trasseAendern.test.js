// @vitest-environment jsdom
/**
 * Trasse ändern — und die Eingabeart am Katalogeintrag (Stufe 14.12).
 *
 * Bisher gab es genau zwei Fälle, und beide waren im Programm verdrahtet:
 * Werte aus einem Formular, oder ein gezeichneter Zug bei den
 * Erzeugen-Werkzeugen. „Trasse ändern" ist der erste Fall, der BEIDES braucht
 * — ein vorhandenes Bauteil UND einen gezeichneten Zug. Daran wird sichtbar,
 * dass die Eingabeart eine Eigenschaft der Bearbeitung ist und kein Sonderfall
 * des Zeichnens.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { useAenderungen, standAus } from '../stores/useAenderungen.js';
import { nachId, eingabeArt, BEARBEITUNGEN } from '../services/Bearbeitungen.js';
import { useZeichnen } from '../composables/useZeichnen.js';

beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    useBearbeitung().modusSetzen(true);
});

const resolver = {
    forElements: () => ({
        async getForm(form) {
            if (form === 'axis') {
                return { form, perElement: [{ polyline: [[0, 20, 0], [100, 10, 0]], source: 'extrusion', warnings: [] }] };
            }
            if (form === 'solid') return { form, data: { closed: true, triCount: 12 }, perElement: [], warnings: [] };
            return { form, data: null, perElement: [], warnings: [] };
        },
    }),
};

/** 100 m in X, 10 m Fall. */
const HALTUNG = {
    modelId: 'm1', localId: 1, category: 'IFCPIPESEGMENT', globalId: 'H1', name: 'FK003',
    hoehenversatz: 300, anker: { x: 50, y: 15, z: 0 }, bezugshoehe: 10, oberkante: 20,
    achse: { anfang: { x: 0, y: 20, z: 0 }, ende: { x: 100, y: 10, z: 0 },
             laenge: 100, dn: 300, quelle: 'extrusion' },
};

describe('Die Eingabeart steht am Katalogeintrag', () => {
    it('Vorgabe ist „nur Formularwerte"', () => {
        expect(eingabeArt(nachId('kg-setzen'))).toBe('wert');
        expect(eingabeArt(nachId('sohlhoehen-setzen'))).toBe('wert');
        expect(eingabeArt(null)).toBe('wert');
        expect(eingabeArt({ eingabe: 'erfunden' })).toBe('wert');
    });

    it('die Zeichenwerkzeuge leiten sie aus dem REZEPT ab', () => {
        // Ob ein Rezept einen offenen Zug oder einen geschlossenen Umriss will,
        // steht schon im Rezept — zwei Listen, die dasselbe aufzählen, liefen
        // auseinander.
        expect(eingabeArt(nachId('linie-zeichnen'))).toBe('zug');
        expect(eingabeArt(nachId('rohr-zeichnen'))).toBe('zug');
        expect(eingabeArt(nachId('flaeche-zeichnen'))).toBe('umriss');
    });

    it('„Trasse ändern" braucht einen Zug UND gehört zur Gruppe Lage', () => {
        // Die Gruppe sagt, wo etwas angeboten wird; die Eingabeart, womit es
        // gefüttert wird. Das sind zwei Fragen.
        const b = nachId('trasse-aendern');
        expect(eingabeArt(b)).toBe('zug');
        expect(b.gruppe).toBe('lage');
    });

    it('jede Bearbeitung nennt eine Eingabeart, die es gibt', () => {
        for (const b of BEARBEITUNGEN) {
            expect(['wert', 'zug', 'umriss'], b.id).toContain(eingabeArt(b));
        }
    });
});

describe('Nur die Zwischenpunkte werden gezeichnet', () => {
    const zug = [{ x: 30, z: 20 }, { x: 70, z: 20 }];

    it('Anfang und Ende bleiben, wo sie sind', () => {
        // Im Kanalbau stehen die Schächte; nur der Weg dazwischen ändert sich.
        // Das erspart ein Fangen an den Schächten und trifft genau, was gemeint
        // ist: eine Haltung wird um ein Hindernis herumgeführt.
        const [, neu] = nachId('trasse-aendern').anwenden(HALTUNG, {}, { zug });
        const p = neu.nachher.parameter.punkte;
        expect(p).toHaveLength(4);
        expect(p[0]).toEqual([0, 20, 0]);
        expect(p[3]).toEqual([100, 10, 0]);
    });

    it('verteilt die Höhen gleichmässig über die NEUE Länge', () => {
        // Der Lageplan ist eine Draufsicht — die gezeichneten Punkte haben
        // keine sinnvolle Höhe. Sie aus dem Gefälle zu interpolieren ist das,
        // was ein Planer ohnehin täte.
        const [, neu] = nachId('trasse-aendern').anwenden(HALTUNG, {}, { zug });
        const p = neu.nachher.parameter.punkte;
        // Die Höhen fallen streng und enden auf dem Ausgangswert.
        for (let i = 0; i + 1 < p.length; i++) expect(p[i][1]).toBeGreaterThan(p[i + 1][1]);
        expect(p[3][1]).toBeCloseTo(10, 6);
    });

    it('ein einziger Zwischenpunkt genügt', () => {
        const [geloescht, neu] = nachId('trasse-aendern')
            .anwenden(HALTUNG, {}, { zug: [{ x: 50, z: 30 }] });
        expect(geloescht.art).toBe('geloescht');
        expect(neu.nachher.parameter.punkte).toHaveLength(3);
    });

    it('erbt Nennweite, Typ und Namen', () => {
        const [, neu] = nachId('trasse-aendern').anwenden(HALTUNG, {}, { zug });
        expect(neu.nachher.parameter.dn).toBe(300);
        expect(neu.nachher.kategorie).toBe('IFCPIPESEGMENT');
        expect(neu.nachher.name).toBe('FK003');
    });

    it('ohne Zug oder ohne Achse passiert nichts', () => {
        const b = nachId('trasse-aendern');
        expect(b.anwenden(HALTUNG, {}, { zug: [] })).toBeNull();
        expect(b.anwenden({ globalId: 'X' }, {}, { zug })).toBeNull();
    });
});

describe('Der Motor: Zeichnen für eine Bearbeitung MIT Subjekt', () => {
    function bau({ bauteil = null } = {}) {
        const bearbeitung = useBearbeitung();
        const zeichnen = useZeichnen({
            bearbeitung, cde: { bearbeiter: 'Fabio' },
            getModellSha: () => 'sha1', getHoehenversatz: () => 300,
        });
        return { bearbeitung, zeichnen, bauteil };
    }

    it('verlangt ein gewähltes Bauteil — sonst wäre es ein toter Knopf', () => {
        const t = bau();
        expect(t.zeichnen.starte('trasse-aendern')).toBe(false);
        expect(t.zeichnen.grund.value).toMatch(/Bauteil/);
        expect(t.bearbeitung.scharf).toBeNull();      // nichts bleibt scharf
    });

    it('läuft mit gewähltem Bauteil und reicht den Zug an die Bearbeitung', async () => {
        const t = bau();
        await t.bearbeitung.einordne({ ...HALTUNG }, resolver);
        expect(t.zeichnen.starte('trasse-aendern')).toBe(true);

        t.zeichnen.setzePunkt({ x: 30, z: 20 });
        t.zeichnen.setzePunkt({ x: 70, z: 20 });
        const eintraege = await t.zeichnen.abschliessen();

        expect(eintraege).toHaveLength(2);
        expect(eintraege.map(e => e.art)).toEqual(['geloescht', 'erzeugt']);
        expect(eintraege[0].globalId).toBe('H1');
        expect(eintraege[1].nachher.parameter.punkte).toHaveLength(4);
        // Ein Vorgang — „zurück" nimmt beides.
        expect(new Set(eintraege.map(e => e.vorgang)).size).toBe(1);
    });

    it('das ERZEUGEN läuft unverändert weiter', async () => {
        // Der Umbau darf den bisherigen Weg nicht anfassen: dort IST das
        // Gezeichnete das Bauteil und kommt als Subjekt herein.
        const t = bau();
        t.zeichnen.starte('linie-zeichnen');
        t.zeichnen.setzePunkt({ x: 0, z: 0 });
        t.zeichnen.setzePunkt({ x: 10, z: 0 });
        const e = await t.zeichnen.abschliessen();
        expect(e.art).toBe('erzeugt');
        expect(e.nachher.rezept).toBe('linie');
    });

    it('„zurück" stellt die alte Trasse wieder her', async () => {
        const ae = useAenderungen();
        const t = bau();
        await t.bearbeitung.einordne({ ...HALTUNG }, resolver);
        t.zeichnen.starte('trasse-aendern');
        t.zeichnen.setzePunkt({ x: 50, z: 40 });
        await t.zeichnen.abschliessen();

        expect(standAus(ae.eintraege, 'geloescht').size).toBe(1);
        expect(await ae.zurueck('Fabio')).toHaveLength(2);
        expect(standAus(ae.eintraege, 'geloescht').size).toBe(0);
        expect(standAus(ae.eintraege, 'erzeugt').size).toBe(0);
    });
});
