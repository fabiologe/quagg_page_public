// @vitest-environment jsdom
/**
 * Zeichnen im Lageplan (Stufe 9.4).
 *
 * Vier Zusagen, deren Bruch jeweils erst SPÄTER auffällt:
 *
 * 1. Ein Zug schreibt EINEN Journaleintrag, beim Abschliessen. Einer je Klick
 *    füllte das Journal mit halben Linien, und „zurück" bräuchte so viele
 *    Klicks, wie man Punkte gesetzt hat.
 *
 * 2. Ein untauglicher Bauplan kommt gar nicht erst ins Journal. Drin überlebte
 *    er jedes Neuladen, meldete jedes Mal denselben Fehler und liesse sich nur
 *    über „zurück" wieder loswerden.
 *
 * 3. Der Eintrag trägt PARAMETER, keine Geometrie — sonst liesse sich das
 *    CDE-Modell nicht je Modellsatz neu aufbauen (siehe Bauteilrezepte.js).
 *
 * 4. Erzeugen erscheint NICHT im Kontextmenü am Bauteil. Es hat kein Subjekt;
 *    das Gezeichnete hat mit dem angeklickten Rohr nichts zu tun.
 *
 * Ohne Canvas und ohne WebGL: der Zug ist eine Punktliste, und was daraus
 * wird, entscheiden reine Funktionen.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useZeichnen } from '../composables/useZeichnen.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { useAenderungen } from '../stores/useAenderungen.js';

beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
});

const ZUG = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 10 }];

function bau({ nachBauen = null } = {}) {
    const bearbeitung = useBearbeitung();
    const aenderungen = useAenderungen();
    const zeichnen = useZeichnen({
        bearbeitung, cde: { bearbeiter: 'Fabio' },
        getModellSha: () => 'sha1', nachBauen,
    });
    return { bearbeitung, aenderungen, zeichnen };
}

/** Einen ganzen Zug nachstellen. */
async function zeichne(t, id = 'linie-zeichnen', punkte = ZUG) {
    t.zeichnen.starte(id);
    for (const p of punkte) t.zeichnen.setzePunkt(p);
    return t.zeichnen.abschliessen();
}

describe('Ein Zug — ein Eintrag', () => {
    it('schreibt beim Abschliessen genau EINEN Eintrag', async () => {
        const t = bau();
        await zeichne(t);
        expect(t.aenderungen.eintraege).toHaveLength(1);
        expect(t.aenderungen.eintraege[0].art).toBe('erzeugt');
    });

    it('schreibt NICHTS, solange Punkte gesetzt werden', () => {
        const t = bau();
        t.zeichnen.starte('linie-zeichnen');
        for (const p of ZUG) t.zeichnen.setzePunkt(p);
        expect(t.aenderungen.eintraege).toHaveLength(0);
        expect(t.zeichnen.punkte.value).toHaveLength(3);
    });

    it('legt die Punkte als Raumpunkte ab — Y ist die Höhe', async () => {
        const t = bau();
        t.zeichnen.starte('linie-zeichnen');
        t.bearbeitung.setzeWert('hoehe', 12.4);
        for (const p of ZUG) t.zeichnen.setzePunkt(p);
        await t.zeichnen.abschliessen();

        expect(t.aenderungen.eintraege[0].nachher.parameter.punkte).toEqual([
            [0, 12.4, 0], [10, 12.4, 0], [10, 12.4, 10],
        ]);
    });

    it('legt keine Geometrie ins Journal', async () => {
        const t = bau();
        await zeichne(t);
        expect(JSON.stringify(t.aenderungen.eintraege[0])).not.toMatch(/BufferGeometry|Float32/);
    });

    it('räumt nach dem Abschliessen auf — der nächste Zug beginnt leer', async () => {
        const t = bau();
        await zeichne(t);
        expect(t.zeichnen.aktiv.value).toBe(false);
        expect(t.zeichnen.punkte.value).toEqual([]);
    });

    it('meldet dem Raum, dass neu gebaut werden muss', async () => {
        // Ohne diesen Anstoss stünde ein gerade gezeichnetes Bauteil erst nach
        // dem nächsten Laden im Raum — und es sähe aus, als wäre es weg.
        const nachBauen = vi.fn(async () => {});
        const t = bau({ nachBauen });
        await zeichne(t);
        expect(nachBauen).toHaveBeenCalledTimes(1);
    });
});

describe('Was nicht taugt, kommt nicht ins Journal', () => {
    it('schliesst mit zu wenigen Punkten nicht ab und sagt warum', async () => {
        const t = bau();
        t.zeichnen.starte('linie-zeichnen');
        t.zeichnen.setzePunkt(ZUG[0]);
        expect(await t.zeichnen.abschliessen()).toBe(null);
        expect(t.aenderungen.eintraege).toHaveLength(0);
        expect(t.zeichnen.grund.value).toMatch(/[Mm]indestens 2 Punkte/);
        expect(t.zeichnen.aktiv.value).toBe(true);      // der Zug lebt weiter
    });

    it('lehnt einen erfundenen IFC-Typ ab, statt ihn abzulegen', async () => {
        const t = bau();
        t.zeichnen.starte('linie-zeichnen');
        t.bearbeitung.setzeWert('kategorie', 'IFCQUATSCH');
        for (const p of ZUG) t.zeichnen.setzePunkt(p);
        expect(await t.zeichnen.abschliessen()).toBe(null);
        expect(t.aenderungen.eintraege).toHaveLength(0);
        expect(t.zeichnen.grund.value).toMatch(/kein IFC-Typ/);
    });

    it('verlangt für eine Fläche drei Punkte, nicht zwei', async () => {
        const t = bau();
        t.zeichnen.starte('flaeche-zeichnen');
        for (const p of ZUG.slice(0, 2)) t.zeichnen.setzePunkt(p);
        expect(t.zeichnen.genug.value).toBe(false);
        t.zeichnen.setzePunkt(ZUG[2]);
        expect(t.zeichnen.genug.value).toBe(true);
    });

    it('startet nichts, was kein Zeichenwerkzeug ist', () => {
        const t = bau();
        expect(t.zeichnen.starte('kg-setzen')).toBe(false);
        expect(t.zeichnen.aktiv.value).toBe(false);
    });
});

describe('Der Zug lässt sich korrigieren', () => {
    it('nimmt den letzten Punkt zurück, statt den ganzen Zug wegzuwerfen', () => {
        const t = bau();
        t.zeichnen.starte('linie-zeichnen');
        for (const p of ZUG) t.zeichnen.setzePunkt(p);
        t.zeichnen.entferneLetzten();
        expect(t.zeichnen.punkte.value).toHaveLength(2);
    });

    it('gibt den Zug samt Gummiband für den Plotter heraus', () => {
        const t = bau();
        t.zeichnen.starte('flaeche-zeichnen');
        t.zeichnen.setzePunkt(ZUG[0]);
        t.zeichnen.bewegeZeiger({ x: 5, z: 5 });
        expect(t.zeichnen.zug.value).toEqual({
            punkte: [{ x: 0, z: 0 }], zeiger: { x: 5, z: 5 }, geschlossen: true,
        });
    });

    it('lässt beim Abbrechen nichts stehen', () => {
        const t = bau();
        t.zeichnen.starte('linie-zeichnen');
        t.zeichnen.setzePunkt(ZUG[0]);
        t.zeichnen.abbrechen();
        expect(t.zeichnen.aktiv.value).toBe(false);
        expect(t.zeichnen.zug.value).toBe(null);
        expect(t.aenderungen.eintraege).toHaveLength(0);
    });
});

describe('Zurücknehmen führt zurück', () => {
    it('lässt nach „zurück" kein Bauteil im Stand stehen', async () => {
        const t = bau();
        await zeichne(t);
        expect(t.aenderungen.wirksamerStand('erzeugt').size).toBe(1);

        await t.aenderungen.zurueck('Fabio');
        expect(t.aenderungen.wirksamerStand('erzeugt').size).toBe(0);
    });
});
