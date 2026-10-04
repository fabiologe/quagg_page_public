// @vitest-environment jsdom
/**
 * Teil XXIX, G7 — die Probe P11: der Retentionsteich über Kommandos (Konzept § 11).
 *
 * Gelände eben auf 100,00 (Welt = NN). Die Kommandofolge aus `hilfen/p11Kommandos.js`: zwei Bauwerke, die Mulde, neun
 * Schicht-Elemente aus der Bibliothek, Dauerstau und Rückhalteraum, Zulauf, Drosselbauwerk, Steg, Weg und Zufahrt,
 * Ausstattung, die Zuordnungen. Gemessen:
 *   - jedes Kommando geht durch, jedes Bauteil baut;
 *   - Dauerstau ≈ 992 m³, Rückhalteraum ≈ 1 424 m³ (von Hand; gerechnet fehlen die Eckgrate, 1/6 m³ bei 0,5 m);
 *   - jedes Element kommt mit Klasse, Ausführung und Gewerk von § 11.1 an — das Gewerk aus der Regel, AUSDRÜCKLICH nur
 *     dort, wo es von ihr abweicht (Oberboden: Landschaft, Stirnwand: Wasserbau): „die Facetten tragen ohne Sonderfall";
 *   - das Paket geht an den Schreiber (`test_bauwerke.py::test_p11…`): je Bauwerk und Gewerk ein System.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { repo } from '../services/RepoFacade.js';
import { useAenderungen } from '../stores/useAenderungen.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { gewerkVon, predefinedTypeVon } from '../services/Bauteilrezepte.js';
import { erzeugeKernel } from '../services/geometrie/Kernel.js';
import { rasterAusMesh } from '../services/geometrie/ops/Raster.js';
import { IfcAutor } from '../services/IfcAutor.js';
import { baueEigenbauPaket } from '../services/EigenbauPaket.js';
import { facettenVon } from '../services/Facetten.js';
import { subjektAusStand } from '../services/kommando/Subjekt.js';
import { Speicher } from './hilfen/vorlagenKommandos.js';
import { P11_SOLL, p11Kommandos } from './hilfen/p11Kommandos.js';

/** Das Vertragspaket für den Schreiber: `P11_VERTRAG_SCHREIBEN=1 npx vitest run …/p11Teich.test.js`. */
const FIXTURE = `${process.cwd()}/../backend/app/ifc/tests/daten/paket_p11_teich.json`;

beforeEach(() => { repo.setBackend(new Speicher()); setActivePinia(createPinia()); });
afterEach(() => repo.setBackend(null));

/** Ein ebenes Gelände 140 × 140 m auf 100,00. */
function ebene() {
    const t = [];
    for (let x = -20; x < 120; x += 4) for (let z = -20; z < 120; z += 4) {
        t.push(x, 100, z, x + 4, 100, z, x + 4, 100, z + 4, x, 100, z, x + 4, 100, z + 4, x, 100, z + 4);
    }
    return { positions: new Float64Array(t), triCount: t.length / 9 };
}
const NETZ = ebene();
const holeQuellForm = async (gid, form, { cell, bereich = null, gitter = null } = {}) =>
    (gid === 'UR' && form === 'raster' ? rasterAusMesh({ mesh: NETZ }, { cell: cell ?? 2, bereich, gitter }).ergebnis : null);
const URSUBJEKT = { modelId: 'm1', localId: 1, globalId: 'UR', name: 'Urgelände', category: 'IFCGEOGRAPHICELEMENT', hoehenversatz: 0,
                    quellmass: { pruefmass: { triCount: NETZ.triCount, spanX: 140, spanY: 0, spanZ: 140 }, cell: 2 } };

describe('Teil XXIX, G7 — P11: der Retentionsteich über Kommandos', () => {
    it('jedes Kommando geht durch, jedes Bauteil baut; Wasser, Klassen, Gewerke und Bauwerke wie § 11.1', async () => {
        const b = useBearbeitung(), ae = useAenderungen();
        const { kommandos, teich, steg, ohne } = p11Kommandos();
        let i = 0;
        const kennungsgeber = (art) => (art === 'operation' ? `op-g${++i}` : `cde-g${++i}`);
        for (const kom of kommandos) {
            const r = await b.fuehreAus(kom, { subjektVon: (gid) => (gid === 'UR' ? URSUBJEKT : null), kennungsgeber });
            expect(r.ausgefuehrt, `${kom.id} ${kom.werkzeug}: ${r.grund}`).toBe(true);
        }
        expect(kommandos.length).toBe(70);

        const stand = ae.wirksamerStand('erzeugt');
        const autor = new IfcAutor({ getFragments: () => null, holeQuellForm, kernel: erzeugeKernel(), getHoehenversatz: () => 0 });
        const g = await autor.eigenbauGeometrien([...stand].map(([globalId, wert]) => ({ globalId, wert })), { verdeckt: new Set() });
        expect(g.misserfolge).toEqual([]);
        const gebaut = new Set(g.bauteile.map(t => t.globalId));
        for (const gid of [...teich, ...steg, ...ohne]) expect(gebaut.has(gid), gid).toBe(true);

        // Das Wasser — die Mulde des Aushubs, nicht ein Prisma. WIE IN DER REALITÄT (nach G8, Fabio): ausgehoben bis zum
        // Erdplanum (um den Aufbau 0,81 m tiefer, Rand 2,56 m weiter aussen), darauf Schicht auf Schicht; die Oberkante
        // ist wieder die Mulde von Hand. Vorher (ohne Aufbau, Kanten auf Rasterknoten) auf 1e-3 genau: 992 − 1/6 m³.
        // Jetzt liegt die Aushubkante ZWISCHEN den Knoten (0,5-m-Raster): eine Schräge über eine Zelle, der Aufbau folgt
        // ihr. Gemessen 989,67 / 1 423,08 m³ (−0,22 % / −0,06 %); die Grenze hier ist 0,3 %.
        const kz = (gid) => g.bauteile.find(t => t.globalId === gid).kennzahlen;
        expect(Math.abs(kz('cde-T12').volumen / 992 - 1)).toBeLessThan(0.003);
        expect(Math.abs(kz('cde-T13').volumen / 1424 - 1)).toBeLessThan(0.003);
        expect(kz('cde-T12').gelaende).toBe('nach Erdbau');
        expect(kz('cde-T7').liegtAuf).toEqual(['cde-T5', 'cde-T6']);

        // DIE FUGEN — liegt Schicht auf Schicht, ohne Spalt und ohne Überschneidung? Je gemeinsamer Ecke (x, z): die
        // Oberkante der unteren gegen die Unterkante der oberen. Gemessen 0,000 m (die Schicht liest Unter- und
        // Oberkante aus DEMSELBEN angehobenen Raster wie die nächste ihr Gelände); der Wasserkörper hält an seiner
        // Wasserlinie 10 µm Abstand (Mulde.js, KNOTEN_ABSTAND).
        const spanne = (gid) => {
            const p = g.bauteile.find(t => t.globalId === gid).positionen, m = new Map();
            for (let k = 0; k < p.length; k += 3) {
                const key = `${Math.round(p[k] * 1e5)}|${Math.round(p[k + 2] * 1e5)}`;
                const e = m.get(key) ?? [Infinity, -Infinity];
                m.set(key, [Math.min(e[0], p[k + 1]), Math.max(e[1], p[k + 1])]);
            }
            return m;
        };
        const fuge = (unten, oben) => {
            const a = spanne(unten), b = spanne(oben);
            let n = 0, max = 0;
            for (const [k, [, top]] of a) { const e = b.get(k); if (e) { n++; max = Math.max(max, Math.abs(e[0] - top)); } }
            return { n, max };
        };
        for (const [u, o] of [['cde-T5', 'cde-T6'], ['cde-T6', 'cde-T7'], ['cde-T7', 'cde-T9'], ['cde-T7', 'cde-T10'], ['cde-T7', 'cde-T8']]) {
            const f = fuge(u, o);
            expect(f.n, `${u}/${o}: gemeinsame Ecken`).toBeGreaterThan(100);
            expect(f.max, `${u}/${o}`).toBe(0);
        }
        expect(fuge('cde-T7', 'cde-T12').max).toBeLessThan(2e-5);

        // Klasse, Ausführung, Gewerk je Element (§ 11.1).
        const ist = Object.fromEntries(Object.keys(P11_SOLL).map(gid => {
            const plan = stand.get(gid);
            return [gid, [plan.kategorie, predefinedTypeVon(plan), gewerkVon(plan).gewerk]];
        }));
        expect(ist).toEqual(P11_SOLL);
        // Ausdrücklich nur, wo es von der Regel abweicht.
        const ausdruecklich = [...stand].filter(([, p]) => p?.parameter?.gewerk).map(([gid]) => gid).sort();
        expect(ausdruecklich).toEqual(['cde-T15', 'cde-T8']);

        // Die Bauwerke: der Pfad steht in der Kopfzeile, der Steg ist ein eigenes Bauwerk.
        const bauplanVon = (gid) => stand.get(gid) ?? null;
        const pfad = (gid) => facettenVon(subjektAusStand(gid, { wirksamerStand: ae.wirksamerStand }), { bauplanVon }).bauwerk.map(x => x.name);
        expect([pfad('cde-T5'), pfad('cde-T12'), pfad('cde-T27'), pfad('cde-T29')]).toEqual([['Retentionsteich'], ['Retentionsteich'], ['Steg'], []]);
        expect(stand.get('cde-TEICH').parameter.bauwerkstyp).toBe('RRB');

        // Das Paket — für den Schreiber. Draussen bleiben, was andere Verträge schon tragen oder das Repo sprengte: die
        // drei muldenweiten Schichten (je ~30 000 Dreiecke, G-T1), die zwei Wasserkörper (20 000 / 28 000, G-T2), der
        // Aushub (er braucht seinen Wirt, Erdbau-Vertrag), Rasen und Zufahrt. Jedes Gewerk und beide Bauwerke bleiben.
        const s = ae.wirksamerStand('erzeugt');
        const RAUS = ['cde-T5', 'cde-T6', 'cde-T7', 'cde-T12', 'cde-T13', 'cde-T11', 'cde-T31'];
        const teile = g.bauteile.filter(t => !RAUS.includes(t.globalId) && t.wert?.rezept !== 'erdbau');
        const bauwerke = [...s].filter(([, p]) => p?.rezept === 'bauwerk').map(([globalId, wert]) => ({ globalId, wert }));
        // Die Böschungskanten gehören zum Aushub — sie bleiben mit ihm draussen.
        const p = baueEigenbauPaket({ teile, kanten: [], stand: s, bauwerke: g.bauwerke ?? bauwerke, crs: 'EPSG:25832',
            projektname: 'Beispiel: Retentionsteich', schluessel: 'p11', journal: { commit: 'c-p11', sitzungOffen: false },
            jetzt: new Date('2026-10-04T00:00:00Z'), nachProjekt: (q) => ({ ost: 362000 + q.x, nord: 5462000 - q.z, hoehe: q.y + 100 }) });
        const zeile = (t) => [t.cdeId, t.klasse, t.predefinedType ?? null, t.gewerk?.id ?? null];
        expect(p.bauteile.map(t => t.cdeId).sort()).toEqual([...teich, ...steg, ...ohne].filter(gid => !RAUS.includes(gid)).sort());
        // G8 (Abnahme): Rohr, Schacht und Stab tragen Mengen — gefunden: acht Elemente kamen ohne Qto an, obwohl ihre Klasse
        // eine kennt. Der Pfahl hat keine Höhe in seiner Vorlage, er bekommt die Länge.
        const m = (gid) => p.bauteile.find(t => t.cdeId === gid)?.mengen;
        expect([m('cde-T25a'), m('cde-T14'), m('cde-T22'), m('cde-T35')])
            .toEqual([{ length: 3 }, { length: 21 }, { length: 22 }, { height: 2, width: 0.08, thickness: 0.08 }]);
        expect(m('cde-T18').depth).toBeCloseTo(2.2, 9);
        expect(m('cde-T18').grossVolume).toBeCloseTo(8 * 0.75 ** 2 * Math.sin(Math.PI / 8) * 2.2, 9);   // 16-Eck, r 0,75
        if (process.env.P11_VERTRAG_SCHREIBEN) writeFileSync(FIXTURE, JSON.stringify(p));
        expect(existsSync(FIXTURE), 'Fixture fehlt: P11_VERTRAG_SCHREIBEN=1 …').toBe(true);
        expect(JSON.parse(readFileSync(FIXTURE, 'utf8')).bauteile.map(zeile)).toEqual(p.bauteile.map(zeile));
    }, 180000);
});
