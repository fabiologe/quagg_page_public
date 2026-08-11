/**
 * Hydraulics.js
 * The "Water Manager" module.
 * Wandelt Regenintensität in das LISFLOOD-.rain-Format um.
 *
 * Hinweis: Die Boundary-/BCI-Erzeugung lebt vollständig in
 * InputGenerator.generateBoundaryFiles (Ownership-Map, Flux-Splitting,
 * Kanten-Segmente). Das frühere Hydraulics.prepareBoundaries (+ die nur dort
 * genutzten generateTimeSeries*-Helfer) war eine abgelöste Parallel-
 * Implementierung und wurde entfernt.
 */
export const Hydraulics = {

    /**
     * Converts Rain intensity to LISFLOOD format.
     * @param {number} intensity_mm_h
     * @param {number} duration_s
     * @returns {string} Content for rain.txt
     */
    prepareRain(intensity_mm_h, duration_s = 3600) {
        // LISFLOOD .rain-Format (LoadTimeSeries, erste Zeile = Kommentar/übersprungen):
        //   [Kommentar]
        //   [Anzahl] [Zeiteinheit]
        //   [Rate_mm_h] [Zeit_s]     ← Spalte 1 = Rate in mm/h (Solver teilt intern
        //                              durch 1000*3600 → m/s), Spalte 2 = Zeit in s.
        // WICHTIG: Die Rate wird in mm/h angegeben – NICHT in m/s umrechnen.
        // Rechteck-Puls, der nach duration_s sauber auf 0 zurückgeht (sonst hält
        // LISFLOOD die letzte Rate bis sim_time → Dauerregen).
        const rate = Number(intensity_mm_h) || 0;
        const end = Math.max(1, Math.round(duration_s));
        const content = `RECT_RAIN_PULSE
3 seconds
${rate.toFixed(6)}\t0
${rate.toFixed(6)}\t${end - 1}
0.000000\t${end}
`;
        return content;
    },
};
