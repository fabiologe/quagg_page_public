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

    it('trianguliert ein Polygon zur Fläche', () => {
        const quadrat = [[0, 0, 0], [10, 0, 0], [10, 0, 10], [0, 0, 10]];
        const { ok, geometrie } = baueAusBauplan({ rezept: 'flaeche', parameter: { punkte: quadrat, hoehe: 3 } });
        expect(ok).toBe(true);
        expect(geometrie.getIndex().count).toBe(6);      // zwei Dreiecke
        expect(geometrie.getAttribute('position').getY(0)).toBeCloseTo(3, 6);
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

/** Eine Attrappe des FragmentsManagers — kein WebGL, kein echtes Modell. */
function fakeFragments() {
    const modelle = new Map();
    let naechsteId = 1;
    const editor = {
        createElements: vi.fn(async () => [{ localId: naechsteId++ }]),
        applyChanges: vi.fn(async () => {}),
    };
    return {
        _modelle: modelle,
        list: modelle,
        core: {
            load: vi.fn(async (_puffer, { modelId }) => {
                modelle.set(modelId, { modelId, editor });
            }),
            disposeModel: vi.fn(async (modelId) => { modelle.delete(modelId); }),
        },
        _editor: editor,
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
        expect(f._modelle.size).toBe(nachErstem);         // und nicht zwei nebeneinander
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

    it('gibt den IFC-Typ des Bauplans an den Editor weiter', async () => {
        const f = fakeFragments();
        const trasse = { globalId: 'cde-t', art: 'erzeugt', modell: 'cde',
                         wert: { rezept: 'linie', kategorie: 'IFCALIGNMENT', name: 'Achse A',
                                 parameter: { punkte: LINIE } } };
        await autorMit(f).baueErzeugte([trasse]);
        const [, [neu]] = f._editor.createElements.mock.calls[0];
        expect(neu.attributes.category).toBe('IFCALIGNMENT');
        expect(neu.attributes.data.Name.value).toBe('Achse A');
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
