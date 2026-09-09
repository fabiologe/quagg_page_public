// @vitest-environment node
/**
 * Modelleinheiten → Meter, an den ECHTEN Dateien (2026-09-03).
 *
 * Der Befund, der das nötig machte, ist selbst eine Messung: web-ifc gibt
 * Geometrie in Modelleinheiten zurück, und `@thatopen/fragments` skaliert nur
 * `Elevation`/`RefElevation`, nie Geometrie. Die MILLI-Datei kam als 450 KM
 * breites Gelände in der CDE an.
 *
 * Diese Datei prüft deshalb nicht, ob eine Funktion etwas zurückgibt, sondern
 * ob die HÜLLE danach stimmt — an derselben Datei, an der der Fehler auffiel.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import {
    LAENGENMASS, besucheMasse, huellenSpanne, inMeterUmrechnen,
    masseZaehlen, skaliereZeile,
} from '../services/Einheiten.js';

const hier = path.dirname(fileURLToPath(import.meta.url));
const wurzel = path.resolve(hier, '../../../../');
const require = createRequire(import.meta.url);
const WASM = { wasmPfad: path.join(wurzel, 'node_modules/web-ifc/'), absolut: true };

const MILLI = 'BIM26_Gruppe5_BODEN_Erdarbeiten3.ifc';
const METER = 'BIM26_Gruppe5_BODEN_Erdarbeiten.ifc';

let WebIFC;
/**
 * EINE wasm-Instanz für die ganze Datei — dieselbe Rechnung wie in
 * `IfcQuelle`: `Init()` kostet spürbar, und eine `IfcAPI` hält mehrere
 * Modelle. Ohne sie fuhr dieser Test elf Instanzen hoch.
 */
let API;
beforeAll(async () => {
    WebIFC = require('web-ifc');
    API = new WebIFC.IfcAPI();
    API.SetWasmPath(WASM.wasmPfad, true);
    await API.Init();
}, 180_000);

const lies = (n) => new Uint8Array(fs.readFileSync(path.join(hier, n)));
const da = (n) => fs.existsSync(path.join(hier, n));

/** Ein Messwert in der Form, die web-ifc liefert. */
const mass = (name, value) => ({ type: 4, value, name });

describe('Das Schema sagt selbst, welche Zahl eine Länge ist', () => {
    it('findet Messwerte in Listen und in Listen von Listen', () => {
        const punkt = { expressID: 9, type: 1123145078, Coordinates: [
            mass('IFCLENGTHMEASURE', 1), mass('IFCLENGTHMEASURE', 2), mass('IFCLENGTHMEASURE', 3),
        ] };
        expect(masseZaehlen(punkt).get('IFCLENGTHMEASURE')).toBe(3);

        const gesehen = [];
        besucheMasse({ a: [[mass('IFCLENGTHMEASURE', 7)]] }, (v) => gesehen.push(v.value));
        expect(gesehen).toEqual([7]);
    });

    it('folgt REFERENZEN nicht — sonst liefe es im Kreis', () => {
        // `{value, type: 5}` ohne `name` ist ein Verweis auf eine andere Zeile,
        // kein Messwert. Ihn als Länge zu behandeln skalierte eine ExpressID.
        const zeile = { expressID: 1, type: 2, RefDirection: { value: 11, type: 5 } };
        expect(masseZaehlen(zeile).size).toBe(0);
        expect(skaliereZeile(zeile, 0.001)).toBe(false);
        expect(zeile.RefDirection.value).toBe(11);
    });

    it('skaliert Längen linear, Flächen quadratisch, Volumen kubisch', () => {
        const z = {
            l: mass('IFCLENGTHMEASURE', 1000),
            p: mass('IFCPOSITIVELENGTHMEASURE', 500),
            a: mass('IFCAREAMEASURE', 1e6),
            v: mass('IFCVOLUMEMEASURE', 1e9),
        };
        expect(skaliereZeile(z, 0.001)).toBe(true);
        expect(z.l.value).toBeCloseTo(1, 9);
        expect(z.p.value).toBeCloseTo(0.5, 9);
        expect(z.a.value).toBeCloseTo(1, 6);
        expect(z.v.value).toBeCloseTo(1, 6);
    });

    it('lässt dimensionslose Masse in Ruhe', () => {
        // `IfcNormalisedRatioMeasure` kommt in beiden Testdateien vor (Farbanteile).
        // Ein Farbanteil × 0,001 wäre ein schwarzes Modell.
        const z = { f: mass('IFCNORMALISEDRATIOMEASURE', 0.8), w: mass('IFCPLANEANGLEMEASURE', 1.57) };
        expect(skaliereZeile(z, 0.001)).toBe(false);
        expect(z.f.value).toBe(0.8);
        expect(z.w.value).toBeCloseTo(1.57, 9);
    });

    it('erkennt alle drei Längen-Ausprägungen über das Suffix', () => {
        for (const n of ['IFCLENGTHMEASURE', 'IFCPOSITIVELENGTHMEASURE', 'IFCNONNEGATIVELENGTHMEASURE']) {
            expect(LAENGENMASS.test(n), n).toBe(true);
        }
        for (const n of ['IFCNORMALISEDRATIOMEASURE', 'IFCPLANEANGLEMEASURE', 'IFCCOUNTMEASURE']) {
            expect(LAENGENMASS.test(n), n).toBe(false);
        }
    });
});

describe.skipIf(!da(MILLI))(`An der echten MILLI-Datei (${MILLI})`, () => {
    it('DER BEFUND: das Gelände misst roh 450.000 Einheiten, nicht 450', async () => {
        // Die Messung, die den ganzen Umbau ausgelöst hat. Steht hier, damit
        // niemand sie noch einmal von Hand machen muss — und damit auffällt,
        // wenn eine neue Bibliotheksfassung doch selbst skaliert.
        const m = API.OpenModel(lies(MILLI));
        const spanne = huellenSpanne(API, m);
        API.CloseModel(m);
        expect(spanne[0]).toBeGreaterThan(100_000);      // ≈ 449.750 mm
        expect(spanne[0]).toBeLessThan(1_000_000);
    }, 180_000);

    it('rechnet um — und die Hülle stimmt danach relativ auf 1e-5 genau', async () => {
        const { bytes, bericht, grund } = await inMeterUmrechnen(WebIFC, lies(MILLI), { faktor: 0.001, api: API });
        expect(grund ?? null, 'Grund').toBe(null);
        expect(bytes).toBeInstanceOf(Uint8Array);

        // Die GEGENPROBE ist der Kern: nicht „es kam etwas zurück", sondern
        // die Hülle ist exakt um den Faktor kleiner. Ein Konverter, der die
        // Hälfte der Werte erwischt, fiele genau hier auf.
        //
        // RELATIV geprüft, nicht absolut: web-ifc liefert Float32-Scheitel, und
        // bei 585.041 Einheiten Spanne ist die Auflösung ~0,06. `toBeCloseTo`
        // mit sechs Stellen prüfte die Fliesskommabreite, nicht die Umrechnung
        // — mein erster Anlauf fiel genau darüber.
        for (let k = 0; k < 3; k++) {
            const erwartet = bericht.vorher[k] * 0.001;
            expect(Math.abs(bericht.nachher[k] - erwartet) / erwartet, `Achse ${k}`).toBeLessThan(1e-5);
        }
        expect(bericht.nachher[0]).toBeGreaterThan(100);   // ≈ 449,75 m
        expect(bericht.nachher[0]).toBeLessThan(1000);
        expect(bericht.zeilen).toBeGreaterThan(1000);
        expect(bericht.masse).toBeGreaterThan(10_000);
    }, 180_000);

    it('setzt die EINHEIT mit — sonst rechnet der Nächste ein zweites Mal', async () => {
        // Bliebe `.MILLI.` stehen, sagte die Datei „Millimeter" und meinte
        // Meter. Die mm-Wache sperrte weiter, und der `Elevation`-Faktor von
        // fragments skalierte ein zweites Mal. Richtig aussehend und falsch.
        const { bytes, bericht } = await inMeterUmrechnen(WebIFC, lies(MILLI), { faktor: 0.001, api: API });
        expect(bericht.einheiten).toBeGreaterThan(0);
        const text = new TextDecoder().decode(bytes);
        expect(text).not.toMatch(/IFCSIUNIT\([^)]*LENGTHUNIT[^)]*\.MILLI\./i);
        expect(text).toMatch(/IFCSIUNIT\([^)]*LENGTHUNIT[^)]*METRE/i);
    }, 180_000);

    it('ist IDEMPOTENT — zweimal umrechnen ändert nichts mehr', async () => {
        // Der Fall passiert wirklich: Modell umrechnen, entladen, neu laden.
        // Wer dann noch einmal skalierte, hätte ein 45-Zentimeter-Gelände.
        const erst = await inMeterUmrechnen(WebIFC, lies(MILLI), { faktor: 0.001, api: API });
        // Nach dem ersten Lauf steht in der Datei METRE — der Aufrufer liest
        // die Einheit neu und bekommt Faktor 1.
        const zweit = await inMeterUmrechnen(WebIFC, erst.bytes, { faktor: 1, api: API });
        expect(zweit.bericht.unveraendert).toBe(true);
        expect(zweit.bytes).toBe(erst.bytes);
    }, 180_000);
});

describe.skipIf(!da(METER))(`An der Meter-Datei (${METER})`, () => {
    it('wird gar nicht erst angefasst — Faktor 1 gibt dieselben Bytes zurück', async () => {
        const roh = lies(METER);
        const { bytes, bericht } = await inMeterUmrechnen(WebIFC, roh, { faktor: 1, api: API });
        expect(bytes).toBe(roh);                 // dieselbe Referenz, keine Kopie
        expect(bericht.unveraendert).toBe(true);
    }, 180_000);
});

describe('Die gemeinsame wasm-Instanz', () => {
    it('wird benutzt, wenn sie mitkommt — ohne zweites Init', async () => {
        // Der Beweis, dass der eingereichte Handle wirklich trägt: das Modell
        // wird darauf geöffnet, umgerechnet, geprüft — und die Instanz lebt
        // danach weiter (`CloseModel` schliesst nur das eigene Modell, ein
        // `Dispose` risse alle anderen mit).
        const init = API.Init;
        let initAufrufe = 0;
        API.Init = (...a) => { initAufrufe++; return init.apply(API, a); };
        try {
            const r = await inMeterUmrechnen(WebIFC, lies(MILLI), { faktor: 0.001, api: API });
            expect(r.bytes).toBeInstanceOf(Uint8Array);
            expect(initAufrufe, 'kein zweites Init').toBe(0);
        } finally { API.Init = init; }
        // Die Instanz ist danach weiter brauchbar.
        const m = API.OpenModel(lies(METER));
        expect(huellenSpanne(API, m)).not.toBe(null);
        API.CloseModel(m);
    }, 180_000);
});

describe('Kein halbes Ding', () => {
    it('gibt einen GRUND statt kaputter Bytes', async () => {
        expect((await inMeterUmrechnen(WebIFC, new Uint8Array(0), { faktor: 0.001, api: API })).grund)
            .toMatch(/keine Bytes/);
        expect((await inMeterUmrechnen(WebIFC, new Uint8Array([1, 2, 3]), { faktor: 0, api: API })).grund)
            .toMatch(/Faktor/);
        expect((await inMeterUmrechnen(null, new Uint8Array([1]), { faktor: 0.001, api: API })).bytes)
            .toBe(null);
        // Bytes, die kein IFC sind: keine Geometrie lesbar — und NICHTS wird
        // zurückgegeben, das wie ein Modell aussieht.
        const murks = await inMeterUmrechnen(WebIFC, new TextEncoder().encode('kein IFC'), { faktor: 0.001, api: API });
        expect(murks.bytes).toBe(null);
        expect(murks.grund).toBeTruthy();
    }, 180_000);
});
