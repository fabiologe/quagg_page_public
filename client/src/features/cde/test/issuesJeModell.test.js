// @vitest-environment jsdom
/**
 * Issues leben bei ihrem Modell (Stufe 4 des Aushub-Fachmodells, nachgereicht).
 *
 * Bis 2026-09-10 lag die ganze Issue-Liste unter dem Schlüssel des ZUERST
 * geladenen Modells. Mit zwei Modellen im Raum landeten die Issues am zweiten
 * beim ersten — und wer beim nächsten Mal das zweite zuerst lud, sah sie
 * nicht. Gemessen wird hier, wo ein Issue GESPEICHERT wird, nicht nur, was
 * die Liste zeigt.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { useAnnotationen } from '../composables/useAnnotationen.js';
import { useIfcStore } from '../stores/useIfcStore.js';
import { repo } from '../services/RepoFacade.js';

const warteAufSpeichern = () => new Promise(r => setTimeout(r, 320));   // Entprellung 250 ms
const ids = (liste) => (liste ?? []).map(a => a.id);

beforeEach(async () => {
    localStorage.clear();
    repo.setBackend(null);
    setActivePinia(createPinia());
    await repo.set('annotations:gid:A', [{ id: 'a1', text: 'an A', position: [0, 0, 0] }]);
    await repo.set('annotations:gid:B', [{ id: 'b1', text: 'an B', position: [1, 1, 1] }]);
});

describe('Issues je Modell', () => {
    it('zwei Modelle: beide Listen im Raum, ein neues Issue wird bei SEINEM Modell gespeichert', async () => {
        const ifc = useIfcStore();
        await ifc.synchronisiereAnnotationen([{ key: 'gid:A' }, { key: 'gid:B' }]);
        expect(ids(ifc.annotations)).toEqual(['a1', 'b1']);
        expect(ifc.annotations.map(a => a.idx)).toEqual([1, 2]);                 // durchnummeriert über beide
        ifc.pushAnnotation({ id: 'b2', text: 'neu an B', position: [2, 2, 2], modellKey: 'gid:B' });
        await warteAufSpeichern();
        expect(ids(await repo.get('annotations:gid:B'))).toEqual(['b1', 'b2']);
        expect(ids(await repo.get('annotations:gid:A'))).toEqual(['a1']);        // A bleibt, wie es war
    });

    it('ein Issue ohne Modell (BCF-Import) landet beim ersten; ein entladenes Modell nimmt seine Issues mit — gespeichert bleiben sie', async () => {
        const ifc = useIfcStore();
        await ifc.synchronisiereAnnotationen([{ key: 'gid:A' }, { key: 'gid:B' }]);
        ifc.pushAnnotation({ id: 'x1', text: 'aus BCF', position: [0, 0, 0] });
        await warteAufSpeichern();
        expect(ids(await repo.get('annotations:gid:A'))).toEqual(['a1', 'x1']);
        await ifc.synchronisiereAnnotationen([{ key: 'gid:A' }]);                // B entladen
        expect(ids(ifc.annotations)).toEqual(['a1', 'x1']);
        expect(ids(await repo.get('annotations:gid:B'))).toEqual(['b1']);        // nichts verloren
        await ifc.synchronisiereAnnotationen([{ key: 'gid:B' }, { key: 'gid:A' }]);   // B jetzt ZUERST
        expect(ids(ifc.annotations).sort()).toEqual(['a1', 'b1', 'x1']);
    });

    it('Löschen trifft nur das Modell des Issues; loadAnnotationsForModel bleibt „genau dieses eine"', async () => {
        const ifc = useIfcStore();
        await ifc.synchronisiereAnnotationen([{ key: 'gid:A' }, { key: 'gid:B' }]);
        ifc.removeAnnotation('b1');
        await warteAufSpeichern();
        expect(await repo.get('annotations:gid:B')).toEqual([]);
        expect(ids(await repo.get('annotations:gid:A'))).toEqual(['a1']);
        await ifc.loadAnnotationsForModel('gid:A');
        expect(ids(ifc.annotations)).toEqual(['a1']);
    });

    it('der Klick im Pin-Modus legt das Issue bei dem Modell an, das der Strahl traf — der ECHTE Weg über useAnnotationen', async () => {
        const ifc = useIfcStore();
        await ifc.synchronisiereAnnotationen([{ key: 'gid:A' }, { key: 'gid:B' }]);
        const engine = ref({
            addAnnotation: async () => ({ id: 'b3', position: [3, 3, 3], text: 'Riss', modelId: 'frag-2' }),
            addAnnotationAt: () => ({ id: 'a2', position: [4, 4, 4], text: 'am Bauteil' }),
            setAnnotations: () => {},
        });
        const pins = useAnnotationen({ engine, ifc, cde: { bearbeiter: 'Fabio' }, viewpoint: () => null, aktiv: ref(true),
                                       modellKeyVon: (m) => ({ 'frag-1': 'gid:A', 'frag-2': 'gid:B' })[m] });
        vi.stubGlobal('prompt', () => 'Riss');
        try { await pins.klick({ clientX: 1, clientY: 1 }); } finally { vi.unstubAllGlobals(); }
        pins.anPunkt([4, 4, 4], 'am Bauteil', '#fff', 'frag-1');
        await warteAufSpeichern();
        const b = await repo.get('annotations:gid:B');
        expect(ids(b)).toEqual(['b1', 'b3']);
        expect(ids(await repo.get('annotations:gid:A'))).toEqual(['a1', 'a2']);
        expect(b[1].modelId).toBeUndefined();        // sitzungsgebunden — nie gespeichert
        expect(b[1].modellKey).toBeUndefined();      // der Ort steht nicht noch einmal im Issue
        expect(b[1].author).toBe('Fabio');
    });
});
