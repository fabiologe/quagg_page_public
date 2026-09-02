/**
 * Die Achse an Fabios ECHTEM Netz (Stufe 14.1).
 *
 * Warum diese Datei und nicht nur Attrappen: Die Achse war jahrelang tot, und
 * die Attrappen konnten es nicht zeigen — sie bildeten eine Schnittstelle nach,
 * die es so nie gab. Hier läuft der echte Weg über eine echte Datei.
 *
 * Der Beweis steckt in den Daten selbst. Der ISYBAU-Schreiber legt an jedes
 * Rohr `QG_ISYBAU_Data` mit `Sohlenhoehe` und `Deckelhoehe` — und die
 * bedeuten am ROHR (anders als am Schacht) die Sohlhöhe am ANFANG und am ENDE.
 * Zwei unabhängige Quellen für dieselbe Größe: die Geometrie und das Pset.
 * Stimmen sie überein, ist die Achse richtig gelesen.
 */
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import * as WebIFC from 'web-ifc';
import { IfcQuelle } from '../services/IfcQuelle.js';
import { extractAxisPolylines } from '../services/AxisAnnotations.js';

const DATEI = '/mnt/storagebox/1_Projekte/01_Laufend/1337_Genau/CDE/6275_ENQUIER_0X_2026-08-31.ifc';
const vorhanden = fs.existsSync(DATEI);

let quelle = null;
let achsen = [];
let psets = new Map();

beforeAll(async () => {
    if (!vorhanden) return;
    quelle = await IfcQuelle.oeffne(WebIFC, new Uint8Array(fs.readFileSync(DATEI)),
        { wasmPfad: 'node_modules/web-ifc/', name: 'enquier' });
    achsen = extractAxisPolylines(quelle);
    for (const rel of quelle.alle('IFCRELDEFINESBYPROPERTIES', { tief: true })) {
        const satz = rel?.RelatingPropertyDefinition;
        if (satz?.Name?.value !== 'QG_ISYBAU_Data') continue;
        const w = {};
        for (const pr of satz.HasProperties ?? []) w[pr?.Name?.value] = Number(pr?.NominalValue?.value);
        for (const o of rel.RelatedObjects ?? []) {
            if (Number.isFinite(o?.expressID)) psets.set(o.expressID, w);
        }
    }
}, 180000);

afterAll(() => quelle?.schliesse());

describe.runIf(vorhanden)('6275_ENQUIER: 24 Haltungen', () => {
    it('findet jede Haltung GENAU EINMAL', () => {
        // `IFCPIPESEGMENT` erbt von `IFCFLOWSEGMENT`; beide stehen in der
        // Vorgabeliste. Ohne Sperre kamen 48 statt 24 heraus.
        expect(achsen).toHaveLength(24);
        expect(new Set(achsen.map(a => a.expressId)).size).toBe(24);
    });

    it('gewinnt sie alle aus der EXTRUSION — die Datei hat keine Axis-Repräsentation', () => {
        expect(achsen.every(a => a.quelle === 'extrusion')).toBe(true);
    });

    it('Anfang und Ende stimmen mit den Pset-Sohlhöhen überein — auf den Millimeter', () => {
        // DIE EINGEBAUTE GEGENPROBE. Zwei unabhängige Quellen: Geometrie und
        // Pset. Weicht eine ab, ist die Achse falsch gelesen — und man sieht
        // es hier, nicht erst am Längsschnitt.
        let geprueft = 0;
        for (const a of achsen) {
            const w = psets.get(a.expressId);
            if (!Number.isFinite(w?.Sohlenhoehe)) continue;
            expect(a.polyline[0].y, `Anfang #${a.expressId}`).toBeCloseTo(w.Sohlenhoehe, 3);
            expect(a.polyline.at(-1).y, `Ende #${a.expressId}`).toBeCloseTo(w.Deckelhoehe, 3);
            geprueft++;
        }
        expect(geprueft).toBe(24);
    });

    it('liefert den DN aus dem Kreisprofil, nicht geschätzt', () => {
        const dn = [...new Set(achsen.map(a => a.dn))].sort((x, y) => x - y);
        expect(dn).toEqual([200, 300, 500, 5000]);
        // Der 5000er ist ein echter Ausreisser in Fabios Daten und der erste
        // Kunde der Prüfliste (Stufe 14.4) — hier steht er als Befund, nicht
        // als Fehler des Lesers.
        expect(achsen.filter(a => a.dn === 5000)).toHaveLength(1);
    });

    it('rechnet Länge und Gefälle aus der Achse', () => {
        for (const a of achsen) {
            expect(a.laenge).toBeGreaterThan(0);
            expect(Number.isFinite(a.gefaelle)).toBe(true);
        }
        // Gegenprobe der Rechnung an einem Bauteil: 318,4 → 302,5 auf 133,5 m.
        const lang = achsen.find(a => a.expressId === 683);
        expect(lang.polyline[0].y).toBeCloseTo(318.4, 3);
        expect(lang.polyline[1].y).toBeCloseTo(302.5, 3);
        expect(lang.laenge).toBeCloseTo(133.504, 2);
    });

    it('der Koordinations-Offset verschiebt die ganze Achse', () => {
        const ohne = achsen.find(a => a.expressId === 683);
        const mit = extractAxisPolylines(quelle, { coordOffset: { x: 100, y: 300, z: 50 } })
            .find(a => a.expressId === 683);
        expect(mit.polyline[0].x).toBeCloseTo(ohne.polyline[0].x - 100, 3);
        expect(mit.polyline[0].y).toBeCloseTo(ohne.polyline[0].y - 300, 3);
        expect(mit.polyline[0].z).toBeCloseTo(ohne.polyline[0].z - 50, 3);
        // Die LÄNGE ist davon unberührt — eine Verschiebung ändert keine Masse.
        expect(mit.laenge).toBeCloseTo(ohne.laenge, 6);
    });
});
