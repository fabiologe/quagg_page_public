// @vitest-environment jsdom
/**
 * Ein Bauwerk in der Tafel, wie es im IFC steht (Teil XXIX, nach G8 — Fabio: „Steg anklicken öffnet die Eigenschaften
 * nicht; wie wird das bei IFC gehandelt?"). Im IFC ist ein Bauwerk ein Raumelement (IfcFacility) mit Name, Kennung,
 * Merkmalen und Klassifizierung; die Teile stehen darin, je Gewerk ein System. Die Tafel nennt dieselben Angaben — und
 * dieselben Zahlen, die der Schreiber für den Teich P11 schreibt (`test_bauwerke.py::test_p11…`: Steg 7 + 2).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { repo } from '../services/RepoFacade.js';
import { useAenderungen } from '../stores/useAenderungen.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { bauwerkImIfc } from '../services/EigenbauPaket.js';
import { Speicher } from './hilfen/vorlagenKommandos.js';
import { p11Kommandos } from './hilfen/p11Kommandos.js';

beforeEach(() => { repo.setBackend(new Speicher()); setActivePinia(createPinia()); });
afterEach(() => repo.setBackend(null));

const URSUBJEKT = { modelId: 'm1', localId: 1, globalId: 'UR', name: 'Urgelände', category: 'IFCGEOGRAPHICELEMENT', hoehenversatz: 0,
                    quellmass: { pruefmass: { triCount: 4900, spanX: 140, spanY: 0, spanZ: 140 }, cell: 2 } };

describe('Teil XXIX, nach G8 — ein Bauwerk, wie es im IFC steht', () => {
    it('Steg und Teich: Klasse, Klassifizierung, Merkmale, Teile und Systeme wie der Schreiber', async () => {
        const b = useBearbeitung(), ae = useAenderungen();
        let i = 0;
        for (const kom of p11Kommandos().kommandos) {
            const r = await b.fuehreAus(kom, { subjektVon: (gid) => (gid === 'UR' ? URSUBJEKT : null),
                                              kennungsgeber: (a) => (a === 'operation' ? `op-b${++i}` : `cde-b${++i}`) });
            expect(r.ausgefuehrt, kom.id).toBe(true);
        }
        const stand = ae.wirksamerStand('erzeugt');
        const steg = bauwerkImIfc('cde-STEG', { stand });
        expect(steg).toEqual({
            klasse: 'IfcFacility', name: 'Steg', cdeId: 'cde-STEG', objectType: null, klassifikation: null,
            merkmale: { Quagg_CDE: { CdeId: 'cde-STEG', Rezept: 'bauwerk', Art: 'anlage' } },
            teile: 9, bauwerke: [],
            systeme: [
                { titel: 'Konstruktiver Ingenieurbau', klasse: 'IfcBuiltSystem', ausfuehrung: 'USERDEFINED', objektTyp: 'Konstruktiver Ingenieurbau', teile: 7 },
                { titel: 'Ausstattung & Verkehrstechnik', klasse: 'IfcBuiltSystem', ausfuehrung: 'USERDEFINED', objektTyp: 'Ausstattung', teile: 2 },
            ],
        });
        const teich = bauwerkImIfc('cde-TEICH', { stand });
        expect([teich.klasse, teich.klassifikation?.code, teich.teile]).toEqual(['IfcFacility', 'RRB', 23]);
        // Kein Bauwerk — kein Steckbrief.
        expect(bauwerkImIfc('cde-T5', { stand })).toBeNull();
    }, 60000);

    it('eine Anlage in einer Anlage ist ein Teilbauwerk, eine Baugruppe eine IfcElementAssembly — die Regel des Schreibers', () => {
        const stand = new Map([
            ['A', { rezept: 'bauwerk', name: 'Becken', parameter: { art: 'anlage' } }],
            ['B', { rezept: 'bauwerk', name: 'Kammer 1', parameter: { art: 'anlage', teilVon: 'A' } }],
            ['C', { rezept: 'bauwerk', name: 'Drossel', parameter: { art: 'baugruppe', teilVon: 'A' } }],
        ]);
        expect(['A', 'B', 'C'].map(g => bauwerkImIfc(g, { stand }).klasse)).toEqual(['IfcFacility', 'IfcFacilityPartCommon', 'IfcElementAssembly']);
        expect(bauwerkImIfc('A', { stand }).bauwerke).toEqual(['Kammer 1', 'Drossel']);
    });
});
