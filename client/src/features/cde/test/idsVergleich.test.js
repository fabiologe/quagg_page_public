// @vitest-environment node
/**
 * Zwei Motoren, eine Zahl (Fahrplan IFC-Konsistenz, Stufe 5).
 *
 * Das Prüftor urteilt mit ifctester über die Starter-IDS; die Cockpit-Karte
 * „BIM-Qualität" zeigt eine Vorschau mit IdsValidator.js. Zeigt die Vorschau
 * etwas anderes als das Urteil, ist sie schlimmer als keine.
 *
 * Deshalb zählt diese Datei die Vorschau am VERGLEICHSMODELL des Backends
 * (`backend/app/ifc/tests/daten/ids_vergleich.ifc`, jede Regel trifft) und
 * hält sie gegen die Zählung von ifctester (`ids_vergleich.json`, gehalten von
 * backend/app/ifc/tests/test_ids.py). Muster: ifcKopf.test.js ↔ kopf_faelle.json.
 *
 * Die Eingabe baut der Test NICHT selbst: die Datei wird mit web-ifc gelesen,
 * wie der Viewer sie liest (IfcQuelle). Nachgebaut ist nur die eine Stelle, die
 * fragments ohne WebGL nicht hergibt — `getData` liefert unter IsDefinedBy die
 * Merkmalsdefinitionen selbst, die Beziehung IfcRelDefinesByProperties ist
 * dort schon aufgelöst (so auch die Attrappen in idsValidator.test.js).
 *
 * Was hier gefunden wurde, bevor es grün war: die Vorschau las Mengensätze
 * nicht (Qto_* stehen unter `Quantities`) und hätte IfcWallStandardCase als
 * IfcWall gezählt — IDS 1.0 kennt in der Klassenfacette keine Vererbung.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { IfcQuelle } from '../services/IfcQuelle.js';
import { IDS_DEFAULT_SPECS, IDS_NICHT_IN_VORSCHAU } from '../services/IdsDefaults.js';
import { validateIds } from '../services/IdsValidator.js';

const hier = path.dirname(fileURLToPath(import.meta.url));
const wurzel = path.resolve(hier, '../../../../');
const DATEN = path.resolve(wurzel, '../backend/app/ifc/tests/daten');
const MODELL = path.join(DATEN, 'ids_vergleich.ifc');
const SOLL = JSON.parse(fs.readFileSync(path.join(DATEN, 'ids_vergleich.json'), 'utf8'));
// Was die Vorschau nicht kann (PredefinedType als Aufzählung), urteilt nur ifctester.
const NICHT = new Set(IDS_NICHT_IN_VORSCHAU.map(n => n.id));
const WASM = { wasmPfad: path.join(wurzel, 'node_modules/web-ifc/'), absolut: true };
const require = createRequire(import.meta.url);

/** Was `fragmentsManager.getData` im Browser liefert — aus der Datei gelesen, nicht erfunden. */
function wieFragments(q) {
    const definiert = new Map();
    for (const rel of q.alle('IFCRELDEFINESBYPROPERTIES', { tief: true })) {
        for (const o of rel.RelatedObjects ?? []) {
            definiert.set(o.expressID, [...(definiert.get(o.expressID) ?? []), rel.RelatingPropertyDefinition]);
        }
    }
    return {
        categoryGroups: q.typenImModell().map(({ typ }) => ({
            name: typ, groupData: { get: async () => new Map([['m', q.ids(typ)]]) },
        })),
        fragmentsList: new Map([['m', {}]]),
        fragmentsManager: {
            getData: async anfrage => ({
                m: anfrage.m.map(id => ({ ...q.zeile(id), _localId: id, IsDefinedBy: definiert.get(id) ?? [] })),
            }),
        },
    };
}

describe('Zwei Motoren, eine Zahl — die Starter-IDS am Vergleichsmodell', () => {
    let q;
    let ergebnis;
    beforeAll(async () => {
        q = await IfcQuelle.oeffne(require('web-ifc'), new Uint8Array(fs.readFileSync(MODELL)), WASM);
        ergebnis = await validateIds({ specs: IDS_DEFAULT_SPECS, ...wieFragments(q) });
    });
    afterAll(() => q?.schliesse());

    it('je Spezifikation: anwendbar, verfehlt und WER verfehlt — wie ifctester', () => {
        const ist = ergebnis.perSpec.map(p => ({
            kennung: p.spec.id,
            anwendbar: p.applicable,
            verfehlt: p.failed.length,
            verfehlt_von: p.failed.map(f => f.globalId).sort(),
        }));
        expect(ist).toEqual(SOLL.spezifikationen.filter(s => !NICHT.has(s.kennung)));
    });

    it('das Modell trifft jede Regel — sonst wäre die Gleichheit billig', () => {
        expect(ergebnis.perSpec).toHaveLength(16);
        expect(SOLL.spezifikationen.filter(s => NICHT.has(s.kennung)).map(s => s.kennung))
            .toEqual(['spec-aushub-typ', 'spec-auftrag-typ']);
        expect(ergebnis.perSpec.filter(p => p.applicable === 0).map(p => p.spec.id)).toEqual([]);
    });
});

describe('Der Vertrag mit fragments: Mengen stehen unter `Quantities`', () => {
    // Die Vorschau liest IfcElementQuantity.Quantities. Dass fragments sie im Browser
    // unter diesem Namen liefert, steht in der Klassendefinition seines Workers (er
    // übernimmt die web-ifc-Klassen): `HasQuantities` führt dort nur
    // IfcPhysicalComplexQuantity. Muster: fragmentsVertrag.test.js — die Bibliothek
    // prüfen, nicht unsere Vorstellung von ihr.
    it('IfcElementQuantity führt Quantities, nicht HasQuantities', () => {
        const T = require('web-ifc').IFCELEMENTQUANTITY;
        const worker = fs.readFileSync(
            path.join(wurzel, 'node_modules/@thatopen/fragments/dist/Worker/worker.mjs'), 'utf8');
        const muster = new RegExp(`this\\.MethodOfMeasurement=[\\w$]+,this\\.([\\w$]+)=[\\w$]+,this\\.type=${T}\\b`, 'g');
        const felder = [...worker.matchAll(muster)].map(m => m[1]);
        expect(felder.length, 'Klassendefinition IfcElementQuantity nicht gefunden').toBeGreaterThan(0);
        expect(new Set(felder)).toEqual(new Set(['Quantities']));
    });
});
