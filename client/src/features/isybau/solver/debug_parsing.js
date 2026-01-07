const parseTableLine = (line, type) => {
    const parts = line.trim().split(/\s+/);
    // console.log(`[${type}] Parts:`, parts);

    // Helper for Offset
    let offset = 0;
    // Check for Day + Time pattern in typical location (usually parts 3,4 or 4,5 depending on table)
    // Actually, distinct tables have different locations for Time.
    // Node Depth: Node(0), Type(1), Avg(2), Max(3), HGL(4), [Day(5)], Time(5/6)

    const isDay = (idx) => /^\d+$/.test(parts[idx]) && !parts[idx].includes(':');
    const isTime = (idx) => parts[idx] && parts[idx].includes(':');

    if (type === 'LinkFlow') {
        const id = parts[0];
        if (isDay(3) && isTime(4)) offset = 1;

        // 2: Flow, 4+off: Vel, 5+off: Ratio
        const flow = parts[2];
        const vel = parts[4 + offset];
        const ratio = parts[5 + offset];
        return { id, flow, vel, ratio, offset };
    }

    if (type === 'NodeDepth') {
        // Node(0), Type(1), Avg(2), Max(3), HGL(4), [Day], Time
        if (isDay(5) && isTime(6)) offset = 1;

        const id = parts[0];
        const maxDepth = parts[3];
        return { id, maxDepth, offset };
    }

    if (type === 'NodeInflow') {
        // Node(0), Type(1), MaxLat(2), MaxTotal(3), [Day], Time, LatVol, TotalVol, Error
        if (isDay(4) && isTime(5)) offset = 1;

        const id = parts[0];
        const maxInflow = parts[3];
        return { id, maxInflow, offset };
    }

    if (type === 'NodeFlood') {
        // Node(0), Hours(1), MaxRate(2), [Day], Time, TotalVol, MaxDepth
        if (isDay(3) && isTime(4)) offset = 1;

        const id = parts[0];
        const totalVol = parts[4 + offset];
        const maxPondDepth = parts[5 + offset];
        return { id, totalVol, maxPondDepth, offset };
    }

    if (type === 'Subcatchment') {
        // Name(0), Precip(1), Runon(2), Evap(3), Infil(4), RunoffDepth(5), RunoffVol(6), Peak(7), Coeff(8)
        // No Day/Time usually.
        const id = parts[0];
        const precip = parts[1];
        const runoffDepth = parts[5]; // Check index
        const runoffVol = parts[6];
        const peak = parts[7];
        return { id, precip, runoffDepth, runoffVol, peak };
    }
};

console.log("--- Link Flow ---");
console.log(parseTableLine("L1 CONDUIT 10.5 0 12:00 1.50 0.75 0.40", 'LinkFlow')); // Day+Time
console.log(parseTableLine("L1 CONDUIT 10.5 12:00 1.50 0.75 0.40", 'LinkFlow'));   // Time Only

console.log("--- Node Depth ---");
// Node Type Avg Max HGL Day Time
console.log(parseTableLine("N1 JUNCTION 0.10 1.50 101.50 0 12:00", 'NodeDepth'));
// Node Type Avg Max HGL Time
console.log(parseTableLine("N1 JUNCTION 0.10 1.50 101.50 12:00", 'NodeDepth'));

console.log("--- Node Inflow ---");
// Node Type MaxLat MaxTot Day Time ...
console.log(parseTableLine("N1 JUNCTION 0.5 2.0 0 12:00 100 200 0.1", 'NodeInflow'));
console.log(parseTableLine("N1 JUNCTION 0.5 2.0 12:00 100 200 0.1", 'NodeInflow'));

console.log("--- Node Flood ---");
// Node Hours Rate Day Time Vol Depth
console.log(parseTableLine("N1 0.5 0.1 0 12:00 10.0 0.2", 'NodeFlood'));
console.log(parseTableLine("N1 0.5 0.1 12:00 10.0 0.2", 'NodeFlood'));

console.log("--- Subcatchment ---");
// Name Precip Runon Evap Infil RunoffDepth RunoffVol Peak Coeff
console.log(parseTableLine("S1 10.0 0 0 5.0 5.0 100.0 0.5 0.5", 'Subcatchment'));
