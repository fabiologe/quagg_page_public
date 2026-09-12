/**
 * Import-Befund (Fahrplan IFC-Konsistenz, Stufe 4c): der Client SAGT, was er
 * beim Laden weiss — Schema, abgekündigte und fremde Klassen, Proxy-Anteil,
 * fehlende Lesequelle. Er urteilt nicht; das tut das Prüftor im Backend.
 *
 * Drei Ebenen, jede an der echten Schnittstelle:
 *   1. der reine Dienst mit gebauten Fällen,
 *   2. der Weg durch die Engine an echten Dateien (IfcQuelle, web-ifc im Test),
 *   3. der Fehlerfall: eine Quelle, die nicht aufging, steht MIT Grund da —
 *      vorher war das ein console.warn.
 * Dazu der Wächter, dass der Ladeweg den Kopf prüft, BEVOR er lädt.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { importBefund, zaehltAlsBauteil, PROXY_ANTEIL } from '../services/ImportBefund.js';
import { IfcQuelle } from '../services/IfcQuelle.js';
import { IfcEngine } from '../services/IfcEngine.js';

const hier = path.dirname(fileURLToPath(import.meta.url));
const wurzel = path.resolve(hier, '../../../../');
const require = createRequire(import.meta.url);
const WASM = { wasmPfad: path.join(wurzel, 'node_modules/web-ifc/'), absolut: true };

describe('Der reine Dienst bewertet, was die Engine zählt', () => {
    it('meldet ein älteres Schema, fremde, verwaiste und abgekündigte Klassen', () => {
        const b = importBefund({
            schema: 'IFC2X3',
            typen: [
                { typ: 'IFCCIVILELEMENT', anzahl: 1 },
                { typ: 'IFCBEAMSTANDARDCASE', anzahl: 2 },
                { typ: 'IFCQUATSCH', anzahl: 3 },
                { typ: 'IFCWALL', anzahl: 4 },
            ],
        });
        expect(b.bauteile).toBe(10);
        expect(b.abgekuendigt).toEqual([{ typ: 'IFCCIVILELEMENT', anzahl: 1 }]);
        expect(b.waisen).toEqual([{ typ: 'IFCBEAMSTANDARDCASE', anzahl: 2, nachfolger: 'IfcBeam' }]);
        expect(b.unbekannt).toEqual([{ typ: 'IFCQUATSCH', anzahl: 3 }]);
        const text = b.texte.map(t => t.text).join('\n');
        expect(text).toMatch(/Schema IFC2X3/);
        expect(text).toMatch(/3 × IFCQUATSCH — in keinem IFC-Schema/);
        expect(text).toMatch(/2 × IfcBeamStandardCase — nur in älteren Schemata/);
        expect(b.texte.find(t => /keinem IFC-Schema/.test(t.text)).schwere).toBe('warnung');
    });

    it('rät zur Zuordnung erst ab dem Proxy-Anteil', () => {
        const knapp = importBefund({ typen: [{ typ: 'IFCBUILDINGELEMENTPROXY', anzahl: 1 }, { typ: 'IFCWALL', anzahl: 2 }] });
        expect(knapp.texte.some(t => /Proxys/.test(t.text))).toBe(false);
        const viele = importBefund({ typen: [{ typ: 'IFCBUILDINGELEMENTPROXY', anzahl: 3 }, { typ: 'IFCWALL', anzahl: 1 }] });
        expect(viele.proxy / viele.bauteile).toBeGreaterThanOrEqual(PROXY_ANTEIL);
        expect(viele.texte.some(t => /3 von 4 Bauteilen sind Proxys/.test(t.text))).toBe(true);
    });

    it('zählt Bauteile und Unbekanntes, nicht Geometrie', () => {
        expect(zaehltAlsBauteil('IFCPIPESEGMENT')).toBe(true);
        expect(zaehltAlsBauteil('IFCQUATSCH')).toBe(true);
        expect(zaehltAlsBauteil('IFCCARTESIANPOINT')).toBe(false);
        expect(zaehltAlsBauteil('IFCSITE')).toBe(false);
    });
});

describe('Durch die Engine an echten Dateien', () => {
    let WebIFC;
    const offen = [];
    beforeAll(() => { WebIFC = require('web-ifc'); });
    afterAll(() => { for (const q of offen) q?.schliesse(); });

    async function engineMit(dateien) {
        const e = Object.create(IfcEngine.prototype);
        e._quellen = new Map();
        for (const d of dateien) {
            const q = await IfcQuelle.oeffne(WebIFC, new Uint8Array(fs.readFileSync(path.join(hier, d))), WASM);
            expect(q, d).not.toBe(null);
            offen.push(q);
            e._quellen.set(d, q);
        }
        return e;
    }

    it('eine IFC2X3-Lieferung aus Proxys und eine 4.3-Lieferung — je Modell ein Befund', async () => {
        const PROVI = 'IFCOUT_Entwässerung Export .IFC';
        const BODEN = 'BIM26_Gruppe5_BODEN_Erdarbeiten3.ifc';
        const e = await engineMit([PROVI, BODEN]);
        const alle = e.importBefunde();
        expect(Object.keys(alle).sort()).toEqual([BODEN, PROVI].sort());

        const provi = alle[PROVI];
        expect(provi.schema).toBe('IFC2X3');
        expect(provi.quelle).toBe('ok');
        expect(provi.proxy).toBe(e._quellen.get(PROVI).zaehle('IFCBUILDINGELEMENTPROXY'));
        expect(provi.proxy).toBeGreaterThan(0);
        expect(provi.texte.some(t => /Schema IFC2X3/.test(t.text))).toBe(true);
        if (provi.proxy / provi.bauteile >= PROXY_ANTEIL) {
            expect(provi.texte.some(t => /Proxys/.test(t.text))).toBe(true);
        }

        const boden = alle[BODEN];
        expect(boden.schema).toBe('IFC4X3_ADD2');
        expect(boden.bauteile).toBeGreaterThan(0);
        expect(boden.texte.some(t => /Schema/.test(t.text))).toBe(false);
    }, 120_000);

    it('eine Quelle, die nicht aufging, steht MIT Grund da', () => {
        const e = Object.create(IfcEngine.prototype);
        e._quellen = new Map();
        e._quelleFehlt('kaputt.ifc', 'OpenModel gab keine Kennung');
        const b = e.importBefunde()['kaputt.ifc'];
        expect(b.quelle).toBe('fehlt');
        expect(b.texte[0]).toMatchObject({ schwere: 'warnung' });
        expect(b.texte[0].text).toMatch(/OpenModel gab keine Kennung/);
    });
});

describe('Der Ladeweg prüft den Kopf, BEVOR er lädt', () => {
    it('kopfAblehnung steht in _ladeBytes vor engine.loadIfc', () => {
        const quelle = fs.readFileSync(path.join(hier, '../composables/useModellAblage.js'), 'utf8');
        const rumpf = quelle.slice(quelle.indexOf('async function _ladeBytes('));
        const pruefung = rumpf.indexOf('kopfAblehnung(bytes, name)');
        const laden = rumpf.indexOf('engine.value.loadIfc(');
        expect(pruefung).toBeGreaterThan(0);
        expect(laden).toBeGreaterThan(pruefung);
    });
});
