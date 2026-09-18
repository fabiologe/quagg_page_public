/**
 * Das Eingabe-Register (Teil XVI, S3): Schlitze × Gesten, abgeleitet aus dem
 * Katalog — und der Vertrag, dass jede deklarierte Geste einen Verbraucher hat.
 */
import { describe, expect, it } from 'vitest';
import { BEARBEITUNGEN, nachId } from '../services/Bearbeitungen.js';
import { GESTEN, GESTEN_GEBAUT, SCHLITZE, eingabenFuer, enterRegel, naechsterSchritt } from '../services/Eingaben.js';

describe('eingabenFuer', () => {
    it('ein Formular-Werkzeug: nur das Subjekt', () => {
        expect(eingabenFuer(nachId('kg-setzen'))).toEqual({
            schlitze: [{ schlitz: 'subjekt', anzahl: { min: 1, max: Infinity } }],   // mehrfach
            felderMitGeste: [],
        });
        expect(eingabenFuer(nachId('bezugshoehe-setzen')).schlitze[0].anzahl.max).toBe(1);
    });

    it('Erzeugen hat KEIN Subjekt — der Zug ist das Bauteil', () => {
        const e = eingabenFuer(nachId('linie-zeichnen'));
        expect(e.schlitze).toEqual([{ schlitz: 'zug', anzahl: { min: 2, max: Infinity } }]);
        expect(eingabenFuer(nachId('flaeche-zeichnen')).schlitze[0]).toEqual({ schlitz: 'umriss', anzahl: { min: 3, max: Infinity } });
    });

    it('Trasse ändern: Subjekt UND Zug', () => {
        expect(eingabenFuer(nachId('trasse-aendern')).schlitze.map(s => s.schlitz)).toEqual(['subjekt', 'zug']);
    });

    it('An Schacht anschliessen: genau EIN Punkt, gefangen auf Schächte', () => {
        const z = eingabenFuer(nachId('an-schacht-anschliessen')).schlitze.find(s => s.schlitz === 'zug');
        expect(z).toEqual({ schlitz: 'zug', anzahl: { min: 1, max: 1 }, fang: 'knoten' });
    });

    it('die Station ist ein FELD mit der Geste „punkt auf der Achse"', () => {
        for (const id of ['haltung-teilen', 'schacht-einfuegen']) {
            const g = eingabenFuer(nachId(id)).felderMitGeste;
            expect(g, id).toEqual([{ name: 'station', geste: 'punkt', auf: 'achse', liefert: 'station' }]);
        }
    });

    it('das Gelände des Kanalgrabens ist eine AUSWAHL mit Bauform-Filter', () => {
        const g = eingabenFuer(nachId('kanalgraben-ableiten')).felderMitGeste[0];
        expect(g).toEqual({ name: 'gelaende', geste: 'auswahl', bauform: ['hoehenfeld'], liefert: 'globalId' });
        expect(eingabenFuer(nachId('aussparung-ableiten')).felderMitGeste[0]).toMatchObject({ name: 'werkzeug', geste: 'auswahl', herkunft: 'cde' });
    });

    it('null ist kein Fehler', () => {
        expect(eingabenFuer(null)).toEqual({ schlitze: [], felderMitGeste: [] });
    });
});

describe('Der Vertrag über den ganzen Katalog', () => {
    it('jeder Eintrag hat gültige Schlitze und nur bekannte Gesten', () => {
        for (const b of BEARBEITUNGEN) {
            const e = eingabenFuer(b);
            for (const s of e.schlitze) {
                expect(Object.keys(SCHLITZE), `${b.id}: Schlitz ${s.schlitz}`).toContain(s.schlitz);
                expect(s.anzahl.min, `${b.id}: min`).toBeGreaterThanOrEqual(0);
                expect(s.anzahl.max, `${b.id}: max`).toBeGreaterThanOrEqual(s.anzahl.min);
            }
            for (const f of e.felderMitGeste) {
                expect(Object.keys(GESTEN), `${b.id}: Geste ${f.geste}`).toContain(f.geste);
                // Eine deklarierte Geste ohne Verbraucher wäre ein toter Knopf.
                expect(GESTEN_GEBAUT, `${b.id}.${f.name}: Geste ${f.geste} hat keinen Verbraucher`).toContain(f.geste);
                // Und sie muss ein Feld des Eintrags sein.
                expect((b.felder ?? []).some(x => x.name === f.name), `${b.id}: Feld ${f.name}`).toBe(true);
            }
        }
    });

    it('ein Zug-Werkzeug ohne Subjekt ist Erzeugen — und nur das', () => {
        for (const b of BEARBEITUNGEN) {
            const e = eingabenFuer(b);
            const hatSubjekt = e.schlitze.some(s => s.schlitz === 'subjekt');
            expect(hatSubjekt, b.id).toBe(b.gruppe !== 'erzeugen');
        }
    });
});

describe('naechsterSchritt und enterRegel', () => {
    const zug = eingabenFuer(nachId('gerinne-einschneiden'));

    it('zählt die fehlenden Punkte, dann „Enter schliesst ab", dann das Formular', () => {
        expect(naechsterSchritt(zug, { punkte: 0 })).toMatchObject({ art: 'zug', hinweis: 'noch 2 Punkte' });
        expect(naechsterSchritt(zug, { punkte: 1 })).toMatchObject({ art: 'zug', hinweis: 'noch 1 Punkt' });
        // Kein Doppelklick mehr: gezeichnet wird im Raum, Enter schliesst ab (2026-09-17).
        expect(naechsterSchritt(zug, { punkte: 3 })).toMatchObject({ art: 'zug', hinweis: '3 Punkte — Enter schliesst ab' });
        expect(naechsterSchritt(zug, { punkte: 3, zugGeschlossen: true, bereit: false })).toMatchObject({ art: 'feld' });
        expect(naechsterSchritt(zug, { punkte: 3, zugGeschlossen: true, bereit: true })).toMatchObject({ art: 'bereit' });
    });

    it('ein Zug mit Höchstzahl (Anschliessen: 1) ist nach dem ersten Punkt fertig', () => {
        const a = eingabenFuer(nachId('an-schacht-anschliessen'));
        expect(naechsterSchritt(a, { punkte: 1 })).toMatchObject({ art: 'bereit' });
    });

    it('eine laufende Geste geht vor', () => {
        expect(naechsterSchritt(zug, { punkte: 0, geste: { feld: 'station', art: 'punkt' } })).toMatchObject({ art: 'geste', name: 'station' });
    });

    it('die Enter-Regel: sammeln+genug+bereit → anwenden; sammeln+genug → prüfen; prüfen+bereit → anwenden', () => {
        expect(enterRegel({ phase: 'sammeln', genug: false, bereit: true })).toBe('nichts');
        expect(enterRegel({ phase: 'sammeln', genug: true, bereit: true })).toBe('anwenden');
        expect(enterRegel({ phase: 'sammeln', genug: true, bereit: false })).toBe('pruefen');
        expect(enterRegel({ phase: 'pruefen', genug: true, bereit: true })).toBe('anwenden');
        expect(enterRegel({ phase: 'pruefen', genug: true, bereit: false })).toBe('nichts');
        expect(enterRegel({ phase: 'aus' })).toBe('nichts');
    });
});
