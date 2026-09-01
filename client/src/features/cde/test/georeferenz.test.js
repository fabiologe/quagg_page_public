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
import { IfcQuelle } from '../services/IfcQuelle.js';

const hier = path.dirname(fileURLToPath(import.meta.url));
const wurzel = path.resolve(hier, '../../../../');      // client/
const require = createRequire(import.meta.url);

let WebIFC;
const offen = [];
beforeAll(() => { WebIFC = require('web-ifc'); });
afterAll(() => { for (const q of offen) q?.schliesse(); });

/**
 * Eine QUELLE aus IFC-Text — echter Parser, echter Handle.
 *
 * Bewusst über `IfcQuelle.oeffne`, nicht über eine eigene `IfcAPI`: so prüft
 * jeder Test nebenbei mit, dass der Handle wirklich lebt. Genau dieser
 * Nachweis hat gefehlt, als der Leser auf `ifcLoader.webIfc` gebaut war — ein
 * Handle ohne Modell.
 */
async function quelleAusText(text) {
    const q = await IfcQuelle.oeffne(WebIFC, new TextEncoder().encode(text),
                                     { wasmPfad: path.join(wurzel, 'node_modules/web-ifc/'), absolut: true });
    offen.push(q);
    return q;
}
async function quelleAusDatei(pfad) {
    const q = await IfcQuelle.oeffne(WebIFC, new Uint8Array(fs.readFileSync(pfad)),
                                     { wasmPfad: path.join(wurzel, 'node_modules/web-ifc/'), absolut: true });
    offen.push(q);
    return q;
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
#10= IFCPERSON($,'T',$,$,$,$,$,$);
#11= IFCORGANIZATION($,'Q',$,$,$);
#12= IFCPERSONANDORGANIZATION(#10,#11,$);
#13= IFCAPPLICATION(#11,'1','T','T');
#14= IFCOWNERHISTORY(#12,#13,$,.ADDED.,0,$,$,0);
`;
/**
 * Das IFCPROJECT steht bewusst am Ende, NACH dem Kontext — es verweist auf ihn.
 * Und es muss da sein: `IfcQuelle.lebt()` prüft darauf, weil jede gültige
 * IFC-Datei genau eines hat. Eine Fixture ohne Projekt ist keine IFC-Datei,
 * und der Handle weist sie zu Recht ab.
 */
const PROJEKT = (ctx) => `#99= IFCPROJECT('0000000000000000000001',#14,'T',$,$,$,$,(#${ctx}),#2);\n`;
const FUSS = 'ENDSEC;\nEND-ISO-10303-21;\n';

describe('IFC4 mit vollständiger Georeferenz', () => {
    /** Fabios Datei im Kleinen: MapConversion + benanntes CRS. */
    const TEXT = KOPF('IFC4') + `
#7= IFCPROJECTEDCRS('EPSG:25832','UTM Zone 32N','ETRS89',$,'UTM','32N',#1);
#8= IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.0E-5,#6,$);
#9= IFCMAPCONVERSION(#8,#7,2577078.,5465569.,12.5,1.0,0.0,1.0);
` + PROJEKT(8) + FUSS;

    let g;
    beforeAll(async () => { g = leseGeoreferenz(await quelleAusText(TEXT)); }, 60_000);

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
    it('rechnet 30° korrekt aus dem Richtungsvektor', async () => {
        // Die Norm: theta = atan2(XAxisOrdinate, XAxisAbscissa).
        const c = Math.cos(Math.PI / 6), s = Math.sin(Math.PI / 6);
        const g = leseGeoreferenz(await quelleAusText(KOPF('IFC4') + `
#7= IFCPROJECTEDCRS('EPSG:25832',$,$,$,$,$,#1);
#8= IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.0E-5,#6,$);
#9= IFCMAPCONVERSION(#8,#7,0.,0.,0.,${c},${s},1.0);
` + PROJEKT(8) + FUSS));
        expect(g.kartenbezug.drehung * 180 / Math.PI).toBeCloseTo(30, 6);
        expect(g.befunde.some(b => /gedreht/.test(b.text))).toBe(true);
    }, 60_000);
});

describe('IFC2x3 hat GAR KEINE präzise Georeferenz', () => {
    /**
     * Das ist kein Fehler, sondern der Normalfall bei älteren Lieferungen:
     * `IfcMapConversion` und `IfcProjectedCRS` gibt es in 2x3 nicht (an den
     * web-ifc-Schemata gemessen). Die Auskunft muss trotzdem gültig sein.
     */
    it('liefert eine leere, aber brauchbare Auskunft statt zu werfen', async () => {
        const g = leseGeoreferenz(await quelleAusText(KOPF('IFC2X3') + `
#8= IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.0E-5,#6,$);
` + PROJEKT(8) + FUSS));
        expect(g.kartenbezug).toBe(null);
        expect(g.crs).toBe(null);
        expect(g.stufe.wert).toBe(0);
        expect(g.nordrichtung).toEqual({ rad: 0, quelle: 'vorgabe' });   // nie null
        expect(g.einheit.faktor).toBe(1);
    }, 60_000);
});

describe('Einheiten werden GELESEN, nicht angenommen', () => {
    it('erkennt Millimeter und gibt den Faktor', async () => {
        const text = KOPF('IFC4').replace(
            '#1= IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);',
            '#1= IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);',
        ) + `#8= IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.0E-5,#6,$);\n` + PROJEKT(8) + FUSS;
        const g = leseGeoreferenz(await quelleAusText(text));
        expect(g.einheit.faktor).toBe(0.001);
        expect(g.einheit.praefix).toBe('MILLI');
        expect(g.befunde.some(b => /MILLIMETRE/.test(b.text))).toBe(true);
    }, 60_000);

    it('sagt es, wenn gar keine Einheit dasteht — statt still Meter zu nehmen', async () => {
        const text = KOPF('IFC4')
            .replace('#1= IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);', '')
            .replace('#2= IFCUNITASSIGNMENT((#1));', '')
            + `#8= IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.0E-5,#6,$);\n` + PROJEKT(8) + FUSS;
        const g = leseGeoreferenz(await quelleAusText(text));
        expect(g.einheit.faktor).toBe(1);
        expect(g.einheit.quelle).toBe('angenommen');
        expect(g.befunde.some(b => /angenommen/.test(b.text))).toBe(true);
    }, 60_000);
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

    it.skipIf(!da)('liest Einheit und Nordrichtung aus der Datei', async () => {
        const g = leseGeoreferenz(await quelleAusDatei(datei));

        expect(g.einheit.faktor).toBe(0.001);          // Millimeter!
        expect(g.einheit.quelle).toBe('IfcSIUnit');
        expect(g.nordrichtung.quelle).toBe('TrueNorth');
        expect(g.kartenbezug).toBe(null);              // keine MapConversion
        expect(g.stufe.wert).toBeLessThan(40);
    }, 60_000);
});
