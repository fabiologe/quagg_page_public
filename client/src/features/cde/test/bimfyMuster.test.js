// @vitest-environment jsdom
/**
 * BIMFY · ISYBAU in höchster Genauigkeit, Stufe 1: Leser und Muster.
 *
 * ISYBAU liefert Daten, keine Körper. Geprüft wird, dass der Leser das Format
 * 2013 so liest, wie es die Arbeitshilfen Abwasser 12/2015 beschreiben, und
 * dass die Muster daraus eine Bauteilkette machen, deren Höhen AUFGEHEN und
 * deren Masse jeweils sagen, woher sie stammen (Datei, Norm, Annahme).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { repo } from '../services/RepoFacade.js';
import { useAenderungen } from '../stores/useAenderungen.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { KOMMANDO_SCHEMA } from '../services/kommando/Kommando.js';
import { gruppiere, kommandosFuer } from '../services/bimfy/Uebersetzer.js';
import { rezeptNach } from '../services/Bauteilrezepte.js';
import { Speicher } from './hilfen/vorlagenKommandos.js';
import { liesIsybauDaten, bogenPunkte, kantenzugMitSohle } from '../services/bimfy/isybau/Isybauleser.js';
import { normschacht, fuelleHoehe, steigeisenHoehen, KETTE_TOLERANZ_M } from '../services/bimfy/muster/Normschacht.js';
import { rohrwand } from '../services/bimfy/muster/Rohrwand.js';
import { liesIsybau } from '../services/bimfy/Geometrieleser.js';
import { meshVolume } from '../services/geometrie/MeshOps.js';

const r3 = (v) => Math.round(v * 1000) / 1000;

/** Ein Schacht nach AH15 Tab. A-7-24 bis -28, mit allen Bereichen. */
const schachtXml = ({ name = 'S1', ost = 410000, nord = 5460000, deckel = '105,00', sohle = '102,00', sohleAttr = 'SMP',
                      aufbau = '<Aufbauform>R</Aufbauform><Konus>1</Konus><LaengeAufbau>0,63</LaengeAufbau><HoeheAufbau>2,60</HoeheAufbau><MaterialAufbau>B</MaterialAufbau>',
                      abdeckung = '<Deckelform>R</Deckelform><Deckeltyp>1</Deckeltyp><LaengeDeckel>0,63</LaengeDeckel><Abdeckungsklasse>D</Abdeckungsklasse><MaterialAbdeckung>GGG</MaterialAbdeckung>',
                      unterteil = '<Unterteilform>R</Unterteilform><LaengeUnterteil>1,00</LaengeUnterteil><MaterialUnterteil>B</MaterialUnterteil><Gerinneform>1</Gerinneform><MaterialGerinne>B</MaterialGerinne>',
                      extra = '<Einstieghilfe>1</Einstieghilfe><ArtEinstieghilfe>1</ArtEinstieghilfe><MaterialSteighilfen>3</MaterialSteighilfen>' } = {}) => `
  <AbwassertechnischeAnlage>
    <Objektbezeichnung>${name}</Objektbezeichnung><Objektart>2</Objektart><Status>0</Status><Entwaesserungsart>KS</Entwaesserungsart>
    <Geometrie><GeoObjekttyp>P</GeoObjekttyp><Geometriedaten><Knoten>
      <Punkt><Rechtswert>${ost}</Rechtswert><Hochwert>${nord}</Hochwert><Punkthoehe>${deckel}</Punkthoehe><PunktattributAbwasser>DMP</PunktattributAbwasser></Punkt>
      ${sohle === null ? '' : `<Punkt><Rechtswert>${ost}</Rechtswert><Hochwert>${nord}</Hochwert><Punkthoehe>${sohle}</Punkthoehe><PunktattributAbwasser>${sohleAttr}</PunktattributAbwasser></Punkt>`}
    </Knoten></Geometriedaten></Geometrie>
    <Knoten><KnotenTyp>0</KnotenTyp><Schacht>
      <SchachtFunktion>1</SchachtFunktion><Schachttiefe>3,00</Schachttiefe>${extra}
      <Abdeckung>${abdeckung}</Abdeckung>
      <Aufbau>${aufbau}</Aufbau>
      <Unterteil>${unterteil}</Unterteil>
    </Schacht></Knoten>
  </AbwassertechnischeAnlage>`;

const haltungXml = ({ name = 'H1', von = 'S1', bis = 'S2', oben = '102,00', unten = '101,70', dn = 300, material = 'STZ', geometrie = '' } = {}) => `
  <AbwassertechnischeAnlage>
    <Objektbezeichnung>${name}</Objektbezeichnung><Objektart>1</Objektart>
    ${geometrie}
    <Kante><KantenTyp>0</KantenTyp><KnotenZulauf>${von}</KnotenZulauf><KnotenAblauf>${bis}</KnotenAblauf>
      <SohlhoeheZulauf>${oben}</SohlhoeheZulauf><SohlhoeheAblauf>${unten}</SohlhoeheAblauf><Laenge>50,00</Laenge><Material>${material}</Material>
      <Profil><SonderprofilVorhanden>0</SonderprofilVorhanden><Profilart>0</Profilart><Profilhoehe>${dn}</Profilhoehe></Profil>
      <Haltung><HaltungsFunktion>0</HaltungsFunktion></Haltung></Kante>
  </AbwassertechnischeAnlage>`;

const datei = (...objekte) => `<?xml version="1.0" encoding="UTF-8"?>
<Identifikation xmlns="http://www.ofd-hannover.la/Identifikation"><Datenkollektive><Stammdatenkollektiv>
${objekte.join('\n')}
</Stammdatenkollektiv></Datenkollektive></Identifikation>`;

describe('ISYBAU-Leser (Format 2013, AH15 Anhang A-7)', () => {
    it('liest Abdeckung, Aufbau, Unterteil und Steighilfen unter ihren Formatnamen', () => {
        const { schaechte, warnungen } = liesIsybauDaten(datei(schachtXml({
            abdeckung: '<Deckelform>RV</Deckelform><Deckeltyp>2</Deckeltyp><LaengeDeckel>0,63</LaengeDeckel><Abdeckungsklasse>D</Abdeckungsklasse><MaterialAbdeckung>GGG</MaterialAbdeckung><AnzahlAuflageringe>2</AnzahlAuflageringe><HoeheAuflageringe>16</HoeheAuflageringe><Schmutzfaenger>1</Schmutzfaenger>',
        })));
        expect(warnungen).toEqual([]);
        const s = schaechte[0];
        expect(s).toMatchObject({ name: 'S1', deckelHoehe: 105, sohle: { hoehe: 102, quelle: 'SMP' }, schachttiefe: 3,
                                  einstieghilfe: true, artEinstieghilfe: 1, materialSteighilfen: 3 });
        // HoeheAuflageringe steht in ZENTIMETERN (Tab. A-7-25) — weiter geht es in Metern.
        expect(s.abdeckung).toMatchObject({ deckelform: 'RV', deckeltyp: 2, laenge: 0.63, klasse: 'D', material: 'GGG',
                                            anzahlAuflageringe: 2, hoeheAuflageringe: 0.16, schmutzfaenger: true });
        expect(s.aufbau).toMatchObject({ form: 'R', konus: true, laenge: 0.63, hoehe: 2.6, material: 'B' });
        expect(s.unterteil).toMatchObject({ form: 'R', laenge: 1, gerinneform: 1, materialGerinne: 'B' });
    });

    it('Sohle aus HP bei Altdaten (Tab. A-1-5), sonst Deckel − Schachttiefe — und es steht dabei, woher', () => {
        const hp = liesIsybauDaten(datei(schachtXml({ sohleAttr: 'HP', sohle: '101,90' }))).schaechte[0];
        expect(hp.sohle).toEqual({ hoehe: 101.9, quelle: 'HP' });
        const ohne = liesIsybauDaten(datei(schachtXml({ sohle: null }))).schaechte[0];
        expect(ohne.sohle).toEqual({ hoehe: 102, quelle: 'Deckelhöhe − Schachttiefe' });
    });

    it('ein Mass in Millimetern statt Metern wird umgerechnet UND gemeldet', () => {
        const { schaechte, warnungen } = liesIsybauDaten(datei(schachtXml({ unterteil: '<LaengeUnterteil>1000</LaengeUnterteil>' })));
        expect(schaechte[0].unterteil.laenge).toBe(1);
        expect(warnungen[0]).toMatch(/LaengeUnterteil = 1000 als Millimeter gelesen/);
    });

    it('die Haltung: Daten aus Kante, Kreis-DN aus Profilhoehe, Bogen als kürzerer Kreisbogen', () => {
        const geo = `<Geometrie><Geometriedaten><Polygone><Polygon><PolygonArt>3</PolygonArt>
            <Kante><Start><Rechtswert>0</Rechtswert><Hochwert>0</Hochwert><Punkthoehe>102</Punkthoehe><PunktattributAbwasser>LHP</PunktattributAbwasser></Start>
                   <Ende><Rechtswert>10</Rechtswert><Hochwert>10</Hochwert><Punkthoehe>101,8</Punkthoehe><PunktattributAbwasser>LHP</PunktattributAbwasser></Ende>
                   <Mitte><Rechtswert>10</Rechtswert><Hochwert>0</Hochwert><PunktattributAbwasser>KMP</PunktattributAbwasser></Mitte></Kante>
          </Polygon></Polygone></Geometriedaten></Geometrie>`;
        const { kanten } = liesIsybauDaten(datei(haltungXml({ geometrie: geo })));
        const k = kanten[0];
        expect(k).toMatchObject({ art: 'haltung', von: 'S1', bis: 'S2', sohleZulauf: 102, sohleAblauf: 101.7, material: 'STZ',
                                  profil: { art: 0, hoehe: 0.3, breite: 0.3 } });
        // Viertelkreis um (10, 0) mit r = 10: 90° in 10°-Schritten → 9 Teilstücke.
        expect(k.zug).toHaveLength(10);
        for (const p of k.zug) expect(r3(Math.hypot(p.ost - 10, p.nord))).toBe(10);
        expect(bogenPunkte({ ost: 0, nord: 0 }, { ost: 10, nord: 10 }, { ost: 10, nord: 0 })).toHaveLength(8);
        // Die Sohlhöhen der Kante gelten an den Enden (Tab. A-7-15).
        const zug = kantenzugMitSohle(k, () => null);
        expect([zug[0].hoehe, zug[zug.length - 1].hoehe]).toEqual([102, 101.7]);
    });
});

describe('Muster · Höhen füllen', () => {
    it('2,18 m: zwei Regelringe, der Rest in Auflageringen 100 + 80 mm', () => {
        expect(fuelleHoehe(2.18)).toEqual({ ringe: [1, 1], auflageringe: [0.1, 0.08], rest: 0 });
    });
    it('Auflageringe aus ISYBAU fest: nur die Ringe füllen, der Rest wird ehrlich genannt', () => {
        expect(fuelleHoehe(2.75, { auflageringeGegeben: 0 })).toEqual({ ringe: [1, 1, 0.75], auflageringe: [], rest: 0 });
        expect(fuelleHoehe(2.1, { auflageringeGegeben: 0 }).rest).toBe(0.1);
    });
    it('Steigeisen: erstes 400 mm über der Standfläche, Abstand 250–333 mm, oberstes höchstens ein Steigmass unter dem Austritt', () => {
        // Auch bei kurzen Höhen, an denen ein starrer Abstand oben scheiterte (Abnahme I7: 7 Schächte).
        for (const h of [3, 1.13, 0.9, 2.47, 0.62]) {
            const { hoehen, abstand } = steigeisenHoehen(100, 100 + h);
            expect(hoehen[0], `h = ${h}`).toBe(100.4);
            if (abstand !== null) {
                expect(abstand, `h = ${h}`).toBeGreaterThanOrEqual(0.25);
                expect(abstand, `h = ${h}`).toBeLessThanOrEqual(0.333);
            }
            expect(r3(100 + h - hoehen[hoehen.length - 1]), `h = ${h}`).toBeLessThanOrEqual(0.333);
        }
    });
});

describe('Muster · Normschacht', () => {
    const lies = (opt) => liesIsybauDaten(datei(schachtXml(opt))).schaechte[0];

    it('Regelschacht DN 1000, 3,00 m tief: die Kette geht auf, jedes Teil sagt, woher es kommt', () => {
        const { teile, befunde, kopf } = normschacht(lies(), { anschluesse: [{ dn: 0.3, art: 'ablauf' }] });
        expect(befunde.filter(b => b.schwere === 'warnung')).toEqual([]);
        expect(teile.map(t => t.rolle)).toEqual(['schachtunterteil', 'schachtring', 'schachtring', 'schachthals', 'auflagering',
                                                  'abdeckung', 'steigeisen']);
        expect(kopf).toMatchObject({ dn: 1, wanddicke: 0.12, oeffnung: 0.625, oberteil: 'hals' });
        // Lückenlos von der Bodenunterkante bis zum Deckel.
        const koerper = teile.filter(t => Number.isFinite(t.unten));
        for (let i = 1; i < koerper.length; i++) expect(Math.abs(koerper[i].unten - koerper[i - 1].oben)).toBeLessThanOrEqual(KETTE_TOLERANZ_M);
        expect(koerper[koerper.length - 1].oben).toBe(105);
        // Unterteil: DN 300 + 400 mm Wand über dem Scheitel = 0,70 m, Boden 150 mm unter der Sohle.
        expect(teile[0]).toMatchObject({ unten: 101.85, oben: 102.7, dInnen: 1, dAussen: 1.24, boden: 0.15 });
        expect(teile[0].gerinne).toMatchObject({ form: 1, hoehe: 0.3, auftritt: 0.3 });
        // Herkunft: Deckel und Konus aus der Datei, Ringhöhe Norm, Rahmenhöhe Annahme.
        expect(teile[1].herleitung.hoehe).toMatchObject({ art: 'norm', beleg: { norm: 'DIN 4034-1:2020-04' } });
        expect(teile[3].herleitung.form.art).toBe('isybau');
        expect(teile[5].herleitung.hoehe.art).toBe('annahme');
        expect(teile[0].herleitung.boden.art).toBe('norm-pruefen');
    });

    it('zu flach für einen Hals: Abdeckplatte nach DIN 4034-1, und es steht als Befund da', () => {
        const { teile, befunde } = normschacht(lies({ deckel: '103,40', aufbau: '<Aufbauform>R</Aufbauform><LaengeAufbau>1,00</LaengeAufbau>' }));
        expect(befunde.map(b => b.regel)).toContain('zu_flach_fuer_hals');
        expect(teile.map(t => t.rolle)).toContain('abdeckplatte');
        expect(teile.map(t => t.rolle)).not.toContain('schachthals');
    });

    it('ISYBAU sagt „kein Konus": Abdeckplatte aus der Datei, nicht aus der Norm', () => {
        const { teile } = normschacht(lies({ aufbau: '<Aufbauform>R</Aufbauform><Konus>0</Konus><LaengeAufbau>1,00</LaengeAufbau>' }));
        const platte = teile.find(t => t.rolle === 'abdeckplatte');
        expect(platte.herleitung.form.art).toBe('isybau');
    });

    it('Auflageringe aus ISYBAU (16 cm, 2 Stück) gelten — die Ringe füllen den Rest', () => {
        const s = lies({ abdeckung: '<Deckelform>R</Deckelform><Abdeckungsklasse>D</Abdeckungsklasse><AnzahlAuflageringe>2</AnzahlAuflageringe><HoeheAuflageringe>16</HoeheAuflageringe>' });
        const { teile } = normschacht(s, { anschluesse: [{ dn: 0.3 }] });
        expect(teile.filter(t => t.rolle === 'auflagering').map(t => t.oben - t.unten).map(r3)).toEqual([0.08, 0.08]);
        expect(teile.find(t => t.rolle === 'auflagering').herleitung.hoehe.art).toBe('isybau');
    });

    it('eckiger Schacht und zweiläufiger Steiggang über DN 1200 werden gemeldet, nicht still gebaut', () => {
        const eckig = normschacht(lies({ aufbau: '<Aufbauform>E</Aufbauform>' }));
        expect(eckig).toMatchObject({ teile: [], befunde: [{ regel: 'form_eckig', schwere: 'warnung' }] });
        const weit = normschacht(lies({ unterteil: '<LaengeUnterteil>1,50</LaengeUnterteil>', extra: '<ArtEinstieghilfe>2</ArtEinstieghilfe>' }));
        expect(weit.befunde.map(b => b.regel)).toContain('zweilaeufig_zu_weit');
        expect(weit.kopf.wanddicke).toBe(0.15);
    });

    it('eine Lücke nimmt das Unterteil auf — ausser ISYBAU legt seine Höhe fest, dann heisst sie so', () => {
        const ab = '<Abdeckungsklasse>D</Abdeckungsklasse><HoeheAuflageringe>6</HoeheAuflageringe>';
        const frei = normschacht(lies({ deckel: '104,55', abdeckung: ab }), { anschluesse: [{ dn: 0.3 }] });
        expect(frei.befunde.map(b => b.regel)).not.toContain('kette_offen');
        const ut = frei.teile[0];
        expect(ut.herleitung.hoehe.text).toMatch(/damit die Kette aufgeht/);
        const koerper = frei.teile.filter(t => Number.isFinite(t.unten));
        for (let i = 1; i < koerper.length; i++) expect(Math.abs(koerper[i].unten - koerper[i - 1].oben)).toBeLessThanOrEqual(KETTE_TOLERANZ_M);
        const fest = normschacht(lies({ deckel: '104,55', abdeckung: ab, unterteil: '<LaengeUnterteil>1,00</LaengeUnterteil><HoeheUnterteil>0,70</HoeheUnterteil>' }),
                                 { anschluesse: [{ dn: 0.3 }] });
        expect(fest.befunde.find(b => b.regel === 'kette_offen')?.text).toMatch(/cm nicht auf/);
    });

    it('Abnahme I7: was die echte Datei zeigte — Konus und Platte beide nein, Höhe 0, Q-Form, zu klein, Anschluss so gross wie der Schacht', () => {
        const beide = normschacht(lies({ aufbau: '<Aufbauform>R</Aufbauform><Abdeckplatte>0</Abdeckplatte><Konus>0</Konus><LaengeAufbau>1.00</LaengeAufbau><HoeheAufbau>0.00</HoeheAufbau>' }),
                                  { anschluesse: [{ dn: 0.3 }] });
        expect(beide.befunde.map(b => b.regel)).toEqual(['konus_und_platte_nein']);
        expect(beide.kopf.oberteil).toBe('hals');
        expect(normschacht(lies({ aufbau: '<Aufbauform>Q</Aufbauform>' })).befunde[0].regel).toBe('form_eckig');
        expect(normschacht(lies({ aufbau: '<Aufbauform>VORFL</Aufbauform>' })).befunde[0].regel).toBe('form_andere');
        expect(normschacht(lies({ unterteil: '<LaengeUnterteil>0.10</LaengeUnterteil>' })).befunde[0].regel).toBe('zu_klein');
        expect(normschacht(lies(), { anschluesse: [{ dn: 1.0 }] }).befunde.map(b => b.regel)).toContain('anschluss_zu_gross');
    });
});

describe('Muster · Rohrwand', () => {
    it('PVC-U DN/OD 200: Aussendurchmesser ist die Nennweite, Wand dn/SDR 34 = 5,9 mm (wie DIN EN 1401-1, Tab. 6)', () => {
        const w = rohrwand({ dn: 0.2, material: 'PVCU' });
        expect(w).toMatchObject({ dAussen: 0.2, wanddicke: 0.0059, dInnen: 0.1882, dnBezug: 'aussen' });
        expect(w.herleitung.wanddicke).toMatchObject({ art: 'norm', beleg: { norm: 'DIN EN 1401-1:2019-09' } });
        expect(w.hinweise).toEqual(['Steifigkeitsklasse fehlt in ISYBAU — SN 8 angenommen']);
        // Kleine Nennweiten: nie unter 3,2 mm; SN 16 = SDR 27,6.
        expect(rohrwand({ dn: 0.11, material: 'PVC', sn: 'SN4' }).wanddicke).toBe(0.0032);
        expect(rohrwand({ dn: 0.4, material: 'PVC', sn: 'SN16' }).wanddicke).toBe(0.0145);
        expect(rohrwand({ dn: 0.4, material: 'PP' }).herleitung.wanddicke).toMatchObject({ art: 'norm', text: expect.stringContaining('SDR 29 (SN8, angenommen)') });
    });
    it('Beton (DIN V 1201): DN innen, Wand aus dem Spitzenden-Aussendurchmesser, Glockenmuffe', () => {
        // Stützwerte der Norm (Tab. 7, unbewehrt): DN 300 → dsp 386 mm, DN 1000 → 1198 mm.
        const b300 = rohrwand({ dn: 0.3, material: 'B' });
        expect(b300).toMatchObject({ dInnen: 0.3, dAussen: 0.386, dnBezug: 'innen', dnFeld: 0.3, baulaenge: 2.5 });
        expect(rohrwand({ dn: 1, material: 'SB' }).dAussen).toBe(1.198);       // vorher: 1,2318 (Faustwert)
        expect(b300.herleitung.wanddicke).toMatchObject({ art: 'norm', beleg: { norm: 'DIN V 1201:2004-08' } });
        // Muffe: Spalt 7,8 mm, Muffenwand 50 mm, Länge 80 mm (Tab. 3 und 7) — die Formeln treffen sie auf 1 mm.
        expect(b300.verbindung.art).toBe('glockenmuffe');
        expect(b300.verbindung.innen - b300.dAussen).toBeCloseTo(2 * 0.0078, 3);
        expect(b300.verbindung.aussen - b300.verbindung.innen).toBeCloseTo(2 * 0.05, 2);
        expect(b300.verbindung.tiefe).toBeCloseTo(0.08, 2);
        expect(rohrwand({ dn: 0.3, material: 'B', wanddicke: 0.05 })).toMatchObject({ wanddicke: 0.05, dAussen: 0.4 });
        expect(rohrwand({ dn: 0.3, material: 'B', wanddicke: 0.05 }).herleitung.wanddicke.art).toBe('isybau');
    });
    it('Steinzeug (DIN EN 295-1): DN innen, Wand und Muffe als gekennzeichnete Annahme an den Verbindungsmassen', () => {
        const stz = rohrwand({ dn: 0.15, material: 'STZ' });
        expect(stz).toMatchObject({ dInnen: 0.15, dAussen: 0.186, dnBezug: 'innen' });  // d3 DN 150: 186 mm
        expect(stz.herleitung.wanddicke.art).toBe('annahme');
        expect(stz.verbindung.innen).toBeGreaterThan(stz.dAussen);
        expect(rohrwand({ dn: 0.3, material: 'STZ' }).baulaenge).toBe(2.5);
    });
    it('Kunststoff der alten DN-Reihe: PP und PVC „DN 150" sind DN/OD 160, das Feld DN bekommt 160', () => {
        for (const material of ['PP', 'PVC', 'KST']) {
            const w = rohrwand({ dn: 0.15, material });
            expect(w, material).toMatchObject({ dAussen: 0.16, dnBezug: 'aussen', dnFeld: 0.16 });
            expect(w.hinweise[0]).toMatch(/DN\/OD 160/);
        }
        // Innen bleiben rund 150 mm — vorher war das PP-Rohr innen 140 mm.
        expect(rohrwand({ dn: 0.15, material: 'PP' }).dInnen).toBeCloseTo(0.149, 3);
        expect(rohrwand({ dn: 0.2, material: 'PP' }).hinweise).toEqual(['Steifigkeitsklasse fehlt in ISYBAU — SN 8 angenommen']);
    });
    it('PP und PE: SDR je Steifigkeitsklasse, Steckmuffe L1 = 0,4·dn + 18 mm, Baulänge 6 m aus der Norm', () => {
        // DIN EN 1852-1, Tab. 6: DN/OD 315 → L1 144 mm; DIN EN 12666-1: SN 8 = SDR 21 → 315 mm: 15,0 mm.
        const pp = rohrwand({ dn: 0.315, material: 'PP', sn: 'SN4' });
        expect(pp.wanddicke).toBe(0.0096);                                       // 315/33
        expect(pp.verbindung).toMatchObject({ art: 'steckmuffe', tiefe: 0.144 });
        expect(pp.baulaenge).toBe(6);
        expect(pp.herleitung.baulaenge.art).toBe('norm');
        expect(rohrwand({ dn: 0.315, material: 'PEHD', sn: 'SN8' }).wanddicke).toBe(0.015);
    });
    it('Guss: DE aus der Reihe, Wand K9; ohne Norm im Bestand (GFK, Faserzement) eine Annahme mit Kupplung', () => {
        const g = rohrwand({ dn: 0.3, material: 'GGG' });
        expect(g.dAussen).toBeCloseTo(0.326, 2);                                  // DE 326 mm
        expect(g.wanddicke).toBe(0.0072);                                         // 4,5 + 0,009·300
        const gfk = rohrwand({ dn: 0.5, material: 'GFK' });
        expect(gfk).toMatchObject({ dnBezug: 'innen', dInnen: 0.5 });
        expect(gfk.verbindung.art).toBe('kupplung');
        expect(gfk.herleitung.wanddicke.art).toBe('annahme');
        // Ortbeton ist kein Rohr aus Rohren: keine Muffe, keine Baulänge.
        expect(rohrwand({ dn: 0.8, material: 'OB' })).toMatchObject({ verbindung: null, baulaenge: null });
        // Die Datei geht vor: Regeleinzelrohrlänge.
        expect(rohrwand({ dn: 0.3, material: 'B', baulaenge: 2 })).toMatchObject({ baulaenge: 2 });
    });
});

describe('Rohr mit Muffen (I8)', () => {
    const vol = (k) => meshVolume(k.positions, k.positions.length / 9);
    const ROHR = { punkte: [[0, 0, 0], [10, 0, 0]], dn: 300, wanddicke: 43, dnBezug: 'innen' };
    // Ein 12-Eck vom Radius r hat die Fläche 3·r².
    const ring = (ra, ri, l) => 3 * (ra * ra - ri * ri) * l;

    it('10 m Beton DN 300 mit 2,5 m Baulänge: drei Stösse, je eine Glockenmuffe — das Volumen rechnet nach', () => {
        const rz = rezeptNach('rohr');
        const ohne = rz.formAus(ROHR, 'koerper');
        expect(vol(ohne).volume).toBeCloseTo(ring(0.193, 0.15, 10), 6);
        const mit = rz.formAus({ ...ROHR, baulaenge: 2.5, muffeAussen: 499, muffeTiefe: 80 }, 'koerper');
        expect(vol(mit).closed).toBe(true);
        expect(vol(mit).volume).toBeCloseTo(ring(0.193, 0.15, 10) + 3 * ring(0.2495, 0.193, 0.08), 6);
        // Ohne Baulänge bleibt das Rohr bitgleich.
        expect(rz.formAus({ ...ROHR, muffeAussen: 499, muffeTiefe: 80 }, 'koerper').positions).toEqual(ohne.positions);
    });

    it('ein Stoss vor dem Knick: die Muffe rückt hinter ihn, der Körper bleibt geschlossen', () => {
        const rz = rezeptNach('rohr');
        const knie = { ...ROHR, punkte: [[0, 0, 0], [2.46, 0, 0], [2.46, 0, -5]] };
        const ohne = vol(rz.formAus(knie, 'koerper'));
        // Stoss bei 2,44 m, Muffe 80 mm — sie reichte über den Knick bei 2,46 m.
        const mit = vol(rz.formAus({ ...knie, baulaenge: 2.44, muffeAussen: 499, muffeTiefe: 80 }, 'koerper'));
        expect(mit.closed).toBe(true);                                              // vorher: 10 Kanten nicht mannigfaltig
        // Drei Stösse (2,44, 4,88 und 7,32 m), alle Muffen ganz auf geraden Schenkeln.
        expect(mit.volume - ohne.volume).toBeCloseTo(3 * ring(0.2495, 0.193, 0.08), 6);
    });

    it('ISYBAU → Kommando: Baulänge und Muffe kommen aus dem Muster', () => {
        const text = datei(schachtXml(), schachtXml({ name: 'S2', ost: 410040, nord: 5460000, deckel: '104,80', sohle: '101,70' }),
                           haltungXml());
        const { geometrien } = liesIsybau(text);
        const zeilen = gruppiere(geometrien);
        const { kommandos } = kommandosFuer(zeilen, {});
        const rohr = kommandos.find(k => k.kommando.werkzeug === 'rohr-zeichnen').kommando;
        const w = geometrien.find(g => g.name === 'H1').muster.rohrwand;
        expect(rohr.werte).toMatchObject({ baulaenge: w.baulaenge, muffeAussen: Math.round(w.verbindung.aussen * 1000),
                                           muffeTiefe: Math.round(w.verbindung.tiefe * 1000) });
    });
});

describe('BIMFY · ISYBAU mit Muster', () => {
    it('der Schacht trägt seine Kette, die Haltung ihre Wand — Anschlüsse mit Richtung', () => {
        const text = datei(schachtXml(), schachtXml({ name: 'S2', ost: 410040, nord: 5460000, deckel: '104,80', sohle: '101,70' }),
                           haltungXml());
        const { geometrien } = liesIsybau(text);
        const s1 = geometrien.find(g => g.name === 'S1');
        // Vorher: ein Schacht war EIN Zylinder. Jetzt: Unterteil, Ringe, Hals, Auflagering, Abdeckung, Steigeisen.
        expect(s1.muster.teile.length).toBe(7);
        expect(s1.muster.teile[0].gerinne.anschluesse).toEqual([{ dn: 0.3, sohle: 102, richtung: 0, art: 'ablauf' }]);
        const h1 = geometrien.find(g => g.name === 'H1');
        expect(h1.muster.rohrwand).toMatchObject({ dInnen: 0.3, dnBezug: 'innen' });
    });
});

describe('BIMFY I6 · ISYBAU → Normschacht und Rohr mit Wand, über den Kommandoweg', () => {
    beforeEach(() => { repo.setBackend(new Speicher()); setActivePinia(createPinia()); });
    afterEach(() => repo.setBackend(null));

    it('zwei Schächte werden je ein Normschacht, die Haltung ein Steinzeugrohr mit Wand', async () => {
        // Nahe am Ursprung (Float32 der Anzeige), sonst dieselbe Datei wie oben.
        const text = datei(schachtXml({ ost: 10, nord: 20 }), schachtXml({ name: 'S2', ost: 50, nord: 20, deckel: '104,80', sohle: '101,70' }),
                           haltungXml());
        const zeilen = gruppiere(liesIsybau(text).geometrien);
        expect(zeilen.map(z => [z.ebene, z.rezept])).toEqual([['ISYBAU Schacht', 'vorlage:normschacht'], ['ISYBAU Haltung', 'rohr']]);
        const { kommandos, fehler } = kommandosFuer(zeilen);
        expect(fehler).toEqual([]);
        const rohr = kommandos.find(k => k.kommando.werkzeug === 'rohr-zeichnen').kommando;
        expect(rohr.werte).toMatchObject({ dn: 300, wanddicke: 33, dnBezug: 'innen' });
        const s1 = kommandos.find(k => k.geo.name === 'S1').kommando;
        expect(s1.werte).toMatchObject({ tiefe: 3, dn: 1, oeffnung: 0.625, abgang: 0, zulauf: -1, deckelklasse: 4, oberteil: 1 });

        const b = useBearbeitung();
        let n = 0;
        for (const { kommando } of kommandos) {
            const erg = await b.fuehreAus({ schema: KOMMANDO_SCHEMA, id: `ko-i6-${++n}`, ziel: [], wer: 'test', wann: '2026-10-05T12:00:00Z', ...kommando },
                                          { kennungsgeber: () => `cde-i6-${++n}` });
            expect(erg.ausgefuehrt, erg.grund ?? '').toBe(true);
        }
        const plaene = [...useAenderungen().wirksamerStand('erzeugt').values()];
        expect(plaene.filter(p => p.rezept === 'bauwerk' && p.parameter.art === 'schacht').map(p => p.name).sort()).toEqual(['S1', 'S2']);
        // Vorher: zwei Schachtzylinder. Jetzt Teil für Teil — S2 ist 10 cm tiefer und hat einen Auflagering mehr.
        const teileVon = (name) => {
            const gid = [...useAenderungen().wirksamerStand('erzeugt')].find(([, p]) => p.rezept === 'bauwerk' && p.name === name)[0];
            return plaene.filter(p => p.parameter?.teilVon === gid).map(p => p.rezept);
        };
        expect(teileVon('S1')).toEqual(['schachtunterteil', 'berme', 'schachtring', 'schachtring', 'schachthals', 'auflagering', 'schachtabdeckung', 'steigeisen']);
        expect(teileVon('S2')).toEqual(['schachtunterteil', 'berme', 'schachtring', 'schachtring', 'schachthals', 'auflagering', 'auflagering',
                                        'schachtabdeckung', 'steigeisen']);
        const rohrPlan = plaene.find(p => p.rezept === 'rohr');
        expect(rohrPlan.parameter).toMatchObject({ dn: 300, wanddicke: 33, dnBezug: 'innen', baulaenge: 2.5 });
        expect(rohrPlan.parameter.herleitung).toMatch(/wanddicke: annahme — Steinzeug/);
        // Die Sohle des Rohrs bleibt die Sohle aus ISYBAU — innen, nicht unter der Wand.
        expect(rezeptNach('rohr').sohlen.lies(rohrPlan.parameter).map(v => Math.round(v * 1000) / 1000)).toEqual([102, 101.7]);
    });
});

describe('Abnahme I7 · Format 2017, wie es echte Dateien schreiben (nachgestellt, nicht die Datei)', () => {
    const XML2017 = `<?xml version="1.0" encoding="ISO-8859-1" standalone="yes" ?>
<Identifikation xmlns="http://www.bfr-abwasser.de"><Version>2017-07</Version><Datenkollektive><Stammdatenkollektiv>
  <AbwassertechnischeAnlage><Objektbezeichnung>S1</Objektbezeichnung><Objektart>2</Objektart><Status>0</Status>
    <Knoten><KnotenTyp>0</KnotenTyp><Schacht><SchachtFunktion>1</SchachtFunktion><Schachttiefe>2.50</Schachttiefe>
      <Aufbau><Aufbauform>R</Aufbauform><Abdeckplatte>0</Abdeckplatte><Konus>0</Konus><LaengeAufbau>1.00</LaengeAufbau><HoeheAufbau>0.00</HoeheAufbau></Aufbau>
      <UntereSchachtzone></UntereSchachtzone><Unterteil></Unterteil></Schacht>
      <Abdeckungen><Deckel><Index>1</Index><Deckelform>R</Deckelform></Deckel></Abdeckungen></Knoten>
    <Geometrie><GeoObjekttyp>P</GeoObjekttyp><Geometriedaten><Knoten>
      <Punkt><Rechtswert>2564686.715</Rechtswert><Hochwert>5461937.015</Hochwert><Punkthoehe>208.500</Punkthoehe><PunktattributAbwasser>SMP</PunktattributAbwasser></Punkt>
      <Punkt><Rechtswert>2564686.715</Rechtswert><Hochwert>5461937.015</Hochwert><Punkthoehe>211.000</Punkthoehe><PunktattributAbwasser>DMP</PunktattributAbwasser><Index>1</Index></Punkt>
    </Knoten></Geometriedaten><CRSLage>DE_DHDN_3GK2</CRSLage></Geometrie>
  </AbwassertechnischeAnlage>
  <AbwassertechnischeAnlage><Objektbezeichnung>RUE</Objektbezeichnung><Objektart>2</Objektart><Status>6</Status>
    <Knoten><KnotenTyp>2</KnotenTyp><Bauwerk><></></Bauwerk></Knoten></AbwassertechnischeAnlage>
  <AbwassertechnischeAnlage><Objektbezeichnung>H1</Objektbezeichnung><Objektart>1</Objektart><Status>6</Status>
    <Kante><KantenTyp>0</KantenTyp><KnotenZulauf>S1</KnotenZulauf><KnotenAblauf>X</KnotenAblauf>
      <SohlhoeheZulauf>208.500</SohlhoeheZulauf><SohlhoeheAblauf>208.300</SohlhoeheAblauf><Material>PP</Material>
      <Profil><SonderprofilVorhanden>0</SonderprofilVorhanden><Profilart>DN</Profilart><Profilhoehe>300</Profilhoehe></Profil>
      <Haltung><Rohrlaenge>9.80</Rohrlaenge></Haltung></Kante>
    <Geometrie><Geometriedaten><Polygone><Polygon><Polygonart>3</Polygonart><Kante>
      <Start><Rechtswert>2564686.715</Rechtswert><Hochwert>5461937.015</Hochwert><Punkthoehe>208.500</Punkthoehe><PunktattributAbwasser>RAP</PunktattributAbwasser></Start>
      <Ende><Rechtswert>2564696.715</Rechtswert><Hochwert>5461937.015</Hochwert><Punkthoehe>208.300</Punkthoehe><PunktattributAbwasser>RAP</PunktattributAbwasser></Ende>
    </Kante></Polygon></Polygone></Geometriedaten><CRSLage>DE_DHDN_3GK2</CRSLage></Geometrie>
  </AbwassertechnischeAnlage>
</Stammdatenkollektiv></Datenkollektive></Identifikation>`;

    it('repariert <></>, liest Polygonart, Abdeckungen/Deckel, Profilart DN und das Lagesystem', () => {
        const d = liesIsybauDaten(XML2017);
        expect(d.warnungen[0]).toMatch(/1 leere Elemente „<><\/>" entfernt/);
        const [s] = d.schaechte;
        expect(s).toMatchObject({ crsLage: 'DE_DHDN_3GK2', deckelHoehe: 211, sohle: { hoehe: 208.5, quelle: 'SMP' } });
        expect(s.abdeckung).toMatchObject({ deckelform: 'R' });
        const [k] = d.kanten;
        expect(k.profil).toMatchObject({ art: 0, hoehe: 0.3 });
        expect(k.zug).toHaveLength(2);
        expect(k.zug[1]).toMatchObject({ ost: 2564696.715, hoehe: 208.3 });
    });

    it('HoeheAufbau 0 ist unbekannt, Konus 0 + Platte 0 auch — es wird ein Regelschacht mit Hals; Rückgebautes ist abgewählt', () => {
        const { geometrien } = liesIsybau(XML2017);
        const s1 = geometrien.find(g => g.name === 'S1');
        expect(s1.muster.kopf.oberteil).toBe('hals');
        expect(s1.muster.befunde.map(b => b.regel)).toEqual(['konus_und_platte_nein']);
        const zeilen = gruppiere(geometrien);
        expect(zeilen.map(z => [z.ebene, z.aktiv])).toEqual([['ISYBAU Schacht', true], ['ISYBAU Haltung (rückgebaut)', false]]);
    });

    it('Lagebezug: CRSLage → EPSG, Gauss-Krüger 2 ↔ UTM 32 hin und zurück auf den Millimeter', async () => {
        const { epsgAusCrsLage, lagesystemVon, umrechner } = await import('../services/bimfy/Lagebezug.js');
        expect(epsgAusCrsLage('DE_DHDN_3GK2')).toBe('EPSG:31466');
        expect(epsgAusCrsLage('DE_ETRS89_UTM32')).toBe('EPSG:25832');
        expect(lagesystemVon(liesIsybau(XML2017).geometrien)).toMatchObject({ epsg: 'EPSG:31466' });
        const hin = umrechner('EPSG:31466', 'EPSG:25832'), zurueck = umrechner('EPSG:25832', 'EPSG:31466');
        const u = hin(2564686.715, 5461937.015);
        expect(u.ost).toBeGreaterThan(166000);
        expect(u.ost).toBeLessThan(834000);
        const g = zurueck(u.ost, u.nord);
        expect(Math.abs(g.ost - 2564686.715)).toBeLessThan(0.001);
        expect(Math.abs(g.nord - 5461937.015)).toBeLessThan(0.001);
        expect(umrechner('EPSG:31466', 'EPSG:31466')).toBeNull();
    });
});
