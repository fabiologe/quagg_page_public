/**
 * Die GlobalId aus `fragmentsManager.getData()` heißt `_guid` (2026-09-19).
 *
 * Gemessen am A64-Netz: bei 40 von 40 Schächten trägt der Datensatz `_guid`
 * (gleich dem GUID-Index), ein Attribut `GlobalId` hat keiner. KG-, DIN-277-
 * und IDS-Prüfung lasen `item.GlobalId` und bekamen immer `''` — im Cockpit
 * stand an jedem Element „Keine GlobalId geladen", und keine Zuweisung von
 * Hand griff. Die bisherigen Tests bauten ihre Datensätze MIT `GlobalId` —
 * am echten Weg vorbei. Hier stehen die Datensätze so, wie die Bibliothek sie
 * liefert: `_category`, `_localId`, `_guid`, Attribute.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { globalIdAusDaten } from '../services/IfcDataConfig.js';
import { classifyKg } from '../services/KgClassifier.js';
import { classifyDin277 } from '../services/Din277Classifier.js';
import { parseItemData } from '../services/IfcItemData.js';
import { KG_DEFAULT_RULES } from '../services/Din276Defaults.js';

const WURZEL = fileURLToPath(import.meta.url).replace(/test[\/][^\/]+$/, '');
const box = () => new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(2, 3, 2));

/** Ein Datensatz, wie `getData` ihn liefert — OHNE Attribut `GlobalId`. */
const datensatz = (localId, guid, kategorie, rest = {}) => ({
    _category: { value: kategorie }, _localId: { value: localId }, _guid: { value: guid },
    Name: { value: `E-${localId}` }, ...rest,
});
const modell = (kategorie, items, { getGuidsByLocalIds } = {}) => ({
    categoryGroups: [{ name: kategorie, groupData: { get: async () => new Map([['m1', items.map(i => i._localId.value)]]) } }],
    fragmentsList: new Map([['m1', { getBoxes: async () => items.map(box), ...(getGuidsByLocalIds ? { getGuidsByLocalIds } : {}) }]]),
    fragmentsManager: { getData: async () => ({ m1: items }) },
});

describe('globalIdAusDaten', () => {
    it('liest `_guid`, fällt auf `GlobalId` zurück, sonst leer', () => {
        expect(globalIdAusDaten({ _guid: { value: 'A' } })).toBe('A');
        expect(globalIdAusDaten({ GlobalId: { value: 'B' } })).toBe('B');
        expect(globalIdAusDaten({ _guid: { value: 'A' }, GlobalId: { value: 'B' } })).toBe('A');
        expect(globalIdAusDaten({ _guid: 'C' })).toBe('C');
        expect(globalIdAusDaten({})).toBe('');
        expect(globalIdAusDaten(null)).toBe('');
    });
});

describe('die Leser mit echten Datensätzen', () => {
    it('Kostengruppen: mit Datenabruf (Zuweisung vorhanden) trägt jedes Element seine GlobalId, die Zuweisung greift', async () => {
        const items = [datensatz(1, '1Schacht000000000000A1', 'IFCDISTRIBUTIONCHAMBERELEMENT'),
                       datensatz(2, '1Schacht000000000000A2', 'IFCDISTRIBUTIONCHAMBERELEMENT')];
        const { byKg } = await classifyKg({ ...modell('IFCDISTRIBUTIONCHAMBERELEMENT', items), rules: [...KG_DEFAULT_RULES],
                                            overrides: new Map([['1Schacht000000000000A2', '551']]) });
        expect(byKg.get('551')?.elements.map(e => e.globalId)).toEqual(['1Schacht000000000000A2']);   // vorher: niemand — ''
        expect(byKg.get('411')?.elements.map(e => e.globalId)).toEqual(['1Schacht000000000000A1']);
    });

    it('Kostengruppen: mit Längen (Datenabruf ohne Zuweisung) ebenso — so ruft das Cockpit', async () => {
        const items = [datensatz(1, '1Schacht000000000000A1', 'IFCDISTRIBUTIONCHAMBERELEMENT')];
        const { byKg } = await classifyKg({ ...modell('IFCDISTRIBUTIONCHAMBERELEMENT', items), rules: [...KG_DEFAULT_RULES], collectLengths: true });
        expect(byKg.get('411').elements[0].globalId).toBe('1Schacht000000000000A1');
    });

    it('DIN 277: die Klasse von Hand greift am Raum', async () => {
        const raum = datensatz(1, '2Raum00000000000000001', 'IFCSPACE', { LongName: { value: '' }, IsDefinedBy: [] });
        const { spaces } = await classifyDin277({ ...modell('IFCSPACE', [raum]), spatialTree: null,
                                                  overrides: new Map([['2Raum00000000000000001', 'TF']]) });
        expect(spaces[0]).toMatchObject({ globalId: '2Raum00000000000000001', classCode: 'TF', source: 'override' });
    });

    it('die Merkmalsdaten der Auswahl (`parseItemData`) nennen die Kennung', () => {
        // `getData` liefert je Modell eine Liste: `{ [modelId]: [datensatz] }`.
        expect(parseItemData({ m1: [datensatz(5, '3Rohr00000000000000005', 'IFCPIPESEGMENT')] }).globalId).toBe('3Rohr00000000000000005');
    });
});

describe('Wächter: niemand liest `GlobalId` aus einem Datensatz von Hand', () => {
    it('nur `globalIdAusDaten` kennt das Feld', () => {
        const funde = readdirSync(WURZEL + 'services').filter(f => f.endsWith('.js') && f !== 'IfcDataConfig.js')
            .filter(f => readFileSync(WURZEL + 'services/' + f, 'utf8').split('\n')
                .filter(z => !/^\s*(\*|\/\/)/.test(z))                       // Kommentare erzählen die Geschichte
                .some(z => /\bitem(\.GlobalId|\['GlobalId'\])/.test(z)));
        expect(funde).toEqual([]);
    });
});
