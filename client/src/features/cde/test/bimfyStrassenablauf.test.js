// @vitest-environment jsdom
/**
 * BIMFY I12 — der Straßenablauf: Muster, Regel und Vorlage über den echten
 * Kommandoweg bis ins Paket. Der Vertrag mit dem Schreiber ist ein Fixture für
 * `test_bauwerke.py` (IfcWasteTerminal GULLYSUMP, Teile zerlegen ihn).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { repo } from '../services/RepoFacade.js';
import { useAenderungen } from '../stores/useAenderungen.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { strassenablauf, EIMER } from '../services/bimfy/muster/Strassenablauf.js';
import { ordneKnoten } from '../services/bimfy/Knotenregeln.js';
import { eigeneNetzauskunft } from '../services/CdeAchsen.js';
import { paketAus, Speicher } from './hilfen/vorlagenKommandos.js';
import { k, e } from './hilfen/kammerKommandos.js';

const FIXTURE = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../backend/app/ifc/tests/daten/paket_strassenablauf.json');
const SE = { art: 'anschlusspunkt', name: 'SE1', punktkennung: 'SE', ort: { ost: 0, nord: 0 }, sohle: 100 };
const kette = (t) => t.filter(x => x.rolle !== 'eimer');

describe('Muster · Straßenablauf (REwS 2021, 5.6.3)', () => {
    it('normale Bauform, 1,25 m: Boden, Schaft, Auflagering, Aufsatz — lückenlos — und ein 600-mm-Eimer', () => {
        const m = strassenablauf({ name: 'SE1', ort: SE.ort, sohle: 100, deckel: 101.25 });
        expect(m.teile.map(t => t.rolle)).toEqual(['boden', 'schaft', 'auflagering', 'aufsatz', 'eimer']);
        const kk = kette(m.teile);
        for (let i = 1; i < kk.length; i++) expect(kk[i].unten).toBeCloseTo(kk[i - 1].oben, 6);
        expect(kk.at(-1).oben).toBe(101.25);
        const eimer = m.teile.at(-1);
        expect(eimer.oben - eimer.unten).toBeCloseTo(EIMER.normal, 6);
        expect(eimer.unten).toBeGreaterThan(100 + 0.15);                         // über dem Ablauf DN 150
        expect(m.kopf).toMatchObject({ bauform: 'normal', schlamm: 'trocken' });
    });
    it('geringe Bautiefe: niedrige Bauform mit 250-mm-Eimer; Nassschlamm: Schlammfang statt Eimer; zu flach: nichts', () => {
        const niedrig = strassenablauf({ name: 'A', ort: SE.ort, sohle: 100, deckel: 100.7 });
        expect(niedrig.kopf.bauform).toBe('niedrig');
        expect(niedrig.befunde.map(b => b.regel)).toContain('niedrige_bauform');
        const nass = strassenablauf({ name: 'B', ort: SE.ort, sohle: 100, deckel: 101.25, schlamm: 'nass' });
        expect(nass.teile.map(t => t.rolle)).not.toContain('eimer');
        expect(nass.teile[0].unten).toBeCloseTo(100 - 0.5 - 0.1, 6);              // Schlammfang 0,5 m und Boden
        expect(strassenablauf({ name: 'C', ort: SE.ort, sohle: 100, deckel: 100.3 }).kopf).toBeNull();
    });
});

describe('Regel · SE wird ein Straßenablauf', () => {
    it('mit Oberkante: Straßenablauf; ohne: 1,25 m angenommen; zu flach: Formstück', () => {
        expect(ordneKnoten({ ...SE, gelaende: 101.4 })).toMatchObject({ bauart: 'strassenablauf', regel: 'se-strassenablauf' });
        const ohne = ordneKnoten({ ...SE, gelaende: null });
        expect(ohne).toMatchObject({ bauart: 'strassenablauf', berichtigt: ['se-ohne-gelaende'] });
        expect(ohne.muster.kopf.tiefe).toBe(1.25);
        expect(ordneKnoten({ ...SE, gelaende: 100.3 })).toMatchObject({ bauart: 'formstueck', predefinedType: 'ENTRY' });
    });
});

describe('Vorlage · über den Kommandoweg', () => {
    beforeEach(() => { repo.setBackend(new Speicher()); setActivePinia(createPinia()); });
    afterEach(() => repo.setBackend(null));
    // Wie ein ISYBAU-Straßeneinlauf sie trägt (Fahrplan Sachdaten P3) — mit Umlaut und Dezimalkomma.
    const STAMMDATEN = { Objektbezeichnung: 'SE1', Objektart: '2', Status: '0', Entwaesserungsart: 'KR',
                         'Knoten.KnotenTyp': '1', 'Knoten.Anschlusspunkt.Punktkennung': 'SE', 'Lage.Strassenname': 'Am Mühlbach',
                         Kommentar: 'Höhe 101,25 aus Aufmaß' };
    const KENNUNGEN = ['cde-SE1', 'cde-SEB', 'cde-SES', 'cde-SEA', 'cde-SEU', 'cde-SEE'];

    it('der Vertrag mit dem Schreiber: Bauwerk „ablauf", fünf Teile, ein Knoten im Netz', async () => {
        const erg = await useBearbeitung().fuehreAus(k('bauwerk-aus-vorlage-strassenablauf', {
            neu: KENNUNGEN, eingaben: { zug: [e(5, -5, 100)] }, werte: { name: 'SE1', hoehe: '', tiefe: 1.25, schlamm: 1, richtung: 0, stammdaten: STAMMDATEN } }));
        expect(erg.ausgefuehrt, erg.grund ?? '').toBe(true);
        const stand = useAenderungen().wirksamerStand('erzeugt');
        expect(eigeneNetzauskunft(stand).knoten.map(x => x.name)).toEqual(['SE1']);
        const p = await paketAus(useAenderungen());
        expect(p.bauwerke).toEqual([expect.objectContaining({ cdeId: 'cde-SE1', art: 'ablauf', name: 'SE1' })]);
        expect(p.bauteile.map(t => [t.klasse, t.objektTyp]).sort()).toEqual([
            ['IFCBUILDINGELEMENTPART', 'Ablaufboden'], ['IFCBUILDINGELEMENTPART', 'Ablaufschaft'], ['IFCBUILDINGELEMENTPART', 'Auflagering'],
            ['IFCBUILDINGELEMENTPART', 'Schlammeimer'], ['IFCDISCRETEACCESSORY', 'Aufsatz Straßenablauf']]);
        expect(p.bauteile.every(t => t.teilVon === 'cde-SE1')).toBe(true);
        // Die Sachdaten am Bauwerk, unverändert — an keinem Teil.
        expect(p.bauwerke[0].stammdaten).toEqual(STAMMDATEN);
        expect(p.bauteile.filter(t => t.stammdaten)).toEqual([]);
        if (process.env.STRASSENABLAUF_VERTRAG_SCHREIBEN) writeFileSync(FIXTURE, JSON.stringify(p));
        expect(existsSync(FIXTURE), 'Fixture fehlt: STRASSENABLAUF_VERTRAG_SCHREIBEN=1 …').toBe(true);
        const alt = JSON.parse(readFileSync(FIXTURE, 'utf8'));
        expect(alt.bauwerke[0].stammdaten).toEqual(STAMMDATEN);
        expect(alt.bauteile.map(x => [x.cdeId, x.klasse, x.predefinedType, x.objektTyp, x.teilVon]))
            .toEqual(p.bauteile.map(x => [x.cdeId, x.klasse, x.predefinedType, x.objektTyp, x.teilVon]));
    });
});
