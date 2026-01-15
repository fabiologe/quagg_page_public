
import { SwmmInputGenerator } from '../utils/SwmmInputGenerator.js';

console.log("Starting Rain Fix Verification...");

// Mock Data
const nodes = new Map([['N1', { id: 'N1', z: 10, x: 0, y: 0 }]]);
const edges = new Map();
const areas = [{ id: 'A1', size: 1, nodeId: 'N1' }];

// Case 1: Explicit rainInterval provided (Simulation of IsybauView fix)
const rainOptions1 = {
    rainSeries: [
        { time: 0, height_mm: 2.0 }, // Only one step needed maybe? Or start/end.
        { time: 5, height_mm: 2.0 }
    ],
    duration: 1,
    rainInterval: 5 // Explicitly passed
};

const result1 = SwmmInputGenerator.generateInp(nodes, edges, areas, rainOptions1);
const inp1 = result1.inpContent || result1; // Handle both new/old just in case, but we kow it's new

// Check Interval
// 10 - 5 = 5 mins -> 0:05
if (inp1.includes('RG1              INTENSITY 0:05')) {
    console.log("PASS: Interval calculated from explicit 'rainInterval' (0:05).");
} else {
    console.error("FAIL: explicit 'rainInterval' was ignored.");
    console.log(inp1.match(/RG1.*/));
}

// Check TimeSeries
// Should have "00:05" and "00:10"
if (inp1.includes('default_rain') && inp1.includes('00:05') && inp1.includes('00:10')) {
    console.log("PASS: TimeSeries formatted correctly (00:05, 00:10).");
} else {
    console.error("FAIL: TimeSeries formatting failed.");
    console.log(inp1.split('\n').filter(l => l.includes('default_rain')));
}


// Case 2: Implicit calculation with 0 and 5 timestamp
const rainOptions2 = {
    rainSeries: [
        { time: 0, height_mm: 2.0 },
        { time: 5, height_mm: 2.0 }
    ],
    duration: 1
};

const result2 = SwmmInputGenerator.generateInp(nodes, edges, areas, rainOptions2);
const inp2 = result2.inpContent || result2;

if (inp2.includes('RG1              INTENSITY 0:05')) {
    console.log("PASS: Implicit Interval calculated correctly (0:05).");
} else {
    console.error("FAIL: Implicit Interval calculation failed.");
}

console.log("Verification Complete.");
