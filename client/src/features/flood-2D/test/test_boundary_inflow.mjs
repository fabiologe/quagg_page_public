// Test: Zufluss-/Abfluss-Physik der Boundaries (Kanten-Segment-Modell + Ownership-Map)
//  - Kanten-Segment (properties.edge) → native N/S/E/W-Zeile mit Impuls
//  - Innen-Quelle (edge=null) → richtungslose P-Punktquelle, KEIN Korridor
//  - Ownership-Dedup: keine Zelle bekommt Zu- UND Ablauf
//  - FREE-Auslauf mit/ohne Sohlgefälle (kein Höchstwert); Innen-FREE → Kanten-Snap-Fallback
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
    // Zwei EXPLIZITE, nicht überlappende Randbedingungen (West-Zufluss + Ost-Ablauf) — es
    // gibt keine automatische globale Randbedingung mehr, die eine zweite Zellenmenge ohne
    // Zutun des Nutzers erzeugen könnte; die claimed-Map-Dedup wird direkt über zwei echte
    // Boundaries getestet.
    const files = gen.processScenario(makeScenario({
        ganglinien: inflowGanglinie,
        boundaries: [
            { type: 'Feature', id: 'b-in', geometry: { type: 'LineString', coordinates: [[0, 20], [0, 60]] }, properties: { type: 'BOUNDARY', edge: 'W' } },
            { type: 'Feature', id: 'b-out', geometry: { type: 'LineString', coordinates: [[95, 20], [95, 60]] }, properties: { type: 'BOUNDARY', edge: 'E' } },
        ],
        assignments: {
            'b-in': { type: 'INFLOW_DYNAMIC', profileId: 'GL1' },
            'b-out': { type: 'OUTFLOW_FREE', outflowSlope: 0.01 },
        }
    }));
    const { conflict, inflowKeys, outflowKeys } = classifyConflict(files, header);
    assert(conflict === 0, `keine Zelle hat Zu- UND Ablauf (Konflikte: ${conflict})`);
    assert(inflowKeys.size > 0 && outflowKeys.size > 0, 'es gibt sowohl Zu- als auch Auslaufzellen (getrennt)');
}

console.log('── 4. FREE-Auslauf mit/ohne Sohlgefälle ──');
{
    const gen = new InputGenerator();
    const files = gen.processScenario(makeScenario({
        boundaries: [{
            type: 'Feature', id: 'b-out',
            geometry: { type: 'LineString', coordinates: [[95, 20], [95, 60]] }, // Ostrand col 19
            properties: { type: 'BOUNDARY', edge: 'E' }
        }],
        assignments: { 'b-out': { type: 'OUTFLOW_FREE', outflowSlope: 0.002 } }
    }));
    const lines = bciLines(files);
    assert(lines.some(l => /^E\s+[\d.]+\s+[\d.]+\s+FREE\s+0\.002000$/.test(l)), `'E .. .. FREE 0.002000'\n     → ${lines.join('\n     → ')}`);

    // Rand-FREE OHNE explizites Sf ⇒ muss den Standard-Sicherheitsgefälle-Fallback nutzen,
    // NIEMALS nacktes 'FREE' (das landet solverseitig im instabilen "-1"-Zweig, Bugfix 2026-07-22).
    const gen2 = new InputGenerator();
    const files2 = gen2.processScenario(makeScenario({
        boundaries: [{ type: 'Feature', id: 'b2', geometry: { type: 'LineString', coordinates: [[95, 20], [95, 60]] }, properties: { type: 'BOUNDARY', edge: 'E' } }],
        assignments: { 'b2': { type: 'OUTFLOW_FREE' } }
    }));
    const lines2 = bciLines(files2);
    assert(!lines2.some(l => /^E\s+[\d.]+\s+[\d.]+\s+FREE$/.test(l)), `KEIN nacktes 'FREE' ohne Gefälle\n     → ${lines2.join('\n     → ')}`);
    assert(lines2.some(l => /^E\s+[\d.]+\s+[\d.]+\s+FREE\s+10\.000000$/.test(l)), `Rand-FREE ohne Sf ⇒ Standard-Sicherheitsgefälle 10.000000\n     → ${lines2.join('\n     → ')}`);

    // Explizites, sehr steiles Sf (weit über der alten 0.999-Falschgrenze) muss unverändert
    // durchgereicht werden — belegt, dass der künstliche Deckel entfernt wurde.
    const gen3 = new InputGenerator();
    const files3 = gen3.processScenario(makeScenario({
        boundaries: [{ type: 'Feature', id: 'b3', geometry: { type: 'LineString', coordinates: [[95, 20], [95, 60]] }, properties: { type: 'BOUNDARY', edge: 'E' } }],
        assignments: { 'b3': { type: 'OUTFLOW_FREE', outflowSlope: 15 } }
    }));
    assert(bciLines(files3).some(l => /^E\s+[\d.]+\s+[\d.]+\s+FREE\s+15\.000000$/.test(l)), `steiles Sf=15 wird unverändert übernommen (kein Deckel mehr)\n     → ${bciLines(files3).join('\n     → ')}`);

    // useNativeFree ist entfernt/wirkungslos — Alt-Daten, die das Feld noch explizit auf
    // false gesetzt haben, müssen identisches Verhalten wie ohne das Feld liefern.
    const gen4 = new InputGenerator();
    const files4 = gen4.processScenario(makeScenario({
        boundaries: [{ type: 'Feature', id: 'b4', geometry: { type: 'LineString', coordinates: [[95, 20], [95, 60]] }, properties: { type: 'BOUNDARY', edge: 'E' } }],
        assignments: { 'b4': { type: 'OUTFLOW_FREE', outflowSlope: 0.002, useNativeFree: false } }
    }));
    assert(bciLines(files4).some(l => /^E\s+[\d.]+\s+[\d.]+\s+FREE\s+0\.002000$/.test(l)), `useNativeFree:false (Alt-Daten) ändert am Rand-Ergebnis nichts\n     → ${bciLines(files4).join('\n     → ')}`);
}

console.log('── 5. Innen-Auslauf ⇒ Snap auf nächste Kante (kein Punkt-HFIX mehr) ──');
{
    // (45,45) bei 20×20@5m/xll=0: col=row=9 → W- und S-Kante gleich nah (9 Zellen). Seit der
    // NoData-aware-Snap-Umstellung (validEdgeCells, s. _accumulateFreeAtNearestEdge) entscheidet
    // bei einem Gleichstand die Scan-Reihenfolge von collectLiteralEdgeCells (S/N-Zeilen vor
    // W/E-Spalten) — hier gewinnt S. Kein outflowSlope angegeben ⇒ FREE_OUTFLOW_DEFAULT_SLOPE.
    // (Absicherungs-Pfad: die UI lässt "Ablauf" nur noch auf Rand-Objekten zu — dieser Fall
    // deckt Alt-Projekte mit bereits gespeicherter Innen-Ablauf-Zuweisung ab.)
    const gen = new InputGenerator();
    const files = gen.processScenario(makeScenario({
        boundaries: [{ type: 'Feature', id: 'b-of', geometry: { type: 'LineString', coordinates: [[45, 45], [45, 45]] }, properties: { type: 'BOUNDARY', edge: null } }],
        assignments: { 'b-of': { type: 'OUTFLOW_FREE' } }
    }));
    const lines = bciLines(files);
    assert(!lines.some(l => /^P\s.*HFIX/.test(l)), `Innen-FREE erzeugt KEIN Punkt-HFIX mehr (harter Solver-Reset, s. Audit)\n     → ${lines.join('\n     → ')}`);
    assert(lines.some(l => /^S\s+[\d.]+\s+[\d.]+\s+FREE\s+10\.000000$/.test(l)), `Innen-FREE ⇒ auf gültige Kante (NoData-aware) projiziert, native Zeile mit Standard-Sicherheitsgefälle\n     → ${lines.join('\n     → ')}`);
}

console.log('── 5b. "Fester Pegel" (WATERLEVEL_FIX mit value, ohne Ganglinie) auf Rand-Segment ──');
{
    const gen = new InputGenerator();
    const files = gen.processScenario(makeScenario({
        boundaries: [{ type: 'Feature', id: 'b-stage', geometry: { type: 'LineString', coordinates: [[95, 20], [95, 60]] }, properties: { type: 'BOUNDARY', edge: 'E' } }],
        assignments: { 'b-stage': { type: 'WATERLEVEL_FIX', value: 12.5, profileId: null } }
    }));
    const lines = bciLines(files);
    assert(lines.some(l => /^E\s+[\d.]+\s+[\d.]+\s+HVAR\s+\S+$/.test(l)), `Fester Pegel ⇒ native Rand-HVAR-Zeile (synthetisches 2-Punkt-Profil)\n     → ${lines.join('\n     → ')}`);
}

console.log('── 5c. "Fester Pegel" relativ zum Gelände (relative:true) — Geländehöhe + Offset ──');
{
    // Geneigtes Terrain (z = 10 + 0.2*col), damit die tatsächlich gesampelte Geländehöhe an der
    // Randbedingung (x=95..., am Ostrand col≈19) sich von einem trivialen "immer 10" unterscheidet.
    const ncols = 20, nrows = 20, cellsize = 5;
    const gridData = new Float32Array(ncols * nrows);
    for (let r = 0; r < nrows; r++)
        for (let c = 0; c < ncols; c++)
            gridData[r * ncols + c] = 10 + 0.2 * c;

    const gen = new InputGenerator();
    const files = gen.processScenario(makeScenario({
        grid: { ncols, nrows, cellsize, xllcorner: 0, yllcorner: 0, gridData, data: gridData },
        boundaries: [{ type: 'Feature', id: 'b-stage-rel', geometry: { type: 'LineString', coordinates: [[95, 20], [95, 60]] }, properties: { type: 'BOUNDARY', edge: 'E' } }],
        assignments: { 'b-stage-rel': { type: 'WATERLEVEL_FIX', value: 0.3, profileId: null, relative: true } }
    }));
    const lines = bciLines(files);
    assert(lines.some(l => /^E\s+[\d.]+\s+[\d.]+\s+HVAR\s+\S+$/.test(l)), `Relativer Pegel ⇒ auch native Rand-HVAR-Zeile\n     → ${lines.join('\n     → ')}`);
    // col≈19 an x=95 (cellsize 5, xllcorner 0 ⇒ col=round(95/5)=19) ⇒ Gelände 10+0.2*19=13.8, + 0.3 Offset = 14.1
    const bdy = files['profiles.bdy'] || '';
    assert(bdy.includes('14.1') || bdy.includes('14.100'), `BDY enthält Geländehöhe(13.8)+Offset(0.3)=14.1, nicht den rohen Offset 0.3\n     → ${bdy}`);
    assert(!gen.warnings.some(w => w.includes('nicht ermittelbar')), 'keine Warnung über nicht ermittelbare Geländehöhe (Terrain ist gültig)');
}

console.log('── 6. ScenarioValidator-Regeln ──');
{
    const header = { ncols: 20, nrows: 20, cellsize: 5, xllcorner: 0, yllcorner: 0 };
    // outflowSlope ≤ 0 ⇒ ERROR (kein Höchstwert mehr — der Solver kennt kein Sf-Limit)
    const c1 = validateBoundaryHydraulics(
        { o: { type: 'OUTFLOW_FREE', outflowSlope: -1 } },
        [{ id: 'o', geometry: { type: 'LineString', coordinates: [[95, 20], [95, 60]] }, properties: { edge: 'E' } }],
        header
    );
    assert(c1.has('error'), 'outflowSlope=-1 ⇒ ERROR');

    // Vormals ungültig (>0.999), jetzt ein ganz normaler, gültiger steiler Wert ⇒ KEIN ERROR
    const c1b = validateBoundaryHydraulics(
        { o: { type: 'OUTFLOW_FREE', outflowSlope: 15 } },
        [{ id: 'o', geometry: { type: 'LineString', coordinates: [[95, 20], [95, 60]] }, properties: { edge: 'E' } }],
        header
    );
    assert(!c1b.has('error'), 'outflowSlope=15 ⇒ KEIN ERROR mehr (künstlicher 0.999-Deckel entfernt)');

    // Segment als Kante markiert, liegt aber innen ⇒ WARN
    const c2 = validateBoundaryHydraulics(
        { s: { type: 'INFLOW_DYNAMIC', profileId: 'g' } },
        [{ id: 's', geometry: { type: 'LineString', coordinates: [[50, 20], [50, 60]] }, properties: { edge: 'W' } }],
        header
    );
    assert(c2.has('warn'), 'edge=W aber Geometrie innen ⇒ WARN');

    // Innen-Auslauf (OUTFLOW_FREE) ⇒ jetzt ERROR (solverseitig off-edge ungültig, nur
    // durch den Kanten-Snap-Fallback gerettet — verdient Pre-Run-Bestätigung, kein INFO mehr)
    const c3 = validateBoundaryHydraulics(
        { f: { type: 'OUTFLOW_FREE' } },
        [{ id: 'f', geometry: { type: 'LineString', coordinates: [[50, 50], [50, 50]] }, properties: { edge: null } }],
        header
    );
    assert(c3.has('error'), 'Innen-Auslauf (FREE) ⇒ ERROR (kein HFIX-Wehr, sondern Kanten-Snap)');

    // Innen-Ablauf als WATERLEVEL_FIX (Pegel) ⇒ WARN, nicht ERROR (technisch solverseitig gültig)
    const c4 = validateBoundaryHydraulics(
        { p: { type: 'WATERLEVEL_FIX', value: 10 } },
        [{ id: 'p', geometry: { type: 'LineString', coordinates: [[50, 50], [50, 50]] }, properties: { edge: null } }],
        header
    );
    assert(c4.has('warn') && !c4.has('error'), 'Innen-Pegel (WATERLEVEL_FIX) ⇒ WARN, kein ERROR');

    // Ablauf-Picker-Objekt: FREE mit nearFront (kein literalEdgeArc) ⇒ NUR INFO, kein ERROR
    // mehr — InputGenerator.js projiziert das seit dem Front-FREE-Fix (Block 10c) korrekt auf
    // die nächste Kante, das ist der NORMALE Pfad für ein schiefes/geclipptes DGM, keine
    // Rettungsaktion mehr, die eine Pre-Run-Bestätigung verdient.
    const c5 = validateBoundaryHydraulics(
        { 'b-front': { type: 'OUTFLOW_FREE', outflowSlope: 0.03 } },
        [{ id: 'b-front', geometry: { type: 'LineString', coordinates: [[70, 40], [70, 50]] }, properties: { edge: null, nearFront: true, literalEdgeArc: null } }],
        header
    );
    assert(!c5.has('error') && c5.has('info'), `Ablauf-Picker FREE mit nearFront ⇒ nur INFO, kein ERROR\n     → ${c5.issues.map(i => `${i.severity}: ${i.message}`).join('\n     → ')}`);

    // Dieselbe FREE-Zuweisung mit literalEdgeArc (exakter Randbogen) ⇒ gar keine Meldung.
    const c6 = validateBoundaryHydraulics(
        { 'b-arc': { type: 'OUTFLOW_FREE', outflowSlope: 0.03 } },
        [{ id: 'b-arc', geometry: { type: 'LineString', coordinates: [[95, 40], [95, 50]] }, properties: { edge: null, nearFront: true, literalEdgeArc: [{ col: 19, row: 8 }] } }],
        header
    );
    assert(!c6.has('error') && !c6.has('info'), `FREE mit literalEdgeArc ⇒ keine Meldung (garantiert gültige Kante)\n     → ${c6.issues.map(i => `${i.severity}: ${i.message}`).join('\n     → ')}`);
}

console.log('── 7. Gerichteter Innen-Zufluss: Winkel-Token in .bci (Solver-Impuls) ──');
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

console.log('── 8. Nozzle-Wand um gerichteten Zulauf (Rückseite + Flanken, vorne offen) ──');
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

console.log('── 9. Kein automatischer Auslauf ohne explizites Ablauf-Objekt ──');
{
    const gen = new InputGenerator();
    // Es gibt keine globale Randbedingung mehr — ohne explizites Ablauf-Objekt bleibt jede
    // nicht beanspruchte Kante ohne jede Randbedingung (nicht mehr nur "Default CLOSED").
    const files = gen.processScenario(makeScenario({
        ganglinien: inflowGanglinie,
        boundaries: [{ type: 'Feature', id: 'b', geometry: { type: 'LineString', coordinates: [[0, 20], [0, 60]] }, properties: { edge: 'W' } }],
        assignments: { 'b': { type: 'INFLOW_DYNAMIC', profileId: 'GL1' } }
    }));
    const lines = bciLines(files);
    assert(lines.some(l => /^W\s.*QVAR/.test(l)), 'expliziter West-Zufluss vorhanden');
    assert(!lines.some(l => /FREE|HFIX/.test(l)), 'KEIN automatischer Auslauf (kein Mechanismus dafür mehr vorhanden)');
}

console.log('── 10. properties.perimeterCells wird verbatim genutzt (nicht die rohe Linie) ──');
{
    // Linie diagonal über das GESAMTE Raster (0,0)→(95,95) — würde discretizePolyline auf
    // ~20 Zellen entlang der Diagonale bringen. properties.perimeterCells (3 Zellen, weit
    // abseits der Diagonale) MUSS stattdessen 1:1 verwendet werden.
    // Kerbe bei col=15..19/row=8..12 (wie test_terrain_front.mjs) macht col=14 zu einer
    // ECHTEN Randzelle — sonst würden die 3 Zellen von der Export-seitigen
    // validPerimeterCells-Gegenprüfung (2026-07-23, "ausklammern" nicht mehr existenter
    // Randzellen) verworfen, da sie auf einem flachen Raster reine Innenzellen wären.
    const ncols = 20, nrows = 20, cellsize = 5;
    const gridData = new Float32Array(ncols * nrows).fill(10);
    for (let r = 8; r <= 12; r++) for (let c = 15; c < ncols; c++) gridData[r * ncols + c] = -9999;
    const gen = new InputGenerator();
    const files = gen.processScenario(makeScenario({
        grid: { ncols, nrows, cellsize, xllcorner: 0, yllcorner: 0, gridData, data: gridData },
        boundaries: [{
            type: 'Feature', id: 'b-arc',
            geometry: { type: 'LineString', coordinates: [[0, 0], [95, 95]] },
            properties: {
                type: 'BOUNDARY', edge: null,
                perimeterCells: [{ col: 14, row: 8 }, { col: 14, row: 9 }, { col: 14, row: 10 }]
            }
        }],
        assignments: { 'b-arc': { type: 'WATERLEVEL_FIX', value: 12.5, profileId: null } }
    }));
    const lines = bciLines(files).filter(l => l.startsWith('P') && l.includes('HVAR'));
    assert(lines.length === 3, `genau 3 'P .. HVAR ..'-Zeilen (eine je Bogenzelle)\n     → ${lines.join('\n     → ')}`);
    // Erwartete Weltkoordinaten der 3 Bogenzellen (xll=0,yll=0,cellsize=5, Zellzentren +0.5).
    const expectedX = (14 + 0.5) * 5; // 72.5
    assert(lines.every(l => l.includes(expectedX.toFixed(4))), `Zellen liegen auf dem Bogen (x=${expectedX}), nicht auf der Diagonale\n     → ${lines.join('\n     → ')}`);
}

console.log('── 10b. Nicht mehr gültige perimeterCells/literalEdgeArc werden beim Export ausgeklammert ──');
{
    // Ein Objekt kann alte/inkonsistente Zellen tragen (Terrain nachträglich bearbeitet, oder
    // eine Altlast eines früheren Tools) — der Export darf sie NICHT blind übernehmen, sondern
    // muss sie gegen das AKTUELLE Gelände gegenprüfen und Nicht-mehr-Randzellen ausklammern.
    // Flaches Raster (keine Kerbe): (14,8)-(14,10) sind hier reine Innenzellen, KEINE Randzellen.
    const gen = new InputGenerator();
    const files = gen.processScenario(makeScenario({
        boundaries: [{
            type: 'Feature', id: 'b-stale',
            geometry: { type: 'LineString', coordinates: [[0, 0], [95, 95]] },
            properties: {
                type: 'BOUNDARY', edge: null,
                perimeterCells: [{ col: 14, row: 8 }, { col: 14, row: 9 }, { col: 14, row: 10 }]
            }
        }],
        assignments: { 'b-stale': { type: 'WATERLEVEL_FIX', value: 12.5, profileId: null } }
    }));
    const lines = bciLines(files).filter(l => l.startsWith('P') && l.includes('HVAR'));
    assert(lines.length === 0, `alle 3 Zellen sind auf flachem Raster keine Randzellen mehr ⇒ 0 Zeilen (verworfen statt blind exportiert)\n     → ${lines.join('\n     → ')}`);

    // Gleiches Prinzip für FREE/literalEdgeArc: eine gespeicherte "Kantenzelle", die auf dem
    // aktuellen Raster gar nicht mehr existiert (außerhalb ncols/nrows — z. B. nach Terrain-
    // Neuzuschnitt), darf keine FREE-Zeile erzeugen.
    const gen2 = new InputGenerator();
    const files2 = gen2.processScenario(makeScenario({
        boundaries: [{
            type: 'Feature', id: 'b-stale-free',
            geometry: { type: 'LineString', coordinates: [[0, 0], [10, 10]] },
            properties: { type: 'BOUNDARY', edge: null, literalEdgeArc: [{ col: 5, row: 5 }] } // Innenzelle, keine literale Kante
        }],
        assignments: { 'b-stale-free': { type: 'OUTFLOW_FREE', outflowSlope: 0.02 } }
    }));
    const freeLines = bciLines(files2).filter(l => /FREE/.test(l));
    assert(freeLines.length === 0, `einzige literalEdgeArc-Zelle ist keine echte Kantenzelle ⇒ keine FREE-Zeile\n     → ${freeLines.join('\n     → ')}`);
}

console.log('── 10c. FREE mit NUR Front-Innenzellen (kein literalEdgeArc) bekommt DIREKTE Punkt-FREE mit Richtung ──');
{
    // Schiefes/rotiertes DGM: der Ablauf-Picker hat eine Reihe reiner Front-Innenzellen
    // gewählt (properties.nearFront, literalEdgeArc leer/null) — vorher war "Frei" dafür
    // GAR NICHT erreichbar (UI sperrte den Modus). Jetzt (quagg-outflow-free-direction.patch):
    // jede Zelle mit orthogonaler NoData-Nachbarschaft bekommt DIREKT eine Punkt-FREE-Zeile mit
    // Richtungs-Token ("P x y FREE <slope> <dir>") — keine Projektion auf eine entfernte Kante
    // mehr nötig, die Lage bleibt exakt dort, wo der Nutzer geklickt hat.
    // Kerbe bei col=15..19/row=8..12 (wie Block 10) macht col=14 zu einer echten Front-
    // Innenzelle mit NoData direkt im OSTEN (col=15) — aber KEINER literalen Kantenzelle.
    const ncols = 20, nrows = 20, cellsize = 5;
    const gridData = new Float32Array(ncols * nrows).fill(10);
    for (let r = 8; r <= 12; r++) for (let c = 15; c < ncols; c++) gridData[r * ncols + c] = -9999;
    const gen = new InputGenerator();
    const files = gen.processScenario(makeScenario({
        grid: { ncols, nrows, cellsize, xllcorner: 0, yllcorner: 0, gridData, data: gridData },
        boundaries: [{
            type: 'Feature', id: 'b-front-free',
            geometry: { type: 'LineString', coordinates: [[72.5, 42.5], [72.5, 47.5], [72.5, 52.5]] },
            properties: {
                type: 'BOUNDARY', edge: null, nearFront: true, literalEdgeArc: null,
                perimeterCells: [{ col: 14, row: 8 }, { col: 14, row: 9 }, { col: 14, row: 10 }]
            }
        }],
        assignments: { 'b-front-free': { type: 'OUTFLOW_FREE', outflowSlope: 0.03 } }
    }));
    const lines = bciLines(files).filter(l => /FREE/.test(l));
    assert(lines.length === 3, `genau 3 direkte Punkt-FREE-Zeilen (eine je Front-Zelle)\n     → ${lines.join('\n     → ')}`);
    assert(lines.every(l => /^P\s[\d.]+\s[\d.]+\sFREE\s0\.030000\sE$/.test(l)), `alle 3 sind Punkt-FREE mit Richtung E (NoData liegt östlich, exakt an der geklickten Zelle)\n     → ${lines.join('\n     → ')}`);
    assert(lines.every(l => l.includes('0.030000')), `korrektes Sohlgefälle übernommen\n     → ${lines.join('\n     → ')}`);
}

console.log('── 10d. FREE an einer reinen Diagonal-Eckzelle (keine orthogonale NoData-Nachbarschaft) fällt auf Kanten-Projektion zurück ──');
{
    // (5,5) grenzt NUR diagonal an eine solide NoData-Ecke (0..4,0..4) — outwardCardinalDirections
    // liefert 0 Richtungen (s. test_terrain_front.mjs), also KEINE direkte Punkt-FREE-Zeile mit
    // Richtung, sondern der alte Fallback: Projektion auf die nächste literale Kantenzelle.
    const ncols = 10, nrows = 10, cellsize = 1;
    const gridData = new Float32Array(ncols * nrows).fill(10);
    for (let r = 0; r <= 4; r++) for (let c = 0; c <= 4; c++) gridData[r * ncols + c] = -9999;
    const gen = new InputGenerator();
    const files = gen.processScenario(makeScenario({
        grid: { ncols, nrows, cellsize, xllcorner: 0, yllcorner: 0, gridData, data: gridData },
        boundaries: [{
            type: 'Feature', id: 'b-corner-free',
            geometry: { type: 'LineString', coordinates: [[5.5, 5.5], [5.5, 5.5]] },
            properties: { type: 'BOUNDARY', edge: null, nearFront: true, literalEdgeArc: null, perimeterCells: [{ col: 5, row: 5 }] }
        }],
        assignments: { 'b-corner-free': { type: 'OUTFLOW_FREE', outflowSlope: 0.02 } }
    }));
    const lines = bciLines(files).filter(l => /FREE/.test(l));
    assert(lines.length > 0, `Diagonal-Eckzelle ⇒ trotzdem mind. eine FREE-Zeile (Fallback), nicht verweigert\n     → ${lines.join('\n     → ')}`);
    assert(lines.every(l => /^[NSEW]\s/.test(l)), `Fallback ist eine native Kanten-Zeile (Projektion), kein direktes Punkt-FREE\n     → ${lines.join('\n     → ')}`);
}

console.log('── 11. FREE-Snap ist NoData-aware (kein Solver-Absturz auf geclippter Kante) ──');
{
    // Ost-Kante (col=19) komplett NoData (geclipptes/irreguläres DEM erreicht dort nicht den
    // Rasterrand). Ein Innen-FREE nahe der Ost-Seite (col=17,row=10) würde naiv auf die
    // (ungültige) Ost-Kante snappen ⇒ FREE-Randbedingung auf NoData ⇒ Solver-SIGSEGV
    // (beobachtet 2026-07-23, Exit -11). Muss stattdessen auf eine GÜLTIGE Kante ausweichen.
    const ncols = 20, nrows = 20, cellsize = 5;
    const gridData = new Float32Array(ncols * nrows).fill(10);
    for (let r = 0; r < nrows; r++) gridData[r * ncols + 19] = -9999; // ganze Ost-Spalte NoData

    const gen = new InputGenerator();
    const files = gen.processScenario(makeScenario({
        grid: { ncols, nrows, cellsize, xllcorner: 0, yllcorner: 0, gridData, data: gridData },
        boundaries: [{ type: 'Feature', id: 'b-free', geometry: { type: 'LineString', coordinates: [[85, 50], [85, 50]] }, properties: { type: 'BOUNDARY', edge: null } }],
        assignments: { 'b-free': { type: 'OUTFLOW_FREE' } }
    }));
    const lines = bciLines(files);
    assert(!lines.some(l => /^E\s/.test(l)), `KEINE FREE-Zeile auf der NoData-Ost-Kante (Solver-Absturz-Falle)\n     → ${lines.join('\n     → ')}`);
    assert(lines.some(l => /^[NSW]\s+[\d.]+\s+[\d.]+\s+FREE\s+10\.000000$/.test(l)), `FREE stattdessen auf eine GÜLTIGE Kante (N/S/W) projiziert\n     → ${lines.join('\n     → ')}`);
}

console.log('── 12. FREE: gar keine gültige Kante im ganzen Raster ⇒ verworfen, kein Absturz-Versuch ──');
{
    // Pathologischer Fall: ALLE vier literalen Kanten sind NoData (Gelände berührt den
    // Rasterrand nirgends). Es gibt keinen sicheren Snap-Punkt — der Auslauf muss verworfen
    // werden (mit Warnung), statt eine garantiert ungültige Zeile zu schreiben.
    const ncols = 10, nrows = 10, cellsize = 5;
    const gridData = new Float32Array(ncols * nrows).fill(-9999);
    for (let r = 2; r <= 7; r++) for (let c = 2; c <= 7; c++) gridData[r * ncols + c] = 10; // Insel, Rand bleibt NoData

    const gen = new InputGenerator();
    const files = gen.processScenario(makeScenario({
        grid: { ncols, nrows, cellsize, xllcorner: 0, yllcorner: 0, gridData, data: gridData },
        boundaries: [{ type: 'Feature', id: 'b-free2', geometry: { type: 'LineString', coordinates: [[20, 20], [20, 20]] }, properties: { type: 'BOUNDARY', edge: null } }],
        assignments: { 'b-free2': { type: 'OUTFLOW_FREE' } }
    }));
    const lines = bciLines(files);
    assert(!lines.some(l => /FREE/.test(l)), `KEINE FREE-Zeile geschrieben (kein gültiger Rand vorhanden)\n     → ${lines.join('\n     → ')}`);
    assert(gen.warnings.some(w => w.includes('KEINE gültige Randzelle')), 'Warnung über fehlende gültige Randzelle vorhanden');
}

console.log('── 13. properties.literalEdgeArc wird für FREE verbatim genutzt (echter Randbogen) ──');
{
    // Linie diagonal über das GESAMTE Raster (wie Test 10) — würde discretizePolyline auf eine
    // ganz andere Zellmenge bringen. properties.literalEdgeArc (3 Zellen auf der Nord-Kante,
    // useBoundaryTool.js commit()-Analogon) MUSS für FREE 1:1 verwendet werden, zu EINER
    // zusammenhängenden nativen N-Zeile gemerged — nicht als Streuung einzeln gesnappter Punkte.
    const gen = new InputGenerator();
    const files = gen.processScenario(makeScenario({
        boundaries: [{
            type: 'Feature', id: 'b-free-arc',
            geometry: { type: 'LineString', coordinates: [[0, 0], [95, 95]] },
            properties: {
                type: 'BOUNDARY', edge: null,
                literalEdgeArc: [{ col: 5, row: 19 }, { col: 6, row: 19 }, { col: 7, row: 19 }]
            }
        }],
        assignments: { 'b-free-arc': { type: 'OUTFLOW_FREE', outflowSlope: 0.02 } }
    }));
    const lines = bciLines(files);
    const nLines = lines.filter(l => /^N\s/.test(l));
    assert(nLines.length === 1, `genau EINE zusammenhängende N-Zeile (3 Bogenzellen gemerged)\n     → ${lines.join('\n     → ')}`);
    assert(nLines.every(l => /FREE\s+0\.020000$/.test(l)), `korrektes Sohlgefälle übernommen\n     → ${lines.join('\n     → ')}`);
    assert(!lines.some(l => /^[SEW]\s.*FREE/.test(l)), `KEINE FREE-Zeile auf einer anderen Kante (Diagonale hätte S/W getroffen)\n     → ${lines.join('\n     → ')}`);
}

console.log(failures === 0 ? '\n✅ ALL PASS' : `\n❌ ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
