/**
 * Die Zeitleiste (Stufe 9) — Verklebung.
 *
 * Die Verben sind im Store geprüft (versionsliste.test.js); hier steht, dass
 * die Oberfläche sie auch BENUTZT und alles Modellberührende durch DENSELBEN
 * Anwendungsweg geht — plus der Fehlerfänger (Gesetz 10, Vorfall 2026-09-02).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const tab = readFileSync(
    new URL('../components/IfcAenderungenTab.vue', import.meta.url), 'utf8');

describe('Zeitleisten-Verklebung', () => {
    it('die Karten kommen aus ae.vorgaenge — nicht aus einer zweiten Gruppierung', () => {
        expect(tab).toContain('ae.commitZeitleiste');
        expect(tab).not.toMatch(/vorgangDavor|vorgangGroesse/);   // die alte Tabellen-Logik ist WEG
    });

    it('alle drei Konflikt-Verben sind verdrahtet und wenden an', () => {
        for (const verb of ['hebeBasisAn', 'verwerfeEinen', 'uebertrageAuf', 'zurueckBisCommit', 'revertiereCommit']) {
            expect(tab).toContain(`ae.${verb}(`);
        }
        // … und jede Entscheidung geht durch anwenden() → wendeEintragAn.
        const script = tab.slice(tab.indexOf('<script'));
        expect(script.match(/await anwenden\(/g)?.length).toBeGreaterThanOrEqual(4);
    });

    it('anwenden fängt Fehler — kein toter Knopf mehr', () => {
        const fn = tab.slice(tab.indexOf('async function anwenden'));
        expect(fn.slice(0, 400)).toContain('try {');
        expect(fn.slice(0, 600)).toContain("console.error('cde:");
    });

    it('Übertragen verlangt eine Auswahl und nennt sonst den Grund', () => {
        expect(tab).toContain('!auswahlGlobalId');
        expect(tab).toMatch(/Erst im Modell das Ziel-Bauteil wählen/);
    });

    it('die Konfliktliste zieht am geometrieStand nach — nicht nur beim Öffnen', () => {
        expect(tab).toContain('ifc.geometrieStand');
        expect(tab).toContain('getKonflikte');
    });
});
