/**
 * HydrologyCalculator
 * 
 * Provides static methods for hydrological calculations based on DIN 1986-100 / DWA-A 117 / SCS Method.
 */
export class HydrologyCalculator {

    /**
     * Calculates the concentration time (Tc) using the Kirpich formula (or similar as specified).
     * Formula: Tc = (0.868 * L^3 / deltaH)^0.385
     * 
     * @param {number} Lf - Flow length in km
     * @param {number} deltaH - Height difference in m
     * @returns {number} Tc in hours
     */
    static calculateTc(Lf, deltaH) {
        if (!Lf || !deltaH || deltaH <= 0) return 0;
        // Formula: Tc = (0.868 * Lf^3 / deltaH)^0.385
        // Lf in km, deltaH in m -> Tc in hours
        const term = (0.868 * Math.pow(Lf, 3)) / deltaH;
        return Math.pow(term, 0.385);
    }

    /**
     * Calculates the effective rainfall using the SCS Curve Number method.
     * 
     * @param {number} P - Total rainfall in mm
     * @param {number} CN - Curve Number (0-100)
     * @returns {number} Effective rainfall (Pe) in mm
     */
    static calculateScsRunoff(P, CN) {
        if (CN >= 100) return P;
        if (CN <= 0) return 0;

        // Potential maximum retention (S) in mm
        // S = 25400/CN - 254
        const S = (25400 / CN) - 254;

        // Initial abstraction (Ia) usually 0.2 * S, but sometimes 0.05 * S in Germany
        // Using standard 0.2 for now unless specified otherwise
        const Ia = 0.2 * S;

        if (P <= Ia) return 0;

        // Pe = (P - Ia)^2 / (P - Ia + S)
        const Pe = Math.pow(P - Ia, 2) / (P - Ia + S);
        return Pe;
    }

    /**
     * Calculates the Unit Hydrograph using the Linear Storage Cascade.
     * 
     * @param {number} k - Storage coefficient (hours)
     * @param {number} n - Number of reservoirs (usually 2 or 3)
     * @param {number} dt - Time step (hours)
     * @param {number} duration - Total simulation duration (hours)
     * @returns {Array} Array of ordinates for the unit hydrograph (1mm rain)
     */
    static calculateUnitHydrograph(k, n, dt, duration) {
        // This is a simplified approach. For a true cascade, we often use the Nash model.
        // u(t) = (1 / (k * Gamma(n))) * (t/k)^(n-1) * e^(-t/k)
        // Here we return a discrete time series.

        const steps = Math.ceil(duration / dt);
        const hydrograph = [];

        // Gamma function approximation for integer n: (n-1)!
        const gammaN = this.factorial(n - 1);

        for (let i = 0; i < steps; i++) {
            const t = i * dt;
            let u = 0;
            if (t > 0) {
                u = (1 / (k * gammaN)) * Math.pow(t / k, n - 1) * Math.exp(-t / k);
            }
            // u is in 1/h. To get discharge for 1mm rain over area A, we multiply later.
            // For now, this is the instantaneous unit hydrograph ordinate.
            hydrograph.push({ t, u });
        }
        return hydrograph;
    }

    /**
     * Convolves effective rainfall with the unit hydrograph to get the direct runoff hydrograph.
     * 
     * @param {Array} rainSeries - Array of {t, intensity_mm_h} or {t, depth_mm}
     * @param {number} area_km2 - Catchment area in km^2
     * @param {number} k - Storage constant (h)
     * @param {number} n - Number of cascades
     * @param {number} dt - Time step (h)
     * @returns {Array} Array of {t, Q_m3_s}
     */
    static calculateFloodWave(rainSeries, area_km2, k, n, dt) {
        // Nash Cascade implementation for discrete time steps
        // We simulate the cascade numerically.

        const steps = rainSeries.length;
        const Q_out = new Array(steps).fill(0);

        // State of each reservoir
        // S[j] is the storage in reservoir j
        let S = new Array(n).fill(0);

        // Conversion factor: 1 mm over 1 km^2 = 1000 m^3
        // If rain is in mm/interval, Volume = rain * area * 1000
        // If rain is intensity mm/h, Volume in dt = intensity * dt * area * 1000

        const results = [];

        for (let i = 0; i < steps; i++) {
            // Input to first reservoir
            // rainSeries[i] is effective rain depth in mm for this time step
            const Pe_mm = rainSeries[i];
            const Vol_in = Pe_mm * area_km2 * 1000; // m^3

            // Inflow rate (average over dt)
            const I = Vol_in / (dt * 3600); // m^3/s

            // Route through n reservoirs
            // Using simple Euler or analytical solution for linear reservoir
            // dS/dt = I - Q, Q = S/k_sec
            // S_new = S_old * e^(-dt/k) + I * k * (1 - e^(-dt/k))

            let current_inflow = I;
            const k_sec = k * 3600; // k in seconds

            for (let j = 0; j < n; j++) {
                const S_old = S[j];
                const exp_term = Math.exp(-(dt * 3600) / k_sec);

                // Analytical solution for constant inflow I over dt
                const S_new = S_old * exp_term + current_inflow * k_sec * (1 - exp_term);
                const Q_out_res = S_new / k_sec; // Outflow at end of step

                S[j] = S_new;
                current_inflow = Q_out_res; // Output of j is input to j+1
            }

            results.push({
                t: i * dt, // hours
                Q: current_inflow // m^3/s
            });
        }

        return results;
    }

    /**
     * Calculates the required retention volume.
     * V = Integral(Q_in - Q_out) dt
     * 
     * @param {Array} hydrograph - Array of {t, Q}
     * @param {number} Q_allowed - Max allowed discharge (m^3/s)
     * @param {number} dt - Time step in hours
     * @returns {number} Required volume in m^3
     */
    static calculateRetentionVolume(hydrograph, Q_allowed, dt) {
        let maxVol = 0;
        let currentVol = 0;
        const dt_sec = dt * 3600;

        for (let i = 0; i < hydrograph.length; i++) {
            const Q_in = hydrograph[i].Q;
            // We discharge at most Q_allowed, or Q_in if it's less (simplified, actually we discharge Q_allowed if we have volume)
            // But for retention volume dimensioning:
            // Accumulate (Q_in - Q_allowed) * dt

            const diff = Q_in - Q_allowed;
            currentVol += diff * dt_sec;

            if (currentVol < 0) currentVol = 0;
            if (currentVol > maxVol) maxVol = currentVol;
        }
        return maxVol;
    }

    static factorial(num) {
        if (num < 0) return -1;
        else if (num == 0) return 1;
        else {
            return (num * this.factorial(num - 1));
        }
    }
}
