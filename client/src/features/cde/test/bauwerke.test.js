// @vitest-environment node
/**
 * Teil XXVI — Bauwerke aus Bauteilen (docs/cde/fahrplan-teil-xxvi-bauwerke-2026-10-01.md).
 *
 * Diese Datei wächst mit dem Teil, wie `backend/app/ifc/tests/test_bauwerke.py`
 * auf der Seite des Schreibers. Die Funde der Vorprüfung standen in Z0 mit
 * ihrem damaligen Ergebnis hier; die Stufe, die einen behebt, dreht die
 * Erwartung um und sagt im Commit, warum.
 */
import { describe, it, expect } from 'vitest';
import { istSchreibbar, pruefeBauplan, warumNichtSchreibbar } from '../services/Bauteilrezepte.js';
import { pruefeEintrag } from '../services/katalog/Katalogschema.js';

const UMRISS = [[0, 210, 0], [5, 210, 0], [5, 210, 5], [0, 210, 5]];

describe('Z1 — Fund 1: Raumelemente sind keine Bauteile', () => {
    it('Bauteilklassen bleiben schreibbar (die Kontrolle)', () => {
        expect(['IFCSLAB', 'IFCWALL', 'IFCFOOTING'].map(istSchreibbar)).toEqual([true, true, true]);
    });

    it('Raumelemente nicht mehr — bis Z1 gingen alle fünf durch (Z0 hielt es fest)', () => {
        const raumelemente = ['IFCSPACE', 'IFCFACILITY', 'IFCFACILITYPARTCOMMON', 'IFCBUILDING', 'IFCSITE'];
        expect(raumelemente.map(istSchreibbar)).toEqual([false, false, false, false, false]);
        expect(warumNichtSchreibbar('IFCSPACE')).toMatch(/Raumelement/);
    });

    it('eine Platte als IFCSPACE scheitert jetzt schon beim Zeichnen — nicht erst beim Ausgeben', () => {
        const fehler = pruefeBauplan({ rezept: 'platte', kategorie: 'IFCSPACE', parameter: { punkte: UMRISS, dicke: 0.2 } });
        expect(fehler).toHaveLength(1);
        expect(fehler[0]).toMatch(/Raumelement/);
    });

    it('… und eine Bibliothek, die ein Raumelement als Vorgabe nennt, wird abgewiesen', () => {
        const { ok, fehler } = pruefeEintrag('rezept', {
            id: 'probe-raum', titel: 'Probe', bauform: 'flaeche+dicke', kategorieVorgabe: 'IFCSPACE',
            mindestPunkte: 3, geschlossen: true, felder: [], geometrie: { art: 'platte', dicke: 0.2 },
        });
        expect(ok).toBe(false);
        expect(fehler.join(' ')).toMatch(/Raumelement/);
    });

    it('der Grund kommt aus derselben Regel wie die Entscheidung', () => {
        for (const k of ['IFCSLAB', 'IFCSPACE', 'IFCFEATUREELEMENT', 'IFCCARTESIANPOINT', 'IFCGIBTSNICHT']) {
            expect(istSchreibbar(k)).toBe(warumNichtSchreibbar(k) === null);
        }
    });
});
