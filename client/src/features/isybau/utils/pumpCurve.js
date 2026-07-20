/**
 * Single source of truth für die PUMP3-Kennlinie (Q-H), damit SwmmBuilder
 * (schreibt [CURVES] ins .inp) und die UI-Vorschau (PumpCurvePreview.vue)
 * niemals auseinanderlaufen können — genau so ein Auseinanderlaufen zwischen
 * "was der Builder rechnet" und "was tatsächlich geschrieben wird" hat vorher
 * schon zum X/Y-Vertauschungsbug geführt.
 *
 * PUMP3: X-Value = Förderhöhe (Head), Y-Value = Förderleistung bei dieser Höhe
 * (solver/src/solver/link.c pump_getFlow: `table_lookup(&Curve[m], head)`).
 */

/**
 * @param {object} node - Pumpen-Node (bauwerkstyp 6): pumpRate (l/s), pumpHead (m),
 *   optional bauwerkData.pumpHead / bauwerkData.pumpPower als XML-Fallback.
 * @returns {{ H_d: number, Q_d: number, estimated: boolean, points: Array<{head:number, flow:number}> }}
 */
export function computePumpCurvePoints(node) {
    const bd = node?.bauwerkData;
    const safeFloat = (val, def = 0) => {
        if (val === undefined || val === null || val === '') return def;
        const f = parseFloat(val);
        return Number.isNaN(f) ? def : f;
    };

    const Q_ui = safeFloat(node?.pumpRate, 0);
    const H_ui = safeFloat(node?.pumpHead, 0);
    const H_d = H_ui > 0 ? H_ui : safeFloat(bd?.pumpHead, 10.0);

    let Q_d;
    let estimated = false;
    if (Q_ui > 0) {
        Q_d = Q_ui / 1000; // l/s -> m³/s
    } else {
        const P = safeFloat(bd?.pumpPower, 5.0);
        Q_d = (P * 1000 * 0.7) / (1000 * 9.81 * H_d);
        estimated = true;
    }

    // 3 Punkte, nach Head aufsteigend (Pflicht laut table_readCurve/ERR_171):
    // Freilauf (0 Head, max. Fluss) → Auslegung (H_d, Q_d) → Abriegelung (1.3×H_d, 0).
    return {
        H_d,
        Q_d,
        estimated,
        points: [
            { head: 0, flow: Q_d * 1.4 },
            { head: H_d, flow: Q_d },
            { head: H_d * 1.3, flow: 0 }
        ]
    };
}
