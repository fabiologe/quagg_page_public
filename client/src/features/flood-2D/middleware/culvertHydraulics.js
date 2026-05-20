/**
 * Culvert hydraulics — 4-state flow model
 *
 * States (priority order):
 *   DRY          wse_in <= z_in (and wse_out <= z_out)  →  Q = 0
 *   FREE_FLOW    inlet submerged, outlet free            →  orifice (Torricelli)
 *   PRESSURE     both ends submerged                     →  Manning full-pipe
 *   BACKWATER    reverse head (wse_out > wse_in)         →  negative Q
 *
 * All units SI: m, m³/s
 */

const G = 9.81;

/**
 * Cross-section area of circular culvert [m²]
 */
function area(diameter) {
    return Math.PI * diameter * diameter / 4.0;
}

/**
 * Hydraulic radius of full circular pipe [m]
 */
function hydraulicRadius(diameter) {
    return diameter / 4.0;
}

/**
 * Core flow magnitude for a given head difference (always ≥ 0).
 *
 * @param {number} hw_in   - driving head at inlet above crown [m], ≥ 0
 * @param {number} dh      - total head difference |wse_in - wse_out| [m], ≥ 0
 * @param {boolean} pressure - true → Manning full-pipe; false → orifice
 * @param {object} culvert
 */
function _flowMagnitude(hw_in, dh, pressure, culvert) {
    const { diameter, length, manning_n, Cd } = culvert;
    const A = area(diameter);

    if (pressure) {
        // Manning full-pipe: Q = (A/n) * R^(2/3) * sqrt(dh/L)
        const R = hydraulicRadius(diameter);
        const slope = dh / Math.max(length, 0.01);
        return (A / manning_n) * Math.pow(R, 2.0 / 3.0) * Math.sqrt(slope);
    } else {
        // Orifice (inlet control): Q = Cd * A * sqrt(2g * hw_in)
        return Cd * A * Math.sqrt(2.0 * G * Math.max(hw_in, 0));
    }
}

/**
 * Compute culvert discharge Q [m³/s].
 *
 * Positive Q = flow from inlet to outlet.
 * Negative Q = reverse (backwater) flow.
 *
 * @param {number} wse_in   - water surface elevation at inlet [m NHN]
 * @param {number} wse_out  - water surface elevation at outlet [m NHN]
 * @param {object} culvert  - { z_in, z_out, diameter, length, manning_n, Cd }
 * @returns {number} Q [m³/s]
 */
export function culvertFlow(wse_in, wse_out, culvert) {
    const { z_in, z_out } = culvert;

    // Crown elevation (top of pipe opening)
    const crown_in  = z_in  + culvert.diameter;
    const crown_out = z_out + culvert.diameter;

    // --- DRY: inlet below invert ---
    if (wse_in <= z_in && wse_out <= z_out) return 0.0;

    // --- BACKWATER: reverse flow ---
    if (wse_out > wse_in) {
        // Swap roles: outlet becomes driving head, inlet is tail
        const hw_reverse = wse_out - z_out;
        const dh = wse_out - wse_in;
        const pressure = (wse_out > crown_out) && (wse_in > crown_in);
        const Q = _flowMagnitude(hw_reverse, dh, pressure, culvert);
        return -Q;
    }

    // --- FORWARD FLOW ---
    const hw_in = wse_in - z_in;   // head above inlet invert
    const dh    = wse_in - wse_out; // head difference

    if (hw_in <= 0) return 0.0;

    // Pressure flow when both crowns are submerged
    const pressure = (wse_in > crown_in) && (wse_out > crown_out);

    return _flowMagnitude(hw_in, dh, pressure, culvert);
}

/**
 * Return the flow state label for diagnostics.
 */
export function culvertState(wse_in, wse_out, culvert) {
    const { z_in, z_out } = culvert;
    if (wse_in <= z_in && wse_out <= z_out) return 'DRY';
    if (wse_out > wse_in) return 'BACKWATER';
    const crown_in  = z_in  + culvert.diameter;
    const crown_out = z_out + culvert.diameter;
    if ((wse_in > crown_in) && (wse_out > crown_out)) return 'PRESSURE';
    return 'FREE_FLOW';
}
