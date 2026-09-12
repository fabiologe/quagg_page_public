/**
 * Erzeugen (Stufe 9.4).
 *
 * Die tragende Zusage dieser Stufe ist eine, deren Bruch NICHT auffällt:
 *
 *   Ein `erzeugt`-Eintrag speichert PARAMETER, nie das Netz.
 *
 * Legte er das Netz ab, liesse sich das CDE-Modell nicht aus dem Journal neu
 * aufbauen — und genau daran hängt, dass ein Rohr aus „Variante Nord" in „Süd"
 * NICHT im Raum steht. Das merkt man nicht beim Zeichnen, sondern erst beim
 * Satzwechsel, und dann sieht es aus wie ein Anzeigefehler.
 *
 * Geprüft wird ohne WebGL: die Rezepte sind rein, und der Autoren-Kanal
 * bekommt eine Attrappe an die Stelle des FragmentsManagers.
 */
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
    LINIEN_BAND_M, REZEPTE, baueAusBauplan, erzeugtEintrag, istKategorie,
    neueGlobalId, pruefeBauplan, punkteAus, rezeptNach, zuruecknahmeEintrag,
} from '../services/Bauteilrezepte.js';
import { IfcAutor, CDE_MODELL_ID } from '../services/IfcAutor.js';
import { istDeltaModell } from '../services/DeltaBoxen.js';
import { standAus, beschreibeWert } from '../stores/useAenderungen.js';
import { planeNachspielen } from '../services/Nachspielen.js';

const LINIE = [[0, 0, 0], [10, 0, 0], [10, 0, 10]];

describe('Der Journaleintrag trägt den BAUPLAN, nicht das Netz', () => {
    it('speichert Rezept, Typ und Punkte — und keine Geometrie', () => {
        const e = erzeugtEintrag({ rezept: 'linie', name: 'Bruchkante 1', parameter: { punkte: LINIE } });
        expect(e.nachher.rezept).toBe('linie');
        expect(e.nachher.parameter.punkte).toEqual(LINIE);
        // Der Kern: nichts im Eintrag ist Geometrie.
        expect(JSON.stringify(e)).not.toMatch(/BufferGeometry|Float32|position/);
    });

    it('überlebt den Weg durch die RepoFacade unverändert', () => {
        // Das Journal geht als JSON auf die StorageBox. Ein Wert, der dabei
        // seine Gestalt ändert, käme als etwas anderes zurück — und der
        // Neuaufbau baute etwas anderes.
        const e = erzeugtEintrag({ rezept: 'flaeche', parameter: { punkte: LINIE } });
        expect(JSON.parse(JSON.stringify(e))).toEqual(e);
    });

    it('markiert das Bauteil als CDE-eigen — sonst sucht das Nachspielen im falschen Modell', () => {
        expect(erzeugtEintrag({ rezept: 'linie', parameter: { punkte: LINIE } }).modell).toBe('cde');
    });

    it('vergibt eine eigene GlobalId und täuscht keine IFC-GUID vor', () => {
        const a = neueGlobalId(), b = neueGlobalId();
        expect(a).not.toBe(b);
        expect(a.startsWith('cde-')).toBe(true);
    });

    it('nimmt ein erzeugtes Bauteil über nachher:null zurück — kein zweiter Mechanismus', () => {
        const e = erzeugtEintrag({ rezept: 'linie', parameter: { punkte: LINIE } });
        const stand = standAus([e, zuruecknahmeEintrag(e.globalId)], 'erzeugt');
        expect(stand.size).toBe(0);
    });

    it('beschreibt sich lesbar im Änderungen-Reiter', () => {
        const e = erzeugtEintrag({ rezept: 'linie', name: 'Bruchkante 1', parameter: { punkte: LINIE } });
        expect(beschreibeWert('erzeugt', e.nachher)).toBe('Bruchkante 1 · 3 Punkte');
        expect(beschreibeWert('erzeugt', e.nachher)).not.toMatch(/object Object/);
    });
});

describe('Die Rezepte sind rein', () => {
    it('baut aus einer Polylinie ein sichtbares Band', () => {
        const { ok, geometrie } = baueAusBauplan({ rezept: 'linie', parameter: { punkte: LINIE } });
        expect(ok).toBe(true);
        expect(geometrie).toBeInstanceOf(THREE.BufferGeometry);
        // Zwei Ecken je Punkt, zwei Dreiecke je Abschnitt.
        expect(geometrie.getAttribute('position').count).toBe(LINIE.length * 2);
        expect(geometrie.getIndex().count).toBe((LINIE.length - 1) * 6);
    });

    it('legt das Band waagerecht auf die Höhe der Punkte', () => {
        const auf12 = LINIE.map(([x, , z]) => [x, 12.4, z]);
        const { geometrie } = baueAusBauplan({ rezept: 'linie', parameter: { punkte: auf12 } });
        const pos = geometrie.getAttribute('position');
        for (let i = 0; i < pos.count; i++) expect(pos.getY(i)).toBeCloseTo(12.4, 6);
    });

    it('hält die Bandbreite ein — sie ist Darstellung, kein Bauteilmass', () => {
        const { geometrie } = baueAusBauplan({ rezept: 'linie', parameter: { punkte: [[0, 0, 0], [10, 0, 0]] } });
        const pos = geometrie.getAttribute('position');
        // Erster Punkt: zwei Ecken, quer zur Achse (also in Z) auseinander.
        expect(Math.abs(pos.getZ(0) - pos.getZ(1))).toBeCloseTo(LINIEN_BAND_M, 6);
    });

    it('trianguliert ein Polygon zur Fläche und behält die Höhe der Punkte', () => {
        // SO SEHEN DIE PUNKTE WIRKLICH AUS. Der frühere Test reichte
        // `{ punkte, hoehe: 3 }` ein — diese Form entsteht nirgends: die im
        // Formular eingetragene Höhe backt `alsRaumpunkte` in die Punkte
        // (y-Anteil), und `parameter` trägt danach nur noch `punkte`. Der Test
        // prüfte damit einen Weg, den es nicht gibt, und deckte zu, dass jede
        // gezeichnete Fläche auf Höhe 0 landete.
        const quadrat = [[0, 3, 0], [10, 3, 0], [10, 3, 10], [0, 3, 10]];
        const { ok, geometrie } = baueAusBauplan({ rezept: 'flaeche', parameter: { punkte: quadrat } });
        expect(ok).toBe(true);
        expect(geometrie.getIndex().count).toBe(6);      // zwei Dreiecke
        const pos = geometrie.getAttribute('position');
        for (let i = 0; i < 4; i++) expect(pos.getY(i)).toBeCloseTo(3, 6);
    });

    it('eine geneigte Fläche bleibt geneigt', () => {
        // Die Gegenprobe zur festen Höhe: sie hätte auch das eingeebnet.
        const rampe = [[0, 0, 0], [10, 0, 0], [10, 2, 10], [0, 2, 10]];
        const { geometrie } = baueAusBauplan({ rezept: 'flaeche', parameter: { punkte: rampe } });
        const pos = geometrie.getAttribute('position');
        expect(pos.getY(0)).toBeCloseTo(0, 6);
        expect(pos.getY(2)).toBeCloseTo(2, 6);
    });

    it('trägt auch einen konkaven Umriss', () => {
        // Ein L. Ein naiver Fächer aus dem ersten Punkt liefe hier über die
        // Einbuchtung hinweg und behauptete Fläche, wo keine ist.
        const l = [[0, 0, 0], [10, 0, 0], [10, 0, 4], [4, 0, 4], [4, 0, 10], [0, 0, 10]];
        const { ok, geometrie } = baueAusBauplan({ rezept: 'flaeche', parameter: { punkte: l } });
        expect(ok).toBe(true);
        expect(geometrie.getIndex().count).toBe((l.length - 2) * 3);
    });
});

describe('Ein untauglicher Bauplan kommt gar nicht erst ins Journal', () => {
    it('lehnt zu wenige Punkte ab und sagt wie viele fehlen', () => {
        const fehler = pruefeBauplan({ rezept: 'linie', parameter: { punkte: [[0, 0, 0]] } });
        expect(fehler.join()).toMatch(/mindestens 2 Punkte, 1 gesetzt/);
    });

    it('lehnt einen erfundenen IFC-Typ ab', () => {
        expect(pruefeBauplan({ rezept: 'linie', kategorie: 'IFCQUATSCH', parameter: { punkte: LINIE } }).join())
            .toMatch(/kein IFC-Typ/);
    });

    it('lässt jeden ECHTEN IFC-4.3-Typ zu — keine Typliste im Code', () => {
        // Dieselbe Polylinie ist als IFCALIGNMENT eine Trasse und als
        // IFCANNOTATION eine Bruchkante. Eine feste Liste hier wäre die
        // O(Typen)-Falle, gegen die die Bauform-Schicht angetreten ist.
        for (const typ of ['IFCALIGNMENT', 'IFCANNOTATION', 'IFCGEOGRAPHICELEMENT', 'IFCPIPESEGMENT']) {
            expect(istKategorie(typ)).toBe(true);
            expect(pruefeBauplan({ rezept: 'linie', kategorie: typ, parameter: { punkte: LINIE } })).toEqual([]);
        }
    });

    it('lehnt ein unbekanntes Rezept ab, statt undefined durchzureichen', () => {
        expect(rezeptNach('gibtsnicht')).toBe(null);
        expect(pruefeBauplan({ rezept: 'gibtsnicht' }).join()).toMatch(/gibt es nicht/);
        expect(baueAusBauplan({ rezept: 'gibtsnicht' }).ok).toBe(false);
    });

    it('wirft kaputte Punkte weg, statt NaN in die Geometrie zu lassen', () => {
        expect(punkteAus({ punkte: [[0, 0, 0], ['x', 1, 2], null, [1, 2]] })).toEqual([[0, 0, 0], [1, 2, 0]]);
    });
});

// ── Der Neuaufbau ───────────────────────────────────────────────────────────

/**
 * Eine Attrappe des FragmentsManagers — kein WebGL, kein echtes Modell.
 *
 * IN DER FORM DER ECHTEN BIBLIOTHEK. Vorher hing `editor` am einzelnen Modell
 * und `core` konnte nur `load`. Genau umgekehrt ist es richtig: der Editor
 * gehört `FragmentsModels` (also `core`), das Einzelmodell führt ihn nur
 * privat. Weil die Attrappe das Spiegelbild der Wirklichkeit war, liefen 12
 * Tests grün, während im Browser jede Bearbeitung an `kein_editor` starb.
 * `test/fragmentsVertrag.test.js` hält die Form jetzt gegen die Bibliothek.
 */
function fakeFragments() {
    const modelle = new Map();
    let naechsteId = 1;
    // DAS DELTA WIE IN DER BIBLIOTHEK (Abnahme 2026-09-12): jedes `edit` —
    // `createElements` ruft es selbst — legt ein NEUES `…-DELTA-MODEL-…` in
    // dieselbe Liste und entsorgt das vorige desselben Modells;
    // `disposeModel` entsorgt nur die Basis, `disposeDeltaModels` die Deltas.
    const deltas = new Map();
    let deltaNr = 0;
    const deltaWeg = (modelId) => {
        if (deltas.has(modelId)) modelle.delete(deltas.get(modelId));
        deltas.delete(modelId);
    };
    const editor = {
        createElements: vi.fn(async (modelId, auftraege) => {
            deltaWeg(modelId);
            const id = `${modelId}-DELTA-MODEL-${++deltaNr}`;
            modelle.set(id, { modelId: id });
            deltas.set(modelId, id);
            return auftraege.map(() => ({ localId: naechsteId++ }));
        }),
        applyChanges: vi.fn(async () => {}),
        disposeDeltaModels: vi.fn(async (modelId) => deltaWeg(modelId)),
    };
    return {
        _modelle: modelle,
        list: modelle,
        core: {
            editor,
            update: vi.fn(async () => {}),
            load: vi.fn(async (_puffer, { modelId }) => {
                // `core.load` GIBT DAS MODELL ZURÜCK — daran hängt, dass der
                // Autor es in die Szene setzen kann.
                const m = { modelId, object: { name: modelId }, useCamera: vi.fn() };
                modelle.set(modelId, m);
                return m;
            }),
            disposeModel: vi.fn(async (modelId) => { modelle.delete(modelId); }),
        },
        _editor: editor,
    };
}

/** Eine Welt-Attrappe: nur Szene und Kamera, kein WebGL. */
function fakeWelt() {
    const kinder = [];
    return {
        kinder,
        welt: {
            scene: { three: { add: (o) => kinder.push(o), remove: (o) => {
                const i = kinder.indexOf(o); if (i >= 0) kinder.splice(i, 1);
            } } },
            camera: { three: { istKamera: true } },
        },
    };
}

function autorMit(fragments) {
    return new IfcAutor({ getFragments: () => fragments });
}

function schritt(globalId, punkte = LINIE, rezept = 'linie') {
    return { globalId, art: 'erzeugt', modell: 'cde', wert: erzeugtEintrag({ rezept, parameter: { punkte } }).nachher };
}

describe('Das CDE-Modell wird AUFGEBAUT, nicht fortgeschrieben', () => {
    it('legt es beim ersten Bauteil an und gibt globalId → localId zurück', async () => {
        const f = fakeFragments();
        const { karte, misserfolge } = await autorMit(f).baueErzeugte([schritt('cde-a'), schritt('cde-b')]);
        expect(misserfolge).toEqual([]);
        expect([...karte.keys()]).toEqual(['cde-a', 'cde-b']);
        expect(f._modelle.has(CDE_MODELL_ID)).toBe(true);
    });

    it('verwirft das alte Modell VOR dem Aufbau — sonst wächst es bei jedem Laden', async () => {
        // Zweimal dasselbe Journal aufgebaut muss denselben Raum ergeben, nicht
        // den doppelten. Das ist dieselbe Idempotenz, auf der das Nachspielen
        // ruht — nur dass sie hier nicht durch absolute Werte entsteht, sondern
        // dadurch, dass vorher weggeräumt wird.
        const f = fakeFragments();
        const autor = autorMit(f);
        await autor.baueErzeugte([schritt('cde-a')]);
        const nachErstem = [...f._modelle.get(CDE_MODELL_ID) ? [1] : []].length;

        await autor.baueErzeugte([schritt('cde-a')]);
        // Der erste Lauf fand nichts vor — verworfen wird erst ab dem zweiten.
        expect(f.core.disposeModel).toHaveBeenCalledTimes(1);
        expect(f.core.load).toHaveBeenCalledTimes(2);     // je Lauf ein frisches Modell
        // und nicht zwei Basen nebeneinander (das Delta zählt die nächste Probe)
        expect([...f._modelle.keys()].filter(k => !istDeltaModell(k))).toHaveLength(nachErstem);
    });

    it('LEERT das Modell, wenn der neue Satz nichts erzeugt hat', async () => {
        // Der Fall, für den der Neuaufbau überhaupt gewählt wurde: Wechsel von
        // „Variante Nord" (mit Rohr) auf „Süd" (ohne). Bliebe das Modell
        // stehen, stünde ein Bauteil im Raum, das zu keiner Variante gehört.
        const f = fakeFragments();
        const autor = autorMit(f);
        await autor.baueErzeugte([schritt('cde-a')]);
        expect(f._modelle.has(CDE_MODELL_ID)).toBe(true);

        await autor.baueErzeugte([]);
        expect(f._modelle.has(CDE_MODELL_ID)).toBe(false);
        // Auch das Delta mit der Geometrie (Abnahme 2026-09-12): vorher blieb
        // es als Waise in der Liste — 1 Eintrag statt 0.
        expect([...f._modelle.keys()]).toEqual([]);
    });

    it('drei Neuaufbauten hinterlassen EINE Basis und EIN Delta', async () => {
        // Die Grösse, die im Browser „alle Modelle weg" auslöste: verwaiste
        // Deltas in der Modellliste, die jedes `update` weiter mitrechnet.
        const f = fakeFragments();
        const autor = autorMit(f);
        for (let i = 0; i < 3; i++) await autor.baueErzeugte([schritt('cde-a'), schritt('cde-b')]);
        const schluessel = [...f._modelle.keys()];
        expect(schluessel.filter(k => !istDeltaModell(k))).toEqual([CDE_MODELL_ID]);
        expect(schluessel.filter(istDeltaModell)).toHaveLength(1);
        // Das Delta vor der Basis entsorgt — es zeichnet sich gegen sie.
        const [delta] = f._editor.disposeDeltaModels.mock.invocationCallOrder;
        const [basis] = f.core.disposeModel.mock.invocationCallOrder;
        expect(delta).toBeLessThan(basis);
    });

    it('N Teile sind EIN Auftrag an den Editor — ein Delta statt N', async () => {
        const f = fakeFragments();
        const { karte, misserfolge } = await autorMit(f)
            .baueErzeugte([schritt('cde-a'), schritt('cde-b'), schritt('cde-c')]);
        expect(misserfolge).toEqual([]);
        expect(f._editor.createElements).toHaveBeenCalledTimes(1);              // vorher 3
        expect(f._editor.createElements.mock.calls[0][1]).toHaveLength(3);
        expect(new Set(karte.values()).size).toBe(3);
    });

    it('scheitert der gemeinsame Auftrag, steht nur das kaputte Teil als Misserfolg da', async () => {
        const f = fakeFragments();
        const echt = f._editor.createElements.getMockImplementation();
        f._editor.createElements.mockImplementation(async (modelId, auftraege) => {
            if (auftraege.some(a => a.attributes._guid?.value === 'cde-kaputt')) throw new Error('Shell kaputt');
            return echt(modelId, auftraege);
        });
        const { karte, misserfolge } = await autorMit(f)
            .baueErzeugte([schritt('cde-a'), schritt('cde-kaputt'), schritt('cde-b')]);
        expect([...karte.keys()]).toEqual(['cde-a', 'cde-b']);
        expect(misserfolge.map(m => m.globalId)).toEqual(['cde-kaputt']);
        expect(misserfolge[0].grund).toMatch(/editor_fehler: Shell kaputt/);
    });

    it('meldet einen untauglichen Bauplan, statt ihn still zu überspringen', async () => {
        const f = fakeFragments();
        const kaputt = { globalId: 'cde-x', art: 'erzeugt', modell: 'cde',
                         wert: { rezept: 'linie', kategorie: 'IFCANNOTATION', parameter: { punkte: [[0, 0, 0]] } } };
        const { karte, misserfolge } = await autorMit(f).baueErzeugte([schritt('cde-a'), kaputt]);
        expect(karte.size).toBe(1);                       // das gute Bauteil steht
        expect(misserfolge).toHaveLength(1);
        expect(misserfolge[0].grund).toMatch(/mindestens 2 Punkte/);
    });

    it('gibt Typ, Name und Kennung in der Form weiter, die die Bibliothek liest', async () => {
        // DIE FORM STAMMT AUS DER BIBLIOTHEK: `itemDataToRawItemData` liest
        // `_category` und wirft ohne sie „Category is required"; alles ohne
        // führenden Unterstrich wird zum Attribut. Hier stand einmal
        // `{ category, data: { Name } }` — die Form eines `edit`-Auftrags. Der
        // Aufruf warf damit jedes Mal, der try/catch schluckte es, und
        // Zeichnen ergab nie ein Bauteil. `fragmentsVertrag.test.js` hält die
        // Form gegen die Typdeklarationen.
        const f = fakeFragments();
        const trasse = { globalId: 'cde-t', art: 'erzeugt', modell: 'cde',
                         wert: { rezept: 'linie', kategorie: 'IFCALIGNMENT', name: 'Achse A',
                                 parameter: { punkte: LINIE } } };
        await autorMit(f).baueErzeugte([trasse]);
        const [, [neu]] = f._editor.createElements.mock.calls[0];
        expect(neu.attributes._category.value).toBe('IFCALIGNMENT');
        expect(neu.attributes.Name.value).toBe('Achse A');
        // Die selbst vergebene Kennung geht in den GUID-Index — sonst wäre ein
        // erzeugtes Bauteil nur über die Karte dieses einen Laufs auffindbar.
        expect(neu.attributes._guid.value).toBe('cde-t');
    });
});

describe('wendeAn: erst erzeugen, dann verschieben', () => {
    it('findet die localId eines erzeugten Bauteils für seinen lage-Eintrag', async () => {
        // Die localId entsteht erst beim Bauen. Käme `lage` zuerst dran,
        // meldete es „keine_localId" für etwas, das eine Zeile später existiert.
        const f = fakeFragments();
        const autor = autorMit(f);
        autor.setzeAnker = vi.fn(async () => ({ ok: true }));

        const plan = {
            modelId: 'geliefert',
            anzuwenden: [
                { globalId: 'cde-a', art: 'lage', modell: 'cde', wert: { x: 1, y: 0, z: 0 } },
                schritt('cde-a'),
            ],
        };
        const { misserfolge, erzeugte } = await autor.wendeAn(plan, { globalIdZuLocalId: new Map() });
        expect(misserfolge).toEqual([]);
        expect(autor.setzeAnker).toHaveBeenCalledWith(CDE_MODELL_ID, erzeugte.get('cde-a'), { x: 1, y: 0, z: 0 });
    });

    it('schickt ein GELIEFERTES Bauteil weiterhin ins gelieferte Modell', async () => {
        const f = fakeFragments();
        const autor = autorMit(f);
        autor.setzeAnker = vi.fn(async () => ({ ok: true }));
        await autor.wendeAn(
            { modelId: 'geliefert', anzuwenden: [{ globalId: 'H12', art: 'lage', wert: { x: 1, y: 0, z: 0 } }] },
            { globalIdZuLocalId: new Map([['H12', 42]]) },
        );
        expect(autor.setzeAnker).toHaveBeenCalledWith('geliefert', 42, { x: 1, y: 0, z: 0 });
    });

    it('trifft jedes gelieferte Bauteil in SEINEM Modell, nicht im ersten (Abnahme 2026-09-12)', async () => {
        // Das Nachspielen gab die Kennung des ERSTEN geladenen Modells mit.
        // Lud das Gelände als zweites, blendete `geloescht` ein fremdes Bauteil
        // des ersten aus — und das ungeformte Gelände deckte den Aushub.
        const f = fakeFragments();
        const autor = autorMit(f);
        autor.setzeAnker = vi.fn(async () => ({ ok: true }));
        const r = await autor.wendeAn(
            { modelId: 'kanal', anzuwenden: [
                { globalId: 'UR', art: 'geloescht', wert: true, modell: 'geliefert' },
                { globalId: 'H12', art: 'lage', wert: { x: 1, y: 0, z: 0 } },
            ] },
            { globalIdZuLocalId: new Map([['UR', 7], ['H12', 42]]),
              globalIdZuOrt: new Map([['UR', { modelId: 'gelaende', localId: 7 }],
                                      ['H12', { modelId: 'kanal', localId: 42 }]]) },
        );
        expect(r.auszublenden).toEqual([{ modelId: 'gelaende', localId: 7 }]);   // vorher 'kanal'
        expect(autor.setzeAnker).toHaveBeenCalledWith('kanal', 42, { x: 1, y: 0, z: 0 });
    });
});

describe('Das Nachspielen sucht Erzeugtes nicht im gelieferten Modell', () => {
    it('meldet KEINEN Konflikt für ein selbst erzeugtes Bauteil', () => {
        // Der Lieferstand kennt es nicht — das ist richtig so und darf nicht
        // als „Bauteil fehlt" gezählt werden, sonst wäre der Konfliktzähler
        // von der ersten gezeichneten Linie an unbrauchbar.
        const e = erzeugtEintrag({ rezept: 'linie', parameter: { punkte: LINIE } });
        const plan = planeNachspielen([e], () => undefined);
        expect(plan.konflikte).toEqual([]);
        expect(plan.anzuwenden).toHaveLength(1);
        expect(plan.anzuwenden[0].modell).toBe('cde');
    });
});

describe('Erzeugtes muss auch ZU SEHEN sein (Stufe 12.0c)', () => {
    it('hängt das CDE-Modell in die Szene und bindet es an die Kamera', async () => {
        // Der teuerste aller Fälle: `core.load` legt ein Modell an, hängt es
        // aber NICHT in die Szene — `loadIfc` tut das für geliefertes Material
        // ausdrücklich, `eigenesModell` tat es nicht. Ein gezeichnetes Bauteil
        // entstand damit fehlerfrei und war trotzdem nicht da. Nichts deutete
        // auf einen Fehler hin, weil keiner passierte.
        const f = fakeFragments();
        const w = fakeWelt();
        const autor = new IfcAutor({ getFragments: () => f, getWelt: () => w.welt });

        const r = await autor.eigenesModell();
        expect(r.ok).toBe(true);
        expect(w.kinder).toHaveLength(1);
        expect(w.kinder[0].name).toBe('cde-eigenbau');
        expect(f._modelle.get('cde-eigenbau').useCamera).toHaveBeenCalledWith({ istKamera: true });
    });

    it('nimmt es beim Verwerfen wieder heraus', async () => {
        // Sonst bliebe ein Objekt in der Szene, dessen Modell es nicht mehr
        // gibt — und `baueErzeugte` verwirft vor JEDEM Aufbau.
        const f = fakeFragments();
        const w = fakeWelt();
        const autor = new IfcAutor({ getFragments: () => f, getWelt: () => w.welt });

        await autor.eigenesModell();
        await autor.verwirfEigenesModell();
        expect(w.kinder).toHaveLength(0);
    });

    it('ein Aufbau hinterlässt genau EIN Modell in der Szene, nicht eins je Lauf', async () => {
        const f = fakeFragments();
        const w = fakeWelt();
        const autor = new IfcAutor({ getFragments: () => f, getWelt: () => w.welt });

        await autor.baueErzeugte([schritt('cde-1')]);
        await autor.baueErzeugte([schritt('cde-1'), schritt('cde-2')]);
        await autor.baueErzeugte([schritt('cde-1')]);
        expect(w.kinder).toHaveLength(1);
    });

    it('läuft auch ohne Welt durch — Bearbeiten ist eine Zusatzfähigkeit', async () => {
        const f = fakeFragments();
        const autor = new IfcAutor({ getFragments: () => f });
        expect((await autor.eigenesModell()).ok).toBe(true);
    });
});

describe('Eine Festlegung auf ein SELBST erzeugtes Bauteil (Stufe 12.0c)', () => {
    it('findet es über die Karte, wenn dieser Lauf nichts erzeugt hat', async () => {
        // Ein Ein-Schritt-Plan baut nichts neu auf (sonst räumte er alles
        // Gezeichnete weg). Die localId stand aber nur in der Karte des
        // Erzeugungslaufs — eine Bezugshöhe auf eine gezeichnete Linie
        // scheiterte deshalb immer mit `keine_localId`.
        //
        // Auffindbar ist sie, weil erzeugte Bauteile ihre CDE-Kennung als
        // `_guid` ins Modell tragen.
        const f = fakeFragments();
        f.list = f._modelle;
        f._modelle.set('cde-eigenbau', {
            modelId: 'cde-eigenbau',
            getBoxes: async () => [new (await import('three')).Box3()],
        });
        const autor = autorMit(f);
        const { misserfolge } = await autor.wendeAn(
            { modelId: 'm1', anzuwenden: [
                { art: 'lage', globalId: 'cde-t', modell: 'cde', wert: { x: 1, y: 2, z: 3 } },
            ] },
            { globalIdZuLocalId: new Map([['cde-t', 77]]) },
        );
        // Es kommt bis zum Editor — kein `keine_localId` mehr.
        expect(misserfolge.map(m => m.grund)).not.toContain('keine_localId');
    });
});
