/**
 * Der Kopf einer IFC-Datei — dieselbe Falltabelle wie der Server.
 *
 * `leseKopf`/`kopfAblehnung` (ModelIdentity.js) und `kopf.py` im Backend sind
 * zwei Umsetzungen derselben Regel: Upload und Laden lehnen nur ab, was SICHER
 * keine IFC-Datei ist, und lesen Schema und Einheit als Hinweis. Beide halten
 * sich an backend/app/ifc/tests/daten/kopf_faelle.json — wie paketVertrag.test.js
 * an paket_v2.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { kopfAblehnung, leseKopf } from '../services/ModelIdentity.js';

const hier = path.dirname(fileURLToPath(import.meta.url));
const TABELLE = path.resolve(hier, '../../../../../backend/app/ifc/tests/daten/kopf_faelle.json');
const { faelle } = JSON.parse(fs.readFileSync(TABELLE, 'utf8'));
const alsBytes = s => Uint8Array.from(s, c => c.charCodeAt(0));

describe('Der IFC-Kopf: Client und Server lesen dieselbe Tabelle', () => {
    it('die Tabelle ist nicht leer', () => {
        expect(faelle.length).toBeGreaterThanOrEqual(10);
    });

    it.each(faelle.map(f => [f.name, f]))('%s', (_name, f) => {
        const k = leseKopf(alsBytes(f.roh));
        expect({
            ist_step: k.istStep, ist_zip: k.istZip, schema: k.schema,
            einheit_hinweis: k.einheitHinweis, projekt_global_id: k.projectGlobalId,
        }).toEqual(f.erwartet);
        expect(kopfAblehnung(alsBytes(f.roh), `lieferung${f.endung}`) !== null).toBe(f.abgelehnt);
    });
});

describe('An den echten Gruppendateien', () => {
    it.each([
        ['BIM26_Gruppe5_BODEN_Erdarbeiten.ifc', 'IFC4X3_ADD2', 'm'],
        ['BIM26_Gruppe5_BODEN_Erdarbeiten3.ifc', 'IFC4X3_ADD2', 'mm'],
        ['IFCOUT_Entwässerung Export .IFC', 'IFC2X3', 'm'],
    ])('%s → %s, %s', (datei, schema, einheit) => {
        const pfad = path.join(hier, datei);
        const k = leseKopf(new Uint8Array(fs.readFileSync(pfad)));
        expect([k.istStep, k.schema, k.einheitHinweis]).toEqual([true, schema, einheit]);
        expect(kopfAblehnung(new Uint8Array(fs.readFileSync(pfad)), datei)).toBe(null);
    });
});
