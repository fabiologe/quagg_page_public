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
    // Der Bearbeiten-Modus ist mit Absicht AUS, solange ihn niemand
    // einschaltet — die Sperre soll der Zustand sein, in den man ohne Zutun
    // gerät. Diese Datei prüft, was IM Modus geschieht; dass ausserhalb nichts
    // geschieht, prüft `bearbeitenModus.test.js`.
    useBearbeitung().modusSetzen(true);
});

const ZUG = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 10 }];

function bau({ nachBauen = null, hoehenversatz = 0 } = {}) {
    const bearbeitung = useBearbeitung();
    const aenderungen = useAenderungen();
    const zeichnen = useZeichnen({
        bearbeitung, cde: { bearbeiter: 'Fabio' },
        getModellSha: () => 'sha1', nachBauen,
        getHoehenversatz: () => hoehenversatz,
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
        // Ohne Höhenversatz sind m NN und Welt-Y dasselbe.
        const t = bau();
        t.zeichnen.starte('linie-zeichnen');
        t.bearbeitung.setzeWert('hoehe', 12.4);
        for (const p of ZUG) t.zeichnen.setzePunkt(p);
        await t.zeichnen.abschliessen();

        expect(t.aenderungen.eintraege[0].nachher.parameter.punkte).toEqual([
            [0, 12.4, 0], [10, 12.4, 0], [10, 12.4, 10],
        ]);
    });

    it('die eingetragene Höhe ist eine Höhe über NN, kein Welt-Y', async () => {
        // Die Zahl im Formular ging bisher DIREKT als Three-Welt-Y in die
        // Punkte, während „Bezugshöhe setzen" zwei Katalogeinträge weiter in
        // m NN rechnet. An Fabios Netz (Versatz 318,9 m) landete eine auf 305
        // gezeichnete Linie damit um genau diesen Betrag zu hoch — dieselbe
        // Größe in zwei Systemen, im selben Katalog.
        const t = bau({ hoehenversatz: 318.9 });
        t.zeichnen.starte('linie-zeichnen');
        t.bearbeitung.setzeWert('hoehe', 305);
        for (const p of ZUG) t.zeichnen.setzePunkt(p);
        await t.zeichnen.abschliessen();

        const punkte = t.aenderungen.eintraege[0].nachher.parameter.punkte;
        for (const p of punkte) expect(p[1]).toBeCloseTo(305 - 318.9, 6);
    });

    it('das Formular ist mit der NN-Höhe des Modellursprungs vorbelegt', async () => {
        // Sonst stünde dort 0 und der Nutzer zeichnete versehentlich 318 m
        // unter Gelände.
        // Am ROHR — die Linie liegt seit Teil XIV auf dem Gelände und lässt
        // das Feld bewusst leer (Bruchkante).
        const t = bau({ hoehenversatz: 318.9 });
        t.zeichnen.starte('rohr-zeichnen');
        expect(t.bearbeitung.werte.hoehe).toBeCloseTo(318.9, 3);
        expect(t.bearbeitung.felder.find(f => f.name === 'hoehe').einheit).toBe('m NN');
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
        const eintrag = await zeichne(t);
        expect(nachBauen).toHaveBeenCalledTimes(1);
        // Der EINTRAG geht mit (Stufe 0, Teil XIV): der Plan reicht ihn an
        // `wendeEintragAn`, damit auch das Ausblenden und Entwerten läuft —
        // nicht nur der Neuaufbau.
        expect(nachBauen).toHaveBeenCalledWith(eintrag);
        expect(eintrag?.art).toBe('erzeugt');
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


describe('Zeichnen AUF dem Gelände (Teil XIV, G3)', () => {
    function bauAufGelaende({ hoehe = (x, z) => 300 + 0.1 * x, bereit = true } = {}) {
        const bearbeitung = useBearbeitung();
        const aenderungen = useAenderungen();
        let warm = bereit;
        const zeichnen = useZeichnen({
            bearbeitung, cde: { bearbeiter: 'Fabio' },
            getModellSha: () => 'sha1', nachBauen: null,
            getHoehenversatz: () => 300,
            getHoeheAn: (x, z) => (warm ? hoehe(x, z) : undefined),
            bereiteHoehenVor: () => new Promise(r => setTimeout(() => { warm = true; r(); }, 0)),
        });
        return { bearbeitung, aenderungen, zeichnen };
    }
    const GELAENDE = { modelId: 'm1', localId: 7, category: 'IFCGEOGRAPHICELEMENT', globalId: 'DGM1',
                       name: 'Ur', hoehenversatz: 300, quellmass: { pruefmass: { triCount: 1 }, cell: 1 } };

    it('jeder Punkt bekommt seine Höhe aus dem Sampler — und die Sohlen werden 1 m darunter vorbelegt', async () => {
        const t = bauAufGelaende();
        t.bearbeitung.bauteil = GELAENDE;   // das Subjekt steht — die Einordnung selbst prüft gelaendeFormen
        expect(t.zeichnen.starte('gerinne-einschneiden')).toBe(true);
        t.zeichnen.setzePunkt({ x: 0, z: 0 });
        t.zeichnen.setzePunkt({ x: 20, z: 0 });
        expect(t.zeichnen.punkte.value[0].y).toBeCloseTo(300, 9);
        expect(t.zeichnen.punkte.value[1].y).toBeCloseTo(302, 9);
        // Welt 300 + Versatz 300 = 600 m NN, minus 1 m
        expect(t.bearbeitung.werte.sohleAnfang).toBe(599);
        expect(t.bearbeitung.werte.sohleEnde).toBe(601);
    });

    it('was der Nutzer selbst tippt, überschreibt der Zug nicht mehr', async () => {
        const t = bauAufGelaende();
        t.bearbeitung.bauteil = GELAENDE;   // das Subjekt steht — die Einordnung selbst prüft gelaendeFormen
        t.zeichnen.starte('gerinne-einschneiden');
        t.zeichnen.setzePunkt({ x: 0, z: 0 });
        t.zeichnen.setzePunkt({ x: 20, z: 0 });
        t.bearbeitung.setzeWert('sohleAnfang', 590);
        t.zeichnen.setzePunkt({ x: 40, z: 0 });
        expect(t.bearbeitung.werte.sohleAnfang).toBe(590);   // manuell — bleibt
        expect(t.bearbeitung.werte.sohleEnde).toBe(603);     // automatisch — folgt dem neuen Ende
    });

    it('ein Punkt ausserhalb des Geländes wird gesetzt UND genannt — kein stiller Nullpunkt', async () => {
        const t = bauAufGelaende({ hoehe: (x) => (x > 10 ? null : 300) });
        t.bearbeitung.bauteil = GELAENDE;   // das Subjekt steht — die Einordnung selbst prüft gelaendeFormen
        t.zeichnen.starte('gerinne-einschneiden');
        t.zeichnen.setzePunkt({ x: 0, z: 0 });
        t.zeichnen.setzePunkt({ x: 20, z: 0 });
        expect(t.zeichnen.punkte.value).toHaveLength(2);
        expect(t.zeichnen.punkte.value[1].y).toBeUndefined();
        expect(t.zeichnen.hinweis.value).toContain('ausserhalb des Geländes');
    });

    it('war der Sampler beim Setzen noch nicht warm, trägt der Abschluss die Höhen nach', async () => {
        const t = bauAufGelaende({ bereit: false });
        t.bearbeitung.bauteil = GELAENDE;   // das Subjekt steht — die Einordnung selbst prüft gelaendeFormen
        t.zeichnen.starte('gerinne-einschneiden');
        t.zeichnen.setzePunkt({ x: 0, z: 0 });
        t.zeichnen.setzePunkt({ x: 10, z: 0 });
        expect(t.zeichnen.punkte.value[0].y).toBeUndefined();
        const eintrag = await t.zeichnen.abschliessen();
        expect(Array.isArray(eintrag)).toBe(true);           // geloescht + drei Teile
        expect(t.bearbeitung.werte).toEqual({});             // ausfuehren räumt auf
        const dgm = eintrag.find(e => e.nachher?.rolle === 'dgm');
        expect(dgm.nachher.parameter.operationen[0].parameter.sohleAnfang).toBe(599);
    });

    it('ein Werkzeug OHNE hoehenAus bleibt bei {x, z} — nichts wird still befragt', () => {
        const t = bauAufGelaende();
        t.zeichnen.starte('rohr-zeichnen');
        t.zeichnen.setzePunkt({ x: 1, z: 2 });
        expect(t.zeichnen.punkte.value[0]).toEqual({ x: 1, z: 2 });
    });

    it('die LINIE liegt auf dem Gelände — eine getippte Höhe überstimmt das (Trasse statt Bruchkante)', async () => {
        const t = bauAufGelaende();
        t.zeichnen.starte('linie-zeichnen');
        expect(t.bearbeitung.werte.hoehe).toBe('');
        t.zeichnen.setzePunkt({ x: 0, z: 0 });
        t.zeichnen.setzePunkt({ x: 10, z: 0 });
        const bruchkante = await t.zeichnen.abschliessen();
        expect(bruchkante.nachher.parameter.punkte.map(p => p[1])).toEqual([300, 301]);

        t.zeichnen.starte('linie-zeichnen');
        t.bearbeitung.setzeWert('hoehe', 605);          // m NN, Versatz 300 → Welt 305
        t.zeichnen.setzePunkt({ x: 0, z: 0 });
        t.zeichnen.setzePunkt({ x: 10, z: 0 });
        const trasse = await t.zeichnen.abschliessen();
        expect(trasse.nachher.parameter.punkte.map(p => p[1])).toEqual([305, 305]);
    });
});
