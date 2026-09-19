// @vitest-environment jsdom
/**
 * Vorgang und Haltung teilen (Stufe 14.3).
 *
 * Die erste Bearbeitung, die MEHRERE Bauteile ergibt: ein Löschen und zwei
 * Erzeugen. Der Journaleintrag behält dabei genau EIN Subjekt — an dieser
 * Invariante hängen fünfzehn Stellen, von der Faltung „letzter gewinnt je
 * Bauteil" bis zum Drei-Wege-Vergleich. Die Klammer ist ein `vorgang`, kein
 * Bauteil-Array.
 *
 * Der Nutzen zeigt sich beim Zurücknehmen: ohne Vorgang liesse ein Klick zwei
 * halbe Hälften und eine verschwundene Haltung stehen — ein Zustand, den
 * niemand gemeint hat und den man per Hand kaum wieder auflöst.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { useAenderungen, standAus } from '../stores/useAenderungen.js';
import { nachId } from '../services/Bearbeitungen.js';
import { baueAusBauplan, rezeptNach } from '../services/Bauteilrezepte.js';
import { ANWENDBARE_ARTEN } from '../services/IfcAutor.js';

beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    useBearbeitung().modusSetzen(true);
});

/** Eine Haltung mit exakter Achse — 100 m waagerecht, 16 m Gefälle. */
const HALTUNG = {
    modelId: 'm1', localId: 683, category: 'IFCPIPESEGMENT', globalId: '3xY',
    name: 'FK003', anker: { x: 50, y: 10, z: 0 }, bezugshoehe: 2, oberkante: 18,
    hoehenversatz: 300,
    achse: {
        anfang: { x: 0, y: 18, z: 0 },
        ende: { x: 100, y: 2, z: 0 },
        laenge: 100, gefaelle: 160, dn: 500, quelle: 'extrusion',
    },
};

const resolverExtrusion = {
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

describe('Das Rohr-Rezept', () => {
    it('baut einen geschlossenen Kreisquerschnitt entlang der Achse', () => {
        // Zwei flache Bänder wären keine Haltungen — und ihre Bauform wäre
        // `linie` statt `achse+profil`, womit alle Werkzeuge dieser Form
        // ausfielen.
        const { ok, geometrie } = baueAusBauplan({
            rezept: 'rohr', parameter: { punkte: [[0, 0, 0], [10, 0, 0]], dn: 500 },
        });
        expect(ok).toBe(true);
        const pos = geometrie.getAttribute('position');
        // Seit G6 ein GESCHLOSSENER Sweep: 12 Seitenquads (24 Δ) + zwei
        // Deckel à 10 Δ = 44 Dreiecke à 3 Ecken. Die Ecken bleiben je
        // Dreieck eigen (flache Facetten), der Index ist trivial — hier
        // stand einmal `getIndex() === null`, und das war der Fehler
        // selbst: unindiziert lehnt der Editor die Geometrie ab
        // (`geometrieIndex.test.js`).
        expect(pos.count).toBe(44 * 3);
        expect(geometrie.getIndex()?.count).toBe(44 * 3);
        // Radius 0,25 m um die Achse — in Y wie in Z.
        let maxY = -Infinity;
        for (let i = 0; i < pos.count; i++) maxY = Math.max(maxY, pos.getY(i));
        expect(maxY).toBeCloseTo(0.25, 2);
    });

    it('DN 300 ist enger als DN 1000', () => {
        const weite = (dn) => {
            const pos = baueAusBauplan({ rezept: 'rohr', parameter: { punkte: [[0, 0, 0], [10, 0, 0]], dn } })
                .geometrie.getAttribute('position');
            let m = -Infinity;
            for (let i = 0; i < pos.count; i++) m = Math.max(m, pos.getY(i));
            return m;
        };
        expect(weite(300)).toBeCloseTo(0.15, 2);
        expect(weite(1000)).toBeCloseTo(0.5, 2);
    });

    it('eine senkrechte Achse bringt den Rahmen nicht zum Kippen', () => {
        // Bei senkrechter Achse taugt „oben" nicht als Bezug. Ohne die
        // Ausweichrichtung entstünden Ecken auf einem Punkt — also nichts.
        const { geometrie } = baueAusBauplan({
            rezept: 'rohr', parameter: { punkte: [[0, 0, 0], [0, 10, 0]], dn: 400 },
        });
        const pos = geometrie.getAttribute('position');
        let maxX = -Infinity;
        for (let i = 0; i < pos.count; i++) maxX = Math.max(maxX, pos.getX(i));
        expect(maxX).toBeCloseTo(0.2, 2);
    });
});

describe('Teilen ergibt drei Einträge — und genau einen Vorgang', () => {
    it('löscht die Haltung und legt zwei Stücke an', async () => {
        const b = useBearbeitung();
        await b.einordne({ ...HALTUNG }, resolverExtrusion);
        expect(b.starte('haltung-teilen')).toBe(true);
        expect(b.werte.station).toBeCloseTo(50, 3);      // Vorgabe: die Mitte

        const eintraege = await b.ausfuehren({ wer: 'Fabio', modell: 'geliefert' });
        expect(Array.isArray(eintraege)).toBe(true);
        expect(eintraege.map(e => e.art)).toEqual(['geloescht', 'erzeugt', 'erzeugt']);

        // EIN Vorgang über alle drei — die Klammer, die „zurück" braucht.
        const vg = new Set(eintraege.map(e => e.vorgang));
        expect(vg.size).toBe(1);
        expect([...vg][0]).toBeTruthy();
        expect(eintraege[0].vorgangTitel).toBe('Haltung teilen');

        // Jeder Eintrag hat weiterhin GENAU EIN Subjekt.
        expect(eintraege.every(e => typeof e.globalId === 'string')).toBe(true);
        expect(new Set(eintraege.map(e => e.globalId)).size).toBe(3);
    });

    it('die zwei Stücke stossen an der Teilstelle zusammen', async () => {
        const b = useBearbeitung();
        await b.einordne({ ...HALTUNG }, resolverExtrusion);
        b.starte('haltung-teilen');
        b.setzeWert('station', 25);                      // ein Viertel

        const [, eins, zwei] = await b.ausfuehren({ wer: 'Fabio' });
        const p1 = eins.nachher.parameter.punkte;
        const p2 = zwei.nachher.parameter.punkte;
        expect(p1[1]).toEqual(p2[0]);                    // gemeinsamer Punkt
        expect(p1[0]).toEqual([0, 18, 0]);
        expect(p2[1]).toEqual([100, 2, 0]);
        // Auf einem Viertel der Länge ist ein Viertel der Höhe abgebaut.
        expect(p1[1][1]).toBeCloseTo(18 - 4, 6);
    });

    it('erbt DN und Typ der Haltung — beides steht in der Achse bzw. am Bauteil', async () => {
        const b = useBearbeitung();
        await b.einordne({ ...HALTUNG }, resolverExtrusion);
        b.starte('haltung-teilen');
        const [, eins] = await b.ausfuehren({ wer: 'Fabio' });
        expect(eins.nachher.parameter.dn).toBe(500);
        expect(eins.nachher.kategorie).toBe('IFCPIPESEGMENT');
        expect(eins.nachher.name).toBe('FK003 (1)');
    });

    it('teilt NICHT am Ende — das gäbe ein Bauteil der Länge null', () => {
        const b = nachId('haltung-teilen');
        expect(b.anwenden(HALTUNG, { station: 0 })).toBeNull();
        expect(b.anwenden(HALTUNG, { station: 100 })).toBeNull();
        expect(b.anwenden(HALTUNG, { station: 'viel' })).toBeNull();
    });

    it('braucht eine ECHTE Achse — auf einer geschätzten gibt es kein „bei Meter X"', () => {
        expect(nachId('haltung-teilen').mindestGuete).toBe('gemessen');
        expect(nachId('haltung-teilen').anwenden({ globalId: 'X' }, { station: 5 })).toBeNull();
    });
});

describe('Zurücknehmen nimmt den GANZEN Vorgang', () => {
    async function teile() {
        const b = useBearbeitung();
        await b.einordne({ ...HALTUNG }, resolverExtrusion);
        b.starte('haltung-teilen');
        return b.ausfuehren({ wer: 'Fabio', modell: 'geliefert' });
    }

    it('ein Klick stellt den Ausgangszustand her', async () => {
        const ae = useAenderungen();
        await teile();
        expect(standAus(ae.eintraege, 'erzeugt').size).toBe(2);
        expect(standAus(ae.eintraege, 'geloescht').size).toBe(1);

        const gegen = await ae.zurueck('Fabio');
        expect(gegen).toHaveLength(3);
        // Nichts bleibt halb stehen.
        expect(standAus(ae.eintraege, 'erzeugt').size).toBe(0);
        expect(standAus(ae.eintraege, 'geloescht').size).toBe(0);
    });

    it('die Gegeneinträge bilden ihrerseits EINEN Vorgang', async () => {
        // Ohne das nähme der nächste Klick die Rücknahme stückweise zurück.
        // U2: Gegeneinträge gibt es auf COMMITS — der Entwurf würde
        // schlicht geleert (sitzung.test.js).
        const ae = useAenderungen();
        await teile();
        await ae.commitSitzung('Teilen', { wer: 'Fabio' });
        const gegen = await ae.zurueck('Fabio');
        expect(new Set(gegen.map(e => e.vorgang)).size).toBe(1);
        expect(gegen[0].vorgangTitel).toMatch(/zurückgenommen/);
    });

    it('nimmt rückwärts zurück — zuletzt Gemachtes zuerst', async () => {
        const ae = useAenderungen();
        const hin = await teile();
        await ae.commitSitzung('Teilen', { wer: 'Fabio' });
        const gegen = await ae.zurueck('Fabio');
        expect(gegen.map(e => e.ruecknahmeVon))
            .toEqual([...hin].reverse().map(e => e.id));
    });

    it('ein EINTEILIGER Schritt verhält sich unverändert', async () => {
        // Der Vorgang ist rein additiv: ohne ihn bleibt alles, wie es war.
        const ae = useAenderungen();
        await ae.eintragen({ art: 'kg', globalId: 'A', nachher: '322' });
        const gegen = await ae.zurueck('Fabio');
        expect(gegen).toHaveLength(1);
        expect(gegen[0].vorgang).toBeUndefined();
    });

    it('lässt einen ANDEREN Vorgang in Ruhe', async () => {
        const ae = useAenderungen();
        await teile();
        await ae.eintragen({ art: 'kg', globalId: 'B', nachher: '331' });

        await ae.zurueck('Fabio');                       // nimmt nur die Kostengruppe
        expect(standAus(ae.eintraege, 'erzeugt').size).toBe(2);
        await ae.zurueck('Fabio');                       // jetzt den ganzen Vorgang
        expect(standAus(ae.eintraege, 'erzeugt').size).toBe(0);
    });
});

describe('Gelöscht heisst ausgeblendet, nicht entfernt', () => {
    it('die Art wird angewandt, nicht als Festlegung abgetan', () => {
        // Sie stand seit jeher in `AENDERUNGS_ARTEN` und tat nichts: kein
        // Zweig in `wendeAn`, also landete sie in `nichtAngewandt`.
        expect(ANWENDBARE_ARTEN.has('geloescht')).toBe(true);
    });
});

describe('Schacht einfügen — vier Einträge, ein Vorgang', () => {
    const MIT_NAME = { ...HALTUNG, hoehenversatz: 300 };   // Welt +300 = m NN

    it('legt Schacht und zwei Stücke an und nimmt die alte Haltung weg', async () => {
        const b = useBearbeitung();
        await b.einordne({ ...MIT_NAME }, resolverExtrusion);
        expect(b.starte('schacht-einfuegen')).toBe(true);

        const e = await b.ausfuehren({ wer: 'Fabio', modell: 'geliefert' });
        expect(e.map(x => x.art)).toEqual(['geloescht', 'erzeugt', 'erzeugt', 'erzeugt']);
        expect(new Set(e.map(x => x.vorgang)).size).toBe(1);
        expect(e[0].vorgangTitel).toBe('Schacht einfügen');
        expect(e[1].nachher.rezept).toBe('schacht');
        expect(e[2].nachher.rezept).toBe('rohr');
    });

    it('DAS NETZ FINDET SICH VON SELBST WIEDER', async () => {
        // Der Schacht steht an derselben XY-Stelle, an der die beiden Stücke
        // enden bzw. beginnen — und genau daraus baut `Netztopologie` die
        // Verkettung. Es braucht keine Beziehung, die irgendwo einzutragen
        // wäre; in den echten Dateien gibt es ohnehin keine.
        const b = useBearbeitung();
        await b.einordne({ ...MIT_NAME }, resolverExtrusion);
        b.starte('schacht-einfuegen');
        b.setzeWert('station', 40);
        const [, schacht, eins, zwei] = await b.ausfuehren({ wer: 'Fabio' });

        const sohle = schacht.nachher.parameter.punkte[0];
        // Verkettet wird in XY (Netztopologie) — dort liegen alle drei gleich.
        expect([eins.nachher.parameter.punkte[1][0], eins.nachher.parameter.punkte[1][2]]).toEqual([sohle[0], sohle[2]]);
        expect([zwei.nachher.parameter.punkte[0][0], zwei.nachher.parameter.punkte[0][2]]).toEqual([sohle[0], sohle[2]]);
        // In der Höhe steht der Schacht auf der ROHRSOHLE (Teil XXIV, K4): die
        // Achse aus der Extrusion liegt in der Rohrmitte, DN 500 / 2 darüber.
        // Bis K4 stand der Schacht auf der Mitte — seine Sohle DN/2 zu hoch.
        const s = rezeptNach('rohr').sohlen;
        expect(s.lies(eins.nachher.parameter)[1]).toBeCloseTo(sohle[1], 9);
        expect(s.lies(zwei.nachher.parameter)[0]).toBeCloseTo(sohle[1], 9);
    });

    it('der Schacht steht SENKRECHT und reicht bis zur Deckelhöhe', async () => {
        const b = useBearbeitung();
        await b.einordne({ ...MIT_NAME }, resolverExtrusion);
        b.starte('schacht-einfuegen');
        b.setzeWert('station', 50);
        b.setzeWert('deckel', 320);                 // m NN, Versatz 300
        const [, schacht] = await b.ausfuehren({ wer: 'Fabio' });

        const [unten, oben] = schacht.nachher.parameter.punkte;
        expect(oben[0]).toBe(unten[0]);             // gleiche Lage
        expect(oben[2]).toBe(unten[2]);
        expect(oben[1]).toBeCloseTo(20, 6);         // 320 m NN − 300 Versatz
        expect(oben[1]).toBeGreaterThan(unten[1]);
    });

    it('ist mit der halben Länge und 2,50 m Tiefe vorbelegt', () => {
        const v = nachId('schacht-einfuegen').vorbelegung(MIT_NAME);
        expect(v.station).toBeCloseTo(50, 3);
        // Sohle bei Station 50 ist Welt 10 ⇒ 310 m NN, plus 2,50 m.
        expect(v.deckel).toBeCloseTo(312.5, 3);
        expect(v.durchmesser).toBe(1000);
    });

    it('legt keinen Schacht an, dessen Deckel unter der Sohle liegt', () => {
        const b = nachId('schacht-einfuegen');
        expect(b.anwenden(MIT_NAME, { station: 50, deckel: 305, durchmesser: 1000 })).toBeNull();
        expect(b.anwenden(MIT_NAME, { station: 0, deckel: 320, durchmesser: 1000 })).toBeNull();
    });

    it('„zurück" nimmt alle vier zurück', async () => {
        const b = useBearbeitung();
        const ae = useAenderungen();
        await b.einordne({ ...MIT_NAME }, resolverExtrusion);
        b.starte('schacht-einfuegen');
        await b.ausfuehren({ wer: 'Fabio' });
        expect(standAus(ae.eintraege, 'erzeugt').size).toBe(3);

        expect(await ae.zurueck('Fabio')).toHaveLength(4);
        expect(standAus(ae.eintraege, 'erzeugt').size).toBe(0);
        expect(standAus(ae.eintraege, 'geloescht').size).toBe(0);
    });

    it('teilen und einfügen rechnen dieselbe Teilstelle', async () => {
        // Sie teilen sich den Helfer. Liefen sie auseinander, passten die
        // Stücke nach dem Einfügen nicht mehr zusammen — und zwar knapp
        // genug, dass es niemand sähe.
        const teilen = nachId('haltung-teilen').anwenden(MIT_NAME, { station: 37.5 });
        const einfuegen = nachId('schacht-einfuegen')
            .anwenden(MIT_NAME, { station: 37.5, deckel: 320, durchmesser: 1000 });
        expect(teilen[1].nachher.parameter.punkte[1])
            .toEqual(einfuegen[2].nachher.parameter.punkte[1]);
    });
});
