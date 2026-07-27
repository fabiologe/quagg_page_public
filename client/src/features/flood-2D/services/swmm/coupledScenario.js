// Sauberer, Vue-freier Baustein: reichert einen fertigen LISFLOOD-Datei-Satz um die
// 1D/2D-Kopplung an (network.inp + flow.coupling + couplingfile-Keyword). Wird vom
// Composable useCoupledExport genutzt und ist rein/testbar.
//
// Bewusst tickt die Kopplung am ECHTEN terrain.asc: das garantiert dieselbe Raster-
// Orientierung wie der Solver — keine Store-Orientierungs-Ratespiele.

import { buildCoupledInputsFromModel } from './couplingExport.js';
import { worldToCell } from '../geometry/couplingDetector.js';

/** Parst ein ESRI-ASCII-Raster (row-major, top-down) → { grid, header }. */
export function parseAscGrid(text) {
    const lines = String(text).split(/\r?\n/);
    const header = {};
    let i = 0;
    const keys = { ncols: 'ncols', nrows: 'nrows', xllcorner: 'xllcorner', yllcorner: 'yllcorner',
                   cellsize: 'cellsize', nodata_value: 'NODATA_value' };
    for (; i < lines.length; i++) {
        const p = lines[i].trim().split(/\s+/);
        if (p.length === 2 && /^[a-zA-Z]/.test(p[0])) {
            const k = keys[p[0].toLowerCase()];
            if (k) header[k] = Number(p[1]);
            else break;
        } else break;
    }
    if (header.NODATA_value === undefined) header.NODATA_value = -9999;
    const vals = lines.slice(i).join(' ').trim().split(/\s+/).filter(s => s.length).map(Number);
    return { grid: Float32Array.from(vals), header };
}

/**
 * Zellen, die flow.bci bereits als Randbedingung belegt (P-Punktquellen + Kantenintervalle).
 * → Kollisionswarnung, wenn ein Kopplungsschacht dieselbe Zelle trifft: dort überlagern
 * sich Kopplungs-Quellterm und Randbedingung (z. B. HFIX frisst/erzeugt Wasser) und es
 * sieht aus, als käme das Schacht-Wasser "aus der Boundary".
 */
export function bciClaimedCells(bci, header) {
    const cells = [];
    for (const ln of String(bci || '').split(/\r?\n/)) {
        const p = ln.trim().split(/\s+/);
        if (p.length < 4) continue;
        if (p[0] === 'P') {
            const { col, row } = worldToCell(Number(p[1]), Number(p[2]), header);
            cells.push({ col, row, type: p[3] });
        } else if (p[0] === 'N' || p[0] === 'S' || p[0] === 'E' || p[0] === 'W') {
            const a = Math.min(Number(p[1]), Number(p[2]));
            const b = Math.max(Number(p[1]), Number(p[2]));
            const type = p[3];
            if (p[0] === 'N' || p[0] === 'S') {
                const row = p[0] === 'N' ? 0 : header.nrows - 1;
                const c0 = Math.max(0, Math.floor((a - header.xllcorner) / header.cellsize));
                const c1 = Math.min(header.ncols - 1, Math.floor((b - header.xllcorner) / header.cellsize));
                for (let c = c0; c <= c1; c++) cells.push({ col: c, row, type });
            } else {
                const col = p[0] === 'W' ? 0 : header.ncols - 1;
                const r0 = Math.max(0, header.nrows - 1 - Math.floor((b - header.yllcorner) / header.cellsize));
                const r1 = Math.min(header.nrows - 1, header.nrows - 1 - Math.floor((a - header.yllcorner) / header.cellsize));
                for (let r = r0; r <= r1; r++) cells.push({ col, row: r, type });
            }
        }
    }
    return cells;
}

/** Numerisches Keyword aus einer run.par lesen (Zeilenformat `key wert`) — oder null. */
function parNum(par, key) {
    const m = String(par || '').match(new RegExp(`^\\s*${key}\\s+([\\d.eE+-]+)`, 'm'));
    const n = m ? Number(m[1]) : NaN;
    return Number.isFinite(n) ? n : null;
}

/**
 * Zeit-Synchronisation 1D↔2D „unter der Haube": der Nutzer stellt nur die 2D-Dauer ein,
 * die SWMM-Laufzeit folgt automatisch. Ohne diese Kopplung endete SWMM nach dem Builder-
 * Default (6 h) und das Netz „starb" mitten im 2D-Lauf — nur als Logzeile gemeldet
 * (coupling.cpp: „SWMM-Simulationsdauer zu Ende").
 *   - durationHours  ← sim_time + 5 min Puffer (Lockstep dt_c läuft nie über das Ende)
 *   - reportStepSeconds ← saveint (1D-Ergebnisframes takten wie die 2D-Frames)
 * Explizit gesetzte swmm-Optionen gewinnen immer.
 */
export function syncedSwmmOptions(par, swmm = {}) {
    const out = { ...swmm };
    const simTime = parNum(par, 'sim_time');
    if (out.durationHours == null && simTime > 0)
        out.durationHours = (simTime + 300) / 3600;
    const saveint = parNum(par, 'saveint');
    if (out.reportStepSeconds == null && saveint > 0)
        out.reportStepSeconds = Math.max(1, Math.round(saveint));
    return out;
}

/**
 * true, wenn der Datei-Satz mit dem Kopplungs-Solver-Pfad (acceleration, kein fv1/dg2) läuft.
 * SGC selbst ist HIER kein Ausschlussgrund mehr — das wird zellengenau in
 * detectCouplingNodes() (opts.sgcWidthGrid) entschieden, nicht mehr modellweit: sonst würde
 * ein Netz mit Rohren UND einem einzigen Gerinne komplett kopplungslos.
 */
function couplingSchemeOk(par) {
    const p = String(par || '');
    if (/\bfv1\b/.test(p) || /\bdg2\b/.test(p)) return { ok: false, reason: 'fv1/dg2-Schema aktiv (Kopplung nur im acceleration-Pfad)' };
    if (!/\bacceleration\b/.test(p)) return { ok: false, reason: 'kein acceleration-Schema in run.par' };
    return { ok: true };
}

/**
 * Reichert baseFiles um die Kopplung an. Rein — keine Vue-Abhängigkeit.
 * @param {Record<string,string>} baseFiles  Ergebnis von InputGenerator.processScenario (inkl. terrain.asc, run.par)
 * @param {import('../geometry/NetworkModel.js').NetworkModel} model  das Kanalnetz
 * @param {object} opts { dtCouple=2.0, snapRadius=3, swmm={} }
 * @returns {{ files, active, warnings, diagnostics, couplingNodes, summary }}
 */
export function buildCoupledFiles(baseFiles, model, opts = {}) {
    const warnings = [];
    const off = (extra = {}) => ({ files: baseFiles, active: false, warnings, diagnostics: [], couplingNodes: [], summary: '', ...extra });

    if (!model || model.linkList.length === 0 && model.nodeList.length === 0) return off();
    const terrain = baseFiles['terrain.asc'];
    if (!terrain) { warnings.push('Kopplung: kein terrain.asc im Datei-Satz — deaktiviert.'); return off(); }

    const scheme = couplingSchemeOk(baseFiles['run.par']);
    if (!scheme.ok) { warnings.push(`Kopplung deaktiviert: ${scheme.reason}.`); return off(); }

    const dem = parseAscGrid(terrain);
    // sgc.width.asc (falls vorhanden) teilt exakt Raster-Dimensionen/-Ausrichtung mit
    // terrain.asc (beide über Rasterizer.gridToASC geschrieben) — direkt per col/row nutzbar.
    const sgcWidthGrid = baseFiles['sgc.width.asc'] ? parseAscGrid(baseFiles['sgc.width.asc']).grid : null;
    const { files: coupFiles, warnings: cw, couplingNodes, diagnostics } =
        buildCoupledInputsFromModel(model, dem,
            { ...opts, sgcWidthGrid, swmm: syncedSwmmOptions(baseFiles['run.par'], opts.swmm) });
    warnings.push(...cw);

    if (!couplingNodes || couplingNodes.length === 0) {
        warnings.push('Kopplung: keine gültigen Kopplungsschächte im DEM gefunden — deaktiviert.');
        return off({ diagnostics });
    }

    // Kollision Kopplungszelle ↔ Randbedingungs-Zelle (flow.bci) melden.
    const claimed = new Map(bciClaimedCells(baseFiles['flow.bci'], dem.header)
        .map(c => [`${c.col},${c.row}`, c.type]));
    for (const cn of couplingNodes) {
        const t = cn.cell && claimed.get(`${cn.cell.col},${cn.cell.row}`);
        if (t) {
            warnings.push(`Kopplungsschacht ${cn.id} teilt Zelle (${cn.cell.col},${cn.cell.row}) mit einer `
                + `${t}-Randbedingung — Kopplungs-Austausch und Boundary überlagern sich dort `
                + `(Schacht-Wasser erscheint „aus der Boundary" bzw. wird von ihr geschluckt). `
                + `Schacht oder Boundary versetzen.`);
        }
    }

    // Merge + couplingfile-Keyword in run.par (idempotent).
    const files = { ...baseFiles, ...coupFiles };
    let par = String(baseFiles['run.par'] || '');
    if (!/\bcouplingfile\b/.test(par)) par += (par.endsWith('\n') ? '' : '\n') + 'couplingfile flow.coupling\n';
    files['run.par'] = par;

    const nSink = couplingNodes.filter(c => c.sink).length;
    const summary = `${couplingNodes.length} Kopplungsschacht/-schächte (${nSink} in Senke), `
        + `${model.linkList.filter(l => l.conveyance !== 'open').length} SWMM-Haltungen`;
    return { files, active: true, warnings, diagnostics, couplingNodes, summary };
}
