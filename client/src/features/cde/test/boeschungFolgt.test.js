// @vitest-environment node
/**
 * DIE BÖSCHUNG FOLGT DEM PLANUM (Teil XXIV-4, Paket B).
 *
 * Befund 1 aus Durchstich 2: „Planum herstellen" mit Böschung schreibt ZWEI
 * Operationen, jede mit ihrer eigenen Kopie der Höhe. Wird das Planum per
 * Kommando geändert, folgt die Böschung nicht — gemessen: Planum 101,50,
 * Böschung weiter 101,00, und am Rand steht eine Stufe von 0,50 m.
 *
 * Die Kur benutzt den Mechanismus aus Durchstich 2: die Böschung ZEIGT auf die
 * Fläche ihres Planums (`ziel: 'flaeche'`, `flaeche: 'op-…'`), statt eine Höhe
 * zu kopieren.
 *
 * DIESER TEIL ENTSTEHT VOR DER KUR (B0) und hält fest, was heute gilt:
 *   1. wie ein Vorgang von heute aussieht (zwei Operationen, zwei Höhen) —
 *      diese Erwartung ändert sich mit der Kur, absichtlich;
 *   2. was ein solches ALT-JOURNAL rechnet. Das muss danach gleich bleiben:
 *      ein Journal, das niemand anfasst, baut wie immer.
 *
 * Höhenversatz 300: das Gelände liegt in der Welt auf 0 und heisst 300,00 m NN.
 * So rechnet die Kette wirklich — mit Versatz 0 bliebe unbemerkt, wenn jemand
 * m NN und Welt verwechselt.
 *
 * Fixture neu schreiben (nur mit Grund — es ist der Stand VOR der Kur):
 *   BOESCHUNG_SCHREIBEN=1 npx vitest run src/features/cde/test/boeschungFolgt.test.js
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { repo } from '../services/RepoFacade.js';
import { useAenderungen } from '../stores/useAenderungen.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { KOMMANDO_SCHEMA } from '../services/kommando/Kommando.js';
import { erdbauStandVon, operationenMitKennung, rezeptNach } from '../services/Bauteilrezepte.js';
import { neuerAbleitungslauf } from '../services/ableitung/Ableitungslauf.js';
import { erzeugeKernel } from '../services/geometrie/Kernel.js';
import { rasterAusMesh } from '../services/geometrie/ops/Raster.js';

const PFAD = join(process.cwd(), 'src/features/cde/test/fixtures/boeschung-vorher.json');
/** Der Höhenversatz: Welt 0 heisst 300,00 m NN. */
const HV = 300;

class Speicher {
    constructor() { this.daten = new Map(); }
    async get(k) { return this.daten.has(k) ? JSON.parse(this.daten.get(k)) : null; }
    async set(k, v) { this.daten.set(k, JSON.stringify(v)); return true; }
    async delete(k) { this.daten.delete(k); return true; }
    async listKeys(p) { return [...this.daten.keys()].filter(k => k.startsWith(p)); }
    async getBlob() { return null; }
    async setBlob() { return false; }
    async deleteBlob() { return false; }
    async listBlobs() { return []; }
}

beforeEach(() => {
    repo.setBackend(new Speicher());
    setActivePinia(createPinia());
});
afterEach(() => repo.setBackend(null));

// ── Gelände, Lauf, Kommandos ──────────────────────────────────────────────

function gelaendeNetz() {
    const t = [];
    for (let x = 0; x < 40; x++) for (let z = 0; z < 40; z++) {
        const a = [x, 0, z], b = [x + 1, 0, z], c = [x + 1, 0, z + 1], d = [x, 0, z + 1];
        t.push(...a, ...b, ...c, ...a, ...c, ...d);
    }
    return { positions: new Float64Array(t), triCount: t.length / 9 };
}
const urRaster = (cell) => rasterAusMesh({ mesh: gelaendeNetz() }, { cell }).ergebnis;
const holeQuellForm = async (gid, form, { cell } = {}) => (gid === 'DGM1' && form === 'raster' ? urRaster(cell ?? 1) : null);
const lauf = (stand) => neuerAbleitungslauf({ stand, rezeptNach, holeQuellForm, kernel: erzeugeKernel(), hoehenversatz: HV });

/** Ein Punkt in Projektkoordinaten (ohne Bezug: Ost = x, Nord = −z), Höhe m NN. */
const P = (x, z) => ({ ost: x, nord: -z, hoehe: 300 });
const rechteck = (a, b) => [P(a, a), P(b, a), P(b, b), P(a, b)];
let n = 0;
const kommando = (werkzeug, rest) => ({ schema: KOMMANDO_SCHEMA, id: `ko-${++n}`, werkzeug, ziel: [], wer: 'fabio', wann: '2026-09-20T09:00:00Z', ...rest });

const subjektVon = (gid) => (gid === 'DGM1'
    ? { globalId: 'DGM1', name: 'Ur', category: 'IFCGEOGRAPHICELEMENT', hoehenversatz: HV,
        quellmass: { cell: 1, pruefmass: { n: 1 } },
        erdbau: erdbauStandVon(useAenderungen().wirksamerStand('erzeugt'), 'DGM1') }
    : null);

/** Das Planum mit Böschung 1:2 — die Kennungen nennt das Kommando (E2, E3). */
const PLANUM = (hoehe = 301) => kommando('planum-herstellen', {
    ziel: ['DGM1'], neu: ['op-P', 'op-B', 'cde-P-aushub', 'cde-P-auftrag', 'cde-anzeige'],
    eingaben: { umriss: rechteck(10.25, 20.25) }, werte: { hoehe, neigung: 2 },
});
const PLANUM_AUF = (hoehe) => kommando('erdbau-mass-setzen', {
    ziel: ['cde-P-auftrag'], werte: { op: { operation: 'op-P' }, feld: 'hoehe', wert: hoehe },
});
const fuehre = (k) => useBearbeitung().fuehreAus(k, { subjektVon });
const plan = (gid) => useAenderungen().wirksamerStand('erzeugt').get(gid);
const opsVon = (gid) => plan(gid).parameter.operationen;

/**
 * Die Zahlen eines Vorgangs: Massen und Feinheit aus dem Lauf, die Höhen aus
 * der ANZEIGE (das geformte Gelände — der Auftrag selbst ist ein Körper).
 * Alles in m NN, wie es ein Mensch liest.
 */
async function miss(stand = useAenderungen().wirksamerStand('erzeugt')) {
    const l = lauf(stand);
    const auftrag = await l.baue('cde-P-auftrag');
    expect(auftrag.ok, JSON.stringify([...(l.misserfolge ?? [])]).slice(0, 300)).toBe(true);
    const anzeige = await l.baue('cde-anzeige');
    expect(anzeige.ok, 'Anzeige').toBe(true);
    const k = l.ableitungen.get(stand.get('cde-P-auftrag').ableitung).kennzahlen;
    const rund = (v) => (Number.isFinite(v) ? Math.round(v * 1e6) / 1e6 : null);
    return {
        auftrag: rund(k.auftragRaster), aushub: rund(k.aushubRaster),
        zellweite: k.zellweite, zellweiteDgm: k.zellweiteDgm, korridor: !!k.korridor,
        hoeheAn: HOEHEN.map(([x, z]) => rund(_hoeheAn(anzeige.teil.daten, x, z) + HV)),
    };
}
/**
 * Vier Orte quer über die Kante des Planums (x, z), gemessen in m NN:
 * Mitte · Rand · 0,75 m draussen (in der Böschung) · 3,75 m draussen.
 */
const HOEHEN = [[15, 15], [20, 15], [21, 15], [24, 15]];
function _hoeheAn(rasterDaten, x, z) {
    const r = rasterDaten;
    const ix = Math.round((x - r.x0) / r.cell), iz = Math.round((z - r.z0) / r.cell);
    return r.heights[ix * r.nz + iz];
}

// ── B0: was heute gilt ────────────────────────────────────────────────────

describe('Ein Planum mit Böschung: die Böschung ZEIGT auf das Planum', () => {
    it('zwei Operationen — und nur EINE trägt eine Höhe', async () => {
        expect((await fuehre(PLANUM())).grund).toBe(null);
        const ops = opsVon('cde-P-auftrag');
        expect(ops.map(o => [o.id, o.art])).toEqual([['op-P', 'planum'], ['op-B', 'boeschung']]);
        // Vor der Kur stand hier [301, 301] — zwei Kopien derselben Zahl.
        expect(ops.map(o => o.parameter.hoehe)).toEqual([301, undefined]);
        expect(ops[1].parameter).toMatchObject({ ziel: 'flaeche', flaeche: 'op-P', neigung: 2 });
    });

    it('das Planum geändert: die Böschung folgt, ohne einen zweiten Eintrag', async () => {
        await fuehre(PLANUM());
        const erg = await fuehre(PLANUM_AUF(301.5));
        expect(erg.grund).toBe(null);
        const ops = opsVon('cde-P-auftrag');
        // Vor der Kur: [301.5, 301] — das Planum stieg, die Böschung blieb.
        expect(ops.map(o => o.parameter.hoehe)).toEqual([301.5, undefined]);
        expect(ops[1].parameter.flaeche).toBe('op-P');
    });
});

describe('Ein ALT-JOURNAL (Böschung mit kopierter Höhe) baut wie immer', () => {
    // Die Operationen kommen aus dem Fixture — so hat ein Kommando sie HEUTE
    // geschrieben. Nach der Kur schreibt es anders; dieses Journal bleibt.
    const GOLD = JSON.parse(readFileSync(PFAD, 'utf8'));

    it('dieselben Massen, dieselbe Feinheit, dasselbe Bild', async () => {
        // Der Vorgang entsteht über das heutige Kommando; seine Operationen werden
        // durch die des Fixtures ersetzt. Das ist genau ein Journal von gestern:
        // dieselbe Klammer, dieselben Kennungen, die Böschung mit kopierter Höhe.
        expect((await fuehre(PLANUM())).grund).toBe(null);
        const stand = new Map([...useAenderungen().wirksamerStand('erzeugt')].map(([g, p]) => [g,
            p.rezept === 'erdbau' ? { ...p, parameter: { ...p.parameter, operationen: GOLD.operationen } } : p]));
        expect(stand.get('cde-P-auftrag').parameter.operationen.map(o => o.parameter.hoehe)).toEqual([301, 301]);
        expect(await miss(stand)).toEqual(GOLD.zahlen);
    });
});

describe('Bestand: ein Journal von gestern wird umgestellt, sobald es angefasst wird', () => {
    const GOLD = JSON.parse(readFileSync(PFAD, 'utf8'));

    /** Der Vorgang von heute, dessen Operationen durch die von gestern ersetzt sind. */
    async function vonGestern(operationen = GOLD.operationen) {
        expect((await fuehre(PLANUM())).grund).toBe(null);
        const ae = useAenderungen();
        for (const gid of ['cde-P-aushub', 'cde-P-auftrag']) {
            const p = ae.wirksamerStand('erzeugt').get(gid);
            await ae.eintragen({ art: 'erzeugt', globalId: gid, modell: 'cde',
                                 nachher: { ...p, parameter: { ...p.parameter, operationen } } });
        }
        expect(opsVon('cde-P-auftrag').map(o => o.parameter.hoehe)).toEqual([301, 301]);
    }

    it('die Planumshöhe gesetzt: aus der Kopie wird ein Verweis, und die Böschung folgt', async () => {
        await vonGestern();
        expect((await fuehre(PLANUM_AUF(301.5))).grund).toBe(null);
        const ops = opsVon('cde-P-auftrag');
        expect(ops.map(o => o.parameter.hoehe)).toEqual([301.5, undefined]);
        expect(ops[1].parameter).toMatchObject({ ziel: 'flaeche', flaeche: ops[0].id, neigung: 2 });
        // Und das Bild: 0,75 m draussen liegt die Böschung jetzt 0,50 m höher.
        const zahlen = await miss();
        expect(zahlen.hoeheAn).toEqual([301.5, 301.5, 301.125, 300]);
    });

    it('eine ABWEICHENDE Böschung bleibt, wie sie ist — sie war nie eine Kopie', async () => {
        const eigen = JSON.parse(JSON.stringify(GOLD.operationen));
        eigen[1].parameter.hoehe = 300.8;                       // von Hand tiefer gelegt
        await fuehre(PLANUM());
        const ae = useAenderungen();
        for (const gid of ['cde-P-aushub', 'cde-P-auftrag']) {
            const p = ae.wirksamerStand('erzeugt').get(gid);
            await ae.eintragen({ art: 'erzeugt', globalId: gid, modell: 'cde', nachher: { ...p, parameter: { ...p.parameter, operationen: eigen } } });
        }
        expect((await fuehre(PLANUM_AUF(301.5))).grund).toBe(null);
        const ops = opsVon('cde-P-auftrag');
        expect(ops.map(o => o.parameter.hoehe)).toEqual([301.5, 300.8]);   // unangetastet
        expect(ops[1].parameter.ziel).toBeUndefined();
    });

    it('auch ein Journal von VOR K2b (Operationen ohne Kennung) wird umgestellt', async () => {
        const ohneKennung = GOLD.operationen.map(({ id: _weg, ...rest }) => JSON.parse(JSON.stringify(rest)));
        await vonGestern(ohneKennung);
        expect(opsVon('cde-P-auftrag').every(o => !o.id)).toBe(true);
        // Ohne gespeicherte Kennung spricht ein Kommando sie über die aus ihrem
        // INHALT abgeleitete an (`op-alt-…`, K2b) — dieselbe Liste, die auch die
        // Adresse des Werkzeugs liefert.
        const altId = operationenMitKennung(opsVon('cde-P-auftrag'))[0].id;
        expect(altId).toMatch(/^op-alt-/);
        expect((await fuehre(kommando('erdbau-mass-setzen', {
            ziel: ['cde-P-auftrag'], werte: { op: { operation: altId }, feld: 'hoehe', wert: 301.5 },
        }))).grund).toBe(null);
        const ops = opsVon('cde-P-auftrag');
        // Beide haben jetzt eine Kennung (aus ihrem Inhalt abgeleitet), und der
        // Verweis zeigt auf die, die gespeichert wird.
        expect(ops[0].id).toBeTruthy();
        expect(ops[1].parameter.flaeche).toBe(ops[0].id);
        expect(ops.map(o => o.parameter.hoehe)).toEqual([301.5, undefined]);
    });
});

// Das Fixture entsteht aus dem heutigen Kommando — einmal, mit Grund.
if (process.env.BOESCHUNG_SCHREIBEN) {
    describe('Fixture schreiben', () => {
        it('schreibt den Stand vor der Kur', async () => {
            await fuehre(PLANUM());
            const operationen = JSON.parse(JSON.stringify(opsVon('cde-P-auftrag')));
            writeFileSync(PFAD, `${JSON.stringify({ operationen, zahlen: await miss() }, null, 1)}\n`);
        });
    });
}
