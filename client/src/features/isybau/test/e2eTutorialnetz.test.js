/**
 * Durchstich am Übungsnetz: Beispiel_Tutorial.xml → xmlParser → Store →
 * store.runSimulation() → echter Worker-Code → WASM-SWMM → Parser → Ergebnis.
 *
 * Nur die Web-Worker-Grenze ist ersetzt (helpers/workerImProzess.js). Die
 * Sollwerte kommen aus dem SWMM-Originalbericht (.rpt-Text, hier mit eigenen
 * regulären Ausdrücken gelesen) oder aus der Rechnung von Hand — nie aus dem
 * Parser, der geprüft wird.
 *
 * Befunde: doc/09_befunde_intern.md (0, 1, 2, 4, 4b, 7).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { setActivePinia, createPinia } from 'pinia';
import { JSDOM } from 'jsdom';

// xmlParser.js braucht DOMParser (Browser-API), Umgebung ist node (für WASM).
globalThis.DOMParser ??= new JSDOM('').window.DOMParser;

vi.mock('../core/worker/WorkerController.js', async () => ({
    WorkerController: (await import('./helpers/workerImProzess.js')).WorkerImProzess
}));

const { useIsybauStore } = await import('../store/index.js');
const { parseIsybauXML } = await import('../utils/xmlParser.js');
const { calculateBlockRain, calculateEulerType2 } = await import('../utils/RainModelService.js');
const { getRunoffCoeff } = await import('../utils/mappings.js');
const { haltungsZustand } = await import('../utils/typPalette.js');

const pfad = (rel) => fileURLToPath(new URL(rel, import.meta.url));
const TUTORIAL_XML = readFileSync(pfad('../../../../public/saintv1d/tutorial/Beispiel_Tutorial.xml'), 'latin1');
const KOSTRA = JSON.parse(readFileSync(pfad('./fixtures/kostra_beispielstandort.json'), 'utf8'));

const LAUFZEIT = 120_000;

// ── Übungsnetz so herrichten, wie es die Übung verlangt ─────────────────────
function uebungsnetz() {
    setActivePinia(createPinia());
    const store = useIsybauStore();
    store.loadParsedData(parseIsybauXML(TUTORIAL_XML));
    // Die Übung lässt diese Profile korrigieren (Vorab-Prüfung blockiert sonst).
    for (const [id, h] of [['R-0030', 0.5], ['80454891V1', 0.3], ['80454893V2', 0.3]]) {
        store.edges.get(id).profile.height = h;
    }
    // Die Übung macht beide Auslässe zu Auslaufbauwerken (Typ 5).
    for (const id of ['AL1_RBB', 'AL2_RRB']) store.nodes.get(id).bauwerkstyp = 5;
    // Die Datei hat keine Abflussbeiwerte (setzt der Student) → Programmvorgaben.
    for (const a of store.areaArray) {
        if (!(a.runoffCoeff > 0)) a.runoffCoeff = getRunoffCoeff(a.property, a.function, a.slope);
    }
    return store;
}

function blockregen(store, rN, dauer, intervall) {
    store.setRainModel({
        type: 'block',
        series: calculateBlockRain(rN, dauer, intervall),
        metadata: { duration: dauer, interval: intervall }
    });
}

function euler2(store, T = 'RN_003A', dauer = 60, intervall = 5) {
    const zeile = {};
    for (const d of Object.keys(KOSTRA)) if (KOSTRA[d]?.[T]) zeile[d] = KOSTRA[d][T];
    store.setRainModel({
        type: 'euler2',
        series: calculateEulerType2(zeile, dauer, intervall),
        metadata: { duration: dauer, interval: intervall, returnPeriod: T }
    });
}

// ── Aus dem SWMM-Originalbericht lesen (unabhängig vom RptParser) ────────────
const abschnitt = (rpt, titel) => {
    const start = rpt.indexOf(titel);
    if (start < 0) return '';
    const ende = rpt.indexOf('Continuity Error (%)', start);
    return rpt.slice(start, rpt.indexOf('\n', ende));
};
const zahlNach = (text, label) => {
    const m = text.match(new RegExp(label.replace(/[()]/g, '\\$&') + '\\s*\\.+\\s+([-\\d.]+)'));
    return m ? parseFloat(m[1]) : NaN;
};
const niederschlagMm = (rpt) => {
    const m = rpt.match(/Total Precipitation\s*\.+\s+[-\d.]+\s+([-\d.]+)/);
    return m ? parseFloat(m[1]) : NaN;
};
/** „Node Depth Summary": Spalte „Reported Max Depth" (Maximum über die Ausgabeschritte). */
const berichteteMaxTiefe = (rpt, knoten) => {
    const block = rpt.slice(rpt.indexOf('Node Depth Summary'), rpt.indexOf('Node Inflow Summary'));
    const zeile = block.split('\n').find(l => l.trim().split(/\s+/)[0] === knoten);
    return zeile ? parseFloat(zeile.trim().split(/\s+/).pop()) : NaN;
};

describe('Übungsnetz, echter Rechenweg', () => {
    let store;
    beforeEach(() => { store = uebungsnetz(); });

    it('Befund 0: Kontinuitätsfehler Abflusstransport = Wert im SWMM-Bericht', async () => {
        store.rain.duration = 3; euler2(store);
        await store.runSimulation();
        expect(store.simulation.status).toBe('success');
        const { report, systemStats } = store.simulation.results;
        const flow = abschnitt(report, 'Flow Routing Continuity');
        const sollFehler = zahlNach(flow, 'Continuity Error (%)');
        const sollRegen = zahlNach(flow, 'Wet Weather Inflow');
        expect(Number.isFinite(sollFehler)).toBe(true);
        expect(systemStats.flow.error).toBeCloseTo(sollFehler, 3);
        expect(sollRegen).toBeGreaterThan(0);
        expect(systemStats.flow.wetWeatherInflow).toBeCloseTo(sollRegen, 3);
    }, LAUFZEIT);

    it('Befund 4b: Ganglinien aus der .out-Datei — ein Schritt je Ausgabeminute, Maxima wie im Bericht', async () => {
        store.rain.duration = 3; euler2(store);
        await store.runSimulation();
        const { report, timeSeries, warnings } = store.simulation.results;
        expect(warnings.join(' ')).not.toMatch(/Zeitreihen/);
        expect(timeSeries.length).toBe(180); // 3 h, REPORT_STEP 1 min
        for (const knoten of ['R_023', 'R_034', 'R0042']) {
            const soll = berichteteMaxTiefe(report, knoten);
            const ist = Math.max(...timeSeries.map(s => s.nodes[knoten]?.depth ?? -1));
            expect(ist).toBeCloseTo(soll, 2);
        }
    }, LAUFZEIT);

    it('Befund 4: SWMM-Abbruch (ERROR 191) wird als Fehler gemeldet, nicht als Erfolg', async () => {
        // Dauer 0 h (Ende = Beginn → ERROR 191) kann die Oberfläche seit P2.3 nicht mehr
        // schicken; der Abbruch wird deshalb direkt am Worker-Code geprüft.
        store.rain.duration = 0;
        blockregen(store, 100, 60, 5);
        await store.runSimulation();
        expect(store.rain.duration).toBe(1);
        expect(store.simulation.status).toBe('success');
        const { WorkerImProzess } = await import('./helpers/workerImProzess.js');
        const kaputt = structuredClone(WorkerImProzess.letzteNutzlast);
        kaputt.options.durationHours = 0;
        await expect(new WorkerImProzess().runSimulation(kaputt)).rejects.toThrow(/ERROR 191/);
    }, LAUFZEIT);

    it('Befund 2: Blockregen 100 l/(s·ha) · 60 min ergibt bei jedem Intervall 36 mm', async () => {
        for (const intervall of [1, 5, 10, 15]) {
            store = uebungsnetz();
            store.rain.duration = 2; blockregen(store, 100, 60, intervall);
            await store.runSimulation();
            expect(store.simulation.status, `Δt ${intervall} min`).toBe('success');
            expect(niederschlagMm(store.simulation.results.report), `Δt ${intervall} min`).toBeCloseTo(36, 2);
        }
    }, LAUFZEIT * 4);

    it('Befund 1: übernommener KOSTRA-Wert regnet (rN · 0,006 · D mm)', async () => {
        const { kostraBlockRain } = await import('../utils/RainModelService.js');
        expect(typeof kostraBlockRain).toBe('function');
        const rN = KOSTRA['15'].RN_001A;
        store.updateKostraData(KOSTRA);
        store.setRainModel(kostraBlockRain({ rN, dauer: 15, wiederkehr: 'RN_001A' }));
        store.rain.duration = 1;
        await store.runSimulation();
        expect(niederschlagMm(store.simulation.results.report)).toBeCloseTo(rN * 0.006 * 15, 1);
    }, LAUFZEIT);

    it('Befund 1 (D2): KOSTRA abrufen nach gesetztem Modellregen schaltet den Regen nicht ab', async () => {
        store.rain.duration = 2; blockregen(store, 100, 60, 5);
        store.updateKostraData(KOSTRA); // „Abrufen" im KOSTRA-Fenster
        await store.runSimulation();
        expect(niederschlagMm(store.simulation.results.report)).toBeCloseTo(36, 2);
    }, LAUFZEIT);

    // doc/09 N3: Kapazität wurde als maxFlow / (2-stellig gerundetes Q/Qvoll) zurückgerechnet
    // — R_002 zeigte 1 809,6 l/s. Soll: SWMMs eigene Vollfüllung, unabhängig gelesen aus
    // einem Vergleichslauf derselben .inp mit [REPORT] INPUT YES („Cross Section Summary",
    // m³/s mit 2 Nachkommastellen → ±5 l/s).
    it('N3: Kapazität jeder Haltung = SWMM-Vollfüllung (Cross Section Summary)', async () => {
        store.rain.duration = 3; euler2(store);
        await store.runSimulation();
        const { input, edges } = store.simulation.results;
        const createSwmmModule = (await import('../utils/swmm_solver.js')).default;
        const M = await createSwmmModule({ print: () => {}, printErr: () => {} });
        M.FS.writeFile('/v.inp', input.replace(/^INPUT\s+NO/m, 'INPUT                YES'));
        M.cwrap('swmm_run', 'number', ['string', 'string', 'string'])('/v.inp', '/v.rpt', '/v.out');
        const rpt = M.FS.readFile('/v.rpt', { encoding: 'utf8' });
        const block = rpt.slice(rpt.indexOf('Cross Section Summary'), rpt.indexOf('Analysis Options'));
        const vollfuellung = Object.fromEntries(block.split('\n').map(l => l.trim().split(/\s+/))
            .filter(p => p.length === 8 && Number.isFinite(parseFloat(p[7]))).map(p => [p[0], parseFloat(p[7]) * 1000]));
        const ids = Object.keys(vollfuellung);
        expect(ids.length).toBeGreaterThan(100);
        for (const id of ids) expect(edges[id]?.capacity, id).toBeCloseTo(vollfuellung[id], -1); // ±5 l/s
        expect(edges.R_002.capacity).toBeGreaterThan(235);
        expect(edges.R_002.capacity).toBeLessThan(250);
    }, LAUFZEIT);

    it('Automatik: beide Verfahren gerechnet und plausibel, kein Wasserspiegel über dem höchsten Deckel', async () => {
        expect(store.berechnung.ueberstauverfahren).toBe('AUTO');
        store.rain.duration = 3; euler2(store);
        await store.runSimulation();
        const { report, systemStats: { ueberstauWahl } } = store.simulation.results;
        expect(ueberstauWahl.laeufe.map(l => l.verfahren)).toEqual(['SLOT', 'EXTRAN']);
        expect(ueberstauWahl.laeufe.every(l => l.plausibel), JSON.stringify(ueberstauWahl.laeufe)).toBe(true);
        // der ausgelieferte Bericht ist der des gewählten Laufs
        expect(report).toMatch(new RegExp(`Surcharge Method \\.+ ${ueberstauWahl.gewaehlt}`));
        const flow = abschnitt(report, 'Flow Routing Continuity');
        const gewaehlt = ueberstauWahl.laeufe.find(l => l.verfahren === ueberstauWahl.gewaehlt);
        expect(gewaehlt.bilanz).toBeCloseTo(zahlNach(flow, 'Continuity Error (%)'), 3);
        const hoechsterDeckel = Math.max(...store.nodeArray.map(n => Number.isFinite(Number(n.coverZ)) ? Number(n.coverZ) : Number(n.z) + Number(n.depth)));
        const block = report.slice(report.indexOf('Node Depth Summary'), report.indexOf('Node Inflow Summary'));
        const maxHgl = Math.max(...block.split('\n').map(l => l.trim().split(/\s+/)).filter(p => /JUNCTION/.test(p[1])).map(p => parseFloat(p[4])));
        expect(maxHgl).toBeLessThanOrEqual(hoechsterDeckel);
    }, LAUFZEIT * 2);

    // Zwei Größen, weil die erste Kur (EXTRAN als Standard) die Bilanz hielt, aber
    // 15–17 m Wasserstand an 0,3 m tiefen Knoten erzeugte — Regel und Kur müssen
    // dieselbe Größe messen, hier also auch die Wasserstände.
    it('Befund 7: Voreinstellung hält Bilanz (< 5 %, RM-II 3.4) UND plausible Wasserstände (< 10 m)', async () => {
        store.rain.duration = 3; euler2(store);
        await store.runSimulation();
        const { report } = store.simulation.results;
        const flow = abschnitt(report, 'Flow Routing Continuity');
        expect(Math.abs(zahlNach(flow, 'Continuity Error (%)'))).toBeLessThan(5);
        const knoten = [...store.nodes.keys()];
        const tiefste = Math.max(...knoten.map(id => berichteteMaxTiefe(report, id)).filter(Number.isFinite));
        expect(tiefste).toBeLessThan(10);
    }, LAUFZEIT);
});

// Zweites Netz: hier unterscheiden sich die Verfahren wirklich (doc/04 Abschn. 5):
// SLOT 14,3 % Bilanzfehler an Knoten 06004, EXTRAN 1,6 %.
describe('test.xml, echter Rechenweg', () => {
    it('Automatik wählt EXTRAN und verwirft SLOT wegen des Bilanzfehlers', async () => {
        setActivePinia(createPinia());
        const store = useIsybauStore();
        store.loadParsedData(parseIsybauXML(readFileSync(pfad('./test.xml'), 'latin1')));
        for (const a of store.areaArray) if (!(a.runoffCoeff > 0)) a.runoffCoeff = getRunoffCoeff(a.property, a.function, a.slope);
        store.rain.duration = 3; euler2(store);
        await store.runSimulation();
        expect(store.simulation.status).toBe('success');
        const { report, systemStats: { ueberstauWahl } } = store.simulation.results;
        expect(ueberstauWahl.gewaehlt).toBe('EXTRAN');
        expect(ueberstauWahl.grund).toMatch(/SLOT verworfen: Bilanzfehler 1\d,\d %/);
        expect(Math.abs(zahlNach(abschnitt(report, 'Flow Routing Continuity'), 'Continuity Error (%)'))).toBeLessThan(5);
    }, LAUFZEIT * 2);

    // Der Hinweis nach dem Lauf zeigt nur die ersten Meldungen; bei test.xml standen
    // 40 Neigungsklassen-Annahmen davor und die Bilanzwarnung war unsichtbar.
    it('SLOT von Hand: Bilanzwarnung mit Gegenprobe-Vorschlag steht vorn', async () => {
        setActivePinia(createPinia());
        const store = useIsybauStore();
        store.loadParsedData(parseIsybauXML(readFileSync(pfad('./test.xml'), 'latin1')));
        for (const a of store.areaArray) if (!(a.runoffCoeff > 0)) a.runoffCoeff = getRunoffCoeff(a.property, a.function, a.slope);
        store.berechnung.ueberstauverfahren = 'SLOT';
        store.rain.duration = 3; euler2(store);
        await store.runSimulation();
        const { warnings, systemStats } = store.simulation.results;
        expect(systemStats.ueberstauWahl).toBeUndefined();
        expect(warnings[0]).toMatch(/Systemweiter Kontinuitätsfehler.*Gegenprobe mit Überstauverfahren EXTRAN/);
    }, LAUFZEIT);

    // P1.1 (Entscheidung 2026-09-26): Auslastung = Q/Qvoll, Einstau getrennt. R_002 liegt im
    // Rückstau voll (h/hvoll 1,00), führt aber kaum Wasser — vorher „Überlastet" (h/hvoll > 0,9).
    it('P1.1: R_002 ist eingestaut, nicht überlastet; überlastet heißt Q > Qvoll', async () => {
        const store = uebungsnetz();
        store.rain.duration = 3; euler2(store);
        await store.runSimulation();
        const { edges } = store.simulation.results;
        const r2 = haltungsZustand(edges.R_002);
        expect(edges.R_002.depthRatio).toBeGreaterThanOrEqual(0.99);
        expect(r2.auslastung).toBeLessThan(5);
        expect(r2.status).toBe('eingestaut');
        for (const [id, r] of Object.entries(edges)) {
            const z = haltungsZustand(r);
            if (z.status === 'überlastet') expect(Math.abs(r.maxFlow), id).toBeGreaterThan(r.capacity);
        }
    }, LAUFZEIT);
});
