/**
 * Prüfbericht vor dem Teilen (IFC-Konsistenz, Stufe 4b).
 *
 * Wer ein MODELL von WIP nach Shared schaltet, soll wissen, was das Prüftor zu
 * ihm sagt. Verlangt wird ein VORHANDENER Bericht, kein grüner — die Lieferung
 * gehört dem Planer, die CDE meldet. Der Türsteher ist der Server
 * (cde.py::UEBERGANG_VERLANGT_PRUEFUNG, test_cde.py hält die Tabellen gleich);
 * hier steht, dass der Client dieselbe Regel anbietet und begründet, und dass
 * der Bericht aus dem Manifest beim Viewer ankommt.
 */
import { describe, expect, it } from 'vitest';
import { pruefeStatuswechsel, statusZiele, UEBERGANG_VERLANGT_PRUEFUNG } from '../services/StatusWorkflow.js';
import { dokumentAusManifest } from '../services/RepoFacade.js';

describe('WIP → Shared verlangt einen Prüfbericht — für Modelle', () => {
    it('die Tabelle nennt genau diesen Übergang', () => {
        expect(UEBERGANG_VERLANGT_PRUEFUNG).toEqual([['WIP', 'Shared']]);
    });

    it('ohne Bericht gesperrt und begründet, mit Bericht frei — auch mit Verstößen', () => {
        const ohne = pruefeStatuswechsel({ von: 'WIP', nach: 'Shared', rolle: 'MITARBEITER', art: 'modell', hatPruefung: false });
        expect(ohne.ok).toBe(false);
        expect(ohne.grund).toMatch(/Prüfbericht/);
        expect(pruefeStatuswechsel({ von: 'WIP', nach: 'Shared', rolle: 'MITARBEITER', art: 'modell', hatPruefung: true }).ok).toBe(true);
    });

    it('Pläne brauchen keinen, ADMIN springt, andere Übergänge bleiben unberührt', () => {
        expect(pruefeStatuswechsel({ von: 'WIP', nach: 'Shared', art: 'plan', hatPruefung: false }).ok).toBe(true);
        expect(pruefeStatuswechsel({ von: 'WIP', nach: 'Shared', rolle: 'ADMIN', art: 'modell', hatPruefung: false }).ok).toBe(true);
        expect(pruefeStatuswechsel({ von: 'Shared', nach: 'Published', rolle: 'MITARBEITER', art: 'modell', hatPruefung: false }).ok).toBe(true);
    });

    it('wer die Dokumentangaben nicht mitgibt, bekommt das alte Verhalten', () => {
        expect(pruefeStatuswechsel({ von: 'WIP', nach: 'Shared', rolle: 'MITARBEITER' }).ok).toBe(true);
        const ziele = statusZiele('WIP', 'MITARBEITER', undefined, { art: 'modell', hatPruefung: false });
        expect(ziele.find(z => z.status === 'Shared')).toMatchObject({ ok: false });
        expect(statusZiele('WIP', 'MITARBEITER').find(z => z.status === 'Shared').ok).toBe(true);
    });
});

describe('Der Bericht kommt aus dem Manifest beim Viewer an', () => {
    it('Kopfangaben und Prüfbericht eines hochgeladenen Modells', () => {
        const d = dokumentAusManifest({
            sha256: 'a'.repeat(64), datei: 'Boden.ifc', art: 'modell', schema: 'IFC4X3_ADD2',
            einheit_hinweis: 'mm', pruefung: { verstoesse: 2, lauf_id: 'p-1-abcdef', befunde: [] },
        });
        expect([d.schema, d.einheitHinweis, d.pruefung.verstoesse]).toEqual(['IFC4X3_ADD2', 'mm', 2]);
    });

    it('beim Erzeugten gilt der Bericht seines Verbunds', () => {
        const d = dokumentAusManifest({
            sha256: 'b'.repeat(64), datei: 'Verbund_Satz_R01.ifc', art: 'modell',
            herkunft: { art: 'verbund', pruefung: { verstoesse: 0, kriterien: ['V01', 'SPF'] } },
        });
        expect(d.pruefung).toMatchObject({ verstoesse: 0 });
    });

    it('ohne alles: null, nicht erfunden', () => {
        const d = dokumentAusManifest({ sha256: 'c'.repeat(64), datei: 'Plan.pdf', art: 'plan' });
        expect([d.schema, d.einheitHinweis, d.pruefung]).toEqual([null, null, null]);
    });
});
