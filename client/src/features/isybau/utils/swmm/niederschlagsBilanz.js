/**
 * Niederschlagsbilanz (SWMM „Runoff Quantity Continuity") in mm — für Ergebnisreiter und
 * PDF aus EINER Quelle. Die mm-Werte druckt SWMM selbst, bezogen auf die Fläche der
 * gerechneten Teilflächen. Vorher teilten Reiter und PDF die Volumina durch die AKTUELLE
 * Flächensumme im Editor: nach jeder Flächenänderung (oder mit Flächen ohne Anschluss,
 * die gar nicht gerechnet werden) passten die mm nicht mehr zum Lauf (P1.6).
 *
 * @param {object} runoff  systemStats.runoff (RptParser: Volumen ha·m und *Mm)
 * @param {number} rechenflaecheHa  Summe der Teilflächen der gerechneten .inp (Bezugsfläche)
 */
export function niederschlagsBilanz(runoff = {}, rechenflaecheHa = 0) {
    const r = runoff || {};
    const ausSwmm = (r.precipMm ?? 0) > 0;
    // Rückfall ohne mm-Spalte (alte Ergebnisse): Volumen / Bezugsfläche
    const mm = (feld, vol) => (ausSwmm ? (r[feld] ?? 0)
        : rechenflaecheHa > 0 ? ((vol ?? 0) / rechenflaecheHa) * 1000 : 0);
    return {
        precipMm: mm('precipMm', r.precip),
        evapMm: mm('evapMm', r.evap),
        infilMm: mm('infilMm', r.infil),
        runoffMm: mm('runoffMm', r.runoff),
        finalStorageMm: mm('finalStorageMm', r.finalStorage),
        // Abflussbeiwert Ψ = Abflussvolumen / Niederschlagsvolumen
        psi: (r.precip > 0) ? (r.runoff / r.precip) : 0,
        quelle: ausSwmm ? 'swmm' : 'flaeche',
    };
}

/** Bezugsfläche = Summe der [SUBCATCHMENTS]-Flächen der gerechneten .inp (ha). */
export function rechenflaecheAusInp(inp) {
    if (typeof inp !== 'string' || !inp) return 0;
    let drin = false, summe = 0;
    for (const roh of inp.split(/\r?\n/)) {
        const z = roh.trim();
        if (z.startsWith('[')) { drin = z.toUpperCase().startsWith('[SUBCATCHMENTS'); continue; }
        if (!drin || !z || z.startsWith(';')) continue;
        const a = parseFloat(z.split(/\s+/)[3]);
        if (Number.isFinite(a)) summe += a;
    }
    return summe;
}

/**
 * Spitzenabfluss einer Teilfläche aus der Ganglinie (.out) in l/s. SWMMs Tabelle
 * „Subcatchment Runoff Summary" druckt die Spitze in CMS mit zwei Stellen — Auflösung
 * 10 l/s, bei kleinen Flächen oft „0,00" (P1.7).
 * @param {Array} timeSeries  SwmmOutParser-Reihe (subcatchments[id].runoff in Durchflusseinheit)
 * @param {string} id
 * @param {number} faktor  Durchflusseinheit → l/s (CMS: 1000, LPS: 1)
 */
export function spitzeAusGanglinie(timeSeries, id, faktor = 1000) {
    let max = null;
    for (const step of timeSeries || []) {
        const q = step.subcatchments?.[id]?.runoff;
        if (Number.isFinite(q) && (max === null || q > max)) max = q;
    }
    return max === null ? null : max * faktor;
}

export const faktorZuLs = (systemStats) => (systemStats?.analysisOptions?.flowUnits === 'LPS' ? 1 : 1000);
