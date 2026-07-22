// Test: Zufluss-/Abfluss-Physik der Boundaries (Kanten-Segment-Modell + Ownership-Map)
//  - Kanten-Segment (properties.edge) → native N/S/E/W-Zeile mit Impuls
//  - Innen-Quelle (edge=null) → richtungslose P-Punktquelle, KEIN Korridor
//  - Ownership-Dedup: keine Zelle bekommt Zu- UND Ablauf
//  - globale Füllung respektiert explizite Segmente (kein coarse whole-edge)
//  - NoData-Front-Auslauf nur an unbelegten Zellen
//  - FREE-Auslauf mit/ohne Sohlgefälle; Innen-FREE → HFIX-Fallback
// Ausführen: node src/features/flood-2D/test/test_boundary_inflow.mjs (aus client/)
import { InputGenerator } from '../middleware/InputGenerator.js';
import { validateBoundaryHydraulics } from '../middleware/ScenarioValidator.js';

let failures = 0;
const assert = (cond, msg) => {
    if (cond) console.log(`  ✅ ${msg}`);
    else { console.error(`  ❌ ${msg}`); failures++; }
};

// 20×20 @5m, flaches gültiges Terrain (z=10). Header xllcorner=0 (Zellzentren-Konvention).
function makeScenario(extra = {}) {
    const ncols = 20, nrows = 20, cellsize = 5;
    const gridData = new Float32Array(ncols * nrows).fill(10);
    return {
        grid: { ncols, nrows, cellsize, xllcorner: 0, yllcorner: 0, gridData, data: gridData },
        boundaries: [], manholes: [], assignments: {}, ganglinien: {},
        globalRoughness: 0.04,
        globalBoundaryType: 'CLOSED', // Default: keine globale Füllung, nur explizite Boundaries
        config: { sim_time: '600.0', initial_tstep: '1.0', saveint: '60.0', massint: '60.0', acceleration: '' },
        weirs: [], bridges: [],
        ...extra
    };
}

const bciLines = (files) => (files['flow.bci'] || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
const ascBody = (asc) => asc.split('\n').slice(6).join(' ');
const countNoData = (asc) => (ascBody(asc).match(/-9999/g) || []).length;

const inflowGanglinie = { GL1: { id: 'GL1', name: 'Zu1', type: 'Zufluss', data: [{ t: 0, v: 100 }, { t: 600, v: 100 }] } };

// Hilfsfunktion: parse BCI in Zellen-Claims, prüfe ob eine Zelle Zu- UND Ablauf hat.
// Edge-Zeilen decken Intervalle ab; P-Zeilen einzelne Zellen.
function classifyConflict(files, header) {
    const lines = bciLines(files);
    const cs = header.cellsize, xll = 0, yll = 0;
    const inflowKeys = new Set(), outflowKeys = new Set();
    for (const l of lines) {
        const p = l.split(/\s+/);
        if (['N', 'S', 'E', 'W'].includes(p[0])) {
            const edge = p[0], a = parseFloat(p[1]), b = parseFloat(p[2]), type = p[3];
            const role = type.startsWith('QVAR') ? inflowKeys : (type.startsWith('FREE') || type.startsWith('HFIX') ? outflowKeys : null);
            if (!role) continue;
            const vertical = edge === 'W' || edge === 'E';
            const fixed = edge === 'W' ? 0 : edge === 'E' ? header.ncols - 1 : edge === 'S' ? 0 : header.nrows - 1;
            for (let i = Math.round(a / cs); i < Math.round(b / cs); i++) {
                role.add(vertical ? `${fixed},${i}` : `${i},${fixed}`);
            }
        } else if (p[0] === 'P') {
            const wx = parseFloat(p[1]), wy = parseFloat(p[2]), type = p[3];
            const col = Math.round((wx - xll) / cs - 0.5), row = Math.round((wy - yll) / cs - 0.5);
            const role = type === 'QVAR' || type === 'HVAR' ? inflowKeys : outflowKeys;
            role.add(`${col},${row}`);
        }
    }
    let conflict = 0;
    for (const k of inflowKeys) if (outflowKeys.has(k)) conflict++;
    return { conflict, inflowKeys, outflowKeys };
}

console.log('── 1. Kanten-Segment ⇒ native N/S/E/W QVAR ──');
{
    const gen = new InputGenerator();
    const files = gen.processScenario(makeScenario({
        ganglinien: inflowGanglinie,
        boundaries: [{
            type: 'Feature', id: 'b-edge',
            geometry: { type: 'LineString', coordinates: [[0, 20], [0, 60]] }, // x=0 ⇒ Westrand
            properties: { type: 'BOUNDARY', edge: 'W' }
        }],
        assignments: { 'b-edge': { type: 'INFLOW_DYNAMIC', profileId: 'GL1' } }
    }));
    const lines = bciLines(files);
    assert(lines.some(l => /^W\s+[\d.]+\s+[\d.]+\s+QVAR\s+/.test(l)), `native 'W .. QVAR'\n     → ${lines.join('\n     → ')}`);
    assert(!lines.some(l => /^P\s+.*QVAR/.test(l)), 'KEINE P-Punktquelle für Kanten-Segment');
}

console.log('── 2. Innen-Quelle (edge=null) ⇒ P, KEIN Korridor ──');
{
    const gen = new InputGenerator();
    const files = gen.processScenario(makeScenario({
        ganglinien: inflowGanglinie,
        boundaries: [{
            type: 'Feature', id: 'b-in',
            geometry: { type: 'LineString', coordinates: [[25, 20], [25, 60]] },
            properties: { type: 'BOUNDARY', edge: null }
        }],
        assignments: { 'b-in': { type: 'INFLOW_DYNAMIC', profileId: 'GL1' } }
    }));
    const lines = bciLines(files);
    assert(lines.some(l => /^P\s+.*QVAR/.test(l)), 'P-Punktquellen (richtungslos)');
    assert(!lines.some(l => /^[NSEW]\s+.*QVAR/.test(l)), 'KEINE native Kantenlinie');
    assert(countNoData(files['terrain.asc']) === 0, 'KEIN Korridor (terrain.asc unverändert)');
}

console.log('── 3. Ownership-Dedup: keine Zelle Zu- UND Ablauf ──');
{
    const gen = new InputGenerator();
    const header = { ncols: 20, nrows: 20, cellsize: 5 };
    const files = gen.processScenario(makeScenario({
        ganglinien: inflowGanglinie,
        // Global-FREE ist deaktiviert (Watershed-Ansatz geplant, s. Audit 2026-07-21) —
        // HFIX bleibt der einzige aktive globale Auto-Füll-Typ, testet dieselbe
        // Ownership-Map-Mechanik (Zellen unterhalb Gelände = garantierter Auslauf).
        globalBoundaryType: 'HFIX', globalBoundaryHfix: 0, // füllt restliche Kanten mit Auslauf
        boundaries: [{
            type: 'Feature', id: 'b-edge',
            geometry: { type: 'LineString', coordinates: [[0, 20], [0, 60]] }, // West-Zufluss
            properties: { type: 'BOUNDARY', edge: 'W' }
        }],
        assignments: { 'b-edge': { type: 'INFLOW_DYNAMIC', profileId: 'GL1' } }
    }));
    const { conflict, inflowKeys, outflowKeys } = classifyConflict(files, header);
    assert(conflict === 0, `keine Zelle hat Zu- UND Ablauf (Konflikte: ${conflict})`);
    assert(inflowKeys.size > 0 && outflowKeys.size > 0, 'es gibt sowohl Zu- als auch Auslaufzellen (getrennt)');
}

console.log('── 4. Globale Füllung respektiert explizites Segment (kein whole-edge) ──');
{
    const gen = new InputGenerator();
    // West-Segment nur über Reihen 4..7 (y=20..40); globales HFIX soll den REST der W-Kante füllen.
    // (Global-FREE ist deaktiviert — s. eigener Block unten — HFIX testet dieselbe Ownership-Mechanik.)
    const files = gen.processScenario(makeScenario({
        ganglinien: inflowGanglinie,
        globalBoundaryType: 'HFIX', globalBoundaryHfix: 0,
        boundaries: [{
            type: 'Feature', id: 'b-edge',
            geometry: { type: 'LineString', coordinates: [[0, 20], [0, 40]] },
            properties: { type: 'BOUNDARY', edge: 'W' }
        }],
        assignments: { 'b-edge': { type: 'INFLOW_DYNAMIC', profileId: 'GL1' } }
    }));
    const lines = bciLines(files);
    const wQvar = lines.filter(l => /^W\s.*QVAR/.test(l));
    const wHfix = lines.filter(l => /^W\s.*HFIX/.test(l));
    assert(wQvar.length >= 1, 'W-Kante hat QVAR-Segment');
    assert(wHfix.length >= 1, 'W-Kante hat ZUSÄTZLICH globale HFIX-Füllung (kein whole-edge-Suppression)');
}

console.log('── 4b. Globales FREE ist deaktiviert (No-Op, Watershed-Ansatz geplant) ──');
{
    const gen = new InputGenerator();
    const files = gen.processScenario(makeScenario({ globalBoundaryType: 'FREE' }));
    const lines = bciLines(files);
    assert(lines.length === 0, `Global-FREE erzeugt KEINE Randbedingungen mehr (deaktiviert)\n     → ${lines.join('\n     → ')}`);
}

console.log('── 5. NoData-Front-Auslauf nur an unbelegten Zellen ──');
{
    const gen = new InputGenerator();
    const sc = makeScenario({
        ganglinien: inflowGanglinie,
        globalBoundaryType: 'FREE',
    });
    // NoData-Kerbe in der Mitte (umgeben von gültigem Terrain ist KEINE Front;
    // wir machen eine Kerbe, die mit dem Außenrand verbunden ist: rechte Spalten teilweise NoData)
    for (let r = 8; r <= 12; r++) for (let c = 15; c < 20; c++) sc.grid.gridData[r * 20 + c] = -9999;
    // Explizite Innen-Zuflusslinie genau an der Frontkante (col 14, rows 8..12)
    sc.boundaries = [{ type: 'Feature', id: 'b-in', geometry: { type: 'LineString', coordinates: [[70, 40], [70, 60]] }, properties: { type: 'BOUNDARY', edge: null } }];
    sc.assignments = { 'b-in': { type: 'INFLOW_DYNAMIC', profileId: 'GL1' } };
    const files = gen.processScenario(sc);
    const { conflict } = classifyConflict(files, { ncols: 20, nrows: 20, cellsize: 5 });
    assert(conflict === 0, `Front-Auslauf kollidiert NICHT mit explizitem Zufluss (Konflikte: ${conflict})`);
}

console.log('── 6. FREE-Auslauf mit/ohne Sohlgefälle ──');
{
    const gen = new InputGenerator();
    const files = gen.processScenario(makeScenario({
        boundaries: [{
            type: 'Feature', id: 'b-out',
            geometry: { type: 'LineString', coordinates: [[95, 20], [95, 60]] }, // Ostrand col 19
            properties: { type: 'BOUNDARY', edge: 'E' }
        }],
        assignments: { 'b-out': { type: 'OUTFLOW_FREE', useNativeFree: true, outflowSlope: 0.002 } }
    }));
    const lines = bciLines(files);
    assert(lines.some(l => /^E\s+[\d.]+\s+[\d.]+\s+FREE\s+0\.002000$/.test(l)), `'E .. .. FREE 0.002000'\n     → ${lines.join('\n     → ')}`);

    const gen2 = new InputGenerator();
    const files2 = gen2.processScenario(makeScenario({
        boundaries: [{ type: 'Feature', id: 'b2', geometry: { type: 'LineString', coordinates: [[95, 20], [95, 60]] }, properties: { type: 'BOUNDARY', edge: 'E' } }],
        assignments: { 'b2': { type: 'OUTFLOW_FREE', useNativeFree: true } }
    }));
    assert(bciLines(files2).some(l => /^E\s+[\d.]+\s+[\d.]+\s+FREE$/.test(l)), 'bare E .. FREE ohne Slope');
}

console.log('── 7. Innen-Auslauf ⇒ Snap auf nächste Kante (kein Punkt-HFIX mehr) ──');
{
    // (45,45) bei 20×20@5m/xll=0: col=row=9 → W- und S-Kante gleich nah (9 Zellen),
    // snapCellToEdge nimmt W zuerst. Kein outflowSlope angegeben ⇒ FREE_FALLBACK_SLOPE.
    const gen = new InputGenerator();
    const files = gen.processScenario(makeScenario({
        boundaries: [{ type: 'Feature', id: 'b-of', geometry: { type: 'LineString', coordinates: [[45, 45], [45, 45]] }, properties: { type: 'BOUNDARY', edge: null } }],
        assignments: { 'b-of': { type: 'OUTFLOW_FREE', useNativeFree: true } }
    }));
    const lines = bciLines(files);
    assert(!lines.some(l => /^P\s.*HFIX/.test(l)), `Innen-FREE erzeugt KEIN Punkt-HFIX mehr (harter Solver-Reset, s. Audit)\n     → ${lines.join('\n     → ')}`);
    assert(lines.some(l => /^W\s+[\d.]+\s+[\d.]+\s+FREE\s+0\.001000$/.test(l)), `Innen-FREE ⇒ auf W-Kante projiziert, native Zeile mit Fallback-Gefälle\n     → ${lines.join('\n     → ')}`);
}

console.log('── 8. ScenarioValidator-Regeln ──');
{
    const header = { ncols: 20, nrows: 20, cellsize: 5, xllcorner: 0, yllcorner: 0 };
    // outflowSlope außerhalb (0,0.999] ⇒ ERROR
    const c1 = validateBoundaryHydraulics(
        { o: { type: 'OUTFLOW_FREE', outflowSlope: 1.5 } },
        [{ id: 'o', geometry: { type: 'LineString', coordinates: [[95, 20], [95, 60]] }, properties: { edge: 'E' } }],
        header
    );
    assert(c1.has('error'), 'outflowSlope=1.5 ⇒ ERROR');

    // Segment als Kante markiert, liegt aber innen ⇒ WARN
    const c2 = validateBoundaryHydraulics(
        { s: { type: 'INFLOW_DYNAMIC', profileId: 'g' } },
        [{ id: 's', geometry: { type: 'LineString', coordinates: [[50, 20], [50, 60]] }, properties: { edge: 'W' } }],
        header
    );
    assert(c2.has('warn'), 'edge=W aber Geometrie innen ⇒ WARN');

    // Innen-Auslauf ⇒ INFO
    const c3 = validateBoundaryHydraulics(
        { f: { type: 'OUTFLOW_FREE' } },
        [{ id: 'f', geometry: { type: 'LineString', coordinates: [[50, 50], [50, 50]] }, properties: { edge: null } }],
        header
    );
    assert(c3.has('info'), 'Innen-Auslauf ⇒ INFO (HFIX-Wehr)');
}

console.log('── 9. Gerichteter Innen-Zufluss: Winkel-Token in .bci (Solver-Impuls) ──');
{
    const mkInner = (assign) => makeScenario({
        ganglinien: inflowGanglinie,
        boundaries: [{ type: 'Feature', id: 'b', geometry: { type: 'LineString', coordinates: [[45, 45], [45, 45]] }, properties: { edge: null } }],
        assignments: { 'b': assign }
    });
    // freier Winkel ⇒ Gradzahl als 6. Feld
    const f1 = new InputGenerator().processScenario(mkInner({ type: 'INFLOW_DYNAMIC', profileId: 'GL1', flowAngleDeg: 135 }));
    assert(bciLines(f1).some(l => /^P\s+[\d.]+\s+[\d.]+\s+QVAR\s+\S+\s+135\.0$/.test(l)), `'P .. QVAR <prof> 135.0' (Winkel-Token)\n     → ${bciLines(f1).join('\n     → ')}`);

    // Legacy flowDir=N ⇒ zu 90.0 gemappt
    const f2 = new InputGenerator().processScenario(mkInner({ type: 'INFLOW_DYNAMIC', profileId: 'GL1', flowDir: 'N' }));
    assert(bciLines(f2).some(l => /^P\s+.*QVAR\s+\S+\s+90\.0$/.test(l)), 'Legacy flowDir=N ⇒ Winkel 90.0');

    // richtungslos ⇒ KEIN Token
    const f3 = new InputGenerator().processScenario(mkInner({ type: 'INFLOW_DYNAMIC', profileId: 'GL1' }));
    assert(bciLines(f3).some(l => /^P\s+[\d.]+\s+[\d.]+\s+QVAR\s+\S+$/.test(l)), 'ohne Winkel ⇒ kein Token');

    // Auslauf mit Winkel ⇒ NIEMALS ein Winkel-Token (Guard role==='inflow')
    const f4 = new InputGenerator().processScenario(mkInner({ type: 'OUTFLOW_FREE', flowAngleDeg: 135 }));
    assert(!bciLines(f4).some(l => /^P\s+.*\s+\d+\.\d+$/.test(l) && l.includes('QVAR')), 'Auslauf+Winkel ⇒ KEIN Winkel-Token');
}

console.log('── 11. Nozzle-Wand um gerichteten Zulauf (Rückseite + Flanken, vorne offen) ──');
{
    const mk = (assign) => makeScenario({
        ganglinien: inflowGanglinie,
        boundaries: [{ type: 'Feature', id: 'b', geometry: { type: 'LineString', coordinates: [[40, 40], [40, 60]] }, properties: { edge: null } }],
        assignments: { 'b': assign }
    });
    // Wehr-Tag ist INVERS zur gesperrten Weltrichtung (Solver-Mikro-Test): 'E'→sperrt West,
    // 'W'→Ost, 'N'→Süd, 'S'→Nord. Vertikale Mündung ⇒ interne N/S-Kanten zwischen
    // Nachbarzellen werden übersprungen. 3. Spalte der .weir-Zeile = Richtungs-Tag, 5. = hc.
    const wlines = (files) => (files['flow.weir'] || '').split('\n').filter(Boolean).slice(1);
    const tags = (files) => wlines(files).map(l => l.trim().split(/\s+/)[2]);

    // Fluss Ost (0°): Rückseite=West ⇒ Tag 'E'; Vorderkante Ost NIE gesperrt ⇒ KEIN 'W';
    // Flanken-Endkappen oben/unten ⇒ 'S' und 'N'.
    const fE = new InputGenerator().processScenario(mk({ type: 'INFLOW_DYNAMIC', profileId: 'GL1', flowAngleDeg: 0 }));
    const tE = tags(fE);
    assert(tE.includes('E'), `Fluss Ost ⇒ Rückwand 'E' (sperrt West)\n     → ${tE.join(',')}`);
    assert(!tE.includes('W'), `Fluss Ost ⇒ Vorderkante offen (KEIN 'W')\n     → ${tE.join(',')}`);
    assert(tE.includes('N') && tE.includes('S'), `Fluss Ost ⇒ Flanken-Endkappen 'N'+'S'\n     → ${tE.join(',')}`);
    assert(wlines(fE).every(l => parseFloat(l.trim().split(/\s+/)[4]) >= 10), 'Crest hoch (≥10 m) ⇒ solide Wand');

    // Fluss Nord (90°): Rückseite=Süd ⇒ Tag 'N'; Vorderkante Nord NIE ⇒ KEIN 'S'; Flanken O/W ⇒ 'W'+'E'.
    const tN = tags(new InputGenerator().processScenario(mk({ type: 'INFLOW_DYNAMIC', profileId: 'GL1', flowAngleDeg: 90 })));
    assert(tN.includes('N'), `Fluss Nord ⇒ Rückwand 'N' (sperrt Süd)\n     → ${tN.join(',')}`);
    assert(!tN.includes('S'), `Fluss Nord ⇒ Vorderkante offen (KEIN 'S')\n     → ${tN.join(',')}`);
    assert(tN.includes('W') && tN.includes('E'), `Fluss Nord ⇒ Flanken 'W'+'E'\n     → ${tN.join(',')}`);

    // richtungslos ⇒ KEINE Wand
    const f0 = new InputGenerator().processScenario(mk({ type: 'INFLOW_DYNAMIC', profileId: 'GL1' }));
    assert(!f0['flow.weir'], 'richtungslos ⇒ keine flow.weir');
}

console.log('── 10. Default-Rand CLOSED (kein Auto-Auslauf) ──');
{
    const gen = new InputGenerator();
    // makeScenario setzt globalBoundaryType:'CLOSED' (= neuer Store-Default-Spiegel).
    const files = gen.processScenario(makeScenario({
        ganglinien: inflowGanglinie,
        boundaries: [{ type: 'Feature', id: 'b', geometry: { type: 'LineString', coordinates: [[0, 20], [0, 60]] }, properties: { edge: 'W' } }],
        assignments: { 'b': { type: 'INFLOW_DYNAMIC', profileId: 'GL1' } }
    }));
    const lines = bciLines(files);
    assert(lines.some(l => /^W\s.*QVAR/.test(l)), 'expliziter West-Zufluss vorhanden');
    assert(!lines.some(l => /FREE|HFIX/.test(l)), 'KEIN automatischer Auslauf (Ränder geschlossen)');
}

console.log(failures === 0 ? '\n✅ ALL PASS' : `\n❌ ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
