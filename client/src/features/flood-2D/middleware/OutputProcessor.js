/**
 * OutputProcessor.js
 * High-Performance optimized module for processing simulation results.
 * Uses Byte-Crawling to avoid String Allocations (Zero-Copy Architecture).
 */

export const OutputProcessor = {
    /**
     * Parses LISFLOOD ASC content directly from a Uint8Array Buffer.
     * Prevents Garbage Collection pauses by avoiding String creation for the data body.
     * @param {Uint8Array} rawBuffer - The raw bytes from FS.readFile()
     * @returns {object} { header, data: Float32Array, min, max, isValid, error }
     */
    parseAsync(rawBuffer) {
        if (!rawBuffer || rawBuffer.length === 0) return { isValid: false, error: "Empty Buffer" };

        // 1. Extract Header (First ~200 bytes is safe for 6 lines)
        // We scan for the 6th newline to find the header end boundary.
        let headerEndIndex = 0;
        let lineCount = 0;

        while (lineCount < 6 && headerEndIndex < rawBuffer.length) {
            if (rawBuffer[headerEndIndex] === 10) { // \n is 10
                lineCount++;
            }
            headerEndIndex++;
        }

        if (lineCount < 6) return { isValid: false, error: "Invalid Header: < 6 lines" };

        // Parse Header String
        const headerString = new TextDecoder().decode(rawBuffer.subarray(0, headerEndIndex));
        const header = this.parseHeader(headerString);

        if (!header) return { isValid: false, error: "Invalid Header Content" };

        const totalCells = header.ncols * header.nrows;
        const data = new Float32Array(totalCells);
        const nodata = (header.nodata_value !== undefined) ? header.nodata_value : -9999;

        // 2. High-Speed Body Parsing (Byte Crawler)
        // Iterate bytes, build numbers character by character.
        // ASCII codes: 0-9 (48-57), . (46), - (45), + (43), e (101), E (69)

        let valIndex = 0;
        let min = Infinity;
        let max = -Infinity;
        let hasNegativeDepth = false;

        let currentNumStr = "";
        const unstableThreshold = -0.1;

        // Start reading after the header
        for (let i = headerEndIndex; i < rawBuffer.length; i++) {
            const byte = rawBuffer[i];

            // Check if byte is part of a number
            // 0-9 OR . OR - OR + OR e OR E
            if ((byte >= 48 && byte <= 57) || byte === 46 || byte === 45 || byte === 101 || byte === 69 || byte === 43) {
                // String.fromCharCode(byte) is very fast in V8 for single bytes
                currentNumStr += String.fromCharCode(byte);
            } else {
                // Separator (Space, Tab, Newline)
                if (currentNumStr.length > 0) {
                    if (valIndex < totalCells) {
                        let val = parseFloat(currentNumStr);

                        // NoData Handling
                        if (Math.abs(val - nodata) < 0.0001) {
                            val = 0;
                        } else {
                            // Valid Data Stats and Checks
                            if (val < min) min = val;
                            if (val > max) max = val;
                            if (val < unstableThreshold) hasNegativeDepth = true;
                        }

                        data[valIndex++] = val;
                    }
                    // Reset
                    currentNumStr = "";
                }
            }
        }

        // Handle trailing number if file doesn't end with whitespace
        if (currentNumStr.length > 0 && valIndex < totalCells) {
            let val = parseFloat(currentNumStr);
            if (Math.abs(val - nodata) < 0.0001) val = 0;
            else {
                if (val < min) min = val;
                if (val > max) max = val;
                if (val < unstableThreshold) hasNegativeDepth = true;
            }
            data[valIndex++] = val;
        }

        if (min === Infinity) { min = 0; max = 0; }

        return {
            header,
            data,
            min,
            max,
            isValid: true,
            hasNegativeDepth
        };
    },

    parseHeader(headerStr) {
        const header = {};
        const lines = headerStr.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            const parts = trimmed.split(/\s+/);
            if (parts.length >= 2) {
                header[parts[0].toLowerCase()] = parseFloat(parts[1]);
            }
        }
        return (header.ncols && header.nrows) ? header : null;
    }
};
