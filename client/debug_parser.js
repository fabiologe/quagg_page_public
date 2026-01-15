
const fs = require('fs');

// Mock Parser logic since we can't easily import ES module with dependencies in node without setup
// I'll replicate the exact logic from SwmmOutParser.js lines 520-570 for testing.

function parseLine(line) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 5) return;

    const id = parts[0];
    const len = parts.length;

    console.log(`\nLine: ${line}`);
    console.log(`Parts:`, parts);
    console.log(`Length: ${len}`);

    // User Mapping Logic
    const maxFlow = parseFloat(parts[2]);
    const maxFullRatio = parseFloat(parts[len - 2]);
    const maxDepthRatio = parseFloat(parts[len - 1]);

    const qmax = maxFlow * 1000;
    const qvoll = maxFullRatio * 1000;
    const util = maxDepthRatio * 100;

    console.log(`ID: ${id}`);
    console.log(`Qmax (Col 2 * 1000): ${qmax} L/s`);
    console.log(`Qvoll (Col N-2 * 1000): ${qvoll} L/s (Raw: ${maxFullRatio})`);
    console.log(`Util (Col N-1 * 100): ${util}% (Raw: ${maxDepthRatio})`);
}

// User provided example from Step 1165:
// BE008                CONDUIT     0.034 (Qmax)    0  00:03      0.56 (v)   0.33  (Qmax)    1.00 (Qmax/Qvoll - Auslastung)
// Note: spacing varies.

const line1 = "BE008                CONDUIT     0.034    0  00:03      0.56   0.33    1.00";
const line2 = "   BE008      CONDUIT     0.034     0    00:03     0.56     0.33     1.00   ";

parseLine(line1);
parseLine(line2);
