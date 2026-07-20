/**
 * Plausibilitäts-Check der Abflussberechnung nach dem Fließzeitverfahren
 * (rationale Methode). Liefert je Teilfläche eine überschlägige Handrechnung
 * (Q = ψ·i·A), gegen die die SWMM-Ergebnisse geprüft werden können.
 *
 * Zeilenformat entspricht dem `details`-Prop des RunoffValidationModal:
 * { nodeId, areaId, areaSize, flowLength, slope, tc, maxFlow, totalVolume, emptyTime }
 */

const INITIAL_LOSS_MM = 1.0;   // Anfangsverlust (Benetzung/Mulden), zuschaltbar
const FLOW_VELOCITY_MS = 1.0;  // vereinfachte Fließgeschwindigkeit auf der Oberfläche

/**
 * Maßgebende Regenintensität (l/(s·ha)) und Dauer (min) aus der Regen-Konfiguration.
 */
function resolveRain(rain) {
    // Modellregen: Spitzenintensität und tatsächliche Dauer der Serie
    const series = rain?.activeModelRain?.series;
    if (Array.isArray(series) && series.length > 0) {
        const intensity = Math.max(...series.map(s => s.intensity || 0));
        const interval = series.length > 1 ? (series[1].time - series[0].time) : 5;
        return { intensity, durationMin: series.length * interval };
    }
    // KOSTRA/Blockregen: konstante Intensität über rain.duration (Stunden)
    return {
        intensity: rain?.intensity || 0,
        durationMin: (rain?.duration || 1) * 60
    };
}

/**
 * @param {object} args
 * @param {Array}  args.areas - Area-Instanzen bzw. POJOs (size in ha, runoffCoeff 0-1)
 * @param {object} args.rain  - store.rain
 * @param {boolean} args.applyLosses - 1 mm Anfangsverlust abziehen
 * @returns {Array} Zeilen für das RunoffValidationModal
 */
export function computeRunoffValidation({ areas = [], rain = {}, applyLosses = false }) {
    const { intensity, durationMin } = resolveRain(rain);

    return areas
        .filter(a => (a.size || 0) > 0)
        .map(a => {
            const areaHa = Number(a.size) || 0;
            const areaM2 = areaHa * 10000;
            const psi = Number(a.runoffCoeff) || 0;

            // Fließweg: wie im SwmmBuilder als Quadratwurzel der Fläche angesetzt
            const flowLength = Math.sqrt(areaM2);
            const tc = flowLength / FLOW_VELOCITY_MS / 60; // min

            // Spitzenabfluss (rationale Methode): Q = ψ · i · A  [l/s]
            const maxFlow = psi * intensity * areaHa;

            // Regenhöhe über die Dauer: 1 l/(s·ha) über 1 min = 0.006 mm
            let rainHeightMm = intensity * durationMin * 0.006;
            if (applyLosses) rainHeightMm = Math.max(0, rainHeightMm - INITIAL_LOSS_MM);

            // Abflussvolumen [m³]
            const totalVolume = psi * (rainHeightMm / 1000) * areaM2;

            // Leerlaufzeit: Volumen / Spitzenabfluss [min]
            const emptyTime = maxFlow > 0 ? (totalVolume * 1000) / maxFlow / 60 : 0;

            return {
                nodeId: a.nodeId || a.edgeId || '-',
                areaId: a.id,
                areaSize: areaHa,
                flowLength,
                slope: a.slope ?? 0,
                tc,
                maxFlow,
                totalVolume,
                emptyTime
            };
        });
}
