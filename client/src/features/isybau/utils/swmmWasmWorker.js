
import { SwmmBuilder } from '../core/services/SwmmBuilder.js';
import { SwmmOutParser } from './SwmmOutParser.js';
import { RptParser } from './swmm/RptParser.js';
import { ResultsAssembler } from './swmm/ResultsAssembler.js';
import { VERFAHREN, bewerteLauf, waehleVerfahren } from './swmm/ueberstauWahl.js';
import createSwmmModule from './swmm_solver.js';

let Module = null;
let initPromise = null;

// Initialize Module (guarded against concurrent calls: module-load auto-init + INIT command)
function initModule() {
    if (!initPromise) {
        initPromise = (async () => {
            console.log("Initializing SWMM Wasm Module in Worker...");
            Module = await createSwmmModule({
                print: (text) => console.log("[SWMM_OUT]", text),
                printErr: (text) => console.error("[SWMM_ERR]", text)
            });
            console.log("SWMM Module Initialized.");
            self.postMessage({ command: 'INIT_SUCCESS' });
        })().catch(err => {
            console.error("Failed to initialize SWMM Module:", err);
            initPromise = null; // allow retry
            self.postMessage({ command: 'ERROR', message: err.message });
            throw err;
        });
    }
    return initPromise;
}

const alsObjekt = (sammlung) => {
    if (sammlung instanceof Map) return Object.fromEntries(sammlung);
    if (Array.isArray(sammlung)) return Object.fromEntries(sammlung.map(x => [x.id, x]));
    return { ...sammlung };
};

/** Ein SWMM-Lauf: .inp ins virtuelle Dateisystem, rechnen, Bericht + Binärausgabe lesen. */
function rechneEinmal(inpString) {
    const inputPath = '/input.inp', reportPath = '/report.rpt', outPath = '/out.out';
    Module.FS.writeFile(inputPath, inpString);
    const res = Module.cwrap('swmm_run', 'number', ['string', 'string', 'string'])(inputPath, reportPath, outPath);
    console.log(`SWMM finished with code ${res} `);

    const report = Module.FS.analyzePath(reportPath).exists
        ? Module.FS.readFile(reportPath, { encoding: 'utf8' }) : '';
    // Kopie: der nächste Lauf überschreibt /out.out (Automatik rechnet zweimal).
    const outBytes = Module.FS.analyzePath(outPath).exists ? Module.FS.readFile(outPath).slice() : null;

    // Abbruch des Rechenkerns: Rückgabecode ≠ 0 oder ERROR-Zeilen im Bericht.
    // Früher lief es trotzdem als Erfolg mit leerem Ergebnis weiter (doc/09, Befund 4).
    const fehler = report.split('\n').map(l => l.trim()).filter(l => /^ERROR \d+/.test(l));
    const abbruch = (res !== 0 || fehler.length > 0)
        ? (fehler.length ? fehler.slice(0, 3).join(' · ') : `Fehlercode ${res}`) : null;
    return { report, outBytes, abbruch };
}

function meldeAbbruch(abbruch, report, input) {
    self.postMessage({
        command: 'ERROR',
        message: `SWMM hat die Berechnung abgebrochen: ${abbruch}`,
        details: { report, input }
    });
}

/** Bericht + Binärausgabe eines Laufs zum Ergebnis-Kontrakt zusammenführen. */
function zusammenfuehren({ report, outBytes, input, warnings, rptResult, nodesMap, edgesMap, beideVerfahrenGerechnet = false }) {
    let timeSeries = [];
    try {
        if (outBytes) {
            timeSeries = new SwmmOutParser(outBytes).parse();
            console.log(`Parsed ${timeSeries.length} time steps from binary output.`);
        } else {
            warnings.push("Keine Zeitreihen-Datei (.out) vorhanden — Ganglinien nicht verfügbar.");
        }
    } catch (binErr) {
        console.error("Failed to parse binary output:", binErr);
        warnings.push("Fehler beim Lesen der Zeitreihen (.out Datei): " + binErr.message + " — Ganglinien werden nicht angezeigt.");
    }

    const assembled = ResultsAssembler.assemble({ rptResult, timeSeries, inputNodes: nodesMap, inputEdges: edgesMap, beideVerfahrenGerechnet });
    return {
        report,
        input,
        // Ergebnis-Warnungen (Bilanz, Kontinuität) zuerst: der Hinweis zeigt nur die ersten
        // Meldungen, und 40 Neigungsklassen-Annahmen verdeckten sonst die Bilanzwarnung.
        warnings: [...assembled.warnings, ...warnings],
        nodes: assembled.nodes,
        edges: assembled.edges,
        subcatchments: assembled.subcatchments,
        systemStats: assembled.systemStats,
        timeSeries: assembled.timeSeries
    };
}

async function runSimulation(data) {
    try {
        await initModule();

        const { nodes, edges, areas } = data;
        // SwmmBuilder liest getAllNodes/getAllEdges als Getter
        const storeAdapter = {
            get getAllNodes() { return Object.values(alsObjekt(nodes)); },
            get getAllEdges() { return Object.values(alsObjekt(edges)); },
            areas: areas || []
        };
        const nodesMap = alsObjekt(nodes);
        const edgesMap = alsObjekt(edges);

        const bauen = (verfahren) => {
            const builder = new SwmmBuilder(storeAdapter);
            builder.setOptions({ ...(data.options || {}), ...(verfahren ? { surchargeMethod: verfahren } : {}) });
            return builder.build();
        };

        // ── Ein Verfahren (von Hand gewählt) ──────────────────────────────────
        if (data.options?.surchargeMethod !== 'AUTO') {
            const { inpContent, warnings } = bauen(null);
            const lauf = rechneEinmal(inpContent);
            if (lauf.abbruch) return meldeAbbruch(lauf.abbruch, lauf.report, inpContent);
            const rptResult = RptParser.parse(lauf.report, nodesMap, edgesMap);
            self.postMessage({
                command: 'COMPLETE',
                results: zusammenfuehren({ ...lauf, input: inpContent, warnings: [...warnings], rptResult, nodesMap, edgesMap })
            });
            return;
        }

        // ── Automatik: beide Verfahren rechnen, plausibleres nehmen ───────────
        // (utils/swmm/ueberstauWahl.js; Messwerte doc/04 Abschn. 5)
        const laeufe = VERFAHREN.map((verfahren) => {
            const gebaut = bauen(verfahren);
            const lauf = rechneEinmal(gebaut.inpContent);
            const rptResult = lauf.abbruch ? null : RptParser.parse(lauf.report, nodesMap, edgesMap);
            const bewertung = bewerteLauf({
                verfahren,
                abbruch: lauf.abbruch,
                flowError: rptResult?.systemStats?.flow?.error,
                nichtKonv: rptResult?.systemStats?.routingTimeStep?.notConverging,
                nodes: rptResult?.nodes
            }, { inputNodes: nodesMap, edges: Object.values(edgesMap), pumpen: gebaut.pumpen });
            return { verfahren, gebaut, lauf, rptResult, bewertung };
        });
        const wahl = waehleVerfahren(laeufe.map(l => l.bewertung));
        const sieger = laeufe.find(l => l.verfahren === wahl.gewaehlt);
        if (sieger.lauf.abbruch) return meldeAbbruch(sieger.lauf.abbruch, sieger.lauf.report, sieger.gebaut.inpContent);

        const warnings = [...sieger.gebaut.warnings];
        if (wahl.keinerPlausibel) {
            warnings.unshift(`Überstau-Automatik: kein Verfahren plausibel, ${wahl.gewaehlt} mit dem kleineren Bilanzfehler gewählt — ${wahl.grund}`);
        }
        const results = zusammenfuehren({
            ...sieger.lauf, input: sieger.gebaut.inpContent, warnings, rptResult: sieger.rptResult, nodesMap, edgesMap,
            beideVerfahrenGerechnet: true
        });
        results.systemStats.ueberstauWahl = wahl; // Ergebnisreiter + PDF lesen systemStats
        self.postMessage({ command: 'COMPLETE', results });

    } catch (err) {
        console.error("Simulation Error:", err);
        self.postMessage({ command: 'ERROR', message: err.message });
    }
}

self.onmessage = async (e) => {
    const { command, data } = e.data;
    if (command === 'INIT') {
        initModule().catch(() => { /* ERROR already posted */ });
    } else if (command === 'START' || command === 'RUN') {
        await runSimulation(data);
    }
};

initModule().catch(() => { /* ERROR already posted */ });
