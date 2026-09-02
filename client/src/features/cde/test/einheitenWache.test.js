/**
 * Die Millimeter-Wache (Audit-Lücke 1, 2026-09-02).
 *
 * Beide BODEN-Dateien im echten Projekt sind in MILLIMETERN geschrieben —
 * und jede Rechnung der CDE nimmt Meter an. Bis zur durchgängigen
 * Umrechnung gilt: erkennen, laut sagen, Bearbeitung sperren. Dieser Test
 * beweist die Erkennung AN DER ECHTEN DATEI und hält die Sperre fest.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as WebIFC from 'web-ifc';
import { IfcQuelle } from '../services/IfcQuelle.js';
import { leseGeoreferenz } from '../services/Georeferenz.js';

const WURZEL = fileURLToPath(import.meta.url).replace(/test[\/][^\/]+$/, '');
const MM_DATEI = '/mnt/storagebox/1_Projekte/01_Laufend/1337_Genau/CDE/BIM26_Gruppe5_BODEN_Planung.ifc';
const M_DATEI = '/mnt/storagebox/1_Projekte/01_Laufend/1337_Genau/CDE/6275_ENQUIER_0X_2026-08-31.ifc';
const vorhanden = fs.existsSync(MM_DATEI) && fs.existsSync(M_DATEI);

describe.skipIf(!vorhanden)('Erkennung an den echten Dateien', () => {
    let mm, m;
    beforeAll(async () => {
        const wasmPfad = new URL('../../../../node_modules/web-ifc/', import.meta.url).pathname;
        mm = await IfcQuelle.oeffne(WebIFC, new Uint8Array(fs.readFileSync(MM_DATEI)), { wasmPfad });
        m = await IfcQuelle.oeffne(WebIFC, new Uint8Array(fs.readFileSync(M_DATEI)), { wasmPfad });
    }, 120000);

    it('das Geländemodell meldet Millimeter (Faktor 0,001)', () => {
        const e = leseGeoreferenz(mm).einheit;
        expect(e.praefix).toBe('MILLI');
        expect(e.faktor).toBeCloseTo(0.001, 9);
        expect(e.quelle).toBe('IfcSIUnit');
    });

    it('das Kanalnetz meldet Meter — die Wache schweigt dort', () => {
        const e = leseGeoreferenz(m).einheit;
        expect(e.faktor).toBe(1);
    });
});

describe('Die Wache im Viewer (Verklebung)', () => {
    const viewer = readFileSync(WURZEL + 'components/IfcViewer.vue', 'utf8');

    it('der Faktor ≠ 1 sperrt die Bearbeitung MIT Grund', () => {
        const sperre = viewer.slice(viewer.indexOf('function bearbeitenSperrgrund'));
        expect(sperre.slice(0, 700)).toContain('einheitsWarnung');
        expect(sperre.slice(0, 700)).toMatch(/Millimetern/);
    });

    it('der Banner ist NICHT wegklickbar — laut statt still', () => {
        const von = viewer.indexOf('<div v-if="einheitsWarnung"');
        const bis = viewer.indexOf('</div>', von);
        const banner = viewer.slice(von, bis);
        expect(banner).not.toContain('@click');
        expect(viewer).toMatch(/einheitsWarnung\.value = null;/);   // je Ladezyklus neu bestimmt
    });
});
