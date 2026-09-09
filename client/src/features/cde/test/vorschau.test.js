/**
 * Die Vorschau aus der Beschreibung (Teil XVI, S2) — an ECHTEN Katalogeinträgen.
 *
 * Kein Werkzeug schreibt seine Vorschau: `anwenden` liefert die Einträge,
 * `vorschauFuer` faltet sie nach Art × Bauform in Primitive. Geprüft wird
 * hier genau diese Faltung, mit den Bauteilen, wie sie aus
 * `_einordnenMitHuelle` herauskommen.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { nachId } from '../services/Bearbeitungen.js';
import { vorschauFuer, VORSCHAU_BUDGET_MS } from '../services/Vorschau.js';
import { ableitungNach } from '../services/ableitung/Ableitungen.js';

const WURZEL = new URL('..', import.meta.url).pathname;

/** Ein geliefertes Rohr mit Achse, Hülle und Box — Welt = NN (Versatz 0). */
const ROHR = {
    modelId: 'm1', localId: 42, category: 'IFCPIPESEGMENT', globalId: 'ROHR', name: 'H-001',
    anker: { x: 10, y: 300, z: 0 }, bezugshoehe: 299.85, oberkante: 300.15,
    box: { min: { x: 0, y: 299.85, z: -0.15 }, max: { x: 20, y: 300.15, z: 0.15 } },
    hoehenversatz: 0,
    achse: { anfang: { x: 0, y: 300, z: 0 }, ende: { x: 20, y: 299.8, z: 0 }, laenge: 20, dn: 300,
             polyline: [{ x: 0, y: 300, z: 0 }, { x: 20, y: 299.8, z: 0 }] },
    quellmass: { pruefmass: { triCount: 44 }, cell: 1 },
    gelaendeQuellen: [{ globalId: 'DGM', name: 'Gelände', pruefmass: null, cell: 1, herkunft: 'geliefert' }],
};
const GELAENDE = {
    modelId: 'm1', localId: 7, category: 'IFCGEOGRAPHICELEMENT', globalId: 'DGM', name: 'Gelände',
    anker: { x: 50, y: 302, z: 50 }, bezugshoehe: 298, oberkante: 306, hoehenversatz: 0,
    quellmass: { pruefmass: { triCount: 1000 }, cell: 1 },
};
const hoeheAn = () => 302;   // flaches Gelände auf 302

describe('Faltung nach Art', () => {
    it('Haltung teilen: Original gedimmt, zwei Geister aus dem Rezept, Chip „2 neue Bauteile"', () => {
        const b = nachId('haltung-teilen');
        const v = vorschauFuer(b.anwenden(ROHR, { station: 8 }), { subjekt: ROHR, werkzeug: b });
        expect(v.faerbungen).toEqual([{ globalId: 'ROHR', rolle: 'dimmen' }]);
        const geister = v.primitive.filter(p => p.art === 'bauplan');
        expect(geister).toHaveLength(2);
        expect(geister[0].bauplan.rezept).toBe('rohr');
        expect(v.chips.map(c => c.text)).toContain('2 neue Bauteile');
    });

    it('Sohlhöhen festlegen: eine FORDERUNG (gestrichelt), nie ein Geist — und das Gefälle im Chip', () => {
        const b = nachId('sohlhoehen-setzen');
        const v = vorschauFuer(b.anwenden(ROHR, { anfang: 301.2, ende: 300.8 }), { subjekt: ROHR, werkzeug: b });
        expect(v.primitive.some(p => p.art === 'forderung')).toBe(true);
        expect(v.primitive.some(p => p.art === 'bauplan' || p.art === 'geist')).toBe(false);
        const f = v.primitive.find(p => p.art === 'forderung');
        expect(f.linien[0][0]).toEqual({ x: 0, y: 301.2, z: 0 });
        expect(f.linien[0][1]).toEqual({ x: 20, y: 300.8, z: 0 });
        expect(v.chips.find(c => c.art === 'forderung').text).toMatch(/20\.0 ‰/);
    });

    it('Bezugshöhe setzen: die Box springt an den neuen Ort, ein Pfeil zeigt den Weg, das Lot fällt aufs Gelände', () => {
        const b = nachId('bezugshoehe-setzen');
        const v = vorschauFuer(b.anwenden(ROHR, { hoehe: 305 }), { subjekt: ROHR, werkzeug: b, hoeheAn });
        const box = v.primitive.find(p => p.art === 'box');
        expect(box.min.y).toBeCloseTo(299.85 + (305 - 299.85), 9);
        const pfeil = v.primitive.find(p => p.art === 'versatz');
        expect(pfeil.von).toEqual(ROHR.anker);
        expect(pfeil.nach.y).toBeCloseTo(300 + 5.15, 9);
        expect(v.primitive.some(p => p.art === 'linie' && p.gestrichelt)).toBe(true);   // das Lot
        expect(v.chips[0].text).toMatch(/ΔH \+5\.15 m/);
    });

    it('Kostengruppe: nur ein Chip — nichts zu zeichnen', () => {
        const b = nachId('kg-setzen');
        const v = vorschauFuer(b.anwenden(ROHR, { kg: '410' }), { subjekt: ROHR, werkzeug: b });
        expect(v.primitive).toEqual([]);
        expect(v.chips.some(c => c.art === 'festlegung')).toBe(true);
    });
});

describe('Ableitungen — Anschauung, nie leite()', () => {
    it('Gerinne: Trapez-Geist entlang des gedrapeten Zugs, Ur-Gelände gedimmt, „Massen nach Übernehmen"', () => {
        const b = nachId('gerinne-einschneiden');
        const zug = [{ x: 0, y: 302, z: 0 }, { x: 10, y: 302, z: 0 }, { x: 10, y: 302, z: 10 }];
        const eintraege = b.anwenden(GELAENDE, { sohleAnfang: 300, sohleEnde: 299.5, sohlbreite: 1, boeschung: 1.5 }, { zug });
        const v = vorschauFuer(eintraege, { subjekt: GELAENDE, werkzeug: b, hoeheAn, hoehenversatz: 0 });
        expect(v.faerbungen).toEqual([{ globalId: 'DGM', rolle: 'dimmen' }]);
        const geist = v.primitive.find(p => p.art === 'geist');
        expect(geist).toBeTruthy();
        expect(geist.triCount).toBeGreaterThan(10);
        expect(geist.positions.length).toBe(geist.triCount * 9);
        expect(v.chips.some(c => /Gerinne · Sohle 300\.00 → 299\.50/.test(c.text))).toBe(true);
        expect(v.chips.some(c => /Massen nach Übernehmen/.test(c.text))).toBe(true);
    });

    it('Planum: eine Platte zwischen Sollhöhe und Gelände plus der Umriss', () => {
        const b = nachId('planum-herstellen');
        const zug = [{ x: 0, y: 302, z: 0 }, { x: 10, y: 302, z: 0 }, { x: 10, y: 302, z: 10 }, { x: 0, y: 302, z: 10 }];
        const v = vorschauFuer(b.anwenden(GELAENDE, { hoehe: 300 }, { zug }), { subjekt: GELAENDE, werkzeug: b, hoeheAn });
        expect(v.primitive.some(p => p.art === 'geist')).toBe(true);
        expect(v.primitive.some(p => p.art === 'umriss')).toBe(true);
    });

    it('Kanalgraben: Trapez an der Rohrachse des Subjekts, Überdeckung als Chip', () => {
        const b = nachId('kanalgraben-ableiten');
        const v = vorschauFuer(b.anwenden(ROHR, { gelaende: 'DGM', dn: 300, arbeitsraum: 0.4, bettung: 0.15, boeschung: 0.5 }),
                               { subjekt: ROHR, werkzeug: b, hoeheAn });
        expect(v.faerbungen).toEqual([{ globalId: 'DGM', rolle: 'dimmen' }]);
        expect(v.primitive.some(p => p.art === 'geist')).toBe(true);
        // Gelände 302, Scheitel 300,15 → Überdeckung 1,85 m ≥ 0,8
        expect(v.chips.some(c => /Überdeckung ≥ 1\.85 m/.test(c.text))).toBe(true);
    });

    it('Aussparung: das Werkzeug wird ZIEL, das Bauwerk tritt zurück — gerechnet wird nichts', () => {
        const b = nachId('aussparung-ableiten');
        const el = { ...ROHR, koerperQuellen: [{ globalId: 'WZ', name: 'Rohr eigen' }] };
        const v = vorschauFuer(b.anwenden(el, { werkzeug: 'WZ' }), { subjekt: el, werkzeug: b });
        expect(v.faerbungen).toEqual(expect.arrayContaining([
            { globalId: 'ROHR', rolle: 'dimmen' }, { globalId: 'WZ', rolle: 'ziel' }]));
        expect(v.primitive.filter(p => p.art === 'geist')).toHaveLength(0);
    });

    it('jede Ableitung hat einen vorschau()-Haken', () => {
        for (const id of ['erdbau', 'kanalgraben', 'aussparung']) {
            expect(typeof ableitungNach(id).vorschau, id).toBe('function');
        }
    });
});

describe('Budget und Ehrlichkeit', () => {
    it('`einfach` lässt Geister und Bauplan-Vorschau weg und sagt es', () => {
        const b = nachId('haltung-teilen');
        const v = vorschauFuer(b.anwenden(ROHR, { station: 8 }), { subjekt: ROHR, werkzeug: b, einfach: true });
        expect(v.primitive.filter(p => p.art === 'bauplan')).toHaveLength(0);
        expect(v.faerbungen).toHaveLength(1);
        expect(v.chips.some(c => c.art === 'einfach')).toBe(true);
    });

    it('über dem Budget meldet sie die Dauer statt zu schweigen', () => {
        let t = 0;
        const jetzt = () => (t += 40);
        const v = vorschauFuer([], { jetzt });
        expect(v.dauerMs).toBe(40);
        expect(v.hinweise.some(h => h.startsWith('vorschau_langsam'))).toBe(true);
        expect(VORSCHAU_BUDGET_MS).toBe(16);
    });

    it('null, leere Listen und Einträge ohne Art sind kein Fehler', () => {
        expect(vorschauFuer(null).primitive).toEqual([]);
        expect(vorschauFuer([{}, null, { art: 'lage' }]).primitive).toEqual([]);
    });
});

describe('Reinheit (Textwächter)', () => {
    const q = readFileSync(WURZEL + 'services/Vorschau.js', 'utf8');
    it('importiert weder three noch vue — und rechnet nie das Ergebnis', () => {
        expect(q).not.toMatch(/from ['"]three['"]|from ['"]vue['"]/);
        expect(q).not.toMatch(/\bleite\(|baueErzeugte\(|getForm\(|koerperZwischenRastern|formeNach\(/);
    });
    it('die Vorschau erreicht das Journal nicht', () => {
        expect(readFileSync(WURZEL + 'composables/useVorschau.js', 'utf8')).not.toMatch(/from ['"][^'"]*useAenderungen|\.eintragen\(/);
    });
});
