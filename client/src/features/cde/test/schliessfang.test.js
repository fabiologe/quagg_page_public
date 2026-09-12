// @vitest-environment jsdom
/**
 * Der SCHLIESSFANG (Teil XX, Fabio 2026-09-10): „es gibt kein Schliessfang,
 * sodass man kein geschlossenes Polygon erstellen kann". Ein Tipp nahe dem
 * ERSTEN Punkt schliesst einen Umriss — im Lageplan wie im Raum, mit EINER
 * Regel — und schreibt NICHTS (Tablet-Regel 4): Tiefe und Neigung sind beim
 * Ausheben vorbelegt, das Formular ist also sofort „bereit"; ohne diese Zusage
 * hätte schon das Schliessen eingetragen.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createPinia, setActivePinia } from 'pinia';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { useAenderungen } from '../stores/useAenderungen.js';
import { useEingabe } from '../composables/useEingabe.js';
import { _zugPrimitive } from '../composables/useVorschau.js';
import { SCHLIESS_RADIUS_PX, schliesstUmriss } from '../services/Eingaben.js';

const lies = (p) => readFileSync(resolve(process.cwd(), 'src/features/cde', p), 'utf8');

beforeEach(() => { localStorage.clear(); setActivePinia(createPinia()); useBearbeitung().modusSetzen(true); });

const GELAENDE = {
    modelId: 'm1', localId: 7, category: 'IFCGEOGRAPHICELEMENT', globalId: 'DGM1', name: 'Urgelände',
    hoehenversatz: 300, quellmass: { pruefmass: { triCount: 800 }, cell: 1 },
};
/** Nah heisst hier: im Grundriss unter einem Meter vom ersten Punkt. */
const naheAn = (p) => (p0) => Math.hypot(p0.x - p.x, p0.z - p.z) < 1;

async function aushebenMitDreiPunkten() {
    const b = useBearbeitung();
    const m = useEingabe({ bearbeitung: b, cde: { bearbeiter: 'Fabio' }, getModellSha: () => 'sha1',
                           getHoehenversatz: () => 300, getHoeheAn: () => 4 });
    await b.einordne({ ...GELAENDE }, null);
    expect(b.starte('graben-ausheben', { subjekt: GELAENDE })).toBe(true);
    for (const p of [{ x: 0, z: 0 }, { x: 20, z: 0 }, { x: 20, z: 20 }]) m.setzePunkt(p, { nahe: naheAn(p) });
    return { b, m };
}

describe('Die Regel', () => {
    it('schliesst nur einen UMRISS, erst ab der Mindestzahl, nur nahe am ersten Punkt', () => {
        expect(schliesstUmriss({ schlitz: 'umriss', punkte: 3, mindest: 3, nahe: true })).toBe(true);
        expect(schliesstUmriss({ schlitz: 'zug', punkte: 5, mindest: 2, nahe: true })).toBe(false);
        expect(schliesstUmriss({ schlitz: 'umriss', punkte: 2, mindest: 3, nahe: true })).toBe(false);
        expect(schliesstUmriss({ schlitz: 'umriss', punkte: 4, mindest: 3, nahe: false })).toBe(false);
        expect(SCHLIESS_RADIUS_PX.touch).toBeGreaterThan(SCHLIESS_RADIUS_PX.mouse);   // der Finger ist ungenauer
    });
});

describe('Der Motor', () => {
    it('ein Tipp auf den ersten Punkt schliesst — kein vierter Punkt, Zustand „prüfen", NICHTS geschrieben', async () => {
        const { b, m } = await aushebenMitDreiPunkten();
        expect(b.bereit).toBe(true);                                      // Tiefe und Neigung vorbelegt
        expect(m.setzePunkt({ x: 0.3, z: 0.2 }, { nahe: naheAn({ x: 0.3, z: 0.2 }) })).toBe(true);
        expect(m.punkte.value).toHaveLength(3);
        expect(m.phase.value).toBe('pruefen');
        expect(useAenderungen().eintraege).toHaveLength(0);
        expect(m.zug.value.geschlossen).toBe(true);
    });

    it('der Raum-Tipp (aufTreffer) schliesst genauso — und schreibt ebenso nichts', async () => {
        const { m } = await aushebenMitDreiPunkten();
        expect(m.aufTreffer({ point: { x: 0.2, y: 4, z: 0.1 }, nahe: naheAn({ x: 0.2, z: 0.1 }) })).toBe(true);
        await Promise.resolve();
        expect(m.phase.value).toBe('pruefen');
        expect(useAenderungen().eintraege).toHaveLength(0);
    });

    it('fern vom ersten Punkt entsteht ein weiterer Punkt; unter drei Punkten wird nie geschlossen', async () => {
        const { m } = await aushebenMitDreiPunkten();
        m.setzePunkt({ x: 0, z: 20 }, { nahe: naheAn({ x: 0, z: 20 }) });
        expect(m.punkte.value).toHaveLength(4);
        expect(m.phase.value).toBe('sammeln');

        const b = useBearbeitung();
        b.abbrechen();
        const zwei = useEingabe({ bearbeitung: b, cde: {}, getHoehenversatz: () => 300, getHoeheAn: () => 4 });
        expect(b.starte('graben-ausheben', { subjekt: GELAENDE })).toBe(true);
        zwei.setzePunkt({ x: 0, z: 0 }, { nahe: naheAn({ x: 0, z: 0 }) });
        zwei.setzePunkt({ x: 0.2, z: 0 }, { nahe: naheAn({ x: 0.2, z: 0 }) });   // nah, aber erst 1 Punkt
        expect(zwei.punkte.value).toHaveLength(2);
        expect(zwei.phase.value).toBe('sammeln');
    });

    it('geschlossen bleibt geschlossen, wenn wieder auf den ersten Punkt getippt wird; ein Tipp daneben öffnet', async () => {
        const { m } = await aushebenMitDreiPunkten();
        m.setzePunkt({ x: 0, z: 0 }, { nahe: naheAn({ x: 0, z: 0 }) });
        m.setzePunkt({ x: 0.1, z: 0 }, { nahe: naheAn({ x: 0.1, z: 0 }) });
        expect(m.phase.value).toBe('pruefen');
        expect(m.punkte.value).toHaveLength(3);
        m.setzePunkt({ x: 10, z: 30 }, { nahe: naheAn({ x: 10, z: 30 }) });
        expect(m.phase.value).toBe('sammeln');
        expect(m.punkte.value).toHaveLength(4);
    });

    it('übernommen wird erst mit Enter bzw. dem Knopf — dann entsteht die Grube', async () => {
        const { m } = await aushebenMitDreiPunkten();
        m.setzePunkt({ x: 0, z: 0 }, { nahe: naheAn({ x: 0, z: 0 }) });
        const e = await m.enter();
        expect(e).toBeTruthy();
        expect(useAenderungen().eintraege.some(x => x.nachher?.parameter?.operationen?.[0]?.art === 'grube')).toBe(true);
    });
});

describe('Die Anzeige', () => {
    const PTS = [{ x: 0, y: 1, z: 0 }, { x: 10, y: 1, z: 0 }, { x: 10, y: 1, z: 10 }];
    it('beim Umriss: der erste Punkt als Fangziel (gross, Fang-Farbe), die Schlusskante gestrichelt — geschlossen durchgezogen', () => {
        const offen = _zugPrimitive(PTS, null, { umriss: true, fangFarbe: '#f00', farbe: '#00f' });
        const start = offen.filter(p => p.art === 'marke' && p.farbe === '#f00');
        expect(start).toHaveLength(1);
        expect(start[0].radius).toBeGreaterThan(0.2);
        const schluss = offen.filter(p => p.art === 'linie' && p.punkte.length === 2 && p.punkte[1].x === 0 && p.punkte[1].z === 0);
        expect(schluss).toHaveLength(1);
        expect(schluss[0].gestrichelt).toBe(true);
        const zu = _zugPrimitive(PTS, null, { umriss: true, geschlossen: true, fangFarbe: '#f00', farbe: '#00f' });
        expect(zu.find(p => p.art === 'linie' && p.punkte.length === 2 && p.punkte[1].x === 0).gestrichelt).toBe(false);
        expect(_zugPrimitive(PTS, null, {}).some(p => p.farbe === '#ffb74d')).toBe(false);   // offene Linie: kein Fangziel
    });
});

describe('Wächter: der Schliessfang ist im Raum verdrahtet — gezeichnet wird nur dort (E8)', () => {
    it('Raum: vor dem Strahl, in Bildschirmpixeln nach Zeigerart; der Lageplan nimmt keine Punkte mehr an', () => {
        const viewer = lies('components/IfcViewer.vue');
        const tipp = viewer.slice(viewer.indexOf('async function tippFuerMotor'), viewer.indexOf('async function schachtSubjekt'));
        expect(tipp.indexOf('schliesseWennNahe')).toBeGreaterThan(-1);
        expect(tipp.indexOf('schliesseWennNahe')).toBeLessThan(tipp.indexOf('probeTreffer'));
        expect(tipp).toMatch(/SCHLIESS_RADIUS_PX\[tipp\.typ\]/);
        // Abnahme 2026-09-12 (B6 → E8): der Lageplan ist das Blatt — dort setzt kein Tipp mehr einen Zug-Punkt.
        expect(lies('components/IfcPlanCanvas.vue')).not.toMatch(/zeichnen\.setzePunkt/);
    });
});

describe('Wächter: beim Zeichnen steht kein Kontextmenü über der Zeichenfläche', () => {
    it('der HUD-Anker entfällt, solange der Eingabe-Motor sammelt', () => {
        expect(lies('components/IfcViewer.vue')).toMatch(/:elementAnker="eingabe\.aktiv\.value \? null : selectionAnchor"/);
    });
});
