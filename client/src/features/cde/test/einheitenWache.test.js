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
        // Die Eigenschaft, auf die es ankommt, ist nicht „kein @click",
        // sondern „die Warnung lässt sich nicht loswerden, ohne die Ursache
        // zu beseitigen". Seit 2026-09-03 trägt der Banner einen Knopf — er
        // rechnet aber um, er blendet nicht aus. Der Wächter prüft deshalb
        // die WIRKUNG: kein Handler im Banner setzt die Warnung auf null.
        const von = viewer.indexOf('<div v-if="einheitsWarnung"');
        const bis = viewer.indexOf('</div>', von);
        const banner = viewer.slice(von, bis);
        for (const treffer of banner.match(/@click="([^"]+)"/g) ?? []) {
            expect(treffer, 'Banner-Klick darf nur umrechnen, nie ausblenden')
                .toMatch(/rechneInMeter/);
        }
        expect(banner).not.toMatch(/einheitsWarnung\s*=\s*(null|false)/);
        expect(viewer).toMatch(/einheitsWarnung\.value = null;/);   // je Ladezyklus neu bestimmt
    });

    it('die Sperre nennt den AUSWEG, nicht nur den Grund', () => {
        // Vorher stand dort „bis die Einheiten-Umrechnung gebaut ist" — eine
        // Sackgasse, die den Nutzer auf eine Programmfassung vertröstete.
        const sperre = viewer.slice(viewer.indexOf('function bearbeitenSperrgrund'));
        expect(sperre.slice(0, 700)).toMatch(/In Meter umrechnen/);
    });

    it('der Umrechnen-Weg lädt NEU, statt nachträglich zu skalieren', () => {
        // Nachträglich ginge nicht: die Geometrie steckt dann in Fragmenten,
        // und die kennen keinen Faktor. Wer das doch versucht, skaliert nur
        // die Anzeige und lässt alle Rechnungen falsch.
        const ablage = readFileSync(WURZEL + 'composables/useModellAblage.js', 'utf8');
        const fn = ablage.slice(ablage.indexOf('async function ladeInMeterNeu'));
        expect(fn.slice(0, 900)).toContain('unloadModel');
        expect(fn.slice(0, 900)).toContain('inMeter: true');
        // Und die ABLAGE bleibt die Datei des Planers.
        expect(fn.slice(0, 900)).toContain('persist: false');
    });

    it('die Identität kommt aus den ORIGINALBYTES, nie aus den umgerechneten', () => {
        // Sonst zerfiele ein Modell im Dokumentregister in zwei Einträge, und
        // das Journal verlöre über `modellSha` seinen Bezug.
        const ablage = readFileSync(WURZEL + 'composables/useModellAblage.js', 'utf8');
        const fn = ablage.slice(ablage.indexOf('async function _ladeBytes'));
        const identZeile = fn.indexOf('computeModelIdentity');
        const ladeZeile = fn.indexOf('loadIfc');
        expect(identZeile).toBeGreaterThan(-1);
        expect(identZeile, 'Identität VOR dem Laden, auf den Rohbytes').toBeLessThan(ladeZeile);
        // Beide bekommen `bytes` — die ROHEN. Umgerechnet wird erst INNERHALB
        // von `loadIfc`, die Prüfsumme sieht die Umrechnung also nie.
        expect(fn).toMatch(/computeModelIdentity\(bytes\b/);
        expect(fn).toMatch(/loadIfc\(bytes,[^)]*inMeter/);
    });
});
