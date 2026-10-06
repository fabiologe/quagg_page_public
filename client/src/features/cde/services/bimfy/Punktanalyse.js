/**
 * PUNKTANALYSE — was eine Punktdatei IST (Fahrplan BIMFY XYZ, Stufe X1).
 *
 * Fabio, 2026-10-06: „das ist eine klassische XYZ-Datei oder ein ASCII-Grid".
 * Ein regelmaessiges Raster ist ein Gelaendemodell (DGM), keine Million
 * Einzelbauteile. Erkannt wird es hier; gebaut wird es auf dem Server als eigenes
 * Modell (`backend/app/ifc/gelaende.py`, IfcGeographicElement/TERRAIN).
 *
 * Rein: Zahlen hinein, Befund heraus.
 */

/** Ab so vielen Rasterpunkten ist ein regelmaessiges Raster ein Gelaende, nicht eine Punktliste. */
export const GELAENDE_AB_PUNKTEN = 100;

const _fin = (v) => typeof v === 'number' && Number.isFinite(v);

/** Der haeufigste Abstand aufeinanderfolgender, sortierter, verschiedener Werte (auf mm gerundet). */
function _schritt(werte) {
    const u = [...new Set(werte.map(v => Math.round(v * 1000)))].sort((a, b) => a - b);
    if (u.length < 2) return { schritt: 0, anzahl: u.length, min: u[0] / 1000, max: u[0] / 1000 };
    const zaehler = new Map();
    for (let i = 1; i < u.length; i++) zaehler.set(u[i] - u[i - 1], (zaehler.get(u[i] - u[i - 1]) ?? 0) + 1);
    const [schritt] = [...zaehler.entries()].sort((a, b) => b[1] - a[1])[0];
    const regelmaessig = u.every((v, i) => i === 0 || (v - u[0]) % schritt === 0);
    return { schritt: regelmaessig ? schritt / 1000 : 0, anzahl: u.length, min: u[0] / 1000, max: u.at(-1) / 1000 };
}

/**
 * Ist eine Punktliste ein regelmaessiges Raster?
 * @param {{ost, nord, hoehe}[]} punkte
 * @returns {object|null}  `{format: 'xyz-raster', nx, ny, dx, dy, punkte, luecken, ausdehnung, hoehe: {min, max}}` oder null
 */
export function rasterAusPunkten(punkte) {
    if (!Array.isArray(punkte) || punkte.length < GELAENDE_AB_PUNKTEN) return null;
    const x = _schritt(punkte.map(p => p.ost));
    const y = _schritt(punkte.map(p => p.nord));
    if (!(x.schritt > 0) || !(y.schritt > 0)) return null;
    const nx = Math.round((x.max - x.min) / x.schritt) + 1;
    const ny = Math.round((y.max - y.min) / y.schritt) + 1;
    // Ein Raster ist zu mindestens der Haelfte gefuellt — sonst sind es verstreute Punkte auf zufaellig runden Lagen.
    if (punkte.length < 0.5 * nx * ny) return null;
    return _befund('xyz-raster', { nx, ny, dx: x.schritt, dy: y.schritt, punkte: punkte.length,
                                   minO: x.min, maxO: x.max, minN: y.min, maxN: y.max }, punkte.map(p => p.hoehe));
}

/**
 * Ein ESRI-ASCII-Grid lesen — Kopf und Werte, ohne Geometrie.
 * @returns {object}  wie `rasterAusPunkten`, Format 'ascii-grid'
 */
export function rasterAusAsciiGrid(text) {
    const zeilen = String(text ?? '').split(/\r?\n/);
    const kopf = {};
    let i = 0;
    for (; i < zeilen.length; i++) {
        const t = zeilen[i].trim().split(/\s+/);
        if (t.length === 2 && /^[a-z_]+$/i.test(t[0])) kopf[t[0].toLowerCase()] = Number(t[1].replace(',', '.'));
        else break;
    }
    const nx = kopf.ncols, ny = kopf.nrows;
    const dx = kopf.cellsize ?? kopf.dx, dy = kopf.cellsize ?? kopf.dy;
    if (!(nx > 0) || !(ny > 0) || !(dx > 0) || !(dy > 0)) throw new Error('ASCII-Grid ohne ncols, nrows oder cellsize');
    const mitte = _fin(kopf.xllcenter);
    const x0 = mitte ? kopf.xllcenter : kopf.xllcorner + dx / 2;
    const y0 = mitte ? kopf.yllcenter : kopf.yllcorner + dy / 2;
    if (!_fin(x0) || !_fin(y0)) throw new Error('ASCII-Grid ohne xllcorner oder xllcenter');
    const werte = zeilen.slice(i).join(' ').trim().split(/\s+/).filter(Boolean).map(t => Number(t.replace(',', '.')));
    if (werte.length !== nx * ny) throw new Error(`ASCII-Grid: ${werte.length} Werte, erwartet ${nx} × ${ny} = ${nx * ny}`);
    const nodata = kopf.nodata_value;
    const gueltig = werte.filter(v => _fin(v) && v !== nodata);
    return _befund('ascii-grid', { nx, ny, dx, dy, punkte: gueltig.length, minO: x0, maxO: x0 + (nx - 1) * dx,
                                   minN: y0, maxN: y0 + (ny - 1) * dy }, gueltig);
}

function _befund(format, r, hoehen) {
    let min = Infinity, max = -Infinity;
    for (const h of hoehen) if (_fin(h)) { if (h < min) min = h; if (h > max) max = h; }
    return {
        format, nx: r.nx, ny: r.ny, dx: r.dx, dy: r.dy, punkte: r.punkte, luecken: r.nx * r.ny - r.punkte,
        ausdehnung: { minO: r.minO, maxO: r.maxO, minN: r.minN, maxN: r.maxN },
        hoehe: { min: _fin(min) ? min : null, max: _fin(max) ? max : null },
    };
}

/** Ein Satz fuer die Tafel. */
export function gelaendeSatz(g) {
    const f = (v) => String(Math.round(v * 100) / 100).replace('.', ',');
    const fl = ((g.ausdehnung.maxO - g.ausdehnung.minO) * (g.ausdehnung.maxN - g.ausdehnung.minN) / 1e6);
    return `${g.format === 'ascii-grid' ? 'ASCII-Grid' : 'XYZ-Raster'} ${g.nx} × ${g.ny}, Raster ${f(g.dx)} m, `
        + `${g.punkte.toLocaleString('de-DE')} Punkte${g.luecken ? ` (${g.luecken.toLocaleString('de-DE')} Lücken)` : ''}, `
        + `${f(fl)} km², Höhe ${g.hoehe.min === null ? '–' : `${f(g.hoehe.min)} bis ${f(g.hoehe.max)} m`}`;
}
