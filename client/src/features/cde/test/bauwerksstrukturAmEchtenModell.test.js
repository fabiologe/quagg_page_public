// @vitest-environment node
/**
 * Die Beziehungen der Bauwerksstruktur am ECHTEN Erdbau-Verbund (Fahrplan Erdbau-Container, Stufe 8).
 *
 * Die Datei baut das Backend (`backend/app/ifc/tests/test_eigenbau.py`,
 * `baue_erdbau_vergleich`, als Skript) aus paket_v2.json — der Kette des
 * Browsers —, einer gelieferten Gelände- und einer Rohrdatei; Wirte und
 * Vorgänge sind geschlossen. Gelesen wird mit web-ifc, wie der Viewer liest.
 * Muster: idsVergleich.test.js.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { IfcQuelle } from '../services/IfcQuelle.js';
import { baueBaeume, strukturBeziehungen } from '../services/Bauwerksstruktur.js';

const hier = path.dirname(fileURLToPath(import.meta.url));
const wurzel = path.resolve(hier, '../../../../');
const MODELL = path.resolve(wurzel, '../backend/app/ifc/tests/daten/erdbau_vergleich.ifc');
const WASM = { wasmPfad: path.join(wurzel, 'node_modules/web-ifc/'), absolut: true };
const require = createRequire(import.meta.url);

describe('Bauwerksstruktur am Erdbau-Verbund', () => {
    let q;
    let bez;
    beforeAll(async () => {
        q = await IfcQuelle.oeffne(require('web-ifc'), new Uint8Array(fs.readFileSync(MODELL)), WASM);
        bez = strukturBeziehungen(q);
    });
    afterAll(() => q?.schliesse());

    it('drei Aushübe hängen an EINEM Wirt, dem Ur-Gelände', () => {
        expect(bez.voids).toHaveLength(3);
        const wirte = [...new Set(bez.voids.map(v => v.wirt))];
        expect(wirte).toHaveLength(1);
        expect(q.kategorieVon(wirte[0])).toBe('IFCGEOGRAPHICELEMENT');
        expect(bez.voids.every(v => q.kategorieVon(v.aushub) === 'IFCEARTHWORKSCUT')).toBe(true);
    });

    it('vier Vorgänge, das Fachmodell Erdbau und je Lieferung eine Gruppe', () => {
        expect(bez.gruppen.filter(g => g.objectType === 'Vorgang')).toHaveLength(4);
        const fach = bez.gruppen.filter(g => g.objectType === 'Fachmodell').map(g => g.name);
        expect(fach).toEqual(expect.arrayContaining(['Erdbau', 'Urgelaende.ifc', 'Kanal.ifc', 'CDE-Eigenbau']));
    });

    it('im Baum: die Aushübe unter dem Wirt, jeder Vorgang unter einem Fachmodell', () => {
        const wirt = bez.voids[0].wirt;
        const index = [...bez.voids.map(v => v.aushub), wirt].map(localId => ({
            modelId: 'm', localId, name: q.zeile(localId)?.Name?.value ?? '', category: q.kategorieVon(localId) }));
        const [baum] = baueBaeume({
            baeume: [{ modelId: 'm', name: 'erdbau_vergleich.ifc',
                       wurzel: { category: 'IFCSITE', localId: -1, children: [{ category: null, localId: wirt, children: [] }] } }],
            index, beziehungen: new Map([['m', bez]]),
        });
        const wirtKnoten = baum.wurzel.children[0];
        expect(wirtKnoten.category).toBe('IFCGEOGRAPHICELEMENT');
        expect(wirtKnoten.children.filter(k => k.aussparung)).toHaveLength(3);
        expect(baum.gruppen.children.some(k => k.objectType === 'Vorgang')).toBe(false);
        const vorgaenge = [];
        const sammle = (k) => { if (k.objectType === 'Vorgang') vorgaenge.push(k); (k.children ?? []).forEach(sammle); };
        sammle(baum.gruppen);
        expect(vorgaenge).toHaveLength(4);
    });
});
