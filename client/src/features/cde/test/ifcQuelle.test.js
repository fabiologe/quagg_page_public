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
        // Dritter Eintrag: eine Kategorie, die diese Datei WIRKLICH führt und
        // die der alte, fest verdrahtete Elementindex nicht kannte.
        ['BIM26_Gruppe5_BODEN_Erdarbeiten3.ifc', 'IFC4X3_ADD2', 'IFCEARTHWORKSELEMENT'],
        // Die ProVI-Datei führt NUR Typen, die die alte Liste kannte — sie war
        // trotzdem unsichtbar, aus dem anderen der beiden Gründe (der Handle
        // hatte nie ein Modell offen). Deshalb hier kein neuer Typ.
        ['IFCOUT_Entwässerung Export .IFC', 'IFC2X3', null],
    ];

    for (const [name, schema, neuerTyp] of FAELLE) {
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

            it('nennt Kategorien beim NAMEN, nicht mit der Typkonstante', () => {
                // `GetLine(...).type` ist eine ZAHL (`1077100507`), nicht
                // `IFCEARTHWORKSELEMENT`. Wer sie roh als Kategorie
                // weiterreicht, sucht in Typprofilen, Bauformregeln und im
                // 4.3-Wörterbuch nach einer Ziffernfolge — kein Treffer, keine
                // Meldung, und von aussen sieht es aus, als kenne die CDE die
                // Typen dieser Datei nicht. Genau so lag es einen Nachmittag
                // lang in zwei frisch gebauten Lesern.
                //
                // Der erste Anlauf dieses Tests prüfte nur „es kommt etwas
                // Neues gegenüber der alten 30er-Liste heraus" — und war mit
                // Ziffernfolgen fröhlich grün. Deshalb steht hier die FORM.
                const ids = q.ids('IFCPRODUCT', { untertypen: true });
                expect(ids.length).toBeGreaterThan(0);
                for (const id of ids) {
                    const k = q.kategorieVon(id);
                    expect(k, `ExpressID ${id}`).toMatch(/^IFC[A-Z0-9]+$/);
                }
                // Und die Umkehrung trifft wirklich zurück auf die Konstante.
                const eine = q.kategorieVon(ids[0]);
                expect(q.ids(eine)).toContain(ids[0]);
            });

            it('erfasst Typen, die die alte 30er-Liste NICHT kannte', () => {
                // Der Elementindex speiste sich bis 2026-09-03 aus 30 fest
                // verdrahteten Kategorien — `IFCCIVILELEMENT` und die
                // Erdbau-Typen standen nicht darin. Ausgerechnet die Bauteile,
                // für die man das Zuordnungs-Panel braucht, waren dort
                // unsichtbar. (Dass der Index ohnehin immer leer war, kam als
                // zweiter, unabhängiger Grund dazu.)
                const ALTE_LISTE = new Set([
                    'IFCWALL', 'IFCWALLSTANDARDCASE', 'IFCSLAB', 'IFCCOLUMN', 'IFCBEAM',
                    'IFCDOOR', 'IFCWINDOW', 'IFCROOF', 'IFCFOOTING', 'IFCSTAIR', 'IFCSTAIRFLIGHT',
                    'IFCPLATE', 'IFCMEMBER', 'IFCSPACE', 'IFCBUILDINGSTOREY', 'IFCBUILDING', 'IFCSITE',
                    'IFCPIPESEGMENT', 'IFCPIPEFITTING', 'IFCDUCT', 'IFCDUCTFITTING',
                    'IFCFLOWSEGMENT', 'IFCFLOWFITTING', 'IFCFLOWTERMINAL', 'IFCAIRTERMINAL',
                    'IFCPUMP', 'IFCVALVE', 'IFCFURNITURE', 'IFCBUILDINGELEMENTPROXY',
                    'IFCRAILING', 'IFCCURTAINWALL',
                ]);
                const kategorien = new Set(
                    q.ids('IFCPRODUCT', { untertypen: true })
                        .map(id => q.kategorieVon(id))
                        .filter(Boolean),
                );
                expect(kategorien.size).toBeGreaterThan(0);
                if (neuerTyp) {
                    // Der harte Fall: dieser Typ steht in der Datei, stand
                    // aber nicht in der 30er-Liste — er war unsichtbar, und
                    // ausgerechnet für ihn braucht man die Zuordnung.
                    expect(ALTE_LISTE.has(neuerTyp)).toBe(false);
                    expect(kategorien).toContain(neuerTyp);
                } else {
                    // Die Gegenprobe: hier deckte die alte Liste alles ab. Der
                    // Index war trotzdem leer — aus dem zweiten, unabhängigen
                    // Grund. Eine längere Liste hätte diese Datei nicht
                    // gerettet.
                    expect([...kategorien].every(k => ALTE_LISTE.has(k))).toBe(true);
                }
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

describe('platzierungsHoehen — die Rohhöhe aus der DATEI', () => {
    /**
     * Wozu: Der Ladeversatz aus `-model.object.position` liefert x und z
     * richtig, y aber 0 — obwohl die Geometrie in der Höhe verschoben ist.
     * Zwei Mechanismen wirken übereinander (`COORDINATE_TO_ORIGIN` backt die
     * Höhe in die Scheitelpunkte, `autoCoordinate` setzt die Objektlage aus
     * der MapConversion mit OrthogonalHeight 0), und nur einer landet dort.
     *
     * Statt nachzubauen, was die Bibliothek tut, wird gemessen: dieselbe
     * Platzierung aus der Datei und aus den Fragmenten, Differenz = Versatz.
     * Diese Datei liefert die eine Hälfte davon.
     */
    const datei = path.join(hier, 'BIM26_Gruppe5_BODEN_Erdarbeiten3.ifc');
    const da = fs.existsSync(datei);

    it.skipIf(!da)('summiert die Platzierungskette auf', async () => {
        const q = await ausDatei(datei);
        const hoehen = q.platzierungsHoehen();
        expect(hoehen.size).toBeGreaterThan(0);
        for (const z of hoehen.values()) expect(Number.isFinite(z)).toBe(true);
    }, 120_000);

    it.skipIf(!da)('liefert nur für die angefragten Bauteile etwas', async () => {
        const q = await ausDatei(datei);
        const ids = q.ids('IFCELEMENT', { untertypen: true }).slice(0, 3);
        const hoehen = q.platzierungsHoehen(ids);
        expect([...hoehen.keys()].every(id => ids.includes(id))).toBe(true);
    }, 120_000);

    it('gibt bei totem Handle eine leere Karte, statt zu werfen', async () => {
        if (!da) return;
        const q = await IfcQuelle.oeffne(WebIFC, new Uint8Array(fs.readFileSync(datei)), WASM);
        q.schliesse();
        expect(q.platzierungsHoehen()).toEqual(new Map());
    }, 120_000);
});
