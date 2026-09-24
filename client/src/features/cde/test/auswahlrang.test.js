/**
 * Was ein Klick wählt (Teil XXII, 2026-09-18).
 *
 * Fabio: „niemand will das editierbare Gelände anklicken — man will die
 * EarthCuts und Fills, die Haltungen und andere Dinge anklicken." Seit
 * „Gelände gewinnt" liegt die Anzeige deckend obenauf und jeder Erdkörper
 * 2 cm darunter; der nächste Treffer war fast immer das Gelände.
 *
 * Erst die Regel (rein), dann `pickElement` gegen den echten Methodenkörper
 * mit einer Attrappe in der Form der Bibliothek (`raycastAll` je Modell).
 */
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { DURCHGRIFF_M, rangiereTreffer, waehleKandidat } from '../services/Auswahlrang.js';
import { IfcEngine } from '../services/IfcEngine.js';
import { CDE_MODELL_ID } from '../services/IfcAutor.js';

const art = (arten) => (t) => arten[t.key] ?? 'bauteil';

describe('rangiereTreffer — erst die Art, dann die Nähe', () => {
    const ARTEN = { 'c:1': 'gelaende', 'c:2': 'erdkoerper', 'n:7': 'bauteil' };

    it('der Erdkörper 2 cm unter dem Gelände gewinnt', () => {
        const k = rangiereTreffer([{ key: 'c:1', distance: 50 }, { key: 'c:2', distance: 50.02 }], art(ARTEN));
        expect(k.map(x => x.key)).toEqual(['c:2']);
    });

    it('die Haltung im Erdkörper gewinnt vor dem Erdkörper — das Gelände steht gar nicht zur Wahl', () => {
        const k = rangiereTreffer([{ key: 'c:1', distance: 50 }, { key: 'c:2', distance: 50.02 }, { key: 'n:7', distance: 52 }], art(ARTEN));
        expect(k.map(x => x.art)).toEqual(['bauteil', 'erdkoerper']);
    });

    // K3, Fabio 2026-09-20: „immer wählt man das Planungsgelände aus."
    it('allein unter dem Zeiger ergibt das Gelände KEINEN Kandidaten', () => {
        expect(rangiereTreffer([{ key: 'c:1', distance: 50 }], art(ARTEN))).toEqual([]);
    });

    it('mit gelaendeWaehlbar bleibt der alte Weg offen — der Filter sitzt an EINER Stelle', () => {
        const k = rangiereTreffer([{ key: 'c:1', distance: 50 }], art(ARTEN), { gelaendeWaehlbar: true });
        expect(k.map(x => x.key)).toEqual(['c:1']);
    });

    it('was weit hinter dem Gelände liegt, zählt nicht — auch wenn das Gelände selbst nicht wählbar ist', () => {
        // Die Grenze kommt WEITER vom Geländetreffer: sonst zöge der Klick eine
        // ferne Haltung heran, nur weil der Deckel fehlt, der sie verdeckt.
        const k = rangiereTreffer([{ key: 'c:1', distance: 50 }, { key: 'n:7', distance: 50 + DURCHGRIFF_M + 1 }], art(ARTEN));
        expect(k).toEqual([]);
        // Gegenprobe: knapp darunter zählt sie sehr wohl.
        const nah = rangiereTreffer([{ key: 'c:1', distance: 50 }, { key: 'n:7', distance: 50 + DURCHGRIFF_M - 1 }], art(ARTEN));
        expect(nah.map(x => x.key)).toEqual(['n:7']);
    });

    it('ein Randstrahl, der nur das Gelände trifft, verschiebt die Grenze nicht', () => {
        // Der Mittelstrahl trifft das Gelände bei 50; ein Randstrahl bei 20
        // (Hang) darf nicht die Haltung bei 60 unter dem Zeiger ausschliessen.
        const k = rangiereTreffer([{ key: 'c:1', distance: 50, strahl: 0 }, { key: 'c:1', distance: 20, strahl: 3 },
                                   { key: 'n:7', distance: 60, strahl: 0 }], art(ARTEN));
        expect(k[0].key).toBe('n:7');
    });

    it('je Bauteil ein Kandidat — der nächste Treffer', () => {
        const k = rangiereTreffer([{ key: 'n:7', distance: 9 }, { key: 'n:7', distance: 5 }], art(ARTEN));
        expect(k).toHaveLength(1);
        expect(k[0].distance).toBe(5);
    });
});

describe('waehleKandidat — nochmal tippen geht eins weiter', () => {
    const K = [{ key: 'a' }, { key: 'b' }, { key: 'c' }];
    it('erster Tipp: der erste', () => expect(waehleKandidat(K)).toEqual({ kandidat: K[0], nr: 1 }));
    it('wiederholt auf dem Gewählten: der nächste, am Ende wieder der erste', () => {
        expect(waehleKandidat(K, { gewaehlt: 'a', wiederholt: true }).nr).toBe(2);
        expect(waehleKandidat(K, { gewaehlt: 'c', wiederholt: true }).nr).toBe(1);
    });
    it('an anderer Stelle: wieder der erste', () => {
        expect(waehleKandidat(K, { gewaehlt: 'a', wiederholt: false }).nr).toBe(1);
    });
});

/** Engine-Attrappe: EIN CDE-Modell mit Gelände (1) und Erdkörper (2) übereinander. */
function attrappe({ alle, naechster }) {
    const modell = { modelId: CDE_MODELL_ID, raycast: vi.fn(async () => naechster), raycastAll: vi.fn(async () => alle) };
    const fragments = {
        list: new Map([[CDE_MODELL_ID, modell]]),
        raycast: vi.fn(async () => naechster),
        highlight: vi.fn(async () => {}),
        resetHighlight: vi.fn(async () => {}),
        getData: vi.fn(async () => [{}]),
    };
    const camera = new THREE.PerspectiveCamera(50, 4 / 3, 0.1, 1000);
    const canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) };
    const engine = Object.create(IfcEngine.prototype);
    Object.assign(engine, {
        components: { get: () => fragments },
        _getWorld: () => ({ camera: { three: camera }, renderer: { three: { domElement: canvas } } }),
        _selectedItems: null, _selectedKey: null, _hoveredKey: null,
        _faerbungen: new Map(),
        camera: { orbitAroundSelection: vi.fn(async () => {}) },
        _parseItemData: () => ({}),
        _globalIdVon: async (_m, l) => `g${l}`,
        _gelaendeOrte: [{ modelId: CDE_MODELL_ID, localId: 1 }],
        autor: { erdkoerper: new Map([['gE', { localId: 2, ableitung: 'ab-1', rolle: 'aushub' }]]) },
    });
    return { engine, fragments, modell };
}
const hit = (localId, distance) => ({ localId, distance, point: new THREE.Vector3(0, 0, 0), fragments: { modelId: CDE_MODELL_ID } });

describe('pickElement: der Erdkörper unter dem deckenden Gelände', () => {
    it('der erste Tipp wählt den Erdkörper — das Gelände steht gar nicht in der Liste', async () => {
        const t = attrappe({ alle: [hit(1, 50), hit(2, 50.02)], naechster: hit(1, 50) });
        const r = await t.engine.pickElement(100, 100);
        expect(r.localId).toBe(2);
        expect(r.auswahl).toMatchObject({ nr: 1, von: 1, arten: ['erdkoerper'] });
        expect(t.modell.raycastAll).toHaveBeenCalled();
    });

    it('nochmal an derselben Stelle bleibt es der Erdkörper — kein Durchtippen ins Gelände (K3)', async () => {
        const t = attrappe({ alle: [hit(1, 50), hit(2, 50.02)], naechster: hit(1, 50) });
        await t.engine.pickElement(100, 100);
        const zweiter = await t.engine.pickElement(102, 101);
        expect(zweiter.gleich).toBe(true);
        expect(zweiter.localId).toBe(2);
    });

    it('liegt NUR Gelände unter dem Zeiger, wählt der Klick nichts — mit Grund', async () => {
        const t = attrappe({ alle: [hit(1, 50)], naechster: hit(1, 50) });
        expect(await t.engine.pickElement(100, 100)).toBeNull();
        expect(t.engine.letzterLeergrund()).toBe('gelaende');
    });

    it('trifft der Klick gar nichts, ist der Grund leer — nicht „Gelände"', async () => {
        const t = attrappe({ alle: [], naechster: null });
        expect(await t.engine.pickElement(100, 100)).toBeNull();
        expect(t.engine.letzterLeergrund()).toBeNull();
    });

    it('scheitert die Geländeliste, gilt der letzte bekannte Stand — NICHT „alles ist Bauteil"', async () => {
        const t = attrappe({ alle: [hit(1, 50), hit(2, 50.02)], naechster: hit(1, 50) });
        await t.engine.pickElement(100, 100);                 // einmal erfolgreich: das Gedächtnis füllt sich
        expect(t.engine._gelaendeSchluessel?.size).toBe(1);

        // Jetzt fällt die Liste aus — früher wurde das Gelände dadurch Rang 0
        // und gewann JEDEN Klick, also der Fehler in verschärfter Form.
        t.engine._gelaendeOrteHolen = vi.fn(async () => { throw new Error('Liste weg'); });
        t.engine._selectedKey = null;
        t.engine._letzterPick = null;
        const r = await t.engine.pickElement(400, 300);
        expect(r.localId).toBe(2);                            // weiterhin der Erdkörper
        expect(r.auswahl.arten).toEqual(['erdkoerper']);
    });

    it('an anderer Stelle desselben Erdkörpers: nichts ändert sich („gleich")', async () => {
        const t = attrappe({ alle: [hit(1, 50), hit(2, 50.02)], naechster: hit(1, 50) });
        await t.engine.pickElement(100, 100);
        const r = await t.engine.pickElement(300, 200);
        expect(r.gleich).toBe(true);
        expect(r.localId).toBe(2);
    });
});
