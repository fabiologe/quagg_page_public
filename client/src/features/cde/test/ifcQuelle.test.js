// @vitest-environment node
/**
 * IfcQuelle (Stufe 13.1) — der lebende Lesezugriff auf die IFC-Datei.
 *
 * DIE VORGESCHICHTE, weil sie erklärt, warum `lebt()` überhaupt existiert:
 * Die CDE las bisher über `ifcLoader.webIfc`. Dieser Handle hat NIE ein Modell
 * offen und ist nicht einmal initialisiert — nur `IfcLoader.readIfcFile()`
 * öffnet eines, und die CDE ruft das nirgends. Alles, was darauf gebaut war,
 * lief still ins Leere; und ein Zugriff darauf im Renderpfad hat einmal den
 * ganzen Viewer gekostet.
 *
 * Deshalb prüft dieser Test nicht, ob ein Objekt entsteht — das entstand
 * vorher auch. Er prüft, ob ein LESEZUGRIFF etwas liefert, und zwar an echten
 * Dateien aus dem Repo.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { IfcQuelle, mitUntertypen } from '../services/IfcQuelle.js';
import { typKonstante } from '../services/WebIfcTypen.js';

const hier = path.dirname(fileURLToPath(import.meta.url));
const wurzel = path.resolve(hier, '../../../../');
const require = createRequire(import.meta.url);
const WASM = { wasmPfad: path.join(wurzel, 'node_modules/web-ifc/'), absolut: true };

let WebIFC;
const offen = [];
beforeAll(() => { WebIFC = require('web-ifc'); });
afterAll(() => { for (const q of offen) q?.schliesse(); });

async function ausDatei(pfad) {
    const q = await IfcQuelle.oeffne(WebIFC, new Uint8Array(fs.readFileSync(pfad)), WASM);
    offen.push(q);
    return q;
}

describe('Untertypen kommen aus der IFC-Vererbung, nicht aus einer Liste', () => {
    /**
     * Der Kern der Skalierbarkeit. `buildSearchIndex` verdrahtet 30 Kategorien
     * fest, und `GlobalIdKarte.js:9-15` nennt das selbst als Schwäche: ein
     * Bauteil ausserhalb der Liste verliert seine Festlegung stillschweigend.
     * Hier wird stattdessen der Baum aus `data/entity-schema.js` gelaufen.
     */
    it('findet die Fliessabschnitte unter IFCFLOWSEGMENT', () => {
        const u = mitUntertypen('IFCFLOWSEGMENT');
        expect(u).toContain('IFCFLOWSEGMENT');        // er selbst gehört dazu
        expect(u).toContain('IFCPIPESEGMENT');
        expect(u).toContain('IFCDUCTSEGMENT');
        expect(u).toContain('IFCCABLESEGMENT');
    });

    it('deckt mit IFCELEMENT den ganzen Bauteil-Ast ab', () => {
        expect(mitUntertypen('IFCELEMENT').length).toBeGreaterThan(900);
    });

    it('gibt für einen erfundenen Typ eine leere Liste, nicht den nächstbesten', () => {
        expect(mitUntertypen('IFCGIBTSNICHT')).toEqual([]);
        expect(mitUntertypen('')).toEqual([]);
    });
});

describe('An echten Dateien aus dem Repo', () => {
    const FAELLE = [
        ['BIM26_Gruppe5_BODEN_Erdarbeiten3.ifc', 'IFC4X3_ADD2'],
        ['IFCOUT_Entwässerung Export .IFC', 'IFC2X3'],
    ];

    for (const [name, schema] of FAELLE) {
        const datei = path.join(hier, name);
        const da = fs.existsSync(datei);

        describe.skipIf(!da)(name, () => {
            // EINMAL öffnen und wiederverwenden: die ProVI-Datei ist 9 MB, und
            // dreimal öffnen kostete 50 s Testlaufzeit für nichts.
            let q;
            beforeAll(async () => { q = await ausDatei(datei); }, 120_000);

            it('lebt — und das wird bewiesen, nicht behauptet', () => {
                expect(q, 'Quelle').not.toBe(null);
                expect(q.lebt()).toBe(true);
                expect(q.schema()).toBe(schema);
                // `lebt()` prüft auf IFCPROJECT: jede gültige Datei hat eines.
                expect(q.zaehle('IFCPROJECT')).toBeGreaterThan(0);
            });

            it('liest über die Vererbung', () => {
                const alle = q.ids('IFCELEMENT', { untertypen: true });
                expect(alle.length).toBeGreaterThan(0);
                // Dieselbe Abfrage OHNE Vererbung findet weniger — `IFCELEMENT`
                // selbst wird kaum je instanziiert. Das ist der ganze Punkt.
                expect(q.ids('IFCELEMENT').length).toBeLessThan(alle.length);
            });

            it('findet über die GlobalId zurück', () => {
                const id = q.ids('IFCELEMENT', { untertypen: true })[0];
                const guid = q.zeile(id)?.GlobalId?.value;
                expect(guid, 'GlobalId').toBeTruthy();
                expect(q.nachGlobalId(guid)).toBe(id);
                expect(q.nachGlobalId('gibtsnicht')).toBe(null);
            });
        });
    }
});

describe('Der Handle ist ehrlich über seinen Zustand', () => {
    it('gibt NULL statt eines halben Handles, wenn die Bytes nichts taugen', async () => {
        // Ein Handle, der aussieht wie einer und keiner ist, hat uns den
        // Viewer gekostet. Lieber gar keiner.
        expect(await IfcQuelle.oeffne(WebIFC, new TextEncoder().encode('kein IFC'), WASM)).toBe(null);
        expect(await IfcQuelle.oeffne(WebIFC, new Uint8Array(0), WASM)).toBe(null);
        expect(await IfcQuelle.oeffne(null, new Uint8Array([1]), WASM)).toBe(null);
    }, 120_000);

    it('meldet nach schliesse() ehrlich, dass er tot ist', async () => {
        const datei = path.join(hier, 'BIM26_Gruppe5_BODEN_Erdarbeiten3.ifc');
        if (!fs.existsSync(datei)) return;
        const q = await IfcQuelle.oeffne(WebIFC, new Uint8Array(fs.readFileSync(datei)), WASM);
        expect(q.lebt()).toBe(true);
        q.schliesse();

        // Und ALLE Leser antworten danach leer, statt zu werfen — ein toter
        // Handle darf keinen Aufrufer mitreissen.
        expect(q.lebt()).toBe(false);
        expect(q.ids('IFCELEMENT', { untertypen: true })).toEqual([]);
        expect(q.zeile(1)).toBe(null);
        expect(q.alle('IFCPROJECT')).toEqual([]);
        expect(q.nachGlobalId('x')).toBe(null);
        expect(() => q.schliesse()).not.toThrow();     // zweimal schliessen ist erlaubt
    }, 120_000);
});

describe('typKonstante loest am MODUL auf, nicht an der Instanz', () => {
    /**
     * Der Fehler, der `extractAxisPolylines` mit-erledigt hat: die
     * Typkonstanten (`IFCPIPESEGMENT = 3612865200`) sind MODUL-Exporte von
     * web-ifc, keine Eigenschaften der `IfcAPI`-Instanz. Und das Modul wird
     * HEREINGEREICHT statt importiert — ein statischer `import 'web-ifc'` in
     * Anwendungscode zöge die Bibliothek in den Auswertungspfad jedes Moduls,
     * das ihn erbt.
     */
    it('findet eine echte Konstante im Modul', () => {
        expect(typKonstante(WebIFC, 'IFCPIPESEGMENT')).toBeGreaterThan(0);
        expect(typKonstante(WebIFC, 'ifcpipesegment')).toBeGreaterThan(0);   // Schreibweise egal
    });

    it('gibt null ohne Modul — statt still etwas zu erfinden', () => {
        expect(typKonstante(null, 'IFCPIPESEGMENT')).toBe(null);
        expect(typKonstante({}, 'IFCPIPESEGMENT')).toBe(null);
    });

    it('gibt null für einen Typ, den es in keiner Fassung gibt', () => {
        // `null` heisst „kennt diese Fassung nicht" — bei IFCMAPCONVERSION in
        // einem IFC2x3-Modell ist das der Normalfall, kein Fehler.
        expect(typKonstante(WebIFC, 'IFCGIBTSNICHT')).toBe(null);
        expect(typKonstante(WebIFC, '')).toBe(null);
    });

    it('kommt mit der CJS-Interop-Form zurecht', () => {
        // Unter node/vitest kann ein Modul als `{default: {...}}` ankommen —
        // dieselbe Falle, die den vite-Build bei `polygon-clipping` gekostet hat.
        expect(typKonstante({ default: { IFCWALL: 4242 } }, 'IFCWALL')).toBe(4242);
    });
});
