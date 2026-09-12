/**
 * IDS 1.0 als kanonische Datei (Fahrplan IFC-Konsistenz, Stufe 5).
 *
 * Die Startregeln stehen nicht mehr von Hand im Eigenformat, sondern in
 * data/quagg-starter.ids — derselben Datei, gegen die das Backend mit ifctester
 * prüft. Hier steht: die Übersetzung für die Vorschau ist vollständig, sie
 * BENENNT, was sie nicht kann, und die Vorschau trifft Klassen samt Untertypen.
 */
import { describe, expect, it } from 'vitest';
import { parseIds } from '../services/IdsXml.js';
import { IDS_DEFAULT_SPECS, IDS_NICHT_IN_VORSCHAU, IDS_STARTER_TITEL } from '../services/IdsDefaults.js';
import { validateIds } from '../services/IdsValidator.js';

const idsDatei = specs => '<?xml version="1.0"?><ids xmlns="http://standards.buildingsmart.org/IDS">'
    + `<info><title>Probe</title></info><specifications>${specs}</specifications></ids>`;
const klasse = (k, extra = '') => `<applicability minOccurs="0" maxOccurs="unbounded"><entity><name>`
    + `<simpleValue>${k}</simpleValue></name>${extra}</entity></applicability>`;
const nameVerlangt = '<requirements><attribute cardinality="required"><name><simpleValue>Name</simpleValue></name>'
    + '</attribute></requirements>';

describe('Die Starter-IDS wird zur Vorschau — vollständig', () => {
    it('18 Spezifikationen — genau die zwei Aufzählungen fallen aus der Vorschau, mit Grund', () => {
        expect(IDS_STARTER_TITEL).toBe('Quagg Starter-Anforderungen');
        expect(IDS_DEFAULT_SPECS).toHaveLength(16);
        expect(IDS_NICHT_IN_VORSCHAU.map(n => n.id)).toEqual(['spec-aushub-typ', 'spec-auftrag-typ']);
        for (const n of IDS_NICHT_IN_VORSCHAU) expect(n.gruende.join(' | ')).toMatch(/PredefinedType mit Wertvorgabe/);
    });

    it('die Herkunft-Regel gilt für Elemente der CDE — eine Bedingung ohne Wert heißt „vorhanden"', () => {
        const herkunft = IDS_DEFAULT_SPECS.find(s => s.id === 'spec-aushub-herkunft');
        expect(herkunft.severity).toBe('error');
        expect(herkunft.applicability).toEqual({
            category: 'IFCEARTHWORKSCUT',
            psetCondition: { psetName: 'Quagg_CDE', propertyName: 'CdeId', value: null },
        });
        expect(herkunft.requirements).toMatchObject([{ kind: 'pset', psetName: 'Quagg_Herkunft', propertyName: 'QuellRevision' }]);
    });

    it('die bisherigen Kennungen bleiben — das Cockpit merkt sich Ergebnisse je Kennung', () => {
        for (const id of ['spec-space-name', 'spec-space-area', 'spec-wall-external-flag', 'spec-wall-loadbearing',
            'spec-wall-fire-rating', 'spec-door-external-flag', 'spec-door-fire-rating', 'spec-window-external-flag',
            'spec-slab-loadbearing', 'spec-column-loadbearing', 'spec-chamber-name', 'spec-pipe-system']) {
            expect(IDS_DEFAULT_SPECS.find(s => s.id === id), id).toBeTruthy();
        }
    });

    it('Schwere, Bedingung und Anforderung kommen richtig an', () => {
        const brand = IDS_DEFAULT_SPECS.find(s => s.id === 'spec-wall-fire-rating');
        expect(brand.severity).toBe('warning');
        expect(brand.applicability).toEqual({
            category: 'IFCWALL',
            psetCondition: { psetName: 'Pset_WallCommon', propertyName: 'IsExternal', value: 'TRUE' },
        });
        expect(brand.requirements).toEqual([
            { kind: 'pset', psetName: 'Pset_WallCommon', propertyName: 'FireRating', message: 'FireRating fehlt' },
        ]);
        expect(IDS_DEFAULT_SPECS.find(s => s.id === 'spec-chamber-name'))
            .toMatchObject({ severity: 'error', requirements: [{ kind: 'attribute', name: 'Name' }] });
        expect(IDS_DEFAULT_SPECS.find(s => s.id === 'spec-aushub-mengen').applicability.category).toBe('IFCEARTHWORKSCUT');
    });
});

describe('Was die Vorschau nicht kann, wird benannt, nicht verworfen', () => {
    it('Klassifikation, Aufzählung, PredefinedType — und eine Regel, die sie kann', () => {
        const r = parseIds(idsDatei(
            `<specification name="Klassifiziert" ifcVersion="IFC4X3_ADD2" identifier="k">${klasse('IFCWALL')}`
            + '<requirements><classification><system><simpleValue>DIN276</simpleValue></system></classification>'
            + '</requirements></specification>'
            + `<specification name="Aufzählung" ifcVersion="IFC4X3_ADD2" identifier="m"><applicability minOccurs="0" maxOccurs="unbounded">`
            + '<entity><name><xs:restriction xmlns:xs="http://www.w3.org/2001/XMLSchema" base="xs:string">'
            + '<xs:enumeration value="IFCWALL"/><xs:enumeration value="IFCSLAB"/></xs:restriction></name></entity>'
            + `</applicability>${nameVerlangt}</specification>`
            + `<specification name="Typ" ifcVersion="IFC4X3_ADD2" identifier="t">`
            + `${klasse('IFCPIPESEGMENT', '<predefinedType><simpleValue>CULVERT</simpleValue></predefinedType>')}`
            + `${nameVerlangt}</specification>`
            + `<specification name="Gut" ifcVersion="IFC4X3_ADD2" identifier="g" instructions="Schwere: Hinweis">`
            + `${klasse('IFCSLAB')}<requirements><property cardinality="required"><propertySet><simpleValue>`
            + 'Pset_SlabCommon</simpleValue></propertySet><baseName><simpleValue>IsExternal</simpleValue></baseName>'
            + '<value><simpleValue>FALSE</simpleValue></value></property></requirements></specification>'));
        expect(r.specs.map(s => s.id)).toEqual(['g']);
        expect(r.specs[0]).toMatchObject({ severity: 'info', requirements: [{ kind: 'pset-equals', value: 'FALSE' }] });
        const gruende = Object.fromEntries(r.nichtInVorschau.map(n => [n.id, n.gruende.join(' | ')]));
        expect(gruende.k).toMatch(/classification/);
        expect(gruende.m).toMatch(/Muster oder Aufzählung/);
        expect(gruende.t).toMatch(/PredefinedType/);
    });

    it('ohne Schwere gilt Warnung; keine IDS-Datei ist ein Fehler mit Grund', () => {
        const r = parseIds(idsDatei(`<specification name="Ohne" ifcVersion="IFC4" identifier="o">${klasse('IFCSPACE')}${nameVerlangt}</specification>`));
        expect(r.specs[0].severity).toBe('warning');
        expect(() => parseIds('<foo/>')).toThrow(/<ids>/);
    });
});

describe('Die Vorschau zählt wie IDS 1.0: genau die Klasse', () => {
    it('eine Regel für IFCWALL trifft IFCWALLSTANDARDCASE nicht — wie ifctester', async () => {
        const spec = IDS_DEFAULT_SPECS.find(s => s.id === 'spec-wall-external-flag');
        const gruppe = (name, id) => ({ name, groupData: { get: async () => new Map([['m', [id]]]) } });
        const wand = id => ({ _localId: id, GlobalId: `2Wand00000000000000000${id}`, Name: `W${id}`, IsDefinedBy: [] });
        const ergebnis = await validateIds({
            specs: [spec],
            categoryGroups: [gruppe('IFCWALLSTANDARDCASE', 8), gruppe('IFCWALL', 7)],
            fragmentsList: new Map([['m', {}]]),
            fragmentsManager: { getData: async anfrage => ({ m: anfrage.m.map(wand) }) },
        });
        // IDS 1.0 kennt keine Vererbung in der Klassenfacette (ifctester facet.Entity:
        // include_subtypes=False). Zählte die Vorschau den Untertyp mit, wiche sie vom Urteil ab.
        expect(ergebnis.perSpec[0].applicable).toBe(1);
        expect(ergebnis.perSpec[0].failed.map(f => f.localId)).toEqual([7]);
    });

    it('eine Bedingung ohne Wert trifft nur, wer die Property TRÄGT — wie ifctester', async () => {
        const spec = IDS_DEFAULT_SPECS.find(s => s.id === 'spec-aushub-herkunft');
        const satz = (name, werte) => ({ Name: name, HasProperties: Object.entries(werte).map(([n, v]) => ({ Name: n, NominalValue: { value: v } })) });
        const aushub = (id, saetze) => ({ _localId: id, GlobalId: `2Aushub0000000000000${id}`, Name: `A${id}`, IsDefinedBy: saetze });
        const elemente = {
            1: aushub(1, []),                                                   // geliefert: kein Quagg_CDE
            2: aushub(2, [satz('Quagg_CDE', { CdeId: 'cde-2' })]),
            3: aushub(3, [satz('Quagg_CDE', { CdeId: 'cde-3' }), satz('Quagg_Herkunft', { QuellRevision: '1' })]),
        };
        const ergebnis = await validateIds({
            specs: [spec],
            categoryGroups: [{ name: 'IFCEARTHWORKSCUT', groupData: { get: async () => new Map([['m', [1, 2, 3]]]) } }],
            fragmentsList: new Map([['m', {}]]),
            fragmentsManager: { getData: async anfrage => ({ m: anfrage.m.map(id => elemente[id]) }) },
        });
        expect(ergebnis.perSpec[0].applicable).toBe(2);
        expect(ergebnis.perSpec[0].failed.map(f => f.localId)).toEqual([2]);
    });
});
