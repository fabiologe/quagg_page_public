/**
 * Ausgeben als Auswahlbaum (Fahrplan „Klare Abläufe“, S4 neu; Kassensturz E10) — der reine Teil.
 *
 * Vorher (Karte 2026-09-12): keine Wahl, und ein Vorgang, der sich nicht bauen
 * ließ, sperrte die ganze Ausgabe — gesagt erst nach dem Serverlauf (V10).
 */
import { describe, expect, it } from 'vitest';
import { EINZELN, ausgabeBaum, bereitschaft, ladbarFuer, laufSatz, laufZeile, paketAuswahl, quellenFuer } from '../services/Ausgabe.js';

const NORD = { ableitung: 'ab-nord', titel: 'Kanalgraben Nord' };
const SUED = { ableitung: 'ab-sued', titel: 'Grube Süd' };
const PAKET = {
    bauteile: [
        { cdeId: 'cde-cut-s', klasse: 'IFCEARTHWORKSCUT', vorgang: SUED, wirt: 'G1', quellen: { gelaende: 'G1' }, schneidetAuffuellung: ['cde-fill-n'] },
        { cdeId: 'cde-fill-n', klasse: 'IFCEARTHWORKSFILL', vorgang: NORD, quellen: { gelaende: 'G2' } },
        { cdeId: 'cde-cut-n', klasse: 'IFCEARTHWORKSCUT', vorgang: NORD, wirt: 'G2', quellen: { gelaende: 'G2' } },
        { cdeId: 'cde-wand', klasse: 'IFCWALL', vorgang: null },
    ],
    misserfolge: [{ globalId: 'cde-rohr-n', grund: 'Rohr fehlt', vorgang: NORD }],
    quellDokumente: [{ sha256: 'g', datei: 'Gelaende.ifc', revision: 1, globalIds: ['G1', 'G2'] }],
};
const MODELLE = [
    { sha256: 'g', datei: 'Gelaende.ifc', revision: 1, status: 'WIP' },
    { sha256: 'e', datei: 'Erdbau_Sued_R01.ifc', revision: 1, status: 'WIP', herkunft: { art: 'erdbau' } },
];

describe('der Baum', () => {
    it('ein Knoten je Erdbau-Vorgang, Einzelnes zuletzt; der Misserfolg hängt an seinem Vorgang', () => {
        const baum = ausgabeBaum({ paket: PAKET, modelle: MODELLE });
        expect(baum.gruppen.map(g => [g.titel, g.teile, g.aushub, g.fehlt.length])).toEqual([
            ['Grube Süd', 1, 1, 0], ['Kanalgraben Nord', 2, 1, 1], ['Einzelne Bauteile', 1, 0, 0]]);
        expect(baum.modelle.map(m => [m.name, m.erdbau])).toEqual([['Gelaende.ifc', false], ['Erdbau_Sued_R01.ifc', true]]);
    });
});

describe('das Paket nach den Häkchen', () => {
    it('ohne Abwahl dasselbe Paket — ohne `ausgelassen`', () => {
        expect(paketAuswahl(PAKET, new Set())).toBe(PAKET);
    });

    it('Nord weg: Teile raus, Teile und Misserfolg unter `ausgelassen`, Quellen und Schnitte nachgezogen', () => {
        const p = paketAuswahl(PAKET, new Set(['ab-nord']));
        expect(p.bauteile.map(b => b.cdeId)).toEqual(['cde-cut-s', 'cde-wand']);
        expect(p.ausgelassen).toEqual([
            { globalId: 'cde-fill-n', vorgang: 'Kanalgraben Nord', grund: 'weggelassen' },
            { globalId: 'cde-cut-n', vorgang: 'Kanalgraben Nord', grund: 'weggelassen' },
            { globalId: 'cde-rohr-n', vorgang: 'Kanalgraben Nord', grund: 'nicht baubar, weggelassen' }]);
        // `misserfolge` bleibt vollständig — der Server zieht ab (pruefe.paketregeln).
        expect(p.misserfolge).toHaveLength(1);
        expect(p.quellDokumente).toEqual([{ sha256: 'g', datei: 'Gelaende.ifc', revision: 1, globalIds: ['G1'] }]);
        expect(p.bauteile[0].schneidetAuffuellung).toEqual([]);
        // Das Probe-Paket bleibt, wie es war — der nächste Klick rechnet von ihm aus.
        expect(PAKET.bauteile[0].schneidetAuffuellung).toEqual(['cde-fill-n']);
    });

    it('Quellen: nur was die Teile noch brauchen', () => {
        expect(quellenFuer(PAKET.quellDokumente, [])).toEqual([]);
    });
});

describe('Laden: welches Modell fehlt', () => {
    const baum = ausgabeBaum({ paket: PAKET });
    const dokumente = [{ sha256: 'enq', datei: 'ENQUIER.ifc' }, ...MODELLE];
    const eintraege = [{ art: 'erzeugt', globalId: 'cde-rohr-n', modellSha: 'enq', wann: 2 }];

    it('aus dem Verlauf, eindeutig', () => {
        expect([...ladbarFuer({ gruppen: baum.gruppen, eintraege, satzShas: ['g'], dokumente })])
            .toEqual([['ab-nord', { sha256: 'enq', name: 'ENQUIER.ifc' }]]);
    });

    it('steht die Datei schon im Satz, hat der Misserfolg einen anderen Grund: kein Laden', () => {
        expect(ladbarFuer({ gruppen: baum.gruppen, eintraege, satzShas: ['enq'], dokumente }).size).toBe(0);
    });
});

describe('EINE Zeile, höchstens EIN Satz', () => {
    const baum = ausgabeBaum({ paket: PAKET, modelle: MODELLE });

    it('ein Vorgang, der sich nicht bauen lässt: Laden oder Weglassen', () => {
        const ladbar = new Map([['ab-nord', { sha256: 'enq', name: 'ENQUIER.ifc' }]]);
        const b = bereitschaft({ art: 'erdbau', baum, paket: PAKET, ladbar });
        expect(b.ok).toBe(false);
        expect(b.satz).toBe('Kanalgraben Nord: 1 Teil lässt sich nicht bauen (Rohr fehlt) — ENQUIER.ifc steht nicht im Satz.');
        expect(b.knoepfe.map(k => k.art)).toEqual(['laden', 'weglassen']);
    });

    it('nach Weglassen: bereit, eine Zeile, kein Satz', () => {
        expect(bereitschaft({ art: 'erdbau', baum, paket: PAKET, aus: new Set(['ab-nord']) }))
            .toEqual({ ok: true, zeile: 'Bereit · 2 Teile aus 1 Vorgang · 3 weggelassen', satz: null, knoepfe: [] });
    });

    it('Erdbau ohne jeden Eigenbau: „kein Eigenbau“ statt „0 Teile aus 0 Vorgängen“ (Probe 42069)', () => {
        const leer = { bauteile: [], misserfolge: [] };
        const b = bereitschaft({ art: 'erdbau', baum: ausgabeBaum({ paket: leer }), paket: leer,
                                 aushubGanzFehlt: 'Kein Aushub im Satz „Durchstich“ — im Verlauf dieses Satzes steht kein Aushub.' });
        expect(b.zeile).toBe('Nicht bereit · kein Eigenbau');
        expect(b.satz).toMatch(/^Kein Aushub/);
    });

    it('ohne Aushub in der Auswahl kein Erdbau-Dokument', () => {
        expect(bereitschaft({ art: 'erdbau', baum, paket: PAKET, aus: new Set(['ab-nord', 'ab-sued']) }).satz)
            .toMatch(/^Ohne Aushub kein Erdbau-Dokument/);
    });

    it('Verbund: ein Erdbau-Dokument und der Eigenbau zugleich — sonst Modelle zählen', () => {
        const b = bereitschaft({ art: 'verbund', baum, paket: PAKET, aus: new Set(['ab-nord']) });
        expect(b.satz).toBe('Erdbau_Sued_R01.ifc und der Eigenbau zugleich — der Aushub stünde doppelt.');
        expect(b.knoepfe.map(k => k.art)).toEqual(['eigenbau-aus']);
        expect(bereitschaft({ art: 'verbund', baum, paket: PAKET, eigenbauAn: false }).zeile).toBe('Bereit · 2 Modelle');
        expect(bereitschaft({ art: 'verbund', baum, paket: PAKET, eigenbauAn: false, modelleAus: new Set(['e']) }).zeile)
            .toBe('Bereit · 1 Modell · 1 abgewählt');
    });

    it('der Aushub braucht sein Gelände aus einem abgewählten Knoten', () => {
        const eigen = { misserfolge: [], bauteile: [
            { cdeId: 'cde-dgm', klasse: 'IFCGEOGRAPHICELEMENT', vorgang: null },
            { cdeId: 'cde-cut', klasse: 'IFCEARTHWORKSCUT', vorgang: NORD, wirt: 'cde-dgm' }] };
        const b = bereitschaft({ art: 'erdbau', baum: ausgabeBaum({ paket: eigen }), paket: eigen, aus: new Set([EINZELN]) });
        expect(b.satz).toBe('Kanalgraben Nord: der Aushub braucht sein Gelände aus „Einzelne Bauteile“.');
        expect(b.knoepfe).toEqual([{ art: 'anhaken', text: 'Mit anhaken', schluessel: EINZELN }]);
    });

    it('ein gewähltes Bezugssystem, in dem die Koordinaten nicht liegen', () => {
        const b = bereitschaft({ art: 'verbund', baum, paket: PAKET, eigenbauAn: false, crsWahl: 'EPSG:31467',
                                 crsPruefung: { stimmt: false, grund: 'die Werte passen zu Gauß-Krüger Zone 2 (DHDN).' } });
        expect(b.ok).toBe(false);
        expect(b.knoepfe.map(k => k.art)).toEqual(['crs-auto']);
    });
});

describe('nach dem Lauf', () => {
    it('eine Zeile; eine Ablehnung ist EIN Satz aus dem ersten sperrenden Befund', () => {
        expect(laufZeile({ zustand: 'geprueft', dokument: { datei: 'Erdbau_Nord_R03.ifc' } })).toBe('Geprüft · Erdbau_Nord_R03.ifc im Register');
        const lauf = { zustand: 'abgelehnt', befunde: [
            { id: 'V00', ok: true, schwere: 'fehler' },
            { id: 'V10', ok: false, schwere: 'fehler', zahl: 8, titel: 'Eigenbau vollständig', sagt: '8 von 10 …' },
            { id: 'SPF', ok: false, schwere: 'fehler', zahl: 3 }] };
        expect(laufSatz(lauf)).toBe('Kein Dokument entstanden. 8 Teile lassen sich nicht bauen — den Vorgang weglassen oder das fehlende Modell laden.');
        expect(laufSatz({ zustand: 'geprueft' })).toBe(null);
        expect(laufSatz({ zustand: 'fehler', fehler: 'Speicher voll' })).toBe('Speicher voll');
    });
});
