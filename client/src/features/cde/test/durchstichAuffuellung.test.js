// @vitest-environment node
/**
 * DER ABNAHMETEST DES DURCHSTICHS 2 — Auffüllung zwischen Gelände und Planum.
 *
 * Fabios Abnahmekriterium: eine Auffüllung zwischen einem Gelände und einem
 * Planum entsteht allein über Kommandos, ohne Oberfläche. Das Planum wird über
 * seine eigene KENNUNG als Ziel benannt, nicht über seine Position in der
 * Operationsliste. Das Volumen kommt als Zahl heraus und ist von Hand
 * nachrechenbar. Ändert sich das Planum, wird die Auffüllung samt Volumen neu
 * ausgewertet.
 *
 * Die Kommandofolge und die Zahlen stehen in
 * `docs/cde/kommando/durchstich-2-auffuellung-2026-09-19.md`, Teil 1 §3.
 *
 * Gelände: geliefert (`DGM1`), eben auf 100,00 m NN, 40 × 40 m. Alle Umrisse
 * achsparallel, die Ränder auf x,25 / x,75 — dann liegen sie zwischen den
 * Knoten des groben (1 m) wie des feinen Rasters (0,5 m), und die Zellformel
 * liefert die Fläche einer Stufe genau:
 *
 *   Planum P  10 × 10 m auf 101,00           →  Auftrag 100 m³
 *   Auffüllung S  20 × 20 m um P, bis zur Fläche von P, senkrecht
 *                 Ring (20² − 10²) m² × 1,00 m  →  Auftrag 300 m³
 *   P auf 101,50 gesetzt                      →  P 150 m³, S 450 m³ — ohne einen Eintrag an S
 *
 * Umgebung `node`, Ablage im Speicher; das Subjekt des GELIEFERTEN Geländes
 * reicht der Test herein wie der Viewer (`subjektVon`, mit `erdbau` aus
 * `erdbauStandVon`) — ein geliefertes Bauteil lebt in seiner Datei.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { repo } from '../services/RepoFacade.js';
import { useAenderungen } from '../stores/useAenderungen.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { KOMMANDO_SCHEMA } from '../services/kommando/Kommando.js';
import { erdbauStandVon, rezeptNach } from '../services/Bauteilrezepte.js';
import { neuerAbleitungslauf } from '../services/ableitung/Ableitungslauf.js';
import { erzeugeKernel } from '../services/geometrie/Kernel.js';
import { rasterAusMesh } from '../services/geometrie/ops/Raster.js';
import { formeNach, massenAus } from '../services/gelaende/Operationen.js';
import { entfalte } from '../services/JournalFormat.js';
import { GEGENPROBE_TOLERANZ } from '../services/ableitung/Ableitungen.js';

/** Die Ablage im Speicher — gespeichert wird JSON, wie auf dem Server. */
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
    journal() { const k = [...this.daten.keys()].find(x => x.endsWith(':aenderungen')); return k ? JSON.parse(this.daten.get(k)) : null; }
}

let speicher;
beforeEach(() => {
    speicher = new Speicher();
    repo.setBackend(speicher);
    setActivePinia(createPinia());
});
afterEach(() => repo.setBackend(null));

// ── Gelände und Lauf ──────────────────────────────────────────────────────

function gelaendeNetz() {
    const t = [];
    for (let x = 0; x < 40; x++) for (let z = 0; z < 40; z++) {
        const a = [x, 100, z], b = [x + 1, 100, z], c = [x + 1, 100, z + 1], d = [x, 100, z + 1];
        t.push(...a, ...b, ...c, ...a, ...c, ...d);
    }
    return { positions: new Float64Array(t), triCount: t.length / 9 };
}
const urRaster = (cell) => rasterAusMesh({ mesh: gelaendeNetz() }, { cell }).ergebnis;
const holeQuellForm = async (gid, form, { cell } = {}) => (gid === 'DGM1' && form === 'raster' ? urRaster(cell ?? 1) : null);
const lauf = (stand) => neuerAbleitungslauf({ stand, rezeptNach, holeQuellForm, kernel: erzeugeKernel(), hoehenversatz: 0 });

// ── Kommandos ─────────────────────────────────────────────────────────────

/** Ein Punkt in Projektkoordinaten (ohne Bezug: Ost = x, Nord = −z), Höhe m NN. */
const P = (x, z, hoehe = 100) => ({ ost: x, nord: -z, hoehe });
/** Ein achsparalleles Rechteck als Umriss. */
const rechteck = (a, b) => [P(a, a), P(b, a), P(b, b), P(a, b)];
let n = 0;
const kommando = (werkzeug, rest) => ({ schema: KOMMANDO_SCHEMA, id: `ko-${++n}`, werkzeug, ziel: [], wer: 'fabio', wann: '2026-09-19T21:00:00Z', ...rest });

/** Das Subjekt des gelieferten Geländes, wie der Viewer es reicht — mit dem Stapel aus dem Journal. */
function subjektVon(zelle) {
    return (gid) => (gid === 'DGM1'
        ? { globalId: 'DGM1', name: 'Ur', category: 'IFCGEOGRAPHICELEMENT', hoehenversatz: 0,
            quellmass: { cell: zelle, pruefmass: { n: 1 } },
            erdbau: erdbauStandVon(useAenderungen().wirksamerStand('erzeugt'), 'DGM1') }
        : null);
}

const PLANUM = () => kommando('planum-herstellen', {
    ziel: ['DGM1'], neu: ['op-P', 'cde-P-aushub', 'cde-P-auftrag', 'cde-anzeige'],
    eingaben: { umriss: rechteck(10.25, 20.25) }, werte: { hoehe: 101, neigung: '' },
});
const AUFFUELLUNG = (bis = 'op-P', neu = ['op-S', 'cde-S-aushub', 'cde-S-auftrag']) => kommando('auffuellen', {
    ziel: ['DGM1'], neu,
    eingaben: { umriss: rechteck(5.25, 25.25) }, werte: { ziel: 'flaeche', bis: { operation: bis }, neigung: '' },
});
const PLANUM_AUF = (hoehe) => kommando('erdbau-mass-setzen', {
    ziel: ['cde-P-auftrag'], werte: { op: { operation: 'op-P' }, feld: 'hoehe', wert: hoehe },
});

async function fuehre(k, zelle) {
    const erg = await useBearbeitung().fuehreAus(k, { subjektVon: subjektVon(zelle) });
    return erg;
}
async function aufbau(zelle) {
    for (const k of [PLANUM(), AUFFUELLUNG()]) {
        const erg = await fuehre(k, zelle);
        expect(erg.grund, k.werkzeug).toBe(null);
    }
    return useAenderungen();
}
const plan = (gid) => useAenderungen().wirksamerStand('erzeugt').get(gid);

/** Baut die Vorgänge und die Anzeige neu — ein frischer Lauf, wie beim nächsten Laden. */
async function miss() {
    const stand = useAenderungen().wirksamerStand('erzeugt');
    const l = lauf(stand);
    const gebaut = {};
    for (const gid of ['cde-P-auftrag', 'cde-S-auftrag', 'cde-anzeige']) {
        gebaut[gid] = await l.baue(gid);
        expect(gebaut[gid].ok, gid).toBe(true);
    }
    // Die Kennzahlen stehen am Eintrag der Ableitung (ein zweites `baue` gäbe den Teil ohne sie).
    const zahl = (gid) => l.ableitungen.get(stand.get(gid).ableitung);
    return { l, P: zahl('cde-P-auftrag'), S: zahl('cde-S-auftrag'),
             anzeige: { teil: gebaut['cde-anzeige'].teil, kennzahlen: zahl('cde-anzeige').kennzahlen } };
}

// ── Der Abnahmefall ───────────────────────────────────────────────────────

describe.each([
    ['1 m (Massen auf dem feinen Korridor, 0,5 m)', 1],
    ['0,5 m (kein Korridor, Massen auf dem Raster selbst)', 0.5],
])('Durchstich 2 bei Zellweite %s', (_titel, zelle) => {
    it('Planum, dann Auffüllung bis zu seiner Fläche: 100 m³ und 300 m³ — von Hand nachgerechnet', async () => {
        await aufbau(zelle);
        const { P: p, S: s, anzeige } = await miss();
        expect(p.kennzahlen.auftragRaster).toBeCloseTo(100, 6);      // 10 × 10 × 1,00
        expect(s.kennzahlen.auftragRaster).toBeCloseTo(300, 6);      // (20² − 10²) × 1,00
        expect(s.kennzahlen.aushubRaster).toBeCloseTo(0, 9);
        // Keine Warnung der Auffüllung und keine abgeschnittene Formung — gesehen, getroffen, ganz.
        expect((s.warnungen ?? []).filter(w => /^(schuettung|wirkbereich)/.test(w))).toEqual([]);
        // Die Gegenprobe des Körpers (Kernel) sagt dasselbe — innerhalb ihrer eigenen
        // Toleranz (2 %, `GEGENPROBE_TOLERANZ`): an der senkrechten Stufe zieht der
        // Körper schräge Dreiecke zwischen den Knoten (gemessen 300,15 bei 1 m, 0,05 %).
        expect(Math.abs(s.kennzahlen.auftragKoerper - 300) / 300).toBeLessThan(GEGENPROBE_TOLERANZ);
        expect(s.befunde.filter(b => b.regel === 'aushub_gegenprobe')).toEqual([]);
        // Gesamt = Summe der Vorgänge — und dieselbe Zahl unabhängig aus dem Bild der Anzeige.
        expect(anzeige.kennzahlen.auftragGesamt).toBeCloseTo(400, 6);
        expect(massenAus(urRaster(zelle), anzeige.teil.daten).auftrag).toBeCloseTo(400, 6);
    });

    it('die Anzeige ist das Ur nach ALLEN Operationen — Zelle für Zelle; die Auffüllung findet ihr Planum auch im Präfix-Cache', async () => {
        await aufbau(zelle);
        const { anzeige } = await miss();
        const ops = [plan('cde-P-auftrag'), plan('cde-S-auftrag')].flatMap(b => b.parameter.operationen);
        const erwartet = formeNach(urRaster(zelle), ops).raster;
        let max = 0;
        for (let i = 0; i < erwartet.heights.length; i++) max = Math.max(max, Math.abs(anzeige.teil.daten.heights[i] - erwartet.heights[i]));
        expect(max).toBe(0);
        // Im Ring steht die Anzeige auf 101 (vorher: 100 — die Auffüllung sähe ihr Ziel nicht).
        const r = anzeige.teil.daten;
        const ix = Math.round((7 - r.x0) / r.cell), iz = Math.round((7 - r.z0) / r.cell);
        expect(r.heights[ix * r.nz + iz]).toBe(101);
    });

    it('das Planum auf 101,50 gesetzt: die Auffüllung wird neu ausgewertet — 450 m³ — ohne einen Eintrag an ihr', async () => {
        await aufbau(zelle);
        const vorher = JSON.stringify(plan('cde-S-auftrag'));
        const erg = await fuehre(PLANUM_AUF(101.5), zelle);
        expect(erg.grund).toBe(null);
        // Geschrieben wurde nur das Planum: dieselbe Klammer, dieselben Kennungen, die Operation behält ihre.
        expect(new Set(erg.eintraege.map(e => e.globalId))).toEqual(new Set(['cde-P-aushub', 'cde-P-auftrag']));
        expect(plan('cde-P-auftrag').parameter.operationen).toEqual([expect.objectContaining({ id: 'op-P', parameter: expect.objectContaining({ hoehe: 101.5 }) })]);
        expect(JSON.stringify(plan('cde-S-auftrag'))).toBe(vorher);
        const { P: p, S: s } = await miss();
        expect(p.kennzahlen.auftragRaster).toBeCloseTo(150, 6);
        expect(s.kennzahlen.auftragRaster).toBeCloseTo(450, 6);      // 300 × 1,50
        // Ein Schritt zurück: wieder 300.
        await useAenderungen().zurueck('fabio');
        expect((await miss()).S.kennzahlen.auftragRaster).toBeCloseTo(300, 6);
    });
});

describe('Das Ziel steht als KENNUNG im Journal, nicht als Position', () => {
    it('Bauplan und Beleg nennen op-P; in der gespeicherten Datei ebenso; keine Zahl zeigt auf eine Stelle', async () => {
        await aufbau(1);
        const op = plan('cde-S-auftrag').parameter.operationen[0];
        expect(op).toMatchObject({ id: 'op-S', art: 'schuettung', parameter: { ziel: 'flaeche', flaeche: 'op-P' } });
        expect(op.parameter.hoehe).toBeUndefined();
        // Der Beleg liegt am ERSTEN Eintrag des Vorgangs (dem Verbergen des Geländes), der Vorgang ist das Kommando.
        const beleg = useAenderungen().eintraege.find(e => e.kommando?.werkzeug === 'auffuellen');
        expect(beleg.kommando).toMatchObject({ schema: 1, werte: { bis: { operation: 'op-P' } }, neu: ['op-S', 'cde-S-aushub', 'cde-S-auftrag'] });
        expect(useAenderungen().eintraege.find(e => e.globalId === 'cde-S-auftrag').vorgang).toBe(beleg.kommando.id);
        // Die Datei: entfaltet, trägt der Schritt dieselbe Kennung.
        const datei = speicher.journal();
        const schritte = entfalte([...(datei.sitzung?.schritte ?? []), ...(datei.commits ?? []).flatMap(c => c.schritte ?? [])]).schritte;
        const gespeichert = schritte.filter(x => x.globalId === 'cde-S-auftrag').at(-1);
        expect(gespeichert.nachher.parameter.operationen[0].parameter.flaeche).toBe('op-P');
    });
});

describe('Was technisch nicht geht, und was nur markiert wird (E5, E8)', () => {
    it('eine Zieloperation, die es nicht gibt: abgelehnt mit Grund — das Journal bleibt, wie es war', async () => {
        await aufbau(1);
        const vorher = useAenderungen().eintraege.length;
        const erg = await fuehre(AUFFUELLUNG('op-gibt-es-nicht', ['op-X', 'cde-X-aushub', 'cde-X-auftrag']), 1);
        expect(erg.ausgefuehrt).toBe(false);
        expect(erg.grund).toMatch(/op-gibt-es-nicht gibt es im Stapel dieses Geländes nicht/);
        expect(useAenderungen().eintraege.length).toBe(vorher);
    });

    it('eine Nummer statt der Kennung: das Kommando ist ungültig (E3)', async () => {
        await aufbau(1);
        const k = AUFFUELLUNG();
        k.werte.bis = 0;
        const erg = await fuehre(k, 1);
        expect(erg.grund).toMatch(/über ihre Kennung angesprochen.*nie über ihre Nummer/);
    });

    it('ein Ziel ohne Fläche (eine andere Auffüllung): eingetragen, 0 m³, und die Warnung steht am Vorgang', async () => {
        await aufbau(1);
        const erg = await fuehre(kommando('auffuellen', {
            ziel: ['DGM1'], neu: ['op-T', 'cde-T-aushub', 'cde-T-auftrag'],
            eingaben: { umriss: rechteck(30.25, 35.25) }, werte: { ziel: 'flaeche', bis: { operation: 'op-S' }, neigung: '' },
        }), 1);
        expect(erg.grund).toBe(null);
        const stand = useAenderungen().wirksamerStand('erzeugt');
        const l = lauf(stand);
        expect((await l.baue('cde-T-auftrag')).ok).toBe(true);
        const t = l.ableitungen.get(stand.get('cde-T-auftrag').ableitung);
        expect(t.kennzahlen.auftragRaster).toBeCloseTo(0, 9);
        expect(t.warnungen.some(w => w.startsWith('schuettung_ziel_ohne_flaeche'))).toBe(true);
    });

    it('zweimal gebaut ist dasselbe (Gesetz 4)', async () => {
        await aufbau(1);
        const a = (await miss()).S.kennzahlen.auftragRaster;
        const b = (await miss()).S.kennzahlen.auftragRaster;
        expect(b).toBe(a);
    });
});

describe('Der Auffüllungs-Nachweis rechnet dieselbe Formung wie der Vorgang', () => {
    // Eine Grube im Planum, im SELBEN Vorgang wieder verfüllt bis zu seiner Fläche.
    // Kein Katalogwerkzeug baut einen solchen Vorgang — er entsteht hier direkt
    // aus dem Rezept. Er ist der einzige Fall, an dem man sieht, ob der Nachweis
    // „wie viel des Aushubs lag über dem Ur" das Ziel der Verfüllung findet:
    // sonst meldete er 100 m³ aus einer Auffüllung, während der Vorgang 0 abträgt.
    it('Grube im Planum und verfüllt bis zum Planum: Aushub 0, davon aus einer Auffüllung 0', async () => {
        await fuehre(PLANUM(), 1);
        const ring = (a, b, y) => [[a, a], [b, a], [b, b], [a, b]].map(([x, z]) => ({ x, y, z }));
        const { ableitungsSchritte, mitKennungen, zufallsKennung } = await import('../services/Bauteilrezepte.js');
        const V = mitKennungen((art) => zufallsKennung(art), () => ableitungsSchritte({
            rezept: 'erdbau', quellen: { gelaende: 'DGM1' }, raster: { cell: 1 }, name: 'Ur · Grube und Verfüllung',
            operationen: [
                { id: 'op-G', art: 'grube', parameter: { umriss: ring(10.25, 20.25, 101), sohle: 99.5 } },
                { id: 'op-F', art: 'schuettung', parameter: { umriss: ring(10.25, 20.25, 101), ziel: 'flaeche', flaeche: 'op-P' } },
            ],
        }));
        const stand = new Map([...useAenderungen().wirksamerStand('erzeugt'), ...V.map(s => [s.globalId, s.nachher])]);
        const l = lauf(stand);
        expect((await l.baue(V[0].globalId)).ok).toBe(true);
        const k = l.ableitungen.get(V[0].nachher.ableitung).kennzahlen;
        expect(k.aushubRaster).toBeCloseTo(0, 6);
        expect(k.aushubAusAuffuellung).toBeCloseTo(0, 6);
    });
});
