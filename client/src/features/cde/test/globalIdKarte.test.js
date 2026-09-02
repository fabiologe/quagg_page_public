/**
 * GlobalId → Bauteil (Stufe 12.0c).
 *
 * Diese Übersetzung hatte KEINEN Test, und sie war die Stelle, an der die
 * Bearbeitung zuletzt hängenblieb: „Eingetragen, aber nicht angewandt —
 * keine_localId".
 *
 * Die alte Fassung lief über alle Kategorien des Modells, holte in Stapeln zu
 * 500 die Attributdaten und suchte darin `GlobalId`. Sie konnte nichts finden:
 * der IfcLoader importiert von Haus aus nur einen schmalen Attributsatz, und
 * die GlobalId gehört nicht dazu — die Bibliothek führt dafür einen eigenen
 * Index (`getLocalIdsByGuids`). Die Karte blieb also immer leer, und weil
 * „leer" gleichbedeutend mit „Bauteil nicht mehr da" ist, sah es aus wie ein
 * Datenproblem statt wie ein Programmfehler.
 */
import { describe, expect, it, vi } from 'vitest';
import { baueGlobalIdKarte } from '../services/GlobalIdKarte.js';

/**
 * Ein Modell mit GUID-Index, wie die Bibliothek es führt.
 * `getLocalIdsByGuids` antwortet STELLUNGSGLEICH zur Anfrage und setzt `null`
 * für Kennungen, die es nicht kennt.
 */
function fakeModell(modelId, index) {
    return {
        modelId,
        getLocalIdsByGuids: vi.fn(async (guids) => guids.map(g => index[g] ?? null)),
    };
}

describe('Nachschlagen über den GUID-Index', () => {
    it('findet ein Bauteil und nennt Modell und localId', async () => {
        const m = fakeModell('m1', { '3xY': 42 });
        const { karte, fehlend } = await baueGlobalIdKarte({ modelle: [m], gesuchte: ['3xY'] });

        expect(karte.get('3xY')).toEqual({ modelId: 'm1', localId: 42 });
        expect(fehlend).toEqual([]);
        // EIN Aufruf für alle Kennungen — nicht ein Durchlauf durchs Modell.
        expect(m.getLocalIdsByGuids).toHaveBeenCalledOnce();
    });

    it('meldet, was kein Modell kennt — statt es zu verschweigen', async () => {
        // `fehlend` ist kein Fehler, sondern der Anlass für einen Konflikt:
        // ein Bauteil kann in dieser Revision schlicht nicht mehr da sein.
        const m = fakeModell('m1', { '3xY': 42 });
        const { karte, fehlend } = await baueGlobalIdKarte({
            modelle: [m], gesuchte: ['3xY', 'weg'],
        });
        expect([...karte.keys()]).toEqual(['3xY']);
        expect(fehlend).toEqual(['weg']);
    });

    it('sucht über mehrere Modelle und hört auf, sobald alles gefunden ist', async () => {
        const a = fakeModell('gelaende', { 'G1': 7 });
        const b = fakeModell('kanal', { '3xY': 42 });
        const c = fakeModell('spaeter', { 'X': 1 });

        const { karte } = await baueGlobalIdKarte({
            modelle: [a, b, c], gesuchte: ['G1', '3xY'],
        });
        expect(karte.get('G1')).toEqual({ modelId: 'gelaende', localId: 7 });
        expect(karte.get('3xY')).toEqual({ modelId: 'kanal', localId: 42 });
        expect(c.getLocalIdsByGuids).not.toHaveBeenCalled();
    });

    it('das CDE-eigene Modell wird genauso gefunden wie geliefertes', async () => {
        // Erzeugte Bauteile tragen ihre selbst vergebene Kennung als `_guid`
        // ins Modell — deshalb ist für sie kein Sonderweg nötig.
        const cde = fakeModell('cde-eigenbau', { 'cde-a1b2': 3 });
        const { karte } = await baueGlobalIdKarte({ modelle: [cde], gesuchte: ['cde-a1b2'] });
        expect(karte.get('cde-a1b2')).toEqual({ modelId: 'cde-eigenbau', localId: 3 });
    });

    it('ein Modell, das den Index nicht anbietet, wird übersprungen statt zu werfen', async () => {
        const ohne = { modelId: 'alt' };
        const m = fakeModell('m1', { '3xY': 42 });
        const { karte } = await baueGlobalIdKarte({ modelle: [ohne, m], gesuchte: ['3xY'] });
        expect(karte.get('3xY')).toEqual({ modelId: 'm1', localId: 42 });
    });

    it('ein werfendes Modell bricht die Suche nicht ab', async () => {
        const kaputt = { modelId: 'kaputt', getLocalIdsByGuids: async () => { throw new Error('weg'); } };
        const m = fakeModell('m1', { '3xY': 42 });
        const { karte, fehlend } = await baueGlobalIdKarte({ modelle: [kaputt, m], gesuchte: ['3xY'] });
        expect(karte.get('3xY')).toEqual({ modelId: 'm1', localId: 42 });
        expect(fehlend).toEqual([]);
    });

    it('ohne Suchauftrag wird gar nicht erst nachgeschlagen', async () => {
        const m = fakeModell('m1', { '3xY': 42 });
        expect((await baueGlobalIdKarte({ modelle: [m], gesuchte: [] })).karte.size).toBe(0);
        expect((await baueGlobalIdKarte()).fehlend).toEqual([]);
        expect(m.getLocalIdsByGuids).not.toHaveBeenCalled();
    });

    it('ordnet die Antwort STELLUNGSGLEICH zu, nicht der Reihe nach', async () => {
        // Der gefährlichste denkbare Fehler an dieser Stelle: eine Kennung auf
        // das falsche Bauteil abzubilden. Dann verschöbe eine Festlegung ein
        // fremdes Bauteil, und niemand hätte einen Anhaltspunkt.
        const m = {
            modelId: 'm1',
            // Antwortet mit einer Lücke in der Mitte.
            getLocalIdsByGuids: async (guids) => guids.map(g => (g === 'b' ? null : (g === 'a' ? 1 : 3))),
        };
        const { karte, fehlend } = await baueGlobalIdKarte({
            modelle: [m], gesuchte: ['a', 'b', 'c'],
        });
        expect(karte.get('a')).toEqual({ modelId: 'm1', localId: 1 });
        expect(karte.get('c')).toEqual({ modelId: 'm1', localId: 3 });
        expect(karte.has('b')).toBe(false);
        expect(fehlend).toEqual(['b']);
    });
});
