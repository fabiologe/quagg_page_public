
import { SwmmInputGenerator } from '../utils/SwmmInputGenerator.js';

console.log("Starting Rain Logic Verification...");

// Mock Data
const nodes = new Map([['N1', { id: 'N1', z: 10, x: 0, y: 0 }]]);
const edges = new Map();
const areas = [{ id: 'A1', size: 1, nodeId: 'N1' }];

// Case 1: Numeric Minutes (What ModelRainModal sends)
const rainOptions1 = {
    rainSeries: [
        { time: 5, height_mm: 2.0 },
        { time: 10, height_mm: 4.0 }
    ],
    duration: 1
};

const inp1 = SwmmInputGenerator.generateInp(nodes, edges, areas, rainOptions1);

// Check Interval
// 10 - 5 = 5 mins -> 0:05
if (inp1.includes('RG1              INTENSITY 0:05')) {
    console.log("PASS: Interval calculated correctly for numeric minutes (0:05).");
} else {
    console.error("FAIL: Interval calculation failed for numeric minutes.");
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


// Case 2: String Minutes (Legacy/Other)
const rainOptions2 = {
    rainSeries: [
        { time: "05:00", height_mm: 2.0 },
        { time: "05:05", height_mm: 4.0 }
    ],
    duration: 1
};

const inp2 = SwmmInputGenerator.generateInp(nodes, edges, areas, rainOptions2);
if (inp2.includes('RG1              INTENSITY 0:05')) {
    console.log("PASS: Interval calculated correctly for HH:MM strings (0:05).");
} else {
    console.error("FAIL: Interval calculation failed for HH:MM strings.");
}

console.log("Verification Complete.");
