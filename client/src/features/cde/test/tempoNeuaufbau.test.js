/**
 * Teil XXX, B4 — ein Kommando wartet nicht mehr auf Fragen, deren Antwort feststeht.
 *
 * Gemessen im Projekt 10001 (43 Teile, nur lesend): ein Neuaufbau nach jedem
 * Kommando dauerte rund 20 s. Der grösste Teil war Warten auf den
 * fragments-Worker — mit Fragen, deren Antwort schon da war:
 *   - dieselben Netze des gelieferten Geländes (Quellformen, eigener Test
 *     im Profil: 5,2 s),
 *   - dasselbe GlobalId-Nachschlagen in gelieferten Modellen (jede Frage
 *     rund 290 ms, auch im Leerlauf) und in einem Eigenbau, dessen Inhalt
 *     der Autor gerade selbst gebaut hat,
 *   - das Netz eines Erdkörpers für seinen Umriss, das der Autor in der
 *     Hand hielt,
 *   - Zeigen und Neuzeichnen eines frisch gebauten Modells, in dem ohnehin
 *     alles sichtbar ist.
 * Geprüft an den echten Funktionen (`baueGlobalIdKarte`, `IfcEngine`), die
 * Bibliothek als Attrappe in ihrer Form.
 */
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import * as OBC from '@thatopen/components';
import { baueGlobalIdKarte, karteMitEngine } from '../services/GlobalIdKarte.js';
import { netzAusGeometrie } from '../services/GelaendeKanten.js';
import { IfcEngine, DELTA_MARKE } from '../services/IfcEngine.js';
import { CDE_MODELL_ID } from '../services/IfcAutor.js';

/** Ein Modell in der Form der Bibliothek, das seine Fragen zählt. */
function modell(modelId, kennt = {}) {
    return {
        modelId,
        getLocalIdsByGuids: vi.fn(async (guids) => guids.map(g => (g in kennt ? kennt[g] : null))),
    };
}
const fragen = (m) => m.getLocalIdsByGuids.mock.calls;

describe('baueGlobalIdKarte merkt sich, was ein festes Modell weiss', () => {
    const fest = (id) => id === 'gelaende.ifc';

    it('ein festes Modell wird für dieselben Kennungen nur einmal gefragt — auch für „kenne ich nicht"', async () => {
        const g = modell('gelaende.ifc', { A: 7 });
        const speicher = new Map();
        const erst = await baueGlobalIdKarte({ modelle: [g], gesuchte: ['A', 'X'], speicher, fest });
        const dann = await baueGlobalIdKarte({ modelle: [g], gesuchte: ['A', 'X'], speicher, fest });
        expect(fragen(g)).toHaveLength(1);                        // vorher: 2
        expect(dann).toEqual(erst);
        expect(dann.karte.get('A')).toEqual({ modelId: 'gelaende.ifc', localId: 7 });
        expect(dann.fehlend).toEqual(['X']);
    });

    it('nur das Unbekannte wird nachgefragt', async () => {
        const g = modell('gelaende.ifc', { A: 7, B: 8 });
        const speicher = new Map();
        await baueGlobalIdKarte({ modelle: [g], gesuchte: ['A'], speicher, fest });
        await baueGlobalIdKarte({ modelle: [g], gesuchte: ['A', 'B'], speicher, fest });
        expect(fragen(g)[1][0]).toEqual(['B']);
    });

    it('ein Modell, das nicht fest ist, wird jedes Mal gefragt', async () => {
        const d = modell(`gelaende.ifc${DELTA_MARKE}1`, { A: 3 });
        const speicher = new Map();
        await baueGlobalIdKarte({ modelle: [d], gesuchte: ['A'], speicher, fest });
        await baueGlobalIdKarte({ modelle: [d], gesuchte: ['A'], speicher, fest });
        expect(fragen(d)).toHaveLength(2);
    });

    it('die Ladereihenfolge entscheidet weiter — gemerkt oder nicht', async () => {
        const g = modell('gelaende.ifc', { A: 7 });
        const zweit = modell('zweit.ifc', { A: 9 });
        const speicher = new Map();
        for (let i = 0; i < 2; i++) {
            const { karte } = await baueGlobalIdKarte({ modelle: [g, zweit], gesuchte: ['A'], speicher, fest });
            expect(karte.get('A').modelId).toBe('gelaende.ifc');
        }
        expect(fragen(zweit)).toHaveLength(0);                    // alles gefunden, bevor es dran war
    });

    it('was ein Modell VOLLSTÄNDIG kennt, beantwortet sich ohne Frage — Fremdes sucht weiter', async () => {
        const eigen = modell(`${CDE_MODELL_ID}${DELTA_MARKE}2`, { 'cde-1': 5 });
        const g = modell('gelaende.ifc', { A: 7 });
        const bekannt = (id) => (id === eigen.modelId ? new Map([['cde-1', 5]]) : null);
        const { karte } = await baueGlobalIdKarte({ modelle: [eigen, g], gesuchte: ['cde-1', 'A'], bekannt });
        expect(fragen(eigen)).toHaveLength(0);
        expect(karte.get('cde-1')).toEqual({ modelId: eigen.modelId, localId: 5 });
        expect(karte.get('A')).toEqual({ modelId: 'gelaende.ifc', localId: 7 });
    });
});

/** Eine Engine mit geliefertem Gelände und gebautem Eigenbau (Basis + ein Delta). */
function engineMitEigenbau({ deltas = 1, gebaut = new Map([['cde-1', 5], ['cde-2', 6]]) } = {}) {
    const g = modell('gelaende.ifc', { A: 7 });
    const basis = modell(CDE_MODELL_ID, {});
    const liste = new Map([[g.modelId, g], [basis.modelId, basis]]);
    const ds = [];
    for (let i = 0; i < deltas; i++) {
        const d = modell(`${CDE_MODELL_ID}${DELTA_MARKE}${i + 1}`, Object.fromEntries(gebaut));
        liste.set(d.modelId, d); ds.push(d);
    }
    const fragments = { list: liste, core: { update: vi.fn(async () => {}) } };
    const e = Object.create(IfcEngine.prototype);
    Object.assign(e, { components: { get: () => fragments }, autor: { gebaut } });
    return { e, g, basis, ds, fragments };
}

describe('die Engine sagt, welche Antworten feststehen', () => {
    it('fest ist nur ein geliefertes Basismodell', () => {
        const { e } = engineMitEigenbau();
        const { fest } = e.guidSpeicher();
        expect(fest('gelaende.ifc')).toBe(true);
        expect(fest(`gelaende.ifc${DELTA_MARKE}1`)).toBe(false);
        expect(fest(CDE_MODELL_ID)).toBe(false);
        expect(fest(`${CDE_MODELL_ID}${DELTA_MARKE}1`)).toBe(false);
    });

    it('den Eigenbau kennt der Autor: das Delta kennt das Gebaute, die Basis nichts', () => {
        const { e, ds } = engineMitEigenbau();
        expect(e._eigeneGuidKarte(ds[0].modelId)).toBe(e.autor.gebaut);
        expect(e._eigeneGuidKarte(CDE_MODELL_ID)).toEqual(new Map());
        expect(e._eigeneGuidKarte('gelaende.ifc')).toBe(null);
    });

    it('ohne genau ein Delta oder ohne Gebautes weiss die Engine es nicht — dann fragt der Worker', () => {
        expect(engineMitEigenbau({ deltas: 0 }).e._eigeneGuidKarte(CDE_MODELL_ID)).toBe(null);
        expect(engineMitEigenbau({ deltas: 2 }).e._eigeneGuidKarte(CDE_MODELL_ID)).toBe(null);
        expect(engineMitEigenbau({ gebaut: new Map() }).e._eigeneGuidKarte(CDE_MODELL_ID)).toBe(null);
    });

    it('karteMitEngine: zwei Kommandos hintereinander fragen den Worker einmal für das Gelände und nie für den Eigenbau', async () => {
        const { e, g, basis, ds } = engineMitEigenbau();
        for (let i = 0; i < 2; i++) {
            const { karte } = await karteMitEngine(e, ['A', 'cde-2', 'weg']);
            expect(karte.get('A')).toEqual({ modelId: 'gelaende.ifc', localId: 7 });
            expect(karte.get('cde-2')).toEqual({ modelId: ds[0].modelId, localId: 6 });
        }
        expect(fragen(g)).toHaveLength(1);                        // vorher: 2
        expect(fragen(basis)).toHaveLength(0);                    // vorher: 2
        expect(fragen(ds[0])).toHaveLength(0);                    // vorher: 2
    });

    it('Entladen vergisst, was gemerkt war', async () => {
        const { e, g } = engineMitEigenbau();
        await karteMitEngine(e, ['A']);
        await e.unloadModel('nicht-da.ifc');
        await karteMitEngine(e, ['A']);
        expect(fragen(g)).toHaveLength(2);
    });

    it('eine Festlegung an Geliefertem vergisst es, ein Eigenbau-Aufbau nicht', async () => {
        const { e, g } = engineMitEigenbau();
        e.autor.wendeAn = vi.fn(async () => ({ auszublenden: [], einzublenden: [] }));
        e.erdkoerperSichtbarkeitAnwenden = vi.fn(async () => {});
        await karteMitEngine(e, ['A']);
        await e.wendeFestlegungenAn({ anzuwenden: [{ art: 'erzeugt', modell: 'cde', globalId: 'cde-1' }] });
        await karteMitEngine(e, ['A']);
        expect(fragen(g)).toHaveLength(1);
        await e.wendeFestlegungenAn({ anzuwenden: [{ art: 'lage', globalId: 'A' }] });
        await karteMitEngine(e, ['A']);
        expect(fragen(g)).toHaveLength(2);
    });
});

/** Engine mit einem gebauten Erdkörper, dessen Netz der Autor hält. */
function engineMitErdkoerper({ verdeckt = false } = {}) {
    const hider = { set: vi.fn(async () => {}) };
    const fragments = { list: new Map(), core: { update: vi.fn(async () => {}) } };
    const geometrie = new THREE.BoxGeometry(2, 1, 3);           // indiziert, wie aus dem Rezept
    const e = Object.create(IfcEngine.prototype);
    Object.assign(e, {
        components: { get: (k) => (k === OBC.Hider ? hider : fragments) },
        erdbauUmrisse: { setze: vi.fn(), sichtbarkeit: vi.fn() },
        makeGeometryResolver: vi.fn(() => ({ forElements: () => ({ getForm: async () => ({ data: null }) }) })),
        autor: {
            erdkoerper: new Map([['cde-a', { ableitung: 'ab', rolle: 'aushub', kategorie: 'IFCEARTHWORKSCUT', localId: 11, geometrie }]]),
            ableitungen: new Map([['ab', { kennzahlen: { verdecktVon: verdeckt ? [{ ableitung: 'x', anteil: 1 }] : [] } }]]),
        },
    });
    return { e, hider, fragments, geometrie };
}

describe('nach dem Aufbau: nur verbergen, nur bei Änderung neu zeichnen, Umriss aus dem gebauten Netz', () => {
    it('ein frisch gebautes Modell wird nicht „gezeigt" und nicht neu gezeichnet', async () => {
        const { e, hider, fragments } = engineMitErdkoerper();
        await e.erdkoerperSichtbarkeitAnwenden({ nachAufbau: true });
        expect(hider.set).not.toHaveBeenCalled();                // vorher: set(true, [11])
        expect(fragments.core.update).not.toHaveBeenCalled();    // vorher: update(true)
    });

    it('ein verdeckter Vorgang wird nach dem Aufbau verborgen — und das Bild nachgezogen', async () => {
        const { e, hider, fragments } = engineMitErdkoerper({ verdeckt: true });
        await e.erdkoerperSichtbarkeitAnwenden({ nachAufbau: true });
        expect(hider.set).toHaveBeenCalledWith(false, expect.anything());
        expect(hider.set.mock.calls.some(([s]) => s === true)).toBe(false);
        expect(fragments.core.update).toHaveBeenCalledTimes(1);
    });

    it('ohne `nachAufbau` (Auge, „alles ein") zeigt sie wie bisher', async () => {
        const { e, hider, fragments } = engineMitErdkoerper();
        await e.erdkoerperSichtbarkeitAnwenden();
        expect(hider.set).toHaveBeenCalledWith(true, expect.anything());
        expect(fragments.core.update).toHaveBeenCalledTimes(1);
    });

    it('der Umriss nimmt das Netz des Autors und fragt den Worker nicht', async () => {
        const { e, geometrie } = engineMitErdkoerper();
        await e._erdbauUmrisseNachziehen();
        expect(e.makeGeometryResolver).not.toHaveBeenCalled();   // vorher: ein Netz je Körper aus dem Worker
        const [[aus]] = e.erdbauUmrisse.setze.mock.calls;
        const netz = aus.get(`${CDE_MODELL_ID}|11`)?.netz;
        expect(netz.triCount).toBe(12);
        expect([...netz.positions]).toEqual([...geometrie.toNonIndexed().attributes.position.array]);
    });

    it('ohne Netz des Autors fragt der Umriss den Worker wie bisher', async () => {
        const { e } = engineMitErdkoerper();
        e.autor.erdkoerper.get('cde-a').geometrie = null;
        await e._erdbauUmrisseNachziehen();
        expect(e.makeGeometryResolver).toHaveBeenCalled();
    });
});

describe('netzAusGeometrie', () => {
    it('löst ein indiziertes Netz in Dreiecke auf und reicht ein offenes durch', () => {
        const box = new THREE.BoxGeometry(1, 1, 1);
        const a = netzAusGeometrie(box);
        expect(a.triCount).toBe(12);
        expect([...a.positions]).toEqual([...box.toNonIndexed().attributes.position.array]);
        const offen = box.toNonIndexed();
        expect(netzAusGeometrie(offen)).toEqual({ positions: offen.attributes.position.array, triCount: 12 });
        expect(netzAusGeometrie(null)).toBe(null);
    });
});

describe('die Netze gelieferter Bauteile liegen im Speicher, bis sich die Lieferung ändert', () => {
    function engineMitNetzen() {
        const { e, g, ds } = engineMitEigenbau();
        const netz = () => ({ positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, 1]), triCount: 1 });
        e.makeGeometryResolver = vi.fn(() => ({ forElements: () => ({ getForm: async () => ({ data: netz() }) }) }));
        return { e, g, ds };
    }

    it('dasselbe gelieferte Netz wird einmal geholt — und als Kopie herausgegeben', async () => {
        const { e } = engineMitNetzen();
        const a = await e._quellFormVon('A', 'mesh');
        a.positions[0] = 99;                                      // ein Leser verändert sein Netz …
        const b = await e._quellFormVon('A', 'mesh');
        expect(e.makeGeometryResolver).toHaveBeenCalledTimes(1);  // vorher: 2
        expect(b.positions[0]).toBe(0);                           // … den anderen nicht
    });

    it('ein eigenes Netz wird jedes Mal geholt — der Eigenbau entsteht bei jedem Aufbau neu', async () => {
        const { e } = engineMitNetzen();
        await e._quellFormVon('cde-1', 'mesh');
        await e._quellFormVon('cde-1', 'mesh');
        expect(e.makeGeometryResolver).toHaveBeenCalledTimes(2);
    });

    it('nach dem Vergessen wird wieder geholt', async () => {
        const { e } = engineMitNetzen();
        await e._quellFormVon('A', 'mesh');
        e.quellNetzeVergessen();
        await e._quellFormVon('A', 'mesh');
        expect(e.makeGeometryResolver).toHaveBeenCalledTimes(2);
    });
});
