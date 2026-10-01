// @vitest-environment jsdom
/**
 * Teil XXVI — der VERTRAG mit dem Schreiber, an der ECHTEN Kette: die Kammer.
 *
 * Muster `paketVertrag.test.js`: die Python-Tests des Schreibers bauen ihre
 * Pakete sonst selbst — „Tests prüfen die echte Schnittstelle". Hier wird die
 * Kammer aus Abschnitt 6 des Fahrplans über die ZEICHENWERKZEUGE angelegt,
 * durch den Autor gebaut und vom Paketbauer verpackt; abgelegt wird genau
 * dieses Paket, und `test_bauwerke.py::test_vertrag_kammer_*` schickt es durch
 * Schreiber und Prüftor.
 *
 * Die Kammer wächst mit dem Teil: Z3 Merkmale, Z4 Mengen, Z5 Bauwerk, Z6 Raum.
 * Damit die Fixture nicht still veraltet, vergleicht der Test bei jedem Lauf
 * ihre FORM. Neu schreiben:
 *
 *     BAUWERK_VERTRAG_SCHREIBEN=1 npx vitest run src/features/cde/test/bauwerkVertrag.test.js
 *
 * Lichte Maße 4,00 × 3,00 m, lichte Höhe 2,50 m, Wände 0,30 m stumpf gestossen
 * (Längswände aussen durchlaufend), Bodenplatte 0,40 m mit Oberkante 210,00,
 * Decke 0,25 m mit Unterkante 212,50. Höhenversatz 0: Welt-Y = m NN.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { nachId } from '../services/Bearbeitungen.js';
import { mitKennungen } from '../services/Bauteilrezepte.js';
import { erzeugeKernel } from '../services/geometrie/Kernel.js';
import { IfcAutor } from '../services/IfcAutor.js';
import { baueEigenbauPaket, PAKET_VERSION } from '../services/EigenbauPaket.js';

const FIXTURE = resolve(process.cwd(), '../backend/app/ifc/tests/daten/paket_bauwerke.json');

/** Formgerechte GlobalIds sind hier nicht nötig — die CDE-Kennung `cde-…` macht der Schreiber zur GUID. */
export const KAMMER = Object.freeze({
    bodenplatte: 'cde-KA-bodenplatte', decke: 'cde-KA-decke',
    wandNord: 'cde-KA-wand-nord', wandSued: 'cde-KA-wand-sued',
    wandWest: 'cde-KA-wand-west', wandOst: 'cde-KA-wand-ost',
});

const P = (x, y, z) => ({ x, y, z });
const RECHTECK = (y) => [P(0, y, 0), P(4.6, y, 0), P(4.6, y, 3.6), P(0, y, 3.6)];

/** Ein Bauteil über das Zeichenwerkzeug — dieselbe Funktion, die die Oberfläche ruft. */
function zeichne(stand, werkzeug, gid, punkte, werte) {
    const schritte = mitKennungen(() => gid, () => nachId(werkzeug).anwenden({ punkte, hoehenversatz: 0 }, werte, { zug: [] }));
    for (const s of [].concat(schritte ?? []).filter(Boolean)) if (s.art === 'erzeugt') stand.set(s.globalId, s.nachher);
}

/** Die Kammer als Journalstand: sechs Bauteile. */
export function kammerStand() {
    const s = new Map();
    zeichne(s, 'platte-zeichnen', KAMMER.bodenplatte, RECHTECK(210.0),
            { name: 'Bodenplatte', kategorie: 'IFCSLAB', hoehe: '', dicke: 0.4 });
    const wand = (gid, name, a, b) =>
        zeichne(s, 'wand-zeichnen', gid, [P(a[0], 210.0, a[1]), P(b[0], 210.0, b[1])],
                { name, kategorie: 'IFCWALL', hoehe: '', dicke: 0.3, wandhoehe: 2.5 });
    // Längswände aussen durchlaufend (4,60 m), Achse 0,15 m innen von der Aussenkante.
    wand(KAMMER.wandNord, 'Längswand Nord', [0, 0.15], [4.6, 0.15]);
    wand(KAMMER.wandSued, 'Längswand Süd', [0, 3.45], [4.6, 3.45]);
    // Querwände dazwischen (3,00 m).
    wand(KAMMER.wandWest, 'Querwand West', [0.15, 0.3], [0.15, 3.3]);
    wand(KAMMER.wandOst, 'Querwand Ost', [4.45, 0.3], [4.45, 3.3]);
    zeichne(s, 'platte-zeichnen', KAMMER.decke, RECHTECK(212.75),
            { name: 'Decke', kategorie: 'IFCSLAB', hoehe: '', dicke: 0.25 });
    return s;
}

export async function kammerPaket() {
    const s = kammerStand();
    const autor = new IfcAutor({ getFragments: () => null, holeQuellForm: () => null,
                                 kernel: erzeugeKernel(), getHoehenversatz: () => 0 });
    const schritte = [...s].map(([globalId, wert]) => ({ art: 'erzeugt', globalId, modell: 'cde', wert }));
    const g = await autor.eigenbauGeometrien(schritte, { verdeckt: new Set() });
    return baueEigenbauPaket({
        teile: g.bauteile, kanten: g.kanten, stand: s, anzeigeformen: g.anzeigeformen,
        // UTM32 in der Gegend der BIM26-Lieferungen — das Fenster, das V06b prüft.
        nachProjekt: (p) => ({ ost: 410300 + p.x, nord: 5460100 - p.z, hoehe: p.y }),
        crs: 'EPSG:25832', projektname: 'Kammer', schluessel: 'kammer',
        journal: { commit: 'c-kammer', sitzungOffen: false }, jetzt: new Date('2026-10-01T00:00:00Z'),
    });
}

/** Die FORM des Pakets — worauf der Schreiber sich verlässt, ohne Koordinaten. */
function form(p) {
    const k = (o) => Object.keys(o ?? {}).sort();
    return {
        oben: k(p), version: p.version, crs: p.crs,
        bauteile: p.bauteile.map(b => ({
            cdeId: b.cdeId, klasse: b.klasse, rezept: b.rezept, predefinedType: b.predefinedType,
            schluessel: k(b), merkmale: b.merkmale ?? null, mengen: k(b.mengen), mengenMethode: b.mengenMethode ?? null,
            geometrie: b.punkte.length >= 3 && b.dreiecke.length > 0,
        })),
        uebersprungen: p.uebersprungen.map(u => u.grund),
    };
}

describe('Die Kammer — der Vertrag mit dem Schreiber (Teil XXVI)', () => {
    it('sechs Bauteile über die echten Werkzeuge, und die Fixture hat die Form von heute', async () => {
        const paket = await kammerPaket();
        expect(paket.version).toBe(PAKET_VERSION);
        const nach = Object.fromEntries(paket.bauteile.map(b => [b.cdeId, b]));
        expect(Object.keys(nach).sort()).toEqual(Object.values(KAMMER).sort());
        expect(paket.uebersprungen).toEqual([]);

        // Z3: jedes Teil trägt seinen bSI-Satz — aus der Vorgabe der Rezeptfelder.
        for (const id of [KAMMER.bodenplatte, KAMMER.decke]) {
            expect(nach[id].klasse).toBe('IFCSLAB');
            expect(nach[id].merkmale).toEqual({ Pset_SlabCommon: { LoadBearing: true } });
        }
        for (const id of [KAMMER.wandNord, KAMMER.wandSued, KAMMER.wandWest, KAMMER.wandOst]) {
            expect(nach[id].klasse).toBe('IFCWALL');
            expect(nach[id].merkmale).toEqual({ Pset_WallCommon: { LoadBearing: true, IsExternal: true } });
        }

        // Z4: die Mengen der Kammer aus Abschnitt 6 des Fahrplans — von Hand gerechnet.
        const r3 = (v) => Math.round(v * 1000) / 1000;
        expect(r3(nach[KAMMER.bodenplatte].mengen.netVolume)).toBe(6.624);           // 4,60 · 3,60 · 0,40
        expect(r3(nach[KAMMER.bodenplatte].mengen.netArea)).toBe(16.56);             // 4,60 · 3,60
        expect(r3(nach[KAMMER.decke].mengen.netVolume)).toBe(4.14);                  // 4,60 · 3,60 · 0,25
        expect(r3(nach[KAMMER.wandNord].mengen.netVolume)).toBe(3.45);               // 4,60 · 0,30 · 2,50
        expect(r3(nach[KAMMER.wandWest].mengen.netVolume)).toBe(2.25);               // 3,00 · 0,30 · 2,50
        const beton = paket.bauteile.reduce((a, b) => a + b.mengen.netVolume, 0);
        expect(r3(beton)).toBe(22.164);
        expect(paket.bauteile.every(b => b.mengenMethode === 'koerper')).toBe(true);

        if (process.env.BAUWERK_VERTRAG_SCHREIBEN) writeFileSync(FIXTURE, JSON.stringify(paket));
        expect(existsSync(FIXTURE), 'Fixture fehlt: BAUWERK_VERTRAG_SCHREIBEN=1 npx vitest run src/features/cde/test/bauwerkVertrag.test.js').toBe(true);
        expect(form(JSON.parse(readFileSync(FIXTURE, 'utf8')))).toEqual(form(paket));
    });
});
