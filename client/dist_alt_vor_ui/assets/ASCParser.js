/**
 * ASCParser.js
 * Optimized parser for converting LISFLOOD-FP .asc output files to Float32Arrays.
 * Handles large files efficiently and calculates min/max statistics.
 */

/**
 * Parses an ASC string into a structured object with a Float32Array data buffer.
 * @param {string} ascString - The raw file content
 * @returns {object} { header, data, min, max }
 */
export function parseASCToFloat32(ascString) {
    if (!ascString) throw new Error("Empty ASC String");

    // 1. Separate Header from Body efficiently
    // We scan for the first 6 keywords or just process line by line until header ends.
    // LISFLOOD headers are usually 6 lines.

    let headerEndIndex = 0;
    const header = {};

    // Scan for header end (usually usually after NODATA_value)
    // We assume standard ESRI ASCII Grid components
    let lastNewline = 0;
    let linesRead = 0;

    while (linesRead < 6) {
        const nextNewline = ascString.indexOf('\n', lastNewline);
        if (nextNewline === -1) break;

        const line = ascString.substring(lastNewline, nextNewline).trim();
        lastNewline = nextNewline + 1;

        if (line) {
            const parts = line.split(/\s+/);
            if (parts.length >= 2) {
                header[parts[0].toLowerCase()] = parseFloat(parts[1]);
                linesRead++;
            }
        }
    }

    headerEndIndex = lastNewline;

    if (!header.ncols || !header.nrows) {
        throw new Error("Invalid ASC Header: Missing ncols/nrows");
    }

    const expectedSize = header.ncols * header.nrows;
    const data = new Float32Array(expectedSize);

    // NODATA handling
    // Standardize to -9999 if missing, though it should be there.
    const nodata = (header.nodata_value !== undefined) ? header.nodata_value : -9999;

    // 2. Parse Body with Min/Max Calc
    const bodyString = ascString.substring(headerEndIndex);

    // Optimized Regex for numbers (integers, floats, scientific notation)
    const numberPattern = /[+-]?\d+(\.\d+)?([eE][+-]?\d+)?/g;

    let match;
    let index = 0;
    let min = Infinity;
    let max = -Infinity;

    // Tight Loop
    while ((match = numberPattern.exec(bodyString)) !== null && index < expectedSize) {
        const val = parseFloat(match[0]);

        // Exact match check for NODATA usually safe for -9999, but epsilon safe for floats
        // LISFLOOD typically writes exactly the NODATA value.
        if (Math.abs(val - nodata) < 0.00001) {
            data[index] = NaN;
        } else {
            data[index] = val;
            if (val < min) min = val;
            if (val > max) max = val;
        }
        index++;
    }

    // Handle completely empty/nodata grids
    if (min === Infinity) {
        min = 0;
        max = 0;
    }

    if (index !== expectedSize) {
        // Warning but not fatal, maybe trailing newlines or partial file read
        // console.warn(`ASCParser Mismatch: Expected ${expectedSize}, got ${index}`);
    }

    return {
        header,
        data,
        min,
        max
    };
}
