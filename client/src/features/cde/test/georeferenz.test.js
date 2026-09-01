// @vitest-environment node
/**
 * Georeferenz lesen (Stufe 13.1).
 *
 * DIESER TEST BENUTZT DAS ECHTE web-ifc, nicht eine Attrappe — und das ist
 * keine Bequemlichkeit, sondern die Lehre aus drei Fehlern an einem Tag:
 *
 *   getAllCoordOffsets   lieferte `[x,y,z]`, die Tests übergaben `{x,z}`
 *   AxisAnnotations      las `webIfc['IFCPIPESEGMENT']` von der INSTANZ, die
 *                        Attrappe im Test trug die Konstante, die echte nicht
 *
 * Beide Male war die Prüfung grün und der Produktionspfad tot, weil der Test
 * seine Eingabe SELBST gebaut hat. Ein selbstgebautes Testdatum ist eine
 * Annahme über die Schnittstelle, keine Beobachtung.
 *
 * Hier wird deshalb echter IFC-Text von der echten Bibliothek geparst. Die
 * Modelle sind klein und stehen im Test — dann sieht man, worauf sich eine
 * Erwartung bezieht — bis auf die getrackte Realdatei, die den Fall abdeckt,
 * den man nicht erfinden kann.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { leseGeoreferenz } from '../services/Georeferenz.js';

const hier = path.dirname(fileURLToPath(import.meta.url));
const wurzel = path.resolve(hier, '../../../../');      // client/
const require = createRequire(import.meta.url);

let WebIFC, api;
beforeAll(async () => {
    WebIFC = require('web-ifc');
    api = new WebIFC.IfcAPI();
    api.SetWasmPath(path.join(wurzel, 'node_modules/web-ifc/'), true);
    await api.Init();
}, 60_000);
afterAll(() => { try { api?.Dispose?.(); } catch { /* egal */ } });

/** Ein Modell aus IFC-TEXT öffnen — echter Parser, kein nachgebautes Objekt. */
function ausText(text) {
    return api.OpenModel(new TextEncoder().encode(text));
}

const KOPF = (schema) => `ISO-10303-21;
HEADER;
FILE_DESCRIPTION((''),'2;1');
FILE_NAME('t','2026-09-01T00:00:00',(''),(''),'','','');
FILE_SCHEMA(('${schema}'));
ENDSEC;
DATA;
#1= IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);
#2= IFCUNITASSIGNMENT((#1));
#3= IFCCARTESIANPOINT((0.,0.,0.));
#4= IFCDIRECTION((0.,0.,1.));
#5= IFCDIRECTION((1.,0.,0.));
#6= IFCAXIS2PLACEMENT3D(#3,#4,#5);
`;
const FUSS = 'ENDSEC;\nEND-ISO-10303-21;\n';

describe('IFC4 mit vollständiger Georeferenz', () => {
    /** Fabios Datei im Kleinen: MapConversion + benanntes CRS. */
    const TEXT = KOPF('IFC4') + `
#7= IFCPROJECTEDCRS('EPSG:25832','UTM Zone 32N','ETRS89',$,'UTM','32N',#1);
#8= IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.0E-5,#6,$);
#9= IFCMAPCONVERSION(#8,#7,2577078.,5465569.,12.5,1.0,0.0,1.0);
` + FUSS;

    let g, mid;
    beforeAll(() => { mid = ausText(TEXT); g = leseGeoreferenz(api, mid); });
    afterAll(() => api.CloseModel(mid));

    it('liest Eastings, Northings und OrthogonalHeight', () => {
        expect(g.kartenbezug.ost).toBe(2577078);
        expect(g.kartenbezug.nord).toBe(5465569);
        expect(g.kartenbezug.hoehe).toBe(12.5);   // ← wird heute nirgends benutzt
    });

    it('liest das benannte Zielsystem samt Zone', () => {
        expect(g.crs.name).toBe('EPSG:25832');
        expect(g.crs.beschreibung).toBe('UTM Zone 32N');
        expect(g.crs.datum).toBe('ETRS89');
        expect(g.crs.zone).toBe('32N');
    });

    it('meldet die höchste Reifestufe', () => {
        expect(g.stufe.wert).toBe(50);
    });

    it('nimmt bei fehlendem TrueNorth die Vorgabe der Norm — und sagt es', () => {
        expect(g.nordrichtung.rad).toBe(0);
        expect(g.nordrichtung.quelle).toBe('vorgabe');
    });
});

describe('Die Drehung kommt aus XAxisAbscissa/Ordinate', () => {
    it('rechnet 30° korrekt aus dem Richtungsvektor', () => {
        // Die Norm: theta = atan2(XAxisOrdinate, XAxisAbscissa).
        const c = Math.cos(Math.PI / 6), s = Math.sin(Math.PI / 6);
        const mid = ausText(KOPF('IFC4') + `
#7= IFCPROJECTEDCRS('EPSG:25832',$,$,$,$,$,#1);
#8= IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.0E-5,#6,$);
#9= IFCMAPCONVERSION(#8,#7,0.,0.,0.,${c},${s},1.0);
` + FUSS);
        const g = leseGeoreferenz(api, mid);
        expect(g.kartenbezug.drehung * 180 / Math.PI).toBeCloseTo(30, 6);
        expect(g.befunde.some(b => /gedreht/.test(b.text))).toBe(true);
        api.CloseModel(mid);
    });
});

describe('IFC2x3 hat GAR KEINE präzise Georeferenz', () => {
    /**
     * Das ist kein Fehler, sondern der Normalfall bei älteren Lieferungen:
     * `IfcMapConversion` und `IfcProjectedCRS` gibt es in 2x3 nicht (an den
     * web-ifc-Schemata gemessen). Die Auskunft muss trotzdem gültig sein.
     */
    it('liefert eine leere, aber brauchbare Auskunft statt zu werfen', () => {
        const mid = ausText(KOPF('IFC2X3') + `
#8= IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.0E-5,#6,$);
` + FUSS);
        const g = leseGeoreferenz(api, mid);
        expect(g.kartenbezug).toBe(null);
        expect(g.crs).toBe(null);
        expect(g.stufe.wert).toBe(0);
        expect(g.nordrichtung).toEqual({ rad: 0, quelle: 'vorgabe' });   // nie null
        expect(g.einheit.faktor).toBe(1);
        api.CloseModel(mid);
    });
});

describe('Einheiten werden GELESEN, nicht angenommen', () => {
    it('erkennt Millimeter und gibt den Faktor', () => {
        const text = KOPF('IFC4').replace(
            '#1= IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);',
            '#1= IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);',
        ) + FUSS;
        const g = leseGeoreferenz(api, ausText(text));
        expect(g.einheit.faktor).toBe(0.001);
        expect(g.einheit.praefix).toBe('MILLI');
        expect(g.befunde.some(b => /MILLIMETRE/.test(b.text))).toBe(true);
    });

    it('sagt es, wenn gar keine Einheit dasteht — statt still Meter zu nehmen', () => {
        const text = KOPF('IFC4')
            .replace('#1= IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);', '')
            .replace('#2= IFCUNITASSIGNMENT((#1));', '') + FUSS;
        const g = leseGeoreferenz(api, ausText(text));
        expect(g.einheit.faktor).toBe(1);
        expect(g.einheit.quelle).toBe('angenommen');
        expect(g.befunde.some(b => /angenommen/.test(b.text))).toBe(true);
    });
});

describe('An einer ECHTEN Datei aus dem Repo', () => {
    /**
     * `BIM26_Gruppe5_BODEN_Erdarbeiten3.ifc` liegt im Test-Ordner und ist von
     * einem fremden Autorensystem: IFC4X3, KEINE MapConversion, dafür ein
     * echtes `TrueNorth`, `IfcSite`-Koordinaten — und **Millimeter**. Genau der
     * Fall „jeder Planer macht seinen eigenen Kram", den man nicht erfinden
     * kann, weil man ihn sich nicht ausdenkt.
     */
    const datei = path.join(hier, 'BIM26_Gruppe5_BODEN_Erdarbeiten3.ifc');
    const da = fs.existsSync(datei);

    it.skipIf(!da)('liest Einheit und Nordrichtung aus der Datei', () => {
        const mid = api.OpenModel(new Uint8Array(fs.readFileSync(datei)));
        const g = leseGeoreferenz(api, mid);

        expect(g.einheit.faktor).toBe(0.001);          // Millimeter!
        expect(g.einheit.quelle).toBe('IfcSIUnit');
        expect(g.nordrichtung.quelle).toBe('TrueNorth');
        expect(g.kartenbezug).toBe(null);              // keine MapConversion
        expect(g.stufe.wert).toBeLessThan(40);
        api.CloseModel(mid);
    }, 60_000);
});
