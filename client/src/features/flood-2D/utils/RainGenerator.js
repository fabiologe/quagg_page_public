
import { KostraApiService } from '../../kostra/services/KostraApiService';

/**
 * Maps numeric return period to KOSTRA key suffix.
 * e.g., 100 -> 'RN_100A'
 */
const getReturnPeriodKey = (year) => {
    // Basic mapping for common return periods.
    // KOSTRA usually provides: 1, 2, 3, 5, 10, 20, 30, 50, 100
    // Format is RN_XXXA where XXX is zero-padded to 3 digits.
    const padded = String(year).padStart(3, '0');
    return `RN_${padded}A`;
};

/**
 * Calculates Euler Type II Model Rain (Copied & Adapted from isybau/utils/RainModelService.js)
 * @param {Object} kostraRow - KOSTRA data row for the selected return period (key: duration string '5', '10'..., value: intensity)
 * @param {number} duration - Total duration in minutes
 * @param {number} interval - Time step in minutes (default 5)
 * @returns {Array} - Array of { time: number, intensity: number }
 */
const calculateEulerType2 = (kostraRow, duration, interval = 5) => {
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
            // Extrapolation (use last known value)
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

    // Fill any nulls
    return resultSeries.map((val, idx) => ({
        time: idx * interval,
        intensity: val ? val.intensity : 0,
        height_mm: val ? val.height : 0
    }));
};

/**
 * Service to generate synthetic rain for flood simulation.
 */
export const RainGenerator = {

    /**
     * Generates a synthetic rain series (Euler Type II) based on KOSTRA data.
     * @param {Object} params
     * @param {number} params.lat - Latitude
     * @param {number} params.lng - Longitude
     * @param {number} params.durationMinutes - Total duration in minutes
     * @param {number} params.returnPeriod - Return period in years (e.g. 100)
     * @param {number} [params.eulerType] - 1 or 2 (Default 2)
     * @param {number} [params.intervalSteps] - Time step in minutes (Default 5)
     * @returns {Promise<Array>} - Array of objects [{ time_sec: number, value_mm: number }]
     */
    async generateSyntheticRain({ lat, lng, durationMinutes, returnPeriod, eulerType = 2, intervalSteps = 5 }) {
        // 1. Fetch KOSTRA data
        const kostraData = await KostraApiService.fetchRainData(lat, lng);
        const rawGrid = kostraData.raw;

        if (!rawGrid) {
            throw new Error('No KOSTRA data found for coordinates.');
        }

        // 2. Extract Data Row for the specific Return Period
        // The rawGrid structure is expected to be: { "5": { "RN_002A": ..., ... }, "10": { ... } }
        // We need to create a row: { "5": intensity, "10": intensity ... }
        const returnPeriodKey = getReturnPeriodKey(returnPeriod);
        const kostraRow = {};

        Object.keys(rawGrid).forEach(durationKey => {
            const entry = rawGrid[durationKey];
            if (entry && entry[returnPeriodKey] !== undefined) {
                kostraRow[durationKey] = entry[returnPeriodKey];
            }
        });

        if (Object.keys(kostraRow).length === 0) {
            throw new Error(`No data found for return period ${returnPeriod} years.`);
        }

        // 3. Calculate Euler Distribution
        // Note: Currently only supporting Euler Type II as per the copied logic.
        // If Type I is needed, logic would differ slightly in peak placement.
        const rainBlocks = calculateEulerType2(kostraRow, durationMinutes, intervalSteps);

        // 4. Transform to LISFLOOD format
        // Output: [{ time_sec: 0, value_mm: 0 }, { time_sec: 300, value_mm: 5.2 }, ...]
        // Note: LISFLOOD usually expects cumulative or intensity?
        // The requirement says "value_mm". Assuming this means accumulated depth for that step (block height).
        // If it meant intensity, it would be mm/h.
        // "value_mm: 5.2" in the prompt example suggests depth per step (e.g. 5.2mm in 5 mins).

        const result = rainBlocks.map(block => ({
            time_sec: block.time * 60,
            value_mm: block.height_mm
        }));

        // Ensure start at 0?
        // The first block is at time 0 (idx 0 * interval).
        // LISFLOOD time usually starts at 0.

        return result;
    }
};
