// @vitest-environment jsdom
/**
 * Plansymbole sind Daten (Teil XXIII, A5; Befund S5).
 *
 *  1. Die fünf alten Symbole zeichnen mit DENSELBEN jsPDF-Aufrufen wie vor dem
 *     Umbau (Fixture `plansymbole_vor_a5.json`, aufgezeichnet am alten Code).
 *  2. Ein Symbol aus der Bibliothek ist ein weiterer Eintrag derselben Form —
 *     geprüft, registriert, gezeichnet, und ein Bibliotheksrezept darf es nennen.
 *  3. Ein Rezept mit Symbol erscheint im Lageplan ALS Symbol — der Pfosten mit
 *     einem Punkt, der Schacht mit zwei übereinander (vorher unsichtbar).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createPinia, setActivePinia } from 'pinia';
import { EINGEBAUTE_SYMBOLE, drawPlanSymbol, planSymbole, registriereSymbole, symbolNach } from '../services/PlanSymbols.js';
import { SYMBOL_OPTIONS } from '../services/DefaultLineStyles.js';
import { pruefeEintrag } from '../services/katalog/Katalogschema.js';
import { registriereRezepte } from '../services/katalog/Katalog.js';
import { erzeugtEintrag, planbildVon, rezeptNach } from '../services/Bauteilrezepte.js';
import { useZeichnen } from '../composables/useZeichnen.js';
import { useAenderungen } from '../stores/useAenderungen.js';
import { drawVectorPlan } from '../services/IfcVectorPlotter.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { erstelleMockDoc } from './helpers/mockDoc';

const GOLD = JSON.parse(readFileSync(join(process.cwd(), 'src/features/cde/test/fixtures/plansymbole_vor_a5.json'), 'utf8'));

function rufe(name) {
    const liste = [];
    const doc = new Proxy({}, { get: (_, k) => (...a) => liste.push([k, ...a]) });
    drawPlanSymbol(doc, name, 37.3, 81.9, 3.7, { r: 12, g: 34, b: 56 });
    return liste;
}
const nah = (a, b) => (Array.isArray(a) ? a.length === b.length && a.every((x, i) => nah(x, b[i]))
    : typeof a === 'number' ? Math.abs(a - b) < 1e-12 : a === b);

afterEach(() => { registriereSymbole([]); registriereRezepte([]); });

describe('1 — die alten Symbole zeichnen wie vorher', () => {
    for (const name of Object.keys(GOLD)) {
        it(name, () => expect(nah(rufe(name), GOLD[name]), JSON.stringify(rufe(name))).toBe(true));
    }
    it('Stil-Editor und Symbolkatalog sagen dasselbe', () => {
        expect(SYMBOL_OPTIONS).toEqual(['none', ...EINGEBAUTE_SYMBOLE.map(s => s.id)]);
    });
    it('jedes eingebaute Symbol besteht die Prüfung (unter neuer Id)', () => {
        for (const s of EINGEBAUTE_SYMBOLE) expect(pruefeEintrag('symbol', { ...s, id: `${s.id}-kopie` }).fehler, s.id).toEqual([]);
    });
});

describe('2 — ein Symbol aus der Bibliothek', () => {
    const KEGEL = { id: 'leitkegel', titel: 'Leitkegel', kurz: 'K',
                    formen: [{ art: 'dreieck', punkte: [[0, -1], [-0.8, 0.8], [0.8, 0.8]], gefuellt: true }] };

    it('geprüft: unbekannte Formen und Masse ausserhalb werden abgewiesen', () => {
        expect(pruefeEintrag('symbol', KEGEL).ok).toBe(true);
        expect(pruefeEintrag('symbol', { ...KEGEL, formen: [{ art: 'stern' }] }).fehler.join()).toMatch(/Art „stern"/);
        expect(pruefeEintrag('symbol', { ...KEGEL, formen: [{ art: 'linie', von: [0, 0], bis: [9, 0] }] }).fehler.join()).toMatch(/Einheitskreis/);
        expect(pruefeEintrag('symbol', { ...KEGEL, id: 'schacht' }).fehler.join()).toMatch(/eingebaut/);
    });

    it('registriert und gezeichnet — und ein Bibliotheksrezept darf es nennen', () => {
        expect(pruefeEintrag('rezept', { ...rezeptNachDeklaration(), symbol: 'leitkegel' }).fehler.join()).toMatch(/Plansymbol „leitkegel" gibt es nicht/);
        registriereSymbole([KEGEL]);
        expect(symbolNach('leitkegel')).toBe(KEGEL);
        expect(planSymbole().map(s => s.id)).toContain('leitkegel');
        expect(rufe('leitkegel').map(c => c[0])).toEqual(['setDrawColor', 'setLineWidth', 'setLineDashPattern', 'setFillColor', 'triangle']);
        expect(pruefeEintrag('rezept', { ...rezeptNachDeklaration(), symbol: 'leitkegel' }).ok).toBe(true);
    });
});

/** Die Pfosten-Deklaration unter neuer Id — wie ein Bibliotheksrezept. */
function rezeptNachDeklaration() {
    const { liefert, baue, formAus, verschiebe, fachmodell, punkteIn, ...d } = rezeptNach('pfosten');
    return { ...d, id: 'kegel' };
}

describe('3 — im Lageplan ein Symbol statt eines Zugs', () => {
    beforeEach(() => { localStorage.clear(); setActivePinia(createPinia()); useBearbeitung(); });
    const KAMERA = { left: -50, right: 50, top: 50, bottom: -50, zoom: 1, position: { x: 0, y: 100, z: 0 } };

    it('Pfosten (ein Punkt) und Schacht (zwei übereinander) zeichnen ihr Symbol, das Rohr bleibt ein Zug', async () => {
        // Der ECHTE Erzeuger: der Pfosten über den Zeichenweg, Schacht und Rohr
        // über `erzeugtEintrag` — die Form, die Netzwerkzeuge schreiben.
        const b = useBearbeitung(); b.modusSetzen(true);
        const ae = useAenderungen();
        const z = useZeichnen({ bearbeitung: b, cde: { bearbeiter: 'Fabio' }, getModellSha: () => 'sha1',
                                getHoehenversatz: () => 0, getHoeheAn: () => 1 });
        z.starte('pfosten-zeichnen');
        b.setzeWert('name', 'LP 1');
        z.aufTreffer({ point: { x: 5, y: 1, z: 5 } });
        await new Promise(r => setTimeout(r, 0));
        const stand = new Map(ae.wirksamerStand('erzeugt'));
        for (const e of [
            erzeugtEintrag({ rezept: 'schacht', name: 'S 1', parameter: { punkte: [[-5, 297, -5], [-5, 300, -5]], dn: 1000 } }),
            erzeugtEintrag({ rezept: 'rohr', name: 'R 1', parameter: { punkte: [[-20, 0, 0], [20, 0, 0]], dn: 300 } }),
        ]) stand.set(e.globalId, e.nachher);
        const erzeugte = [...stand.values()].map(planbildVon).filter(Boolean);
        expect(erzeugte.map(e => e.symbol)).toEqual(['pfosten', 'schacht', null]);

        const doc = erstelleMockDoc();
        drawVectorPlan(doc, KAMERA, 10, 100, 100, { erzeugte });
        expect(doc.nur('rect').length).toBe(1);                       // das Pfostenquadrat
        expect(doc.nur('circle').length).toBe(1);                     // der Schachtkreis
        expect(doc.nur('text').map(c => c.args[0])).toEqual(expect.arrayContaining(['LP 1', 'S 1', 'R 1']));
        // Das Rohr: EINE Linie; der Schacht: zwei Kreuzlinien — keine Nulllinie mehr.
        expect(doc.nur('line').length).toBe(3);
    });

    it('ohne Symbol bleibt ein Ein-Punkt-Bauplan unsichtbar wie bisher — kein Absturz', () => {
        expect(planbildVon({ rezept: 'linie', name: 'x', parameter: { punkte: [[0, 0, 0]] } })).toBeNull();
        expect(planbildVon({ rezept: 'gibtsnicht', parameter: { punkte: [[0, 0, 0], [1, 0, 0]] } })).toMatchObject({ symbol: null });
    });

    it('das Rezept sagt es: Schacht und Pfosten nennen ihr Symbol, Rohr und Platte nicht', () => {
        expect(rezeptNach('schacht').symbol).toBe('schacht');
        expect(rezeptNach('pfosten').symbol).toBe('pfosten');
        expect(rezeptNach('rohr').symbol).toBeUndefined();
        expect(rezeptNach('platte').symbol).toBeUndefined();
    });
});
