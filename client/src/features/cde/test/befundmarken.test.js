// @vitest-environment jsdom
/**
 * Teil XXX, B7 — Befunde als Marken im Raum und als Zähler in der Bearbeitungsmarke.
 *
 * Vorher standen Befunde nur in Listen (Prüfliste im Cockpit, Tafel am gewählten Bauteil); im Raum war nicht zu sehen,
 * WO etwas nicht stimmt. Jetzt: je Bauteil mit Befund eine Marke über seiner Hülle, die stärkste Schwere gibt die Farbe;
 * der Zähler springt von Befund zu Befund. Quellen: der Prüflauf über das Journal und die Befunde der Ableitungen.
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { befundmarkenAus, markenGrundformen } from '../services/Befundmarken.js';
import { CDE_MODELL_ID, IfcAutor } from '../services/IfcAutor.js';
import { EBENEN } from '../services/IfcOverlay.js';
import { erzeugtEintrag } from '../services/Bauteilrezepte.js';
import { erzeugeKernel } from '../services/geometrie/Kernel.js';

const WURZEL = fileURLToPath(import.meta.url).replace(/test[\/][^\/]+$/, '');
const lies = (p) => readFileSync(WURZEL + p, 'utf8');
const H = (x0, y0, z0, x1, y1, z1) => ({ min: { x: x0, y: y0, z: z0 }, max: { x: x1, y: y1, z: z1 } });

describe('befundmarkenAus — je Bauteil eine Marke, an seiner Hülle', () => {
    const stand = new Map([
        ['R1', { rezept: 'rohr', name: 'H1' }],
        ['R2', { rezept: 'rohr', name: 'H2' }],
        ['S1', { rezept: 'gelaendeschicht', ableitung: 'ab-s', name: 'Tondichtung' }],
        ['Z1', { rezept: 'anzeige', ableitung: 'ab-z', name: 'Gelände (Anzeige)' }],
        ['W1', { rezept: 'wand', name: 'ohne Hülle' }],
        ['G1', { rezept: 'rohr', name: 'gelöscht' }],
    ]);
    const huellen = new Map([['R1', H(0, 0, 0, 10, 2, 4)], ['R2', H(20, 0, 0, 22, 1, 2)], ['S1', H(0, 5, 0, 4, 6, 4)],
                             ['Z1', H(-50, 0, -50, 50, 1, 50)], ['G1', H(0, 0, 0, 1, 1, 1)]]);
    const eigene = [
        { globalId: 'R1', befunde: [{ schwere: 'hinweis', text: 'Gefälle knapp' }, { schwere: 'warnung', text: 'Gefälle zu flach' }] },
        { globalId: 'R2', befunde: [{ schwere: 'hinweis', text: 'Länge kurz' }, { schwere: 'info', text: 'nur Auskunft' }] },
        { globalId: 'W1', befunde: [{ schwere: 'warnung', text: 'ohne Ort' }] },
        { globalId: 'G1', befunde: [{ schwere: 'warnung', text: 'gelöscht' }] },
    ];
    const ableitungen = new Map([
        ['ab-s', { befunde: [{ schwere: 'warnung', text: '3 % ausserhalb' }] }],
        ['ab-z', { befunde: [{ schwere: 'warnung', text: 'Anzeige' }] }],
    ]);
    const m = befundmarkenAus({ eigene, ableitungen, stand, huellen, verdeckt: new Set(['G1']),
                                ausnehmen: (p) => p?.rezept === 'anzeige' });

    it('Bauteile mit Befund und Hülle — nicht ohne Hülle, nicht verborgen, nicht die Geländeanzeige', () => {
        expect(m.map(x => x.globalId).sort()).toEqual(['R1', 'R2', 'S1']);
    });
    it('die stärkste Schwere gibt die Farbe, alle Texte bleiben; Warnungen zuerst', () => {
        const r1 = m.find(x => x.globalId === 'R1');
        expect(r1.schwere).toBe('warnung');
        expect(r1.texte).toEqual(['Gefälle knapp', 'Gefälle zu flach']);
        expect(m.find(x => x.globalId === 'R2')).toMatchObject({ schwere: 'hinweis', texte: ['Länge kurz'] });
        expect(m.map(x => x.schwere)).toEqual(['warnung', 'warnung', 'hinweis']);
    });
    it('ein Befund der Ableitung sitzt an ihrem Teil; die Marke oben in der Mitte der Hülle', () => {
        expect(m.find(x => x.globalId === 'S1')).toMatchObject({ name: 'Tondichtung', punkt: { x: 2, y: 6, z: 2 }, texte: ['3 % ausserhalb'] });
    });
    it('als Grundformen: ein Stiel nach oben und ein liegender Ring — Warnung in Warnfarbe', () => {
        const g = markenGrundformen([m[0]], { farben: { warn: '#f00', accent: '#00f' } });
        expect(g.map(x => x.art)).toEqual(['linie', 'marke']);
        expect(g[1]).toMatchObject({ farbe: '#f00', normal: { x: 0, y: 1, z: 0 } });
        expect(g[1].punkt.y).toBeCloseTo(m[0].punkt.y + 1.5, 9);
        expect(EBENEN.befunde).toBeLessThan(EBENEN.vorschau);       // Vorschau und Griffe gehen vor
    });
});

describe('die Hülle je gebautem Teil kommt aus dem Aufbau — ohne Worker', () => {
    it('autor.huellen nach baueErzeugte: Welt-Grenzen der Geometrie, die ins Modell ging', async () => {
        const a = new IfcAutor({ getFragments: () => null, kernel: erzeugeKernel(), getHoehenversatz: () => 0 });
        a.verwirfEigenesModell = vi.fn(async () => {});
        a.eigenesModell = vi.fn(async () => ({ ok: true, modelId: CDE_MODELL_ID, neu: true }));
        a._neuZeichnen = vi.fn(async () => {});
        a.erzeugeAlle = vi.fn(async (_m, b) => b.map((_, i) => ({ ok: true, localId: 100 + i })));
        const r = erzeugtEintrag({ rezept: 'rohr', kategorie: 'IFCPIPESEGMENT', name: 'H1', parameter: { punkte: [[0, 10, 0], [8, 10, 0]], dn: 400 } });
        await a.baueErzeugte([{ globalId: 'cde-r', art: 'erzeugt', modell: 'cde', wert: r.nachher }]);
        const h = a.huellen.get('cde-r');
        expect(h.min.x).toBeCloseTo(0, 6); expect(h.max.x).toBeCloseTo(8, 6);
        expect(h.max.y).toBeCloseTo(10.2, 3);                       // Rohrmitte + DN/2
    });
});

describe('der Viewer (Textwächter)', () => {
    const viewer = lies('components/IfcViewer.vue');
    it('die Massen-Probe hängt an den GRIFFEN, nicht am Zeichenmotor (im Browser gefunden: sie stand bei useEingabe)', () => {
        const block = (name) => { const a = viewer.indexOf(`const ${name} = `); return viewer.slice(a, viewer.indexOf('\n});', a)); };
        expect(block('griffe')).toContain('probeMengen: () => probeMengen()');
        expect(block('eingabe')).not.toContain('probeMengen');
    });
    it('Marken und Zähler nur im Bearbeiten-Modus; der Zähler steht in der Bearbeitungsmarke, kein neuer Knopf oben', () => {
        expect(viewer).toMatch(/const befundmarken = computed\(\(\) => \{\s*if \(!bearbeitung\.modusAn\) return \[\];/);
        const ab = viewer.indexOf('<div v-if="bearbeitung.modusAn" class="bearb-marke">');
        const marke = viewer.slice(ab, viewer.indexOf('<Transition name="fade">', ab));
        expect(marke).toContain('@click="naechsterBefund"');
        expect(viewer).toContain("engine.value?.overlayZeige?.('befunde', markenGrundformen(m, { farben: tokenFarben() }))");
    });
});
