/**
 * Calculates Block Rain Series
 * @param {number} intensity - Rainfall intensity in l/(s*ha)
 * @param {number} duration - Duration in minutes
 * @param {number} interval - Time step in minutes (default 5)
 * @returns {Array} - Array of { time: number, intensity: number }
 */
export const calculateBlockRain = (intensity, duration, interval = 5) => {
    const steps = Math.ceil(duration / interval);
    const series = [];
    for (let i = 0; i < steps; i++) {
        series.push({
            time: i * interval,
            intensity: intensity
        });
    }
    return series;
};

/**
 * Calculates Euler Type II Model Rain
 * @param {Object} kostraRow - KOSTRA data row for the selected return period (key: duration string '5', '10'..., value: intensity)
 * @param {number} duration - Total duration in minutes
 * @param {number} interval - Time step in minutes (default 5)
 * @returns {Array} - Array of { time: number, intensity: number }
 */
export const calculateEulerType2 = (kostraRow, duration, interval = 5) => {
    const steps = Math.ceil(duration / interval);
    const blocks = [];

    // Get all available durations from KOSTRA row as numbers, sorted
    const availableDurations = Object.keys(kostraRow)
        .map(Number)
        .filter(d => !isNaN(d))
        .sort((a, b) => a - b);

    // Helper to get intensity for a specific duration d with interpolation
    const getI = (d) => {
        // 1. Exact match
        if (kostraRow[d] !== undefined) return kostraRow[d];
        if (kostraRow[String(d)] !== undefined) return kostraRow[String(d)];

        // 2. Interpolation
        // Find lower and upper bounds
        let lower = null;
        let upper = null;

        for (const ad of availableDurations) {
            if (ad <= d) lower = ad;
            if (ad > d && upper === null) upper = ad;
        }

        if (lower !== null && upper !== null) {
            // Linear interpolation of Intensity
            // I(d) = I_lower + (I_upper - I_lower) * (d - lower) / (upper - lower)
            const I_lower = kostraRow[lower];
            const I_upper = kostraRow[upper];
            return I_lower + (I_upper - I_lower) * (d - lower) / (upper - lower);
        } else if (lower !== null) {
            // Extrapolation (use last known value or 0? Use last known for safety, though technically incorrect)
            return kostraRow[lower];
        } else if (upper !== null) {
            return kostraRow[upper];
        }

        return 0;
    };

    // Calculate incremental heights (h_n)
    // h(d) [mm] = I(d) [l/s*ha] * d [min] * 0.006

    for (let i = 1; i <= steps; i++) {
        const d_current = i * interval;
        const d_prev = (i - 1) * interval;

        const I_curr = getI(d_current);
        const I_prev = d_prev > 0 ? getI(d_prev) : 0;

        const h_curr = I_curr * d_current * 0.006;
        const h_prev = d_prev > 0 ? (I_prev * d_prev * 0.006) : 0;

        let block_h = h_curr - h_prev; // Height of this block in mm

        // Safety: If interpolation causes negative block (rare but possible if I drops too fast), clamp to 0
        if (block_h < 0) block_h = 0;

        const block_I = block_h / (interval * 0.006); // Intensity in l/s*ha

        blocks.push({ height: block_h, intensity: block_I });
    }

    // Sort blocks descending by height (or intensity, same thing)
    blocks.sort((a, b) => b.height - a.height);

    const resultSeries = new Array(steps).fill(null);
    const peakIndex = Math.floor(steps * 0.3); // Peak at 30%

    // Place peak
    resultSeries[peakIndex] = blocks[0];

    let left = peakIndex - 1;
    let right = peakIndex + 1;

    for (let i = 1; i < blocks.length; i++) {
        if (left >= 0 && (i % 2 !== 0 || right >= steps)) {
            resultSeries[left] = blocks[i];
            left--;
        } else if (right < steps) {
            resultSeries[right] = blocks[i];
            right++;
        } else if (left >= 0) {
            resultSeries[left] = blocks[i];
            left--;
        }
    }

    // Fill any nulls (shouldn't happen if logic is correct)
    return resultSeries.map((val, idx) => ({
        time: idx * interval,
        intensity: val ? val.intensity : 0,
        height_mm: val ? val.height : 0
    }));
};
