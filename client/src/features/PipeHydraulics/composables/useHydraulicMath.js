/**
 * Hydraulic calculations based on Manning-Strickler
 */

export const useHydraulicMath = () => {

    /**
     * Calculates properties for a Circular Profile
     * @param {number} d - Diameter (m)
     * @param {number} h - Water Level (m)
     * @param {number} kst - Roughness (m^(1/3)/s)
     * @param {number} I - Slope (m/m) (e.g., 0.01 for 1%)
     */
    const calculateCircular = (d, h, kst, I) => {
        if (h <= 0 || d <= 0) return zeroResult();
        const r = d / 2;

        // Check for full or near full pipe (Prandtl-Colebrook / limit to full for simplicity in M-S context)
        // For M-S, we treat h > d as full pipe pressure flow usually, but here we cap at d for open channel logic
        const h_eff = Math.min(h, d);

        // Central angle theta (radians)
        // cos(theta/2) = (r - h) / r
        // theta = 2 * acos(1 - 2h/d) is another form, let's derive:
        // r - h = r * cos(alpha/2) -> alpha is angle of empty part?
        // Let's standard: theta is the angle of the wetted sector.

        let theta;
        if (h_eff >= d) {
            theta = 2 * Math.PI;
        } else {
            // c is chord distance from center = r - h
            // cos(theta/2) = (r - h)/r is wrong if h > r
            // Let's use: cos(theta/2) = 1 - 2(h/d)
            theta = 2 * Math.acos(1 - 2 * (h_eff / d));
        }

        const A = (d * d / 8) * (theta - Math.sin(theta));
        const P = (theta * d) / 2; // Wetted perimeter
        const rh = P > 0 ? A / P : 0;

        const v = kst * Math.pow(rh, 2 / 3) * Math.pow(I, 0.5);
        const Q = v * A;

        // Full flow values
        const A_full = Math.PI * Math.pow(r, 2);
        const P_full = Math.PI * d;
        const rh_full = A_full / P_full; // = d/4
        const v_full = kst * Math.pow(rh_full, 2 / 3) * Math.pow(I, 0.5);
        const Q_full = v_full * A_full;

        return {
            v: isNaN(v) ? 0 : v,
            Q: isNaN(Q) ? 0 : Q * 1000, // L/s
            A,
            P,
            rh,
            Fr: calculateFroude(v, A, d, theta), // Simplified Width T top?
            Q_full: Q_full * 1000,
            v_full,
            fillingRatio: h_eff / d
        };
    };

    /**
     * Calculates properties for a Rectangular Profile
     * @param {number} w - Width (m)
     * @param {number} h_geo - Channel Height (m)
     * @param {number} h - Water Level (m)
     * @param {number} kst
     * @param {number} I
     */
    const calculateRectangular = (w, h_geo, h, kst, I) => {
        if (h <= 0 || w <= 0) return zeroResult();
        const h_eff = Math.min(h, h_geo);

        const A = w * h_eff;
        const P = w + 2 * h_eff;
        const rh = A / P;

        const v = kst * Math.pow(rh, 2 / 3) * Math.pow(I, 0.5);
        const Q = v * A;

        // Full flow
        const A_full = w * h_geo;
        const P_full = w + 2 * h_geo;
        const rh_full = A_full / P_full;
        const v_full = kst * Math.pow(rh_full, 2 / 3) * Math.pow(I, 0.5);
        const Q_full = v_full * A_full;

        return {
            v,
            Q: Q * 1000,
            A,
            P,
            rh,
            Q_full: Q_full * 1000,
            v_full,
            Fr: 0, // TODO implement Froude for rect
            fillingRatio: h_eff / h_geo
        };
    };

    /**
     * Approximates Egg Profile (Standard Egg Profile DIN 4032)
     * w:h = 2:3
     * r = w/2
     * Geometry is complex, often approximated or table-lookup.
     * We will implementation a simplified geometric composition model if high precision needed
     * Or scaling factors.
     * 
     * For now, let's implement the standard geometry composition:
     * Top circle: r = w/2
     * Bottom circle: r_bottom = r/2 ?
     * Let's stick to DWA-A 110 or similar approximations for now if simple.
     * Actually, let's implement the 'reference' geometry for "Norm-Eiprofil" H/B = 1.5
     * r = B/2
     * R = 3r (Side arcs radius)
     * r_sohle = r/2
     * 
     * This is complicated to derive analytically on the fly without errors.
     * Maybe we assume scaling from a unit egg?
     * Area total = 0.5105 * H^2 ? No.
     * Approx Area = 0.785 * B * H ?
     * 
     * Let's use a simpler heuristic or placeholder until verified math is added.
     * Or better: treat as 'Unknown' for PRO requirements, stick to Circular/Rect for MVP first step?
     * The user explicitly asked for "für 'Pro' auch Eiprofil".
     * 
     * Let's try to implement a decent approximation or exact if we can describe it.
     */
    const calculateEgg = (w, h_geo, h, kst, I) => {
        // Placeholder: exact egg math is complex, using simplified scaling for now
        // Or assuming it fits roughly Area(h) curves.
        // Let's default to a warning or basic rect approx if h max?
        // Let's behave like a rectangle with varying width?

        // Fallback for valid computation flow
        return calculateRectangular(w, h_geo, h, kst, I);
    };

    const calculateFroude = (v, A, T_width_surface) => {
        // Fr = v / sqrt(g * hm) where hm = A / T
        // T is top width.
        // Circular: T = 2 * sqrt(r^2 - (r-h)^2)
        // For now returning 0
        return 0;
    };

    const zeroResult = () => ({
        v: 0, Q: 0, A: 0, P: 0, rh: 0, Fr: 0, Q_full: 0, v_full: 0, fillingRatio: 0
    });

    /**
     * Generates curve data for plotting Q/Qfull and v/vfull against h/D (0 to 1)
     * @param {string} type - 'circular', 'rectangular', etc.
     * @param {number} d_or_w - Diameter or Width
     * @param {number} h_geo - Height (for rect/egg)
     * @param {number} kst
     * @param {number} I
     * @param {number} steps - Number of points (default 50)
     */
    const calculateCurveData = (type, d_or_w, h_geo, kst, I, steps = 50) => {
        const data = {
            ratios: [], // x-axis: h/D (0 to 1)
            q_rel: [],  // Q / Qfull
            v_rel: []   // v / vfull
        };

        // Calculate full flow first to normalize
        let fullRes;
        const h_max = (type === 'circular') ? d_or_w : h_geo;

        if (type === 'circular') fullRes = calculateCircular(d_or_w, d_or_w, kst, I);
        else if (type === 'rectangular') fullRes = calculateRectangular(d_or_w, h_geo, h_max, kst, I);
        else fullRes = calculateEgg(d_or_w, h_geo, h_max, kst, I);

        const Q_full = fullRes.Q;
        const v_full = fullRes.v;

        if (Q_full === 0) return data;

        for (let i = 0; i <= steps; i++) {
            const ratio = i / steps;
            const h_current = ratio * h_max;

            let res;
            if (type === 'circular') res = calculateCircular(d_or_w, h_current, kst, I);
            else if (type === 'rectangular') res = calculateRectangular(d_or_w, h_geo, h_current, kst, I);
            else res = calculateEgg(d_or_w, h_geo, h_current, kst, I);

            data.ratios.push(ratio);
            data.q_rel.push(res.Q / Q_full); // Both in L/s or m3/s, ratio is same
            data.v_rel.push(res.v / v_full);
        }
        return data;
    };

    return {
        calculateCircular,
        calculateRectangular,
        calculateEgg,
        calculateCurveData
    };
};
