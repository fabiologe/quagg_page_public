// @vitest-environment jsdom
/**
 * Die Bearbeitungskette von der Auswahl bis zum Modell (Stufe 12.0c).
 *
 * WARUM ES DIESE DATEI GIBT
 *
 * Die Kette hat acht Stationen — Klick, Einordnung, Katalog, Formular,
 * Journaleintrag, Weiche, Plan, Modell. Für fast jede gab es einen Test. Für
 * die ÜBERGÄNGE gab es keinen, und genau dort riss sie: der weiteste Test
 * (`bearbeitungStore.test.js`) endete am Journal, `IfcAutor` begann beim
 * fertigen Plan. Dazwischen lag der Fehler, der die ganze Bearbeitung tot
 * liegen liess — und er konnte dort liegen, weil beide Seiten für sich richtig
 * aussahen.
 *
 * Diese Datei geht den Weg in einem Stück, mit den ECHTEN Funktionen
 * (`ausfuehren`, `anwendungsweg`, `planFuerEintrag`, `IfcAutor.wendeAn`).
 * Attrappe ist nur der Fragments-Manager — und der in der Form, die
 * `fragmentsVertrag.test.js` gegen die Bibliothek hält.
 *
 * Die Verklebung in den beiden `.vue`-Aufrufern steht in
 * `bearbeitungVerklebung.test.js` — sie liest Dateien und verträgt deshalb
 * kein jsdom (dort ist `import.meta.url` keine `file:`-URL).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import * as THREE from 'three';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { useAenderungen } from '../stores/useAenderungen.js';
import { IfcAutor, modellHerkunft, CDE_MODELL_ID } from '../services/IfcAutor.js';
import { anwendungsweg, planFuerEintrag } from '../services/Nachspielen.js';
beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    // Der Bearbeiten-Modus ist mit Absicht AUS, solange ihn niemand
    // einschaltet — die Sperre soll der Zustand sein, in den man ohne Zutun
    // gerät. Diese Datei prüft, was IM Modus geschieht; dass ausserhalb nichts
    // geschieht, prüft `bearbeitenModus.test.js`.
    useBearbeitung().modusSetzen(true);
});

/** Das Rohr, wie es aus `pickElement` + `_einordnenMitHuelle` herauskommt. */
const ROHR = {
    modelId: 'm1', localId: 42, category: 'IFCPIPESEGMENT', globalId: '3xY',
    // Hülle: Unterkante 14, Oberkante 16, Anker (Mitte) auf 15.
    anker: { x: 100, y: 15, z: 200 },
    bezugshoehe: 14,
    oberkante: 16,
    // Der gemessene Versatz aus Stufe 13.3: Welt 14 ist 300 m NN.
    hoehenversatz: 286,
};

const resolverEchteAchse = {
    forElements: () => ({
        async getForm(form) {
            if (form === 'axis') {
                return { form, perElement: [{ polyline: [[0, 0, 0], [1, 0, 0]], source: 'axisRep', warnings: [] }] };
            }
            return { form, data: null, perElement: [], warnings: [] };
        },
    }),
};

function fakeElement(localId) {
    const gruppe = new THREE.Group();
    return { localId, gruppe, getMeshes: async () => gruppe, setMeshes: async () => {} };
}

/** Manager-Attrappe in der Form der echten Bibliothek: Editor an `core`. */
function fakeManager({ modelId = 'm1', box = null } = {}) {
    const elemente = new Map();
    const editor = {
        getElements: vi.fn(async (_mid, ids) => ids.map((id) => {
            if (!elemente.has(id)) elemente.set(id, fakeElement(id));
            return elemente.get(id);
        })),
        createElements: vi.fn(async () => [fakeElement(99)]),
        deleteElements: vi.fn(),
        applyChanges: vi.fn(async () => []),
    };
    // Die Hülle wandert mit dem Bauteil. Ohne das rechnete `setzeAnker` jede
    // weitere Verschiebung gegen die ALTE Lage — die Rücknahme bewegte dann
    // nichts, und der Test hätte einen Fehler behauptet, den es nicht gibt.
    const grund = box ?? new THREE.Box3(
        new THREE.Vector3(99, 14, 199), new THREE.Vector3(101, 16, 201));
    const modell = {
        modelId,
        getBoxes: vi.fn(async (ids) => ids.map((id) => {
            const lage = elemente.get(id)?.gruppe.position ?? new THREE.Vector3();
            return grund.clone().translate(lage);
        })),
    };
    return {
        list: new Map([[modelId, modell]]),
        core: { editor, update: vi.fn(async () => {}), load: vi.fn(async () => {}) },
        _elemente: elemente, _editor: editor,
    };
}

/**
 * Was `CdeToolbox.uebernehmen()` tut — Schritt für Schritt, mit denselben
 * Funktionen. Das Formular selbst ist eine `.vue` und hier nicht erreichbar;
 * dass die beiden Aufrufer wirklich so rufen, prüft der letzte Abschnitt.
 */
async function uebernehmen(b, autor, { globalIdZuLocalId } = {}) {
    const el = b.bauteil;
    const eintrag = await b.ausfuehren({
        wer: 'pruefer',
        modellSha: 'sha-1',
        basis: { x: 100, y: 15, z: 200 },          // Lieferstand = Ausgangslage
        modell: modellHerkunft(el.modelId),
    });
    if (!eintrag) return { eintrag: null, grund: b.letzterGrund };

    const weg = anwendungsweg(eintrag);
    const plan = planFuerEintrag(eintrag, el.modelId);
    const r = plan ? await autor.wendeAn(plan, { globalIdZuLocalId }) : null;
    return { eintrag, weg, ergebnis: r };
}

describe('Von der Auswahl bis ins Modell', () => {
    it('eine Bezugshöhe verschiebt das Bauteil wirklich', async () => {
        // Fabios Fall: das Feld zeigt 300,00 m NN, er trägt 305 ein.
        const manager = fakeManager();
        const autor = new IfcAutor({ getFragments: () => manager });
        const b = useBearbeitung();

        await b.einordne({ ...ROHR }, resolverEchteAchse);
        expect(b.starte('bezugshoehe-setzen')).toBe(true);
        expect(b.werte.hoehe).toBeCloseTo(300, 6);      // 14 + 286

        b.setzeWert('hoehe', 305);
        const { eintrag, weg, ergebnis } = await uebernehmen(b, autor, {
            globalIdZuLocalId: new Map([['3xY', 42]]),
        });

        expect(eintrag.art).toBe('lage');
        expect(weg).toBe('einzeln');
        expect(ergebnis.misserfolge).toEqual([]);
        // Der Anker wandert um genau die Differenz — 5 m, nicht auf 305.
        expect(eintrag.nachher.y).toBeCloseTo(20, 6);
        expect(manager._elemente.get(42).gruppe.position.y).toBeCloseTo(5, 6);
        // Und es wurde neu gezeichnet, sonst sähe man nichts davon.
        expect(manager.core.update).toHaveBeenCalled();
    });

    it('der Eintrag trägt Lieferstand und Herkunft', async () => {
        // Ohne `basis` ist der Drei-Wege-Vergleich abgeschaltet; ohne `modell`
        // sucht das Nachspielen ein erzeugtes Bauteil im gelieferten Modell.
        const autor = new IfcAutor({ getFragments: () => fakeManager() });
        const b = useBearbeitung();
        await b.einordne({ ...ROHR }, resolverEchteAchse);
        b.starte('bezugshoehe-setzen');
        b.setzeWert('hoehe', 305);

        const { eintrag } = await uebernehmen(b, autor, {
            globalIdZuLocalId: new Map([['3xY', 42]]),
        });
        expect(eintrag.basis).toEqual({ x: 100, y: 15, z: 200 });
        expect(eintrag.modell).toBe('geliefert');
    });

    it('an einem selbst erzeugten Bauteil gilt die Herkunft „cde"', async () => {
        const autor = new IfcAutor({ getFragments: () => fakeManager({ modelId: CDE_MODELL_ID }) });
        const b = useBearbeitung();
        await b.einordne({ ...ROHR, modelId: CDE_MODELL_ID }, resolverEchteAchse);
        b.starte('bezugshoehe-setzen');
        b.setzeWert('hoehe', 305);

        const { eintrag } = await uebernehmen(b, autor);
        expect(eintrag.modell).toBe('cde');
    });

    it('dieselbe Eingabe zweimal ergibt EINEN Eintrag — und sagt warum', async () => {
        // Genau die Meldung, die Fabio sah. Sie ist richtig, sobald das Modell
        // wirklich mitwandert: der zweite Versuch ist dann keiner mehr.
        const autor = new IfcAutor({ getFragments: () => fakeManager() });
        const b = useBearbeitung();
        const karte = new Map([['3xY', 42]]);

        await b.einordne({ ...ROHR }, resolverEchteAchse);
        b.starte('bezugshoehe-setzen'); b.setzeWert('hoehe', 305);
        await uebernehmen(b, autor, { globalIdZuLocalId: karte });

        await b.einordne({ ...ROHR }, resolverEchteAchse);
        b.starte('bezugshoehe-setzen'); b.setzeWert('hoehe', 305);
        const zweiter = await uebernehmen(b, autor, { globalIdZuLocalId: karte });

        expect(zweiter.eintrag).toBeNull();
        expect(zweiter.grund).toMatch(/galt schon/);
        expect(useAenderungen().eintraege).toHaveLength(1);
    });

    it('ein Bauteil ohne GlobalId nennt DIESEN Grund, nicht „galt schon"', async () => {
        // `parseItemData` fällt auf '' zurück, und `eintragen` verwirft dann
        // still. Die Oberfläche behauptete daraufhin einen Grund, den sie nicht
        // kannte — und schickte den Nutzer in die falsche Richtung.
        const autor = new IfcAutor({ getFragments: () => fakeManager() });
        const b = useBearbeitung();
        await b.einordne({ ...ROHR, globalId: '' }, resolverEchteAchse);
        b.starte('bezugshoehe-setzen'); b.setzeWert('hoehe', 305);

        const { eintrag, grund } = await uebernehmen(b, autor);
        expect(eintrag).toBeNull();
        expect(grund).toMatch(/GlobalId/);
    });

    it('„zurück" bringt das Bauteil an seinen Platz zurück', async () => {
        const manager = fakeManager();
        const autor = new IfcAutor({ getFragments: () => manager });
        const b = useBearbeitung();
        const karte = new Map([['3xY', 42]]);

        await b.einordne({ ...ROHR }, resolverEchteAchse);
        b.starte('bezugshoehe-setzen'); b.setzeWert('hoehe', 305);
        await uebernehmen(b, autor, { globalIdZuLocalId: karte });
        expect(manager._elemente.get(42).gruppe.position.y).toBeCloseTo(5, 6);

        // Der Gegeneintrag geht durch denselben Weg wie jede Bearbeitung.
        const [gegen] = await useAenderungen().zurueck('pruefer');
        const plan = planFuerEintrag(gegen, 'm1');
        await autor.wendeAn(plan, { globalIdZuLocalId: karte });

        // Die Hülle der Attrappe bleibt stehen, also zählt die Verschiebung:
        // erst +5, dann −5 zurück auf den Ausgangspunkt.
        expect(manager._elemente.get(42).gruppe.position.y).toBeCloseTo(0, 6);
    });
});
