/**
 * Das Gelände in EINEM Stil (Abnahme 2026-09-12, K4 und M5).
 *
 * Fabio: „Viel Wechsel der Renderstyles des Urgeländes — warum? Reicht nicht,
 * das leichte Beige mit den Kantenfärbungen beizubehalten?" Die Wurzeln:
 * die Farbe folgte dem IFC-TYP statt der Rolle (das Urgelände in 42069 ist
 * ein IfcEarthworksFill mit eigener Farbe), die Vorschau räumte beim Leeren
 * den Farbkatalog mit, das ersetzte Gelände wurde gedimmt, und „Herkunft
 * färben" färbte die Geländekopie.
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { IfcEngine, erdbauRolle } from '../services/IfcEngine.js';
import { BAUTEILFARBEN, GELAENDE_FARBE, faerbePlan } from '../services/Bauteilfarben.js';
import { vorschauFuer } from '../services/Vorschau.js';
import { useVorschau } from '../composables/useVorschau.js';

const WURZEL = new URL('..', import.meta.url).pathname;
const GELAENDE = erdbauRolle('IFCGEOGRAPHICELEMENT');

describe('Farbe nach Rolle', () => {
    it('ein Gelände trägt den Geländeton — auch als IfcEarthworksFill und mit eigener IFC-Farbe', () => {
        const plan = faerbePlan([
            { modelId: 'dgm', localId: 7, kategorie: 'IFCEARTHWORKSFILL' },    // 42069: das Urgelände
            { modelId: 'dgm', localId: 8, kategorie: 'IFCEARTHWORKSFILL' },    // ein echter Damm
            { modelId: 'dgm', localId: 9, kategorie: 'IFCEARTHWORKSCUT' },
        ], { gelaende: new Set(['dgm|7']), eigen: new Set(['dgm|7', 'dgm|9']) });
        expect(plan.get('IFCGEOGRAPHICELEMENT')).toEqual([{ modelId: 'dgm', localId: 7 }]);
        expect(plan.get('IFCEARTHWORKSFILL')).toEqual([{ modelId: 'dgm', localId: 8 }]);
        expect(plan.has('IFCEARTHWORKSCUT')).toBe(false);          // eigene Farbe bleibt — außer beim Gelände
    });

    it('Lieferung und Kopie: EIN Ton', () => {
        expect(BAUTEILFARBEN.IFCGEOGRAPHICELEMENT).toBe(GELAENDE_FARBE);   // die Kopie baut ihr Material daraus
        expect(BAUTEILFARBEN.IFCEARTHWORKSELEMENT.farbe).toBe(GELAENDE_FARBE.farbe);
    });

    it('erdbauFaerben fragt die eigene Farbe nur für Nicht-Gelände und räumt das alte Grün', async () => {
        const e = Object.create(IfcEngine.prototype);
        const gefaerbt = [];
        Object.assign(e, {
            _faerbungen: new Map([['erdbau:IFCEARTHWORKSFILL', { dgm: [7] }]]),
            erdbauKandidaten: async () => [
                { modelId: 'dgm', localId: 7, kategorie: 'IFCEARTHWORKSFILL' },
                { modelId: 'dgm', localId: 9, kategorie: 'IFCEARTHWORKSCUT' }],
            _gelaendeFuerFarbe: async () => [{ modelId: 'dgm', localId: 7 }, { modelId: 'dgm', localId: 3 }],
            eigeneFarben: vi.fn(async () => []),
            faerbe: vi.fn(async (rolle, orte) => { gefaerbt.push([rolle, orte]); e._faerbungen.set(rolle, {}); return orte.length; }),
            entfaerbe: vi.fn(async (rolle) => { e._faerbungen.delete(rolle); return true; }),
        });
        const r = await IfcEngine.prototype.erdbauFaerben.call(e);
        expect(e.eigeneFarben).toHaveBeenCalledWith([{ modelId: 'dgm', localId: 9, kategorie: 'IFCEARTHWORKSCUT' }]);
        expect(gefaerbt).toContainEqual([GELAENDE, [{ modelId: 'dgm', localId: 7 }, { modelId: 'dgm', localId: 3 }]]);
        expect(e.entfaerbe).toHaveBeenCalledWith('erdbau:IFCEARTHWORKSFILL');
        expect(r.eigene).toEqual([]);                               // kein Hinweis „eigene Farbe" fürs Gelände
    });
});

describe('der Färbe-Stapel trägt auf, was darunter liegt', () => {
    function attrappe() {
        const fragments = { list: new Map(), highlight: vi.fn(async () => {}), resetHighlight: vi.fn(async () => {}) };
        const e = Object.create(IfcEngine.prototype);
        Object.assign(e, { components: { get: () => fragments }, _faerbungen: new Map(), _selectedItems: null, gelaendeKanten: null });
        return { e, fragments };
    }

    it('nach dem Dimmen hat das Gelände seinen Ton wieder — vorher blieb es ohne', async () => {
        const { e, fragments } = attrappe();
        await e.faerbe(GELAENDE, [{ modelId: 'dgm', localId: 7 }]);
        await e.faerbe('dimmen', [{ modelId: 'dgm', localId: 7 }]);
        fragments.highlight.mockClear();
        await e.entfaerbe('dimmen');
        expect(fragments.highlight).toHaveBeenCalledTimes(1);
        const [stil, orte] = fragments.highlight.mock.calls[0];
        expect(stil.color.getHex()).toBe(GELAENDE_FARBE.farbe);
        expect(orte).toEqual({ dgm: [7] });
    });

    it('„Herkunft aus" (resetCategoryColors) trägt den Stapel wieder auf — `resetColor` nahm die Katalogfarbe mit', async () => {
        const { e, fragments } = attrappe();
        const modell = { modelId: 'dgm', resetColor: vi.fn(async () => {}), setColor: vi.fn(async () => {}) };
        fragments.list.set('dgm', modell);
        e._categoryGroups = [];
        await e.faerbe(GELAENDE, [{ modelId: 'dgm', localId: 7 }]);
        fragments.highlight.mockClear();
        await e.resetCategoryColors();
        expect(modell.resetColor).toHaveBeenCalled();
        expect(fragments.highlight.mock.calls.some(([stil, orte]) =>
            stil.color?.getHex?.() === GELAENDE_FARBE.farbe && orte?.dgm?.includes(7))).toBe(true);
    });

    it('der Katalog kommt nie über die Vorschau — Rang vor Reihenfolge', async () => {
        const { e, fragments } = attrappe();
        await e.faerbe('dimmen', [{ modelId: 'dgm', localId: 7 }]);
        await e.faerbe(GELAENDE, [{ modelId: 'dgm', localId: 7 }]);
        expect(fragments.highlight.mock.calls.at(-1)[0].opacity).toBe(0.25);
    });
});

describe('die Wege, die den Ton wechselten', () => {
    it('die Vorschau räumt beim Leeren NUR ihre Rollen — der Katalog bleibt', async () => {
        const e = { overlayLeere: vi.fn(), entfaerbe: vi.fn(async () => true), entfaerbeAlle: vi.fn(async () => {}) };
        const { leeren } = useVorschau({ engine: { value: e }, bearbeitung: {} });
        await leeren();
        expect(e.entfaerbeAlle).not.toHaveBeenCalled();
        expect(e.entfaerbe.mock.calls.map(c => c[0])).toEqual(['dimmen', 'kandidat', 'ziel']);
    });

    it('ersetzt ist nicht entfernt: das Gelände unter einer Anzeige wird nicht gedimmt, ein Rohr schon', () => {
        const v = vorschauFuer([
            { art: 'geloescht', globalId: 'UR', nachher: true },
            { art: 'erzeugt', globalId: 'AN', nachher: { rezept: 'anzeige', rolle: 'anzeige', ableitung: 'a1',
                                                        parameter: { quellen: { gelaende: 'UR' } } } },
        ]);
        expect(v.faerbungen).toEqual([]);
        expect(vorschauFuer([{ art: 'geloescht', globalId: 'ROHR', nachher: true }]).faerbungen)
            .toEqual([{ globalId: 'ROHR', rolle: 'dimmen' }]);
    });

    it('„Herkunft färben" lässt die Geländekopie im Geländeton', () => {
        const viewer = readFileSync(join(WURZEL, 'components/IfcViewer.vue'), 'utf8');
        const a = viewer.indexOf('async function herkunftFaerben()');
        const koerper = viewer.slice(a, viewer.indexOf('\n}\n', a));
        expect(koerper).toMatch(/istAnzeigeform\(w\)/);
        expect(koerper).toMatch(/!anzeigen\.has\(gid\)/);
    });
});
