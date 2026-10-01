// @vitest-environment node
/**
 * Teil XXVI — Bauwerke aus Bauteilen (docs/cde/fahrplan-teil-xxvi-bauwerke-2026-10-01.md).
 *
 * Diese Datei wächst mit dem Teil, wie `backend/app/ifc/tests/test_bauwerke.py`
 * auf der Seite des Schreibers. Z0 hält die Funde der Vorprüfung mit ihrem
 * HEUTIGEN Ergebnis fest; die Stufe, die einen behebt, dreht die Erwartung um
 * und sagt im Commit, warum.
 */
import { describe, it, expect } from 'vitest';
import { istSchreibbar, pruefeBauplan } from '../services/Bauteilrezepte.js';

const UMRISS = [[0, 210, 0], [5, 210, 0], [5, 210, 5], [0, 210, 5]];

describe('Z0 — Fund 1, Stand vor Z1: Raumelemente gelten als Bauteil', () => {
    it('Bauteilklassen sind schreibbar (die Kontrolle)', () => {
        expect(['IFCSLAB', 'IFCWALL', 'IFCFOOTING'].map(istSchreibbar)).toEqual([true, true, true]);
    });

    it('… und heute AUCH Raumelemente — der Schreiber macht daraus WR31 + WR41', () => {
        const raumelemente = ['IFCSPACE', 'IFCFACILITY', 'IFCFACILITYPARTCOMMON', 'IFCBUILDING', 'IFCSITE'];
        expect(raumelemente.map(istSchreibbar)).toEqual([true, true, true, true, true]);
    });

    it('… und eine Platte als IFCSPACE besteht die Bauplanprüfung ohne Befund', () => {
        expect(pruefeBauplan({ rezept: 'platte', kategorie: 'IFCSPACE',
                               parameter: { punkte: UMRISS, dicke: 0.2 } })).toEqual([]);
    });
});
