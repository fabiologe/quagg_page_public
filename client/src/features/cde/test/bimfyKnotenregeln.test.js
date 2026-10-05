// @vitest-environment jsdom
/**
 * BIMFY I11 — das Knotenregelwerk und der Kunststoffschacht.
 *
 * Der Wächter: jede Regel greift an ihrem eigenen Beispiel (eine neue Regel
 * ohne Beispiel fällt hier auf), jede Knotenart endet in einer Regel, die immer
 * entscheidet. Dazu die Fehleinträge, wie die echte Datei sie hat.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { KNOTENREGELN, KNOTEN_VORGABEN, ordneKnoten } from '../services/bimfy/Knotenregeln.js';
import { kunststoffschacht, kunststoffWand } from '../services/bimfy/muster/Kunststoffschacht.js';
import { vorlageNach } from '../services/rezept/Bauwerksvorlagen.js';
import { repo } from '../services/RepoFacade.js';
import { useAenderungen } from '../stores/useAenderungen.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { KOMMANDO_SCHEMA } from '../services/kommando/Kommando.js';
import { eigeneNetzauskunft } from '../services/CdeAchsen.js';
import { Speicher } from './hilfen/vorlagenKommandos.js';

describe('Wächter · jede Regel hat ein Beispiel, an dem sie greift', () => {
    it('die Kennungen sind eindeutig, jede Regel nennt Art, Titel und Beispiel', () => {
        const ids = KNOTENREGELN.map(r => r.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const r of KNOTENREGELN) {
            expect(['schacht', 'anschlusspunkt', 'bauwerk'], r.id).toContain(r.fuer);
            expect(r.titel, r.id).toBeTruthy();
            expect(r.beispiel?.art, r.id).toBe(r.fuer);
        }
    });

    for (const r of KNOTENREGELN) {
        it(`„${r.id}" greift an seinem Beispiel`, () => {
            const e = ordneKnoten(r.beispiel);
            // Entweder entscheidet sie, oder sie berichtigt den Knoten auf dem Weg.
            expect(e.regel === r.id || e.berichtigt.includes(r.id), `${r.id} → ${e.regel} (${e.grund})`).toBe(true);
        });
    }

    it('jede Knotenart endet in einer Regel, die immer entscheidet', () => {
        for (const art of ['schacht', 'anschlusspunkt', 'bauwerk']) {
            const letzte = KNOTENREGELN.filter(r => r.fuer === art).at(-1);
            expect(letzte.versuche({ art, name: 'X' })?.bauart, art).toBeTruthy();
        }
    });
});

describe('Fehleinträge, wie die echte Datei sie hat', () => {
    const GA = { art: 'anschlusspunkt', name: 'GA1', punktkennung: 'GA', ort: { ost: 0, nord: 0 }, sohle: 101.2, gelaende: 102.5 };

    it('der Regelfall: GA mit Sohle und Gelände wird ein Kunststoffschacht DI 0,8 m, 1,3 m tief', () => {
        const e = ordneKnoten(GA);
        expect(e).toMatchObject({ bauart: 'kunststoffschacht', regel: 'ga-kunststoffschacht', berichtigt: [] });
        expect(e.muster.kopf).toMatchObject({ di: KNOTEN_VORGABEN.gaDurchmesser.wert, tiefe: 1.3, begehbar: true });
        expect(e.muster.teile[0].herleitung.dInnen).toMatchObject({ art: 'vorgabe' });     // Fabios Vorgabe, nicht geraten
    });

    it('vertauschte Höhen werden gedreht und gemeldet', () => {
        const e = ordneKnoten({ ...GA, sohle: 102.5, gelaende: 101.2 });
        expect(e.berichtigt).toEqual(['ga-hoehen-vertauscht']);
        expect(e.knoten).toMatchObject({ sohle: 101.2, gelaende: 102.5 });
        expect(e.befunde.map(b => b.regel)).toContain('hoehen_vertauscht');
        expect(e.bauart).toBe('kunststoffschacht');
    });

    it('ohne Geländepunkt: Tiefe aus der Vorgabe, die Herleitung sagt „annahme"', () => {
        const e = ordneKnoten({ ...GA, gelaende: null });
        expect(e.berichtigt).toEqual(['ga-ohne-gelaende']);
        expect(e.muster.kopf.tiefe).toBe(KNOTEN_VORGABEN.gaTiefeOhneGelaende.wert);
        expect(e.muster.teile.at(-1).herleitung.deckel.art).toBe('annahme');
    });

    it('ein Gelände 18 m über der Sohle wird verworfen — dann gilt die Vorgabe', () => {
        const e = ordneKnoten({ ...GA, gelaende: 120 });
        expect(e.berichtigt).toEqual(['ga-gelaende-unplausibel', 'ga-ohne-gelaende']);
        expect(e.muster.kopf.tiefe).toBe(1);
    });

    it('zu flach für einen Schacht → Formstück ENTRY; ein AP → JUNCTION; ein Straßenablauf → ENTRY', () => {
        expect(ordneKnoten({ ...GA, gelaende: 101.35 })).toMatchObject({ bauart: 'formstueck', predefinedType: 'ENTRY', regel: 'ga-zu-flach' });
        expect(ordneKnoten({ ...GA, punktkennung: 'AP' })).toMatchObject({ bauart: 'formstueck', predefinedType: 'JUNCTION' });
        expect(ordneKnoten({ ...GA, punktkennung: 'SE' })).toMatchObject({ bauart: 'formstueck', predefinedType: 'ENTRY', regel: 'ap-formstueck' });
    });

    it('ohne Sohle: nichts zu bauen, eine Warnung', () => {
        const e = ordneKnoten({ ...GA, sohle: null });
        expect(e.bauart).toBe('auslassen');
        expect(e.befunde[0]).toMatchObject({ regel: 'ohne_sohle', schwere: 'warnung' });
    });
});

describe('Muster · Kunststoffschacht', () => {
    const kette = (t) => t.filter(x => x.rolle !== 'steigeisen');
    it('DI 0,8 m, 1,3 m tief: Unterteil, Schachtrohr, Konus auf 625, Abdeckung — lückenlos bis zum Deckel', () => {
        const { teile, kopf } = kunststoffschacht({ name: 'GA1', ort: { ost: 0, nord: 0 }, sohle: 101.2, deckel: 102.5, di: 0.8 });
        expect(teile.map(t => t.rolle)).toEqual(['schachtunterteil', 'schachtrohr', 'schachthals', 'abdeckung']);
        expect(kopf).toMatchObject({ wand: kunststoffWand(0.8), oeffnung: 0.625, begehbar: true });
        const k = kette(teile);
        for (let i = 1; i < k.length; i++) expect(k[i].unten).toBeCloseTo(k[i - 1].oben, 6);
        expect(k.at(-1).oben).toBe(102.5);
        expect(teile[0].unten).toBeCloseTo(101.2 - 0.03, 6);                                // Boden unter der Sohle
    });
    it('Konus erst ab 1,0 m Tiefe (Vorgabe Fabio): 0,99 m → Teleskop mit Befund, 1,00 m → Konus', () => {
        const flach = kunststoffschacht({ name: 'A', ort: { ost: 0, nord: 0 }, sohle: 100, deckel: 100.99, di: 0.8 });
        expect(flach.teile.map(t => t.rolle)).toEqual(['schachtunterteil', 'schachtrohr', 'teleskop', 'abdeckung']);
        expect(flach.befunde.map(b => b.regel)).toContain('unter_konustiefe');
        const genau = kunststoffschacht({ name: 'B', ort: { ost: 0, nord: 0 }, sohle: 100, deckel: 101, di: 0.8 });
        expect(genau.teile.map(t => t.rolle)).toEqual(['schachtunterteil', 'schachthals', 'abdeckung']);   // kein Schachtrohr nötig
        expect(genau.teile[1].herleitung.konus).toMatchObject({ art: 'vorgabe' });
    });
    it('flacher als 1,0 m: Inspektionsöffnung DI 0,4 m mit Teleskop, nicht besteigbar (DIN 1986-100, Tab. 3)', () => {
        const e = ordneKnoten({ art: 'anschlusspunkt', name: 'GA8', punktkennung: 'GA', ort: { ost: 0, nord: 0 }, sohle: 100, gelaende: 100.8 });
        expect(e.berichtigt).toEqual(['ga-inspektionsoeffnung']);
        expect(e.muster.kopf).toMatchObject({ di: 0.4, begehbar: false });
        // 0,8 m: Unterteil 0,5 + Teleskop 0,2 + Abdeckung 0,1 — für ein Schachtrohr bleibt nichts.
        expect(e.muster.teile.map(t => t.rolle)).toEqual(['schachtunterteil', 'teleskop', 'abdeckung']);
        expect(e.muster.teile[0].herleitung.dInnen).toMatchObject({ art: 'norm', beleg: { norm: 'DIN 1986-100:2016-12' } });
        // Genau 1,0 m bleibt beim Schacht DI 0,8 mit Konus.
        expect(ordneKnoten({ art: 'anschlusspunkt', name: 'GA7', punktkennung: 'GA', ort: { ost: 0, nord: 0 }, sohle: 100, gelaende: 101 }).muster.kopf.di).toBe(0.8);
    });
    it('tiefer als 3 m: DI 0,8 ist nur bis 3,0 m zulässig — DI 1,0 m (DIN 1986-100, Tab. 3)', () => {
        const e = ordneKnoten({ art: 'anschlusspunkt', name: 'GA9', punktkennung: 'GA', ort: { ost: 0, nord: 0 }, sohle: 100, gelaende: 103.4 });
        expect(e.berichtigt).toEqual(['ga-tiefer-als-3m']);
        expect(e.muster.kopf.di).toBe(1);
        expect(e.muster.teile[0].herleitung.dInnen).toMatchObject({ art: 'norm', beleg: { norm: 'DIN 1986-100:2016-12' } });
    });
    it('DI 0,4 m: Teleskop statt Konus, nicht begehbar; zu flach: kein Schacht', () => {
        const klein = kunststoffschacht({ name: 'X', ort: { ost: 0, nord: 0 }, sohle: 100, deckel: 101, di: 0.4 });
        expect(klein.teile.map(t => t.rolle)).toEqual(['schachtunterteil', 'schachtrohr', 'teleskop', 'abdeckung']);
        expect(klein.kopf.begehbar).toBe(false);
        expect(kunststoffschacht({ name: 'Y', ort: { ost: 0, nord: 0 }, sohle: 100, deckel: 100.1, di: 0.8 }).kopf).toBeNull();
    });
    it('die Vorlage: Radius bis zur Aussenwand, Rollen in Reihenfolge', () => {
        const v = vorlageNach('kunststoffschacht');
        expect(v.knotenRadius({ di: 0.8 })).toBeCloseTo(0.4 + kunststoffWand(0.8), 9);
        expect(v.rollen({ tiefe: 1.3, di: 0.8, deckelklasse: 0 }, { x: 0, y: 0, z: 0 }).map(r => r.rezept))
            .toEqual(['schachtunterteil', 'schachtring', 'schachthals', 'schachtabdeckung']);
    });
});

describe('Kunststoffschacht über den Kommandoweg — ein Knoten im Netz', () => {
    beforeEach(() => { repo.setBackend(new Speicher()); setActivePinia(createPinia()); });
    afterEach(() => repo.setBackend(null));
    it('ein Bauwerk Schacht mit seinen Teilen; eine Leitung, die 0,28 m neben der Mitte endet, hängt daran', async () => {
        const b = useBearbeitung();
        const kopf = { schema: KOMMANDO_SCHEMA, wer: 'test', wann: '2026-10-05T12:00:00Z', ziel: [] };
        const ga = await b.fuehreAus({ ...kopf, id: 'ko-ks-1', werkzeug: 'bauwerk-aus-vorlage-kunststoffschacht', neu: ['cde-ga1'],
                                       eingaben: { zug: [{ ost: 0, nord: 0, hoehe: 101.2 }] },
                                       werte: { name: 'GA1', hoehe: '', tiefe: 1.3, di: 0.8, deckelklasse: 0 } }, { kennungsgeber: (() => { let n = 0; return () => `cde-ks-${++n}`; })() });
        expect(ga.ausgefuehrt, ga.grund ?? '').toBe(true);
        const l = await b.fuehreAus({ ...kopf, id: 'ko-ks-2', werkzeug: 'rohr-zeichnen',
                                      eingaben: { zug: [{ ost: 0, nord: 0.28, hoehe: 101.2, knoten: 'cde-ga1' }, { ost: 0, nord: 20, hoehe: 101 }] },
                                      werte: { name: 'L1', kategorie: 'IFCPIPESEGMENT', hoehe: '', dn: 160 } }, { kennungsgeber: () => 'cde-l1' });
        expect(l.ausgefuehrt, l.grund ?? '').toBe(true);
        const stand = useAenderungen().wirksamerStand('erzeugt');
        const teile = [...stand.values()].filter(p => p.parameter?.teilVon === 'cde-ga1').map(p => p.parameter.objektTyp ?? p.rezept);
        expect(teile).toEqual(['Schachtunterteil Kunststoff', 'Schachtrohr Kunststoff', 'Konus Kunststoff', 'schachtabdeckung']);
        const { netz } = eigeneNetzauskunft(stand);
        expect(netz.abweichend).toEqual([]);                                           // 0,28 m < 0,42 m
        expect([...netz.kanten.values()][0].von).toBe('cde:cde-ga1');
    });
});

describe('Die Fuge am Symbol bis an die Wand (I11)', () => {
    it('Leitung endet 0,28 m vor einem GA, der eine Inspektionsöffnung DI 0,4 m ist: bis an die Wand verlängert', async () => {
        const { liesIsybau } = await import('../services/bimfy/Geometrieleser.js');
        const { gruppiere, kommandosFuer } = await import('../services/bimfy/Uebersetzer.js');
        const ga = `<AbwassertechnischeAnlage><Objektbezeichnung>GA1</Objektbezeichnung><Objektart>2</Objektart><Status>0</Status>
    <Knoten><KnotenTyp>1</KnotenTyp><Anschlusspunkt><Punktkennung>GA</Punktkennung></Anschlusspunkt></Knoten>
    <Geometrie><Geometriedaten><Knoten><Punkt><Rechtswert>0</Rechtswert><Hochwert>30</Hochwert><Punkthoehe>101,20</Punkthoehe><PunktattributAbwasser>GA</PunktattributAbwasser></Punkt>
      <Punkt><Punkthoehe>102,00</Punkthoehe><PunktattributAbwasser>GOK</PunktattributAbwasser></Punkt></Knoten></Geometriedaten></Geometrie></AbwassertechnischeAnlage>`;
        const leitung = `<AbwassertechnischeAnlage><Objektbezeichnung>L1</Objektbezeichnung><Objektart>1</Objektart>
    <Geometrie><Geometriedaten><Polygone><Polygon><PolygonArt>3</PolygonArt><Kante>
      <Start><Rechtswert>0</Rechtswert><Hochwert>29,72</Hochwert><Punkthoehe>101,2</Punkthoehe><PunktattributAbwasser>LHP</PunktattributAbwasser></Start>
      <Ende><Rechtswert>0</Rechtswert><Hochwert>10</Hochwert><Punkthoehe>101</Punkthoehe><PunktattributAbwasser>LHP</PunktattributAbwasser></Ende></Kante></Polygon></Polygone></Geometriedaten></Geometrie>
    <Kante><KantenTyp>1</KantenTyp><KnotenZulauf>GA1</KnotenZulauf><KnotenAblauf>X</KnotenAblauf><SohlhoeheZulauf>101,2</SohlhoeheZulauf><SohlhoeheAblauf>101</SohlhoeheAblauf>
      <Material>PVC</Material><Profil><Profilart>0</Profilart><Profilhoehe>150</Profilhoehe></Profil><Leitung></Leitung></Kante></AbwassertechnischeAnlage>`;
        const text = `<?xml version="1.0" encoding="UTF-8"?><Identifikation><Datenkollektive><Stammdatenkollektiv>${ga}${leitung}</Stammdatenkollektiv></Datenkollektive></Identifikation>`;
        const { kommandos } = kommandosFuer(gruppiere(liesIsybau(text).geometrien));
        const gaK = kommandos.find(x => x.geo.name === 'GA1').kommando;
        expect(gaK.werte).toMatchObject({ di: 0.4 });                                 // 0,8 m tief → Inspektionsöffnung
        const l1 = kommandos.find(x => x.geo.name === 'L1').kommando;
        const r = 0.2 + kunststoffWand(0.4);
        expect(l1.eingaben.zug[0].nord).toBeCloseTo(30 - r, 3);                        // an der Aussenwand, nicht in der Mitte
        expect(l1.eingaben.zug[0].hoehe).toBe(101.2);
        expect(l1.werte.herleitung).toMatch(/bis an die Wand von GA1 verlängert/);
    });
});
